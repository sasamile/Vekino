import WebSocket from "ws";
import { config } from "../config.ts";
import type { Frase, Motor, OpcionesMotor, SesionSTT } from "./tipos.ts";

/**
 * Deepgram en streaming.
 *
 * El protocolo es un WebSocket al que se le empuja PCM crudo y que devuelve
 * JSON. Por eso va contra `ws` pelado y no contra el SDK: son sesenta líneas,
 * el formato del mensaje es lo único que hay que conocer, y evita que un
 * cambio del SDK rompa el proceso que sostiene la asamblea.
 */

/** Deepgram cierra por inactividad; esto mantiene el socket vivo en las pausas. */
const LATIDO_MS = 8_000;

/**
 * Tope de acumulación por si `speech_final` nunca llega.
 *
 * Pasa cuando alguien habla sin pausas limpias o hay ruido de fondo
 * constante. Sin este corte, la frase crecería indefinidamente en memoria y
 * no se escribiría nada hasta que colgara.
 */
const TOPE_ACUMULADO = 1_500;

type ResultadoDeepgram = {
  type?: string;
  channel?: { alternatives?: { transcript?: string; confidence?: number }[] };
  start?: number;
  duration?: number;
  is_final?: boolean;
  speech_final?: boolean;
};

function url(opciones: OpcionesMotor): string {
  const p = new URLSearchParams({
    model: config.deepgramModelo,
    language: opciones.idioma,
    encoding: "linear16",
    sample_rate: String(opciones.muestreo),
    channels: "1",
    // Puntuación y mayúsculas. Sin esto el acta queda como un telegrama.
    smart_format: "true",
    // Solo interesa el texto cerrado: los parciales cambian mientras la
    // persona habla y escribirlos sería reescribir la bitácora en vivo.
    interim_results: "false",
    // Silencio (ms) que Deepgram considera fin de frase.
    endpointing: "500",
  });
  return `${config.deepgramUrl}?${p.toString()}`;
}

class SesionDeepgram implements SesionSTT {
  readonly abiertaEn = Date.now();
  viva = true;

  #ws: WebSocket;
  #listo = false;
  /** Audio que llegó antes de que el socket abriera. */
  #cola: Buffer[] = [];
  #latido: NodeJS.Timeout;

  // Frase en construcción: se junta lo `is_final` hasta el `speech_final`.
  #texto = "";
  #desdeMs: number | null = null;
  #hastaMs = 0;
  #confianzas: number[] = [];

  #opciones: OpcionesMotor;

  constructor(opciones: OpcionesMotor) {
    this.#opciones = opciones;
    this.#ws = new WebSocket(url(opciones), {
      headers: { Authorization: `Token ${config.deepgramApiKey}` },
    });

    this.#ws.on("open", () => {
      this.#listo = true;
      for (const trozo of this.#cola) this.#ws.send(trozo);
      this.#cola = [];
    });

    this.#ws.on("message", (datos) => this.#alMensaje(datos));

    this.#ws.on("error", (e) => {
      console.error("[deepgram]", e.message);
      this.#morir();
    });

    this.#ws.on("close", (codigo) => {
      // 1000 es el cierre que pedimos nosotros; el resto sí es noticia.
      if (this.viva && codigo !== 1000) {
        console.error(`[deepgram] socket cerrado (${codigo})`);
      }
      this.#morir();
    });

    this.#latido = setInterval(() => {
      if (this.#listo && this.#ws.readyState === WebSocket.OPEN) {
        this.#ws.send(JSON.stringify({ type: "KeepAlive" }));
      }
    }, LATIDO_MS);
  }

  #morir() {
    if (!this.viva) return;
    this.viva = false;
    clearInterval(this.#latido);
    // Lo que quedó a medias se entrega igual: media frase dicha es mejor
    // que ninguna, y perderla dejaría un hueco mudo en el acta.
    this.#emitir();
  }

  #alMensaje(datos: WebSocket.RawData) {
    let m: ResultadoDeepgram;
    try {
      m = JSON.parse(datos.toString());
    } catch {
      return;
    }
    if (m.type !== "Results") return;

    const alt = m.channel?.alternatives?.[0];
    const texto = (alt?.transcript ?? "").trim();
    const inicio = (m.start ?? 0) * 1000;
    const fin = inicio + (m.duration ?? 0) * 1000;

    if (texto) {
      this.#texto = this.#texto ? `${this.#texto} ${texto}` : texto;
      if (this.#desdeMs === null) this.#desdeMs = inicio;
      this.#hastaMs = Math.max(this.#hastaMs, fin);
      if (typeof alt?.confidence === "number") {
        this.#confianzas.push(alt.confidence);
      }
    }

    if (m.speech_final === true || this.#texto.length >= TOPE_ACUMULADO) {
      this.#emitir();
    }
  }

  #emitir() {
    const texto = this.#texto.trim();
    if (!texto) {
      this.#reiniciar();
      return;
    }
    const frase: Frase = {
      texto,
      desdeMs: this.#desdeMs ?? 0,
      hastaMs: this.#hastaMs,
      confianza: this.#confianzas.length
        ? this.#confianzas.reduce((a, b) => a + b, 0) / this.#confianzas.length
        : undefined,
    };
    this.#reiniciar();
    try {
      this.#opciones.alReconocer(frase);
    } catch (e) {
      console.error("[deepgram] al entregar frase:", (e as Error).message);
    }
  }

  #reiniciar() {
    this.#texto = "";
    this.#desdeMs = null;
    this.#hastaMs = 0;
    this.#confianzas = [];
  }

  empujar(pcm: Buffer) {
    if (!this.viva) return;
    if (!this.#listo) {
      // Mientras abre el socket se guarda un poco de audio, pero no más:
      // si Deepgram no responde, esto no puede crecer sin límite.
      if (this.#cola.length < 100) this.#cola.push(pcm);
      return;
    }
    if (this.#ws.readyState === WebSocket.OPEN) this.#ws.send(pcm);
  }

  async cerrar() {
    if (!this.viva) return;
    try {
      if (this.#ws.readyState === WebSocket.OPEN) {
        // Le pide a Deepgram que suelte lo que tenga antes de colgar.
        this.#ws.send(JSON.stringify({ type: "CloseStream" }));
        await new Promise<void>((listo) => {
          const t = setTimeout(listo, 2_000);
          this.#ws.once("close", () => {
            clearTimeout(t);
            listo();
          });
        });
      }
    } catch {
      // Cerrar nunca debe tumbar al que llama.
    } finally {
      this.#morir();
      try {
        this.#ws.close();
      } catch {
        /* ya estaba cerrado */
      }
    }
  }
}

export const motorDeepgram: Motor = {
  nombre: "deepgram",
  abrir: (opciones) => new SesionDeepgram(opciones),
};
