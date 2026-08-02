import { createAuthClient } from "better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

/**
 * Cliente de Better Auth de la web.
 *
 * Habla DIRECTO con el auth de Convex (…convex.site), no con el proxy de
 * Next (`app/api/auth/[...all]`): el `baseURL` del backend es esa misma URL,
 * así que el callback de OAuth aterriza ahí de todos modos. Si el resto del
 * tráfico fuera por el proxy, tendríamos la sesión partida en dos orígenes
 * —que es exactamente lo que rompía el login con Google.
 *
 * `crossDomainClient` es lo que hace viable esa separación: guarda la sesión
 * en `localStorage` y la manda en la cabecera `Better-Auth-Cookie` en cada
 * petición, en vez de depender de una cookie de tercero, que es justo lo que
 * Chrome y Edge bloquean hoy. Va ANTES de `convexClient`.
 */
const baseURL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim();

if (!baseURL && typeof window !== "undefined") {
  console.error(
    "[auth] Falta NEXT_PUBLIC_CONVEX_SITE_URL. Revisa apps/web/.env.local y reinicia el servidor de desarrollo.",
  );
}

export const authClient = createAuthClient({
  baseURL,
  plugins: [crossDomainClient(), convexClient()],
});
