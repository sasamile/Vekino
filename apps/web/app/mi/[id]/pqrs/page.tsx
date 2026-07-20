"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { MessageSquareWarning, Plus, CheckCircle2, Trash2, Loader2 } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { fechaLarga } from "@/components/portal/portal-ui";
import { cn } from "@/lib/utils";

const TIPO_LABEL: Record<string, string> = {
  peticion: "Petición",
  queja: "Queja",
  reclamo: "Reclamo",
  sugerencia: "Sugerencia",
  felicitacion: "Felicitación",
};

const ESTADO_META: Record<string, { label: string; tone: "warning" | "info" | "success" | "neutral" }> = {
  abierto: { label: "Abierto", tone: "warning" },
  en_gestion: { label: "En gestión", tone: "info" },
  resuelto: { label: "Resuelto", tone: "success" },
  cerrado: { label: "Cerrado", tone: "neutral" },
};

export default function MisPqrs() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;

  const home = useQuery(api.portal.home, { condominioId });
  const todas = useQuery(api.pqrs.listByCondominio, { condominioId });
  const [openForm, setOpenForm] = useState(false);

  const mias =
    home?.allowed && todas
      ? todas.filter((p) => p.solicitanteUserId === home.userId)
      : undefined;

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="PQRS"
        description="Peticiones, quejas, reclamos y sugerencias que has enviado."
        action={
          <Button variant="brand" onClick={() => setOpenForm(true)}>
            <Plus className="h-4 w-4" />
            Nueva solicitud
          </Button>
        }
      />

      {todas === undefined || home === undefined ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-5 w-5" />
        </div>
      ) : !mias || mias.length === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="No has enviado solicitudes"
          description="Crea una petición, queja, reclamo o sugerencia y la administración te responderá."
          action={
            <Button variant="brand" onClick={() => setOpenForm(true)}>
              <Plus className="h-4 w-4" />
              Nueva solicitud
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {mias.map((p) => (
            <PqrsCard key={p._id} p={p} />
          ))}
        </div>
      )}

      <NuevaSolicitud
        open={openForm}
        onClose={() => setOpenForm(false)}
        condominioId={condominioId}
        unidadNumero={home?.allowed ? home.unidades[0]?.numero : undefined}
      />
    </PageContainer>
  );
}

type PqrsItem = {
  _id: Id<"pqrs">;
  radicado: string;
  tipo: string;
  asunto: string;
  descripcion: string;
  estado: string;
  createdAt: number;
  updatedAt: number;
  respuesta?: string;
  respondidoPor?: string;
  mensajes?: { autorNombre: string; esAdmin: boolean; texto: string; createdAt: number }[];
};

function PqrsCard({ p }: { p: PqrsItem }) {
  const comentar = useMutation(api.pqrs.comentar);
  const remove = useMutation(api.pqrs.removeMio);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const estado = ESTADO_META[p.estado];

  async function eliminar() {
    if (!confirm(`¿Eliminar la solicitud ${p.radicado}?`)) return;
    setBorrando(true);
    try {
      await remove({ id: p._id });
    } catch {
      setBorrando(false);
    }
  }

  const hilo =
    p.mensajes && p.mensajes.length > 0
      ? p.mensajes
      : p.respuesta
        ? [{ autorNombre: p.respondidoPor ?? "Administración", esAdmin: true, texto: p.respuesta, createdAt: p.updatedAt }]
        : [];

  async function enviar() {
    if (!texto.trim()) return;
    setBusy(true);
    try {
      await comentar({ id: p._id, texto });
      setTexto("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{TIPO_LABEL[p.tipo] ?? p.tipo}</Badge>
        {estado && <Badge tone={estado.tone}>{estado.label}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{p.radicado}</span>
        <button
          onClick={eliminar}
          disabled={borrando}
          aria-label="Eliminar solicitud"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/20"
        >
          {borrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>

      <h3 className="mt-3 text-lg font-semibold text-foreground">{p.asunto}</h3>
      <p className="mt-1 whitespace-pre-line text-sm text-foreground/90">{p.descripcion}</p>
      <p className="mt-3 text-xs text-muted-foreground">Enviado el {fechaLarga(p.createdAt)}</p>

      {/* Hilo de conversación */}
      {hilo.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {hilo.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl border p-3",
                m.esAdmin
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-border bg-muted/30",
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {m.esAdmin ? (
                  <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Administración
                  </span>
                ) : (
                  <span className="text-foreground">Tú</span>
                )}
                <span className="text-muted-foreground">· {fechaLarga(m.createdAt)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-line text-sm text-foreground/90">{m.texto}</p>
            </div>
          ))}
        </div>
      )}

      {/* Responder */}
      <div className="mt-3 space-y-2">
        <Textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un mensaje…"
        />
        <div className="flex justify-end">
          <Button variant="brand" size="sm" onClick={enviar} disabled={busy || !texto.trim()}>
            {busy ? <Spinner className="h-4 w-4 text-brand-foreground" /> : "Responder"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function NuevaSolicitud({
  open,
  onClose,
  condominioId,
  unidadNumero,
}: {
  open: boolean;
  onClose: () => void;
  condominioId: Id<"condominios">;
  unidadNumero?: string;
}) {
  const crear = useMutation(api.pqrs.create);
  const [tipo, setTipo] = useState("peticion");
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!asunto.trim() || !descripcion.trim()) {
      setError("Escribe un asunto y una descripción.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await crear({
        condominioId,
        tipo: tipo as "peticion" | "queja" | "reclamo" | "sugerencia" | "felicitacion",
        asunto: asunto.trim(),
        descripcion: descripcion.trim(),
        unidadNumero,
      });
      setAsunto("");
      setDescripcion("");
      setTipo("peticion");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva solicitud"
      description="Cuéntanos tu petición, queja, reclamo o sugerencia."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="brand" onClick={submit} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4 text-brand-foreground" /> : "Enviar"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Tipo</label>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(TIPO_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Asunto</label>
          <Input
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            placeholder="Ej: Daño en la luz del parqueadero"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Descripción
          </label>
          <Textarea
            rows={5}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Describe con detalle tu solicitud…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </Modal>
  );
}
