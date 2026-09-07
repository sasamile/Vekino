"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
  useMutation,
} from "convex/react";
import { LogOut, ShieldCheck } from "lucide-react";
import { api } from "@vekino/backend/api";
import { authClient } from "@/lib/auth-client";
import { Spinner } from "@/components/ui/spinner";
import { CambiarClaveTemporalModal } from "@/components/cambiar-clave-temporal-modal";

/**
 * Shell del supervisor de una compañía de vigilancia.
 *
 * Propio y no el del conjunto: el supervisor no pertenece a ningún conjunto
 * —pertenece a la empresa que los cubre— y su trabajo es transversal a
 * varios, así que ni el shell de administración (que exige membresía) ni el
 * de portería (que gira alrededor de UN turno) le sirven.
 *
 * No decide nada de permisos: lo único que hace es no dejar entrar a quien no
 * supervisa. El alcance real —qué conjuntos y qué guardas— lo resuelve el
 * servidor en `asignaciones.miEquipo`.
 */
export function VigilanciaShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden bg-background">
      <AuthLoading>
        <Fullscreen>
          <Spinner className="h-5 w-5" />
        </Fullscreen>
      </AuthLoading>
      <Unauthenticated>
        <Redirect to="/login" />
      </Unauthenticated>
      <Authenticated>
        <Guard>{children}</Guard>
      </Authenticated>
    </div>
  );
}

function Fullscreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return (
    <Fullscreen>
      <Spinner className="h-5 w-5" />
    </Fullscreen>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ensureProfile = useMutation(api.users.ensureProfile);
  const compania = useQuery(api.companias.miCompania);
  const me = useQuery(api.users.me);

  useEffect(() => {
    void ensureProfile();
  }, [ensureProfile]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  if (compania === undefined || me === undefined || me === null) {
    return (
      <Fullscreen>
        <Spinner className="h-5 w-5" />
      </Fullscreen>
    );
  }

  /* Quien no es personal de una compañía no pinta nada aquí. No es la
   * autorización de verdad —esa está en el servidor— sino no dejar una
   * pantalla vacía a quien llegó por una URL que no le toca. */
  if (!compania || !compania.roles.includes("supervisor")) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="font-admin flex h-dvh flex-col overflow-hidden bg-background lg:p-3.5">
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-card lg:rounded-[18px] lg:border lg:border-border lg:shadow-soft">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            {compania.logo ? (
              <Image
                src={compania.logo}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 rounded-md object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand/10 text-brand">
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-foreground">
                {compania.nombre}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                Supervisión · {me.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-red-600 hover:bg-red-500/10 dark:text-red-400"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>

      <CambiarClaveTemporalModal />
    </div>
  );
}
