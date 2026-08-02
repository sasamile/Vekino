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

/** Barre emisores de video caídos y señales WebRTC que nadie consumió. */
crons.interval(
  "clean sala video signaling",
  { minutes: 1 },
  internal.salaVideo.limpiar,
  {},
);

export default crons;
