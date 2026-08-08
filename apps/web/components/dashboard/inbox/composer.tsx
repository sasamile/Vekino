"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { useUploadToS3 } from "@/hooks/use-upload-s3";
import { formatBytes } from "@/lib/compress-image";
import { cn } from "@/lib/utils";
import {
  AVISO_SIN_TELEFONO,
  AVISO_VENTANA_CERRADA,
  CARPETA_SALIENTES,
  INBOX_ACCEPT,
  MAX_ADJUNTO_BYTES,
  componerConCita,
  fmtDuracion,
  recortarCita,
  restanteVentana,
  type AdjuntoListo,
} from "./tipos";

/**
 * Barra flotante del composer: superficie de tarjeta y borde superior, para
 * que se despegue del fondo del hilo (que va en `bg-background` con trama).
 */
const BARRA_COMPOSER =
  "shrink-0 border-t border-border bg-card px-3 py-3 sm:px-4";

/** Los tres botones de la píldora miden lo mismo y quedan alineados. */
const BOTON_COMPOSER = "h-9 w-9 shrink-0 rounded-full";

/** Formatos de grabación que WhatsApp digiere, por orden de preferencia. */
const MIMES_AUDIO = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

function mimeGrabacion(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of MIMES_AUDIO) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

/** `audio/ogg;codecs=opus` → `.ogg` */
function extensionAudio(mime: string) {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  return "webm";
}

/**
 * Caja de escritura del inbox: texto, adjunto, nota de voz y cita.
 *
 * Hay dos motivos para no poder escribir, y se avisan en este orden:
 *   1. `puedeResponder` false: la persona escribió con su @usuario y no
 *      comparte el número, así que no hay a dónde mandar nada.
 *   2. Fuera de la ventana de 24 h: WhatsApp solo deja mandar plantillas, y
 *      una plantilla no sirve para conversar.
 */
export function Composer({
  conversacionId,
  puedeResponder,
  ventanaAbierta,
  ventanaExpiraAt,
  cita,
  onQuitarCita,
}: {
  conversacionId: Id<"waConversations">;
  /** False cuando la conversación no tiene teléfono al que escribirle. */
  puedeResponder: boolean;
  ventanaAbierta: boolean;
  ventanaExpiraAt: number | null;
  /** Texto del mensaje que se está citando, o null. */
  cita: string | null;
  onQuitarCita: () => void;
}) {
  const enviar = useAction(api.whatsappInbox.enviar);
  const subir = useUploadToS3();

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [texto, setTexto] = useState("");
  const [adjunto, setAdjunto] = useState<AdjuntoListo | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grabación de voz
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canceladaRef = useRef(false);

  // Al cambiar de conversación se limpia todo lo que estaba a medias.
  useEffect(() => {
    setTexto("");
    setAdjunto(null);
    setError(null);
  }, [conversacionId]);

  // El textarea crece con el texto, hasta un tope.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  // Al citar un mensaje el cursor salta a la caja, listo para escribir.
  useEffect(() => {
    if (cita) taRef.current?.focus();
  }, [cita]);

  // Cronómetro de la grabación.
  useEffect(() => {
    if (!grabando) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [grabando]);

  // Si el componente muere con el micrófono abierto, se suelta.
  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        canceladaRef.current = true;
        rec.stop();
      }
    };
  }, []);

  const mandar = useCallback(
    async (payload: {
      texto?: string;
      mediaUrl?: string;
      mediaMime?: string;
      mediaNombre?: string;
    }) => {
      setEnviando(true);
      setError(null);
      try {
        const res = await enviar({ conversacionId, ...payload });
        if (!res.ok) {
          setError(res.motivo ?? "No se pudo enviar el mensaje.");
          return false;
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo enviar el mensaje.");
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [conversacionId, enviar],
  );

  async function onEnviar() {
    if (!texto.trim() && !adjunto) return;
    // La cita viaja dentro del texto: ver `componerConCita` en tipos.ts.
    const cuerpo = componerConCita(cita, texto);
    const ok = await mandar({
      texto: cuerpo || undefined,
      mediaUrl: adjunto?.url,
      mediaMime: adjunto?.mime,
      mediaNombre: adjunto?.nombre,
    });
    if (ok) {
      setTexto("");
      setAdjunto(null);
      onQuitarCita();
      taRef.current?.focus();
    }
  }

  async function onElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    if (file.size > MAX_ADJUNTO_BYTES) {
      setError(`"${file.name}" pesa ${formatBytes(file.size)}; el tope son 15 MB.`);
      return;
    }

    setSubiendo(file.name);
    try {
      const { url } = await subir(file, CARPETA_SALIENTES);
      setAdjunto({
        url,
        mime: file.type || "application/octet-stream",
        nombre: file.name,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `No se pudo subir "${file.name}".`,
      );
    } finally {
      setSubiendo(null);
    }
  }

  const subirYMandarAudio = useCallback(
    async (blob: Blob, mime: string) => {
      const nombre = `nota-de-voz-${Date.now()}.${extensionAudio(mime)}`;
      setSubiendo(nombre);
      try {
        const archivo = new File([blob], nombre, { type: mime });
        const { url } = await subir(archivo, CARPETA_SALIENTES);
        await mandar({ mediaUrl: url, mediaMime: mime, mediaNombre: nombre });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo enviar la nota de voz.",
        );
      } finally {
        setSubiendo(null);
      }
    },
    [mandar, subir],
  );

  async function iniciarGrabacion() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      setError("Este navegador no permite grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferido = mimeGrabacion();
      const rec = new MediaRecorder(
        stream,
        preferido ? { mimeType: preferido } : undefined,
      );

      chunksRef.current = [];
      canceladaRef.current = false;

      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        for (const t of stream.getTracks()) t.stop();
        const partes = chunksRef.current;
        chunksRef.current = [];
        recorderRef.current = null;
        setGrabando(false);
        setSegundos(0);
        if (canceladaRef.current || partes.length === 0) return;
        // `audio/ogg;codecs=opus` → se manda el mime base, sin los codecs.
        const mime = (rec.mimeType || "audio/webm").split(";")[0] ?? "audio/webm";
        const blob = new Blob(partes, { type: mime });
        if (blob.size > MAX_ADJUNTO_BYTES) {
          setError("La nota de voz quedó muy larga (tope 15 MB).");
          return;
        }
        void subirYMandarAudio(blob, mime);
      };

      rec.start();
      recorderRef.current = rec;
      setSegundos(0);
      setGrabando(true);
    } catch {
      setError(
        "No se pudo usar el micrófono. Revisa los permisos del navegador.",
      );
    }
  }

  function detenerGrabacion(cancelar: boolean) {
    const rec = recorderRef.current;
    if (!rec) {
      setGrabando(false);
      return;
    }
    canceladaRef.current = cancelar;
    if (rec.state !== "inactive") rec.stop();
  }

  /* ---------------------------------------------------------------------- */

  // Sin teléfono no hay a dónde escribir: manda sobre el aviso de las 24 h.
  if (!puedeResponder) return <AvisoBloqueo texto={AVISO_SIN_TELEFONO} />;

  if (!ventanaAbierta) return <AvisoBloqueo texto={AVISO_VENTANA_CERRADA} />;

  const restante = restanteVentana(ventanaExpiraAt);
  const ocupado = enviando || subiendo != null;
  /** Hay algo que mandar: enciende el botón aunque el envío esté en curso. */
  const hayQueMandar = texto.trim().length > 0 || adjunto != null;
  const puedeEnviar = hayQueMandar && !ocupado;

  if (grabando) {
    return (
      <div className={BARRA_COMPOSER}>
        <div className="flex items-center gap-3 rounded-2xl border border-input bg-background px-3.5 py-2.5">
          <span
            className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500"
            aria-hidden
          />
          <p className="flex-1 text-sm text-foreground">
            Grabando…{" "}
            <span className="font-medium tabular-nums">
              {fmtDuracion(segundos)}
            </span>
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => detenerGrabacion(true)}
            className="text-red-600 dark:text-red-400"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Cancelar
          </Button>
          <Button size="sm" onClick={() => detenerGrabacion(false)}>
            <Square className="h-3.5 w-3.5" aria-hidden />
            Enviar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={BARRA_COMPOSER}>
      <input
        ref={fileRef}
        type="file"
        accept={INBOX_ACCEPT}
        className="hidden"
        onChange={(e) => void onElegirArchivo(e)}
      />

      {subiendo && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          <span className="min-w-0 truncate">Subiendo {subiendo}…</span>
        </div>
      )}

      {cita && <BarraCita texto={cita} onQuitar={onQuitarCita} />}

      {adjunto && <ChipAdjunto adjunto={adjunto} onQuitar={() => setAdjunto(null)} />}

      {/* Todo va dentro de una misma píldora: adjuntar, escribir y enviar. */}
      <div
        className={cn(
          "flex items-end gap-1 rounded-2xl border border-input bg-background p-1.5",
          "transition-colors duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25",
        )}
      >
        <Button
          size="icon"
          variant="ghost"
          aria-label="Adjuntar archivo"
          title="Adjuntar archivo (máx. 15 MB)"
          disabled={ocupado}
          onClick={() => fileRef.current?.click()}
          className={BOTON_COMPOSER}
        >
          <Paperclip className="h-4.5 w-4.5" aria-hidden />
        </Button>

        <textarea
          ref={taRef}
          rows={1}
          value={texto}
          disabled={ocupado}
          placeholder="Escribe un mensaje…"
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (puedeEnviar) void onEnviar();
            }
          }}
          className={cn(
            "max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent px-1.5 py-2 text-sm text-foreground",
            "placeholder:text-muted-foreground/70 focus:outline-none focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />

        <Button
          size="icon"
          variant="ghost"
          aria-label="Grabar nota de voz"
          title="Grabar nota de voz"
          disabled={ocupado}
          onClick={() => void iniciarGrabacion()}
          className={BOTON_COMPOSER}
        >
          <Mic className="h-4.5 w-4.5" aria-hidden />
        </Button>

        {/* Con algo que mandar se enciende en color de marca; vacío queda
            discreto en vez de un botón apagado. */}
        <Button
          size="icon"
          variant={hayQueMandar ? "primary" : "ghost"}
          aria-label="Enviar mensaje"
          disabled={!puedeEnviar}
          onClick={() => void onEnviar()}
          className={BOTON_COMPOSER}
        >
          {enviando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
        </Button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1.5">
        <p className="text-[10.5px] text-muted-foreground/80">
          Enter envía · Shift + Enter salta de línea
        </p>
        {restante && (
          <p className="text-[10.5px] text-muted-foreground/80">{restante}</p>
        )}
      </div>

      {error && (
        <p className="mt-1.5 flex items-start gap-1.5 px-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
        </p>
      )}
    </div>
  );
}

/** Franja ámbar que reemplaza la caja cuando no se puede escribir. */
function AvisoBloqueo({ texto }: { texto: string }) {
  return (
    <div className={BARRA_COMPOSER}>
      <div className="flex gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          {texto}
        </p>
      </div>
    </div>
  );
}

/**
 * Barra de la cita pendiente, encima de la caja de texto. Muestra el mismo
 * recorte que se va a mandar con el prefijo «>».
 */
function BarraCita({
  texto,
  onQuitar,
}: {
  texto: string;
  onQuitar: () => void;
}) {
  return (
    <div className="mb-2 flex items-start gap-2.5 rounded-xl border border-border bg-background px-2.5 py-2">
      <span
        className="w-1 shrink-0 self-stretch rounded-full bg-brand"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-brand">Respondiendo a</p>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">
          {recortarCita(texto)}
        </p>
      </div>
      <button
        type="button"
        onClick={onQuitar}
        aria-label="Quitar la cita"
        title="Quitar la cita"
        className="shrink-0 rounded-lg p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** Miniatura (imágenes) o chip (lo demás) del archivo listo para mandar. */
function ChipAdjunto({
  adjunto,
  onQuitar,
}: {
  adjunto: AdjuntoListo;
  onQuitar: () => void;
}) {
  const esImagen = adjunto.mime.startsWith("image/");
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {esImagen ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={adjunto.url}
            alt={adjunto.nombre}
            className="h-20 w-20 rounded-xl border border-border object-cover"
          />
          <button
            type="button"
            onClick={onQuitar}
            aria-label={`Quitar ${adjunto.nombre}`}
            className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex max-w-[18rem] items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-2">
          <FileText className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            {adjunto.nombre}
          </span>
          <button
            type="button"
            onClick={onQuitar}
            aria-label={`Quitar ${adjunto.nombre}`}
            className="shrink-0 rounded-lg p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
