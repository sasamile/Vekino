"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { LifeBuoy, Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Doc } from "@vekino/backend/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

export default function PlatformSoportePage() {
  const [soloAbiertos, setSoloAbiertos] = useState(true);
  const tickets = useQuery(api.soporte.listAll, { soloAbiertos });
  const [selected, setSelected] = useState<Ticket | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LifeBuoy className="h-6 w-6" /> Soporte
          </h1>
          <p className="text-sm text-muted-foreground">
            Tickets de ayuda de toda la plataforma
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {(
            [
              [true, "Abiertos"],
              [false, "Todos"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={label}
              onClick={() => setSoloAbiertos(val)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                soloAbiertos === val
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
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
          title="Sin tickets"
          description="Las solicitudes desde la app móvil aparecen aquí."
        />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const est = ESTADO[t.estado];
            return (
              <Card
                key={t._id}
                className="cursor-pointer p-4 transition-colors hover:bg-accent/40"
                onClick={() => setSelected(t)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{t.asunto}</p>
                  <Badge tone={est.tone}>{est.label}</Badge>
                  <Badge tone="neutral">{CAT[t.categoria]}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.mensaje}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.userNombre} · {t.condominioNombre ?? "Sin condo"} · {fmt(t.createdAt)}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {selected ? (
        <ResponderModal ticket={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function ResponderModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const responder = useMutation(api.soporte.responder);
  const [respuesta, setRespuesta] = useState(ticket.respuesta ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setBusy(true);
    setError(null);
    try {
      await responder({ id: ticket._id, respuesta, estado: "resuelto" });
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
      description={`${ticket.userNombre} · ${ticket.condominioNombre ?? "Plataforma"}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
          <Button size="sm" onClick={confirmar} disabled={busy || !respuesta.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Responder y resolver
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="whitespace-pre-line text-sm">{ticket.mensaje}</p>
        <Textarea
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
          rows={4}
          placeholder="Respuesta…"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </Modal>
  );
}
