"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  CalendarCheck, Clock, Home, Loader2, LogIn, LogOut, Wallet, Camera, ShieldAlert,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id, Doc } from "@vekino/backend/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Reserva = Doc<"reservas"> & { deposito: Doc<"guardiaReservaDepositos"> | null };

async function subirFoto(generarUrl: () => Promise<string>, file: File): Promise<Id<"_storage">> {
  const url = await generarUrl();
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
  if (!res.ok) throw new Error("No se pudo subir la foto.");
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
}

export default function GuardiaReservasPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const reservas = useQuery(api.guardia.listReservasControl, { condominioId });

  const [depositoDe, setDepositoDe] = useState<Reserva | null>(null);
  const [resolverDe, setResolverDe] = useState<Reserva | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
          <CalendarCheck className="h-5 w-5 text-brand" /> Control de reservas
        </h1>
        <p className="text-sm text-muted-foreground">Valida ingresos y salidas de zonas comunes; controla depósitos</p>
      </div>

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
              onDeposito={() => setDepositoDe(r)}
              onResolver={() => setResolverDe(r)}
            />
          ))}
        </div>
      )}

      {depositoDe && <DepositoModal reserva={depositoDe} onClose={() => setDepositoDe(null)} />}
      {resolverDe && resolverDe.deposito && (
        <ResolverModal reserva={resolverDe} deposito={resolverDe.deposito} onClose={() => setResolverDe(null)} />
      )}
    </div>
  );
}

function ReservaCard({
  r, onDeposito, onResolver,
}: { r: Reserva; onDeposito: () => void; onResolver: () => void }) {
  const validarIngreso = useMutation(api.guardia.validarIngresoReserva);
  const validarSalida = useMutation(api.guardia.validarSalidaReserva);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sinIngreso = !r.ingresoValidadoAt;
  const enCurso = !!r.ingresoValidadoAt && !r.salidaValidadaAt;
  const depositoPendiente = r.deposito?.estado === "registrado";

  async function accion(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  }

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
                depositoPendiente ? "bg-amber-500/10 text-amber-600"
                  : r.deposito.estado === "devuelto" ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-red-500/10 text-red-600",
              )}>
                Depósito ${r.deposito.monto.toLocaleString("es-CO")} · {depositoPendiente ? "en portería" : r.deposito.estado === "devuelto" ? "devuelto" : "NO devuelto"}
              </span>
            )}
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
          {enCurso && (
            depositoPendiente ? (
              <Button size="sm" variant="outline" onClick={onResolver} disabled={busy}>
                <Wallet className="h-4 w-4" /> Resolver depósito
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => accion(() => validarSalida({ reservaId: r._id }))} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Validar salida
              </Button>
            )
          )}
        </div>
      </div>
    </Card>
  );
}

/* ───────── Registrar depósito (+ valida ingreso) ───────── */
function DepositoModal({ reserva, onClose }: { reserva: Reserva; onClose: () => void }) {
  const registrar = useMutation(api.guardia.registrarDepositoReserva);
  const generarUrl = useMutation(api.guardia.generateUploadUrl);
  const [monto, setMonto] = useState("");
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
      const fotoStorageId = foto ? await subirFoto(() => generarUrl({}), foto) : undefined;
      await registrar({ reservaId: reserva._id, monto: montoNum, observaciones: observaciones || undefined, fotoStorageId });
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

/* ───────── Resolver depósito (+ valida salida) ───────── */
function ResolverModal({
  reserva, deposito, onClose,
}: { reserva: Reserva; deposito: Doc<"guardiaReservaDepositos">; onClose: () => void }) {
  const resolver = useMutation(api.guardia.resolverDepositoReserva);
  const generarUrl = useMutation(api.guardia.generateUploadUrl);
  const [devuelto, setDevuelto] = useState(true);
  const [observaciones, setObservaciones] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valido = devuelto || (observaciones.trim().length > 0 && foto !== null);

  async function confirmar() {
    if (!valido) return;
    setBusy(true); setError(null);
    try {
      const fotoStorageId = foto ? await subirFoto(() => generarUrl({}), foto) : undefined;
      await resolver({ depositoId: deposito._id, devuelto, observaciones: observaciones || undefined, fotoStorageId });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo resolver.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose}
      title="Resolver depósito"
      description={`$${deposito.monto.toLocaleString("es-CO")} · ${reserva.zonaNombre} · Unidad ${reserva.unidadNumero}. Se valida la salida.`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} disabled={!valido || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Resolver y validar salida
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDevuelto(true)}
            className={cn(
              "rounded-xl border p-3 text-sm font-semibold transition-colors",
              devuelto ? "border-emerald-600 bg-emerald-600 text-white" : "border-border text-foreground hover:bg-accent",
            )}
          >
            Devuelto
          </button>
          <button
            onClick={() => setDevuelto(false)}
            className={cn(
              "rounded-xl border p-3 text-sm font-semibold transition-colors",
              !devuelto ? "border-red-600 bg-red-600 text-white" : "border-border text-foreground hover:bg-accent",
            )}
          >
            No devuelto
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Observaciones {!devuelto && <span className="text-red-600">*</span>}
          </label>
          <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder={devuelto ? "Opcional" : "¿Por qué no se devuelve? (daños, faltantes…)"} />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Camera className="h-3.5 w-3.5" /> Foto de evidencia {!devuelto && <span className="text-red-600">*</span>}
          </label>
          <Input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        </div>
        {!devuelto && <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700">Si el depósito NO se devuelve, la observación y la foto son obligatorias.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
