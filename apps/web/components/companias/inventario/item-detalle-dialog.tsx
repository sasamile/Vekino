"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  FilePlus2,
  Loader2,
  Pencil,
  PackagePlus,
  FileUp,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary, ErrorMessage } from "@/components/ui/error-boundary";
import { ItemFormDialog } from "./item-form-dialog";

/**
 * Ficha de un elemento y su historial completo.
 *
 * El historial es la mitad importante de esta pantalla, no un apéndice: es lo
 * que se consulta cuando aparece un faltante o cuando alguien pregunta por qué
 * un serial cambió. Por eso cada línea dice QUÉ pasó, QUIÉN lo hizo y CUÁNDO,
 * y las ediciones muestran el antes y el después campo por campo.
 */

type TipoNovedad =
  | "ITEM_CREATED"
  | "ITEM_UPDATED"
  | "ITEM_ARCHIVED"
  | "ITEM_IMPORTED";

/**
 * Cómo se pinta cada tipo de evento.
 *
 * Un mapa y no una cadena de `if`: cuando lleguen los eventos de asignación de
 * las tareas 2 y 3, añadirlos es una línea aquí y no tocar el componente.
 */
const ESTILO_EVENTO: Record<
  TipoNovedad,
  { etiqueta: string; icono: typeof PackagePlus; tono: "success" | "info" | "neutral" }
> = {
  ITEM_CREATED: { etiqueta: "Creado", icono: PackagePlus, tono: "success" },
  ITEM_IMPORTED: { etiqueta: "Importado", icono: FileUp, tono: "success" },
  ITEM_UPDATED: { etiqueta: "Editado", icono: Pencil, tono: "info" },
  ITEM_ARCHIVED: { etiqueta: "Archivado", icono: Archive, tono: "neutral" },
};

function fechaHora(ms: number): string {
  return new Date(ms).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ItemDetalleDialog({
  itemId,
  onClose,
}: {
  itemId: Id<"inventarioItems">;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Elemento del inventario"
      description="Ficha e historial completo"
      className="max-w-2xl"
    >
      <ErrorBoundary
        resetKey={itemId}
        fallback={(e) => (
          <ErrorMessage title="No se puede ver este elemento" detail={e.message} />
        )}
      >
        <Contenido itemId={itemId} />
      </ErrorBoundary>
    </Modal>
  );
}

function Contenido({ itemId }: { itemId: Id<"inventarioItems"> }) {
  const datos = useQuery(api.inventario.detalle, { itemId });
  const archivar = useMutation(api.inventario.archivar);

  const [editando, setEditando] = useState(false);
  const [confirmandoArchivo, setConfirmandoArchivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (datos === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
    );
  }

  const { item, historial } = datos;

  async function confirmarArchivo() {
    setError(null);
    setBusy(true);
    try {
      await archivar({ itemId, motivo: motivo.trim() || undefined });
      setConfirmandoArchivo(false);
      setMotivo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo archivar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        {item.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.fotoUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-xl border border-border object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
            <PackagePlus className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {item.nombre}
            </h3>
            {item.archivado ? (
              <Badge tone="neutral">
                <Archive className="h-3 w-3" aria-hidden />
                Archivado
              </Badge>
            ) : (
              <Badge tone="success">Disponible</Badge>
            )}
          </div>

          <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
            <Dato etiqueta="Serial" valor={item.serial ?? "—"} />
            <Dato etiqueta="Registrado" valor={fechaHora(item.createdAt)} />
            {item.archivado && (
              <>
                <Dato
                  etiqueta="Archivado"
                  valor={item.archivadoEn ? fechaHora(item.archivadoEn) : "—"}
                />
                <Dato etiqueta="Por" valor={item.archivadoPorNombre ?? "—"} />
              </>
            )}
          </dl>

          {item.descripcion && (
            <p className="pt-1 text-[13px] text-muted-foreground">
              {item.descripcion}
            </p>
          )}
        </div>
      </div>

      {/* Un elemento archivado no se edita ni se vuelve a archivar: es un
          hecho del pasado y retocarlo falsearía justo lo que el archivo
          conserva. El backend lo impide; aquí ni se ofrece. */}
      {!item.archivado && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmandoArchivo(true)}
          >
            <Archive className="h-3.5 w-3.5" aria-hidden />
            Archivar
          </Button>
        </div>
      )}

      {confirmandoArchivo && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-[13px] text-foreground">
            El elemento saldrá del inventario activo y pasará a{" "}
            <strong>Archivados</strong>. No se borra: su historial se conserva
            entero.
          </p>
          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-foreground">
              Motivo (opcional)
            </span>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Se dio de baja por desgaste"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmandoArchivo(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmarArchivo} disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Archivar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          Historial de novedades
        </p>
        <ol className="space-y-3">
          {historial.map((n) => {
            const estilo =
              ESTILO_EVENTO[n.tipo as TipoNovedad] ?? {
                etiqueta: n.tipo,
                icono: FilePlus2,
                tono: "neutral" as const,
              };
            const Icono = estilo.icono;
            return (
              <li key={n._id} className="flex gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Icono className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={estilo.tono}>{estilo.etiqueta}</Badge>
                    <span className="text-[12px] text-muted-foreground">
                      {fechaHora(n.createdAt)} · {n.actorNombre}
                    </span>
                  </div>
                  <p className="text-[13px] text-foreground">{n.descripcion}</p>
                  {n.cambios.length > 0 && (
                    <ul className="space-y-0.5 pt-0.5">
                      {n.cambios.map((c, i) => (
                        <li key={i} className="text-[12px] text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {c.campo}:
                          </span>{" "}
                          <span className="line-through">{c.antes ?? "vacío"}</span>{" "}
                          → <span>{c.despues ?? "vacío"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {editando && (
        <ItemFormDialog
          companiaId={item.companiaId}
          item={{
            _id: item._id,
            nombre: item.nombre,
            serial: item.serial,
            descripcion: item.descripcion,
            fotoUrl: item.fotoUrl,
          }}
          onClose={() => setEditando(false)}
          /* Apilado sobre este modal: sin subirle la capa, el formulario se
             abre DEBAJO de la ficha y parece que el boton no hace nada. */
          overlayClassName="z-[110]"
        />
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{etiqueta}:</dt>
      <dd className="min-w-0 truncate font-medium text-foreground">{valor}</dd>
    </div>
  );
}
