/**
 * La frontera con el motor de voz.
 *
 * Todo lo específico de Deepgram vive detrás de esta interfaz. Cambiar de
 * proveedor —o meter uno propio -- debería ser escribir un archivo nuevo en
 * esta carpeta, sin tocar nada de la sala ni del ciclo de vida.
 */

/** Una frase reconocida, ya cerrada. */
export type Frase = {
  texto: string;
  /** Milisegundos desde que se abrió la sesión, no epoch. */
  desdeMs: number;
  hastaMs: number;
  /** 0–1. Ausente si el motor no la reporta. */
  confianza?: number;
};

/**
 * Una sesión de reconocimiento: un hablante, un socket.
 *
 * Se abre perezosamente al primer audio y se cierra sola tras un rato de
 * silencio; quien la usa solo empuja audio y recibe frases.
 */
export interface SesionSTT {
  /** Empuja audio PCM 16 bits, mono, al muestreo pactado. */
  empujar(pcm: Buffer): void;
  /** Cierra ordenadamente y espera las frases pendientes. */
  cerrar(): Promise<void>;
  /** Instante (epoch ms) en que se abrió: la base de los tiempos relativos. */
  readonly abiertaEn: number;
  /**
   * `false` cuando el socket se cayó o se cerró.
   *
   * Quien la usa NO debe intentar revivirla: descarta la sesión y abre otra
   * al siguiente audio. Reconectar por dentro obligaría a guardar el audio
   * mientras tanto, y aquí el audio no se guarda nunca.
   */
  readonly viva: boolean;
}

export type OpcionesMotor = {
  muestreo: number;
  idioma: string;
  /** Se llama por cada frase cerrada. */
  alReconocer: (frase: Frase) => void;
};

export interface Motor {
  readonly nombre: string;
  abrir(opciones: OpcionesMotor): SesionSTT;
}
