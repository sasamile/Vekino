"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@vekino/backend/dataModel";
import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  Circle,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  WifiOff,
} from "lucide-react";
import {
  useVideoSala,
  type Calidad,
  type EmisorRemoto,
} from "@/hooks/use-video-sala";
import { useAudioHablando } from "@/hooks/use-audio-hablando";
import {
  formatearElapsed,
  useGrabacionSala,
} from "@/hooks/use-grabacion-sala";
import { cn } from "@/lib/utils";

/* Paleta del círculo de avatar (el tile es siempre oscuro, como Meet). */
const COLORES_AVATAR = [
  "#1a73e8",
  "#188038",
  "#c5221f",
  "#e37400",
  "#9334e6",
  "#00786a",
];
function colorDe(nombre: string) {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) | 0;
  return COLORES_AVATAR[Math.abs(h) % COLORES_AVATAR.length]!;
}

/**
 * Tile sin cámara, estilo Meet: fondo oscuro + círculo (foto o inicial
 * con color estable por nombre). El color NO llena el tile entero.
 */
function AvatarCover({
  nombre,
  imageUrl,
  tamano = "md",
}: {
  nombre: string;
  imageUrl?: string | null;
  /** lg = pocos en sala; xs = mucha gente (como Meet). */
  tamano?: "lg" | "md" | "sm" | "xs";
}) {
  const color = colorDe(nombre);
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";
  const caja =
    tamano === "lg"
      ? "h-28 w-28 text-5xl sm:h-36 sm:w-36"
      : tamano === "md"
        ? "h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl"
        : tamano === "sm"
          ? "h-11 w-11 text-lg sm:h-14 sm:w-14 sm:text-xl"
          : "h-8 w-8 text-sm sm:h-10 sm:w-10 sm:text-base";
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#202124]">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className={cn("rounded-full object-cover shadow-lg", caja)}
        />
      ) : (
        <span
          className={cn(
            "flex items-center justify-center rounded-full font-semibold text-white",
            caja,
          )}
          style={{ backgroundColor: color }}
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
      <AvatarCover nombre={label} imageUrl={imageUrl} tamano="lg" />
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
  hablando = false,
  tamano = "md",
}: {
  nombre: string;
  imageUrl?: string | null;
  esYo?: boolean;
  esMesa?: boolean;
  silenciado?: boolean;
  /** Borde azul tipo Meet mientras hay voz. */
  hablando?: boolean;
  tamano?: "lg" | "md" | "sm" | "xs";
}) {
  const label = esYo ? (nombre ? `${nombre} (Tú)` : "Tú") : nombre;
  const denso = tamano === "sm" || tamano === "xs";
  return (
    <div
      className={cn(
        "relative h-full min-h-0 w-full overflow-hidden transition-shadow duration-150",
        denso ? "rounded-xl" : "rounded-2xl",
        hablando
          ? "shadow-[inset_0_0_0_3px_#8ab4f8]"
          : "shadow-[inset_0_0_0_0_transparent]",
      )}
    >
      <AvatarCover nombre={nombre || "?"} imageUrl={imageUrl} tamano={tamano} />
      {silenciado ? (
        <span
          className={cn(
            "absolute flex items-center justify-center rounded-full bg-black/50",
            denso ? "right-1.5 top-1.5 h-5 w-5" : "right-2.5 top-2.5 h-7 w-7",
          )}
        >
          <MicOff
            className={cn(denso ? "h-2.5 w-2.5" : "h-3.5 w-3.5", "text-white")}
            aria-hidden
          />
        </span>
      ) : null}
      <span
        className={cn(
          "absolute z-10 max-w-[calc(100%-0.75rem)] truncate rounded-md bg-black/70 font-medium leading-tight text-white/95",
          denso
            ? "bottom-1.5 left-1.5 px-1.5 py-0.5 text-[10px]"
            : "bottom-2.5 left-2.5 px-2 py-1 text-xs",
        )}
      >
        {label}
        {esMesa && !esYo ? " · mesa" : ""}
      </span>
    </div>
  );
}

/**
 * Columnas/filas tipo Meet: todo cabe en el viewport, sin scroll.
 * Con mucha gente las tiles se hacen más pequeñas.
 */
function layoutMosaico(n: number, movil: boolean) {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (movil) {
    if (n === 2) return { cols: 1, rows: 2 };
    if (n <= 4) return { cols: 2, rows: Math.ceil(n / 2) };
    if (n <= 9) return { cols: 3, rows: Math.ceil(n / 3) };
    return { cols: 3, rows: Math.ceil(n / 3) };
  }
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: Math.ceil(n / 3) };
  if (n <= 9) return { cols: 3, rows: Math.ceil(n / 3) };
  if (n <= 16) return { cols: 4, rows: Math.ceil(n / 4) };
  return { cols: 4, rows: Math.ceil(n / 4) };
}

function tamanoAvatarPorCantidad(n: number): "lg" | "md" | "sm" | "xs" {
  if (n <= 2) return "lg";
  if (n <= 6) return "md";
  if (n <= 12) return "sm";
  return "xs";
}

/** Como Meet: no se pintan 250 tiles; se pagina. */
const TOPE_MOSAICO_DESKTOP = 16;
const TOPE_MOSAICO_MOVIL = 9;

type PersonaTile = {
  nombre: string;
  imageUrl?: string | null;
  esMesa?: boolean;
  esYo?: boolean;
};

function ordenarParaMosaico(personas: PersonaTile[]) {
  return [...personas].sort((a, b) => {
    if (a.esYo !== b.esYo) return a.esYo ? -1 : 1;
    if (!!a.esMesa !== !!b.esMesa) return a.esMesa ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, undefined, { sensitivity: "base" });
  });
}

/**
 * Mosaico tipo Meet: máximo N visibles por página; el resto se pasa con flechas.
 * Una asamblea de 250 no se dibuja entera — se ve feo y no aporta.
 */
function MosaicoPersonas({
  personas,
  enCurso,
  puedoHablar,
  camaraLocal,
  camOn,
  micOn,
}: {
  personas: PersonaTile[];
  enCurso: boolean;
  puedoHablar: boolean;
  camaraLocal: { stream: MediaStream } | null;
  camOn: boolean;
  micOn: boolean;
}) {
  const hablandoYo = useAudioHablando(camaraLocal?.stream, micOn);
  const [movil, setMovil] = useState(false);
  const [pagina, setPagina] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setMovil(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const ordenadas = ordenarParaMosaico(personas);
  const tope = movil ? TOPE_MOSAICO_MOVIL : TOPE_MOSAICO_DESKTOP;
  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / tope));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);

  useEffect(() => {
    if (pagina !== paginaSegura) setPagina(paginaSegura);
  }, [pagina, paginaSegura]);

  useEffect(() => {
    setPagina(0);
  }, [tope, ordenadas.length]);

  if (personas.length === 0) {
    return (
      <EsperaMeet enCurso={enCurso} puedoHablar={puedoHablar} nombre={undefined} />
    );
  }

  const visibles = ordenadas.slice(
    paginaSegura * tope,
    paginaSegura * tope + tope,
  );
  const n = visibles.length;
  const { cols, rows } = layoutMosaico(n, movil);
  const tamano = tamanoAvatarPorCantidad(n);
  const denso = n > 6;
  const hayPaginacion = ordenadas.length > tope;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          "grid min-h-0 flex-1 overflow-hidden",
          denso ? "gap-1 sm:gap-1.5" : "gap-2 sm:gap-3",
        )}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {visibles.map((p, i) => {
          const key = `${p.nombre}-${p.esYo ? "yo" : i}`;
          if (p.esYo && camaraLocal) {
            return (
              <div
                key={key}
                className="min-h-0 overflow-hidden rounded-xl sm:rounded-2xl"
              >
                <PreviewStream
                  stream={camaraLocal.stream}
                  etiqueta={p.nombre ? `${p.nombre} (Tú)` : "Tú"}
                  principal
                  apagada={!camOn}
                  silenciado={!micOn}
                  imageUrl={p.imageUrl}
                  tamanoAvatar={tamano}
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
              /* Solo el mic local: en tiles de presencia no sabemos el estado
                 real y el MicOff arriba a la derecha chocaba con el header. */
              silenciado={!!p.esYo && !micOn && puedoHablar}
              hablando={!!p.esYo && hablandoYo}
              tamano={tamano}
            />
          );
        })}
      </div>

      {hayPaginacion ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 z-20 flex items-center justify-between px-1 sm:px-2">
          <button
            type="button"
            disabled={paginaSegura <= 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            aria-label="Página anterior"
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-30 sm:h-11 sm:w-11"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={paginaSegura >= totalPaginas - 1}
            onClick={() =>
              setPagina((p) => Math.min(totalPaginas - 1, p + 1))
            }
            aria-label="Página siguiente"
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-30 sm:h-11 sm:w-11"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      ) : null}

      {hayPaginacion ? (
        <p className="pointer-events-none absolute bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur-sm sm:bottom-2 sm:text-xs">
          {paginaSegura + 1} / {totalPaginas} · {ordenadas.length} en sala
        </p>
      ) : null}
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
  codigoInvitado,
  nombreEspera,
  personas,
  imageUrlLocal,
  calidad = "ahorro",
  onCambiarCalidad,
  puedoGrabar = false,
  grabacionActivaServidor = false,
  extraControles,
  controlesFin,
}: {
  asambleaId: Id<"asambleas">;
  enCurso: boolean;
  /** Mesa, o residente/invitado con la palabra concedida. */
  puedoHablar: boolean;
  /** Apoderado externo: firma las señales con el código de su poder. */
  codigoPoder?: string;
  /** Invitado externo (sesión del enlace): habla con palabra, sin voto. */
  codigoInvitado?: string;
  /** Nombre local para el mosaico si aún no llegó la presencia. */
  nombreEspera?: string;
  /** Personas con la pestaña abierta (presencia Meet). */
  personas?: { nombre: string; esMesa?: boolean; imageUrl?: string | null }[];
  /** Foto del usuario local (si aún no llegó en presencia). */
  imageUrlLocal?: string | null;
  /** Perfil de calidad. Por defecto "ahorro": cabe mucha más gente. */
  calidad?: Calidad;
  onCambiarCalidad?: (c: Calidad) => void;
  /** Solo la mesa: grabar audio de respaldo + bitácora. */
  puedoGrabar?: boolean;
  /** Badge del servidor: activa aunque se haya perdido el MediaRecorder local. */
  grabacionActivaServidor?: boolean;
  /** Botones extra en la barra (levantar la mano). */
  extraControles?: React.ReactNode;
  /** Cierre de la barra (abrir panel, colgar). */
  controlesFin?: React.ReactNode;
}) {
  const video = useVideoSala(asambleaId, enCurso, {
    codigoPoder,
    codigoInvitado,
    calidad,
  });
  const streamsGrabacion = [
    ...video.audios.map((a) => a.stream),
    /* Solo video remoto: el mic local se añade aparte y NUNCA se reproduce
     * por altavoz. Meter locales aquí duplicaba el mic y agravaba el eco. */
    ...video.remotos
      .map((r) => r.stream)
      .filter((s): s is MediaStream => !!s),
  ];
  const micLocalGrabacion =
    video.locales
      .find((l) => l.medio === "camara")
      ?.stream.getAudioTracks()
      .find((t) => t.readyState === "live") ?? null;
  const grabacion = useGrabacionSala(
    asambleaId,
    puedoGrabar ? streamsGrabacion : [],
    {
      activaEnServidor: grabacionActivaServidor,
      micTrack: puedoGrabar ? micLocalGrabacion : null,
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* El navegador no deja sonar audio sin un gesto del usuario. `intentoAudio`
   * sube al pulsar el botón y obliga a las pistas a reintentar. */
  const [audioRechazado, setAudioRechazado] = useState(false);
  const [intentoAudio, setIntentoAudio] = useState(0);
  const marcarAudioBloqueado = useCallback(() => setAudioRechazado(true), []);
  /* Volumen de la sala, en manos de quien escucha. Sin esto el sonido entra
   * solo y no hay forma de bajarlo desde la aplicación. */
  const [sonidoOn, setSonidoOn] = useState(true);

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

  /* Quién ya está dibujado por su video. La lista de presencia y la de
   * emisores son fuentes distintas y se solapan: sin esto, quien transmite
   * salía DOS veces —una con su foto de perfil y otra con su cámara. */
  const conVideo = new Set(video.remotos.map((r) => r.nombre.trim().toLowerCase()));

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

  /* El letrero sale solo si el navegador RECHAZÓ de verdad reproducir.
   *
   * No se usa el aviso del servidor de medios (`audioBloqueado`): ese mira
   * los elementos que gestiona LiveKit, y aquí el audio se reproduce por
   * elementos propios. Fiarse de él dejaba un "Activar sonido" permanente
   * encima de una sala que ya se estaba oyendo. */
  const hayQueActivarSonido =
    video.audios.length > 0 && audioRechazado && sonidoOn;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c0e12]">
      {/* ── Lienzo principal ───────────────────────────────────────────────
          pt: la cabecera flotante no debe tapar avatares / badges del tile.
          pb: la barra de controles es alta (admin ~12 botones) y sin este
          aire los nombres de la fila inferior quedan tapados. */}
      <div className="absolute inset-0 p-2 pb-24 pt-14 sm:p-3 sm:pb-28 sm:pt-16">
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

      {/* ── El sonido de la sala ─────────────────────────────────────────────
          Va por elementos propios, fuera del mosaico. En una asamblea casi
          nadie prende la cámara: si el audio dependiera de que hubiera un
          `<video>` que pintar, la mayoría hablaría sin que nadie la oyera. */}
      {video.audios.map((a) => (
        <PistaAudio
          key={a.id}
          stream={a.stream}
          intento={intentoAudio}
          activo={sonidoOn}
          onBloqueado={marcarAudioBloqueado}
        />
      ))}

      {/* Un ÚNICO botón para desbloquear todo el sonido, arriba y al centro.
          Antes vivía encima del video y quedaba tapado por la barra de
          controles: el usuario veía "Activar sonido" y no lo podía tocar. */}
      {hayQueActivarSonido ? (
        <button
          type="button"
          onClick={() => {
            void video.desbloquearAudio();
            setAudioRechazado(false);
            setIntentoAudio((n) => n + 1);
          }}
          className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[#0c0e12] shadow-2xl"
        >
          <Volume2 className="h-4 w-4" aria-hidden />
          Activar sonido
        </button>
      ) : null}

      {/* ── Mosaicos flotantes solo al presentar (como Meet) ─────────────── */}
      {modoPresentacion ? (
        <div className="absolute bottom-24 right-4 z-10 flex max-h-[50%] flex-col items-end gap-2 overflow-y-auto">
          {tiles
            .filter((t) => !t.esYo && !conVideo.has(t.nombre.trim().toLowerCase()))
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
          {calidad === "ahorro" ? " · ahorro" : ""}
          {video.espectadores >= video.tope ? " · lleno" : ""}
        </span>
      ) : null}

      {/* ── Barra de controles flotante, centrada ───────────────────────── */}
      {hayBarra ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-5">
          <div
            className={cn(
              "pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto overscroll-x-contain rounded-full bg-[#1c1f26]/95 px-2 py-2 shadow-[0_8px_32px_rgb(0_0_0/0.5)] backdrop-blur sm:gap-2.5 sm:px-3 sm:py-2.5",
              /* Sin scrollbar visible: se desliza si no caben en el ancho. */
              "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            )}
          >
            {puedoHablar ? (
              <>
                <BotonRedondo
                  encendido={video.micOn}
                  busy={busy}
                  onClick={() => void accion(video.toggleMic)}
                  label={video.micOn ? "Silenciar micrófono" : "Activar micrófono"}
                >
                  {video.micOn ? (
                    <Mic className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  ) : (
                    <MicOff className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  )}
                </BotonRedondo>
                <BotonRedondo
                  encendido={video.camOn}
                  busy={busy}
                  onClick={() => void accion(video.toggleCam)}
                  label={video.camOn ? "Apagar cámara" : "Encender cámara"}
                >
                  {video.camOn ? (
                    <Video className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  ) : (
                    <VideoOff className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  )}
                </BotonRedondo>
                {onCambiarCalidad ? (
                  <BotonRedondo
                    encendido={calidad === "normal"}
                    busy={busy}
                    onClick={() =>
                      onCambiarCalidad(calidad === "ahorro" ? "normal" : "ahorro")
                    }
                    label={
                      calidad === "ahorro"
                        ? `Modo ahorro: cabe más gente (tope ${video.tope}). Tocar para alta calidad`
                        : `Alta calidad: tope ${video.tope} personas. Tocar para modo ahorro`
                    }
                  >
                    <Gauge className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  </BotonRedondo>
                ) : null}
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
                  <MonitorUp className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                </BotonRedondo>
              </>
            ) : null}
            {/* Bajar el volumen de la sala. Lo ve TODO el mundo, no solo
                quien puede hablar: el que solo escucha es justamente el que
                necesita poder silenciar. */}
            <BotonRedondo
              encendido={sonidoOn}
              busy={false}
              onClick={() => {
                setSonidoOn((v) => {
                  // Reactivar cuenta como gesto del usuario: aprovecha para
                  // desbloquear el audio si el navegador lo tenía frenado.
                  if (!v) {
                    void video.desbloquearAudio();
                    setAudioRechazado(false);
                    setIntentoAudio((n) => n + 1);
                  }
                  return !v;
                });
              }}
              label={sonidoOn ? "Silenciar la sala" : "Activar el sonido de la sala"}
            >
              {sonidoOn ? (
                <Volume2 className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
              ) : (
                <VolumeX className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
              )}
            </BotonRedondo>
            {puedoGrabar && enCurso ? (
              <button
                type="button"
                onClick={() =>
                  void (
                    grabacion.grabando || grabacion.huerfana
                      ? grabacion.stop()
                      : grabacion.start()
                  )
                }
                aria-pressed={grabacion.grabando || grabacion.huerfana}
                aria-label={
                  grabacion.huerfana
                    ? "Quitar aviso de grabación (se perdió al recargar)"
                    : grabacion.grabando
                      ? `Detener grabación · ${formatearElapsed(grabacion.elapsed)}`
                      : "Grabar la reunión (video y audio)"
                }
                title={
                  grabacion.error ??
                  (grabacion.huerfana
                    ? "La grabación se cortó al recargar. Toca para quitar el aviso (el archivo ya no se puede recuperar)."
                    : grabacion.grabando
                      ? `Grabando reunión ${formatearElapsed(grabacion.elapsed)} — tocar para detener y descargar`
                      : "Grabar reunión completa (elige esta pestaña + audio)")
                }
                className={cn(
                  "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
                  grabacion.grabando || grabacion.huerfana
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-white/10 text-white/85 hover:bg-white/20",
                )}
              >
                <Circle
                  className={cn(
                    "h-4 w-4 sm:h-5 sm:w-5",
                    (grabacion.grabando || grabacion.huerfana) && "fill-current",
                  )}
                  aria-hidden
                />
                {grabacion.grabando ? (
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums text-red-300">
                    {formatearElapsed(grabacion.elapsed)}
                  </span>
                ) : grabacion.huerfana ? (
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-amber-300">
                    Parar
                  </span>
                ) : null}
              </button>
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
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-60 sm:h-12 sm:w-12",
        encendido
          ? "bg-white/15 text-white hover:bg-white/25"
          : "bg-red-500 text-white hover:bg-red-600",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Reproduce UNA voz. No pinta nada.
 *
 * Existe separado del mosaico porque el sonido de una asamblea no puede
 * depender de que alguien tenga la cámara encendida. Si el navegador rechaza
 * reproducir —Safari en iPhone lo hace siempre hasta que el usuario toca la
 * pantalla— avisa hacia arriba para que aparezca un único botón.
 *
 * Importante: no reiniciar `srcObject` si es la misma pista. El espejo de la
 * sala recrea MediaStreams en cada evento y, si aquí se volvía a asignar,
 * la voz se cortaba a pedazos (efecto “robot”).
 */
function PistaAudio({
  stream,
  intento,
  activo,
  onBloqueado,
}: {
  stream: MediaStream;
  /** Sube cada vez que el usuario pulsa "Activar sonido": fuerza reintentar. */
  intento: number;
  /** El oyente bajó el volumen de la sala. */
  activo: boolean;
  onBloqueado: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const pistaIdRef = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pista = stream.getAudioTracks()[0];
    const id = pista?.id ?? null;

    if (id && pistaIdRef.current === id) {
      /* Misma pista: solo reanudar si quedó en pausa (gesto / autoplay). */
      if (el.paused) {
        void el.play().catch(() => onBloqueado());
      }
      return;
    }

    pistaIdRef.current = id;
    el.srcObject = stream;
    void el.play().catch(() => onBloqueado());
  }, [stream, onBloqueado]);

  /* Efecto aparte: silenciar no debe reiniciar la reproducción. */
  useEffect(() => {
    const el = ref.current;
    if (el) el.muted = !activo;
  }, [activo]);

  /* Forzar reintento al pulsar "Activar sonido" aunque sea la misma pista. */
  useEffect(() => {
    if (intento === 0) return;
    const el = ref.current;
    if (!el) return;
    void el.play().catch(() => onBloqueado());
  }, [intento, onBloqueado]);

  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

/* ── Video remoto ────────────────────────────────────────────────────────
 * SIEMPRE en silencio: el sonido lo reparte `PistaAudio`. Si el elemento de
 * video también sonara, cada voz se oiría dos veces. */
function VideoRemoto({
  emisor,
  principal = false,
}: {
  emisor: EmisorRemoto;
  principal?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hablando = useAudioHablando(emisor.stream, !emisor.micApagado);

  useEffect(() => {
    const el = ref.current;
    if (!el || !emisor.stream) return;
    /* Audio SOLO por PistaAudio: aquí solo video, si no se oye doble. */
    const soloVideo = new MediaStream(emisor.stream.getVideoTracks());
    el.srcObject = soloVideo;
    el.muted = true;
    el.volume = 0;
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
    <div
      className={cn(
        "relative transition-shadow duration-150",
        principal ? "h-full w-full" : "",
        hablando
          ? "shadow-[inset_0_0_0_3px_#8ab4f8]"
          : "shadow-[inset_0_0_0_0_transparent]",
      )}
    >
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
      {/* Cámara deshabilitada: avatar encima; el video sigue en el DOM para
          que el audio del micrófono no se corte. */}
      {camaraApagada ? (
        <AvatarCover
          nombre={emisor.nombre}
          tamano={principal ? "lg" : "sm"}
        />
      ) : null}
      {emisor.micApagado ? (
        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90">
          <MicOff className="h-3.5 w-3.5 text-white" aria-hidden />
        </span>
      ) : null}
      <span className="absolute bottom-2 left-2 z-10 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium leading-tight text-white/95">
        {emisor.nombre}
        {emisor.medio === "pantalla" ? " · presentando" : ""}
      </span>
    </div>
  );
}

/** Stream propio (cámara flotante o pantalla presentándose). Siempre muda.
 *  Solo pistas de VIDEO en el `<video>`: si el mic va en el mismo MediaStream,
 *  algunos navegadores lo reproducen igual (eco de tu propia voz). */
function PreviewStream({
  stream,
  etiqueta,
  principal = false,
  apagada = false,
  silenciado = false,
  imageUrl,
  tamanoAvatar,
}: {
  stream: MediaStream;
  etiqueta: string;
  principal?: boolean;
  apagada?: boolean;
  silenciado?: boolean;
  imageUrl?: string | null;
  tamanoAvatar?: "lg" | "md" | "sm" | "xs";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hablando = useAudioHablando(stream, !silenciado);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* Nunca adjuntar pistas de audio al elemento de preview. */
    const soloVideo = new MediaStream(stream.getVideoTracks());
    el.srcObject = soloVideo;
    el.muted = true;
    el.volume = 0;
    void el.play().catch(() => {});
  }, [stream]);
  return (
    <div
      className={cn(
        "relative transition-shadow duration-150",
        principal ? "h-full w-full" : "",
        hablando
          ? "shadow-[inset_0_0_0_3px_#8ab4f8]"
          : "shadow-[inset_0_0_0_0_transparent]",
      )}
    >
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
        <AvatarCover
          nombre={etiqueta.replace(/\s*\(Tú\)\s*$/, "")}
          imageUrl={imageUrl}
          tamano={tamanoAvatar ?? (principal ? "lg" : "sm")}
        />
      ) : null}
      <span className="absolute bottom-2 left-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1 truncate rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium leading-tight text-white/95">
        {silenciado ? (
          <MicOff className="h-3 w-3 shrink-0 text-red-400" aria-hidden />
        ) : null}
        <span className="truncate">{etiqueta}</span>
      </span>
    </div>
  );
}
