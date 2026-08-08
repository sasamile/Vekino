"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  MessagesSquare,
  PhoneOff,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { BurbujaMensaje } from "./burbuja-mensaje";
import { Composer } from "./composer";
import {
  ETIQUETA_SIN_RESPUESTA,
  claveDia,
  fmtSeparadorDia,
  fmtTelefono,
  type ConversacionDetalle,
  type MensajeRow,
} from "./tipos";

/**
 * Panel derecho: el hilo de una conversación, con su cabecera de control y la
 * caja de escritura.
 */
export function HiloPanel({
  conversacionId,
  onVolver,
}: {
  conversacionId: Id<"waConversations">;
  onVolver: () => void;
}) {
  const hilo = useQuery(api.whatsappInbox.hilo, { conversacionId });
  const marcarLeida = useMutation(api.whatsappInbox.marcarLeida);

  /** Texto que se citará en el próximo mensaje, si se pulsó «Responder». */
  const [cita, setCita] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const mensajes = hilo?.mensajes;
  const ultimoId = mensajes?.at(-1)?._id ?? null;

  /** Id del último entrante: al cambiar, la conversación se vuelve a marcar. */
  const ultimoEntranteId = useMemo(() => {
    if (!mensajes) return null;
    for (let i = mensajes.length - 1; i >= 0; i--) {
      const m = mensajes[i];
      if (m && m.direccion === "entrante") return m._id;
    }
    return null;
  }, [mensajes]);

  useEffect(() => {
    void marcarLeida({ conversacionId }).catch(() => {
      /* si falla, el contador se corrige al volver a abrir */
    });
  }, [conversacionId, ultimoEntranteId, marcarLeida]);

  // Baja al final al abrir y cada vez que entra un mensaje nuevo.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [conversacionId, ultimoId]);

  if (hilo === undefined) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <Skeleton className="h-10 w-64 rounded-xl" />
        </div>
        <div className="min-h-0 flex-1 space-y-3 p-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton
              key={i}
              className={cn("h-14 w-2/3 rounded-2xl", i % 2 && "ml-auto")}
            />
          ))}
        </div>
      </div>
    );
  }

  if (hilo === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState
          icon={MessagesSquare}
          title="Conversación no encontrada"
          description="Puede que se haya eliminado. Elige otra de la lista."
          action={
            <Button variant="secondary" size="sm" onClick={onVolver}>
              Volver
            </Button>
          }
        />
      </div>
    );
  }

  const c = hilo.conversacion;
  /** Citar solo tiene sentido si el composer está disponible. */
  const puedeCitar = c.puedeResponder && c.ventanaAbierta;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CabeceraHilo
        conversacionId={conversacionId}
        conversacion={c}
        onVolver={onVolver}
      />

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-muted/25 px-3 py-4 sm:px-5"
      >
        {hilo.mensajes.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Todavía no hay mensajes en esta conversación.
          </p>
        ) : (
          <MensajesConSeparadores
            mensajes={hilo.mensajes}
            onResponder={puedeCitar ? setCita : undefined}
          />
        )}
      </div>

      <Composer
        conversacionId={conversacionId}
        puedeResponder={c.puedeResponder}
        ventanaAbierta={c.ventanaAbierta}
        ventanaExpiraAt={c.ventanaExpiraAt}
        cita={cita}
        onQuitarCita={() => setCita(null)}
      />
    </div>
  );
}

/** Burbujas agrupadas por día, con un separador entre bloques. */
function MensajesConSeparadores({
  mensajes,
  onResponder,
}: {
  mensajes: MensajeRow[];
  onResponder?: (texto: string) => void;
}) {
  let diaPrevio = "";
  return (
    <>
      {mensajes.map((m) => {
        const dia = claveDia(m.createdAt);
        const nuevoDia = dia !== diaPrevio;
        diaPrevio = dia;
        return (
          <Fragment key={m._id}>
            {nuevoDia && (
              <div className="flex justify-center py-2">
                <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  {fmtSeparadorDia(m.createdAt)}
                </span>
              </div>
            )}
            <BurbujaMensaje mensaje={m} onResponder={onResponder} />
          </Fragment>
        );
      })}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Cabecera: quién es, control del agente y escalación                         */
/* -------------------------------------------------------------------------- */

function CabeceraHilo({
  conversacionId,
  conversacion: c,
  onVolver,
}: {
  conversacionId: Id<"waConversations">;
  conversacion: ConversacionDetalle;
  onVolver: () => void;
}) {
  const pausarAgente = useMutation(api.whatsappInbox.pausarAgente);
  const resolverEscalacion = useMutation(api.whatsappInbox.resolverEscalacion);
  const [busy, setBusy] = useState(false);
  const [resolviendo, setResolviendo] = useState(false);

  const agenteActivo = !c.agentePausado;
  const telefono = fmtTelefono(c.telefono);
  /** Segunda línea: lo que sobra después del nombre y el teléfono. */
  const contacto =
    [c.username ? `@${c.username}` : null, c.condominioNombre]
      .filter(Boolean)
      .join(" · ") || (telefono ? "" : "Sin teléfono");

  async function alternarAgente() {
    setBusy(true);
    try {
      // El interruptor muestra «Agente automático»: apagarlo = pausarlo.
      await pausarAgente({ conversacionId, pausar: agenteActivo });
    } catch {
      /* la query reactiva devuelve el interruptor a su valor real */
    } finally {
      setBusy(false);
    }
  }

  async function marcarAtendida() {
    setResolviendo(true);
    try {
      await resolverEscalacion({ conversacionId });
    } catch {
      /* idem */
    } finally {
      setResolviendo(false);
    }
  }

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
        <Button
          size="icon"
          variant="ghost"
          onClick={onVolver}
          aria-label="Volver a la lista"
          className="shrink-0 lg:hidden"
        >
          <ArrowLeft className="h-4.5 w-4.5" aria-hidden />
        </Button>

        <UserAvatar
          name={c.nombre}
          className="mt-0.5 hidden h-9 w-9 shrink-0 bg-muted text-[11px] text-muted-foreground sm:flex"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {c.nombre}
            </p>
            {telefono && (
              <BotonTelefono telefono={c.telefono ?? ""} etiqueta={telefono} />
            )}
            {!c.puedeResponder && (
              <Badge tone="destructive">
                <PhoneOff className="h-3 w-3" aria-hidden />
                {ETIQUETA_SIN_RESPUESTA}
              </Badge>
            )}
            {!c.identificado && (
              <Badge tone="warning">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Sin identificar
              </Badge>
            )}
          </div>
          {contacto && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {contacto}
            </p>
          )}
        </div>

        <div className="shrink-0">
          <InterruptorAgente
            activo={agenteActivo}
            disabled={busy}
            onToggle={() => void alternarAgente()}
          />
        </div>
      </div>

      <p className="px-3 pb-2.5 text-[11px] leading-relaxed text-muted-foreground sm:px-4">
        Cuando respondes desde aquí, el agente se pausa 2 horas para no contestar
        encima.
      </p>

      {c.escalada && (
        <div className="mx-3 mb-3 flex flex-col gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 sm:mx-4 sm:flex-row sm:items-center">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
            aria-hidden
          />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-red-600 dark:text-red-400">
            <span className="font-semibold">Requiere atención.</span>{" "}
            {c.escaladaMotivo ?? "El agente no supo cómo seguir."}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            disabled={resolviendo}
            onClick={() => void marcarAtendida()}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Marcar como atendida
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * El teléfono de la cabecera. Un clic lo copia al portapapeles (en crudo, sin
 * los espacios de la versión legible) y avisa «Copiado ✓» por 2 s.
 */
function BotonTelefono({
  telefono,
  etiqueta,
}: {
  telefono: string;
  etiqueta: string;
}) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const id = window.setTimeout(() => setCopiado(false), 2000);
    return () => window.clearTimeout(id);
  }, [copiado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(telefono);
      setCopiado(true);
    } catch {
      /* sin permiso de portapapeles no hay nada que hacer */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copiar()}
      title="Copiar teléfono"
      aria-label={`Copiar el teléfono ${etiqueta}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11.5px] tracking-tight transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        copiado
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {copiado ? (
        <>
          Copiado
          <Check className="h-3 w-3" aria-hidden />
        </>
      ) : (
        <>
          <Copy className="h-3 w-3 opacity-60" aria-hidden />
          {etiqueta}
        </>
      )}
    </button>
  );
}

/** Interruptor accesible (sin dependencias) para el agente automático. */
function InterruptorAgente({
  activo,
  disabled,
  onToggle,
}: {
  activo: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 rounded-full border border-border px-2 py-1 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-accent",
      )}
    >
      <span
        className={cn(
          "relative h-4.5 w-8 shrink-0 rounded-full transition-colors",
          activo ? "bg-emerald-500" : "bg-muted-foreground/35",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-all",
            activo ? "left-4" : "left-0.5",
          )}
        />
      </span>
      <span className="hidden text-[11.5px] font-medium text-foreground sm:inline">
        Agente automático
      </span>
    </button>
  );
}
