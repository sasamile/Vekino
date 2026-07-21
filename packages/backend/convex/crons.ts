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

export default crons;
