"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  SmilePlus,
  Video,
  VideoOff,
  Volume2,
  WifiOff,
} from "lucide-react";
import { useVideoSala, type EmisorRemoto } from "@/hooks/use-video-sala";
import { cn } from "@/lib/utils";

const REACCION_EMOJIS = ["👍", "👏", "❤️", "😂", "😮", "🎉"] as const;

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

/** Fondo de avatar tipo Meet: color + foto circular (o inicial). */
function AvatarCover({
  nombre,
  imageUrl,
  principal = false,
}: {
  nombre: string;
  imageUrl?: string | null;
  principal?: boolean;
}) {
  const color = colorDe(nombre);
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ backgroundColor: color }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className={cn(
            "rounded-full object-cover shadow-lg ring-2 ring-white/25",
            principal ? "h-28 w-28 sm:h-36 sm:w-36" : "h-14 w-14",
          )}
        />
      ) : (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-white/25 font-semibold text-white",
            principal ? "h-28 w-28 text-5xl" : "h-14 w-14 text-2xl",
          )}
        >
          {inicial}
        </span>
      )}
    </div>
  );
}

/**
 * Estado vacío tipo Meet: tile a casi pantalla completa con inicial.
 * (Se usa cuando aún no hay nadie en presencia.)
 */
function EsperaMeet({
  enCurso,
  puedoHablar,
  nombre,
  imageUrl,
}: {
  enCurso: boolean;
  puedoHablar: boolean;
  nombre?: string;
  imageUrl?: string | null;
}) {
  const label = nombre?.trim() || (puedoHablar ? "Tú" : "Sala");
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <AvatarCover nombre={label} imageUrl={imageUrl} principal />
      <span className="absolute bottom-3 left-3 z-10 rounded-md bg-black/55 px-2.5 py-1 text-xs font-medium text-white/90">
        {label}
      </span>
      <div className="absolute inset-x-0 bottom-20 z-10 flex justify-center px-6 sm:bottom-24">
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

/** Card de participante (avatar) — misma gramática visual que Meet. */
function CardPersona({
  nombre,
  imageUrl,
  esYo,
  esMesa,
  silenciado,
}: {
  nombre: string;
  imageUrl?: string | null;
  esYo?: boolean;
  esMesa?: boolean;
  silenciado?: boolean;
}) {
  const label = esYo ? (nombre ? `${nombre} (Tú)` : "Tú") : nombre;
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden rounded-2xl">
      <AvatarCover nombre={nombre || "?"} imageUrl={imageUrl} principal />
      {silenciado ? (
        <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/50">
          <MicOff className="h-3.5 w-3.5 text-white" aria-hidden />
        </span>
      ) : null}
      <span className="absolute bottom-2.5 left-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white/90">
        {label}
        {esMesa && !esYo ? " · mesa" : ""}
      </span>
    </div>
  );
}

function claseGrilla(n: number) {
  if (n <= 1) return "grid-cols-1";
  if (n === 2) return "grid-cols-1 sm:grid-cols-2";
  if (n === 3) return "grid-cols-1 sm:grid-cols-3";
  if (n <= 4) return "grid-cols-2";
  return "grid-cols-2 lg:grid-cols-3";
}

/**
 * Mosaico de personas en la sala (como Meet sin pantalla compartida):
 * cada uno es una card; con 2 se ven lado a lado.
 */
function MosaicoPersonas({
  personas,
  enCurso,
  puedoHablar,
  camaraLocal,
  camOn,
  micOn,
}: {
  personas: {
    nombre: string;
    imageUrl?: string | null;
    esMesa?: boolean;
    esYo?: boolean;
  }[];
  enCurso: boolean;
  puedoHablar: boolean;
  camaraLocal: { stream: MediaStream } | null;
  camOn: boolean;
  micOn: boolean;
}) {
  if (personas.length === 0) {
    return (
      <EsperaMeet enCurso={enCurso} puedoHablar={puedoHablar} nombre={undefined} />
    );
  }

  return (
    <div
      className={cn(
        "grid h-full w-full gap-2 sm:gap-3",
        claseGrilla(personas.length),
      )}
    >
      {personas.map((p, i) => {
        const key = `${p.nombre}-${p.esYo ? "yo" : i}`;
        if (p.esYo && camaraLocal) {
          return (
            <div key={key} className="min-h-0 overflow-hidden rounded-2xl">
              <PreviewStream
                stream={camaraLocal.stream}
                etiqueta={p.nombre ? `${p.nombre} (Tú)` : "Tú"}
                principal
                apagada={!camOn}
                silenciado={!micOn}
                imageUrl={p.imageUrl}
              />
            </div>
          );
        }
        return (
          <CardPersona
            key={key}
            nombre={p.nombre}
            imageUrl={p.imageUrl}
            esYo={p.esYo}
            esMesa={p.esMesa}
            silenciado={p.esYo ? !micOn : true}
          />
        );
      })}
    </div>
  );
}

/**
 * El escenario con la gramática de una videollamada:
 *
 *  - Sin pantalla compartida: mosaico de cards (una por persona en la sala).
 *  - Con pantalla: el lienzo principal + mosaicos flotantes.
 *  - Barra flotante centrada abajo.
 *
 * Todo el video es P2P propio de Vekino; ver use-video-sala.ts.
 */
export function EscenarioVideo({
  asambleaId,
  enCurso,
  puedoHablar,
  codigoPoder,
  nombreEspera,
  personas,
  imageUrlLocal,
  extraControles,
  controlesFin,
}: {
  asambleaId: Id<"asambleas">;
  enCurso: boolean;
  /** Mesa, o residente con la palabra concedida. */
  puedoHablar: boolean;
  /** Apoderado externo: firma las señales con el código de su poder. */
  codigoPoder?: string;
  /** Nombre local para el mosaico si aún no llegó la presencia. */
  nombreEspera?: string;
  /** Personas con la pestaña abierta (presencia Meet). */
  personas?: { nombre: string; esMesa?: boolean; imageUrl?: string | null }[];
  /** Foto del usuario local (si aún no llegó en presencia). */
  imageUrlLocal?: string | null;
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
    if (busy) return;
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

  /* Armar la lista de cards: presencia + yo si faltara. */
  const yo = nombreEspera?.trim() || (puedoHablar ? "Tú" : "");
  const tiles: {
    nombre: string;
    imageUrl?: string | null;
    esMesa?: boolean;
    esYo?: boolean;
  }[] = [];
  const vistos = new Set<string>();
  for (const p of personas ?? []) {
    const n = p.nombre.trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);
    const esYo = !!yo && key === yo.toLowerCase();
    tiles.push({
      nombre: n,
      imageUrl: p.imageUrl ?? (esYo ? imageUrlLocal : null),
      esMesa: p.esMesa,
      esYo,
    });
  }
  if (yo && !vistos.has(yo.toLowerCase())) {
    tiles.unshift({
      nombre: yo,
      imageUrl: imageUrlLocal,
      esYo: true,
      esMesa: puedoHablar,
    });
  }
  if (tiles.length === 0 && yo) {
    tiles.push({
      nombre: yo,
      imageUrl: imageUrlLocal,
      esYo: true,
      esMesa: puedoHablar,
    });
  }

  const modoPresentacion = !!(principalRemoto || pantallaLocal);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c0e12]">
      {/* ── Lienzo principal ─────────────────────────────────────────────── */}
      <div className="absolute inset-0 p-2 pb-16 sm:p-3 sm:pb-16">
        {modoPresentacion ? (
          <div className="h-full w-full overflow-hidden rounded-2xl">
            {principalRemoto ? (
              <VideoRemoto emisor={principalRemoto} principal />
            ) : pantallaLocal ? (
              <PreviewStream
                stream={pantallaLocal.stream}
                etiqueta="Estás presentando"
                principal
              />
            ) : null}
          </div>
        ) : (
          <MosaicoPersonas
            personas={tiles}
            enCurso={enCurso}
            puedoHablar={puedoHablar}
            camaraLocal={camaraLocal}
            camOn={video.camOn}
            micOn={video.micOn}
          />
        )}
      </div>

      {/* ── Mosaicos flotantes solo al presentar (como Meet) ─────────────── */}
      {modoPresentacion ? (
        <div className="absolute bottom-24 right-4 z-10 flex max-h-[50%] flex-col items-end gap-2 overflow-y-auto">
          {tiles
            .filter((t) => !t.esYo)
            .slice(0, 8)
            .map((t, i) => (
              <div
                key={`${t.nombre}-${i}`}
                className="h-28 w-44 shrink-0 overflow-hidden rounded-2xl border border-white/15 shadow-2xl sm:h-32 sm:w-52"
              >
                <CardPersona
                  nombre={t.nombre}
                  imageUrl={t.imageUrl}
                  esMesa={t.esMesa}
                  silenciado
                />
              </div>
            ))}
          {secundarios.map((r) => (
            <div
              key={`${r.clienteId}-${r.medio}`}
              className="w-52 shrink-0 overflow-hidden rounded-2xl border border-white/15 shadow-2xl"
            >
              <VideoRemoto emisor={r} />
            </div>
          ))}
          {camaraLocal ? (
            <div className="w-52 shrink-0 overflow-hidden rounded-2xl border border-white/15 shadow-2xl">
              <PreviewStream
                stream={camaraLocal.stream}
                etiqueta="Tú"
                apagada={!video.camOn}
                silenciado={!video.micOn}
                imageUrl={imageUrlLocal}
              />
            </div>
          ) : yo ? (
            <div className="h-28 w-44 shrink-0 overflow-hidden rounded-2xl border border-white/15 shadow-2xl sm:h-32 sm:w-52">
              <CardPersona
                nombre={yo}
                imageUrl={imageUrlLocal}
                esYo
                silenciado={!video.micOn}
              />
            </div>
          ) : null}
        </div>
      ) : null}

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

      {enCurso ? (
        <CapaReacciones asambleaId={asambleaId} codigoPoder={codigoPoder} />
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
            {enCurso ? (
              <BotonReaccionar
                asambleaId={asambleaId}
                codigoPoder={codigoPoder}
              />
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

/** Selector de emojis + envío a la sala (todos los que están en la llamada). */
function BotonReaccionar({
  asambleaId,
  codigoPoder,
}: {
  asambleaId: Id<"asambleas">;
  codigoPoder?: string;
}) {
  const enviar = useMutation(api.salaVideo.enviarReaccion);
  const [abierto, setAbierto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  return (
    <div ref={wrapRef} className="relative">
      {abierto ? (
        <div
          role="menu"
          aria-label="Elegir reacción"
          className="absolute bottom-[calc(100%+10px)] left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full bg-[#2a2f38] px-2 py-1.5 shadow-xl animate-scale-in"
        >
          {REACCION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              title={emoji}
              className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-white/10"
              onClick={() => {
                setAbierto(false);
                void enviar({
                  asambleaId,
                  emoji,
                  codigoPoder,
                }).catch(() => {});
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label="Reaccionar"
        title="Reaccionar"
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
          abierto
            ? "bg-white/25 text-white"
            : "bg-white/10 text-white/85 hover:bg-white/20",
        )}
      >
        <SmilePlus className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

/** Emojis flotantes de todos en la sala. */
function CapaReacciones({
  asambleaId,
  codigoPoder,
}: {
  asambleaId: Id<"asambleas">;
  codigoPoder?: string;
}) {
  const recientes = useQuery(api.salaVideo.reaccionesRecientes, {
    asambleaId,
    codigoPoder,
  });
  const vistos = useRef(new Set<string>());
  const listo = useRef(false);
  const [flotantes, setFlotantes] = useState<
    { key: string; emoji: string; left: number }[]
  >([]);

  useEffect(() => {
    if (!recientes) return;
    /* Primera carga: marcar como vistas sin animar (no revivir el pasado). */
    if (!listo.current) {
      for (const r of recientes) vistos.current.add(r._id as string);
      listo.current = true;
      return;
    }
    for (const r of recientes) {
      const id = r._id as string;
      if (vistos.current.has(id)) continue;
      vistos.current.add(id);
      const item = {
        key: id,
        emoji: r.emoji,
        left: 18 + Math.random() * 64,
      };
      setFlotantes((prev) => [...prev, item].slice(-24));
      window.setTimeout(() => {
        setFlotantes((prev) => prev.filter((f) => f.key !== id));
      }, 4000);
    }
  }, [recientes]);

  if (flotantes.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-28 z-30 h-56 overflow-visible"
      aria-hidden
    >
      {flotantes.map((f) => (
        <span
          key={f.key}
          className="absolute bottom-0 text-3xl drop-shadow-lg animate-reaccion-float sm:text-4xl"
          style={{ left: `${f.left}%` }}
        >
          {f.emoji}
        </span>
      ))}
    </div>
  );
}

/**
 * Botón redondo de la barra, con la convención de una reunión: gris cuando
 * el medio está ENCENDIDO, rojo cuando está apagado/bloqueado — el rojo
 * grita "estás en silencio", que es lo que hay que ver de reojo.
 *
 * Sin spinner: mientras el navegador pide permiso el icono se queda visible
 * (como Meet); solo se deshabilita el clic para no disparar acciones en paralelo.
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
      {children}
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
  imageUrl,
}: {
  stream: MediaStream;
  etiqueta: string;
  principal?: boolean;
  apagada?: boolean;
  silenciado?: boolean;
  imageUrl?: string | null;
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
          apagada ? "opacity-0" : "",
        )}
      />
      {apagada ? (
        <AvatarCover nombre={etiqueta.replace(/\s*\(Tú\)\s*$/, "")} imageUrl={imageUrl} principal={principal} />
      ) : null}
      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/90">
        {silenciado ? <MicOff className="h-3 w-3 text-red-400" aria-hidden /> : null}
        {etiqueta}
      </span>
    </div>
  );
}
