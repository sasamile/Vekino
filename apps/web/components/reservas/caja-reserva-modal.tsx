"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2, Plus, Wallet } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cop } from "@/lib/utils";
import {
  DesgloseDeposito,
  ETIQUETA_ESTADO_DEPOSITO,
  FormularioIncidente,
  IncidenteDetalle,
  type EstadoDepositoCaja,
  type IncidenteCaja,
  type LiquidacionCaja,
  type MontosLiquidados,
} from "./incidentes-deposito";

type DepositoCaja = {
  _id: Id<"guardiaReservaDepositos">;
  monto: number;
  estado: EstadoDepositoCaja;
  observacionesSalida: string | null;
  resueltoPorNombre?: string | null;
  fechaResolucion?: number | null;
};

export type ReservaCaja = {
  _id: Id<"reservas">;
  condominioId: Id<"condominios">;
  estado: string;
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
  incidentes?: IncidenteCaja[];
  incidentesAbiertos?: boolean;
  liquidacion?: LiquidacionCaja | null;
  liquidado?: MontosLiquidados | null;
};

/**
 * Caja de una reserva: cobro del alquiler, incidentes y ciclo del depósito.
 *
 * El reporte no puede decir "se cobró" ni "no se recibió" si nadie tiene
 * dónde anotarlo. Portería sigue registrando el depósito en la entrada; este
 * modal es la misma caja para quien cobra en oficina — sin validar ingreso
 * ni salida.
 *
 * Aquí la administración revisa lo que portería reportó y le pone valor. El
 * depósito ya no se "retiene": se descuenta lo que valen los incidentes, con
 * el depósito como tope.
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
        <SeccionIncidentes reserva={reserva} />
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

function SeccionIncidentes({ reserva }: { reserva: ReservaCaja }) {
  const registrar = useMutation(api.reservas.registrarIncidente);
  const incidentes = reserva.incidentes ?? [];
  const abiertos = reserva.incidentesAbiertos ?? true;
  const puedeCrear = abiertos && reserva.estado === "aprobada";
  const [creando, setCreando] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Incidentes</h3>
          <p className="text-xs text-muted-foreground">
            {abiertos
              ? "Los valorados descuentan del depósito, hasta su monto."
              : "El depósito ya se liquidó: los incidentes quedaron cerrados."}
          </p>
        </div>
        {puedeCrear && !creando && (
          <Button variant="outline" size="sm" onClick={() => setCreando(true)}>
            <Plus className="h-4 w-4" /> Registrar
          </Button>
        )}
      </div>

      {creando && (
        <FormularioIncidente
          conValor
          carpeta={`condominios/${reserva.condominioId}/reservas/incidentes`}
          onCancelar={() => setCreando(false)}
          onGuardar={async (datos) => {
            await registrar({ reservaId: reserva._id, ...datos });
            setCreando(false);
          }}
        />
      )}

      {incidentes.length === 0 && !creando ? (
        <p className="text-xs text-muted-foreground">Sin incidentes.</p>
      ) : (
        incidentes.map((i) => (
          <IncidenteDetalle key={i._id} incidente={i}>
            {abiertos && <RevisionIncidente incidente={i} />}
          </IncidenteDetalle>
        ))
      )}
    </section>
  );
}

/** Valorar o descartar: la decisión económica que portería no toma. */
function RevisionIncidente({ incidente }: { incidente: IncidenteCaja }) {
  const valorar = useMutation(api.reservas.valorarIncidente);
  const descartar = useMutation(api.reservas.descartarIncidente);
  const [modo, setModo] = useState<null | "valorar" | "descartar">(null);
  const [valor, setValor] = useState(incidente.valor != null ? String(incidente.valor) : "");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valorNum = Number(valor);
  const valorValido = Number.isFinite(valorNum) && valorNum > 0;

  async function confirmar() {
    setBusy(true);
    setError(null);
    try {
      if (modo === "valorar") {
        await valorar({ incidenteId: incidente._id, valor: valorNum, nota: nota.trim() || undefined });
      } else {
        await descartar({ incidenteId: incidente._id, nota: nota.trim() || undefined });
      }
      setModo(null);
      setNota("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la revisión.");
    } finally {
      setBusy(false);
    }
  }

  if (!modo) {
    return (
      <div className="flex justify-end gap-2">
        {incidente.estado !== "descartado" && (
          <Button variant="ghost" size="sm" onClick={() => setModo("descartar")}>
            Descartar
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setModo("valorar")}>
          {incidente.estado === "valorado" ? "Corregir valor" : "Valorar"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-border pt-2">
      {modo === "valorar" ? (
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Valor a descontar (COP)</label>
          <Input
            type="number"
            min={1}
            step={1}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0"
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Un incidente descartado no descuenta nada del depósito.
        </p>
      )}
      <Input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota de la revisión (opcional)"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setModo(null);
            setError(null);
          }}
          disabled={busy}
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          variant={modo === "descartar" ? "destructive" : "primary"}
          onClick={confirmar}
          disabled={busy || (modo === "valorar" && !valorValido)}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {modo === "valorar" ? "Guardar valor" : "Descartar incidente"}
        </Button>
      </div>
    </div>
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
        reserva.liquidacion ? (
          <DevolverDeposito dep={dep} liquidacion={reserva.liquidacion} />
        ) : null
      ) : (
        <DepositoResuelto dep={dep} liquidado={reserva.liquidado ?? null} />
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

/**
 * Devolución desde oficina.
 *
 * Se manda el saldo que se está viendo; el servidor lo recalcula y rechaza si
 * cambió. La razón es obligatoria solo si hubo incidentes.
 */
function DevolverDeposito({ dep, liquidacion }: { dep: DepositoCaja; liquidacion: LiquidacionCaja }) {
  const resolver = useMutation(api.reservas.resolverDeposito);
  const [razon, setRazon] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const l = liquidacion;
  const faltaRazon = l.razonObligatoria && !razon.trim();

  async function devolver() {
    setBusy(true);
    setError(null);
    try {
      await resolver({
        depositoId: dep._id,
        saldoEsperado: l.saldoDevolucion,
        observaciones: razon.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo devolver el depósito.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <DesgloseDeposito liquidacion={l} />
      {l.puedeLiquidar && (
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Razón de la devolución{" "}
            {l.razonObligatoria ? (
              <span className="text-red-600">*</span>
            ) : (
              <span className="text-muted-foreground">(opcional)</span>
            )}
          </label>
          <Textarea
            value={razon}
            onChange={(e) => setRazon(e.target.value)}
            rows={2}
            placeholder={
              l.totalDescuento > 0
                ? `Devolución parcial por daños durante la reserva. Se descontaron ${cop(l.totalDescuento)} del depósito.`
                : "Espacio entregado en buen estado."
            }
          />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={devolver} disabled={busy || !l.puedeLiquidar || faltaRazon}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Devolver {cop(l.saldoDevolucion)}
        </Button>
      </div>
    </div>
  );
}

function DepositoResuelto({ dep, liquidado }: { dep: DepositoCaja; liquidado: MontosLiquidados | null }) {
  const tono =
    dep.estado === "devuelto" ? "success" : dep.estado === "devuelto_parcial" ? "warning" : "destructive";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">Recibido {cop(dep.monto)}</p>
        <Badge tone={tono}>{ETIQUETA_ESTADO_DEPOSITO[dep.estado]}</Badge>
      </div>
      {liquidado && (
        <p className="text-xs text-muted-foreground">
          Devuelto {cop(liquidado.devuelto)}
          {liquidado.descontado > 0 ? ` · Descontado ${cop(liquidado.descontado)}` : ""}
        </p>
      )}
      {dep.observacionesSalida ? (
        <p className="text-xs text-muted-foreground">{dep.observacionesSalida}</p>
      ) : null}
      {dep.resueltoPorNombre ? (
        <p className="text-[11px] text-muted-foreground">
          Por {dep.resueltoPorNombre}
          {dep.fechaResolucion
            ? ` · ${new Date(dep.fechaResolucion).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
