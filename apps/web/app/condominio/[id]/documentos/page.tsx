"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  FolderOpen, Plus, Trash2, Loader2, Download,
  FileText, FileImage, FileSpreadsheet, File,
  Paperclip,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Select, Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Categoria = "reglamento" | "acta" | "contrato" | "comunicado" | "financiero" | "otro";

const CAT_META: Record<Categoria, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  reglamento: { label: "Reglamento",  tone: "primary" },
  acta:       { label: "Acta",        tone: "info" },
  contrato:   { label: "Contrato",    tone: "warning" },
  comunicado: { label: "Comunicado",  tone: "neutral" },
  financiero: { label: "Financiero",  tone: "success" },
  otro:       { label: "Otro",        tone: "neutral" },
};

function getFileIcon(mimeType: string): LucideIcon {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  if (mimeType === "application/pdf" || mimeType.includes("word")) return FileText;
  return File;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtFecha(ts: number) {
  return new Date(ts).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

type DocRow = NonNullable<ReturnType<typeof useQuery<typeof api.documentos.listByCondominio>>>[number];

export default function DocumentosPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const documentos = useQuery(api.documentos.listByCondominio, { condominioId });

  const [catFiltro, setCatFiltro] = useState<"" | Categoria>("");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Id<"documentos"> | null>(null);

  const filtered = (documentos ?? []).filter((d) => !catFiltro || d.categoria === catFiltro);

  const total = documentos?.length ?? 0;
  const reglamentos = documentos?.filter((d) => d.categoria === "reglamento").length ?? 0;
  const actas = documentos?.filter((d) => d.categoria === "acta").length ?? 0;
  const financieros = documentos?.filter((d) => d.categoria === "financiero").length ?? 0;

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Documentos"
          description="Repositorio de documentos del conjunto"
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Subir documento
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={FolderOpen} label="Total documentos" value={total} tone="neutral" />
          <StatCard icon={FileText} label="Reglamentos" value={reglamentos} tone="primary" />
          <StatCard icon={FileText} label="Actas" value={actas} tone="brand" />
          <StatCard icon={FileSpreadsheet} label="Financieros" value={financieros} tone="success" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {documentos === undefined ? "Cargando…" : `${filtered.length} documento${filtered.length === 1 ? "" : "s"}`}
          </p>
          <Select value={catFiltro} onChange={(e) => setCatFiltro(e.target.value as "" | Categoria)} className="sm:w-44">
            <option value="">Todas las categorías</option>
            {(Object.keys(CAT_META) as Categoria[]).map((c) => (
              <option key={c} value={c}>{CAT_META[c].label}</option>
            ))}
          </Select>
        </div>

        {documentos === undefined ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={catFiltro ? "Sin resultados" : "Sin documentos"}
            description={catFiltro ? "Ningún documento en esta categoría." : "Sube el primer documento del conjunto."}
            action={
              catFiltro ? (
                <Button variant="outline" size="sm" onClick={() => setCatFiltro("")}>Limpiar filtro</Button>
              ) : (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" />Subir documento
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((d) => <DocCard key={d._id} doc={d} onDelete={() => setDeleteTarget(d._id)} />)}
          </div>
        )}
      </div>

      {formOpen && <UploadForm condominioId={condominioId} onClose={() => setFormOpen(false)} />}
      {deleteTarget && <DeleteDialog id={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </PageContainer>
  );
}

function DocCard({ doc, onDelete }: { doc: DocRow; onDelete: () => void }) {
  const Icon = getFileIcon(doc.mimeType);
  const meta = CAT_META[doc.categoria as Categoria] ?? CAT_META.otro;

  return (
    <Card className="group flex flex-col gap-3 p-4 transition-colors hover:border-border/60">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Descargar"
            download={doc.nombre}
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            onClick={onDelete}
            aria-label="Eliminar"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-foreground leading-tight">{doc.nombre}</p>
        {doc.descripcion && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{doc.descripcion}</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <span className="text-xs text-muted-foreground">{fmtSize(doc.tamanio)}</span>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
        <span>{doc.autorNombre}</span>
        <span>{fmtFecha(doc.createdAt)}</span>
      </div>
    </Card>
  );
}

function UploadForm({ condominioId, onClose }: { condominioId: Id<"condominios">; onClose: () => void }) {
  const generateUploadUrl = useMutation(api.documentos.generateUploadUrl);
  const create = useMutation(api.documentos.create);

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("otro");
  const [descripcion, setDescripcion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_SIZE) { setError("El archivo supera el límite de 50 MB."); return; }
    setFile(f);
    if (!nombre) setNombre(f.name.replace(/\.[^.]+$/, ""));
    setError(null);
  }

  const valid = file !== null && nombre.trim().length > 0;

  async function save() {
    if (!valid || !file) return;
    setBusy(true);
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Error al subir el archivo.");
      const { storageId } = (await res.json()) as { storageId: string };
      await create({
        condominioId,
        nombre: nombre.trim(),
        categoria,
        storageId: storageId as Id<"_storage">,
        mimeType: file.type,
        tamanio: file.size,
        descripcion: descripcion || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Subir documento"
      description="Agrega un documento al repositorio del conjunto"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Subir
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Zona de archivo */}
        <div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,.txt,.csv"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                {(() => { const Icon = getFileIcon(file.type); return <Icon className="h-5 w-5 text-brand" />; })()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{fmtSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Quitar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-sm text-muted-foreground transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
            >
              <Paperclip className="h-8 w-8 opacity-50" />
              <span className="font-medium">Seleccionar archivo</span>
              <span className="text-xs">PDF, Word, Excel, imágenes — máx 50 MB</span>
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Nombre del documento</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Reglamento interno 2026" />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Categoría</label>
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
            {(Object.keys(CAT_META) as Categoria[]).map((c) => (
              <option key={c} value={c}>{CAT_META[c].label}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Descripción <span className="text-muted-foreground">(opcional)</span>
          </label>
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Breve descripción del documento…" rows={2} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function DeleteDialog({ id, onClose }: { id: Id<"documentos">; onClose: () => void }) {
  const remove = useMutation(api.documentos.remove);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try { await remove({ id }); onClose(); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Eliminar documento" className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Eliminar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">El documento y su archivo se eliminarán permanentemente.</p>
    </Modal>
  );
}
