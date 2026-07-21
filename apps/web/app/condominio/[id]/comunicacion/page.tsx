"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  MessageSquare, Plus, Pin, PinOff, Pencil, Trash2, Loader2,
  File as FileIcon, ImageIcon,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { SearchInput, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ComunicadoForm, type ComunicadoDraft } from "@/components/comunicacion/comunicado-form";
import { initials, cn } from "@/lib/utils";

const AUDIENCIA_LABEL: Record<string, string> = {
  todos: "Todos", propietario: "Propietarios", arrendatario: "Arrendatarios",
  residente: "Residentes", junta_directiva: "Junta directiva", guardia: "Seguridad / portería",
};
const PRIORIDAD_LABEL: Record<string, string> = {
  normal: "Normal", importante: "Importante", urgente: "Urgente",
};
const PRIORIDAD_TONE: Record<string, React.ComponentProps<typeof Badge>["tone"]> = {
  normal: "neutral", importante: "warning", urgente: "destructive",
};

function fmtFecha(ts: number) {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < day && new Date().getDate() === d.getDate()) return "Hoy";
  if (diff < 2 * day) return "Ayer";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

type ComunicadoRow = NonNullable<ReturnType<typeof useQuery<typeof api.comunicados.listByCondominio>>>[number];

export default function ComunicacionPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const comunicados = useQuery(api.comunicados.listByCondominio, { condominioId });

  const [search, setSearch] = useState("");
  const [prioridad, setPrioridad] = useState<"" | "normal" | "importante" | "urgente">("");
  const [formOpen, setFormOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<ComunicadoDraft | null>(null);
  const [deleteId, setDeleteId] = useState<Id<"comunicados"> | null>(null);

  const term = search.trim().toLowerCase();
  const filtered = (comunicados ?? []).filter((c) => {
    if (prioridad && c.prioridad !== prioridad) return false;
    if (!term) return true;
    return (
      c.titulo.toLowerCase().includes(term) ||
      c.cuerpo.toLowerCase().includes(term) ||
      c.autorNombre.toLowerCase().includes(term)
    );
  });

  const hasFilters = Boolean(term || prioridad);

  function openNew() {
    setEditDraft(null);
    setFormOpen(true);
  }
  function openEdit(c: ComunicadoRow) {
    setEditDraft({
      id: c._id,
      titulo: c.titulo,
      cuerpo: c.cuerpo,
      audiencia: c.audiencia,
      prioridad: c.prioridad,
      fijado: c.fijado,
      archivosItems: c.archivosItems,
    });
    setFormOpen(true);
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Comunicación"
          description="Avisos y comunicados para los residentes"
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" aria-hidden />
              Nuevo comunicado
            </Button>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {comunicados === undefined
              ? "Cargando…"
              : `${filtered.length} comunicado${filtered.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={prioridad}
              onChange={(e) => setPrioridad(e.target.value as typeof prioridad)}
              className="sm:w-44"
            >
              <option value="">Todas las prioridades</option>
              <option value="normal">Normal</option>
              <option value="importante">Importante</option>
              <option value="urgente">Urgente</option>
            </Select>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar comunicado"
              className="sm:w-72"
            />
          </div>
        </div>

        {comunicados === undefined ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={hasFilters ? "Sin resultados" : "Aún no hay comunicados"}
            description={
              hasFilters
                ? "Ningún comunicado coincide con los filtros."
                : "Publica el primer aviso para informar a los residentes del conjunto."
            }
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setPrioridad(""); }}>
                  Limpiar filtros
                </Button>
              ) : (
                <Button size="sm" onClick={openNew}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Nuevo comunicado
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => (
              <ComunicadoCard
                key={c._id}
                c={c}
                onEdit={() => openEdit(c)}
                onDelete={() => setDeleteId(c._id)}
              />
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <ComunicadoForm
          condominioId={condominioId}
          initial={editDraft ?? undefined}
          onClose={() => setFormOpen(false)}
        />
      )}

      {deleteId && (
        <DeleteDialog id={deleteId} onClose={() => setDeleteId(null)} />
      )}
    </PageContainer>
  );
}

function ComunicadoCard({
  c,
  onEdit,
  onDelete,
}: {
  c: ComunicadoRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const togglePin = useMutation(api.comunicados.togglePin);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const archivos = c.archivosItems ?? [];
  const imagenes = archivos.filter((a) => a.mimeType.startsWith("image/"));
  const documentos = archivos.filter((a) => !a.mimeType.startsWith("image/"));

  return (
    <>
      <Card
        className={cn(
          "group relative overflow-hidden p-5 transition-colors hover:border-border/60",
          c.fijado && "ring-1 ring-brand/20",
        )}
      >
        {/* Barra de prioridad */}
        <span
          className={cn(
            "absolute inset-y-0 left-0 w-1",
            c.prioridad === "urgente" && "bg-red-500",
            c.prioridad === "importante" && "bg-amber-500",
            c.prioridad === "normal" && "bg-transparent",
          )}
          aria-hidden
        />

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {c.fijado && (
                <Pin className="h-3.5 w-3.5 text-brand" aria-label="Fijado" />
              )}
              <h3 className="text-sm font-semibold text-foreground">{c.titulo}</h3>
              {c.prioridad !== "normal" && (
                <Badge tone={PRIORIDAD_TONE[c.prioridad] ?? "neutral"}>
                  {PRIORIDAD_LABEL[c.prioridad]}
                </Badge>
              )}
              <Badge tone="info">{AUDIENCIA_LABEL[c.audiencia] ?? c.audiencia}</Badge>
            </div>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{c.cuerpo}</p>

            {/* Imágenes adjuntas */}
            {imagenes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {imagenes.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightbox(img.url)}
                    className="overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-90"
                  >
                    <img
                      src={img.url}
                      alt={img.nombre}
                      className="h-24 w-24 object-cover sm:h-32 sm:w-32"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Documentos adjuntos */}
            {documentos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {documentos.map((doc, i) => (
                  <a
                    key={i}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
                  >
                    <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    {doc.nombre}
                  </a>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-medium">
                {initials(c.autorNombre)}
              </span>
              <span className="font-medium text-foreground/80">{c.autorNombre}</span>
              <span>·</span>
              <span>{fmtFecha(c.createdAt)}</span>
              {archivos.length > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    {archivos.length} archivo{archivos.length === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => togglePin({ id: c._id })}
              aria-label={c.fijado ? "Desfijar" : "Fijar"}
              title={c.fijado ? "Desfijar" : "Fijar"}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {c.fijado ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
            <button
              onClick={onEdit}
              aria-label="Editar"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              aria-label="Eliminar"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* Lightbox de imagen */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Vista completa"
            className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Cerrar"
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

function DeleteDialog({
  id,
  onClose,
}: {
  id: Id<"comunicados">;
  onClose: () => void;
}) {
  const remove = useMutation(api.comunicados.remove);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await remove({ id });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Eliminar comunicado"
      description="Esta acción no se puede deshacer."
      className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Eliminar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        El comunicado y sus archivos adjuntos se eliminarán permanentemente.
      </p>
    </Modal>
  );
}
