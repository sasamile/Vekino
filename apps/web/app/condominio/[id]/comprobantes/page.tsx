"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import {
  ReceiptText, FileText, Loader2, Check, X, Link2,
  MessageCircle, Smartphone, ExternalLink, Search,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, cop } from "@/lib/utils";

type EstadoSoporte = "pendiente_revision" | "aprobado" | "rechazado";
type EstadoFactura = "pendiente" | "pagada" | "vencida" | "abonada" | "saldo_a_favor";

type SoporteRow = {
  _id: Id<"soportesPago">;
  url: string;
  mimeType?: string;
  nota?: string;
  telefono?: string;
  origen: "whatsapp" | "web" | "app";
  estado: EstadoSoporte;
  createdAt: number;
  revisadoPorNombre?: string;
  revisadoAt?: number;
  notaRevision?: string;
  unidadNumero: string | null;
  unidadTorre: string | null;
  facturaNumero: string | null;
  facturaPeriodo: string | null;
  facturaTotal: number | null;
  facturaEstado: string | null;
  userNombre: string | null;
};

const TABS: { value: EstadoSoporte; label: string }[] = [
  { value: "pendiente_revision", label: "Pendientes" },
  { value: "aprobado", label: "Aprobados" },
  { value: "rechazado", label: "Rechazados" },
];

const ESTADO_META: Record<EstadoSoporte, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  pendiente_revision: { label: "Pendiente de revisión", tone: "warning" },
  aprobado: { label: "Aprobado", tone: "success" },
  rechazado: { label: "Rechazado", tone: "destructive" },
};

const FACTURA_ESTADO_META: Record<EstadoFactura, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  pendiente: { label: "Pendiente", tone: "warning" },
  pagada: { label: "Pagada", tone: "success" },
  vencida: { label: "Vencida", tone: "destructive" },
  abonada: { label: "Abonada", tone: "info" },
  saldo_a_favor: { label: "Saldo a favor", tone: "primary" },
};

const EMPTY_COPY: Record<EstadoSoporte, { title: string; description: string }> = {
  pendiente_revision: {
    title: "Sin comprobantes pendientes",
    description: "Cuando un residente envíe un soporte de pago por WhatsApp aparecerá aquí para su revisión.",
  },
  aprobado: {
    title: "Sin comprobantes aprobados",
    description: "Aún no has aprobado ningún comprobante de pago.",
  },
  rechazado: {
    title: "Sin comprobantes rechazados",
    description: "Aún no has rechazado ningún comprobante de pago.",
  },
};

function fmtFecha(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Hoy ${time}`;
  return (
    d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) +
    " " +
    time
  );
}

function unidadLabel(s: SoporteRow) {
  if (!s.unidadNumero) return null;
  return s.unidadTorre ? `Torre ${s.unidadTorre} · Unidad ${s.unidadNumero}` : `Unidad ${s.unidadNumero}`;
}

export default function ComprobantesPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;

  const [tab, setTab] = useState<EstadoSoporte>("pendiente_revision");
  const [preview, setPreview] = useState<SoporteRow | null>(null);
  const [aprobarTarget, setAprobarTarget] = useState<SoporteRow | null>(null);
  const [rechazarTarget, setRechazarTarget] = useState<SoporteRow | null>(null);
  const [vincularTarget, setVincularTarget] = useState<SoporteRow | null>(null);

  const soportes = useQuery(api.soportesPago.listByCondominio, { condominioId, estado: tab });
  const pendientes = useQuery(api.soportesPago.countPendientes, { condominioId });

  const loading = soportes === undefined;
  const items = (soportes ?? []) as SoporteRow[];

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Comprobantes de pago"
          description="Soportes enviados por los residentes (foto o PDF vía WhatsApp) para revisión de la administración"
        />

        <div className="inline-flex items-center gap-1 self-start rounded-full bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                tab === t.value
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.value === "pendiente_revision" && (pendientes ?? 0) > 0 && (
                <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-amber-500/15 px-1 text-[10.5px] font-semibold text-amber-700 dark:text-amber-400">
                  {pendientes}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={EMPTY_COPY[tab].title}
            description={EMPTY_COPY[tab].description}
          />
        ) : (
          <div className="space-y-2.5">
            {items.map((s) => (
              <SoporteCard
                key={s._id}
                s={s}
                onPreview={() => setPreview(s)}
                onAprobar={() => setAprobarTarget(s)}
                onRechazar={() => setRechazarTarget(s)}
                onVincular={() => setVincularTarget(s)}
              />
            ))}
          </div>
        )}
      </div>

      {preview && <PreviewModal s={preview} onClose={() => setPreview(null)} />}
      {aprobarTarget && <AprobarModal s={aprobarTarget} onClose={() => setAprobarTarget(null)} />}
      {rechazarTarget && <RechazarModal s={rechazarTarget} onClose={() => setRechazarTarget(null)} />}
      {vincularTarget && (
        <VincularFacturaModal
          s={vincularTarget}
          condominioId={condominioId}
          onClose={() => setVincularTarget(null)}
        />
      )}
    </PageContainer>
  );
}

function SoporteCard({
  s,
  onPreview,
  onAprobar,
  onRechazar,
  onVincular,
}: {
  s: SoporteRow;
  onPreview: () => void;
  onAprobar: () => void;
  onRechazar: () => void;
  onVincular: () => void;
}) {
  const esImagen = s.mimeType?.startsWith("image/") ?? false;
  const pendiente = s.estado === "pendiente_revision";
  const unidad = unidadLabel(s);
  const facturaMeta = s.facturaEstado
    ? FACTURA_ESTADO_META[s.facturaEstado as EstadoFactura]
    : null;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Miniatura / archivo */}
        {esImagen ? (
          <button
            type="button"
            onClick={onPreview}
            className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl ring-1 ring-border transition-opacity hover:opacity-90"
            aria-label="Ver comprobante"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.url} alt="Comprobante de pago" className="h-full w-full object-cover" />
          </button>
        ) : (
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <FileText className="h-6 w-6" aria-hidden />
            <span className="text-[11px] font-medium">Ver PDF</span>
          </a>
        )}

        {/* Detalle */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {unidad ?? "Sin unidad identificada"}
            </span>
            {s.origen === "whatsapp" && (
              <Badge tone="success"><MessageCircle className="h-3 w-3" />WhatsApp</Badge>
            )}
            {s.origen === "app" && (
              <Badge tone="info"><Smartphone className="h-3 w-3" />App</Badge>
            )}
            {!pendiente && (
              <Badge tone={ESTADO_META[s.estado].tone}>{ESTADO_META[s.estado].label}</Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {[s.userNombre, s.telefono, fmtFecha(s.createdAt)].filter(Boolean).join(" · ")}
          </p>

          {/* Factura vinculada */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-xs">
            {s.facturaNumero ? (
              <>
                <span className="font-medium text-foreground">Factura {s.facturaNumero}</span>
                {s.facturaPeriodo && <span className="text-muted-foreground">{s.facturaPeriodo}</span>}
                {s.facturaTotal != null && (
                  <span className="font-medium tabular-nums text-foreground">{cop(s.facturaTotal)}</span>
                )}
                {facturaMeta && <Badge tone={facturaMeta.tone}>{facturaMeta.label}</Badge>}
              </>
            ) : (
              <span className="text-muted-foreground">Sin factura vinculada</span>
            )}
            {pendiente && (
              <button
                type="button"
                onClick={onVincular}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-brand transition-colors hover:bg-brand/10"
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                {s.facturaNumero ? "Cambiar" : "Vincular"}
              </button>
            )}
          </div>

          {s.nota && (
            <p className="text-sm text-muted-foreground">
              <span className="text-xs font-medium text-foreground">Nota del residente: </span>
              “{s.nota}”
            </p>
          )}

          {/* Info de revisión */}
          {!pendiente && (
            <div className="text-xs text-muted-foreground">
              <p>
                {s.estado === "aprobado" ? "Aprobado" : "Rechazado"} por{" "}
                <span className="font-medium text-foreground">{s.revisadoPorNombre ?? "—"}</span>
                {s.revisadoAt ? ` · ${fmtFecha(s.revisadoAt)}` : ""}
              </p>
              {s.notaRevision && (
                <p className="mt-1 rounded-lg bg-muted/40 px-2.5 py-1.5">“{s.notaRevision}”</p>
              )}
            </div>
          )}
        </div>

        {/* Acciones */}
        {pendiente && (
          <div className="flex shrink-0 gap-2 sm:flex-col">
            <Button size="sm" onClick={onAprobar}>
              <Check className="h-4 w-4" aria-hidden />
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onRechazar}
              className="text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
            >
              <X className="h-4 w-4" aria-hidden />
              Rechazar
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function PreviewModal({ s, onClose }: { s: SoporteRow; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Comprobante de pago"
      description={unidadLabel(s) ?? s.userNombre ?? s.telefono ?? undefined}
      className="max-w-2xl"
      footer={
        <>
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="mr-auto inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Abrir original
          </a>
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
        </>
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={s.url}
        alt="Comprobante de pago"
        className="mx-auto max-h-[65dvh] w-auto rounded-xl ring-1 ring-border"
      />
    </Modal>
  );
}

function AprobarModal({ s, onClose }: { s: SoporteRow; onClose: () => void }) {
  const aprobar = useMutation(api.soportesPago.aprobar);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setBusy(true);
    setError(null);
    try {
      await aprobar({ id: s._id, notaRevision: nota.trim() || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al aprobar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Aprobar comprobante"
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <Check className="h-4 w-4" aria-hidden />
            Aprobar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {s.facturaNumero ? (
          <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-foreground">
            Al aprobar, la factura <span className="font-medium">{s.facturaNumero}</span>
            {s.facturaPeriodo ? ` (${s.facturaPeriodo})` : ""}
            {s.facturaTotal != null ? ` por ${cop(s.facturaTotal)}` : ""} se marcará como{" "}
            <span className="font-medium">pagada</span>.
          </p>
        ) : (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-foreground">
            Este comprobante no tiene factura vinculada: quedará aprobado pero{" "}
            <span className="font-medium">ninguna factura se marcará como pagada</span>.
          </p>
        )}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Nota <span className="text-muted-foreground">(opcional)</span>
          </label>
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder="Ej. Transferencia verificada en el extracto"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function RechazarModal({ s, onClose }: { s: SoporteRow; onClose: () => void }) {
  const rechazar = useMutation(api.soportesPago.rechazar);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setBusy(true);
    setError(null);
    try {
      await rechazar({ id: s._id, notaRevision: nota.trim() || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al rechazar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Rechazar comprobante"
      description={unidadLabel(s) ?? undefined}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={confirmar} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <X className="h-4 w-4" aria-hidden />
            Rechazar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          El comprobante quedará marcado como rechazado. La nota le servirá a la administración
          para recordar el motivo.
        </p>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Motivo <span className="text-muted-foreground">(opcional)</span>
          </label>
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            placeholder="Ej. La imagen no corresponde a un pago de este período"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

type FacturaRow = {
  _id: Id<"facturas">;
  numeroFactura: string;
  periodoLabel: string;
  residenteNombre: string;
  apto?: string;
  totalAPagar: number;
  estado: EstadoFactura;
};

const PAGE_SIZE_FACTURAS = 30;

function VincularFacturaModal({
  s,
  condominioId,
  onClose,
}: {
  s: SoporteRow;
  condominioId: Id<"condominios">;
  onClose: () => void;
}) {
  const vincular = useMutation(api.soportesPago.vincularFactura);
  const periodos = useQuery(api.facturas.listPeriodos, { condominioId });
  const [periodo, setPeriodo] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodoActivo = periodo || periodos?.[0] || "";

  const { results, status, loadMore } = usePaginatedQuery(
    api.facturas.listPage,
    periodoActivo
      ? { condominioId, periodo: periodoActivo, q: q.trim() || undefined }
      : "skip",
    { initialNumItems: PAGE_SIZE_FACTURAS },
  );

  const facturas = results as FacturaRow[];
  const cargando = !periodoActivo ? periodos === undefined : status === "LoadingFirstPage";

  async function seleccionar(facturaId: Id<"facturas">) {
    setBusy(true);
    setError(null);
    try {
      await vincular({ id: s._id, facturaId });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al vincular la factura.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Vincular factura"
      description={
        s.facturaNumero
          ? `Actualmente vinculado a ${s.facturaNumero}. Selecciona la factura correcta.`
          : "Selecciona la factura a la que corresponde este comprobante."
      }
      className="max-w-xl"
      footer={<Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>}
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={periodoActivo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="sm:w-40"
            disabled={!periodos?.length}
          >
            {(periodos ?? []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por residente, unidad o número…"
              className="pl-9"
            />
          </div>
        </div>

        {cargando ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : periodos && periodos.length === 0 ? (
          <p className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
            Este condominio aún no tiene facturas cargadas.
          </p>
        ) : facturas.length === 0 ? (
          <p className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
            Ninguna factura coincide con la búsqueda en este período.
          </p>
        ) : (
          <div className="space-y-1.5">
            {facturas.map((f) => {
              const meta = FACTURA_ESTADO_META[f.estado] ?? FACTURA_ESTADO_META.pendiente;
              return (
                <button
                  key={f._id}
                  type="button"
                  disabled={busy}
                  onClick={() => seleccionar(f._id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {f.residenteNombre}
                      {f.apto ? ` · ${f.apto}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {f.numeroFactura} · {f.periodoLabel}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {cop(f.totalAPagar)}
                  </span>
                  <Badge tone={meta.tone} className="shrink-0">{meta.label}</Badge>
                </button>
              );
            })}
            {(status === "CanLoadMore" || status === "LoadingMore") && (
              <div className="flex justify-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={status === "LoadingMore" || busy}
                  onClick={() => loadMore(PAGE_SIZE_FACTURAS)}
                >
                  {status === "LoadingMore" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Cargando…</>
                  ) : (
                    "Cargar más"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
