"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Building2, Package, UserCheck } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary, ErrorMessage } from "@/components/ui/error-boundary";

/**
 * Qué material tiene hoy cada portería.
 *
 * La pregunta al revés que el listado, y por eso no es un filtro suyo: va por
 * `porCondominio`, que resuelve con el índice `by_compania_condominio_devuelta`
 * sin tocar el inventario de la compañía. Responderla filtrando el listado
 * costaría leer todos los elementos para hablar de una sola portería.
 *
 * El selector lista los conjuntos donde HAY material —`condominiosConMaterial`—
 * y no los que se pueden contratar. La diferencia es justo el caso que importa:
 * lo que se quedó dentro cuando el contrato terminó o el conjunto se dio de
 * baja. Con la otra lista, ese material desaparecía de la única pantalla desde
 * la que se puede ir a buscarlo.
 */
export function PorConjuntoDialog({
  companiaId,
  onClose,
}: {
  companiaId: Id<"companiasSeguridad">;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Material por conjunto"
      description="Qué elementos de la compañía están hoy en cada portería"
      className="max-w-2xl"
    >
      <ErrorBoundary
        resetKey={companiaId}
        fallback={(e) => (
          <ErrorMessage title="No se pudo consultar" detail={e.message} />
        )}
      >
        <Contenido companiaId={companiaId} />
      </ErrorBoundary>
    </Modal>
  );
}

function Contenido({ companiaId }: { companiaId: Id<"companiasSeguridad"> }) {
  const conjuntos = useQuery(
    api.inventarioAsignaciones.condominiosConMaterial,
    { companiaId },
  );
  const [condominioId, setCondominioId] = useState<string>("");

  /* El primero de la lista en cuanto se sepa cuál es, para que el diálogo no
   * abra en blanco pidiendo un clic que casi siempre es el mismo. */
  const elegido =
    condominioId || (conjuntos && conjuntos.length > 0 ? conjuntos[0]!.condominioId : "");

  const enConjunto = useQuery(
    api.inventarioAsignaciones.porCondominio,
    elegido
      ? { companiaId, condominioId: elegido as Id<"condominios"> }
      : "skip",
  );

  if (conjuntos === undefined) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  if (conjuntos.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No hay material fuera"
        description="Ahora mismo todos los elementos de la compañía están en su inventario, sin entregar a ninguna portería."
      />
    );
  }

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="block text-xs font-medium text-foreground">
          Conjunto
        </span>
        <Select
          value={elegido}
          onChange={(e) => setCondominioId(e.target.value)}
        >
          {conjuntos.map((c) => (
            <option key={c.condominioId} value={c.condominioId}>
              {c.nombre} · {c.elementos}
              {c.aproximado ? "+" : ""}
              {c.activo ? "" : " (dado de baja)"}
            </option>
          ))}
        </Select>
      </label>

      {enConjunto === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : enConjunto.items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin material en este conjunto"
          description="Ahora mismo no hay ningún elemento de la compañía entregado en esta portería."
        />
      ) : (
        <>
          <p className="text-[12.5px] text-muted-foreground">
            {enConjunto.items.length} elemento
            {enConjunto.items.length === 1 ? "" : "s"} entregado
            {enConjunto.items.length === 1 ? "" : "s"}
            {/* El recuento con el que se cuadra un inventario no puede
                presentarse como exacto si la lectura se quedó corta. */}
            {enConjunto.truncado ? " o más (la lista se quedó corta)" : ""}.
            {/* Sin esto, un elemento cuya custodia cayó fuera de la lectura se
                pintaría como si nadie lo tuviera. */}
            {enConjunto.custodiaGuardaIncompleta &&
              " Hay más elementos en manos de guardas de los que caben en una consulta: puede faltar alguno por señalar."}
          </p>
          <ul className="space-y-2">
            {enConjunto.items.map((i) => (
              <li
                key={i.asignacionId}
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
              >
                {i.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={i.fotoUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
                    <Package
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {i.nombre}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {i.serial ? `${i.serial} · ` : ""}
                    Entregado el{" "}
                    {new Date(i.asignadaEn).toLocaleDateString("es-CO", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {i.observacionAsignacion ? ` · ${i.observacionAsignacion}` : ""}
                  </p>
                </div>
                {/* Quién lo tiene dentro de la portería. El backend ya lo
                    servía —es la consulta que el administrador conserva sobre
                    su propio patrimonio— y la pantalla lo tiraba. */}
                {i.custodiaGuarda && (
                  <Badge tone="warning">
                    <UserCheck className="h-3 w-3" aria-hidden />
                    {i.custodiaGuarda.guardaNombre}
                  </Badge>
                )}
                <Badge tone="success">{i.estado}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
