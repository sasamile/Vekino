"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { AlertTriangle, Captions, Loader2, Mic, MicOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Transcripción dentro de la sala.
 *
 * Vive acá y no solo en el panel de administración porque durante la reunión
 * la mesa está en la sala, no en otra pestaña: si el interruptor estuviera
 * únicamente en el escritorio, nadie lo encontraría cuando hace falta.
 *
 * La lista la ven todos los conectados, no solo la mesa. Es lo coherente con
 * el aviso: si se está transcribiendo lo que dicen, deberían poder ver qué
 * quedó escrito, y de paso funciona como subtítulos para quien tenga mala
 * conexión o no alcance a oír.
 */

function hora(ts: number) {
  return new Date(ts).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PanelTranscripcionSala({
  asambleaId,
  esMesa,
  onCerrar,
}: {
  asambleaId: Id<"asambleas">;
  esMesa: boolean;
  onCerrar: () => void;
}) {
  const estado = useQuery(api.intervenciones.estado, { asambleaId });
  // Las últimas nada más: en la sala interesa lo que se acaba de decir, y
  // cuatro horas de asamblea no caben en un panel de esta altura.
  const dichos = useQuery(api.intervenciones.listar, { asambleaId, limite: 120 });
  const activar = useMutation(api.intervenciones.activar);

  const [alternando, setAlternando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const caja = useRef<HTMLDivElement>(null);
  const pegado = useRef(true);

  useEffect(() => {
    const el = caja.current;
    if (el && pegado.current) el.scrollTop = el.scrollHeight;
  }, [dichos?.length]);

  const activa = estado?.activa === true;

  async function alternar() {
    setError(null);
    setAlternando(true);
    try {
      await activar({ asambleaId, activa: !activa });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAlternando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onCerrar}
      />
      <div
        role="dialog"
        aria-modal
        aria-label="Transcripción"
        className="relative z-10 flex h-[min(80dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#14161b] shadow-2xl sm:rounded-2xl"
      >
        {/* Cabecera */}
        <div className="flex shrink-0 flex-col border-b border-white/10">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </div>
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                Transcripción
                {activa ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    EN VIVO
                  </span>
                ) : null}
              </p>
              <p className="text-[11px] text-white/45">
                {activa
                  ? "Lo que se hable queda escrito en el acta"
                  : "Apagada"}
              </p>
            </div>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Interruptor: solo la mesa */}
        {esMesa ? (
          <div className="shrink-0 border-b border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={alternar}
              disabled={alternando}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60",
                activa
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "bg-amber-500 text-black hover:bg-amber-400",
              )}
            >
              {alternando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : activa ? (
                <MicOff className="h-4 w-4" aria-hidden />
              ) : (
                <Mic className="h-4 w-4" aria-hidden />
              )}
              {activa ? "Apagar transcripción" : "Encender transcripción"}
            </button>

            {!activa ? (
              /* El aviso va ANTES de encender, no después: es cuando todavía
               * se puede avisar a la asamblea. */
              <div className="mt-3 flex gap-2 rounded-lg bg-amber-500/10 p-2.5">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
                  aria-hidden
                />
                <p className="text-[11px] leading-relaxed text-amber-200/90">
                  Avísale a la asamblea antes de encenderla. Mientras esté
                  activa, todos ven el aviso en la sala.
                </p>
              </div>
            ) : null}

            {error ? (
              <p className="mt-2 text-[11px] text-red-400">{error}</p>
            ) : null}
          </div>
        ) : null}

        {/* Lo dicho */}
        <div
          ref={caja}
          onScroll={(e) => {
            const el = e.currentTarget;
            pegado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {dichos === undefined ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-white/30" aria-hidden />
            </div>
          ) : dichos.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <Captions className="h-8 w-8 text-white/15" aria-hidden />
              <p className="max-w-[24ch] text-[12px] text-white/40">
                {activa
                  ? "Escuchando. Lo que se hable irá apareciendo aquí."
                  : "Todavía no se ha transcrito nada en esta asamblea."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {dichos.map((d) => (
                <li key={d._id}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-semibold text-white/85">
                      {d.nombre}
                    </span>
                    {d.unidadNumero ? (
                      <span className="text-[10px] text-white/35">
                        {d.unidadNumero}
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-white/25">
                      {hora(d.inicioEn)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 text-[12.5px] leading-relaxed",
                      d.dudosa && !d.corregida ? "text-white/45" : "text-white/70",
                    )}
                    title={d.dudosa && !d.corregida ? "Reconocimiento dudoso" : undefined}
                  >
                    {d.texto}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
