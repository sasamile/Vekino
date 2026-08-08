"use client";

import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Camera, FileUp, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPT = "application/pdf,image/*";

function esArchivoPoder(file: File): boolean {
  if (file.type === "application/pdf" || file.type.startsWith("image/")) return true;
  return /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

type Props = {
  file: File | null;
  onFile: (raw: File | null) => void | Promise<void>;
  /** Texto del label superior. */
  label?: string;
  className?: string;
};

/**
 * Selector de documento del poder: arrastrar PDF/foto, elegir archivo o tomar foto.
 */
export function PoderDocumentoInput({
  file,
  onFile,
  label = "Documento del poder (obligatorio) — PDF o foto",
  className,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const recibir = useCallback(
    (raw: File | null) => {
      setDropError(null);
      if (!raw) {
        void onFile(null);
        return;
      }
      if (!esArchivoPoder(raw)) {
        setDropError("Solo PDF o imagen (JPG, PNG, etc.).");
        return;
      }
      void onFile(raw);
    },
    [onFile],
  );

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0] ?? null;
    recibir(dropped);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileRef.current?.click();
    }
  }

  return (
    <div className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          recibir(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          recibir(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={onKeyDown}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragging
            ? "border-brand bg-brand/10"
            : file
              ? "border-emerald-400/60 bg-emerald-50/50"
              : "border-border bg-muted/20 hover:border-brand/50 hover:bg-accent/40",
        )}
      >
        <Upload
          className={cn(
            "h-6 w-6",
            dragging ? "text-brand" : file ? "text-emerald-600" : "text-muted-foreground",
          )}
        />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            {dragging
              ? "Suelta el archivo aquí"
              : file
                ? file.name
                : "Arrastra un PDF o una imagen aquí"}
          </p>
          <p className="text-xs text-muted-foreground">
            {file
              ? file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
                ? "PDF listo para subir · clic para cambiar"
                : "Imagen lista · se convertirá a PDF · clic para cambiar"
              : "o haz clic para elegir · PDF, JPG, PNG"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent"
        >
          <FileUp className="h-4 w-4" />
          Seleccionar archivo
        </button>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Camera className="h-4 w-4" />
          Tomar foto
        </button>
      </div>

      {dropError ? (
        <p className="text-xs text-red-600">{dropError}</p>
      ) : file ? (
        <p className="text-xs text-emerald-600">
          ✓ {file.name}
          {file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
            ? " (PDF listo para subir)"
            : ""}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Desde el celular puedes tomar una foto: se convierte a PDF automáticamente.
        </p>
      )}
    </div>
  );
}
