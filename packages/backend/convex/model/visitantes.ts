/** Utilidades de vigencia de visitantes (timezone Colombia). */

const TZ = "America/Bogota";

/** Día local YYYY-MM-DD en America/Bogota. */
export function diaBogota(ts: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

/** Inicio y fin del día civil en Bogota (ms). */
export function ventanaDiaBogota(fechaISO: string): { inicio: number; fin: number } {
  const inicio = new Date(`${fechaISO}T00:00:00-05:00`).getTime();
  const fin = new Date(`${fechaISO}T23:59:59.999-05:00`).getTime();
  return { inicio, fin };
}

/** Ventana del día de hoy (Bogota). */
export function ventanaHoyBogota(): { inicio: number; fin: number; fechaISO: string } {
  const fechaISO = diaBogota();
  return { ...ventanaDiaBogota(fechaISO), fechaISO };
}

/**
 * ¿El QR/autorización sigue vigente para ingresar?
 * Solo el día de la visita (fechaVisitaInicio → fin de ese día, o createdAt si no hay fecha).
 */
export function esVisitanteVigente(vis: {
  estado: string;
  qrInvalidado: boolean;
  fechaVisitaInicio?: number;
  fechaVisitaFin?: number;
  createdAt: number;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (vis.qrInvalidado) return { ok: false, reason: "Este código ya no es válido." };
  if (vis.estado === "esperando_aprobacion") {
    return { ok: false, reason: "El residente aún no ha autorizado este ingreso." };
  }
  if (vis.estado === "finalizado" || vis.estado === "rechazado") {
    return { ok: false, reason: "Esta autorización ya se usó o expiró. Genera un QR nuevo." };
  }
  if (vis.estado === "activo") {
    return { ok: false, reason: "YA_ACTIVO" };
  }
  if (vis.estado !== "pendiente") {
    return { ok: false, reason: "Este código no está disponible para ingreso." };
  }

  const now = vis.now ?? Date.now();
  const diaRef = vis.fechaVisitaInicio ?? vis.createdAt;
  const { inicio, fin } = vis.fechaVisitaFin
    ? {
        inicio: vis.fechaVisitaInicio ?? ventanaDiaBogota(diaBogota(diaRef)).inicio,
        fin: vis.fechaVisitaFin,
      }
    : ventanaDiaBogota(diaBogota(diaRef));

  if (now < inicio) {
    return { ok: false, reason: "Esta autorización es para una fecha futura." };
  }
  if (now > fin) {
    return {
      ok: false,
      reason: "Este QR ya expiró. Solo es válido el día de la visita; pide uno nuevo.",
    };
  }
  return { ok: true };
}
