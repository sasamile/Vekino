import { NextResponse } from "next/server";
import { api } from "@vekino/backend/api";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";

/**
 * Sesión y permiso para leer y cargar PDFs de facturas.
 *
 * Las rutas de facturas leen PDFs con datos de los residentes y, al confirmar,
 * publican en S3 y escriben en la base. Piden la misma sesión que el resto de
 * la web (la cookie de Better Auth, que Convex valida; igual que
 * `/api/incidentes/reporte`) y el rol de quien sube facturas en ese conjunto
 * (`facturas.permisoSubida`). Ante la duda, no dejan pasar.
 */

/** Sin sesión no se lee ni el formulario: 401. */
export async function rechazoSinSesion(): Promise<NextResponse | null> {
  if (await isAuthenticated()) return null;
  return NextResponse.json({ error: "Inicia sesión para subir facturas." }, { status: 401 });
}

/** 401 si Convex no reconoce a la persona, 403 sin rol en el conjunto, 500 si no se pudo validar. */
export async function rechazoDePermiso(condominioLegacyId: string): Promise<NextResponse | null> {
  const SIN_SESION = { error: "Tu sesión no es válida. Vuelve a iniciar sesión." };
  const SIN_PERMISO = { error: "No tienes permiso para subir facturas de este conjunto." };
  try {
    const permiso = await fetchAuthQuery(api.facturas.permisoSubida, { condominioLegacyId });
    if (permiso?.allowed) return null;
    return permiso?.motivo === "sin_sesion"
      ? NextResponse.json(SIN_SESION, { status: 401 })
      : NextResponse.json(SIN_PERMISO, { status: 403 });
  } catch (e) {
    /* Un token que Convex no acepta llega como error, no como respuesta. */
    const texto = e instanceof Error ? e.message : "";
    if (/autenticado|perfil inexistente|token|unauthenticated/i.test(texto)) {
      return NextResponse.json(SIN_SESION, { status: 401 });
    }
    return NextResponse.json(
      { error: "No fue posible validar tu sesión. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
