import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Jobs programados.
 * Colombia = UTC-5 → 05:15 UTC ≈ 00:15 hora local.
 */
const crons = cronJobs();

crons.daily(
  "expire pending visitors",
  { hourUTC: 5, minuteUTC: 15 },
  internal.visitantes.expirarPendientesVencidos,
);

/**
 * Cierra las conexiones a la sala de asamblea que dejaron de latir.
 *
 * Cada minuto: es el intervalo más corto que ofrece Convex y encaja con el
 * corte de 90 s. Un residente al que se le cae el internet queda marcado
 * como desconectado a lo sumo ~2,5 min después, y su permanencia se corta en
 * el último latido real, no cuando el cron se entera.
 *
 * Barre todas las asambleas a la vez y no hace nada si no hay ninguna en
 * curso: la consulta va por índice `["abierta", "ultimoLatido"]` y sin
 * conexiones abiertas devuelve cero filas.
 */
crons.interval(
  "close idle assembly connections",
  { minutes: 1 },
  internal.asambleaSala.cerrarSesionesInactivas,
  {},
);

/**
 * Barre emisores de video caídos y señales WebRTC que nadie consumió.
 *
 * Se sale sola en cuanto ve que no hay ninguna asamblea en curso, que es
 * casi siempre. Sin esa guarda recorría cuatro tablas cada minuto durante
 * todo el año para no encontrar nada.
 */
crons.interval(
  "clean sala video signaling",
  { minutes: 1 },
  internal.salaVideo.limpiar,
  {},
);

/**
 * Chat de la sala: se borra lo de hace más de 12 horas.
 *
 * Diario y no por minuto: los mensajes sobreviven a la asamblea, así que no
 * puede depender de que haya una en curso, y con un corte de 12 horas mirar
 * una vez al día sobra.
 */
crons.daily(
  "clean sala chat",
  { hourUTC: 6, minuteUTC: 0 },
  internal.salaVideo.limpiarMensajes,
  {},
);

export default crons;
