"use client";

import { useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { MAX_DESCRIPCION, MAX_NOMBRE, MAX_SERIAL } from "@vekino/backend/inventario";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useUploadToS3 } from "@/hooks/use-upload-s3";

/**
 * Alta y edición de un elemento del inventario.
 *
 * Un solo formulario para las dos cosas: los campos son los mismos y tener dos
 * pantallas casi iguales garantiza que la segunda se quede atrás cuando se
 * añada un campo.
 *
 * El estado del elemento no se pide: hoy todo nace `disponible` y no hay otra
 * cosa que elegir. Cuando existan `averiado` o `mantenimiento` los moverá una
 * acción propia —con su motivo y su novedad—, no una casilla de este
 * formulario.
 */

export type ItemEditable = {
  _id: Id<"inventarioItems">;
  nombre: string;
  serial: string | null;
  descripcion: string | null;
  fotoUrl: string | null;
};

export function ItemFormDialog({
  companiaId,
  item,
  onClose,
  onGuardado,
  overlayClassName,
}: {
  companiaId: Id<"companiasSeguridad">;
  /** Ausente = alta. Presente = edición de ese elemento. */
  item?: ItemEditable;
  onClose: () => void;
  onGuardado?: (itemId: Id<"inventarioItems">) => void;
  /** Para apilarlo sobre otro modal (la ficha del elemento). */
  overlayClassName?: string;
}) {
  const crear = useMutation(api.inventario.crear);
  const editar = useMutation(api.inventario.editar);
  const subir = useUploadToS3();
  /* Id propio y no una constante: el boton de guardar vive en el pie del
   * modal, fuera del <form>, y lo alcanza por `form="..."`. Con un id fijo,
   * dos instancias abiertas a la vez —alta y edicion— dejarian dos formularios
   * con el mismo id y el boton enviaria el que no es. */
  const formId = useId();
  const inputFoto = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [serial, setSerial] = useState(item?.serial ?? "");
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? "");
  const [fotoUrl, setFotoUrl] = useState(item?.fotoUrl ?? "");

  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegirFoto(archivo: File) {
    setError(null);
    setSubiendo("Subiendo foto…");
    try {
      const { url } = await subir(archivo, `inventario/${companiaId}`, {
        onProgress: (p) => setSubiendo(p.label),
      });
      setFotoUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(null);
      if (inputFoto.current) inputFoto.current.value = "";
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      /* Se mandan siempre los cuatro campos, también los vacíos: `editar`
       * tiene semántica de formulario completo y es lo que permite borrar una
       * descripción. Ver el comentario de la mutación. */
      const datos = {
        nombre: nombre.trim(),
        serial: serial.trim() || undefined,
        descripcion: descripcion.trim() || undefined,
        fotoUrl: fotoUrl.trim() || undefined,
      };
      const id = item
        ? (await editar({ itemId: item._id, ...datos }), item._id)
        : await crear({ companiaId, ...datos });
      onGuardado?.(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? "Editar elemento" : "Nuevo elemento"}
      description={
        item
          ? "Los cambios quedan registrados en el historial."
          : "Se añade al inventario de la compañía."
      }
      className="max-w-lg"
      overlayClassName={overlayClassName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={busy || !!subiendo}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {item ? "Guardar cambios" : "Crear elemento"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={guardar} className="space-y-4">
        <Campo label="Nombre" requerido>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={MAX_NOMBRE}
            placeholder="Radio Motorola DEP450"
            required
            autoFocus
          />
        </Campo>

        <Campo label="Serial">
          <Input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            maxLength={MAX_SERIAL}
            placeholder="VK-1042"
          />
          <p className="text-[11.5px] text-muted-foreground">
            Opcional, pero no puede repetirse entre los elementos activos. Déjalo
            vacío si el elemento no tiene serial grabado (chalecos, conos…).
          </p>
        </Campo>

        <Campo label="Descripción">
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={MAX_DESCRIPCION}
            rows={3}
            placeholder="Con batería de repuesto y cargador"
          />
        </Campo>

        <Campo label="Foto">
          <div className="flex items-center gap-3">
            {fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fotoUrl}
                alt=""
                className="h-16 w-16 rounded-xl border border-border object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
                <ImagePlus className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => inputFoto.current?.click()}
                disabled={!!subiendo}
              >
                {subiendo ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {subiendo}
                  </>
                ) : fotoUrl ? (
                  "Cambiar foto"
                ) : (
                  "Subir foto"
                )}
              </Button>
              {fotoUrl && !subiendo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFotoUrl("")}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Quitar
                </Button>
              )}
            </div>

            <input
              ref={inputFoto}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void elegirFoto(f);
              }}
            />
          </div>
        </Campo>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function Campo({
  label,
  requerido,
  children,
}: {
  label: string;
  requerido?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-foreground">
        {label}
        {requerido && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}
