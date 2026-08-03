"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowLeft,
  CheckCircle2,
  Hand,
  ListOrdered,
  Loader2,
  Lock,
  Maximize2,
  MicOff,
  Minimize2,
  LogOut,
  MonitorPlay,
  PhoneOff,
  Plus,
  Radio,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
  Users,
  Video,
  X,
} from "lucide-react";
import { EscenarioVideo } from "@/components/asamblea/escenario-video";
import type { Calidad } from "@/hooks/use-video-sala";
import { MostrarCodigoAsistencia } from "@/components/asamblea/mostrar-codigo-asistencia";
import { useSalaLatido } from "@/hooks/use-sala-latido";
import { cn } from "@/lib/utils";

/**
 * La sala de la asamblea: el sitio al que se ENTRA y en el que uno se queda.
 *
 * Es una pantalla completa, no una pestaña, y esa diferencia es la que la
 * hace funcionar: mientras esté abierta el latido corre y la persona cuenta
 * como presente. Una pestaña de la que te vas al mirar otra cosa no puede
 * sostener "estuvo 4 horas".
 *
 * Dos roles, un mismo sitio:
 * - La MESA abre la sala, transmite (cámara/pantalla) y concede la palabra.
 * - El RESIDENTE entra —entrar registra su asistencia—, ve la transmisión,
 *   levanta la mano y vota desde el panel.
 *
 * El video es P2P propio (ver escenario-video.tsx y el README de asamblea).
 */
export function SalaReunion({
  asambleaId,
  condominioId,
  volverHref,
  esMesa,
}: {
  asambleaId: Id<"asambleas">;
  condominioId: Id<"condominios">;
  volverHref: string;
  /** La mesa ve controles de apertura; el residente, el registro. */
  esMesa: boolean;
}) {
  const a = useQuery(api.asambleas.get, { id: asambleaId });
  const sala = useQuery(api.asambleaSala.salaEnVivo, { asambleaId });
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const mi = useQuery(api.asambleas.miParticipacion, { asambleaId });

  // Monta el latido: mientras esta pantalla esté abierta, cuentas como presente.
  const latido = useSalaLatido(asambleaId);

  /* ENTRAR ES REGISTRARSE. Nada de códigos dentro de la sala propia: si
   * estás aquí, Vekino ya sabe que estás aquí. Un solo intento automático
   * por visita; si falla queda el error con botón de reintento. La mesa
   * también se intenta registrar (un administrador puede ser propietario) y
   * su fallo por "sin unidades" se silencia porque es lo esperado. */
  const entrar = useMutation(api.asambleas.entrarYRegistrar);
  const palabras = useQuery(api.salaVideo.palabras, { asambleaId });
  const pedirPalabra = useMutation(api.salaVideo.pedirPalabra);
  const bajarMano = useMutation(api.salaVideo.bajarMano);
  const resolverPalabra = useMutation(api.salaVideo.resolverPalabra);
  const [codigoAbierto, setCodigoAbierto] = useState(false);
  /* Arranca en "ahorro": el tope pasa de ~16 a ~45 espectadores y en una
   * asamblea nadie echa de menos los 24 fps de una cara. La mesa sube a
   * alta calidad si el conjunto es pequeño. */
  const [calidad, setCalidad] = useState<Calidad>("ahorro");
  const [registro, setRegistro] = useState<{
    intentado: boolean;
    error: string | null;
  }>({ intentado: false, error: null });

  const enCursoQ = a?.estado === "en_curso";
  const presenteQ = mi?.presente ?? false;
  const delegoSinRepresentarQ =
    !!mi?.delegoTodo && (mi?.representa?.length ?? 0) === 0;
  /* Solo intenta registrar si el servidor dice que hay unidades (propias o
   * por poder). Evita el round-trip inútil de mesa / sin casas. */
  const listoParaRegistro =
    enCursoQ &&
    mi != null &&
    !presenteQ &&
    !delegoSinRepresentarQ &&
    mi.puedeRegistrar !== false;

  /* Panel lateral tipo reunión: OCULTO por defecto (el lienzo manda) y se
   * abre solo cuando pasa algo que exige atención: una votación abierta o
   * un fallo de registro. */
  const [panelAbierto, setPanelAbierto] = useState(false);
  const abiertasLen = (votaciones ?? []).filter(
    (vt) => vt.estado === "abierta",
  ).length;
  useEffect(() => {
    if (abiertasLen > 0) setPanelAbierto(true);
  }, [abiertasLen]);
  useEffect(() => {
    if (registro.error) setPanelAbierto(true);
  }, [registro.error]);

  useEffect(() => {
    if (!listoParaRegistro || registro.intentado) return;
    setRegistro({ intentado: true, error: null });
    entrar({ asambleaId })
      .then(() => setRegistro({ intentado: true, error: null }))
      .catch((e) => {
        if (esMesa) return; // mesa sin unidades: esperado, sin ruido
        setRegistro({
          intentado: true,
          error: e instanceof Error ? e.message : "No se pudo registrar.",
        });
      });
  }, [listoParaRegistro, registro.intentado, entrar, asambleaId, esMesa]);

  if (a === undefined) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#0f1115]">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }
  if (a === null) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#0f1115] text-white/70">
        Asamblea no encontrada.
      </div>
    );
  }

  const enCurso = a.estado === "en_curso";
  const abiertas = (votaciones ?? []).filter((vt) => vt.estado === "abierta");
  const puntos =
    a.ordenDia ?? a.agenda.map((t) => ({ titulo: t, hecho: false as boolean }));
  const puntoActual = puntos.find((p) => !p.hecho) ?? null;
  const miPalabra = (palabras ?? []).find((f) => f.mia) ?? null;
  const manosLevantadas = (palabras ?? []).filter((f) => !f.mia || esMesa);

  /* Delegó todas sus unidades y no es apoderado de ninguna otra: no tiene
   * nada que registrar ni que votar. Puede quedarse escuchando, pero no se
   * le ofrece una acción que el backend va a rechazar. */
  const delegoSinRepresentar =
    !!mi?.delegoTodo && (mi?.representa?.length ?? 0) === 0;

  const manosPedidas = manosLevantadas.filter((f) => f.estado === "pedida").length;

  return (
    /* La gramática de una videollamada: el lienzo ocupa TODO, la información
     * flota encima (cabecera con degradado, barra de controles, mosaicos) y
     * el panel lateral aparece solo cuando se pide. */
    <div className="relative flex h-svh flex-col overflow-hidden bg-[#0c0e12] text-white">
      {/* ── Cabecera flotante ──────────────────────────────────────────── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-4 pb-8 pt-3 sm:px-5">
        <Link
          href={volverHref}
          aria-label="Salir de la sala"
          className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold drop-shadow">{a.titulo}</p>
          <p className="truncate text-xs text-white/60 drop-shadow">
            {a.fecha} · {a.hora} ·{" "}
            <span className="capitalize">{a.modalidad}</span>
          </p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <EstadoConexion latido={latido} enCurso={enCurso} />
          {enCurso ? (
            <button
              type="button"
              onClick={() => setPanelAbierto((v) => !v)}
              aria-label="Ver quién está en la sala"
              title="Ver quién está en la sala"
              className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold text-white/85 transition-colors hover:bg-white/20"
            >
              <Users className="h-4 w-4" aria-hidden />
              {sala?.personasEnSala ?? 0}
            </button>
          ) : null}
          <BotonPantallaCompleta />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Lienzo ─────────────────────────────────────────────────────── */}
        <main className="relative min-w-0 flex-1">
          <EscenarioVideo
            asambleaId={asambleaId}
            enCurso={enCurso}
            puedoHablar={esMesa || miPalabra?.estado === "concedida"}
            calidad={calidad}
            onCambiarCalidad={esMesa ? setCalidad : undefined}
            nombreEspera={mi?.nombre ?? undefined}
            imageUrlLocal={mi?.imageUrl ?? undefined}
            personas={sala?.personas}
            extraControles={
              !esMesa && enCurso && (mi?.presente ?? false) ? (
                <BotonMano
                  estado={miPalabra?.estado ?? null}
                  onPedir={() => void pedirPalabra({ asambleaId }).catch(() => {})}
                  onBajar={() => void bajarMano({ asambleaId }).catch(() => {})}
                />
              ) : null
            }
            controlesFin={
              enCurso ? (
                <>
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
                    {esMesa && manosPedidas > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
                        {manosPedidas}
                      </span>
                    ) : null}
                  </button>
                  <Link
                    href={volverHref}
                    aria-label="Salir de la sala"
                    title="Salir de la sala"
                    className="ml-1 flex h-12 items-center gap-2 rounded-full bg-red-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
                  >
                    <PhoneOff className="h-5 w-5" aria-hidden />
                  </Link>
                </>
              ) : null
            }
          />

          {/* Sala sin abrir: la tarjeta de apertura flota sobre el lienzo. */}
          {!enCurso ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
              <div className="w-full max-w-md">
                <SalaCerrada
                  asambleaId={asambleaId}
                  estado={a.estado}
                  esMesa={esMesa}
                />
              </div>
            </div>
          ) : null}
        </main>

        {/* ── Panel lateral (oculto por defecto) ─────────────────────────── */}
        {panelAbierto && enCurso ? (
          <aside className="z-20 w-full max-w-[380px] shrink-0 overflow-y-auto border-l border-white/10 bg-[#14161b] p-4 sm:p-5">
            <div className="space-y-4">
              <QuorumVivo sala={sala} />
              <EnLaSala sala={sala} />

              {!esMesa ? (
                delegoSinRepresentar ? (
                  <VotoDelegado apoderado={mi?.apoderadoNombre ?? null} />
                ) : (
                  <EstadoRegistro
                    presente={mi?.presente ?? false}
                    conectado={latido.conectado}
                    error={registro.error}
                    onReintentar={() =>
                      setRegistro({ intentado: false, error: null })
                    }
                  />
                )
              ) : null}

              {esMesa && manosLevantadas.length > 0 ? (
                <ManosLevantadas
                  filas={manosLevantadas}
                  onResolver={(userId, conceder) =>
                    void resolverPalabra({ asambleaId, userId, conceder }).catch(
                      () => {},
                    )
                  }
                />
              ) : null}

              {esMesa ? (
                <MesaOrdenYPreguntas
                  asambleaId={asambleaId}
                  puntos={puntos}
                  votaciones={votaciones ?? []}
                />
              ) : (
                <PuntoEnCurso punto={puntoActual} total={puntos.length} />
              )}

              {esMesa && abiertas.length > 0 ? (
                <MesaSeguimientoVotos
                  asambleaId={asambleaId}
                  abiertas={abiertas}
                />
              ) : null}

              {abiertas.length > 0 &&
              (mi?.presente ?? false) &&
              !delegoSinRepresentar ? (
                <VotacionesAbiertas
                  abiertas={abiertas}
                  misVotos={mi?.votos ?? {}}
                />
              ) : null}

              {/* Código SOLO para quien sigue por Zoom/Meet/YouTube u otra
                  plataforma: quien ya está en esta sala quedó registrado al entrar. */}
              {esMesa ? (
                <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
                  <button
                    type="button"
                    onClick={() => setCodigoAbierto((v) => !v)}
                    aria-expanded={codigoAbierto}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-white/70 hover:text-white"
                  >
                    <MonitorPlay className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      Código para stream externo
                      <span className="mt-0.5 block text-[11px] font-normal text-white/40">
                        Zoom, Meet u otra plataforma — no hace falta si ya están aquí
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-normal text-white/40">
                      {codigoAbierto ? "Ocultar" : "Mostrar"}
                    </span>
                  </button>
                  {codigoAbierto ? (
                    <div className="space-y-3 border-t border-white/10 p-4">
                      <p className="text-xs leading-relaxed text-white/50">
                        Quien entra a esta sala ya queda en asistencia. Este
                        código es para proyectarlo en un stream externo y que
                        registren desde fuera.
                      </p>
                      <div className="rounded-xl bg-white p-4 text-foreground">
                        <MostrarCodigoAsistencia asambleaId={asambleaId} />
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Pantalla completa del NAVEGADOR (no solo del layout).
 *
 * En una asamblea de cuatro horas la barra de direcciones y las pestañas son
 * ruido, y en la máquina que proyecta al salón, directamente estorban.
 * Escuchamos `fullscreenchange` en vez de guardar el estado a mano porque se
 * puede salir con Escape sin pasar por el botón.
 */
function BotonPantallaCompleta() {
  const [activa, setActiva] = useState(false);

  useEffect(() => {
    const onCambio = () => setActiva(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onCambio);
    return () => document.removeEventListener("fullscreenchange", onCambio);
  }, []);

  return (
    <button
      type="button"
      aria-label={activa ? "Salir de pantalla completa" : "Pantalla completa"}
      onClick={() => {
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        } else {
          void document.documentElement.requestFullscreen().catch(() => {});
        }
      }}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
    >
      {activa ? (
        <Minimize2 className="h-[18px] w-[18px]" aria-hidden />
      ) : (
        <Maximize2 className="h-[18px] w-[18px]" aria-hidden />
      )}
    </button>
  );
}

/* ── Estado de conexión, arriba a la derecha ──────────────────────────── */
function EstadoConexion({
  latido,
  enCurso,
}: {
  latido: ReturnType<typeof useSalaLatido>;
  enCurso: boolean;
}) {
  if (!enCurso) {
    return (
      <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/60">
        Sala cerrada
      </span>
    );
  }
  /* Mesa sin unidades propias: igual está "en la sala" (presencia Meet). */
  if (latido.esMesa && !latido.registrado) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        Mesa · en la sala
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


/* ── Sala cerrada: la mesa la abre ────────────────────────────────────── */
function SalaCerrada({
  asambleaId,
  estado,
  esMesa,
}: {
  asambleaId: Id<"asambleas">;
  estado: string;
  esMesa: boolean;
}) {
  const setEstado = useMutation(api.asambleas.setEstado);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalizada = estado === "finalizada" || estado === "cancelada";

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-sm font-semibold text-white/80">
        {finalizada ? "Esta asamblea ya terminó" : "La sala no está abierta"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/50">
        {finalizada
          ? "Las votaciones quedaron cerradas y la permanencia ya está calculada."
          : esMesa
            ? "Al abrirla se inicia la asamblea, empieza a contar la permanencia y los residentes pueden registrar su asistencia."
            : "Espera a que la administración abra la sala. Puedes dejar esta ventana abierta."}
      </p>

      {esMesa && !finalizada ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await setEstado({ id: asambleaId, estado: "en_curso" });
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "No se pudo abrir la sala.",
                );
              } finally {
                setBusy(false);
              }
            }}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radio className="h-4 w-4" />
            )}
            Abrir la sala e iniciar
          </button>
          {error ? (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/* ── Quórum en vivo ───────────────────────────────────────────────────── */
type SalaEnVivo = FunctionReturnType<typeof api.asambleaSala.salaEnVivo>;

function QuorumVivo({ sala }: { sala: SalaEnVivo | undefined }) {
  if (!sala) return null;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
        <Users className="h-4 w-4" /> En la sala ahora
      </h2>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-3xl font-bold tabular-nums",
            sala.hayQuorum ? "text-emerald-400" : "text-amber-400",
          )}
        >
          {sala.pctCoeficiente.toFixed(2)}%
        </span>
        <span className="text-xs text-white/50">
          de coeficiente · {sala.unidadesConectadas} de {sala.totalUnidades}{" "}
          unidades
        </span>
      </div>
      <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            sala.hayQuorum ? "bg-emerald-500" : "bg-amber-500",
          )}
          style={{ width: `${Math.min(100, sala.pctCoeficiente)}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-red-400"
          style={{ left: `${sala.quorumRequerido}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-white/40">
        Mínimo {sala.quorumRequerido}% ·{" "}
        {sala.hayQuorum ? "hay quórum" : "aún sin quórum"}
      </p>
    </section>
  );
}

/* ── Estado del registro (automático al entrar) ──────────────────────── */
function EstadoRegistro({
  presente,
  conectado,
  error,
  onReintentar,
}: {
  presente: boolean;
  conectado: boolean;
  error: string | null;
  onReintentar: () => void;
}) {
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

  if (error) {
    return (
      <section className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5">
        <p className="text-sm font-semibold text-red-300">
          No se pudo registrar tu asistencia
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-red-200/70">{error}</p>
        <button
          type="button"
          onClick={onReintentar}
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
        Entrar a la sala registra tu asistencia automáticamente.
      </p>
    </section>
  );
}

/* ── Delegó su voto ───────────────────────────────────────────────────── */
function VotoDelegado({ apoderado }: { apoderado: string | null }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white/80">
        <UserCheck className="h-4 w-4" /> Delegaste tu voto
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-white/50">
        {apoderado ? (
          <>
            <span className="text-white/80">{apoderado}</span> vota por ti en
            esta asamblea.
          </>
        ) : (
          "Tu apoderado vota por ti en esta asamblea."
        )}{" "}
        No tienes que registrar asistencia: tu unidad la representa quien
        recibió el poder. Puedes quedarte escuchando.
      </p>
    </section>
  );
}

/* ── Punto en discusión ───────────────────────────────────────────────── */
function PuntoEnCurso({
  punto,
  total,
}: {
  punto: { titulo: string; descripcion?: string } | null;
  total: number;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80">
        <ListOrdered className="h-4 w-4" /> Punto en discusión
      </h2>
      {punto ? (
        <>
          <p className="text-sm font-medium text-white">{punto.titulo}</p>
          {punto.descripcion ? (
            <p className="mt-1.5 text-xs leading-relaxed text-white/50">
              {punto.descripcion}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-white/50">
          {total > 0
            ? "Todos los puntos del orden del día están marcados como hechos."
            : "El orden del día está vacío."}
        </p>
      )}
    </section>
  );
}

type PuntoSala = {
  titulo: string;
  descripcion?: string;
  votacionId?: Id<"votaciones">;
  hecho?: boolean;
};

type VotacionSala = {
  _id: Id<"votaciones">;
  pregunta: string;
  estado: string;
  opciones: { texto: string }[];
};

/** Mesa: crear puntos, marcar hechos y abrir/cerrar la votación del punto. */
function MesaOrdenYPreguntas({
  asambleaId,
  puntos,
  votaciones,
}: {
  asambleaId: Id<"asambleas">;
  puntos: PuntoSala[];
  votaciones: VotacionSala[];
}) {
  const toggleHecho = useMutation(api.asambleas.togglePuntoHecho);
  const toggleVotacion = useMutation(api.asambleas.toggleVotacion);
  const [modal, setModal] = useState<"punto" | "pregunta" | null>(null);

  const porId = new Map(votaciones.map((v) => [v._id as string, v]));

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
        <ListOrdered className="h-4 w-4" aria-hidden /> Orden del día
      </h2>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModal("punto")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Agregar punto
        </button>
        <button
          type="button"
          onClick={() => setModal("pregunta")}
          title="Configura la pregunta y ábrela de inmediato"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
        >
          <Unlock className="h-3.5 w-3.5" aria-hidden />
          Abrir pregunta
        </button>
      </div>

      {puntos.length === 0 ? (
        <p className="text-sm text-white/45">Aún no hay puntos.</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {puntos.map((p, i) => {
            const vt = p.votacionId
              ? porId.get(p.votacionId as string)
              : undefined;
            const abierta = vt?.estado === "abierta";
            return (
              <li
                key={`${p.titulo}-${i}`}
                className="rounded-xl bg-white/[0.04] px-3 py-2"
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    title={p.hecho ? "Marcar pendiente" : "Marcar hecho"}
                    onClick={() =>
                      void toggleHecho({ asambleaId, index: i }).catch(() => {})
                    }
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      p.hecho
                        ? "border-emerald-400/50 bg-emerald-500/30 text-emerald-200"
                        : "border-white/20 text-transparent hover:border-white/40",
                    )}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        p.hecho ? "text-white/40 line-through" : "text-white/90",
                      )}
                    >
                      {p.titulo}
                    </p>
                    {vt ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            abierta
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-white/10 text-white/50",
                          )}
                        >
                          {abierta ? "Votación abierta" : "Votación lista"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void toggleVotacion({ id: vt._id }).catch(() => {})
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20"
                        >
                          {abierta ? (
                            <>
                              <Lock className="h-3 w-3" aria-hidden /> Cerrar
                            </>
                          ) : (
                            <>
                              <Unlock className="h-3 w-3" aria-hidden /> Abrir
                            </>
                          )}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modal ? (
        <ModalPuntoSala
          asambleaId={asambleaId}
          modo={modal}
          onClose={() => setModal(null)}
        />
      ) : null}
    </section>
  );
}

/**
 * Modal para configurar pregunta/título y opciones de respuesta
 * (misma idea que en la ficha admin).
 */
function ModalPuntoSala({
  asambleaId,
  modo,
  onClose,
}: {
  asambleaId: Id<"asambleas">;
  modo: "punto" | "pregunta";
  onClose: () => void;
}) {
  const agregar = useMutation(api.asambleas.agregarPunto);
  const crearPregunta = useMutation(api.asambleas.createVotacion);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [habilitar, setHabilitar] = useState(true);
  const [opciones, setOpciones] = useState(["A favor", "En contra", "Abstención"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrirYa = modo === "pregunta";
  const muestraOpciones = abrirYa || habilitar;

  async function guardar() {
    const t = titulo.trim();
    if (!t) {
      setError("La pregunta / título es obligatorio.");
      return;
    }
    const ops = opciones.map((o) => o.trim()).filter(Boolean);
    if (muestraOpciones && ops.length < 2) {
      setError("La votación necesita al menos 2 opciones.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (abrirYa) {
        await crearPregunta({ asambleaId, pregunta: t, opciones: ops });
      } else {
        await agregar({
          asambleaId,
          titulo: t,
          descripcion: descripcion.trim() || undefined,
          habilitarVotacion: habilitar,
          opciones: ops,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="modal-punto-sala-titulo"
        className="relative z-10 w-full max-w-lg rounded-t-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2
            id="modal-punto-sala-titulo"
            className="text-lg font-semibold text-zinc-900"
          >
            {abrirYa ? "Abrir pregunta" : "Crear punto del orden del día"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-800">
              Pregunta / Título
            </span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Aprobación del presupuesto 2026"
              autoFocus
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-brand"
            />
          </label>

          {!abrirYa ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-800">
                Descripción{" "}
                <span className="font-normal text-zinc-500">(opcional)</span>
              </span>
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalle del punto"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-brand"
              />
            </label>
          ) : null}

          {!abrirYa ? (
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={habilitar}
                onChange={(e) => setHabilitar(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 accent-brand"
              />
              <span className="text-sm font-medium text-zinc-800">
                Habilitar votación en este punto
              </span>
            </label>
          ) : (
            <p className="text-xs text-zinc-500">
              Se abre de inmediato para que los presentes puedan votar.
            </p>
          )}

          {muestraOpciones ? (
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <span className="text-xs font-medium text-zinc-500">
                Opciones de la votación
              </span>
              {opciones.map((op, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={op}
                    onChange={(e) =>
                      setOpciones((prev) =>
                        prev.map((x, idx) =>
                          idx === i ? e.target.value : x,
                        ),
                      )
                    }
                    placeholder={`Opción ${i + 1}`}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-brand"
                  />
                  {opciones.length > 2 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setOpciones((prev) =>
                          prev.filter((_, idx) => idx !== i),
                        )
                      }
                      className="rounded p-1.5 text-zinc-400 hover:text-red-600"
                      aria-label="Quitar opción"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOpciones((prev) => [...prev, ""])}
                className="text-sm font-medium text-brand hover:underline"
              >
                + Agregar opción
              </button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void guardar()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {abrirYa ? "Abrir votación" : "Crear punto"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mesa: quién ya votó / pendientes en cada votación abierta. */
function MesaSeguimientoVotos({
  asambleaId,
  abiertas,
}: {
  asambleaId: Id<"asambleas">;
  abiertas: VotacionSala[];
}) {
  const det = useQuery(api.asambleas.asistentesDetallado, { asambleaId });
  const toggle = useMutation(api.asambleas.toggleVotacion);
  const filas = det?.filas ?? [];
  const presentes = filas.filter((f) => f.presente);

  return (
    <section className="rounded-2xl border border-brand/30 bg-brand/10 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <ShieldCheck className="h-4 w-4" aria-hidden /> Seguimiento de votos
      </h2>
      <div className="space-y-4">
        {abiertas.map((vt) => {
          const id = vt._id as string;
          const votaron = filas
            .filter((f) => f.votos[id] != null)
            .map((f) => f.unidadNumero)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          const pendientes = presentes
            .filter((f) => f.votos[id] == null)
            .map((f) => f.unidadNumero)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          return (
            <div key={id} className="rounded-xl bg-black/25 p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-medium text-white/90">
                  {vt.pregunta}
                </p>
                <button
                  type="button"
                  onClick={() => void toggle({ id: vt._id }).catch(() => {})}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
                >
                  <Lock className="h-3 w-3" aria-hidden /> Cerrar
                </button>
              </div>
              <p className="mb-2 text-[11px] text-white/50">
                {votaron.length} votaron
                {pendientes.length > 0
                  ? ` · ${pendientes.length} pendientes`
                  : presentes.length > 0
                    ? " · sin pendientes"
                    : ""}
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="mb-1 font-semibold text-emerald-300/90">
                    Ya votaron
                  </p>
                  <p className="leading-relaxed text-white/70">
                    {votaron.length > 0 ? votaron.join(", ") : "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-amber-200/90">
                    Pendientes
                  </p>
                  <p className="leading-relaxed text-white/70">
                    {pendientes.length > 0 ? pendientes.join(", ") : "—"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Votaciones abiertas ──────────────────────────────────────────────
 *
 * Se vota AQUÍ. Mandar al residente a otra pantalla cortaría su latido y,
 * con `exigirConexionParaVotar` activo, lo dejaría sin poder votar
 * justamente por haber ido a votar. */
function VotacionesAbiertas({
  abiertas,
  misVotos,
}: {
  abiertas: {
    _id: Id<"votaciones">;
    pregunta: string;
    opciones: { texto: string }[];
  }[];
  misVotos: Record<string, number>;
}) {
  return (
    <>
      {abiertas.map((vt) => (
        <VotacionCard
          key={vt._id}
          votacionId={vt._id}
          pregunta={vt.pregunta}
          opciones={vt.opciones}
          miVoto={misVotos[vt._id as string]}
        />
      ))}
    </>
  );
}

function VotacionCard({
  votacionId,
  pregunta,
  opciones,
  miVoto,
}: {
  votacionId: Id<"votaciones">;
  pregunta: string;
  opciones: { texto: string }[];
  miVoto: number | undefined;
}) {
  const votar = useMutation(api.asambleas.votar);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-brand/40 bg-brand/10 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
        <ShieldCheck className="h-4 w-4" /> Votación abierta
      </h2>
      <p className="mb-3 text-sm leading-relaxed text-white/85">{pregunta}</p>

      <div className="space-y-2">
        {opciones.map((o, i) => {
          const elegida = miVoto === i;
          return (
            <button
              key={i}
              type="button"
              disabled={busy !== null}
              aria-pressed={elegida}
              onClick={async () => {
                setBusy(i);
                setError(null);
                try {
                  await votar({ votacionId, opcionIndex: i });
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "No se pudo registrar tu voto.",
                  );
                } finally {
                  setBusy(null);
                }
              }}
              className={cn(
                "flex h-11 w-full items-center justify-between gap-3 rounded-xl px-4 text-sm font-medium transition-colors",
                elegida
                  ? "bg-white text-[#0f1115]"
                  : "border border-white/15 bg-white/5 text-white hover:bg-white/10",
                busy !== null && "opacity-70",
              )}
            >
              <span>{o.texto}</span>
              {busy === i ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : elegida ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : null}
            </button>
          );
        })}
      </div>

      {miVoto !== undefined ? (
        <p className="mt-2 text-xs text-white/60">
          Tu voto quedó registrado. Puedes cambiarlo mientras siga abierta.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}


/* ── Levantar la mano (barra del escenario) ──────────────────────────── */
function BotonMano({
  estado,
  onPedir,
  onBajar,
}: {
  estado: "pedida" | "concedida" | null;
  onPedir: () => void;
  onBajar: () => void;
}) {
  const levantada = estado !== null;
  return (
    <button
      type="button"
      onClick={levantada ? onBajar : onPedir}
      aria-pressed={levantada}
      title={
        estado === "concedida"
          ? "Tienes la palabra — bajar la mano"
          : levantada
            ? "Mano levantada — bajarla"
            : "Pedir la palabra"
      }
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
        estado === "concedida"
          ? "bg-emerald-500 text-white hover:bg-emerald-600"
          : levantada
            ? "bg-amber-500 text-white hover:bg-amber-600"
            : "bg-white/10 text-white/85 hover:bg-white/20",
      )}
    >
      <Hand className="h-5 w-5" aria-hidden />
    </button>
  );
}

/* ── Manos levantadas (panel de la mesa) ─────────────────────────────── */
function ManosLevantadas({
  filas,
  onResolver,
}: {
  filas: { userId: Id<"users">; nombre: string; estado: "pedida" | "concedida" }[];
  onResolver: (userId: Id<"users">, conceder: boolean) => void;
}) {
  return (
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-200">
        <Hand className="h-4 w-4" aria-hidden /> Manos levantadas
      </h2>
      <ul className="space-y-2">
        {filas.map((f) => (
          <li key={f.userId as string} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-white/85">
              {f.nombre}
            </span>
            {f.estado === "concedida" ? (
              <>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Al aire
                </span>
                <button
                  type="button"
                  onClick={() => onResolver(f.userId, false)}
                  title="Silenciar y quitar la palabra"
                  className="inline-flex items-center gap-1 rounded-lg bg-red-500/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600"
                >
                  <MicOff className="h-3 w-3" aria-hidden />
                  Silenciar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onResolver(f.userId, true)}
                  className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
                >
                  Dar la palabra
                </button>
                <button
                  type="button"
                  onClick={() => onResolver(f.userId, false)}
                  className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20"
                >
                  Bajar
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}


/* ── Quién está en la sala ───────────────────────────────────────────────
 * Preferimos `personas` (presencia Meet: una fila por pestaña). Si aún no
 * hay, caemos a `conectados` agrupado por nombre (unidades). */
function EnLaSala({ sala }: { sala: SalaEnVivo | undefined }) {
  if (!sala) return null;

  const desdePresencia = (sala.personas ?? []).map((p) => ({
    nombre: p.nombre,
    imageUrl: p.imageUrl ?? null,
    unidades: [] as string[],
    esPoder: false,
    esMesa: p.esMesa,
  }));

  let personas = desdePresencia;
  if (personas.length === 0 && sala.conectados.length > 0) {
    const porPersona = new Map<
      string,
      {
        nombre: string;
        imageUrl: string | null;
        unidades: string[];
        esPoder: boolean;
        esMesa: boolean;
      }
    >();
    for (const c of sala.conectados) {
      const previa = porPersona.get(c.userNombre);
      if (previa) {
        previa.unidades.push(c.unidadNumero);
        previa.esPoder = previa.esPoder || c.esPoder;
      } else {
        porPersona.set(c.userNombre, {
          nombre: c.userNombre,
          imageUrl: null,
          unidades: [c.unidadNumero],
          esPoder: c.esPoder,
          esMesa: false,
        });
      }
    }
    personas = [...porPersona.values()];
  }

  if (personas.length === 0) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
        <Users className="h-4 w-4" aria-hidden /> En la sala ({personas.length})
      </h2>
      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {personas.map((per) => (
          <li
            key={per.nombre}
            className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2"
          >
            {per.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={per.imageUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{
                  backgroundColor: [
                    "#1a73e8",
                    "#188038",
                    "#c5221f",
                    "#e37400",
                    "#9334e6",
                    "#0b8043",
                  ][
                    Math.abs(
                      [...per.nombre].reduce(
                        (h, ch) => (h * 31 + ch.charCodeAt(0)) | 0,
                        0,
                      ),
                    ) % 6
                  ],
                }}
              >
                {per.nombre.trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white/90">
                {per.nombre}
                {per.esMesa ? (
                  <span className="ml-1.5 text-[11px] font-normal text-white/45">
                    mesa
                  </span>
                ) : null}
              </p>
              {per.unidades.length > 0 ? (
                <p className="truncate text-[11px] text-white/45">
                  {per.unidades.join(", ")}
                  {per.esPoder ? " · Poder" : ""}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
