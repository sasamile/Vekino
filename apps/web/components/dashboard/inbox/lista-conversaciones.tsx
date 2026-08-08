"use client";

import { AlertTriangle, MessagesSquare, PhoneOff } from "lucide-react";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import {
  ETIQUETA_SIN_RESPUESTA,
  FILTROS_INBOX,
  fmtHoraLista,
  fmtTelefono,
  type ConversacionRow,
  type FiltroInbox,
} from "./tipos";

/**
 * Columna izquierda del inbox: buscador, filtros y conversaciones ordenadas
 * por último mensaje.
 */
export function ListaConversaciones({
  conversaciones,
  seleccionadaId,
  onSeleccionar,
  busqueda,
  onBusqueda,
  filtro,
  onFiltro,
}: {
  /** `undefined` mientras carga la query. */
  conversaciones: ConversacionRow[] | undefined;
  seleccionadaId: Id<"waConversations"> | null;
  onSeleccionar: (id: Id<"waConversations">) => void;
  busqueda: string;
  onBusqueda: (valor: string) => void;
  filtro: FiltroInbox;
  onFiltro: (valor: FiltroInbox) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-4">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Bandeja de WhatsApp
          </h1>
          <p className="text-xs text-muted-foreground">
            Conversaciones de los residentes con el bot.
          </p>
        </div>

        <SearchInput
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          placeholder="Buscar por nombre, @usuario o teléfono…"
          aria-label="Buscar conversaciones"
        />

        <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-muted p-1">
          {FILTROS_INBOX.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onFiltro(f.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                filtro === f.value
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {conversaciones === undefined ? (
          <div className="space-y-2 p-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : conversaciones.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={MessagesSquare}
              title={
                busqueda.trim()
                  ? "Sin resultados"
                  : filtro === "no_leidos"
                    ? "Nada sin leer"
                    : filtro === "escaladas"
                      ? "Nada escalado"
                      : "Sin conversaciones"
              }
              description={
                busqueda.trim()
                  ? "Prueba con otro nombre, @usuario o teléfono."
                  : filtro === "todos"
                    ? "Cuando un residente le escriba al bot, la conversación aparece aquí."
                    : "Cambia el filtro para ver las demás conversaciones."
              }
              className="px-4 py-10"
            />
          </div>
        ) : (
          <ul className="p-1.5">
            {conversaciones.map((c) => (
              <li key={c._id}>
                <FilaConversacion
                  conversacion={c}
                  activa={c._id === seleccionadaId}
                  onClick={() => onSeleccionar(c._id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilaConversacion({
  conversacion: c,
  activa,
  onClick,
}: {
  conversacion: ConversacionRow;
  activa: boolean;
  onClick: () => void;
}) {
  const sinLeer = c.noLeidos > 0;
  const preview = c.ultimoTexto.trim();
  const telefono = fmtTelefono(c.telefono);
  /** Sin número, lo único que identifica a la persona es su @usuario. */
  const subtitulo = telefono ?? (c.username ? `@${c.username}` : null);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "true" : undefined}
      className={cn(
        "relative flex w-full items-start gap-2.5 rounded-xl py-2.5 pl-3.5 pr-2.5 text-left transition-colors",
        activa
          ? "bg-brand/10 ring-1 ring-inset ring-brand/25"
          : "hover:bg-accent",
      )}
    >
      {/* Barra de marca: sin ella el resaltado de la fila abierta no se ve. */}
      {activa && (
        <span
          className="absolute inset-y-2 left-1 w-1 rounded-full bg-brand"
          aria-hidden
        />
      )}

      <UserAvatar
        name={c.nombre}
        className="mt-0.5 h-9 w-9 bg-muted text-[11px] text-muted-foreground"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[13.5px] text-foreground",
              sinLeer ? "font-semibold" : "font-medium",
            )}
          >
            {c.nombre}
          </p>
          <span
            className={cn(
              "shrink-0 text-[11px] tabular-nums",
              sinLeer
                ? "font-medium text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground",
            )}
          >
            {fmtHoraLista(c.ultimoMensajeAt)}
          </span>
        </div>

        {subtitulo && (
          <p
            className={cn(
              "mt-0.5 truncate text-[11px] text-muted-foreground",
              telefono && "font-mono tracking-tight",
            )}
          >
            {subtitulo}
          </p>
        )}

        <div className="mt-0.5 flex items-center gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[12.5px]",
              sinLeer ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {preview ? (
              <>
                {!c.ultimoEsEntrante && (
                  <span className="font-normal text-muted-foreground">Tú: </span>
                )}
                {preview}
              </>
            ) : (
              <span className="font-normal italic text-muted-foreground">
                Sin texto
              </span>
            )}
          </p>
          {sinLeer && (
            <span
              className="grid h-5.5 min-w-5.5 shrink-0 place-items-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold tabular-nums leading-none text-white shadow-sm"
              aria-label={`${c.noLeidos} mensajes sin leer`}
            >
              {c.noLeidos > 99 ? "99+" : c.noLeidos}
            </span>
          )}
        </div>

        {(c.condominioNombre || c.escalada || !c.puedeResponder) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {c.condominioNombre && (
              <Badge tone="neutral" className="max-w-full">
                <span className="truncate">{c.condominioNombre}</span>
              </Badge>
            )}
            {!c.puedeResponder && (
              <Badge tone="destructive">
                <PhoneOff className="h-3 w-3" aria-hidden />
                {ETIQUETA_SIN_RESPUESTA}
              </Badge>
            )}
            {c.escalada && (
              <Badge tone="destructive">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Requiere atención
              </Badge>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
