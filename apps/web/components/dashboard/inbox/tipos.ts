import type { FunctionReturnType } from "convex/server";
import type { api } from "@vekino/backend/api";

/* -------------------------------------------------------------------------- */
/* Tipos derivados del backend (siempre en sync con api.whatsappInbox.*)       */
/* -------------------------------------------------------------------------- */

export type ConversacionRow = FunctionReturnType<
  typeof api.whatsappInbox.conversaciones
>[number];

export type HiloData = NonNullable<
  FunctionReturnType<typeof api.whatsappInbox.hilo>
>;

export type ConversacionDetalle = HiloData["conversacion"];
export type MensajeRow = HiloData["mensajes"][number];

/** Pestañas del listado. */
export type FiltroInbox = "todos" | "no_leidos" | "escaladas";

export const FILTROS_INBOX: { value: FiltroInbox; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "no_leidos", label: "No leídos" },
  { value: "escaladas", label: "Escaladas" },
];

/* -------------------------------------------------------------------------- */
/* Adjuntos del composer                                                       */
/* -------------------------------------------------------------------------- */

/** Carpeta en S3 de todo lo que sale desde el panel. */
export const CARPETA_SALIENTES = "whatsapp/salientes";

/** Tope por archivo: el mismo que aguanta la subida por Convex. */
export const MAX_ADJUNTO_BYTES = 15 * 1024 * 1024;

export const INBOX_ACCEPT = "image/*,audio/*,video/*,application/pdf";

/** Archivo ya subido, listo para mandarse con `api.whatsappInbox.enviar`. */
export type AdjuntoListo = {
  url: string;
  mime: string;
  nombre: string;
};

/* -------------------------------------------------------------------------- */
/* Teléfono                                                                    */
/* -------------------------------------------------------------------------- */

/** Indicativos de un dígito (NANP, Rusia/Kazajistán). */
const INDICATIVO_1 = new Set(["1", "7"]);

/** Indicativos de dos dígitos: cubre Latinoamérica y casi toda Europa. */
const INDICATIVO_2 = new Set([
  "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43",
  "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56",
  "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84",
  "86", "90", "91", "92", "93", "94", "95", "98",
]);

function largoIndicativo(digitos: string) {
  if (INDICATIVO_1.has(digitos.slice(0, 1))) return 1;
  if (INDICATIVO_2.has(digitos.slice(0, 2))) return 2;
  return 3;
}

/**
 * `+573181833248` → `+57 318 183 3248`.
 *
 * Separa el indicativo del número nacional y agrupa el resto de a 3 dígitos.
 * Si el último grupo se quedara con un solo dígito se pega al anterior, para
 * que el móvil colombiano de 10 cifras se lea `318 183 3248` y no
 * `318 183 324 8`. Si el valor no parece un número internacional se devuelve
 * tal cual llegó.
 */
export function fmtTelefono(
  telefono: string | null | undefined,
): string | null {
  const crudo = telefono?.trim();
  if (!crudo) return null;

  const digitos = crudo.replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 15) return crudo;

  const indicativo = digitos.slice(0, largoIndicativo(digitos));
  const nacional = digitos.slice(indicativo.length);

  const grupos: string[] = [];
  for (let i = 0; i < nacional.length; i += 3) {
    grupos.push(nacional.slice(i, i + 3));
  }

  const ultimo = grupos[grupos.length - 1];
  if (grupos.length > 1 && ultimo?.length === 1) {
    grupos.pop();
    const previo = grupos[grupos.length - 1];
    if (previo) grupos[grupos.length - 1] = previo + ultimo;
  }

  return `+${indicativo} ${grupos.join(" ")}`;
}

/* -------------------------------------------------------------------------- */
/* Citas (responder a un mensaje)                                              */
/* -------------------------------------------------------------------------- */

/** Tope del texto citado, para que la cita no se coma el mensaje. */
export const MAX_CITA_CHARS = 120;

/** Deja la cita en una sola línea y recortada, con «…» si sobró texto. */
export function recortarCita(texto: string) {
  const limpio = texto.trim().replace(/\s+/g, " ");
  return limpio.length > MAX_CITA_CHARS
    ? `${limpio.slice(0, MAX_CITA_CHARS - 1).trimEnd()}…`
    : limpio;
}

/**
 * Antepone la cita al mensaje.
 *
 * OJO: no existe API de reply nativo. WhatsApp Cloud API deja citar un mensaje
 * con `context.message_id`, pero YCloud no lo expone en el envío que usamos en
 * `whatsappInbox.enviar`, así que la cita se imita con el formato manual que
 * la gente ya usa en WhatsApp: una línea que empieza por «>», una línea en
 * blanco y luego el mensaje. Por eso la cita se aplana a una sola línea: el
 * «>» solo marca la primera.
 */
export function componerConCita(cita: string | null, mensaje: string) {
  const limpio = mensaje.trim();
  if (!cita) return limpio;
  const citado = `> ${recortarCita(cita)}`;
  return limpio ? `${citado}\n\n${limpio}` : citado;
}

/* -------------------------------------------------------------------------- */
/* Estados de entrega                                                          */
/* -------------------------------------------------------------------------- */

const ESTADO_ENTREGA: Record<string, string> = {
  pending: "Enviando…",
  accepted: "Enviando…",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "Falló",
  undelivered: "No entregado",
};

export function estadoLegible(estado: string | null): string | null {
  if (!estado) return null;
  return ESTADO_ENTREGA[estado] ?? estado;
}

/* -------------------------------------------------------------------------- */
/* Fechas (es-CO)                                                              */
/* -------------------------------------------------------------------------- */

function mismoDia(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** «3:45 p. m.» */
export function fmtHora(ts: number) {
  return new Date(ts).toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Hora de la lista: hoy muestra la hora («3:45 p. m.»), otro día la fecha
 * corta («7 ago»).
 */
export function fmtHoraLista(ts: number) {
  const d = new Date(ts);
  if (mismoDia(d, new Date())) return fmtHora(ts);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/** Separador entre días dentro del hilo. */
export function fmtSeparadorDia(ts: number) {
  const d = new Date(ts);
  const hoy = new Date();
  if (mismoDia(d, hoy)) return "Hoy";
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return "Ayer";
  return d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === hoy.getFullYear() ? undefined : "numeric",
  });
}

/** Clave `YYYY-M-D` para agrupar mensajes por día. */
export function claveDia(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Cuánto queda de la ventana de 24 h: «Quedan 6 h para responder».
 * Devuelve null si ya se cerró.
 */
export function restanteVentana(expiraAt: number | null): string | null {
  if (!expiraAt) return null;
  const ms = expiraAt - Date.now();
  if (ms <= 0) return null;
  const horas = Math.floor(ms / 3_600_000);
  if (horas >= 1) return `Quedan ${horas} h para responder`;
  const minutos = Math.max(1, Math.round(ms / 60_000));
  return `Quedan ${minutos} min para responder`;
}

/** «1:07» para el cronómetro de la grabación. */
export function fmtDuracion(segundos: number) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Aviso fijo cuando la ventana de 24 h ya se cerró. */
export const AVISO_VENTANA_CERRADA =
  "Pasaron más de 24 horas desde su último mensaje. WhatsApp solo permite plantillas fuera de esa ventana.";

/**
 * Aviso cuando `puedeResponder` es false: la persona escribió con su @usuario
 * de WhatsApp y nunca compartió el número, así que no hay a dónde mandar la
 * respuesta. Tiene prioridad sobre el aviso de la ventana de 24 h.
 */
export const AVISO_SIN_TELEFONO =
  "Esta persona usa @usuario de WhatsApp y no comparte su número, así que WhatsApp no permite responderle desde aquí. Contáctala por otra vía o pídele que te comparta su número.";

/** Chip corto para la lista cuando no se le puede responder. */
export const ETIQUETA_SIN_RESPUESTA = "No se puede responder";
