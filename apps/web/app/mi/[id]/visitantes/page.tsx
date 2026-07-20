"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { UserCheck, Plus, X, Loader2, QrCode, Trash2, Car } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { fechaLarga } from "@/components/portal/portal-ui";
import { cn } from "@/lib/utils";

const TIPO_DOC = [
  { value: "CC", label: "Cédula (CC)" },
  { value: "CE", label: "Cédula extranjería (CE)" },
  { value: "NIT", label: "NIT" },
  { value: "PASAPORTE", label: "Pasaporte" },
  { value: "OTRO", label: "Otro" },
] as const;
const TIPO_VIS = [
  { value: "visitante", label: "Visitante" },
  { value: "empresa", label: "Empresa" },
  { value: "domicilio", label: "Domicilio" },
] as const;

const ESTADO_META: Record<string, { label: string; tone: "warning" | "success" | "neutral" }> = {
  pendiente: { label: "Pendiente", tone: "warning" },
  activo: { label: "Adentro", tone: "success" },
  finalizado: { label: "Finalizado", tone: "neutral" },
};

type TipoDoc = (typeof TIPO_DOC)[number]["value"];
type TipoVis = (typeof TIPO_VIS)[number]["value"];

function qrUrl(id: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(id)}`;
}

export default function Visitantes() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;
  const home = useQuery(api.portal.home, { condominioId });
  const visitantes = useQuery(api.visitantes.listMios, { condominioId });
  const [formOpen, setFormOpen] = useState(false);
  const [qrId, setQrId] = useState<Id<"visitantes"> | null>(null);

  const unidades = home && home.allowed ? home.unidades : [];

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <UserCheck className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Visitantes
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Autoriza a tus visitantes y muéstrale el QR a la portería.
            </p>
          </div>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90"
        >
          <Plus className="h-4 w-4" />
          Autorizar visitante
        </button>
      </div>

      {visitantes === undefined ? (
        <Card className="p-12">
          <Spinner className="mx-auto h-5 w-5" />
        </Card>
      ) : visitantes.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="Sin visitantes autorizados"
          description="Autoriza a tu primer visitante y genérale un código QR para el ingreso."
        />
      ) : (
        <div className="space-y-3">
          {visitantes.map((vis) => {
            const estado = ESTADO_META[vis.estado];
            const tipoVis = TIPO_VIS.find((t) => t.value === vis.tipo)?.label ?? vis.tipo;
            return (
              <Card key={vis._id} className="flex flex-wrap items-center gap-4 p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{vis.nombre}</p>
                    {estado && <Badge tone={estado.tone}>{estado.label}</Badge>}
                    {vis.qrInvalidado && <Badge tone="neutral">QR usado</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {vis.tipoDocumento} {vis.documento} · {tipoVis}
                    {vis.placa ? (
                      <span className="inline-flex items-center gap-1">
                        {" · "}
                        <Car className="h-3.5 w-3.5" />
                        {vis.placa}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {vis.fechaVisitaInicio ? `Visita: ${fechaLarga(vis.fechaVisitaInicio)}` : ""}
                    {vis.fechaIngreso ? ` · Ingresó ${fechaLarga(vis.fechaIngreso)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setQrId(vis._id)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <QrCode className="h-4 w-4" />
                    QR
                  </button>
                  <BorrarBtn id={vis._id} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {formOpen && (
        <VisitanteForm
          condominioId={condominioId}
          unidades={unidades}
          onClose={() => setFormOpen(false)}
          onCreated={(newId) => {
            setFormOpen(false);
            setQrId(newId);
          }}
        />
      )}
      {qrId && <QrModal id={qrId} onClose={() => setQrId(null)} />}
    </div>
  );
}

function BorrarBtn({ id }: { id: Id<"visitantes"> }) {
  const remove = useMutation(api.visitantes.removeMio);
  const [busy, setBusy] = useState(false);
  async function borrar() {
    if (!confirm("¿Eliminar esta autorización?")) return;
    setBusy(true);
    try {
      await remove({ id });
    } catch {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={borrar}
      disabled={busy}
      aria-label="Eliminar"
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/20"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

function QrModal({ id, onClose }: { id: Id<"visitantes">; onClose: () => void }) {
  const vis = useQuery(api.visitantes.getMio, { id });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-scale-in relative z-10 w-full max-w-xs rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-base font-semibold text-foreground">Código de ingreso</h2>
        {vis === undefined ? (
          <div className="py-16">
            <Spinner className="mx-auto h-5 w-5" />
          </div>
        ) : vis === null ? (
          <p className="py-8 text-sm text-muted-foreground">No disponible.</p>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl(vis._id)}
              alt="Código QR del visitante"
              className="mx-auto mt-4 h-56 w-56 rounded-xl border border-border bg-white p-2"
            />
            <p className="mt-3 font-semibold text-foreground">{vis.nombre}</p>
            <p className="text-sm text-muted-foreground">
              {vis.tipoDocumento} {vis.documento}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Muéstrale este QR al guardia para tu ingreso.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function VisitanteForm({
  condominioId,
  unidades,
  onClose,
  onCreated,
}: {
  condominioId: Id<"condominios">;
  unidades: { _id: string; numero: string }[];
  onClose: () => void;
  onCreated: (id: Id<"visitantes">) => void;
}) {
  const crear = useMutation(api.visitantes.crearMio);
  const hoy = new Date().toISOString().slice(0, 10);
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState<TipoDoc>("CC");
  const [tipo, setTipo] = useState<TipoVis>("visitante");
  const [placa, setPlaca] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [unidadId, setUnidadId] = useState(unidades[0]?._id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError("El nombre es obligatorio.");
    if (!documento.trim()) return setError("El documento es obligatorio.");
    if (!unidadId) return setError("Selecciona una unidad.");
    setBusy(true);
    try {
      const [y, m, d] = fecha.split("-").map(Number);
      const inicio = y && m && d ? Date.UTC(y, m - 1, d, 12) : undefined;
      const newId = await crear({
        condominioId,
        unidadId: unidadId as Id<"unidades">,
        nombre,
        documento,
        tipoDocumento,
        tipo,
        placa: placa.trim() || undefined,
        fechaVisitaInicio: inicio,
      });
      onCreated(newId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo autorizar.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-slide-up relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-card p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Autorizar visitante</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={guardar} className="space-y-4">
          <Field label="Nombre completo">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del visitante" className={inputCls} autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo doc.">
              <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as TipoDoc)} className={inputCls}>
                {TIPO_DOC.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Documento">
              <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Número" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoVis)} className={inputCls}>
                {TIPO_VIS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Placa (opcional)">
              <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC123" className={inputCls} />
            </Field>
          </div>

          <Field label="Fecha de visita">
            <input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          </Field>

          {unidades.length > 1 && (
            <Field label="Unidad">
              <select value={unidadId} onChange={(e) => setUnidadId(e.target.value)} className={inputCls}>
                {unidades.map((u) => (
                  <option key={u._id} value={u._id}>Unidad {u.numero}</option>
                ))}
              </select>
            </Field>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Autorizar y generar QR
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
