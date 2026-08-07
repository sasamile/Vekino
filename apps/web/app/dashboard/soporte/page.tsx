"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, LifeBuoy, Loader2, Paperclip } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Doc, Id } from "@vekino/backend/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/input";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  AdjuntosLista,
  AdjuntosPicker,
  carpetaSoporte,
  type ArchivoAdjunto,
} from "@/components/soporte/adjuntos-picker";
import { cn } from "@/lib/utils";

type Ticket = Doc<"soporteTickets"> & { unidadesLabel?: string };

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

function pendiente(estado: Ticket["estado"]) {
  return estado === "abierto" || estado === "en_gestion";
}

export default function PlatformSoportePage() {
  const [soloAbiertos, setSoloAbiertos] = useState(true);
  const tickets = useQuery(api.soporte.listAll, { soloAbiertos });
  const pendientes = useQuery(api.soporte.countPendientes);
  const setEstado = useMutation(api.soporte.setEstado);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [marcandoId, setMarcandoId] = useState<Id<"soporteTickets"> | null>(
    null,
  );

  async function marcarResuelta(id: Id<"soporteTickets">) {
    setMarcandoId(id);
    try {
      await setEstado({ id, estado: "resuelto" });
      if (selected?._id === id) setSelected(null);
    } catch {
      /* el toast no existe aquí; el badge/lista se actualizan solos */
    } finally {
      setMarcandoId(null);
    }
  }

  return (
    <PageContainer>
      <div className="w-full space-y-6">
        <PageHeader
          title="Soporte"
          description={
            pendientes != null && pendientes > 0
              ? `${pendientes} ticket${pendientes === 1 ? "" : "s"} pendiente${pendientes === 1 ? "" : "s"}`
              : "Tickets de ayuda de toda la plataforma"
          }
        />
        <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
          {(
            [
              [true, "Pendientes", pendientes],
              [false, "Todos", null],
            ] as const
          ).map(([val, label, count]) => (
            <button
              key={label}
              onClick={() => setSoloAbiertos(val)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                soloAbiertos === val
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {label}
              {count != null && count > 0 ? (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-black">
                  {count}
                </span>
              ) : null}
            </button>
          ))}
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
              const esPendiente = pendiente(t.estado);
              return (
                <Card
                  key={t._id}
                  className="p-5 transition-colors hover:bg-accent/40"
                >
                  <button
                    type="button"
                    className="w-full cursor-pointer text-left"
                    onClick={() => setSelected(t)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold">{t.asunto}</p>
                      <Badge tone={est.tone}>{est.label}</Badge>
                      <Badge tone="neutral">{CAT[t.categoria]}</Badge>
                      {t.archivos?.length ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="h-3.5 w-3.5" aria-hidden />
                          {t.archivos.length}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                      {t.mensaje}
                    </p>
                    <div className="mt-3 space-y-1 border-t border-border/60 pt-3">
                      <p className="text-sm font-semibold text-foreground">
                        {t.userNombre}
                      </p>
                      <p className="text-sm text-foreground/90">{t.userEmail}</p>
                      <p className="text-sm text-foreground/80">
                        {t.condominioNombre ?? "Sin conjunto"}
                        {t.unidadesLabel ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {t.unidadesLabel}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(t.createdAt)}
                      </p>
                    </div>
                  </button>
                  {esPendiente ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelected(t)}
                      >
                        Responder
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void marcarResuelta(t._id)}
                        disabled={marcandoId === t._id}
                      >
                        {marcandoId === t._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Marcar resuelta
                      </Button>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {selected ? (
        <ResponderModal
          ticket={selected}
          onClose={() => setSelected(null)}
          onMarcarResuelta={() => void marcarResuelta(selected._id)}
          marcando={marcandoId === selected._id}
        />
      ) : null}
    </PageContainer>
  );
}

function ResponderModal({
  ticket,
  onClose,
  onMarcarResuelta,
  marcando,
}: {
  ticket: Ticket;
  onClose: () => void;
  onMarcarResuelta: () => void;
  marcando: boolean;
}) {
  const responder = useMutation(api.soporte.responder);
  const setEstado = useMutation(api.soporte.setEstado);
  const [respuesta, setRespuesta] = useState(ticket.respuesta ?? "");
  const [archivos, setArchivos] = useState<ArchivoAdjunto[]>(
    ticket.archivosRespuesta ?? [],
  );
  const [subiendo, setSubiendo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUploadingChange = useCallback((v: boolean) => setSubiendo(v), []);
  const esPendiente = pendiente(ticket.estado);

  async function enviar(estado: "resuelto" | "en_gestion") {
    setBusy(true);
    setError(null);
    try {
      const texto = respuesta.trim();
      if (texto) {
        await responder({
          id: ticket._id,
          respuesta: texto,
          estado,
          archivos: archivos.length ? archivos : undefined,
        });
      } else {
        await setEstado({ id: ticket._id, estado });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ticket.asunto}
      description={[
        ticket.userNombre,
        ticket.userEmail,
        ticket.condominioNombre ?? "Plataforma",
        ticket.unidadesLabel || null,
      ]
        .filter(Boolean)
        .join(" · ")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
          {esPendiente ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void enviar("en_gestion")}
                disabled={busy || subiendo}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar y dejar abierta
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  void (respuesta.trim()
                    ? enviar("resuelto")
                    : onMarcarResuelta())
                }
                disabled={busy || subiendo || marcando}
              >
                {busy || marcando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {subiendo
                  ? "Subiendo adjuntos…"
                  : respuesta.trim()
                    ? "Responder y resolver"
                    : "Marcar resuelta"}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-sm">
          <p className="font-semibold text-foreground">{ticket.userNombre}</p>
          <p className="text-foreground/90">{ticket.userEmail}</p>
          <p className="mt-1 text-foreground/80">
            {ticket.condominioNombre ?? "Sin conjunto"}
            {ticket.unidadesLabel ? ` · ${ticket.unidadesLabel}` : ""}
          </p>
        </div>
        <p className="whitespace-pre-line text-sm">{ticket.mensaje}</p>
        <AdjuntosLista archivos={ticket.archivos} titulo="Adjuntos del reporte" />
        {ticket.respuesta ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3 text-sm">
            <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Respuesta anterior
            </p>
            <p className="whitespace-pre-line text-foreground/90">
              {ticket.respuesta}
            </p>
          </div>
        ) : null}
        {esPendiente ? (
          <>
            <Textarea
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              rows={4}
              placeholder="Respuesta (opcional si solo marcas como resuelta)…"
              disabled={busy}
            />
            <AdjuntosPicker
              folder={carpetaSoporte(ticket.condominioId)}
              archivos={archivos}
              onChange={setArchivos}
              onUploadingChange={onUploadingChange}
              disabled={busy}
              label="Adjuntar a la respuesta (opcional)"
            />
          </>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </Modal>
  );
}
