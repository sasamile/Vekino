"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  ArrowLeft,
  Hand,
  ListOrdered,
  Loader2,
  PhoneOff,
  Users,
} from "lucide-react";
import { EscenarioVideo } from "@/components/asamblea/escenario-video";
import { BotonChatSala, SalaChatSheet } from "@/components/asamblea/sala-chat";
import { useSalaLatidoInvitado } from "@/hooks/use-sala-latido-invitado";
import { cn } from "@/lib/utils";

/**
 * Sala del invitado: puede pedir la palabra, hablar y compartir pantalla.
 * No vota ni suma al quórum.
 */
export function SalaInvitado({ sesionCodigo }: { sesionCodigo: string }) {
  const data = useQuery(api.asambleaInvitados.accederConSesionInvitado, {
    sesionCodigo,
  });
  const latido = useSalaLatidoInvitado(sesionCodigo);
  const pedirPalabra = useMutation(api.salaVideo.pedirPalabra);
  const bajarMano = useMutation(api.salaVideo.bajarMano);
  const palabras = useQuery(
    api.salaVideo.palabras,
    data?.asamblea._id
      ? { asambleaId: data.asamblea._id, codigoInvitado: sesionCodigo }
      : "skip",
  );
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [chatAbierto, setChatAbierto] = useState(false);

  if (data === undefined) {
    return (
      <div className="flex h-svh items-center justify-center bg-[#0c0e12]">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 bg-[#0c0e12] px-4 text-center text-white/70">
        <p>Sesión inválida o enlace desactivado.</p>
        <Link
          href="/invitado"
          className="text-sm text-emerald-400 hover:underline"
        >
          Volver al acceso
        </Link>
      </div>
    );
  }

  const a = data.asamblea;
  const enCurso = a.estado === "en_curso";
  const asambleaId = a._id as Id<"asambleas">;
  const miPalabra = (palabras ?? []).find((f) => f.mia) ?? null;
  const puedoHablar = miPalabra?.estado === "concedida";
  const puntos = data.ordenDia;
  const puntoActual = puntos.find((p) => !p.hecho) ?? null;

  return (
    <div className="relative flex h-svh flex-col overflow-hidden bg-[#0c0e12] text-white">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-4 pb-8 pt-3 sm:px-5">
        <Link
          href="/invitado"
          aria-label="Salir de la sala"
          className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold drop-shadow">{a.titulo}</p>
          <p className="truncate text-xs text-white/60 drop-shadow">
            Invitado · {data.nombre} · sin voto ni quórum
          </p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              latido.conectado
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-white/10 text-white/50",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                latido.conectado ? "bg-emerald-400" : "bg-white/40",
              )}
            />
            {latido.conectado ? "En sala" : "…"}
          </span>
          {enCurso ? (
            <button
              type="button"
              onClick={() => setPanelAbierto((v) => !v)}
              aria-label="Panel de la asamblea"
              className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold text-white/85 transition-colors hover:bg-white/20"
            >
              <Users className="h-4 w-4" aria-hidden />
              {latido.personasEnSala > 0 ? latido.personasEnSala : null}
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <EscenarioVideo
            asambleaId={asambleaId}
            enCurso={enCurso}
            puedoHablar={puedoHablar}
            codigoInvitado={sesionCodigo}
            nombreEspera={data.nombre}
            personas={latido.personas}
            extraControles={
              enCurso ? (
                <button
                  type="button"
                  onClick={() => {
                    if (miPalabra) {
                      void bajarMano({
                        asambleaId,
                        codigoInvitado: sesionCodigo,
                      }).catch(() => {});
                    } else {
                      void pedirPalabra({
                        asambleaId,
                        codigoInvitado: sesionCodigo,
                      }).catch(() => {});
                    }
                  }}
                  aria-label={
                    miPalabra?.estado === "concedida"
                      ? "Bajar la mano"
                      : miPalabra
                        ? "Mano levantada"
                        : "Pedir la palabra"
                  }
                  title={
                    miPalabra?.estado === "concedida"
                      ? "Tienes la palabra — bajar la mano"
                      : miPalabra
                        ? "Esperando que la mesa te dé la palabra"
                        : "Pedir la palabra"
                  }
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
                    miPalabra?.estado === "concedida"
                      ? "bg-emerald-500 text-white"
                      : miPalabra
                        ? "bg-amber-500/90 text-white"
                        : "bg-white/15 text-white hover:bg-white/25",
                  )}
                >
                  <Hand className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                </button>
              ) : null
            }
            controlesFin={
              enCurso ? (
                <>
                  <BotonChatSala
                    asambleaId={asambleaId}
                    abierto={chatAbierto}
                    onToggle={() => setChatAbierto((v) => !v)}
                    codigoInvitado={sesionCodigo}
                  />
                  <button
                    type="button"
                    onClick={() => setPanelAbierto((v) => !v)}
                    aria-pressed={panelAbierto}
                    aria-label="Panel de la asamblea"
                    className={cn(
                      "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
                      panelAbierto
                        ? "bg-white/25 text-white"
                        : "bg-white/15 text-white hover:bg-white/25",
                    )}
                  >
                    <Users className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  </button>
                  <Link
                    href="/invitado"
                    aria-label="Salir de la sala"
                    className="ml-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600 sm:ml-1 sm:h-12 sm:w-auto sm:px-5"
                  >
                    <PhoneOff className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  </Link>
                </>
              ) : null
            }
          />

          {!enCurso ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
              <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#14161b] p-6 text-center">
                <h2 className="text-base font-semibold text-white/90">
                  La sala no está abierta
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/50">
                  Espera a que la administración inicie la asamblea. Puedes
                  dejar esta ventana abierta.
                </p>
              </section>
            </div>
          ) : null}
        </main>

        {panelAbierto && enCurso ? (
          <aside className="z-20 w-full max-w-[380px] shrink-0 overflow-y-auto border-l border-white/10 bg-[#14161b] p-4 sm:p-5">
            <div className="space-y-4">
              <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5">
                <h2 className="text-sm font-semibold text-amber-100">
                  Eres invitado
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  Puedes pedir la palabra, hablar y compartir pantalla. No
                  participas en votaciones ni cuentas para el quórum.
                </p>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                  <Users className="h-4 w-4" /> En la sala
                  <span className="text-white/40">
                    ({latido.personasEnSala})
                  </span>
                </h2>
                {latido.personas.length === 0 ? (
                  <p className="text-sm text-white/40">Nadie más conectado.</p>
                ) : (
                  <ul className="space-y-2">
                    {latido.personas.map((p, i) => (
                      <li
                        key={`${p.nombre}-${i}`}
                        className="flex items-center gap-2 text-sm text-white/85"
                      >
                        <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                        {p.esMesa ? (
                          <span className="text-[10px] text-white/40">mesa</span>
                        ) : p.esInvitado ? (
                          <span className="text-[10px] text-amber-200/70">
                            invitado
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {puntoActual ? (
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80">
                    <ListOrdered className="h-4 w-4" /> Punto en curso
                  </h2>
                  <p className="text-sm text-white/85">{puntoActual.titulo}</p>
                </section>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      <SalaChatSheet
        asambleaId={asambleaId}
        abierto={chatAbierto && enCurso}
        onClose={() => setChatAbierto(false)}
        codigoInvitado={sesionCodigo}
        miNombre={data.nombre}
      />
    </div>
  );
}
