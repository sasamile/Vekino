"use client";

import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
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
import { uploadToS3 } from "@/lib/upload-s3";

type Estado = "pendiente" | "en_revision" | "aprobado" | "reemplazado";

const ESTADO_META: Record<
  Estado,
  { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }
> = {
  pendiente: { label: "Pendiente", tone: "warning" },
  en_revision: { label: "En revisión", tone: "info" },
  aprobado: { label: "Aprobado", tone: "success" },
  reemplazado: { label: "Reemplazado", tone: "neutral" },
};

const FOLDER_COLORS = [
  "bg-amber-400/90 text-amber-950",
  "bg-brand text-brand-foreground",
  "bg-sky-500/90 text-white",
  "bg-emerald-500/90 text-white",
  "bg-violet-500/90 text-white",
  "bg-rose-400/90 text-white",
];

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
    | { mode: "edit"; id: Id<"consejoCategorias">; nombre: string }
    | null
  >(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<Id<"consejoDocumentos"> | null>(
    null,
  );
  const [miembrosOpen, setMiembrosOpen] = useState(false);

  const removeCategoria = useMutation(api.consejo.removeCategoria);
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

        {/* Carpetas / categorías */}
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
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              <button
                type="button"
                onClick={() => setCategoriaFiltro("")}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border p-4 text-left transition-colors",
                  !categoriaFiltro
                    ? "border-brand/35 bg-brand/[0.06]"
                    : "border-border bg-card hover:bg-accent/40",
                )}
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Folder className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    Todas
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {totalDocs} archivo{totalDocs === 1 ? "" : "s"}
                  </p>
                </div>
              </button>

              {(categorias ?? []).map((c, i) => (
                <div
                  key={c._id}
                  className={cn(
                    "group relative flex flex-col gap-3 rounded-2xl border p-4 text-left transition-colors",
                    categoriaFiltro === c._id
                      ? "border-brand/35 bg-brand/[0.06]"
                      : "border-border bg-card hover:bg-accent/40",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setCategoriaFiltro(c._id)}
                    className="absolute inset-0 rounded-2xl"
                    aria-label={`Abrir ${c.nombre}`}
                  />
                  <span
                    className={cn(
                      "relative z-[1] grid h-11 w-11 place-items-center rounded-xl",
                      FOLDER_COLORS[i % FOLDER_COLORS.length],
                    )}
                  >
                    <Folder className="h-5 w-5" />
                  </span>
                  <div className="relative z-[1] min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.nombre}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.documentosCount} archivo
                      {c.documentosCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {permisos?.canManageCategorias && (
                    <div className="relative z-[2] flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Editar categoría"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCatModal({
                            mode: "edit",
                            id: c._id,
                            nombre: c.nombre,
                          });
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                        aria-label="Eliminar categoría"
                        onClick={(e) => {
                          e.stopPropagation();
                          const msg =
                            c.documentosCount > 0
                              ? `¿Eliminar «${c.nombre}» y sus ${c.documentosCount} documento(s)? No se puede deshacer.`
                              : `¿Eliminar la categoría «${c.nombre}»?`;
                          if (!confirm(msg)) return;
                          void removeCategoria({
                            id: c._id,
                            force: c.documentosCount > 0,
                          }).then(() => {
                            if (categoriaFiltro === c._id) setCategoriaFiltro("");
                          });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {permisos?.canManageCategorias && (
                <button
                  type="button"
                  onClick={() => setCatModal({ mode: "create" })}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-transparent p-4 text-muted-foreground transition-colors hover:border-brand/40 hover:bg-brand/[0.03] hover:text-foreground"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-dashed border-border">
                    <FolderPlus className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-medium">Nueva categoría</p>
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
          onClose={() => setCatModal(null)}
        />
      )}
      {uploadOpen && (
        <SubirDocumentoModal
          condominioId={condominioId}
          categorias={categorias ?? []}
          defaultCategoriaId={categoriaFiltro || undefined}
          onClose={() => setUploadOpen(false)}
        />
      )}
      {detalleId && (
        <DocumentoDetalleModal
          id={detalleId}
          categorias={categorias ?? []}
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
    </PageContainer>
  );
}

function CategoriaModal({
  condominioId,
  mode,
  editId,
  initialNombre,
  onClose,
}: {
  condominioId: Id<"condominios">;
  mode: "create" | "edit";
  editId?: Id<"consejoCategorias">;
  initialNombre: string;
  onClose: () => void;
}) {
  const create = useMutation(api.consejo.createCategoria);
  const update = useMutation(api.consejo.updateCategoria);
  const [nombre, setNombre] = useState(initialNombre);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!nombre.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "edit" && editId) {
        await update({ id: editId, nombre });
      } else {
        await create({ condominioId, nombre });
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
      description="Organiza los documentos del consejo (ej. Contabilidad, Estrategias)."
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
      <div className="space-y-3">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la categoría"
          autoFocus
        />
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
  const generateUploadUrl = useAction(api.files.generateUploadUrl);
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
      const { url, key } = await uploadToS3(
        generateUploadUrl,
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
      description="El documento queda pendiente para revisión de la junta."
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
  const setEstado = useMutation(api.consejo.setEstadoDocumento);
  const updateDoc = useMutation(api.consejo.updateDocumento);
  const nuevaVersion = useMutation(api.consejo.nuevaVersion);
  const remove = useMutation(api.consejo.removeDocumento);
  const generateUploadUrl = useAction(api.files.generateUploadUrl);

  const [comentario, setComentario] = useState("");
  const [editing, setEditing] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [periodoMes, setPeriodoMes] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [notaVersion, setNotaVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      await addComentario({ documentoId: id, contenido: comentario });
      setComentario("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo comentar.");
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
      const { url, key } = await uploadToS3(
        generateUploadUrl,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al versionar.");
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
            {canAdmin && (
              <Select
                value={doc.estado}
                onChange={(e) =>
                  void setEstado({
                    id,
                    estado: e.target.value as Estado,
                  })
                }
                className="w-36"
              >
                <option value="pendiente">Pendiente</option>
                <option value="en_revision">En revisión</option>
                <option value="aprobado">Aprobado</option>
                <option value="reemplazado">Reemplazado</option>
              </Select>
            )}
            {(canAdmin || canUpload) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  if (
                    confirm(
                      "¿Eliminar este documento y todas sus versiones?",
                    )
                  ) {
                    void remove({ id }).then(onClose);
                  }
                }}
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

          {canUpload && (
            <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Upload className="h-3.5 w-3.5" />
                Actualizar archivo → v{doc.version + 1}
              </p>
              <p className="text-xs text-muted-foreground">
                La versión actual (v{doc.version}) se archiva y el nuevo archivo
                pasa a ser la vigente.
              </p>
              <Input
                value={notaVersion}
                onChange={(e) => setNotaVersion(e.target.value)}
                placeholder="Nota de cambios (opcional)"
              />
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={onNuevaVersion}
              />
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
            </div>
          )}

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Historial de versiones
            </p>
            <ul className="space-y-1.5 text-xs">
              <li className="flex items-center justify-between gap-2 rounded-lg border border-brand/25 bg-brand/[0.04] px-3 py-2">
                <span className="text-foreground">
                  <span className="font-semibold">v{doc.version}</span>
                  {" · "}
                  {doc.fileName}
                  {" · "}
                  {fmtDate(doc.updatedAt)}
                  <span className="ml-1.5 text-brand">(actual)</span>
                </span>
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  Abrir
                </a>
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
                  <a
                    href={v.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline"
                  >
                    Abrir
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Comentarios ({doc.comentarios.length})
            </p>
            <div className="mb-3 max-h-56 space-y-2 overflow-y-auto">
              {doc.comentarios.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay comentarios.
                </p>
              ) : (
                doc.comentarios.map((c) => (
                  <div
                    key={c._id}
                    className="rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <p className="text-xs font-medium text-foreground">
                      {c.autorNombre}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {fmtDate(c.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-foreground">{c.contenido}</p>
                  </div>
                ))
              )}
            </div>
            {canComment && (
              <div className="flex gap-2">
                <Textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Escribe un comentario…"
                  rows={2}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  disabled={busy || !comentario.trim()}
                  onClick={enviarComentario}
                >
                  Enviar
                </Button>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </Modal>
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
