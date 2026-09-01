"use client";

import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Package, PackageCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

/**
 * Los paquetes de la casa, vistos por el residente.
 *
 * Existía la vista de la portería —quién recibe y quién entrega— pero no la
 * del dueño: el paquete quedaba en la lista del guarda y uno solo se
 * enteraba si bajaba a preguntar. Es también donde aterriza la notificación.
 */

const TIPO: Record<string, string> = {
  paquete: "Paquete",
  sobre: "Sobre",
  comida: "Comida",
  mercado: "Mercado",
  otro: "Otro",
};

function fecha(ts: number) {
  return new Date(ts).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MisPaquetes({ condominioId }: { condominioId: Id<"condominios"> }) {
  const paquetes = useQuery(api.portal.misPaquetes, { condominioId });

  if (paquetes === undefined) {
    return (
      <Card className="p-6">
        <Spinner className="mx-auto h-5 w-5" />
      </Card>
    );
  }

  /* Los pendientes van primero: es lo único sobre lo que hay que hacer algo. */
  const pendientes = paquetes.filter((p) => !p.entregado);
  const entregados = paquetes.filter((p) => p.entregado).slice(0, 10);

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
        Paquetes
        {pendientes.length > 0 && (
          <span className="rounded-md bg-brand/12 px-2 py-0.5 text-xs font-semibold text-brand">
            {pendientes.length} por recoger
          </span>
        )}
      </h2>

      {paquetes.length === 0 ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Package className="h-4 w-4" aria-hidden />
          Portería no ha recibido paquetes para tu casa.
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {[...pendientes, ...entregados].map((p) => (
            <div key={p._id} className="flex items-start gap-3 p-4">
              <span
                className={
                  p.entregado
                    ? "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                    : "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand"
                }
              >
                {p.entregado ? (
                  <PackageCheck className="h-4 w-4" aria-hidden />
                ) : (
                  <Package className="h-4 w-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  {TIPO[p.tipo] ?? "Paquete"}
                  {p.remitente ? ` · ${p.remitente}` : ""}
                </p>
                {p.descripcion && (
                  <p className="text-sm text-muted-foreground">{p.descripcion}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.entregado
                    ? `Entregado ${p.fechaEntregado ? fecha(p.fechaEntregado) : ""}${
                        p.entregadoANombre ? ` a ${p.entregadoANombre}` : ""
                      }`
                    : `Llegó ${fecha(p.fechaRecibido)} · te espera en portería`}
                </p>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
