/**
 * Punto único de integración del formulario de novedades.
 *
 * ⚠️ HOY NO ENVÍA A NINGÚN LADO — mismo criterio que `demo-request.ts`.
 * Está aislado a propósito para que conectarlo (Convex, un correo
 * transaccional o una herramienta de marketing) sea un cambio de una sola
 * función, sin tocar la UI.
 *
 * Para conectarlo, reemplaza el cuerpo por, por ejemplo:
 *
 *   const res = await fetch("/api/newsletter", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ correo }),
 *   });
 *   if (!res.ok) throw new Error("No se pudo registrar el correo");
 */
export async function suscribirNovedades(correo: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.info("[novedades] suscripción sin backend conectado:", correo);
  }
  throw new Error("INTEGRACION_PENDIENTE");
}
