"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ListOrdered,
  Loader2,
  PhoneOff,
  Radio,
  Users,
  Vote,
} from "lucide-react";
import { EscenarioVideo } from "@/components/asamblea/escenario-video";
import { BotonChatSala, SalaChatSheet } from "@/components/asamblea/sala-chat";
import { useSalaLatidoApoderado } from "@/hooks/use-sala-latido-apoderado";
import { cn } from "@/lib/utils";

/**
 * Sala del apoderado: misma gramática visual que Meet / la sala del residente.
 * Lienzo a sangre, cabecera flotante, barra de controles, panel lateral on-demand.
 */
export function SalaApoderado({ codigo }: { codigo: string }) {
  const data = useQuery(api.asambleas.accederConCodigo, { codigo });
  const latido = useSalaLatidoApoderado(codigo);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [chatAbierto, setChatAbierto] = useState(false);

  const abiertasLen =
    data?.votaciones.filter((vt) => vt.estado === "abierta").length ?? 0;
  useEffect(() => {
    if (abiertasLen > 0) setPanelAbierto(true);
  }, [abiertasLen]);

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
        <p>Código inválido o asamblea cerrada.</p>
        <Link
          href="/apoderado"
          className="text-sm text-emerald-400 hover:underline"
        >
          Volver al acceso
        </Link>
      </div>
    );
  }

  const a = data.asamblea;
  const enCurso = a.estado === "en_curso";
  const abiertas = data.votaciones.filter((vt) => vt.estado === "abierta");
  const puntos = data.ordenDia;
  const puntoActual = puntos.find((p) => !p.hecho) ?? null;
  const q = data.quorum;
  const hayQuorum = q.pct >= q.quorumRequerido;

  return (
    <div className="relative flex h-svh flex-col overflow-hidden bg-[#0c0e12] text-white">
      {/* Cabecera flotante tipo Meet */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-4 pb-8 pt-3 sm:px-5">
        <Link
          href="/apoderado"
          aria-label="Salir de la sala"
          className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold drop-shadow">{a.titulo}</p>
          <p className="truncate text-xs text-white/60 drop-shadow">
            Apoderado · {data.apoderadoNombre} ·{" "}
            <span className="capitalize">{a.modalidad}</span>
          </p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <EstadoConexion latido={latido} enCurso={enCurso} />
          {enCurso ? (
            <button
              type="button"
              onClick={() => setPanelAbierto((v) => !v)}
              aria-label="Panel de la asamblea"
              title="Participantes y votaciones"
              className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold text-white/85 transition-colors hover:bg-white/20"
            >
              <Users className="h-4 w-4" aria-hidden />
              {q.unidadesPresentes}
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <EscenarioVideo
            asambleaId={a._id}
            enCurso={enCurso}
            puedoHablar={false}
            codigoPoder={codigo}
            nombreEspera={data.apoderadoNombre}
            controlesFin={
              enCurso ? (
                <>
                  <BotonChatSala
                    asambleaId={a._id}
                    abierto={chatAbierto}
                    onToggle={() => setChatAbierto((v) => !v)}
                    codigoPoder={codigo}
                  />
                  <button
                    type="button"
                    onClick={() => setPanelAbierto((v) => !v)}
                    aria-pressed={panelAbierto}
                    aria-label="Panel de la asamblea"
                    title="Panel de la asamblea"
                    className={cn(
                      "relative flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                      panelAbierto
                        ? "bg-white/25 text-white"
                        : "bg-white/15 text-white hover:bg-white/25",
                    )}
                  >
                    <Users className="h-5 w-5" aria-hidden />
                  </button>
                  <Link
                    href="/apoderado"
                    aria-label="Salir de la sala"
                    title="Salir de la sala"
                    className="ml-1 flex h-12 items-center justify-center rounded-full bg-red-500 px-5 text-white transition-colors hover:bg-red-600"
                  >
                    <PhoneOff className="h-5 w-5" aria-hidden />
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
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                  <Users className="h-4 w-4" /> Quórum
                </h2>
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-3xl font-bold tabular-nums",
                      hayQuorum ? "text-emerald-400" : "text-amber-400",
                    )}
                  >
                    {q.pct}%
                  </span>
                  <span className="text-xs text-white/50">
                    de {q.quorumRequerido}% · {q.unidadesPresentes} de{" "}
                    {q.totalUnidades} unidades
                  </span>
                </div>
                <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      hayQuorum ? "bg-emerald-500" : "bg-amber-500",
                    )}
                    style={{ width: `${Math.min(100, q.pct)}%` }}
                  />
                </div>
              </section>

              <RegistroApoderado
                codigo={codigo}
                modalidad={a.modalidad}
                presente={data.asistenciaRegistrada}
                conectado={latido.conectado}
              />

              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h2 className="mb-2 text-sm font-semibold text-white/80">
                  Casas que representas
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {data.unidades.map((u, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80"
                    >
                      {u.unidadNumero}
                      {u.coeficiente != null ? ` · ${u.coeficiente}%` : ""}
                    </span>
                  ))}
                </div>
              </section>

              {puntoActual ? (
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80">
                    <ListOrdered className="h-4 w-4" /> Punto en curso
                  </h2>
                  <p className="text-sm text-white/90">{puntoActual.titulo}</p>
                  {puntoActual.descripcion ? (
                    <p className="mt-1 text-xs text-white/50">
                      {puntoActual.descripcion}
                    </p>
                  ) : null}
                </section>
              ) : null}

              {abiertas.length > 0 && data.asistenciaRegistrada ? (
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                    <Vote className="h-4 w-4" /> Votaciones
                  </h2>
                  <div className="space-y-4">
                    {abiertas.map((vt) => (
                      <VotacionApoderadoSala
                        key={vt._id}
                        codigo={codigo}
                        vt={vt}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      <SalaChatSheet
        asambleaId={a._id}
        abierto={chatAbierto && enCurso}
        onClose={() => setChatAbierto(false)}
        codigoPoder={codigo}
        miNombre={data.apoderadoNombre}
      />
    </div>
  );
}

function EstadoConexion({
  latido,
  enCurso,
}: {
  latido: ReturnType<typeof useSalaLatidoApoderado>;
  enCurso: boolean;
}) {
  if (!enCurso) {
    return (
      <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/60">
        Sala cerrada
      </span>
    );
  }
  if (!latido.registrado) {
    return (
      <span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-xs text-amber-300">
        Sin registrar
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
        latido.conectado
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-amber-500/15 text-amber-300",
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {latido.conectado ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
        ) : null}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            latido.conectado ? "bg-emerald-400" : "bg-amber-400",
          )}
        />
      </span>
      {latido.conectado ? "En la sala" : "Reconectando…"}
    </span>
  );
}

function RegistroApoderado({
  codigo,
  modalidad,
  presente,
  conectado,
}: {
  codigo: string;
  modalidad: string;
  presente: boolean;
  conectado: boolean;
}) {
  const entrar = useMutation(api.asambleas.entrarYRegistrarConPoder);
  const [intentado, setIntentado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esVirtualOMixta = modalidad !== "presencial";

  useEffect(() => {
    if (intentado || presente || !esVirtualOMixta) return;
    setIntentado(true);
    entrar({ codigo }).catch((e) => {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
    });
  }, [intentado, presente, esVirtualOMixta, codigo, entrar]);

  if (presente) {
    return (
      <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Asistencia registrada
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-emerald-200/70">
          {conectado
            ? "Quedaste registrado al entrar. Mientras esta ventana esté abierta, tu permanencia sigue sumando."
            : "Estás registrado, pero ahora mismo no hay conexión. Se reintenta solo."}
        </p>
      </section>
    );
  }

  if (!esVirtualOMixta) {
    return (
      <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5">
        <p className="text-sm font-semibold text-amber-200">
          Asistencia pendiente
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-amber-100/70">
          En asambleas presenciales el administrador registra tu asistencia con
          tu código de poder.
        </p>
        <p className="mt-3 text-center font-mono text-xl font-bold tracking-[0.3em] text-white">
          {codigo}
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5">
        <p className="text-sm font-semibold text-red-300">
          No se pudo registrar tu asistencia
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-red-200/70">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setIntentado(false);
          }}
          className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
        >
          Reintentar
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
        <Loader2 className="h-4 w-4 animate-spin" /> Registrando tu asistencia…
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-white/50">
        Entrar a la sala registra las unidades de tu poder automáticamente.
      </p>
    </section>
  );
}

function VotacionApoderadoSala({
  codigo,
  vt,
}: {
  codigo: string;
  vt: {
    _id: Id<"votaciones">;
    pregunta: string;
    opciones: { texto: string; votos: number }[];
    miVoto: number | null;
  };
}) {
  const votar = useMutation(api.asambleas.votarConCodigo);
  const [busy, setBusy] = useState<number | null>(null);

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-white/90">{vt.pregunta}</p>
      <div className="space-y-2">
        {vt.opciones.map((op, i) => {
          const esMio = vt.miVoto === i;
          return (
            <button
              key={i}
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(i);
                try {
                  await votar({
                    codigo,
                    votacionId: vt._id,
                    opcionIndex: i,
                  });
                } catch {
                  /* noop */
                } finally {
                  setBusy(null);
                }
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60",
                esMio
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
              )}
            >
              <span className="flex items-center gap-2">
                {busy === i ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : esMio ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Radio className="h-3.5 w-3.5 opacity-40" />
                )}
                {op.texto}
              </span>
              {esMio ? (
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  Tu voto
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
