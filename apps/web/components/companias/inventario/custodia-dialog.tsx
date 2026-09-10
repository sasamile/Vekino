"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, Loader2, Undo2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { MAX_OBSERVACION } from "@vekino/backend/inventario";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

/**
 * Entregar un elemento a un conjunto, y recuperarlo.
 *
 * Un solo diálogo para las dos mitades porque son la misma decisión mirada
 * desde los dos lados —"¿dónde está esto?"— y separarlas obligaría a mantener
 * dos pantallas casi iguales.
 *
 * Ninguna de las reglas vive aquí: el desplegable solo ofrece conjuntos con
 * contrato vigente y activos porque eso es lo que devuelve
 * `condominiosAsignables`, y aunque el cliente mandara otro, la mutación lo
 * rechaza. Esto es comodidad, no seguridad.
 */

export function EntregarDialog({
  companiaId,
  itemId,
  itemNombre,
  onClose,
  overlayClassName,
}: {
  companiaId: Id<"companiasSeguridad">;
  itemId: Id<"inventarioItems">;
  itemNombre: string;
  onClose: () => void;
  overlayClassName?: string;
}) {
  const opciones = useQuery(api.inventarioAsignaciones.condominiosAsignables, {
    companiaId,
  });
  const asignar = useMutation(api.inventarioAsignaciones.asignar);

  const [condominioId, setCondominioId] = useState("");
  const [observacion, setObservacion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!condominioId) return;
    setError(null);
    setBusy(true);
    try {
      await asignar({
        itemId,
        condominioId: condominioId as Id<"condominios">,
        observacion: observacion.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entregar.");
    } finally {
      setBusy(false);
    }
  }

  const sinConjuntos = opciones !== undefined && opciones.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="Entregar a un conjunto"
      description={itemNombre}
      className="max-w-md"
      overlayClassName={overlayClassName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="form-entregar"
            disabled={busy || !condominioId}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Entregar
          </Button>
        </>
      }
    >
      <form id="form-entregar" onSubmit={guardar} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium text-foreground">
            Conjunto <span className="text-destructive">*</span>
          </span>
          <Select
            value={condominioId}
            onChange={(e) => setCondominioId(e.target.value)}
            disabled={opciones === undefined || sinConjuntos}
            required
          >
            <option value="">
              {opciones === undefined ? "Cargando…" : "Selecciona un conjunto"}
            </option>
            {(opciones ?? []).map((o) => (
              <option key={o.condominioId} value={o.condominioId}>
                {o.nombre}
              </option>
            ))}
          </Select>
          <p className="text-[11.5px] text-muted-foreground">
            Solo aparecen los conjuntos que tu compañía atiende hoy.
          </p>
        </label>

        {sinConjuntos && (
          <p className="rounded-lg bg-amber-500/12 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-400">
            Tu compañía no tiene contratos vigentes con ningún conjunto activo,
            así que todavía no hay a dónde entregar material.
          </p>
        )}

        <label className="block space-y-1.5">
          <span className="block text-xs font-medium text-foreground">
            Observación
          </span>
          <Input
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            maxLength={MAX_OBSERVACION}
            placeholder="Para el turno de noche"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function DevolverDialog({
  itemId,
  itemNombre,
  condominioNombre,
  onClose,
  overlayClassName,
}: {
  itemId: Id<"inventarioItems">;
  itemNombre: string;
  condominioNombre: string;
  onClose: () => void;
  overlayClassName?: string;
}) {
  const devolver = useMutation(api.inventarioAsignaciones.devolver);

  const [observacion, setObservacion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await devolver({ itemId, observacion: observacion.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo devolver.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar la devolución"
      description={itemNombre}
      className="max-w-md"
      overlayClassName={overlayClassName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" form="form-devolver" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Confirmar devolución
          </Button>
        </>
      }
    >
      <form id="form-devolver" onSubmit={guardar} className="space-y-4">
        <p className="text-[13px] text-foreground">
          El elemento vuelve al inventario de la compañía desde{" "}
          <strong>{condominioNombre}</strong>. La entrega anterior se conserva
          en el historial con su fecha y su responsable.
        </p>

        <label className="block space-y-1.5">
          <span className="block text-xs font-medium text-foreground">
            Observación
          </span>
          <Input
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            maxLength={MAX_OBSERVACION}
            placeholder="Vuelve completo, sin novedad"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** El icono de la acción, para que las dos se reconozcan a golpe de vista. */
export const IconoEntregar = Building2;
export const IconoDevolver = Undo2;
