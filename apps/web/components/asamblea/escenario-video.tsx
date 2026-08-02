"use client";

import { useEffect, useRef, useState } from "react";
import type { Id } from "@vekino/backend/dataModel";
import {
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  Video,
  VideoOff,
  Volume2,
  WifiOff,
} from "lucide-react";
import { useVideoSala, type EmisorRemoto } from "@/hooks/use-video-sala";
import { cn } from "@/lib/utils";

/* Paleta de avatares: color estable por nombre, como en cualquier reunión. */
const COLORES_AVATAR = [
  "#1a73e8",
  "#188038",
  "#c5221f",
  "#e37400",
  "#9334e6",
  "#0b8043",
];
function colorDe(nombre: string) {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) | 0;
  return COLORES_AVATAR[Math.abs(h) % COLORES_AVATAR.length]!;
}

/** Fondo de avatar a pantalla del mosaico: círculo con la inicial. */
function AvatarCover({
  nombre,
  principal = false,
}: {
  nombre: string;
  principal?: boolean;
}) {
  const color = colorDe(nombre);
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ backgroundColor: color }}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-white/25 font-semibold text-white",
          principal ? "h-28 w-28 text-5xl" : "h-14 w-14 text-2xl",
        )}
      >
        {nombre.trim().charAt(0).toUpperCase() || "?"}
      </span>
    </div>
  );
}

/**
 * Estado vacío tipo Meet: tile grande con inicial, no un texto suelto.
 */
function EsperaMeet({
  enCurso,
  puedoHablar,
  nombre,
}: {
  enCurso: boolean;
  puedoHablar: boolean;
  nombre?: string;
}) {
  const label = nombre?.trim() || (puedoHablar ? "Tú" : "Sala");
  return (
    <div className="relative flex h-full w-full max-h-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-2xl">
      <AvatarCover nombre={label} principal />
      <span className="absolute bottom-3 left-3 rounded-md bg-black/55 px-2.5 py-1 text-xs font-medium text-white/90">
        {label}
      </span>
      <div className="absolute inset-x-0 bottom-12 flex justify-center px-6">
        <p className="rounded-full bg-black/50 px-4 py-1.5 text-center text-xs text-white/75 backdrop-blur-sm sm:text-sm">
          {enCurso
            ? puedoHablar
              ? "Enciende el micrófono, la cámara o comparte tu pantalla"
              : "Esperando la transmisión de la mesa…"
            : "La transmisión empieza cuando se abra la sala"}
        </p>
      </div>
    </div>
  );
}

/**
 * El escenario con la gramática de una videollamada:
 *
 *  - Lienzo oscuro a sangre; el video principal centrado (pantalla remota
 *    manda; si no hay, tu propia pantalla compartida; si no, el mensaje).
 *  - Tu cámara SIEMPRE como mosaico flotante abajo a la derecha, nunca como
 *    protagonista — como en cualquier reunión.
 *  - Barra flotante centrada abajo con botones redondos: micrófono, cámara,
 *    compartir pantalla; `extraControles` (la mano) y `controlesFin`
 *    (panel/colgar) los inyecta la sala.
 *
 * Todo el video es P2P propio de Vekino; ver use-video-sala.ts.
 */
export function EscenarioVideo({
  asambleaId,
  enCurso,
  puedoHablar,
  codigoPoder,
  nombreEspera,
  extraControles,
  controlesFin,
}: {
  asambleaId: Id<"asambleas">;
  enCurso: boolean;
  /** Mesa, o residente con la palabra concedida. */
  puedoHablar: boolean;
  /** Apoderado externo: firma las señales con el código de su poder. */
  codigoPoder?: string;
  /** Nombre para el avatar de espera (estilo Meet) cuando no hay transmisión. */
  nombreEspera?: string;
  /** Botones extra en la barra (levantar la mano). */
  extraControles?: React.ReactNode;
  /** Cierre de la barra (abrir panel, colgar). */
  controlesFin?: React.ReactNode;
}) {
  const video = useVideoSala(asambleaId, enCurso, { codigoPoder });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Si la mesa retira la palabra en pleno aire, el micrófono se corta AQUÍ,
   * no solo en el servidor: el stream local sigue vivo hasta que se cuelga. */
  const colgarRef = useRef(video.colgar);
  colgarRef.current = video.colgar;
  useEffect(() => {
    if (!puedoHablar && video.transmitiendo) void colgarRef.current();
  }, [puedoHablar, video.transmitiendo]);

  async function accion(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "El navegador bloqueó el acceso. Revisa los permisos de cámara y micrófono."
          : e instanceof Error
            ? e.message
            : "No se pudo iniciar la transmisión.",
      );
    } finally {
      setBusy(false);
    }
  }

  const compartiendo = video.locales.some((l) => l.medio === "pantalla");
  const camaraLocal = video.locales.find((l) => l.medio === "camara") ?? null;
  const pantallaLocal = video.locales.find((l) => l.medio === "pantalla") ?? null;

  const principalRemoto =
    video.remotos.find((r) => r.medio === "pantalla") ??
    video.remotos.find((r) => r.medio === "camara") ??
    null;
  const secundarios = video.remotos.filter((r) => r !== principalRemoto);

  const hayBarra =
    enCurso && (puedoHablar || extraControles != null || controlesFin != null);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c0e12]">
      {/* ── Lienzo principal ────────────────────────────────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
        {principalRemoto ? (
          <div className="h-full w-full overflow-hidden rounded-2xl">
            <VideoRemoto emisor={principalRemoto} principal />
          </div>
        ) : pantallaLocal ? (
          <div className="h-full w-full overflow-hidden rounded-2xl">
            <PreviewStream
              stream={pantallaLocal.stream}
              etiqueta="Estás presentando"
              principal
            />
          </div>
        ) : (
          <EsperaMeet
            enCurso={enCurso}
            puedoHablar={puedoHablar}
            nombre={nombreEspera}
          />
        )}
      </div>

      {/* ── Mosaicos flotantes (abajo a la derecha, como una reunión) ───── */}
      <div className="absolute bottom-24 right-4 z-10 flex flex-col items-end gap-2">
        {secundarios.map((r) => (
          <div
            key={`${r.clienteId}-${r.medio}`}
            className="w-52 overflow-hidden rounded-2xl border border-white/15 shadow-2xl"
          >
            <VideoRemoto emisor={r} />
          </div>
        ))}
        {camaraLocal ? (
          <div className="w-52 overflow-hidden rounded-2xl border border-white/15 shadow-2xl">
            <PreviewStream
              stream={camaraLocal.stream}
              etiqueta="Tú"
              apagada={!video.camOn}
              silenciado={!video.micOn}
            />
          </div>
        ) : null}
      </div>

      {/* ── Contador de conexiones del emisor ───────────────────────────── */}
      {puedoHablar && video.transmitiendo ? (
        <span
          className={cn(
            "absolute right-4 top-16 z-10 rounded-full px-2.5 py-1 text-[11px] font-medium",
            video.espectadores >= video.tope
              ? "bg-amber-500/20 text-amber-200"
              : "bg-black/50 text-white/60",
          )}
        >
          {video.espectadores} / {video.tope}
          {video.espectadores >= video.tope ? " · tope P2P" : ""}
        </span>
      ) : null}

      {/* ── Barra de controles flotante, centrada ───────────────────────── */}
      {hayBarra ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-5">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-[#1c1f26]/95 px-3 py-2.5 shadow-[0_8px_32px_rgb(0_0_0/0.5)] backdrop-blur">
            {puedoHablar ? (
              <>
                <BotonRedondo
                  encendido={video.micOn}
                  busy={busy}
                  onClick={() => void accion(video.toggleMic)}
                  label={video.micOn ? "Silenciar micrófono" : "Activar micrófono"}
                >
                  {video.micOn ? (
                    <Mic className="h-5 w-5" aria-hidden />
                  ) : (
                    <MicOff className="h-5 w-5" aria-hidden />
                  )}
                </BotonRedondo>
                <BotonRedondo
                  encendido={video.camOn}
                  busy={busy}
                  onClick={() => void accion(video.toggleCam)}
                  label={video.camOn ? "Apagar cámara" : "Encender cámara"}
                >
                  {video.camOn ? (
                    <Video className="h-5 w-5" aria-hidden />
                  ) : (
                    <VideoOff className="h-5 w-5" aria-hidden />
                  )}
                </BotonRedondo>
                <BotonRedondo
                  encendido={compartiendo}
                  busy={busy}
                  onClick={() =>
                    void accion(() =>
                      compartiendo
                        ? video.apagar("pantalla")
                        : video.encender("pantalla"),
                    )
                  }
                  label={compartiendo ? "Dejar de compartir" : "Compartir pantalla"}
                >
                  <MonitorUp className="h-5 w-5" aria-hidden />
                </BotonRedondo>
              </>
            ) : null}
            {extraControles}
            {controlesFin}
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="absolute bottom-24 left-4 z-10 max-w-sm rounded-xl bg-red-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-red-200"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Botón redondo de la barra, con la convención de una reunión: gris cuando
 * el medio está ENCENDIDO, rojo cuando está apagado/bloqueado — el rojo
 * grita "estás en silencio", que es lo que hay que ver de reojo.
 */
function BotonRedondo({
  encendido,
  busy,
  onClick,
  label,
  children,
}: {
  encendido: boolean;
  busy: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      aria-pressed={encendido}
      title={label}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full transition-colors disabled:opacity-60",
        encendido
          ? "bg-white/15 text-white hover:bg-white/25"
          : "bg-red-500 text-white hover:bg-red-600",
      )}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : children}
    </button>
  );
}

/* ── Video remoto con desbloqueo de audio ────────────────────────────────
 * Los navegadores bloquean el autoplay CON sonido sin un gesto del usuario.
 * Se arranca en silencio y, si hace falta, "Activar sonido" sobre el video. */
function VideoRemoto({
  emisor,
  principal = false,
}: {
  emisor: EmisorRemoto;
  principal?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [silenciado, setSilenciado] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || !emisor.stream) return;
    el.srcObject = emisor.stream;
    el.muted = true;
    void el.play().catch(() => {});
  }, [emisor.stream]);

  if (emisor.estado === "lleno" || emisor.estado === "fallo") {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-black/60 p-6 text-center",
          principal ? "h-full w-full" : "aspect-video w-full",
        )}
      >
        <p className="max-w-sm text-sm text-amber-200/80">
          <WifiOff className="mx-auto mb-2 h-5 w-5" aria-hidden />
          {emisor.estado === "lleno"
            ? "La transmisión alcanzó su tope de conexiones directas."
            : "No se pudo conectar con la transmisión. Revisa tu red e intenta recargar."}
        </p>
      </div>
    );
  }

  if (!emisor.stream) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-black/40",
          principal ? "h-full w-full" : "aspect-video w-full",
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-white/50" aria-hidden />
      </div>
    );
  }

  const camaraApagada = emisor.medio === "camara" && emisor.camApagada;

  return (
    <div className={cn("relative", principal ? "h-full w-full" : "")}>
      <video
        ref={ref}
        autoPlay
        playsInline
        className={cn(
          "bg-black",
          principal ? "h-full w-full object-contain" : "aspect-video w-full object-cover",
        )}
      />
      {/* Cámara deshabilitada: avatar encima; el video sigue en el DOM para
          que el audio del micrófono no se corte. */}
      {camaraApagada ? (
        <AvatarCover nombre={emisor.nombre} principal={principal} />
      ) : null}
      {emisor.micApagado ? (
        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90">
          <MicOff className="h-3.5 w-3.5 text-white" aria-hidden />
        </span>
      ) : null}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/90">
        {emisor.nombre}
        {emisor.medio === "pantalla" ? " · presentando" : ""}
      </span>
      {silenciado ? (
        <button
          type="button"
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            el.muted = false;
            setSilenciado(false);
            void el.play().catch(() => {});
          }}
          className={cn(
            "absolute flex items-center gap-1.5 rounded-full bg-black/70 font-semibold text-white hover:bg-black/85",
            principal
              ? "bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 text-xs"
              : "left-2 top-2 p-1.5 text-[10px]",
          )}
          aria-label="Activar sonido"
        >
          <Volume2 className={principal ? "h-3.5 w-3.5" : "h-3 w-3"} aria-hidden />
          {principal ? "Activar sonido" : null}
        </button>
      ) : null}
    </div>
  );
}

/** Stream propio (cámara flotante o pantalla presentándose). Siempre muda. */
function PreviewStream({
  stream,
  etiqueta,
  principal = false,
  apagada = false,
  silenciado = false,
}: {
  stream: MediaStream;
  etiqueta: string;
  principal?: boolean;
  apagada?: boolean;
  silenciado?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => {});
  }, [stream]);
  return (
    <div className={cn("relative", principal ? "h-full w-full" : "")}>
      {/* El emisor SIEMPRE se ve en silencio: oír tu propio micrófono acopla. */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className={cn(
          "bg-black",
          principal ? "h-full w-full object-contain" : "aspect-video w-full object-cover",
        )}
      />
      {apagada ? (
        <AvatarCover nombre={etiqueta} />
      ) : null}
      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/90">
        {silenciado ? <MicOff className="h-3 w-3 text-red-400" aria-hidden /> : null}
        {etiqueta}
      </span>
    </div>
  );
}
