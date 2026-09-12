"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2, Wallet } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cop } from "@/lib/utils";

type DepositoCaja = {
  _id: Id<"guardiaReservaDepositos">;
  monto: number;
  estado: "registrado" | "devuelto" | "no_devuelto";
  observacionesSalida: string | null;
};

export type ReservaCaja = {
  _id: Id<"reservas">;
  zonaNombre: string;
  unidadNumero: string;
  solicitanteNombre: string;
  valorReserva?: number | null;
  depositoRequerido?: number | null;
  pagoAlquilerMonto?: number | null;
  pagoAlquilerAt?: number | null;
  pagoAlquilerPorNombre?: string | null;
  pagoAlquilerNotas?: string | null;
  depositoCaja?: DepositoCaja | null;
};

/**
 * Caja de una reserva: cobro del alquiler y ciclo del depósito.
 *
 * El reporte no puede decir "se cobró" ni "no se recibió" si nadie tiene
 * dónde anotarlo. Portería sigue registrando el depósito en la entrada; este
 * modal es la misma caja para quien cobra en oficina — sin validar ingreso
 * ni salida, y con retención por daños si hace falta.
 */
export function CajaReservaModal({
  reserva,
  onClose,
}: {
  reserva: ReservaCaja;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Caja de la reserva"
      description={`${reserva.zonaNombre} · Unidad ${reserva.unidadNumero} · ${reserva.solicitanteNombre}`}
      className="max-w-md"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-6">
        <SeccionAlquiler reserva={reserva} />
        <div className="border-t border-border" />
        <SeccionDeposito reserva={reserva} />
      </div>
    </Modal>
  );
}

function SeccionAlquiler({ reserva }: { reserva: ReservaCaja }) {
  const registrar = useMutation(api.reservas.registrarPagoAlquiler);
  const cobrado = reserva.pagoAlquilerMonto != null;
  const [editando, setEditando] = useState(!cobrado);
  const [monto, setMonto] = useState(
    String(reserva.pagoAlquilerMonto ?? reserva.valorReserva ?? ""),
  );
  const [notas, setNotas] = useState(reserva.pagoAlquilerNotas ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montoNum = Number(monto);
  const valido = Number.isFinite(montoNum) && montoNum > 0;

  async function guardar() {
    if (!valido) return;
    setBusy(true);
    setError(null);
    try {
      await registrar({
        id: reserva._id,
        monto: montoNum,
        notas: notas.trim() || undefined,
      });
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el cobro.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">Alquiler</h3>
        <p className="text-xs text-muted-foreground">
          {reserva.valorReserva != null
            ? `Pactado ${cop(reserva.valorReserva)}`
            : "Esta zona no tiene tarifa configurada."}
        </p>
      </div>

      {cobrado && !editando ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Cobrado {cop(reserva.pagoAlquilerMonto ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {[
                reserva.pagoAlquilerPorNombre,
                reserva.pagoAlquilerAt
                  ? new Date(reserva.pagoAlquilerAt).toLocaleDateString("es-CO", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {reserva.pagoAlquilerNotas ? (
              <p className="mt-1 text-xs text-muted-foreground">{reserva.pagoAlquilerNotas}</p>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
            Corregir
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Monto cobrado (COP)</label>
            <Input
              type="number"
              min={1}
              step={1}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Notas <span className="text-muted-foreground">(opcional)</span>
            </label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Transferencia, efectivo, descuento…"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            {cobrado && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditando(false);
                  setError(null);
                }}
                disabled={busy}
              >
                Cancelar
              </Button>
            )}
            <Button size="sm" onClick={guardar} disabled={!valido || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {cobrado ? "Guardar corrección" : "Registrar cobro"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function SeccionDeposito({ reserva }: { reserva: ReservaCaja }) {
  const dep = reserva.depositoCaja ?? null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">Depósito</h3>
        <p className="text-xs text-muted-foreground">
          {reserva.depositoRequerido
            ? `Esperado ${cop(reserva.depositoRequerido)}`
            : "Esta zona no pide depósito."}
        </p>
      </div>

      {!dep ? (
        <FormularioRegistrarDeposito reserva={reserva} />
      ) : dep.estado === "registrado" ? (
        <ResolverDeposito dep={dep} />
      ) : (
        <DepositoResuelto dep={dep} />
      )}
    </section>
  );
}

function FormularioRegistrarDeposito({ reserva }: { reserva: ReservaCaja }) {
  const registrar = useMutation(api.reservas.registrarDeposito);
  const [monto, setMonto] = useState(
    reserva.depositoRequerido ? String(reserva.depositoRequerido) : "",
  );
  const [observaciones, setObservaciones] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montoNum = Number(monto);
  const valido = Number.isFinite(montoNum) && montoNum > 0;

  async function guardar() {
    if (!valido) return;
    setBusy(true);
    setError(null);
    try {
      await registrar({
        id: reserva._id,
        monto: montoNum,
        observaciones: observaciones.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el depósito.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground">Monto recibido (COP)</label>
        <Input
          type="number"
          min={1}
          step={1}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="0"
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground">
          Observaciones <span className="text-muted-foreground">(opcional)</span>
        </label>
        <Textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          placeholder="Estado del espacio, inventario…"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={guardar} disabled={!valido || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Registrar depósito
        </Button>
      </div>
    </div>
  );
}

function ResolverDeposito({ dep }: { dep: DepositoCaja }) {
  const resolver = useMutation(api.reservas.resolverDeposito);
  const [reteniendo, setReteniendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function devolver() {
    setBusy(true);
    setError(null);
    try {
      await resolver({ depositoId: dep._id, devuelto: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo devolver el depósito.");
    } finally {
      setBusy(false);
    }
  }

  async function retener() {
    if (!motivo.trim()) {
      setError("Si se retiene el depósito, indica el motivo (daños, faltantes…).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resolver({
        depositoId: dep._id,
        devuelto: false,
        observaciones: motivo.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo retener el depósito.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">Recibido {cop(dep.monto)}</p>
        <p className="text-xs text-muted-foreground">Aún sin devolver.</p>
      </div>

      {reteniendo ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Motivo de la retención</label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="Se dañó el mesón, faltó una silla…"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReteniendo(false);
                setError(null);
              }}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={retener} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Retener depósito
            </Button>
          </div>
        </div>
      ) : (
        <>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setReteniendo(true)} disabled={busy}>
              Retener
            </Button>
            <Button size="sm" onClick={devolver} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Devolver
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function DepositoResuelto({ dep }: { dep: DepositoCaja }) {
  const retenido = dep.estado === "no_devuelto";
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">{cop(dep.monto)}</p>
        <Badge tone={retenido ? "destructive" : "success"}>
          {retenido ? "Retenido" : "Devuelto"}
        </Badge>
      </div>
      {retenido && dep.observacionesSalida ? (
        <p className="mt-1 text-xs text-muted-foreground">{dep.observacionesSalida}</p>
      ) : null}
    </div>
  );
}
