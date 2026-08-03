"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Chat compartido de la sala: sheet desde abajo (móvil) / centrado (desktop).
 * Todos los que tienen acceso a la sala pueden leer y escribir.
 */
export function SalaChatSheet({
  asambleaId,
  abierto,
  onClose,
  codigoPoder,
  miNombre,
  miUserId,
}: {
  asambleaId: Id<"asambleas">;
  abierto: boolean;
  onClose: () => void;
  codigoPoder?: string;
  miNombre?: string;
  miUserId?: Id<"users"> | null;
}) {
  const mensajes = useQuery(
    api.salaVideo.mensajesSala,
    abierto ? { asambleaId, codigoPoder } : "skip",
  );
  const enviar = useMutation(api.salaVideo.enviarMensaje);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const vistoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!abierto || !mensajes?.length) return;
    const el = listaRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    const ultimo = mensajes[mensajes.length - 1]?._id as string | undefined;
    if (ultimo) vistoRef.current = ultimo;
  }, [abierto, mensajes]);

  if (!abierto) return null;

  async function mandar() {
    const t = texto.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      await enviar({ asambleaId, texto: t, codigoPoder });
      setTexto("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar chat"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-label="Chat de la sala"
        className="relative z-10 flex h-[min(70dvh,560px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#14161b] shadow-2xl sm:h-[min(75vh,600px)] sm:rounded-2xl"
      >
        <div className="flex shrink-0 flex-col border-b border-white/10">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </div>
          <div className="flex items-center gap-2 px-4 py-3">
            <MessageCircle className="h-5 w-5 text-white/50" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Chat de la sala</p>
              <p className="text-[11px] text-white/45">
                Visible para todos los que están aquí
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div
          ref={listaRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
          {mensajes === undefined ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </div>
          ) : mensajes.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/40">
              Aún no hay mensajes. Sé el primero en escribir.
            </p>
          ) : (
            mensajes.map((m) => {
              const mio =
                (miUserId && m.userId === miUserId) ||
                (!!miNombre &&
                  m.nombre.trim().toLowerCase() ===
                    miNombre.trim().toLowerCase());
              return (
                <div
                  key={m._id as string}
                  className={cn(
                    "flex flex-col gap-0.5",
                    mio ? "items-end" : "items-start",
                  )}
                >
                  <span className="px-1 text-[10px] font-medium text-white/40">
                    {mio ? "Tú" : m.nombre}
                  </span>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                      mio
                        ? "rounded-br-md bg-emerald-500 text-white"
                        : "rounded-bl-md bg-white/10 text-white/90",
                    )}
                  >
                    {m.texto}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error ? (
            <p className="mb-2 text-xs text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void mandar();
            }}
          >
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe un mensaje…"
              maxLength={400}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-base text-white placeholder:text-white/35 outline-none focus:border-white/25"
            />
            <button
              type="submit"
              disabled={busy || !texto.trim()}
              aria-label="Enviar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Botón de la barra + contador de no leídos. */
export function BotonChatSala({
  asambleaId,
  abierto,
  onToggle,
  codigoPoder,
}: {
  asambleaId: Id<"asambleas">;
  abierto: boolean;
  onToggle: () => void;
  codigoPoder?: string;
}) {
  const mensajes = useQuery(api.salaVideo.mensajesSala, {
    asambleaId,
    codigoPoder,
  });
  const [vistoHasta, setVistoHasta] = useState<number>(() => Date.now());

  useEffect(() => {
    if (abierto) setVistoHasta(Date.now());
  }, [abierto]);

  const noLeidos = (mensajes ?? []).filter((m) => m.createdAt > vistoHasta)
    .length;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={abierto}
      aria-label={
        noLeidos > 0
          ? `Chat de la sala · ${noLeidos} sin leer`
          : "Chat de la sala"
      }
      title="Chat de la sala"
      className={cn(
        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
        abierto
          ? "bg-white/25 text-white"
          : "bg-white/15 text-white hover:bg-white/25",
      )}
    >
      <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
      {!abierto && noLeidos > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-black">
          {noLeidos > 9 ? "9+" : noLeidos}
        </span>
      ) : null}
    </button>
  );
}
