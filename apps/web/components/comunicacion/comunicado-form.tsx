"use client";

import { useState, useRef } from "react";
import { useMutation } from "convex/react";
import { Loader2, Pin, Paperclip, File as FileIcon, X } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Audiencia = "todos" | "propietario" | "arrendatario" | "residente" | "junta_directiva";
export type Prioridad = "normal" | "importante" | "urgente";

export interface ArchivoItem {
  storageId: string;
  mimeType: string;
  nombre: string;
  url: string;
}

export interface ComunicadoDraft {
  id?: Id<"comunicados">;
  titulo: string;
  cuerpo: string;
  audiencia: Audiencia;
  prioridad: Prioridad;
  fijado: boolean;
  archivosItems?: ArchivoItem[];
}

const AUDIENCIAS: { value: Audiencia; label: string }[] = [
  { value: "todos", label: "Todos los residentes" },
  { value: "propietario", label: "Propietarios" },
  { value: "arrendatario", label: "Arrendatarios" },
  { value: "residente", label: "Residentes" },
  { value: "junta_directiva", label: "Junta directiva" },
];

const PRIORIDADES: { value: Prioridad; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "importante", label: "Importante" },
  { value: "urgente", label: "Urgente" },
];

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

function ArchivoPreview({
  url,
  nombre,
  mimeType,
  onRemove,
}: {
  url: string;
  nombre: string;
  mimeType: string;
  onRemove: () => void;
}) {
  const isImage = mimeType.startsWith("image/");
  return (
    <div className="group relative">
      {isImage ? (
        <img
          src={url}
          alt={nombre}
          className="h-20 w-20 rounded-lg border border-border object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted px-2">
          <FileIcon className="h-6 w-6 text-muted-foreground" />
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">
            {nombre}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar archivo"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ComunicadoForm({
  condominioId,
  initial,
  onClose,
}: {
  condominioId: Id<"condominios">;
  initial?: ComunicadoDraft;
  onClose: () => void;
}) {
  const create = useMutation(api.comunicados.create);
  const update = useMutation(api.comunicados.update);
  const generateUploadUrl = useMutation(api.comunicados.generateUploadUrl);
  const editing = Boolean(initial?.id);

  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [cuerpo, setCuerpo] = useState(initial?.cuerpo ?? "");
  const [audiencia, setAudiencia] = useState<Audiencia>(initial?.audiencia ?? "todos");
  const [prioridad, setPrioridad] = useState<Prioridad>(initial?.prioridad ?? "normal");
  const [fijado, setFijado] = useState(initial?.fijado ?? false);

  // Archivos existentes (modo edición)
  const [archivosExistentes, setArchivosExistentes] = useState<ArchivoItem[]>(
    initial?.archivosItems ?? []
  );
  // Nuevos archivos seleccionados por el usuario
  const [nuevosArchivos, setNuevosArchivos] = useState<File[]>([]);
  const [nuevasPreviews, setNuevasPreviews] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const valid = titulo.trim().length > 0 && cuerpo.trim().length > 0;

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).filter((f) => {
      if (f.size > MAX_SIZE) {
        setError(`"${f.name}" supera el límite de 15 MB.`);
        return false;
      }
      return true;
    });
    setNuevosArchivos((prev) => [...prev, ...arr]);
    arr.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setNuevasPreviews((prev) => [...prev, (e.target?.result as string) ?? ""]);
      };
      reader.readAsDataURL(f);
    });
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeExistente(idx: number) {
    setArchivosExistentes((prev) => prev.filter((_, i) => i !== idx));
  }

  function removeNuevo(idx: number) {
    setNuevosArchivos((prev) => prev.filter((_, i) => i !== idx));
    setNuevasPreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      // Subir nuevos archivos a Convex File Storage
      const nuevosItems: { storageId: Id<"_storage">; mimeType: string; nombre: string }[] = [];
      for (const file of nuevosArchivos) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error(`Error al subir "${file.name}".`);
        const { storageId } = (await res.json()) as { storageId: string };
        nuevosItems.push({
          storageId: storageId as Id<"_storage">,
          mimeType: file.type,
          nombre: file.name,
        });
      }

      const archivosFinales = [
        ...archivosExistentes.map((a) => ({
          storageId: a.storageId as Id<"_storage">,
          mimeType: a.mimeType,
          nombre: a.nombre,
        })),
        ...nuevosItems,
      ];

      if (editing && initial?.id) {
        await update({ id: initial.id, titulo, cuerpo, audiencia, prioridad, fijado, archivos: archivosFinales });
      } else {
        await create({ condominioId, titulo, cuerpo, audiencia, prioridad, fijado, archivos: archivosFinales });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      setBusy(false);
    }
  }

  const totalArchivos = archivosExistentes.length + nuevosArchivos.length;

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Editar comunicado" : "Nuevo comunicado"}
      description="Se mostrará a los residentes seleccionados"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {editing ? "Guardar cambios" : "Publicar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Título</label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Corte de agua programado"
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Mensaje</label>
          <Textarea
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder="Escribe el comunicado…"
            rows={5}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Dirigido a</label>
            <Select value={audiencia} onChange={(e) => setAudiencia(e.target.value as Audiencia)}>
              {AUDIENCIAS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Prioridad</label>
            <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)}>
              {PRIORIDADES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFijado((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
            fijado
              ? "border-brand bg-brand/5 text-foreground"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          <Pin className={cn("h-4 w-4", fijado ? "text-brand" : "text-muted-foreground")} aria-hidden />
          <span className="flex-1 font-medium">Fijar arriba</span>
          <span className="text-xs text-muted-foreground">
            {fijado ? "Fijado" : "No fijado"}
          </span>
        </button>

        {/* Archivos adjuntos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">
              Archivos adjuntos
              {totalArchivos > 0 && (
                <span className="ml-1 text-muted-foreground">({totalArchivos})</span>
              )}
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs text-brand hover:underline disabled:opacity-50"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Agregar imagen o archivo
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {totalArchivos > 0 && (
            <div className="flex flex-wrap gap-2">
              {archivosExistentes.map((a, i) => (
                <ArchivoPreview
                  key={a.storageId}
                  url={a.url}
                  nombre={a.nombre}
                  mimeType={a.mimeType}
                  onRemove={() => removeExistente(i)}
                />
              ))}
              {nuevosArchivos.map((f, i) => (
                <ArchivoPreview
                  key={`nuevo-${i}`}
                  url={nuevasPreviews[i] ?? ""}
                  nombre={f.name}
                  mimeType={f.type}
                  onRemove={() => removeNuevo(i)}
                />
              ))}
            </div>
          )}

          {totalArchivos === 0 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-sm text-muted-foreground transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" />
              Adjuntar imágenes o documentos
            </button>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
