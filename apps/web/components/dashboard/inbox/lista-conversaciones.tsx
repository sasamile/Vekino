"use client";

import { AlertTriangle, MessagesSquare, PhoneOff } from "lucide-react";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { formatearContenido } from "./burbuja-mensaje";
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
    <div className="flex min-h-0 flex-1 flex-col bg-card">
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
          <div className="space-y-3 p-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3 rounded-full" />
                  <Skeleton className="h-3 w-full rounded-full" />
                </div>
              </div>
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
          <ul className="divide-y divide-border/60">
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
  /**
   * El preview de los mensajes viejos llega como el JSON del payload de
   * WhatsApp (y encima recortado por el backend): `formatearContenido` saca de
   * ahí el texto legible. Ver `burbuja-mensaje.tsx`.
   */
  const preview = formatearContenido(c.ultimoTexto.trim()).texto.trim();
  const telefono = fmtTelefono(c.telefono);
  /** Sin número, lo único que identifica a la persona es su @usuario. */
  const subtitulo = telefono ?? (c.username ? `@${c.username}` : null);
  const hayPie =
    Boolean(subtitulo) || Boolean(c.condominioNombre) || c.escalada || !c.puedeResponder;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "true" : undefined}
      className={cn(
        "relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors",
        activa ? "bg-brand/8" : "hover:bg-accent/60",
      )}
    >
      {/* Barra de marca: sin ella el resaltado de la fila abierta no se ve. */}
      {activa && (
        <span
          className="absolute inset-y-0 left-0 w-[3px] bg-brand"
          aria-hidden
        />
      )}

      <UserAvatar name={c.nombre} className="h-11 w-11 text-xs" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-sm text-foreground",
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

        <div className="mt-1 flex items-center gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[12.5px] leading-snug",
              sinLeer ? "font-medium text-foreground" : "text-muted-foreground",
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
              className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-emerald-500 px-1.5 text-[10.5px] font-bold tabular-nums leading-none text-white"
              aria-label={`${c.noLeidos} mensajes sin leer`}
            >
              {c.noLeidos > 99 ? "99+" : c.noLeidos}
            </span>
          )}
        </div>

        {hayPie && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {subtitulo && (
              <span
                className={cn(
                  "min-w-0 truncate text-[11px] text-muted-foreground",
                  telefono && "font-mono tracking-tight",
                )}
              >
                {subtitulo}
              </span>
            )}
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
