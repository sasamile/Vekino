"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2, X } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Doc, Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  AdjuntosPicker,
  carpetaSoporte,
  type ArchivoAdjunto,
} from "@/components/soporte/adjuntos-picker";

type Categoria = Doc<"soporteTickets">["categoria"];

const CATEGORIAS: Array<{ value: Categoria; label: string }> = [
  { value: "factura", label: "Factura" },
  { value: "acceso", label: "Acceso" },
  { value: "app", label: "App o técnico" },
  { value: "otro", label: "Otro" },
];

/**
 * Abre una solicitud de soporte hacia el equipo Vekino (con capturas/PDF).
 * La usan tanto el administrador del condominio como el portal del residente.
 */
export function NuevoTicketDialog({
  condominioId,
  onClose,
  onCreated,
}: {
  condominioId?: Id<"condominios">;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const crear = useMutation(api.soporte.crear);
  const [categoria, setCategoria] = useState<Categoria>("app");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [archivos, setArchivos] = useState<ArchivoAdjunto[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUploadingChange = useCallback((v: boolean) => setSubiendo(v), []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!asunto.trim() || !mensaje.trim()) {
      setError("Asunto y mensaje son obligatorios.");
      return;
    }
    if (subiendo) {
      setError("Espera a que terminen de subir los adjuntos.");
      return;
    }

    setBusy(true);
    try {
      await crear({
        condominioId,
        categoria,
        asunto: asunto.trim(),
        mensaje: mensaje.trim(),
        archivos: archivos.length ? archivos : undefined,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo enviar la solicitud.",
      );
      setBusy(false);
    }
  }

  const bloqueado = busy || subiendo;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 py-6 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nuevo-ticket-title"
        className="my-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-floating"
      >
        <div className="mb-1 flex items-center justify-between gap-4">
          <h2
            id="nuevo-ticket-title"
            className="text-lg font-semibold text-foreground"
          >
            Nueva solicitud de soporte
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={bloqueado}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Cuéntanos qué pasó y adjunta capturas si te sirve. El equipo Vekino la
          recibe de inmediato.
        </p>

        <form onSubmit={enviar} className="space-y-4">
          <div>
            <label
              htmlFor="ticket-categoria"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Categoría
            </label>
            <Select
              id="ticket-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as Categoria)}
              disabled={bloqueado}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label
              htmlFor="ticket-asunto"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Asunto
            </label>
            <Input
              id="ticket-asunto"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              placeholder="Ej. No puedo generar las facturas del mes"
              maxLength={120}
              required
              disabled={bloqueado}
            />
          </div>

          <div>
            <label
              htmlFor="ticket-mensaje"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Mensaje
            </label>
            <Textarea
              id="ticket-mensaje"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={5}
              placeholder="Describe el problema: qué intentabas hacer, qué pasó y en qué pantalla."
              required
              disabled={bloqueado}
            />
          </div>

          <AdjuntosPicker
            folder={carpetaSoporte(condominioId)}
            archivos={archivos}
            onChange={setArchivos}
            onUploadingChange={onUploadingChange}
            disabled={busy}
            label="Capturas o documentos (opcional)"
          />

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onClose}
              disabled={bloqueado}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="brand"
              className="flex-1"
              disabled={bloqueado || !asunto.trim() || !mensaje.trim()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy
                ? "Enviando…"
                : subiendo
                  ? "Subiendo adjuntos…"
                  : "Enviar solicitud"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
