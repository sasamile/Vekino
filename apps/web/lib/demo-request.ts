export type SolicitudDemo = {
  nombre: string;
  organizacion: string;
  correo: string;
  telefono: string;
  unidades: string;
  mensaje: string;
};

/**
 * Punto único de integración del formulario de demostración.
 *
 * ⚠️ HOY NO ENVÍA A NINGÚN LADO. Está aislado a propósito para que conectarlo
 * al backend (Convex, un correo transaccional o un CRM) sea un cambio de una
 * sola función, sin tocar la UI.
 *
 * Para conectarlo, reemplaza el cuerpo por, por ejemplo:
 *
 *   const res = await fetch("/api/demo", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify(data),
 *   });
 *   if (!res.ok) throw new Error("No se pudo enviar la solicitud");
 */
export async function enviarSolicitudDemo(data: SolicitudDemo): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.info("[demo] solicitud sin backend conectado:", data);
  }
  throw new Error("INTEGRACION_PENDIENTE");
}
