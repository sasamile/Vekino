/**
 * Configuración del transcriptor, leída del entorno.
 *
 * Se valida entera al arrancar y no pieza por pieza cuando hace falta: si
 * falta una llave, el proceso tiene que morir antes de la asamblea y no en
 * mitad de ella, cuando ya no hay quién lo arregle.
 */

function requerido(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) {
    console.error(`Falta la variable de entorno ${nombre}.`);
    process.exit(1);
  }
  return valor;
}

function numero(nombre: string, pordefecto: number): number {
  const crudo = process.env[nombre]?.trim();
  if (!crudo) return pordefecto;
  const n = Number(crudo);
  return Number.isFinite(n) ? n : pordefecto;
}

export const config = {
  /** Base HTTP de Convex — la de `.convex.site`, no la de `.convex.cloud`. */
  convexSite: requerido("CONVEX_SITE_URL").replace(/\/+$/, ""),
  /** El mismo secreto que está puesto en Convex. */
  secreto: requerido("TRANSCRIPTOR_SECRET"),

  livekitUrl: requerido("LIVEKIT_URL"),
  livekitApiKey: requerido("LIVEKIT_API_KEY"),
  livekitApiSecret: requerido("LIVEKIT_API_SECRET"),

  deepgramApiKey: requerido("DEEPGRAM_API_KEY"),
  /**
   * Punto de entrada del motor. Se puede apuntar a otro sitio para las
   * pruebas o para pasar por un proxy propio.
   */
  deepgramUrl:
    process.env.DEEPGRAM_URL?.trim() || "wss://api.deepgram.com/v1/listen",
  /**
   * `nova-2` es el modelo con soporte de español sólido en streaming.
   * Configurable porque los nombres de modelo cambian más rápido que este
   * archivo.
   */
  deepgramModelo: process.env.DEEPGRAM_MODELO?.trim() || "nova-2",
  idioma: process.env.TRANSCRIPTOR_IDIOMA?.trim() || "es",

  /** Cada cuánto se pregunta a qué salas hay que entrar. */
  sondeoMs: numero("TRANSCRIPTOR_SONDEO_MS", 10_000),

  /**
   * Silencio tras el cual se cierra el socket del motor.
   *
   * Es el control de costo principal: se paga por audio enviado, así que un
   * micrófono abierto sin nadie hablando no debe mantener la conexión viva.
   * Se vuelve a abrir sola en cuanto llega audio.
   */
  silencioCierreMs: numero("TRANSCRIPTOR_SILENCIO_MS", 15_000),

  /**
   * Audio a 16 kHz mono: es lo que usan los motores de voz internamente y
   * mandar los 48 kHz de la sala solo gastaría ancho de banda sin mejorar
   * el reconocimiento.
   */
  muestreo: 16_000,

  /**
   * Corte de una intervención larga. Sin esto, alguien que hable veinte
   * minutos seguidos quedaría como una sola fila ilegible en el acta.
   */
  maxCaracteres: numero("TRANSCRIPTOR_MAX_CARACTERES", 600),
  maxDuracionMs: numero("TRANSCRIPTOR_MAX_DURACION_MS", 45_000),
};

export type Config = typeof config;
