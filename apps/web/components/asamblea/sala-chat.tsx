"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  Ban,
  Loader2,
  MessageCircle,
  Send,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Chat compartido de la sala: sheet desde abajo (móvil) / centrado (desktop).
 * La mesa puede silenciar a quien se pase de la raya.
 */
export function SalaChatSheet({
  asambleaId,
  abierto,
  onClose,
  codigoPoder,
  codigoInvitado,
  miNombre,
  miUserId,
  esMesa = false,
}: {
  asambleaId: Id<"asambleas">;
  abierto: boolean;
  onClose: () => void;
  codigoPoder?: string;
  codigoInvitado?: string;
  miNombre?: string;
  miUserId?: Id<"users"> | null;
  esMesa?: boolean;
}) {
  const mensajes = useQuery(
    api.salaVideo.mensajesSala,
    abierto ? { asambleaId, codigoPoder, codigoInvitado } : "skip",
  );
  const estado = useQuery(
    api.salaVideo.estadoChat,
    abierto ? { asambleaId, codigoPoder, codigoInvitado } : "skip",
  );
  const enviar = useMutation(api.salaVideo.enviarMensaje);
  const silenciar = useMutation(api.salaVideo.silenciarEnChat);
  const habilitar = useMutation(api.salaVideo.habilitarEnChat);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const mesa = esMesa || !!estado?.esMesa;
  const silenciado = !!estado?.silenciado;
  const puedoEscribir = estado ? estado.puedoEscribir : true;

  useEffect(() => {
    if (!abierto || !mensajes?.length) return;
    const el = listaRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [abierto, mensajes]);

  if (!abierto) return null;

  async function mandar() {
    const t = texto.trim();
    if (!t || busy || !puedoEscribir) return;
    setBusy(true);
    setError(null);
    try {
      await enviar({ asambleaId, texto: t, codigoPoder, codigoInvitado });
      setTexto("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setBusy(false);
    }
  }

  async function silenciarMsg(m: {
    nombre: string;
    userId: Id<"users"> | null;
    codigoPoder: string | null;
    codigoInvitado: string | null;
  }) {
    if (!m.userId && !m.codigoPoder && !m.codigoInvitado) return;
    setError(null);
    try {
      await silenciar({
        asambleaId,
        nombre: m.nombre,
        userId: m.userId ?? undefined,
        codigoPoder: m.codigoPoder ?? undefined,
        codigoInvitado: m.codigoInvitado ?? undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo silenciar.");
    }
  }

  function estaSilenciadoMsg(m: {
    userId: Id<"users"> | null;
    codigoPoder: string | null;
    codigoInvitado: string | null;
  }) {
    const lista = estado?.silenciados ?? [];
    return lista.some(
      (s) =>
        (m.userId && s.userId === m.userId) ||
        (m.codigoInvitado && s.codigoInvitado === m.codigoInvitado) ||
        (m.codigoPoder && s.codigoPoder === m.codigoPoder),
    );
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
                {mesa
                  ? "Puedes silenciar a quien se pase de la raya"
                  : "Visible para todos los que están aquí"}
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
                (!!codigoInvitado &&
                  m.codigoInvitado === codigoInvitado) ||
                (!!codigoPoder && m.codigoPoder === codigoPoder) ||
                (!!miNombre &&
                  !m.userId &&
                  !m.codigoInvitado &&
                  !m.codigoPoder &&
                  m.nombre.trim().toLowerCase() ===
                    miNombre.trim().toLowerCase());
              const puedeSilenciar =
                mesa &&
                !mio &&
                !!(m.userId || m.codigoPoder || m.codigoInvitado);
              const yaSilenciado = puedeSilenciar && estaSilenciadoMsg(m);
              return (
                <div
                  key={m._id as string}
                  className={cn(
                    "flex flex-col gap-0.5",
                    mio ? "items-end" : "items-start",
                  )}
                >
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[10px] font-medium text-white/40">
                      {mio ? "Tú" : m.nombre}
                    </span>
                    {puedeSilenciar ? (
                      yaSilenciado ? (
                        <button
                          type="button"
                          title="Permitir escribir de nuevo"
                          onClick={() =>
                            void habilitar({
                              asambleaId,
                              userId: m.userId ?? undefined,
                              codigoPoder: m.codigoPoder ?? undefined,
                              codigoInvitado: m.codigoInvitado ?? undefined,
                            }).catch(() => {})
                          }
                          className="rounded p-0.5 text-amber-300/80 hover:bg-white/10 hover:text-amber-200"
                        >
                          <Volume2 className="h-3 w-3" aria-hidden />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Silenciar en el chat"
                          onClick={() => void silenciarMsg(m)}
                          className="rounded p-0.5 text-white/30 hover:bg-red-500/20 hover:text-red-300"
                        >
                          <Ban className="h-3 w-3" aria-hidden />
                        </button>
                      )
                    ) : null}
                  </div>
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

        {mesa && (estado?.silenciados?.length ?? 0) > 0 ? (
          <div className="shrink-0 border-t border-white/10 px-4 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
              Silenciados
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {estado!.silenciados.map((s) => (
                <li key={s._id as string}>
                  <button
                    type="button"
                    onClick={() =>
                      void habilitar({
                        asambleaId,
                        userId: s.userId ?? undefined,
                        codigoPoder: s.codigoPoder ?? undefined,
                        codigoInvitado: s.codigoInvitado ?? undefined,
                      }).catch(() => {})
                    }
                    title="Permitir escribir de nuevo"
                    className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-500/25"
                  >
                    <Ban className="h-3 w-3" aria-hidden />
                    {s.nombre}
                    <X className="h-3 w-3 opacity-60" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="shrink-0 border-t border-white/10 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error ? (
            <p className="mb-2 text-xs text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          {silenciado ? (
            <p className="rounded-xl bg-amber-500/15 px-3 py-2.5 text-center text-sm text-amber-100">
              La mesa te silenció en el chat. Solo puedes leer.
            </p>
          ) : (
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
                disabled={!puedoEscribir}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-base text-white placeholder:text-white/35 outline-none focus:border-white/25 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy || !texto.trim() || !puedoEscribir}
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
          )}
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
  codigoInvitado,
}: {
  asambleaId: Id<"asambleas">;
  abierto: boolean;
  onToggle: () => void;
  codigoPoder?: string;
  codigoInvitado?: string;
}) {
  const mensajes = useQuery(api.salaVideo.mensajesSala, {
    asambleaId,
    codigoPoder,
    codigoInvitado,
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
