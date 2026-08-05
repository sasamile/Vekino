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
import { cn, initials, mensajeErrorUsuario } from "@/lib/utils";

type MensajeSala = {
  _id: Id<"salaMensajes">;
  texto: string;
  nombre: string;
  createdAt: number;
  userId: Id<"users"> | null;
  codigoPoder: string | null;
  codigoInvitado: string | null;
};

function mismoAutor(a: MensajeSala, b: MensajeSala) {
  if (a.userId && b.userId) return a.userId === b.userId;
  if (a.codigoInvitado && b.codigoInvitado) {
    return a.codigoInvitado === b.codigoInvitado;
  }
  if (a.codigoPoder && b.codigoPoder) return a.codigoPoder === b.codigoPoder;
  return a.nombre.trim().toLowerCase() === b.nombre.trim().toLowerCase();
}

/** Nombres suelen venir en mayúsculas de la cédula; se muestran legibles. */
function nombreLegible(nombre: string) {
  const t = nombre.trim();
  if (!t) return "Participante";
  if (t !== t.toUpperCase() || t.length < 4) return t;
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function horaMsg(ts: number) {
  return new Date(ts).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mesa = esMesa || !!estado?.esMesa;
  const silenciado = !!estado?.silenciado;
  const puedoEscribir = estado ? estado.puedoEscribir : true;
  const silenciados = estado?.silenciados ?? [];

  useEffect(() => {
    if (!abierto || !mensajes?.length) return;
    const el = listaRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [abierto, mensajes]);

  useEffect(() => {
    if (!abierto || silenciado || !puedoEscribir) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [abierto, silenciado, puedoEscribir]);

  if (!abierto) return null;

  function esMio(m: MensajeSala) {
    return (
      (!!miUserId && m.userId === miUserId) ||
      (!!codigoInvitado && m.codigoInvitado === codigoInvitado) ||
      (!!codigoPoder && m.codigoPoder === codigoPoder) ||
      (!!miNombre &&
        !m.userId &&
        !m.codigoInvitado &&
        !m.codigoPoder &&
        m.nombre.trim().toLowerCase() === miNombre.trim().toLowerCase())
    );
  }

  function estaSilenciadoMsg(m: MensajeSala) {
    return silenciados.some(
      (s) =>
        (m.userId && s.userId === m.userId) ||
        (m.codigoInvitado && s.codigoInvitado === m.codigoInvitado) ||
        (m.codigoPoder && s.codigoPoder === m.codigoPoder),
    );
  }

  async function mandar() {
    const t = texto.trim();
    if (!t || busy || !puedoEscribir) return;
    setBusy(true);
    setError(null);
    try {
      await enviar({ asambleaId, texto: t, codigoPoder, codigoInvitado });
      setTexto("");
      if (inputRef.current) inputRef.current.style.height = "auto";
    } catch (e) {
      setError(mensajeErrorUsuario(e, "No se pudo enviar."));
    } finally {
      setBusy(false);
    }
  }

  async function silenciarMsg(m: MensajeSala) {
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
      setError(mensajeErrorUsuario(e, "No se pudo silenciar."));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar chat"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-label="Chat de la sala"
        className="relative z-10 flex h-[min(78dvh,620px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/[0.08] bg-[#12141a] shadow-2xl sm:h-[min(80vh,640px)] sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 flex-col border-b border-white/[0.08]">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <div className="h-1 w-9 rounded-full bg-white/20" />
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
              <MessageCircle className="h-4 w-4 text-white/70" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight text-white">
                Chat
              </p>
              <p className="text-[11px] text-white/40">
                {mesa
                  ? "Moderas el chat de la asamblea"
                  : "Visible para todos en la sala"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {mesa && silenciados.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] px-4 py-2.5">
              <span className="w-full text-[10px] font-medium uppercase tracking-wider text-white/35">
                Silenciados · tocar para rehabilitar
              </span>
              {silenciados.map((s) => (
                <button
                  key={s._id as string}
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-200/90 transition-colors hover:bg-red-500/20"
                >
                  <Ban className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                  <span className="max-w-[10rem] truncate">
                    {nombreLegible(s.nombre)}
                  </span>
                  <X className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Mensajes */}
        <div
          ref={listaRef}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4"
        >
          {mensajes === undefined ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-5 w-5 animate-spin text-white/30" />
              <p className="text-xs text-white/30">Cargando mensajes…</p>
            </div>
          ) : mensajes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04]">
                <MessageCircle className="h-5 w-5 text-white/25" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium text-white/55">
                  Todavía no hay mensajes
                </p>
                <p className="mt-1 text-xs leading-relaxed text-white/30">
                  Escribe abajo para saludar a quienes están en la sala.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-1">
              {mensajes.map((m, i) => {
                const prev = i > 0 ? mensajes[i - 1]! : null;
                const mio = esMio(m);
                const agrupado =
                  !!prev &&
                  mismoAutor(prev, m) &&
                  m.createdAt - prev.createdAt < 120_000;
                const puedeSilenciar =
                  mesa &&
                  !mio &&
                  !!(m.userId || m.codigoPoder || m.codigoInvitado);
                const yaSilenciado = puedeSilenciar && estaSilenciadoMsg(m);
                const label = mio ? "Tú" : nombreLegible(m.nombre);

                return (
                  <li
                    key={m._id as string}
                    className={cn(
                      "group flex gap-2",
                      mio ? "flex-row-reverse" : "flex-row",
                      agrupado ? "mt-0.5" : "mt-3 first:mt-0",
                    )}
                  >
                    {!mio ? (
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-semibold text-white/55",
                          agrupado && "invisible",
                        )}
                        aria-hidden={agrupado}
                      >
                        {initials(label) || "?"}
                      </div>
                    ) : null}

                    <div
                      className={cn(
                        "flex min-w-0 max-w-[78%] flex-col",
                        mio ? "items-end" : "items-start",
                      )}
                    >
                      {!agrupado ? (
                        <div
                          className={cn(
                            "mb-1 flex items-center gap-1.5 px-1",
                            mio && "flex-row-reverse",
                          )}
                        >
                          <span className="truncate text-[11px] font-medium text-white/45">
                            {label}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-white/25">
                            {horaMsg(m.createdAt)}
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
                                    codigoInvitado:
                                      m.codigoInvitado ?? undefined,
                                  }).catch(() => {})
                                }
                                className="rounded-md p-0.5 text-amber-300/70 opacity-100 transition-colors hover:bg-white/10 hover:text-amber-200 sm:opacity-0 sm:group-hover:opacity-100"
                              >
                                <Volume2 className="h-3 w-3" aria-hidden />
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Silenciar en el chat"
                                onClick={() => void silenciarMsg(m)}
                                className="rounded-md p-0.5 text-white/25 opacity-100 transition-colors hover:bg-red-500/15 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
                              >
                                <Ban className="h-3 w-3" aria-hidden />
                              </button>
                            )
                          ) : null}
                        </div>
                      ) : null}

                      <div
                        className={cn(
                          "px-3.5 py-2 text-[13px] leading-relaxed break-words",
                          mio
                            ? "rounded-2xl rounded-br-md bg-emerald-500 text-white"
                            : "rounded-2xl rounded-bl-md bg-white/[0.08] text-white/90",
                        )}
                      >
                        {m.texto}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-white/[0.08] bg-[#0e1014]/80 px-3 py-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:px-4">
          {error ? (
            <p className="mb-2 text-xs text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          {silenciado ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3.5 py-3 text-center">
              <p className="text-sm font-medium text-amber-100">
                Estás silenciado en el chat
              </p>
              <p className="mt-0.5 text-xs text-amber-100/60">
                Puedes leer, pero no enviar mensajes.
              </p>
            </div>
          ) : (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void mandar();
              }}
            >
              <textarea
                ref={inputRef}
                value={texto}
                rows={1}
                onChange={(e) => {
                  setTexto(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void mandar();
                  }
                }}
                placeholder="Escribe un mensaje…"
                maxLength={400}
                disabled={!puedoEscribir}
                className="max-h-[120px] min-h-[42px] min-w-0 flex-1 resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-[15px] leading-snug text-white placeholder:text-white/30 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy || !texto.trim() || !puedoEscribir}
                aria-label="Enviar"
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-35"
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
