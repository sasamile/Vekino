"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  Folder,
  FolderPlus,
  Plus,
  Upload,
  FileText,
  MessageSquare,
  Loader2,
  ExternalLink,
  Users2,
  Trash2,
  Download,
  Search,
  LayoutList,
  Pencil,
  History,
  Reply,
  X,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableCard,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
  CellStack,
} from "@/components/ui/table";
import { cn, initials } from "@/lib/utils";
import { useUploadToS3 } from "@/hooks/use-upload-s3";
import {
  CategoriaIcon,
  resolveIconType,
  resolveIconValue,
  type CategoriaIconType,
} from "@/components/consejo/categoria-icon";
import {
  CategoriaIconPicker,
  type IconDraft,
} from "@/components/consejo/categoria-icon-picker";

type Estado = "pendiente" | "en_revision" | "aprobado" | "reemplazado";

const ESTADO_META: Record<
  Estado,
  { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }
> = {
  pendiente: { label: "Por revisar", tone: "warning" },
  en_revision: { label: "En revisión", tone: "info" },
  aprobado: { label: "Publicado", tone: "success" },
  reemplazado: { label: "Archivado", tone: "neutral" },
};

type CategoriaRow = {
  _id: Id<"consejoCategorias">;
  nombre: string;
  iconKey?: string;
  colorKey?: string;
  iconType?: CategoriaIconType;
  iconValue?: string;
  documentosCount: number;
};

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ConsejoPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;

  const permisos = useQuery(api.consejo.misPermisos, { condominioId });
  const categorias = useQuery(
    api.consejo.listCategorias,
    permisos?.canView ? { condominioId } : "skip",
  );
  const [categoriaFiltro, setCategoriaFiltro] = useState<
    Id<"consejoCategorias"> | ""
  >("");
  const [q, setQ] = useState("");
  const documentos = useQuery(
    api.consejo.listDocumentos,
    permisos?.canView
      ? { condominioId, categoriaId: categoriaFiltro || undefined }
      : "skip",
  );

  const [catModal, setCatModal] = useState<
    | { mode: "create" }
    | {
        mode: "edit";
        id: Id<"consejoCategorias">;
        nombre: string;
        icon: IconDraft;
      }
    | null
  >(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<Id<"consejoDocumentos"> | null>(
    null,
  );
  const [miembrosOpen, setMiembrosOpen] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<{
    id: Id<"consejoDocumentos">;
    titulo: string;
  } | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);

  const removeCategoria = useMutation(api.consejo.removeCategoria);
  const removeDocumento = useMutation(api.consejo.removeDocumento);
  const totalDocs =
    categorias?.reduce((n, c) => n + c.documentosCount, 0) ?? 0;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = documentos ?? [];
    if (!needle) return rows;
    return rows.filter(
      (d) =>
        d.titulo.toLowerCase().includes(needle) ||
        d.categoriaNombre.toLowerCase().includes(needle) ||
        (d.createdByNombre ?? "").toLowerCase().includes(needle) ||
        d.fileName.toLowerCase().includes(needle),
    );
  }, [documentos, q]);

  const loading =
    permisos === undefined ||
    (permisos.canView &&
      (categorias === undefined || documentos === undefined));

  const categoriaActiva = categorias?.find((c) => c._id === categoriaFiltro);
  const folderLabel = categoriaActiva?.nombre ?? "Todos los documentos";

  if (permisos && !permisos.canView) {
  return (
    <PageContainer>
        <EmptyState
          icon={Folder}
          title="Sin acceso"
          description="El consejo es para administración, contaduría y junta directiva."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-7">
        <PageHeader
          title="Consejo de administración"
          description="Documentos por categoría y seguimiento para la junta y la comunidad"
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMiembrosOpen(true)}
              >
                <Users2 className="h-4 w-4" />
                Miembros del Consejo
              </Button>
              {permisos?.canUpload && (
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-4 w-4" />
                  Subir documento
                </Button>
              )}
            </div>
          }
        />

        {/* Toolbar: búsqueda */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar documento, categoría o autor…"
              className="pl-9"
            />
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
              <LayoutList className="h-3.5 w-3.5" />
              Lista
            </span>
          </div>
        </div>

        {/* Categorías — chips horizontales (cambio rápido) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Categorías
              {(categorias?.length ?? 0) > 0 && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {categorias!.length}
                </span>
              )}
            </h2>
            {permisos?.canManageCategorias && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCatModal({ mode: "create" })}
              >
                <FolderPlus className="h-4 w-4" />
                Nueva
              </Button>
            )}
        </div>

          {loading ? (
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-36 shrink-0 rounded-full" />
              ))}
            </div>
          ) : (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
              <button
                type="button"
                onClick={() => setCategoriaFiltro("")}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  !categoriaFiltro
                    ? "border-foreground/20 bg-foreground text-background"
                    : "border-border bg-card text-foreground hover:bg-accent/50",
                )}
              >
                <Folder className="h-4 w-4 opacity-80" />
                Todas
                <span
                  className={cn(
                    "tabular-nums text-xs",
                    !categoriaFiltro
                      ? "text-background/70"
                      : "text-muted-foreground",
                  )}
                >
                  {totalDocs}
                </span>
              </button>

              {(categorias as CategoriaRow[] | undefined)?.map((c) => {
                const active = categoriaFiltro === c._id;
                return (
                  <div
                    key={c._id}
                    className={cn(
                      "group inline-flex h-11 shrink-0 items-center gap-1 rounded-full border pl-1.5 pr-1 transition-colors",
                      active
                        ? "border-brand/40 bg-brand/10"
                        : "border-border bg-card hover:bg-accent/40",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setCategoriaFiltro(c._id)}
                      className="inline-flex items-center gap-2 rounded-full py-1 pr-2 pl-0.5 text-left"
                      aria-pressed={active}
                    >
                      <CategoriaIcon data={c} size="sm" />
                      <span className="max-w-[9rem] truncate text-sm font-medium text-foreground">
                        {c.nombre}
                      </span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {c.documentosCount}
                      </span>
                    </button>
                    {permisos?.canManageCategorias && (
                      <div className="flex items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <button
                          type="button"
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label="Editar categoría"
                          onClick={() =>
                            setCatModal({
                              mode: "edit",
                              id: c._id,
                              nombre: c.nombre,
                              icon: {
                                iconType: resolveIconType(c),
                                iconValue: resolveIconValue(c),
                                colorKey: c.colorKey ?? "slate",
                              },
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                          aria-label="Eliminar categoría"
                          onClick={() => {
                            const msg =
                              c.documentosCount > 0
                                ? `¿Eliminar «${c.nombre}» y sus ${c.documentosCount} documento(s)? No se puede deshacer.`
                                : `¿Eliminar la categoría «${c.nombre}»?`;
                            if (!confirm(msg)) return;
                            void removeCategoria({
                              id: c._id,
                              force: c.documentosCount > 0,
                            }).then(() => {
                              if (categoriaFiltro === c._id)
                                setCategoriaFiltro("");
                            });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
            </div>
        )}
      </div>
                );
              })}

              {permisos?.canManageCategorias && (
                <button
                  type="button"
                  onClick={() => setCatModal({ mode: "create" })}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-dashed border-border px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
                >
                  <FolderPlus className="h-4 w-4" />
                  Nueva categoría
                </button>
              )}
            </div>
          )}
        </section>

        {/* Tabla de archivos */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {folderLabel}
              <span className="ml-1.5 font-normal text-muted-foreground">
                {filtered.length}
              </span>
            </h2>
            {permisos?.canUpload && (
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Plus className="h-4 w-4" />
                Subir documento
              </Button>
            )}
          </div>

          {loading ? (
            <Skeleton className="h-56 rounded-2xl" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Sin documentos"
              description={
                q.trim()
                  ? "Ningún archivo coincide con la búsqueda."
                  : "Sube el primer documento del consejo para que la junta lo revise y comente."
              }
              action={
                permisos?.canUpload && !q.trim() ? (
                  <Button size="sm" onClick={() => setUploadOpen(true)}>
                    <Upload className="h-4 w-4" />
                    Subir documento
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableCard>
              <Table>
                <THead>
                  <TR>
                    <TH>Archivo</TH>
                    <TH>Fecha</TH>
                    <TH>Subido por</TH>
                    <TH>Tamaño</TH>
                    <TH>Estado</TH>
                    <TH className="text-right">Acciones</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((d) => {
                    const est =
                      ESTADO_META[d.estado as Estado] ?? ESTADO_META.pendiente;
  return (
                      <TR
                        key={d._id}
                        className="cursor-pointer"
                        onClick={() => setDetalleId(d._id)}
                      >
                        <TD>
        <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                              <FileText className="h-4 w-4" />
                            </span>
                            <CellStack
                              primary={d.titulo}
                              secondary={`${d.categoriaNombre} · v${d.version}${
                                d.comentariosCount > 0
                                  ? ` · ${d.comentariosCount} coment.`
                                  : ""
                              }`}
                            />
          </div>
                        </TD>
                        <TD>
                          <span className="whitespace-nowrap text-muted-foreground">
                            {fmtDate(d.createdAt)}
                          </span>
                        </TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                              {initials(d.createdByNombre ?? "?")}
                            </span>
                            <span className="truncate text-foreground">
                              {d.createdByNombre ?? "—"}
                            </span>
          </div>
                        </TD>
                        <TD>
                          <span className="tabular-nums text-muted-foreground">
                            {formatSize(d.sizeBytes)}
                          </span>
                        </TD>
                        <TD>
                          <Badge tone={est.tone}>{est.label}</Badge>
                        </TD>
                        <TD>
                          <div
                            className="flex items-center justify-end gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <a
                              href={d.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              aria-label="Abrir"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <a
                              href={d.fileUrl}
                              download={d.fileName}
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              aria-label="Descargar"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            {permisos?.canUpload && (
        <button
                                type="button"
                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                aria-label="Eliminar documento"
                                onClick={() =>
                                  setDeleteDoc({
                                    id: d._id,
                                    titulo: d.titulo,
                                  })
                                }
        >
          <Trash2 className="h-4 w-4" />
        </button>
                            )}
                            {d.comentariosCount > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 text-xs text-muted-foreground">
                                <MessageSquare className="h-3.5 w-3.5" />
                                {d.comentariosCount}
                              </span>
                            )}
          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableCard>
          )}
        </section>
      </div>

      {catModal && (
        <CategoriaModal
          condominioId={condominioId}
          mode={catModal.mode}
          editId={catModal.mode === "edit" ? catModal.id : undefined}
          initialNombre={catModal.mode === "edit" ? catModal.nombre : ""}
          initialIcon={
            catModal.mode === "edit"
              ? catModal.icon
              : {
                  iconType: "emoji",
                  iconValue: "📁",
                  colorKey: "slate",
                }
          }
          onClose={() => setCatModal(null)}
        />
      )}
      {uploadOpen && (
        <SubirDocumentoModal
          condominioId={condominioId}
          categorias={(categorias as CategoriaRow[] | undefined) ?? []}
          defaultCategoriaId={categoriaFiltro || undefined}
          onClose={() => setUploadOpen(false)}
        />
      )}
      {detalleId && (
        <DocumentoDetalleModal
          id={detalleId}
          categorias={(categorias as CategoriaRow[] | undefined) ?? []}
          canUpload={Boolean(permisos?.canUpload)}
          canComment={Boolean(permisos?.canComment)}
          canAdmin={Boolean(permisos?.canManageCategorias)}
          onClose={() => setDetalleId(null)}
        />
      )}
      {miembrosOpen && (
        <MiembrosModal
          condominioId={condominioId}
          canAdmin={Boolean(permisos?.canManageCategorias)}
          onClose={() => setMiembrosOpen(false)}
        />
      )}
      {deleteDoc && (
        <Modal
          open
          onClose={() => {
            if (deletingDoc) return;
            setDeleteDoc(null);
          }}
          title="Eliminar documento"
          description="Se borrará el documento, todas sus versiones y los archivos en S3. Esta acción no se puede deshacer."
          className="max-w-md"
          overlayClassName={detalleId ? "z-[110]" : undefined}
          footer={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={deletingDoc}
                onClick={() => setDeleteDoc(null)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deletingDoc}
                onClick={() => {
                  void (async () => {
                    setDeletingDoc(true);
                    try {
                      await removeDocumento({ id: deleteDoc.id });
                      if (detalleId === deleteDoc.id) setDetalleId(null);
                      setDeleteDoc(null);
                    } finally {
                      setDeletingDoc(false);
                    }
                  })();
                }}
              >
                {deletingDoc && <Loader2 className="h-4 w-4 animate-spin" />}
                Eliminar
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            Documento:{" "}
            <span className="font-medium text-foreground">
              {deleteDoc.titulo}
            </span>
          </p>
        </Modal>
      )}
    </PageContainer>
  );
}

function CategoriaModal({
  condominioId,
  mode,
  editId,
  initialNombre,
  initialIcon,
  onClose,
}: {
  condominioId: Id<"condominios">;
  mode: "create" | "edit";
  editId?: Id<"consejoCategorias">;
  initialNombre: string;
  initialIcon: IconDraft;
  onClose: () => void;
}) {
  const create = useMutation(api.consejo.createCategoria);
  const update = useMutation(api.consejo.updateCategoria);
  const [nombre, setNombre] = useState(initialNombre);
  const [icon, setIcon] = useState<IconDraft>(initialIcon);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!nombre.trim()) return;
    if (icon.iconType === "image" && !icon.iconValue) {
      setError("Sube una imagen o pega una URL.");
      return;
    }
    if (icon.iconType === "svg" && !icon.iconValue) {
      setError("Pega un SVG y pulsa «Usar este SVG».");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        nombre,
        iconType: icon.iconType,
        iconValue: icon.iconValue,
        colorKey: icon.colorKey,
        iconKey: icon.iconType === "lucide" ? icon.iconValue : undefined,
      };
      if (mode === "edit" && editId) {
        await update({ id: editId, ...payload });
      } else {
        await create({ condominioId, ...payload });
      }
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
      title={mode === "edit" ? "Editar categoría" : "Nueva categoría"}
      description="Nombre e icono (emoji, icono, SVG o imagen)."
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={save} disabled={!nombre.trim() || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Guardar" : "Crear"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <CategoriaIconPicker
          value={icon}
          onChange={setIcon}
          uploadPrefix={`condominios/${condominioId}/consejo/icons`}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Nombre</label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Contabilidad, Actas, Reportes…"
            autoFocus
          />
      </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
    </Modal>
  );
}

function SubirDocumentoModal({
  condominioId,
  categorias,
  defaultCategoriaId,
  onClose,
}: {
  condominioId: Id<"condominios">;
  categorias: { _id: Id<"consejoCategorias">; nombre: string }[];
  defaultCategoriaId?: Id<"consejoCategorias">;
  onClose: () => void;
}) {
  const create = useMutation(api.consejo.createDocumento);
  const uploadFile = useUploadToS3();
  const [categoriaId, setCategoriaId] = useState(
    defaultCategoriaId ?? categorias[0]?._id ?? "",
  );
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [periodoMes, setPeriodoMes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = Boolean(categoriaId && titulo.trim() && file);

  async function save() {
    if (!file || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const { url, key } = await uploadFile(
        file,
        `condominios/${condominioId}/consejo`,
      );
      await create({
        condominioId,
        categoriaId: categoriaId as Id<"consejoCategorias">,
        titulo,
        descripcion: descripcion || undefined,
        periodoMes: periodoMes || undefined,
        fileUrl: url,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        s3Key: key,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Subir documento"
      description="El archivo queda publicado en la categoría elegida."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Subir
          </Button>
        </>
      }
    >
      <div className="space-y-3">
          <div className="space-y-1.5">
          <label className="text-xs font-medium">Categoría</label>
          <Select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
          >
            {categorias.length === 0 && (
              <option value="">Crea una categoría primero</option>
            )}
            {categorias.map((c) => (
              <option key={c._id} value={c._id}>
                {c.nombre}
              </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
          <label className="text-xs font-medium">Título</label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej: Informe mes de abril 2026"
          />
          </div>
          <div className="space-y-1.5">
          <label className="text-xs font-medium">Descripción (opcional)</label>
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
          />
          </div>
          <div className="space-y-1.5">
          <label className="text-xs font-medium">Período (opcional)</label>
          <Input
            type="month"
            value={periodoMes}
            onChange={(e) => setPeriodoMes(e.target.value)}
          />
          </div>
          <div className="space-y-1.5">
          <label className="text-xs font-medium">Archivo</label>
          <input
            type="file"
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="text-xs text-muted-foreground">
              {file.name} · {formatSize(file.size)}
            </p>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function DocumentoDetalleModal({
  id,
  categorias,
  canUpload,
  canComment,
  canAdmin,
  onClose,
}: {
  id: Id<"consejoDocumentos">;
  categorias: { _id: Id<"consejoCategorias">; nombre: string }[];
  canUpload: boolean;
  canComment: boolean;
  canAdmin: boolean;
  onClose: () => void;
}) {
  const doc = useQuery(api.consejo.getDocumento, { id });
  const addComentario = useMutation(api.consejo.addComentario);
  const updateComentario = useMutation(api.consejo.updateComentario);
  const removeComentario = useMutation(api.consejo.removeComentario);
  const toggleReaccion = useMutation(api.consejo.toggleReaccion);
  const setEstado = useMutation(api.consejo.setEstadoDocumento);
  const updateDoc = useMutation(api.consejo.updateDocumento);
  const nuevaVersion = useMutation(api.consejo.nuevaVersion);
  const remove = useMutation(api.consejo.removeDocumento);
  const removeVersion = useMutation(api.consejo.removeVersion);
  const uploadFile = useUploadToS3();

  const [comentario, setComentario] = useState("");
  const [replyTo, setReplyTo] = useState<{
    id: Id<"consejoDocumentoComentarios">;
    autor: string;
  } | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<
    Id<"consejoDocumentoComentarios"> | null
  >(null);
  const [editingText, setEditingText] = useState("");
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [periodoMes, setPeriodoMes] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [notaVersion, setNotaVersion] = useState("");
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { kind: "documento" }
    | { kind: "version_actual" }
    | {
        kind: "version_archivada";
        versionId: Id<"consejoDocumentoVersiones">;
        label: string;
      }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const commentCount = doc?.comentarios.length ?? 0;
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [commentCount]);

  function startEdit() {
    if (!doc) return;
    setTitulo(doc.titulo);
    setDescripcion(doc.descripcion ?? "");
    setPeriodoMes(doc.periodoMes ?? "");
    setCategoriaId(doc.categoriaId);
    setEditing(true);
    setError(null);
  }

  async function guardarMeta() {
    if (!titulo.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateDoc({
        id,
        titulo,
        descripcion,
        periodoMes,
        categoriaId: categoriaId as Id<"consejoCategorias">,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function enviarComentario() {
    if (!comentario.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addComentario({
        documentoId: id,
        contenido: comentario,
        parentId: replyTo?.id,
      });
      setComentario("");
      setReplyTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo comentar.");
    } finally {
      setBusy(false);
    }
  }

  async function guardarEdicionComentario() {
    if (!editingCommentId || !editingText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateComentario({
        id: editingCommentId,
        contenido: editingText,
      });
      setEditingCommentId(null);
      setEditingText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo editar.");
    } finally {
      setBusy(false);
    }
  }

  async function onNuevaVersion(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !doc) return;
    setBusy(true);
    setError(null);
    try {
      const { url, key } = await uploadFile(
        file,
        `condominios/${doc.condominioId}/consejo`,
      );
      await nuevaVersion({
        id,
        fileUrl: url,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        s3Key: key,
        nota: notaVersion.trim() || undefined,
      });
      setNotaVersion("");
      setVersionModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al versionar.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmarBorrado() {
    if (!deleteConfirm) return;
    setBusy(true);
    setError(null);
    try {
      if (deleteConfirm.kind === "documento") {
        await remove({ id });
        setDeleteConfirm(null);
        onClose();
        return;
      }
      if (deleteConfirm.kind === "version_archivada") {
        await removeVersion({
          documentoId: id,
          versionId: deleteConfirm.versionId,
        });
      } else {
        const result = await removeVersion({ documentoId: id });
        if (result.kind === "documento") {
          setDeleteConfirm(null);
          onClose();
          return;
        }
      }
      setDeleteConfirm(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo eliminar.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={doc?.titulo ?? "Documento"}
      description={
        doc
          ? `${doc.categoriaNombre} · versión actual v${doc.version} · ${formatSize(doc.sizeBytes)}`
          : "Cargando…"
      }
      className="max-w-2xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
          </Button>
      }
    >
      {!doc ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ESTADO_META[doc.estado as Estado]?.tone ?? "neutral"}>
              {ESTADO_META[doc.estado as Estado]?.label ?? doc.estado}
            </Badge>
            <Badge tone="neutral">v{doc.version}</Badge>
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              Ver archivo actual <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {canUpload && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={startEdit}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar datos
              </Button>
            )}
            {canUpload && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setVersionModalOpen(true);
                }}
              >
                <Upload className="h-3.5 w-3.5" />
                Actualizar archivo
              </Button>
            )}
            {canAdmin && (
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className="sr-only sm:not-sr-only">Estado</span>
                <Select
                  value={doc.estado}
                  onChange={(e) =>
                    void setEstado({
                      id,
                      estado: e.target.value as Estado,
                    })
                  }
                  className="w-40"
                  aria-label="Cambiar estado"
                >
                  <option value="aprobado">Publicado</option>
                  <option value="en_revision">En revisión</option>
                  <option value="pendiente">Por revisar</option>
                  <option value="reemplazado">Archivado</option>
            </Select>
              </label>
            )}
            {(canAdmin || canUpload) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setDeleteConfirm({ kind: "documento" })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="space-y-1.5">
                <label className="text-xs font-medium">Título</label>
                <Input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
          </div>
          <div className="space-y-1.5">
                <label className="text-xs font-medium">Categoría</label>
                <Select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                >
                  {categorias.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.nombre}
                    </option>
                  ))}
                </Select>
        </div>
        <div className="space-y-1.5">
                <label className="text-xs font-medium">Descripción</label>
                <Textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                />
        </div>
        <div className="space-y-1.5">
                <label className="text-xs font-medium">Período</label>
                <Input
                  type="month"
                  value={periodoMes}
                  onChange={(e) => setPeriodoMes(e.target.value)}
                />
        </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !titulo.trim()}
                  onClick={guardarMeta}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
      </div>
            </div>
          ) : (
            doc.descripcion && (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {doc.descripcion}
              </p>
            )
          )}

          {canUpload && versionModalOpen ? (
            <Modal
              open
              onClose={() => {
                if (busy) return;
                setVersionModalOpen(false);
                setNotaVersion("");
              }}
              title={`Actualizar archivo → v${doc.version + 1}`}
              description={`La versión actual (v${doc.version}) se archiva y el nuevo archivo pasa a ser la vigente.`}
              className="max-w-md"
              overlayClassName="z-[110]"
              footer={
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setVersionModalOpen(false);
                      setNotaVersion("");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Subir nueva versión
                  </Button>
                </>
              }
            >
              <div className="space-y-3">
                <Input
                  value={notaVersion}
                  onChange={(e) => setNotaVersion(e.target.value)}
                  placeholder="Nota de cambios (opcional)"
                  disabled={busy}
                />
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={onNuevaVersion}
                />
                <p className="text-xs text-muted-foreground">
                  PDF, Word, Excel o imagen. Al elegir el archivo se sube de
                  inmediato.
                </p>
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
              </div>
            </Modal>
          ) : null}

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Historial de versiones
            </p>
            <ul className="space-y-1.5 text-xs">
              <li className="flex items-center justify-between gap-2 rounded-lg border border-brand/25 bg-brand/4 px-3 py-2">
                <span className="text-foreground">
                  <span className="font-semibold">v{doc.version}</span>
                  {" · "}
                  {doc.fileName}
                  {" · "}
                  {fmtDate(doc.updatedAt)}
                  <span className="ml-1.5 text-brand">(actual)</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand hover:underline"
                  >
                    Abrir
                  </a>
                  {canUpload && (
                    <button
                      type="button"
                      disabled={busy}
                      className="text-destructive hover:underline disabled:opacity-50"
                      onClick={() =>
                        setDeleteConfirm({ kind: "version_actual" })
                      }
                    >
                      Borrar
                    </button>
                  )}
                </span>
              </li>
              {doc.versiones.map((v) => (
                <li
                  key={v._id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-muted-foreground"
                >
                  <span>
                    <span className="font-medium text-foreground">
                      v{v.version}
                    </span>
                    {" · "}
                    {v.fileName}
                    {" · "}
                    {fmtDate(v.createdAt)}
                    {v.subidoPorNombre ? ` · ${v.subidoPorNombre}` : ""}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <a
                      href={v.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      Abrir
                    </a>
                    {canUpload && (
                      <button
                        type="button"
                        disabled={busy}
                        className="text-destructive hover:underline disabled:opacity-50"
                        onClick={() =>
                          setDeleteConfirm({
                            kind: "version_archivada",
                            versionId: v._id,
                            label: `v${v.version} · ${v.fileName}`,
                          })
                        }
                      >
                        Borrar
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Comentarios ({doc.comentarios.length})
            </p>
            <div className="mb-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {doc.comentarios.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay comentarios.
                </p>
              ) : (
                (() => {
                  const roots = doc.comentarios.filter((c) => !c.parentId);
                  const repliesOf = (parentId: string) =>
                    doc.comentarios.filter(
                      (c) => c.parentId && String(c.parentId) === parentId,
                    );
  return (
                    <>
                      {roots.map((c) => (
                        <div key={c._id} className="space-y-2">
                          <ComentarioCard
                            c={c}
                            canComment={canComment}
                            canAdmin={canAdmin}
                            busy={busy}
                            isEditing={editingCommentId === c._id}
                            editingText={editingText}
                            onEditingText={setEditingText}
                            onStartEdit={() => {
                              setEditingCommentId(c._id);
                              setEditingText(c.contenido);
                            }}
                            onCancelEdit={() => {
                              setEditingCommentId(null);
                              setEditingText("");
                            }}
                            onSaveEdit={() => void guardarEdicionComentario()}
                            onReply={() =>
                              setReplyTo({ id: c._id, autor: c.autorNombre })
                            }
                            onDelete={() => {
                              if (!confirm("¿Eliminar este comentario?")) return;
                              void removeComentario({ id: c._id }).catch(
                                (e) =>
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : "No se pudo eliminar.",
                                  ),
                              );
                            }}
                            onReact={(emoji) =>
                              void toggleReaccion({
                                comentarioId: c._id,
                                emoji,
                              })
                            }
                          />
                          {repliesOf(String(c._id)).map((r) => (
                            <div key={r._id} className="ml-4 border-l-2 border-border pl-3">
                              <ComentarioCard
                                c={r}
                                canComment={canComment}
                                canAdmin={canAdmin}
                                busy={busy}
                                isReply
                                isEditing={editingCommentId === r._id}
                                editingText={editingText}
                                onEditingText={setEditingText}
                                onStartEdit={() => {
                                  setEditingCommentId(r._id);
                                  setEditingText(r.contenido);
                                }}
                                onCancelEdit={() => {
                                  setEditingCommentId(null);
                                  setEditingText("");
                                }}
                                onSaveEdit={() => void guardarEdicionComentario()}
                                onReply={() =>
                                  setReplyTo({
                                    id: c._id,
                                    autor: c.autorNombre,
                                  })
                                }
                                onDelete={() => {
                                  if (!confirm("¿Eliminar esta respuesta?"))
                                    return;
                                  void removeComentario({ id: r._id }).catch(
                                    (e) =>
                                      setError(
                                        e instanceof Error
                                          ? e.message
                                          : "No se pudo eliminar.",
                                      ),
                                  );
                                }}
                                onReact={(emoji) =>
                                  void toggleReaccion({
                                    comentarioId: r._id,
                                    emoji,
                                  })
                                }
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                      <div ref={commentsEndRef} />
                    </>
                  );
                })()
              )}
            </div>
            {canComment && (
              <div className="space-y-2">
                {replyTo ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                    <span>
                      Respondiendo a{" "}
                      <span className="font-medium text-foreground">
                        {replyTo.autor}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="rounded p-0.5 hover:bg-accent hover:text-foreground"
                      aria-label="Cancelar respuesta"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Textarea
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder={
                      replyTo
                        ? "Escribe tu respuesta…"
                        : "Escribe un comentario…"
                    }
                    rows={2}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void enviarComentario();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={busy || !comentario.trim()}
                    onClick={() => void enviarComentario()}
                  >
                    {replyTo ? "Responder" : "Enviar"}
                  </Button>
                </div>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
      {deleteConfirm ? (
        <Modal
          open
          onClose={() => {
            if (busy) return;
            setDeleteConfirm(null);
          }}
          title={
            deleteConfirm.kind === "documento"
              ? "Eliminar documento"
              : deleteConfirm.kind === "version_actual"
                ? "Eliminar versión actual"
                : "Eliminar versión"
          }
          description={
            deleteConfirm.kind === "documento"
              ? "Se borrará el documento, todas sus versiones y los archivos en S3. No se puede deshacer."
              : deleteConfirm.kind === "version_actual"
                ? doc && doc.versiones.length > 0
                  ? `Se borra el archivo actual (v${doc.version}) de S3 y se restaura la versión anterior.`
                  : "No hay versiones anteriores: se eliminará el documento completo y su archivo en S3."
                : "Se borrará esta versión del historial y su archivo en S3."
          }
          className="max-w-md"
          overlayClassName="z-[110]"
      footer={
        <>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setDeleteConfirm(null)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void confirmarBorrado()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Eliminar
          </Button>
        </>
      }
    >
          {deleteConfirm.kind === "version_archivada" ? (
            <p className="text-sm text-muted-foreground">
              Versión:{" "}
              <span className="font-medium text-foreground">
                {deleteConfirm.label}
              </span>
            </p>
          ) : doc ? (
            <p className="text-sm text-muted-foreground">
              Documento:{" "}
              <span className="font-medium text-foreground">{doc.titulo}</span>
            </p>
          ) : null}
        </Modal>
      ) : null}
    </Modal>
  );
}

const REACCION_OPTS = ["👍", "❤️", "😮", "😂"] as const;

type ComentarioView = {
  _id: Id<"consejoDocumentoComentarios">;
  autorNombre: string;
  contenido: string;
  createdAt: number;
  updatedAt: number;
  esMio: boolean;
  reacciones: { emoji: string; count: number; mine: boolean }[];
};

function ComentarioCard({
  c,
  canComment,
  canAdmin,
  busy,
  isReply,
  isEditing,
  editingText,
  onEditingText,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onReply,
  onDelete,
  onReact,
}: {
  c: ComentarioView;
  canComment: boolean;
  canAdmin: boolean;
  busy: boolean;
  isReply?: boolean;
  isEditing: boolean;
  editingText: string;
  onEditingText: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onReply: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
}) {
  const canManage = c.esMio || canAdmin;
  const edited = c.updatedAt > c.createdAt + 2000;

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
      <p className="text-xs font-medium text-foreground">
        {c.autorNombre}{" "}
        <span className="font-normal text-muted-foreground">
          · {fmtDate(c.createdAt)}
          {edited ? " · editado" : ""}
          {isReply ? " · respuesta" : ""}
        </span>
      </p>

      {isEditing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={editingText}
            onChange={(e) => onEditingText(e.target.value)}
            rows={2}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || !editingText.trim()}
              onClick={onSaveEdit}
            >
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
          {c.contenido}
        </p>
      )}

      {!isEditing && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {REACCION_OPTS.map((emoji) => {
            const hit = c.reacciones.find((r) => r.emoji === emoji);
            return (
              <button
                key={emoji}
                type="button"
                disabled={!canComment}
                onClick={() => onReact(emoji)}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
                  hit?.mine
                    ? "border-brand/40 bg-brand/10"
                    : "border-transparent bg-transparent hover:border-border hover:bg-accent",
                  !canComment && "opacity-60",
                )}
                title={canComment ? "Reaccionar" : undefined}
              >
                <span>{emoji}</span>
                {hit && hit.count > 0 ? (
                  <span className="tabular-nums text-muted-foreground">
                    {hit.count}
                  </span>
                ) : null}
              </button>
            );
          })}

          <span className="mx-1 h-4 w-px bg-border" />

          {canComment && !isReply ? (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Reply className="h-3.5 w-3.5" />
              Responder
            </button>
          ) : null}
          {canManage ? (
            <>
              <button
                type="button"
                onClick={onStartEdit}
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MiembrosModal({
  condominioId,
  canAdmin,
  onClose,
}: {
  condominioId: Id<"condominios">;
  canAdmin: boolean;
  onClose: () => void;
}) {
  const miembros = useQuery(api.consejo.listMiembros, { condominioId });

  return (
    <Modal
      open
      onClose={onClose}
      title="Miembros del Consejo"
      description="Quienes tienen el rol Junta directiva en este condominio."
      className="max-w-lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {canAdmin && (
            <a
              href={`/condominio/${condominioId}/residentes`}
              className="text-sm font-medium text-brand hover:underline"
            >
              Gestionar en Residentes
            </a>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {miembros === undefined ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : miembros.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nadie tiene el rol Junta directiva aún. Asígnalo desde Residentes.
          </p>
        ) : (
          <ul className="space-y-2">
            {miembros.map((m) => (
              <li
                key={m.membershipId}
                className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {initials(m.nombre)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.nombre}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[m.email, m.unidades.join(", ")].filter(Boolean).join(" · ") ||
                      "Sin unidad"}
                  </p>
                </div>
                <Badge tone="neutral">Junta</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
