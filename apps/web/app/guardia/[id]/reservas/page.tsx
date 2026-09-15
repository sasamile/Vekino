"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle, CalendarCheck, Clock, Home, Loader2, LogIn, LogOut, Wallet, Camera, ShieldAlert,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, Textarea } from "@/components/ui/input";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { cn, cop } from "@/lib/utils";
import { useUploadToS3 } from "@/hooks/use-upload-s3";
import {
  DesgloseDeposito,
  ETIQUETA_ESTADO_DEPOSITO,
  FormularioIncidente,
  IncidenteDetalle,
} from "@/components/reservas/incidentes-deposito";

type Reserva = FunctionReturnType<typeof api.guardia.listReservasControl>[number];

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
}

export default function GuardiaReservasPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const reservas = useQuery(api.guardia.listReservasControl, { condominioId });

  /* Se guarda el id y no la fila: el modal tiene que ver los incidentes que
     la administración valore mientras está abierto, no una copia vieja. */
  const [depositoDe, setDepositoDe] = useState<Id<"reservas"> | null>(null);
  const [devolverDe, setDevolverDe] = useState<Id<"reservas"> | null>(null);
  const [incidenteDe, setIncidenteDe] = useState<Id<"reservas"> | null>(null);
  const buscar = (id: Id<"reservas"> | null) => (id ? reservas?.find((r) => r._id === id) ?? null : null);
  const filaDeposito = buscar(depositoDe);
  const filaDevolver = buscar(devolverDe);
  const filaIncidente = buscar(incidenteDe);

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Control de reservas"
          description="Valida ingresos y salidas de zonas comunes; controla depósitos e incidentes"
        />

      {reservas === undefined ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : reservas.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Sin reservas aprobadas" description="Cuando la administración apruebe reservas, aparecerán aquí para su control." />
      ) : (
        <div className="space-y-3">
          {reservas.map((r) => (
            <ReservaCard
              key={r._id}
              r={r}
              onDeposito={() => setDepositoDe(r._id)}
              onDevolver={() => setDevolverDe(r._id)}
              onIncidente={() => setIncidenteDe(r._id)}
            />
          ))}
        </div>
      )}

      {filaDeposito && <DepositoModal reserva={filaDeposito} onClose={() => setDepositoDe(null)} />}
      {filaDevolver && filaDevolver.deposito && (
        <DevolverModal reserva={filaDevolver} onClose={() => setDevolverDe(null)} />
      )}
      {filaIncidente && <IncidenteModal reserva={filaIncidente} onClose={() => setIncidenteDe(null)} />}
      </div>
    </PageContainer>
  );
}

function ReservaCard({
  r, onDeposito, onDevolver, onIncidente,
}: { r: Reserva; onDeposito: () => void; onDevolver: () => void; onIncidente: () => void }) {
  const validarIngreso = useMutation(api.guardia.validarIngresoReserva);
  const validarSalida = useMutation(api.guardia.validarSalidaReserva);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sinIngreso = !r.ingresoValidadoAt;
  const enCurso = !!r.ingresoValidadoAt && !r.salidaValidadaAt;
  const depositoEnCustodia = r.deposito?.estado === "registrado";
  const pendientes = r.liquidacion?.pendientes ?? 0;
  const incidentesActivos = r.incidentes.filter((i) => i.estado !== "descartado").length;

  async function accion(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  }

  const botonSalida = (
    <Button size="sm" variant="outline" onClick={() => accion(() => validarSalida({ reservaId: r._id }))} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Validar salida
    </Button>
  );

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">{r.zonaNombre}</p>
            {r.salidaValidadaAt ? (
              <Badge tone="neutral">Completada</Badge>
            ) : enCurso ? (
              <Badge tone="success">En curso</Badge>
            ) : (
              <Badge tone="info">Programada</Badge>
            )}
            {r.deposito && (
              <span className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                depositoEnCustodia ? "bg-amber-500/10 text-amber-600"
                  : r.deposito.estado === "devuelto" ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-red-500/10 text-red-600",
              )}>
                Depósito {cop(r.deposito.monto)} · {depositoEnCustodia ? "en portería" : ETIQUETA_ESTADO_DEPOSITO[r.deposito.estado].toLowerCase()}
              </span>
            )}
            {!r.deposito && r.depositoRequerido ? (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Depósito {cop(r.depositoRequerido)}
              </span>
            ) : null}
            {pendientes > 0 ? (
              <Badge tone="warning">{pendientes === 1 ? "1 incidente por valorar" : `${pendientes} incidentes por valorar`}</Badge>
            ) : incidentesActivos > 0 ? (
              <Badge tone="destructive">{incidentesActivos === 1 ? "1 incidente" : `${incidentesActivos} incidentes`}</Badge>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="capitalize">{fmtFecha(r.fecha)}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {r.horaInicio} – {r.horaFin}</span>
            <span className="inline-flex items-center gap-1"><Home className="h-3.5 w-3.5" /> Unidad {r.unidadNumero}</span>
            <span className="text-foreground">{r.solicitanteNombre}</span>
          </div>
          {error && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600"><ShieldAlert className="h-3.5 w-3.5 shrink-0" /> {error}</p>}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          {sinIngreso && (
            <>
              <Button size="sm" onClick={() => accion(() => validarIngreso({ reservaId: r._id }))} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Validar ingreso
              </Button>
              {!r.deposito && (
                <Button size="sm" variant="outline" onClick={onDeposito} disabled={busy}>
                  <Wallet className="h-4 w-4" /> Con depósito
                </Button>
              )}
            </>
          )}
          {/* Con incidentes por valorar la salida física no espera: el depósito
              se queda en portería hasta que la administración decida. */}
          {enCurso && (depositoEnCustodia && pendientes === 0 ? (
            <Button size="sm" variant="outline" onClick={onDevolver} disabled={busy}>
              <Wallet className="h-4 w-4" /> Devolver depósito
            </Button>
          ) : botonSalida)}
          {!!r.salidaValidadaAt && depositoEnCustodia && (
            <Button size="sm" variant="outline" onClick={onDevolver} disabled={busy}>
              <Wallet className="h-4 w-4" /> Devolver depósito
            </Button>
          )}
          {!sinIngreso && r.incidentesAbiertos && (
            <Button size="sm" variant="ghost" onClick={onIncidente} disabled={busy}>
              <AlertTriangle className="h-4 w-4" /> Reportar incidente
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ───────── Registrar depósito (+ valida ingreso) ───────── */
function DepositoModal({ reserva, onClose }: { reserva: Reserva; onClose: () => void }) {
  const registrar = useMutation(api.guardia.registrarDepositoReserva);
  const uploadFile = useUploadToS3();
  const [monto, setMonto] = useState(
    reserva.depositoRequerido ? String(reserva.depositoRequerido) : "",
  );
  const [observaciones, setObservaciones] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montoNum = Number(monto);
  const valido = montoNum > 0;

  async function confirmar() {
    if (!valido) return;
    setBusy(true); setError(null);
    try {
      let fotoUrl: string | undefined;
      if (foto) {
        const uploaded = await uploadFile(
          foto,
          `condominios/guardia/${reserva.condominioId}/depositos`,
        );
        fotoUrl = uploaded.url;
      }
      await registrar({ reservaId: reserva._id, monto: montoNum, observaciones: observaciones || undefined, fotoUrl });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose}
      title="Registrar depósito"
      description={`${reserva.zonaNombre} · Unidad ${reserva.unidadNumero}. Se valida el ingreso.`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} disabled={!valido || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Registrar e ingresar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Monto del depósito (COP) *</label>
          <Input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej. 100000" />
          {reserva.depositoRequerido ? (
            <p className="text-[11px] text-muted-foreground">
              Configurado en la zona: {cop(reserva.depositoRequerido)}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Observaciones</label>
          <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Estado del espacio, inventario… (opcional)" />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Camera className="h-3.5 w-3.5" /> Foto de evidencia (opcional)
          </label>
          <Input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

/* ───────── Reportar incidente (sin valor) ───────── */
function IncidenteModal({ reserva, onClose }: { reserva: Reserva; onClose: () => void }) {
  const reportar = useMutation(api.guardia.reportarIncidenteReserva);
  return (
    <Modal
      open onClose={onClose}
      title="Reportar incidente"
      description={`${reserva.zonaNombre} · Unidad ${reserva.unidadNumero} · ${reserva.solicitanteNombre}`}
    >
      <FormularioIncidente
        conValor={false}
        carpeta={`condominios/guardia/${reserva.condominioId}/incidentes`}
        onCancelar={onClose}
        onGuardar={async (datos) => {
          await reportar({ reservaId: reserva._id, descripcion: datos.descripcion, fotos: datos.fotos });
          onClose();
        }}
      />
    </Modal>
  );
}

/* ───────── Devolver depósito (+ valida salida si faltaba) ───────── */
function DevolverModal({ reserva, onClose }: { reserva: Reserva; onClose: () => void }) {
  const resolver = useMutation(api.guardia.resolverDepositoReserva);
  const uploadFile = useUploadToS3();
  const [razon, setRazon] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposito = reserva.deposito!;
  const l = reserva.liquidacion;
  const faltaRazon = !!l?.razonObligatoria && !razon.trim();
  const valido = !!l && l.puedeLiquidar && !faltaRazon;

  async function confirmar() {
    if (!l || !valido) return;
    setBusy(true); setError(null);
    try {
      let fotoUrl: string | undefined;
      if (foto) {
        const uploaded = await uploadFile(
          foto,
          `condominios/guardia/${reserva.condominioId}/depositos`,
        );
        fotoUrl = uploaded.url;
      }
      await resolver({
        depositoId: deposito._id,
        saldoEsperado: l.saldoDevolucion,
        observaciones: razon.trim() || undefined,
        fotoUrl,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo devolver.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose}
      title="Devolver depósito"
      description={`${reserva.zonaNombre} · Unidad ${reserva.unidadNumero}${reserva.salidaValidadaAt ? "" : ". Se valida la salida."}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} disabled={!valido || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {l ? `Devolver ${cop(l.saldoDevolucion)}` : "Devolver"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {l && <DesgloseDeposito liquidacion={l} />}
        {reserva.incidentes.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Incidentes</p>
            {reserva.incidentes.map((i) => <IncidenteDetalle key={i._id} incidente={i} />)}
          </div>
        )}
        {l?.puedeLiquidar && (
          <>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Razón de la devolución{" "}
                {l.razonObligatoria ? <span className="text-red-600">*</span> : <span className="text-muted-foreground">(opcional)</span>}
              </label>
              <Textarea
                value={razon}
                onChange={(e) => setRazon(e.target.value)}
                rows={2}
                placeholder={
                  l.totalDescuento > 0
                    ? `Devolución parcial por daños. Se descontaron ${cop(l.totalDescuento)} del depósito.`
                    : "Opcional"
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Camera className="h-3.5 w-3.5" /> Foto de la entrega (opcional)
              </label>
              <Input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </div>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
