"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
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
 * puede quitarse el layout del padre. La única forma de tener la reunión sin
 * nada alrededor es sacarla de ahí.
 *
 * Una sola ruta para los dos roles. El `esMesa` lo resuelve el servidor
 * (`miSala`) a partir del rol real: si dependiera de la URL, cualquiera
 * podría entrar por la ruta de la mesa.
 */
export default function SalaPage() {
  const params = useParams<{ condominioId: string; asambleaId: string }>();
  const condominioId = params.condominioId as Id<"condominios">;
  const asambleaId = params.asambleaId as Id<"asambleas">;

  const sala = useQuery(api.asambleaSala.miSala, { asambleaId });

  if (sala === undefined) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#0f1115]">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }

  const esMesa = !!sala?.esMesa;

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
