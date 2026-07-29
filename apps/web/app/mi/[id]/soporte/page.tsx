"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { LifeBuoy, Plus, Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id, Doc } from "@vekino/backend/dataModel";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";

type Ticket = Doc<"soporteTickets">;
type Categoria = Ticket["categoria"];

const CAT: Record<Categoria, string> = {
  factura: "Factura / pagos",
  acceso: "Acceso a la app",
  app: "Problema técnico",
  otro: "Otro",
};

const ESTADO: Record<
  Ticket["estado"],
  { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }
> = {
  abierto: { label: "Abierto", tone: "warning" },
  en_gestion: { label: "En gestión", tone: "info" },
  resuelto: { label: "Resuelto", tone: "success" },
  cerrado: { label: "Cerrado", tone: "neutral" },
};

function fmt(ts: number) {
  return new Date(ts).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PortalSoportePage() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;
  const tickets = useQuery(api.soporte.listMias);
  const [openForm, setOpenForm] = useState(false);

  const mias = tickets?.filter(
    (t) => !t.condominioId || t.condominioId === condominioId,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Soporte"
        description="¿Problema con una factura, el acceso u otra cosa? Escríbenos."
        action={
          <Button variant="brand" onClick={() => setOpenForm(true)}>
            <Plus className="h-4 w-4" />
            Nueva solicitud
          </Button>
        }
      />

      {tickets === undefined ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-5 w-5" />
        </div>
      ) : !mias || mias.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Sin solicitudes aún"
          description="Crea una solicitud y la ven la administración del condominio y el equipo Vekino."
          action={
            <Button variant="brand" onClick={() => setOpenForm(true)}>
              <Plus className="h-4 w-4" />
              Nueva solicitud
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {mias.map((t) => {
            const meta = ESTADO[t.estado];
            return (
              <Card key={t._id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {t.asunto}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {CAT[t.categoria]} · {fmt(t.createdAt)}
                    </p>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t.mensaje}
                </p>
                {t.respuesta ? (
                  <div className="mt-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Respuesta
                      {t.respondidoPorNombre
                        ? ` · ${t.respondidoPorNombre}`
                        : ""}
                    </p>
                    <p className="mt-1 text-sm text-foreground">{t.respuesta}</p>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <NuevaSolicitud
        open={openForm}
        onClose={() => setOpenForm(false)}
        condominioId={condominioId}
      />
    </div>
  );
}

function NuevaSolicitud({
  open,
  onClose,
  condominioId,
}: {
  open: boolean;
  onClose: () => void;
  condominioId: Id<"condominios">;
}) {
  const crear = useMutation(api.soporte.crear);
  const [categoria, setCategoria] = useState<Categoria>("factura");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!asunto.trim() || !mensaje.trim()) {
      setError("Asunto y mensaje son obligatorios.");
      return;
    }
    setBusy(true);
    try {
      await crear({
        condominioId,
        categoria,
        asunto: asunto.trim(),
        mensaje: mensaje.trim(),
      });
      setAsunto("");
      setMensaje("");
      setCategoria("factura");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva solicitud de soporte"
      description="La administración y Vekino recibirán tu mensaje."
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Categoría
          </label>
          <Select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as Categoria)}
          >
            {(Object.keys(CAT) as Categoria[]).map((k) => (
              <option key={k} value={k}>
                {CAT[k]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Asunto
          </label>
          <Input
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            placeholder="Ej. No puedo ver mi factura"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Mensaje
          </label>
          <Textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={4}
            placeholder="Cuéntanos qué pasó…"
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="brand" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enviar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
