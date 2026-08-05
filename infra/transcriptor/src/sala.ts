import {
  AudioStream,
  Room,
  RoomEvent,
  TrackKind,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "@livekit/rtc-node";
import { config } from "./config.ts";
import { enviarSegmento } from "./convex.ts";
import { motorDeepgram } from "./stt/deepgram.ts";
import type { Frase, SesionSTT } from "./stt/tipos.ts";
import { nombreSala, tokenEscucha } from "./token.ts";

/**
 * Una asamblea atendida.
 *
 * Entra a la sala como oyente invisible, abre una sesión de reconocimiento
 * por persona que habla y va dejando el texto en Convex. El audio pasa de la
 * pista al motor y se descarta: no se escribe a disco en ningún momento.
 */

/** Pausa tras la cual se cierra el párrafo de un hablante. */
const CORTE_PARRAFO_MS = 3_000;

/** Cada cuánto se revisan silencios y párrafos por cerrar. */
const TIC_MS = 1_000;

type Hablante = {
  identidad: string;
  sesion: SesionSTT | null;
  ultimoAudioEn: number;
  /** Párrafo en construcción: frases seguidas de la misma persona. */
  texto: string;
  desdeEn: number;
  hastaEn: number;
  confianzas: number[];
  ultimaFraseEn: number;
};

export class SalaTranscrita {
  #room = new Room();
  #hablantes = new Map<string, Hablante>();
  #bombas = new Map<string, AbortController>();
  #tic: NodeJS.Timeout | null = null;
  #cerrando = false;
  /** `false` cuando la sala se cayó: el bucle principal la vuelve a montar. */
  viva = true;

  readonly asambleaId: string;
  readonly titulo: string;

  constructor(asambleaId: string, titulo: string) {
    this.asambleaId = asambleaId;
    this.titulo = titulo;
  }

  async entrar() {
    this.#room
      .on(RoomEvent.TrackSubscribed, this.#alSuscribir)
      .on(RoomEvent.TrackUnsubscribed, this.#alDesuscribir)
      .on(RoomEvent.ParticipantDisconnected, this.#alSalirParticipante)
      .on(RoomEvent.Disconnected, () => {
        if (!this.#cerrando) {
          console.warn(`[sala ${this.titulo}] desconectada`);
          this.viva = false;
        }
      });

    await this.#room.connect(config.livekitUrl, tokenEscucha(this.asambleaId), {
      autoSubscribe: true,
      // No se recibe video: es una tonelada de ancho de banda para algo que
      // este proceso jamás va a mirar.
      dynacast: false,
    });

    this.#tic = setInterval(() => this.#revisar(), TIC_MS);
    console.log(`[sala ${this.titulo}] escuchando (${nombreSala(this.asambleaId)})`);
  }

  // ── Pistas ────────────────────────────────────────────────

  #alSuscribir = (
    track: RemoteTrack,
    _pub: RemoteTrackPublication,
    participante: RemoteParticipant,
  ) => {
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    const identidad = participante.identity;
    if (!identidad) return;

    // Una pista por persona. Si republicó, se descarta la bomba anterior.
    this.#bombas.get(identidad)?.abort();
    const corte = new AbortController();
    this.#bombas.set(identidad, corte);

    void this.#bombear(track, identidad, corte.signal);
  };

  #alDesuscribir = (
    track: RemoteTrack,
    _pub: RemoteTrackPublication,
    participante: RemoteParticipant,
  ) => {
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    void this.#soltarHablante(participante.identity);
  };

  #alSalirParticipante = (participante: RemoteParticipant) => {
    void this.#soltarHablante(participante.identity);
  };

  /**
   * Lee la pista y se la pasa al motor.
   *
   * La sesión de reconocimiento se abre con el PRIMER audio, no al
   * suscribirse: en una asamblea la mayoría tiene el micrófono cerrado casi
   * todo el tiempo y se paga por segundo enviado, así que abrir a la primera
   * sería pagar horas de silencio.
   */
  async #bombear(track: RemoteTrack, identidad: string, señal: AbortSignal) {
    const stream = new AudioStream(track, {
      sampleRate: config.muestreo,
      numChannels: 1,
    });
    const lector = stream.getReader();
    señal.addEventListener("abort", () => void lector.cancel().catch(() => {}));

    try {
      while (!señal.aborted) {
        const { done, value } = await lector.read();
        if (done || !value) break;

        const h = this.#hablante(identidad);
        h.ultimoAudioEn = Date.now();
        if (!h.sesion || !h.sesion.viva) h.sesion = this.#abrirSesion(h);

        // Copia: el marco se reutiliza y el envío por socket es asíncrono.
        h.sesion.empujar(
          Buffer.from(
            new Uint8Array(
              value.data.buffer,
              value.data.byteOffset,
              value.data.byteLength,
            ),
          ),
        );
      }
    } catch (e) {
      if (!señal.aborted) {
        console.error(`[sala ${this.titulo}] pista de ${identidad}:`, (e as Error).message);
      }
    } finally {
      lector.releaseLock();
    }
  }

  // ── Hablantes ─────────────────────────────────────────────

  #hablante(identidad: string): Hablante {
    let h = this.#hablantes.get(identidad);
    if (!h) {
      h = {
        identidad,
        sesion: null,
        ultimoAudioEn: 0,
        texto: "",
        desdeEn: 0,
        hastaEn: 0,
        confianzas: [],
        ultimaFraseEn: 0,
      };
      this.#hablantes.set(identidad, h);
    }
    return h;
  }

  #abrirSesion(h: Hablante): SesionSTT {
    return motorDeepgram.abrir({
      muestreo: config.muestreo,
      idioma: config.idioma,
      alReconocer: (frase) => this.#alReconocer(h, frase),
    });
  }

  /**
   * Junta frases seguidas de la misma persona en un párrafo.
   *
   * El motor corta por pausa de respiración, y una fila por respiración
   * dejaría el acta llena de fragmentos de tres palabras. Se cierra el
   * párrafo cuando la persona calla, cuando se hace largo o cuando lleva
   * demasiado tiempo abierto.
   */
  #alReconocer(h: Hablante, frase: Frase) {
    const base = h.sesion?.abiertaEn ?? Date.now();
    const inicio = base + frase.desdeMs;
    const fin = base + frase.hastaMs;

    if (!h.texto) {
      h.desdeEn = inicio;
      h.confianzas = [];
    }
    h.texto = h.texto ? `${h.texto} ${frase.texto}` : frase.texto;
    h.hastaEn = Math.max(h.hastaEn, fin);
    h.ultimaFraseEn = Date.now();
    if (typeof frase.confianza === "number") h.confianzas.push(frase.confianza);

    if (
      h.texto.length >= config.maxCaracteres ||
      h.hastaEn - h.desdeEn >= config.maxDuracionMs
    ) {
      this.#soltarParrafo(h);
    }
  }

  #soltarParrafo(h: Hablante) {
    const texto = h.texto.trim();
    h.texto = "";
    if (!texto) return;

    const confianza = h.confianzas.length
      ? h.confianzas.reduce((a, b) => a + b, 0) / h.confianzas.length
      : undefined;
    const inicioEn = h.desdeEn;
    const finEn = Math.max(h.hastaEn, h.desdeEn);
    h.confianzas = [];

    void enviarSegmento({
      asambleaId: this.asambleaId,
      identidad: h.identidad,
      texto,
      inicioEn,
      finEn,
      confianza,
    });
  }

  async #soltarHablante(identidad: string) {
    this.#bombas.get(identidad)?.abort();
    this.#bombas.delete(identidad);

    const h = this.#hablantes.get(identidad);
    if (!h) return;
    this.#hablantes.delete(identidad);

    const sesion = h.sesion;
    h.sesion = null;
    // Cerrar primero: el motor puede soltar una última frase al despedirse,
    // y esa frase debe entrar al párrafo antes de mandarlo.
    if (sesion) await sesion.cerrar();
    this.#soltarParrafo(h);
  }

  // ── Reloj ─────────────────────────────────────────────────

  #revisar() {
    const ahora = Date.now();
    for (const h of this.#hablantes.values()) {
      // Cerró el micrófono o se calló: se suelta el socket y se deja de pagar.
      if (h.sesion?.viva && ahora - h.ultimoAudioEn > config.silencioCierreMs) {
        const sesion = h.sesion;
        h.sesion = null;
        void sesion.cerrar().then(() => this.#soltarParrafo(h));
        continue;
      }
      if (h.texto && ahora - h.ultimaFraseEn > CORTE_PARRAFO_MS) {
        this.#soltarParrafo(h);
      }
    }
  }

  // ── Salida ────────────────────────────────────────────────

  async salir() {
    this.#cerrando = true;
    this.viva = false;
    if (this.#tic) clearInterval(this.#tic);

    for (const identidad of [...this.#hablantes.keys()]) {
      await this.#soltarHablante(identidad);
    }
    try {
      await this.#room.disconnect();
    } catch {
      /* ya estaba caída */
    }
    console.log(`[sala ${this.titulo}] fuera`);
  }
}
