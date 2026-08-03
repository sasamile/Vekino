"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Loader2 } from "lucide-react";
import { SalaReunion } from "@/components/asamblea/sala-reunion";

/**
 * La sala de la asamblea, a pantalla completa.
 *
 * Vive en `/sala/...` y no bajo `condominio/[id]` ni `mi/[id]` por una razón
 * de layout: los dos cuelgan de un `layout.tsx` que envuelve todo con su
 * shell (barra lateral, buscador, navegación), y en Next una ruta anidada no
 * puede quitarse el layout del padre.
 *
 * El orden de los gates importa y cada uno existe por un fallo real:
 *
 * 1. `useConvexAuth` primero. El cliente de Convex adjunta el token DESPUÉS
 *    del primer render; disparar `miSala` en ese hueco reventaba con
 *    "No autenticado" en un overlay aunque la persona sí tuviera sesión.
 *    La query no se lanza hasta `isAuthenticated`.
 * 2. Sin sesión → al login, no un error.
 * 3. `miSala === null` (sin membresía en este conjunto, o asamblea
 *    inexistente) → pantalla de sin acceso, no montar la sala: sus queries
 *    internas sí lanzan para quien no es miembro.
 *
 * Una sola ruta para los dos roles: `esMesa` lo resuelve el servidor. Si
 * dependiera de la URL, cualquiera entraría por la ruta de la mesa.
 */
export default function SalaPage() {
  const params = useParams<{ condominioId: string; asambleaId: string }>();
  const condominioId = params.condominioId as Id<"condominios">;
  const asambleaId = params.asambleaId as Id<"asambleas">;

  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();

  const sala = useQuery(
    api.asambleaSala.miSala,
    isAuthenticated ? { asambleaId } : "skip",
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated || sala === undefined) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#0c0e12]">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (sala === null) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-[#0c0e12] px-6 text-center">
        <p className="text-base font-semibold text-white/85">
          No tienes acceso a esta asamblea
        </p>
        <p className="max-w-sm text-sm leading-relaxed text-white/50">
          La asamblea no existe o tu cuenta no pertenece a este conjunto.
        </p>
        <Link
          href="/"
          className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
        >
          Ir al inicio
        </Link>
      </div>
    );
  }

  const esMesa = !!sala.esMesa;

  return (
    <SalaReunion
      asambleaId={asambleaId}
      condominioId={condominioId}
      esMesa={esMesa}
      volverHref={
        esMesa
          ? `/condominio/${condominioId}/asamblea/${asambleaId}`
          : `/mi/${condominioId}/asambleas/${asambleaId}`
      }
    />
  );
}
