"use client";

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { AlertTriangle, Camera, Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useUploadToS3 } from "@/hooks/use-upload-s3";
import { cop } from "@/lib/utils";

/**
 * Incidentes de una reserva y lo que hacen con el depósito.
 *
 * Lo comparten la caja de la administración y el control de portería. Las
 * cifras NO se calculan aquí: llegan hechas del servidor
 * (`model/depositoReserva.ts`), que es quien liquida. Una segunda cuenta en
 * el navegador podría enseñarle al guarda un saldo distinto del que se
 * registra.
 */

type FilaPorteria = FunctionReturnType<typeof api.guardia.listReservasControl>[number];
export type IncidenteCaja = FilaPorteria["incidentes"][number];
export type LiquidacionCaja = NonNullable<FilaPorteria["liquidacion"]>;
export type MontosLiquidados = NonNullable<FilaPorteria["liquidado"]>;
export type EstadoDepositoCaja = FilaPorteria extends { deposito: infer D }
  ? NonNullable<D> extends { estado: infer E }
    ? E
    : never
  : never;

export const ETIQUETA_ESTADO_DEPOSITO: Record<EstadoDepositoCaja, string> = {
  registrado: "En custodia",
  devuelto: "Devuelto",
  devuelto_parcial: "Devuelto parcial",
  no_devuelto: "Retenido",
};

export function EstadoIncidenteBadge({ incidente }: { incidente: IncidenteCaja }) {
  if (incidente.estado === "pendiente") return <Badge tone="warning">Pendiente de valoración</Badge>;
  if (incidente.estado === "descartado") return <Badge tone="neutral">Descartado</Badge>;
  return <Badge tone="destructive">Valorado {cop(incidente.valor ?? 0)}</Badge>;
}

const fecha = (ms: number) =>
  new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Un incidente con quién lo reportó y quién decidió. `children` = acciones. */
export function IncidenteDetalle({
  incidente,
  children,
}: {
  incidente: IncidenteCaja;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 whitespace-pre-line text-sm text-foreground">{incidente.descripcion}</p>
        <EstadoIncidenteBadge incidente={incidente} />
      </div>
      {incidente.fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {incidente.fotos.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
              <img
                src={f.url}
                alt={f.nombre ?? "Evidencia del incidente"}
                className="h-14 w-14 rounded-lg border border-border object-cover"
              />
            </a>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Reportado por {incidente.reportadoPorNombre} ·{" "}
        {incidente.origen === "porteria" ? "portería" : "administración"} · {fecha(incidente.createdAt)}
      </p>
      {incidente.estado !== "pendiente" && incidente.revisadoPorNombre && (
        <p className="text-[11px] text-muted-foreground">
          {incidente.estado === "descartado" ? "Descartado" : "Valorado"} por {incidente.revisadoPorNombre}
          {incidente.notaRevision ? ` · ${incidente.notaRevision}` : ""}
        </p>
      )}
      {children}
    </div>
  );
}

/** El depósito en custodia: cuánto se descuenta y cuánto se entrega. */
export function DesgloseDeposito({ liquidacion }: { liquidacion: LiquidacionCaja }) {
  const l = liquidacion;
  return (
    <div className="space-y-2">
      <dl className="space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
        <Linea etiqueta="Depósito recibido" valor={cop(l.deposito)} />
        {l.valorados > 0 && (
          <Linea
            etiqueta={`Incidentes valorados (${l.valorados})`}
            valor={cop(l.totalIncidentes)}
          />
        )}
        <Linea etiqueta="Descuento aplicado" valor={l.totalDescuento > 0 ? `− ${cop(l.totalDescuento)}` : cop(0)} />
        <div className="border-t border-border pt-1">
          <Linea etiqueta="Saldo a devolver" valor={cop(l.saldoDevolucion)} fuerte />
        </div>
      </dl>
      {l.excedenteNoCubierto > 0 && (
        <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
          Los incidentes superan el depósito en {cop(l.excedenteNoCubierto)}. Esa diferencia no se
          registra en el sistema: se resuelve por fuera.
        </p>
      )}
      {l.pendientes > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {l.pendientes === 1
            ? "Hay un incidente pendiente de valoración."
            : `Hay ${l.pendientes} incidentes pendientes de valoración.`}{" "}
          El depósito no se puede devolver hasta que la administración los valore o descarte.
        </p>
      )}
    </div>
  );
}

function Linea({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={fuerte ? "font-medium text-foreground" : "text-muted-foreground"}>{etiqueta}</dt>
      <dd className={fuerte ? "font-semibold text-foreground" : "text-foreground"}>{valor}</dd>
    </div>
  );
}

/**
 * Formulario de incidente.
 *
 * `conValor` solo en oficina. En portería el campo no existe —y el endpoint
 * del guarda tampoco lo acepta—: el guarda describe, la administración valora.
 */
export function FormularioIncidente({
  conValor,
  carpeta,
  onGuardar,
  onCancelar,
}: {
  conValor: boolean;
  carpeta: string;
  onGuardar: (datos: {
    descripcion: string;
    valor?: number;
    fotos?: { url: string; nombre?: string }[];
  }) => Promise<unknown>;
  onCancelar: () => void;
}) {
  const uploadFile = useUploadToS3();
  const [descripcion, setDescripcion] = useState("");
  const [valor, setValor] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valorNum = Number(valor);
  const valorValido = !valor || (Number.isFinite(valorNum) && valorNum > 0);
  const valido = descripcion.trim().length > 0 && valorValido;

  async function guardar() {
    if (!valido) return;
    setBusy(true);
    setError(null);
    try {
      let fotos: { url: string; nombre?: string }[] | undefined;
      if (foto) {
        const subida = await uploadFile(foto, carpeta);
        fotos = [{ url: subida.url, nombre: foto.name }];
      }
      await onGuardar({
        descripcion: descripcion.trim(),
        valor: conValor && valor ? valorNum : undefined,
        fotos,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el incidente.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground">Descripción *</label>
        <Textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={3}
          placeholder="Se rompió una silla, quedó una mancha en el piso…"
        />
      </div>
      {conValor && (
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Valor (COP) <span className="text-muted-foreground">(opcional: sin valor queda pendiente)</span>
          </label>
          <Input
            type="number"
            min={1}
            step={1}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Camera className="h-3.5 w-3.5" /> Foto (opcional)
        </label>
        <Input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
        />
      </div>
      {!conValor && (
        <p className="text-[11px] text-muted-foreground">
          La administración revisará el incidente y decidirá cuánto descontar del depósito.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancelar} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={!valido || busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {conValor ? "Registrar incidente" : "Reportar incidente"}
        </Button>
      </div>
    </div>
  );
}
