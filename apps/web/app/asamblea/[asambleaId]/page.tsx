"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

/**
 * Destino del QR de asistencia que la administración proyecta en la reunión.
 *
 * El QR solo puede llevar el id de la asamblea y el código, porque quien lo
 * genera está en el panel y no sabe a qué condominio pertenece la persona que
 * escanea. Aquí resolvemos el condominio y mandamos al portal del residente
 * con el código puesto, que es quien de verdad registra la asistencia.
 *
 * Existe para que el QR también sirva escaneado con la cámara del sistema, no
 * solo desde el escáner de la app.
 */
export default function EntrarAsamblea() {
  const router = useRouter();
  const params = useParams<{ asambleaId: string }>();
  const search = useSearchParams();
  const asambleaId = params.asambleaId as Id<"asambleas">;
  const codigo = search.get("c");

  const asamblea = useQuery(api.asambleas.get, { id: asambleaId });

  useEffect(() => {
    if (asamblea === undefined) return;
    if (asamblea === null) {
      router.replace("/dashboard");
      return;
    }
    const query = codigo ? `?c=${encodeURIComponent(codigo)}` : "";
    router.replace(
      `/mi/${asamblea.condominioId}/asambleas/${asambleaId}${query}`,
    );
  }, [asamblea, asambleaId, codigo, router]);

  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Abriendo la asamblea…</span>
    </div>
  );
}
