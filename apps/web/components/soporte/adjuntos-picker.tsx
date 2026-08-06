"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadToS3 } from "@/hooks/use-upload-s3";
import { compressImage, formatBytes } from "@/lib/compress-image";

/** Mismo shape que `archivos` / `archivosRespuesta` en `soporteTickets`. */
export type ArchivoAdjunto = {
  url: string;
  s3Key?: string;
  mimeType: string;
  nombre: string;
};

export const MAX_ADJUNTOS = 5;
/** Peso máximo por archivo (antes de comprimir imágenes). */
export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024;
export const ADJUNTOS_ACCEPT = "image/*,application/pdf";

type Progreso = { label: string; percent: number | null };

type Pendiente = {
  id: string;
  nombre: string;
  size: number;
  /** blob: URL para previsualizar imágenes mientras suben. */
  preview: string | null;
  progreso: Progreso;
};

export function esImagen(a: { mimeType: string }) {
  return a.mimeType.startsWith("image/");
}

function nuevoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Selector de adjuntos para soporte: sube a S3 al seleccionar y devuelve
 * `{ url, s3Key, mimeType, nombre }` listos para `api.soporte.crear/responder`.
 */
export function AdjuntosPicker({
  folder,
  archivos,
  onChange,
  onUploadingChange,
  disabled,
  max = MAX_ADJUNTOS,
  label = "Adjuntos (opcional)",
  hint,
}: {
  /** Carpeta destino en S3, ej. `soporte/{condominioId}`. */
  folder: string;
  archivos: ArchivoAdjunto[];
  onChange: (archivos: ArchivoAdjunto[]) => void;
  /** Avisa al padre para deshabilitar el envío mientras suben archivos. */
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  max?: number;
  label?: string;
  hint?: string;
}) {
  const uploadFile = useUploadToS3();
  const inputRef = useRef<HTMLInputElement>(null);
  const archivosRef = useRef(archivos);
  const pendientesRef = useRef<Pendiente[]>([]);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    archivosRef.current = archivos;
  }, [archivos]);

  useEffect(() => {
    pendientesRef.current = pendientes;
  }, [pendientes]);

  const subiendo = pendientes.length > 0;

  // Ref para no reejecutar el aviso si el padre pasa una función inline.
  const notificarRef = useRef(onUploadingChange);
  notificarRef.current = onUploadingChange;
  useEffect(() => {
    notificarRef.current?.(subiendo);
  }, [subiendo]);

  // Libera los blob: URL al desmontar.
  useEffect(() => {
    return () => {
      for (const p of pendientesRef.current) {
        if (p.preview) URL.revokeObjectURL(p.preview);
      }
    };
  }, []);

  const setProgreso = useCallback((id: string, progreso: Progreso) => {
    setPendientes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, progreso } : p)),
    );
  }, []);

  const quitarPendiente = useCallback((id: string) => {
    setPendientes((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found?.preview) URL.revokeObjectURL(found.preview);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);

    const espacio =
      max - archivosRef.current.length - pendientesRef.current.length;
    if (espacio <= 0) {
      setError(`Puedes adjuntar máximo ${max} archivos.`);
      return;
    }

    const validos: File[] = [];
    let mensaje: string | null = null;
    for (const file of files) {
      if (validos.length >= espacio) {
        mensaje = `Solo se admiten ${max} archivos; se omitieron los demás.`;
        break;
      }
      const ok =
        file.type.startsWith("image/") || file.type === "application/pdf";
      if (!ok) {
        mensaje = `"${file.name}" no es una imagen ni un PDF.`;
        continue;
      }
      if (file.size > MAX_ADJUNTO_BYTES) {
        mensaje = `"${file.name}" supera los 10 MB.`;
        continue;
      }
      validos.push(file);
    }
    if (mensaje) setError(mensaje);
    if (validos.length === 0) return;

    // Se suben en orden para no saturar la conexión (móvil).
    for (const file of validos) {
      const id = nuevoId();
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null;

      setPendientes((prev) => [
        ...prev,
        {
          id,
          nombre: file.name,
          size: file.size,
          preview,
          progreso: { label: "Preparando…", percent: null },
        },
      ]);

      try {
        let final: File = file;
        if (file.type.startsWith("image/")) {
          setProgreso(id, {
            label: `Optimizando… (${formatBytes(file.size)})`,
            percent: null,
          });
          final = await compressImage(file, { maxEdge: 1600, quality: 0.8 });
        }

        setProgreso(id, {
          label: `Subiendo… (${formatBytes(final.size)})`,
          percent: 5,
        });

        const { url, key } = await uploadFile(final, folder, {
          onProgress: (p) => setProgreso(id, { label: p.label, percent: p.percent }),
        });

        const adjunto: ArchivoAdjunto = {
          url,
          s3Key: key,
          mimeType: final.type || file.type || "application/octet-stream",
          nombre: final.name || file.name,
        };
        const siguiente = [...archivosRef.current, adjunto];
        archivosRef.current = siguiente;
        onChange(siguiente);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `No se pudo subir "${file.name}".`,
        );
      } finally {
        quitarPendiente(id);
      }
    }
  }

  function quitar(index: number) {
    const siguiente = archivosRef.current.filter((_, i) => i !== index);
    archivosRef.current = siguiente;
    onChange(siguiente);
    setError(null);
  }

  const lleno = archivos.length + pendientes.length >= max;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className="text-[11px] text-muted-foreground">
          {archivos.length}/{max}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ADJUNTOS_ACCEPT}
        multiple
        className="hidden"
        onChange={onPick}
      />

      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
        {archivos.length > 0 || pendientes.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {archivos.map((a, i) =>
              esImagen(a) ? (
                <div key={`${a.url}-${i}`} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.nombre}
                    className="h-20 w-20 rounded-xl border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => quitar(i)}
                    disabled={disabled}
                    aria-label={`Quitar ${a.nombre}`}
                    className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  key={`${a.url}-${i}`}
                  className="flex max-w-[15rem] items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2"
                >
                  <FileText className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {a.nombre}
                  </span>
                  <button
                    type="button"
                    onClick={() => quitar(i)}
                    disabled={disabled}
                    aria-label={`Quitar ${a.nombre}`}
                    className="shrink-0 rounded-lg p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            )}

            {pendientes.map((p) =>
              p.preview ? (
                <div key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.preview}
                    alt=""
                    className="h-20 w-20 rounded-xl border border-border object-cover opacity-50"
                  />
                  <span className="absolute inset-0 grid place-items-center rounded-xl bg-foreground/35">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </span>
                </div>
              ) : (
                <div
                  key={p.id}
                  className="flex max-w-[15rem] items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2"
                >
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-brand"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {p.nombre}
                  </span>
                </div>
              ),
            )}
          </div>
        ) : null}

        {pendientes.length > 0 ? (
          <div className="mb-3 space-y-2">
            {pendientes.map((p) => (
              <UploadProgressBar key={p.id} progress={p.progreso} />
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || lleno}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {archivos.length > 0 ? "Agregar otro" : "Adjuntar archivo"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {hint ?? `Imágenes o PDF · máx. ${max} archivos · 10 MB c/u`}
          </p>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Lista de solo lectura: miniaturas para imágenes, chip con link para PDFs. */
export function AdjuntosLista({
  archivos,
  titulo,
  className,
}: {
  archivos?: ArchivoAdjunto[] | null;
  titulo?: string;
  className?: string;
}) {
  if (!archivos || archivos.length === 0) return null;
  return (
    <div className={className}>
      {titulo ? (
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {archivos.map((a, i) =>
          esImagen(a) ? (
            <a
              key={`${a.url}-${i}`}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              title={a.nombre}
              className="block overflow-hidden rounded-xl border border-border transition-opacity hover:opacity-85"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.nombre}
                className="h-20 w-20 object-cover"
              />
            </a>
          ) : (
            <a
              key={`${a.url}-${i}`}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-[15rem] items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 transition-colors hover:bg-accent"
            >
              <FileText className="h-4 w-4 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 truncate text-xs text-foreground">
                {a.nombre}
              </span>
            </a>
          ),
        )}
      </div>
    </div>
  );
}

/** Mismo patrón visual que edit-condo-dialog. */
function UploadProgressBar({ progress }: { progress: Progreso }) {
  const pct = progress.percent;
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{progress.label}</span>
        {pct != null ? (
          <span className="shrink-0 font-medium tabular-nums text-foreground">
            {pct}%
          </span>
        ) : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full bg-brand transition-[width] duration-300 ${
            pct == null ? "w-1/3 animate-pulse" : ""
          }`}
          style={pct != null ? { width: `${Math.max(4, pct)}%` } : undefined}
        />
      </div>
    </div>
  );
}

/** Carpeta S3 estándar para adjuntos de soporte. */
export function carpetaSoporte(condominioId?: string) {
  return condominioId ? `soporte/${condominioId}` : "soporte/plataforma";
}
