"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState,
  LocalTrackPublication,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
  type RemoteTrackPublication,
} from "livekit-client";
import type { AudioRemoto, Calidad, EmisorRemoto, Medio } from "./sala-tipos";

/**
 * La misma sala, repartida por el servidor de medios en vez de par a par.
 *
 * La diferencia con el P2P no es de calidad sino de aritmética: quien habla
 * sube UNA copia y el servidor la reparte. En malla, 250 espectadores le
 * exigían 250 copias al emisor —imposible desde una casa—; aquí sube una y
 * el servidor entrega las 250. Por eso este camino es el que aguanta una
 * asamblea de verdad y el P2P queda como respaldo cuando no hay servidor.
 *
 * La API pública es idéntica a `useVideoSala` a propósito: `EscenarioVideo`
 * no sabe —ni necesita saber— cuál de los dos lo está alimentando.
 */

/** Techo del servidor (`max_participants` en livekit.yaml). */
const TOPE_SALA = 300;

/**
 * Perfiles de calidad.
 *
 * La pantalla NO baja de 15 fps ni en modo ahorro. Con 5 fps —que es lo que
 * tenía— el puntero del mouse da saltos y todo el mundo cree que la reunión
 * está trabada; se ahorra ancho de banda a costa de que parezca rota. Lo que
 * sí se sacrifica en ahorro es la resolución y el bitrate, que es donde el
 * ahorro no se siente.
 */
const PERFILES = {
  normal: {
    camara: { width: 640, height: 360, fps: 24, bitrate: 600_000 },
    pantalla: { width: 1920, height: 1080, fps: 24, bitrate: 3_000_000 },
  },
  ahorro: {
    camara: { width: 320, height: 180, fps: 15, bitrate: 150_000 },
    pantalla: { width: 1600, height: 900, fps: 15, bitrate: 1_500_000 },
  },
} as const;

export type ConexionSala = {
  url: string;
  token: string;
  sala: string;
  puedePublicar: boolean;
};

/** Las dos publicaciones que componen un "medio" del mosaico. */
type ParMedio = {
  video?: RemoteTrackPublication;
  audio?: RemoteTrackPublication;
};

/**
 * Agrupa las pistas de un participante en los dos medios que la sala
 * entiende. LiveKit publica cada pista por separado; el mosaico piensa en
 * "la cámara de Ana" y "la pantalla de Ana", no en cuatro pistas sueltas.
 */
function agruparPorMedio(p: RemoteParticipant): Map<Medio, ParMedio> {
  const medios = new Map<Medio, ParMedio>();
  for (const pub of p.trackPublications.values()) {
    const medio: Medio | null =
      pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone
        ? "camara"
        : pub.source === Track.Source.ScreenShare ||
            pub.source === Track.Source.ScreenShareAudio
          ? "pantalla"
          : null;
    if (!medio) continue;
    const entrada = medios.get(medio) ?? {};
    if (pub.kind === Track.Kind.Video) entrada.video = pub;
    else entrada.audio = pub;
    medios.set(medio, entrada);
  }
  return medios;
}

function nombreDe(p: Participant) {
  return p.name?.trim() || p.identity || "Participante";
}

export function useSalaLiveKit(
  conexion: ConexionSala | null,
  activo: boolean,
  opts: { calidad?: Calidad } = {},
) {
  const calidad: Calidad = opts.calidad ?? "normal";
  const perfil = PERFILES[calidad];

  const room = useMemo(() => (activo && conexion ? new Room() : null), [activo, conexion]);

  const [remotos, setRemotos] = useState<EmisorRemoto[]>([]);
  const [audios, setAudios] = useState<AudioRemoto[]>([]);
  const [audioBloqueado, setAudioBloqueado] = useState(false);
  const [locales, setLocales] = useState<{ medio: Medio; stream: MediaStream }[]>([]);
  const [espectadores, setEspectadores] = useState(0);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [pantallaOn, setPantallaOn] = useState(false);

  /* ── Espejo del estado de la sala hacia React ────────────────────────── */
  const sincronizar = useCallback((sala: Room) => {
    const lista: EmisorRemoto[] = [];
    const sonidos: AudioRemoto[] = [];

    for (const p of sala.remoteParticipants.values()) {
      for (const [medio, par] of agruparPorMedio(p)) {
        const pistaVideo = par.video?.track?.mediaStreamTrack;
        const pistaAudio = par.audio?.track?.mediaStreamTrack;

        /* El audio se reparte SIEMPRE por su propio elemento, tenga o no
         * video al lado: la mayoría de una asamblea habla con la cámara
         * apagada y si el sonido dependiera del mosaico, no se oirían. */
        if (pistaAudio && !par.audio?.isMuted) {
          const solo = new MediaStream();
          solo.addTrack(pistaAudio);
          sonidos.push({ id: `${p.identity}|${medio}`, stream: solo });
        }

        /* Un mosaico existe solo si hay una PUBLICACIÓN de video. Sin esto,
         * quien enciende únicamente el micrófono aparecía como si estuviera
         * transmitiendo y su avatar se tomaba el escenario entero. */
        if (!par.video) continue;

        const stream = new MediaStream();
        if (pistaVideo) stream.addTrack(pistaVideo);
        // El audio también va aquí, pero solo para detectar quién habla y
        // pintarle el borde: el `<video>` se renderiza siempre en silencio.
        if (pistaAudio) stream.addTrack(pistaAudio);

        lista.push({
          clienteId: `${p.identity}|${medio}`,
          nombre: nombreDe(p),
          medio,
          camApagada: par.video.isMuted || !pistaVideo,
          micApagado: !par.audio || par.audio.isMuted,
          stream: pistaVideo ? stream : null,
          estado: pistaVideo ? "activo" : "conectando",
        });
      }
    }

    setRemotos(lista);
    setAudios(sonidos);
    setAudioBloqueado(!sala.canPlaybackAudio);
    setEspectadores(sala.remoteParticipants.size);

    /* Vista previa local: lo que YO estoy publicando.
     *
     * El micrófono va DENTRO del stream de "camara" aunque LiveKit los
     * publique por separado: de ahí lee el escenario para encender el anillo
     * de "estás hablando". Por eso la entrada se emite también cuando solo
     * hay micrófono — el propio escenario pinta el avatar mientras
     * `camOn` sea falso, así que un stream sin video no deja un cuadro negro. */
    const propios: { medio: Medio; stream: MediaStream }[] = [];
    const camara = new MediaStream();
    let hayCamara = false;
    for (const pub of sala.localParticipant.trackPublications.values() as Iterable<LocalTrackPublication>) {
      const pista = pub.track?.mediaStreamTrack;
      if (!pista) continue;
      if (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone) {
        camara.addTrack(pista);
        hayCamara = true;
      } else if (pub.source === Track.Source.ScreenShare) {
        const pantalla = new MediaStream();
        pantalla.addTrack(pista);
        propios.push({ medio: "pantalla", stream: pantalla });
      }
    }
    if (hayCamara) propios.unshift({ medio: "camara", stream: camara });
    setLocales(propios);

    setMicOn(sala.localParticipant.isMicrophoneEnabled);
    setCamOn(sala.localParticipant.isCameraEnabled);
    setPantallaOn(sala.localParticipant.isScreenShareEnabled);
  }, []);

  /* ── Conectar / desconectar ──────────────────────────────────────────── */
  useEffect(() => {
    if (!room || !conexion) return;

    const refrescar = () => sincronizar(room);

    /* Suscribirse al audio requiere un gesto del usuario en algunos
     * navegadores; el botón de "activar sonido" del escenario llama a
     * `startAudio`, aquí solo se intenta por si el permiso ya está dado. */
    const alConectar = () => {
      void room.startAudio().catch(() => {});
      refrescar();
    };

    room
      .on(RoomEvent.Connected, alConectar)
      .on(RoomEvent.ParticipantConnected, refrescar)
      .on(RoomEvent.ParticipantDisconnected, refrescar)
      .on(RoomEvent.TrackSubscribed, refrescar)
      .on(RoomEvent.TrackUnsubscribed, refrescar)
      .on(RoomEvent.TrackPublished, refrescar)
      .on(RoomEvent.TrackUnpublished, refrescar)
      .on(RoomEvent.TrackMuted, refrescar)
      .on(RoomEvent.TrackUnmuted, refrescar)
      .on(RoomEvent.LocalTrackPublished, refrescar)
      .on(RoomEvent.LocalTrackUnpublished, refrescar)
      .on(RoomEvent.ConnectionStateChanged, refrescar)
      .on(RoomEvent.AudioPlaybackStatusChanged, refrescar)
      /* Si la mesa concede o retira la palabra en pleno aire, el servidor
       * avisa por aquí y la barra de controles cambia sola. */
      .on(RoomEvent.ParticipantPermissionsChanged, refrescar);

    void room
      .connect(conexion.url, conexion.token, { autoSubscribe: true })
      .catch(() => {
        /* Sin conexión el escenario queda vacío: es visible en pantalla y
         * no hay nada útil que hacer con el error aquí. */
      });

    return () => {
      room.removeAllListeners();
      void room.disconnect();
    };
  }, [room, conexion, sincronizar]);

  /* ── Calidad de publicación ──────────────────────────────────────────── */
  const publicarOpts = useCallback(
    (medio: Medio) =>
      medio === "camara"
        ? {
            videoEncoding: {
              maxBitrate: perfil.camara.bitrate,
              maxFramerate: perfil.camara.fps,
            },
            /* Simulcast: el servidor le manda a cada quien la capa que su
             * red aguanta, en vez de tumbar a todos al ritmo del más lento. */
            simulcast: true,
          }
        : {
            videoEncoding: {
              maxBitrate: perfil.pantalla.bitrate,
              maxFramerate: perfil.pantalla.fps,
            },
            /* Una asamblea comparte documentos: prioriza que la letra se
             * lea antes que la fluidez del movimiento. */
            screenShareEncoding: {
              maxBitrate: perfil.pantalla.bitrate,
              maxFramerate: perfil.pantalla.fps,
            },
            simulcast: false,
          },
    [perfil],
  );

  const encender = useCallback(
    async (medio: Medio) => {
      if (!room) return;
      if (medio === "pantalla") {
        await room.localParticipant.setScreenShareEnabled(true, undefined, publicarOpts("pantalla"));
      } else {
        await room.localParticipant.setCameraEnabled(true, undefined, publicarOpts("camara"));
      }
      sincronizar(room);
    },
    [room, publicarOpts, sincronizar],
  );

  const apagar = useCallback(
    async (medio: Medio) => {
      if (!room) return;
      if (medio === "pantalla") {
        await room.localParticipant.setScreenShareEnabled(false);
      } else {
        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(false);
      }
      sincronizar(room);
    },
    [room, sincronizar],
  );

  /**
   * Mic y cámara son publicaciones independientes: apagar la cámara la
   * DESPUBLICA de verdad (la luz del portátil se apaga y deja de gastar
   * subida), a diferencia del P2P donde solo se deshabilitaba la pista.
   */
  const toggleMic = useCallback(async () => {
    if (!room) return;
    const siguiente = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(siguiente);
    sincronizar(room);
  }, [room, sincronizar]);

  const toggleCam = useCallback(async () => {
    if (!room) return;
    const siguiente = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(
      siguiente,
      undefined,
      siguiente ? publicarOpts("camara") : undefined,
    );
    sincronizar(room);
  }, [room, publicarOpts, sincronizar]);

  const colgar = useCallback(async () => {
    if (!room) return;
    await room.localParticipant.setCameraEnabled(false);
    await room.localParticipant.setMicrophoneEnabled(false);
    await room.localParticipant.setScreenShareEnabled(false);
    sincronizar(room);
  }, [room, sincronizar]);

  /* Reaplica el perfil a lo que ya está al aire cuando cambia la calidad. */
  const calidadPrevia = useRef(calidad);
  useEffect(() => {
    if (!room || calidadPrevia.current === calidad) return;
    calidadPrevia.current = calidad;
    if (!room.localParticipant.isCameraEnabled) return;
    void (async () => {
      await room.localParticipant.setCameraEnabled(false);
      await room.localParticipant.setCameraEnabled(true, undefined, publicarOpts("camara"));
      sincronizar(room);
    })();
  }, [calidad, room, publicarOpts, sincronizar]);

  /**
   * Desbloquea el sonido. Safari —y iOS sobre todo— no deja sonar nada que
   * no venga de un toque del usuario, así que esto tiene que colgar de un
   * botón real; llamarlo al conectar no sirve de nada.
   */
  const desbloquearAudio = useCallback(async () => {
    if (!room) return;
    await room.startAudio().catch(() => {});
    setAudioBloqueado(!room.canPlaybackAudio);
  }, [room]);

  return {
    locales,
    remotos,
    audios,
    audioBloqueado,
    desbloquearAudio,
    espectadores,
    tope: TOPE_SALA,
    calidad,
    encender,
    apagar,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    colgar,
    transmitiendo: micOn || camOn || pantallaOn,
    /** Marca para la interfaz: hay servidor de medios detrás. */
    conectado: room?.state === ConnectionState.Connected,
  };
}
