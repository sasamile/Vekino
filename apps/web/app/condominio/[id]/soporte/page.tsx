"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { LifeBuoy, Loader2, Paperclip, Plus } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id, Doc } from "@vekino/backend/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/input";
import { PageContainer } from "@/components/layout/page-container";
import { NuevoTicketDialog } from "@/components/soporte/nuevo-ticket-dialog";
import {
  AdjuntosLista,
  AdjuntosPicker,
  carpetaSoporte,
  type ArchivoAdjunto,
} from "@/components/soporte/adjuntos-picker";

type Ticket = Doc<"soporteTickets">;

const CAT: Record<Ticket["categoria"], string> = {
  factura: "Factura",
  acceso: "Acceso",
  app: "App / técnico",
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

export default function CondominioSoportePage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const tickets = useQuery(api.soporte.listByCondominio, { condominioId });
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  return (
    <PageContainer>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <LifeBuoy className="h-5 w-5 text-brand" /> Soporte
          </h1>
          <p className="text-sm text-muted-foreground">
            Solicitudes de residentes y tus propias solicitudes al equipo Vekino
          </p>
        </div>
        <Button
          variant="brand"
          className="shrink-0 self-start sm:self-auto"
          onClick={() => setNuevoAbierto(true)}
        >
          <Plus className="h-4 w-4" />
          Nueva solicitud
        </Button>
      </div>

      {tickets === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="Sin solicitudes"
          description="Cuando un residente pida ayuda desde la app aparecerá aquí. También puedes abrir tú una solicitud al equipo Vekino."
          action={
            <Button variant="brand" onClick={() => setNuevoAbierto(true)}>
              <Plus className="h-4 w-4" />
              Nueva solicitud
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const est = ESTADO[t.estado];
            const adjuntos = t.archivos?.length ?? 0;
            return (
              <Card
                key={t._id}
                className="cursor-pointer p-4 transition-colors hover:bg-accent/40"
                onClick={() => setSelected(t)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-foreground">{t.asunto}</p>
                  <Badge tone={est.tone}>{est.label}</Badge>
                  <Badge tone="neutral">{CAT[t.categoria]}</Badge>
                  {adjuntos > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" aria-hidden />
                      {adjuntos}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.mensaje}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.userNombre} · {t.userEmail} · {fmt(t.createdAt)}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {selected ? (
        <ResponderModal
          ticket={selected}
          condominioId={condominioId}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {nuevoAbierto ? (
        <NuevoTicketDialog
          condominioId={condominioId}
          onClose={() => setNuevoAbierto(false)}
        />
      ) : null}
    </PageContainer>
  );
}

function ResponderModal({
  ticket,
  condominioId,
  onClose,
}: {
  ticket: Ticket;
  condominioId: Id<"condominios">;
  onClose: () => void;
}) {
  const responder = useMutation(api.soporte.responder);
  const [respuesta, setRespuesta] = useState(ticket.respuesta ?? "");
  const [archivos, setArchivos] = useState<ArchivoAdjunto[]>(
    ticket.archivosRespuesta ?? [],
  );
  const [subiendo, setSubiendo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUploadingChange = useCallback((v: boolean) => setSubiendo(v), []);

  async function confirmar() {
    setBusy(true);
    setError(null);
    try {
      await responder({
        id: ticket._id,
        respuesta,
        estado: "resuelto",
        archivos: archivos.length ? archivos : undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo responder.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ticket.asunto}
      description={`${ticket.userNombre} · ${CAT[ticket.categoria]}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
          <Button
            size="sm"
            onClick={confirmar}
            disabled={busy || subiendo || !respuesta.trim()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {subiendo ? "Subiendo adjuntos…" : "Responder y resolver"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="whitespace-pre-line text-sm text-foreground">{ticket.mensaje}</p>
        <AdjuntosLista archivos={ticket.archivos} titulo="Adjuntos" />
        <Textarea
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
          rows={4}
          placeholder="Tu respuesta al residente…"
          disabled={busy}
        />
        <AdjuntosPicker
          folder={carpetaSoporte(ticket.condominioId ?? condominioId)}
          archivos={archivos}
          onChange={setArchivos}
          onUploadingChange={onUploadingChange}
          disabled={busy}
          label="Adjuntar a la respuesta (opcional)"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </Modal>
  );
}
