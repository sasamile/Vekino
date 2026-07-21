import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import { ensurePushRegistration } from "@/lib/push";

/**
 * Al entrar autenticado: pide permiso de notificaciones (si aún no se pidió)
 * y registra el token en Convex.
 */
export function PushBootstrap() {
  const registerToken = useMutation(api.notifications.registerToken);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let cancelled = false;

    (async () => {
      try {
        const result = await ensurePushRegistration();
        if (cancelled || !result?.token) return;
        await registerToken({
          token: result.token,
          platform: result.platform,
        });
      } catch {
        /* silencioso: el usuario puede activar luego desde Perfil */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [registerToken]);

  return null;
}
