"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowLeft,
  Captions,
  CheckCircle2,
  Crown,
  Hand,
  Clock,
  ListOrdered,
  Loader2,
  Lock,
  Maximize2,
  MicOff,
  Minimize2,
  LogOut,
  PhoneOff,
  Plus,
  Radio,
  ScrollText,
  ShieldCheck,
  Timer,
  Trash2,
  Unlock,
  UserCheck,
  UserRound,
  Users,
  Video,
  Vote,
  X,
} from "lucide-react";
import { EscenarioVideo } from "@/components/asamblea/escenario-video";
import { BotonChatSala, SalaChatSheet } from "@/components/asamblea/sala-chat";
import { PanelEnlaceInvitados } from "@/components/asamblea/panel-enlace-invitados";
import { PanelTranscripcionSala } from "@/components/asamblea/panel-transcripcion-sala";
import type { Calidad } from "@/hooks/use-video-sala";
import { useSalaLatido } from "@/hooks/use-sala-latido";
import { cn, mensajeErrorUsuario } from "@/lib/utils";

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
  puedeGestionarInvitados = false,
}: {
  asambleaId: Id<"asambleas">;
  condominioId: Id<"condominios">;
  volverHref: string;
  /** La mesa ve controles de apertura; el residente, el registro. */
  esMesa: boolean;
  /** Solo administrador: enlace de invitados. */
  puedeGestionarInvitados?: boolean;
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
  const grabacionActiva = useQuery(api.salaBitacora.grabacionActiva, {
    asambleaId,
  });
  const detenerGrabacion = useMutation(api.salaBitacora.detenerGrabacion);
  /* Visible para TODOS, no solo para la mesa: transcribir es tratamiento de
   * datos personales y quien está en la sala tiene derecho a saberlo. */
  const transcripcion = useQuery(api.intervenciones.estado, { asambleaId });
  const bitacora = useQuery(
    api.salaBitacora.listar,
    esMesa ? { asambleaId } : "skip",
  );
  /* Arranca en "normal": mejor audio/video; la mesa puede bajar a ahorro
   * si la asamblea es muy grande y la red se satura. */
  const [calidad, setCalidad] = useState<Calidad>("normal");
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

  /* Panel lateral: oculto por defecto. La votación sale en modal, no aquí. */
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [modalInvitados, setModalInvitados] = useState(false);
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const [modalVotoId, setModalVotoId] = useState<Id<"votaciones"> | null>(null);
  const [modalResultadosId, setModalResultadosId] =
    useState<Id<"votaciones"> | null>(null);
  const [modalOrden, setModalOrden] = useState(false);
  const [chatAbierto, setChatAbierto] = useState(false);
  const [transcripcionAbierta, setTranscripcionAbierta] = useState(false);
  const [modalPresidente, setModalPresidente] = useState(false);
  const [avisoVoto, setAvisoVoto] = useState(false);
  const autoVotoVisto = useRef(new Set<string>());

  useEffect(() => {
    if (registro.error) setPanelAbierto(true);
  }, [registro.error]);

  /* Al abrir (o reabrir) una votación: popup para votar/cambiar + aviso. */
  useEffect(() => {
    if (!votaciones) return;
    const puedeVotarAhora =
      enCursoQ &&
      (mi?.presente ?? false) &&
      !(!!mi?.delegoTodo && (mi?.representa?.length ?? 0) === 0);
    if (!puedeVotarAhora) return;
    for (const vt of votaciones) {
      if (vt.estado !== "abierta") continue;
      const id = vt._id as string;
      /* Cada reapertura refresca `abiertaEn` → nueva clave → modal otra vez. */
      const clave = `${id}:${vt.abiertaEn ?? "sin"}`;
      if (autoVotoVisto.current.has(clave)) continue;
      autoVotoVisto.current.add(clave);
      setModalVotoId(vt._id);
      setAvisoVoto(true);
      setChatAbierto(false);
      setModalOrden(false);
      setPanelAbierto(false);
      break;
    }
  }, [votaciones, enCursoQ, mi?.presente, mi?.delegoTodo, mi?.representa]);

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
  const misVotos = mi?.votos ?? {};
  const pendientesVoto = abiertas.filter(
    (vt) => misVotos[vt._id as string] == null,
  );
  const puedeVotar =
    (mi?.presente ?? false) &&
    !(!!mi?.delegoTodo && (mi?.representa?.length ?? 0) === 0);
  const puntos =
    a.ordenDia ?? a.agenda.map((t) => ({ titulo: t, hecho: false as boolean }));
  const miPalabra = (palabras ?? []).find((f) => f.mia) ?? null;
  const esPresidente =
    !!mi?.userId && a.presidenteUserId === mi.userId;
  const puedeModerarPalabra = esMesa || esPresidente;
  const manosLevantadas = (palabras ?? []).filter(
    (f) => !f.mia || puedeModerarPalabra,
  );
  const palabraAlAire =
    (palabras ?? []).find((f) => f.estado === "concedida") ?? null;
  const votacionConTiempo =
    abiertas.find((v) => v.cierraEn != null) ?? abiertas[0] ?? null;

  /* Delegó todas sus unidades y no es apoderado de ninguna otra: no tiene
   * nada que registrar ni que votar. Puede quedarse escuchando, pero no se
   * le ofrece una acción que el backend va a rechazar. */
  const delegoSinRepresentar =
    !!mi?.delegoTodo && (mi?.representa?.length ?? 0) === 0;

  const manosPedidas = (palabras ?? []).filter(
    (f) => f.estado === "pedida",
  ).length;

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
            {a.presidenteNombre ? (
              <>
                {" "}
                · Presidente:{" "}
                <span className="text-white/80">{a.presidenteNombre}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {grabacionActiva ? (
            esMesa ? (
              <button
                type="button"
                onClick={() => void detenerGrabacion({ asambleaId }).catch(() => {})}
                title="Tocar para detener / limpiar el aviso de grabación"
                className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-red-600"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                Grabando · parar
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-semibold text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                Grabando
              </span>
            )
          ) : null}
          {transcripcion?.activa ? (
            <span
              title="Lo que se hable se está transcribiendo para el acta"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Transcribiendo
            </span>
          ) : null}
          {!panelAbierto ? (
            <EstadoConexion latido={latido} enCurso={enCurso} />
          ) : null}
          {esMesa && enCurso ? (
            <button
              type="button"
              onClick={() => setModalPresidente(true)}
              aria-label="Asignar presidente"
              title={
                a.presidenteNombre
                  ? `Presidente: ${a.presidenteNombre}`
                  : "Asignar presidente de la asamblea"
              }
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                a.presidenteNombre
                  ? "bg-amber-500/25 text-amber-200 hover:bg-amber-500/35"
                  : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white",
              )}
            >
              <Crown className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          {esMesa && enCurso ? (
            <button
              type="button"
              onClick={() => {
                const filas = bitacora ?? [];
                const etiquetas: Record<string, string> = {
                  entrada: "Entró",
                  salida: "Salió",
                  palabra_pedida: "Pidió la palabra",
                  palabra_concedida: "Palabra concedida",
                  palabra_retirada: "Palabra retirada",
                  votacion_abierta: "Votación abierta",
                  votacion_cerrada: "Votación cerrada",
                  voto: "Votó",
                  chat: "Chat",
                  reaccion: "Reacción",
                  grabacion_inicio: "Grabación iniciada",
                  grabacion_fin: "Grabación finalizada",
                  presidente_asignado: "Presidente",
                };
                const lineas = [
                  `Bitácora · ${a.titulo}`,
                  `Presidente: ${a.presidenteNombre ?? "(sin asignar)"}`,
                  `Generada: ${new Date().toLocaleString()}`,
                  "",
                  ...filas.map((f) => {
                    const t = new Date(f.createdAt).toLocaleTimeString();
                    const etiqueta = etiquetas[f.tipo] ?? f.tipo;
                    return `[${t}] ${etiqueta} · ${f.nombre}${f.detalle ? ` — ${f.detalle}` : ""}`;
                  }),
                ];
                const blob = new Blob([lineas.join("\n")], {
                  type: "text/plain;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);
                const el = document.createElement("a");
                el.href = url;
                el.download = `bitacora-asamblea-${Date.now()}.txt`;
                el.click();
                URL.revokeObjectURL(url);
              }}
              aria-label="Descargar bitácora"
              title="Descargar bitácora (entradas, votos, palabra…)"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <ScrollText className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          {puedeGestionarInvitados && enCurso ? (
            <button
              type="button"
              onClick={() => setModalInvitados(true)}
              aria-label="Enlace de invitados"
              title="Invitados (enlace externo, sin voto)"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <UserRound className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          {enCurso ? (
            <button
              type="button"
              onClick={() => setPanelAbierto((v) => !v)}
              aria-label="Ver quién está en la sala"
              title={
                puedeModerarPalabra
                  ? "Sala, quórum y dar la palabra"
                  : "Ver quién está en la sala"
              }
              className="relative flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold text-white/85 transition-colors hover:bg-white/20"
            >
              <Users className="h-4 w-4" aria-hidden />
              {sala?.personasEnSala ?? 0}
              {puedeModerarPalabra && manosPedidas > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
                  {manosPedidas}
                </span>
              ) : null}
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
            puedoHablar={
              esMesa || esPresidente || miPalabra?.estado === "concedida"
            }
            calidad={calidad}
            onCambiarCalidad={esMesa ? setCalidad : undefined}
            puedoGrabar={esMesa}
            grabacionActivaServidor={!!grabacionActiva}
            nombreEspera={mi?.nombre ?? undefined}
            imageUrlLocal={mi?.imageUrl ?? undefined}
            personas={sala?.personas}
            extraControles={
              !esMesa &&
              !esPresidente &&
              enCurso &&
              (mi?.presente ?? false) ? (
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
                  <BotonChatSala
                    asambleaId={asambleaId}
                    abierto={chatAbierto}
                    onToggle={() => setChatAbierto((v) => !v)}
                  />
                  {/* Transcripción: solo la mesa. Es material de trabajo del
                      acta —sale en bruto y sin revisar—, así que no se le
                      muestra a los residentes hasta que la secretaría la
                      corrige. Que se esté transcribiendo sí lo ven todos, en
                      el aviso de arriba.

                      En presencial no aplica: hay un solo micrófono y no se
                      sabe quién habla. */}
                  {esMesa && a.modalidad !== "presencial" ? (
                    <button
                      type="button"
                      onClick={() => setTranscripcionAbierta((v) => !v)}
                      aria-label="Transcripción"
                      title={
                        transcripcion?.activa
                          ? "Transcripción en vivo — tocar para ver"
                          : "Transcripción"
                      }
                      className={cn(
                        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
                        transcripcionAbierta
                          ? "bg-white/25 text-white"
                          : "bg-white/15 text-white hover:bg-white/25",
                      )}
                    >
                      <Captions className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                      {transcripcion?.activa ? (
                        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-[#14161b] bg-amber-400" />
                      ) : null}
                    </button>
                  ) : null}
                  {esMesa ? (
                    <button
                      type="button"
                      onClick={() => setModalOrden(true)}
                      aria-label="Orden del día"
                      title="Orden del día"
                      className={cn(
                        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
                        modalOrden
                          ? "bg-white/25 text-white"
                          : "bg-white/15 text-white hover:bg-white/25",
                      )}
                    >
                      <ListOrdered className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                      {puntos.filter((p) => !p.hecho).length > 0 ? (
                        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/90 px-1 text-[10px] font-bold text-black">
                          {puntos.filter((p) => !p.hecho).length}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                  {abiertas.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        /* Mesa: seguimiento. Residente pendiente: votar.
                         * Ya votó: ver pendientes / resultados (puede cambiar). */
                        if (esMesa && abiertas[0]) {
                          setModalResultadosId(abiertas[0]._id);
                          return;
                        }
                        if (puedeVotar && pendientesVoto[0]) {
                          setModalVotoId(pendientesVoto[0]._id);
                          return;
                        }
                        if (abiertas[0]) setModalResultadosId(abiertas[0]._id);
                      }}
                      aria-label={
                        esMesa
                          ? "Ver quién ya votó y quién falta"
                          : pendientesVoto.length > 0
                            ? "Hay una votación abierta — tocar para votar"
                            : abiertas.length > 0
                              ? "Cambiar tu voto o ver la votación"
                              : "Ver resultados de la votación"
                      }
                      title={
                        esMesa
                          ? "Quién votó / pendientes"
                          : pendientesVoto.length > 0
                            ? "Votación abierta — toca para votar"
                            : abiertas.length > 0
                              ? "Cambiar voto"
                              : "Resultados de la votación"
                      }
                      className={cn(
                        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
                        pendientesVoto.length > 0
                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                          : "bg-white/15 text-white hover:bg-white/25",
                      )}
                    >
                      <Vote className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                      {pendientesVoto.length > 0 ? (
                        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-black">
                          {pendientesVoto.length}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPanelAbierto((v) => !v)}
                    aria-pressed={panelAbierto}
                    aria-label="Panel de la asamblea"
                    title="Panel de la asamblea"
                    className={cn(
                      "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
                      panelAbierto
                        ? "bg-white/25 text-white"
                        : "bg-white/15 text-white hover:bg-white/25",
                    )}
                  >
                    <Users className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                    {puedeModerarPalabra && manosPedidas > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
                        {manosPedidas}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPerfilAbierto(true)}
                    aria-label="Tu perfil"
                    title={mi?.nombre ? `Perfil · ${mi.nombre}` : "Tu perfil"}
                    className={cn(
                      "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full transition-colors sm:h-12 sm:w-12",
                      perfilAbierto
                        ? "ring-2 ring-white/40"
                        : "bg-white/15 hover:bg-white/25",
                    )}
                  >
                    {mi?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mi.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[11px] font-semibold text-white/85 sm:text-xs">
                        {mi?.nombre
                          ? mi.nombre
                              .trim()
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((p) => p[0]?.toUpperCase() ?? "")
                              .join("") || "?"
                          : "?"}
                      </span>
                    )}
                  </button>
                  <Link
                    href={volverHref}
                    aria-label="Salir de la sala"
                    title="Salir de la sala"
                    className="ml-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600 sm:ml-1 sm:h-12 sm:w-auto sm:gap-2 sm:px-5 sm:text-sm sm:font-semibold"
                  >
                    <PhoneOff className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
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

        {/* ── Sheet de sala (quórum / personas), no tapa el lienzo lateral ─ */}
        {panelAbierto && enCurso ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
            <button
              type="button"
              aria-label="Cerrar panel"
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => setPanelAbierto(false)}
            />
            <div
              role="dialog"
              aria-modal
              aria-label="En la sala"
              className="relative z-10 flex h-[min(80dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#14161b] shadow-2xl sm:rounded-2xl"
            >
              <div className="flex shrink-0 flex-col border-b border-white/10">
                <div className="flex justify-center pt-2.5 sm:hidden">
                  <div className="h-1 w-10 rounded-full bg-white/20" />
                </div>
                <div className="flex items-center gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">En la sala</p>
                    <p className="text-[11px] text-white/45">
                      {puedeModerarPalabra
                        ? "Quórum, personas y dar la palabra"
                        : "Quórum y personas conectadas"}
                    </p>
                  </div>
                  <EstadoConexion latido={latido} enCurso={enCurso} />
                  <button
                    type="button"
                    onClick={() => setPanelAbierto(false)}
                    aria-label="Cerrar"
                    className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 sm:px-5">
                <ResumenSala sala={sala} />

                {puedeModerarPalabra ? (
                  <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
                    <ManosLevantadas
                      asambleaId={asambleaId}
                      filas={manosLevantadas}
                    />
                  </div>
                ) : null}

                {!esMesa ? (
                  <div className="shrink-0 space-y-4 border-t border-white/10 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    {delegoSinRepresentar ? (
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
                    )}
                  </div>
                ) : (
                  <div className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]" />
                )}
              </div>
            </div>
          </div>
        ) : null}

        {transcripcionAbierta && esMesa && a.modalidad !== "presencial" ? (
          <PanelTranscripcionSala
            asambleaId={asambleaId}
            esMesa={esMesa}
            onCerrar={() => setTranscripcionAbierta(false)}
          />
        ) : null}

        {/* Modal aparte: enlace de invitados (solo administrador) */}
        {modalInvitados && puedeGestionarInvitados && enCurso ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
            <button
              type="button"
              aria-label="Cerrar"
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => setModalInvitados(false)}
            />
            <div
              role="dialog"
              aria-modal
              aria-label="Invitados"
              className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#14161b] shadow-2xl sm:rounded-2xl"
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">Invitados</p>
                  <p className="text-[11px] text-white/45">
                    Enlace externo · sin voto ni quórum
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalInvitados(false)}
                  aria-label="Cerrar"
                  className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
                <PanelEnlaceInvitados asambleaId={asambleaId} />
              </div>
            </div>
          </div>
        ) : null}

        {/* Perfil de la cuenta con la que estás en la sala */}
        {perfilAbierto ? (
          <div className="fixed inset-0 z-[45] flex items-end justify-center sm:items-center">
            <button
              type="button"
              aria-label="Cerrar"
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => setPerfilAbierto(false)}
            />
            <div
              role="dialog"
              aria-modal
              aria-label="Tu perfil"
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-t-2xl border border-white/10 bg-[#14161b] shadow-2xl sm:rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <p className="text-sm font-semibold text-white">Tu cuenta</p>
                <button
                  type="button"
                  onClick={() => setPerfilAbierto(false)}
                  aria-label="Cerrar"
                  className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-2 ring-white/10">
                    {mi?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mi.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-lg font-semibold text-white/80">
                        {mi?.nombre
                          ? mi.nombre
                              .trim()
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((p) => p[0]?.toUpperCase() ?? "")
                              .join("") || "?"
                          : "?"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-white">
                      {mi?.nombre ?? "Sin nombre"}
                    </p>
                    {mi?.email ? (
                      <p className="mt-0.5 truncate text-sm text-white/45">
                        {mi.email}
                      </p>
                    ) : null}
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/75">
                      {mi?.platformRole === "superadmin" ? (
                        <>
                          <ShieldCheck className="h-3 w-3 text-violet-300" aria-hidden />
                          Superadmin
                        </>
                      ) : mi?.platformRole === "admin" ? (
                        <>
                          <ShieldCheck className="h-3 w-3 text-sky-300" aria-hidden />
                          Desarrollador
                        </>
                      ) : esMesa ? (
                        <>
                          <ShieldCheck className="h-3 w-3" aria-hidden />
                          Administrador
                        </>
                      ) : esPresidente ? (
                        <>
                          <Crown className="h-3 w-3 text-amber-300" aria-hidden />
                          Presidente
                        </>
                      ) : (
                        <>
                          <UserCheck className="h-3 w-3" aria-hidden />
                          Participante
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {(mi?.unidades?.length ?? 0) > 0 ||
                (mi?.representa?.length ?? 0) > 0 ? (
                  <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                    {(mi?.unidades?.length ?? 0) > 0 ? (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-white/35">
                          Unidades presentes
                        </p>
                        <p className="mt-1 text-sm text-white/80">
                          {mi!.unidades.join(", ")}
                        </p>
                      </div>
                    ) : null}
                    {(mi?.representa?.length ?? 0) > 0 ? (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-white/35">
                          Representas
                        </p>
                        <p className="mt-1 text-sm text-white/80">
                          {mi!.representa.join(", ")}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <p className="mt-5 text-center text-[11px] leading-relaxed text-white/30">
                  Esta es la cuenta con la que entraste a la asamblea.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Cronómetros del escenario: visibles para TODOS en la sala. */}
      {enCurso && (votacionConTiempo || palabraAlAire) ? (
        <div className="pointer-events-none absolute inset-x-0 top-[4.5rem] z-[35] flex flex-col items-center gap-2 px-3 sm:top-20">
          {palabraAlAire ? (
            <div className="pointer-events-auto flex max-w-lg items-center gap-2.5 rounded-2xl border border-emerald-400/35 bg-black/75 px-4 py-2.5 shadow-xl backdrop-blur-md">
              <Hand className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                {palabraAlAire.mia
                  ? "Tienes la palabra"
                  : `${palabraAlAire.nombre} · al aire`}
              </p>
              {palabraAlAire.cierraEn ? (
                <CuentaRegresivaVoto
                  cierraEn={palabraAlAire.cierraEn}
                  grande
                />
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1.5 text-sm font-semibold text-emerald-200">
                  <Clock className="h-4 w-4" aria-hidden />
                  En vivo
                </span>
              )}
            </div>
          ) : null}
          {votacionConTiempo ? (
            <div className="pointer-events-auto flex max-w-lg items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-black/75 px-4 py-2.5 shadow-xl backdrop-blur-md">
              <Vote className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                {votacionConTiempo.pregunta}
              </p>
              {votacionConTiempo.cierraEn ? (
                <CuentaRegresivaVoto
                  cierraEn={votacionConTiempo.cierraEn}
                  grande
                />
              ) : votacionConTiempo.abiertaEn ? (
                <CronometroDesde desde={votacionConTiempo.abiertaEn} />
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-amber-200">
                  <Timer className="h-4 w-4" aria-hidden />
                  Abierta
                </span>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Aviso flotante: indica el icono de votación en la barra */}
      {enCurso &&
      avisoVoto &&
      pendientesVoto.length > 0 &&
      !modalVotoId ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-emerald-400/30 bg-[#1c1f26]/95 px-4 py-3 shadow-xl backdrop-blur">
            <Vote className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                Hay una votación abierta
              </p>
              <p className="text-[11px] text-white/55">
                Toca el icono verde de votar en la barra de abajo, o aquí.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (pendientesVoto[0]) setModalVotoId(pendientesVoto[0]._id);
              }}
              className="shrink-0 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
            >
              Votar
            </button>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setAvisoVoto(false)}
              className="shrink-0 rounded-lg p-1 text-white/40 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {modalOrden && esMesa ? (
        <ModalOrdenDiaSala
          asambleaId={asambleaId}
          puntos={puntos}
          votaciones={votaciones ?? []}
          onClose={() => setModalOrden(false)}
        />
      ) : null}

      {modalPresidente && esMesa ? (
        <ModalAsignarPresidente
          asambleaId={asambleaId}
          presidenteNombre={a.presidenteNombre ?? null}
          presidenteUserId={(a.presidenteUserId as Id<"users"> | undefined) ?? null}
          candidatos={(sala?.personas ?? [])
            .filter((p) => p.userId)
            .map((p) => ({
              userId: p.userId as Id<"users">,
              nombre: p.nombre,
              esMesa: !!p.esMesa,
            }))}
          onClose={() => setModalPresidente(false)}
        />
      ) : null}

      <SalaChatSheet
        asambleaId={asambleaId}
        abierto={chatAbierto && enCurso}
        onClose={() => setChatAbierto(false)}
        miNombre={mi?.nombre ?? undefined}
        miUserId={mi?.userId ?? undefined}
        esMesa={esMesa}
      />

      {modalVotoId ? (
        <ModalVotarSala
          votacion={
            abiertas.find((v) => v._id === modalVotoId) ??
            (votaciones ?? []).find((v) => v._id === modalVotoId) ??
            null
          }
          miVoto={misVotos[modalVotoId as string]}
          onClose={() => setModalVotoId(null)}
          onVerResultados={() => {
            setModalVotoId(null);
            setModalResultadosId(modalVotoId);
          }}
        />
      ) : null}

      {modalResultadosId ? (
        <ModalResultadosSala
          asambleaId={asambleaId}
          votacionId={modalResultadosId}
          esMesa={esMesa}
          onClose={() => setModalResultadosId(null)}
          onVolverAVotar={
            puedeVotar &&
            abiertas.some((v) => v._id === modalResultadosId)
              ? () => {
                  setModalResultadosId(null);
                  setModalVotoId(modalResultadosId);
                }
              : undefined
          }
        />
      ) : null}
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

/* ── Quórum + personas (un bloque, sin cajas sueltas) ─────────────────── */
type SalaEnVivo = NonNullable<
  FunctionReturnType<typeof api.asambleaSala.salaEnVivo>
>;

type PersonaSala = {
  nombre: string;
  imageUrl: string | null;
  unidades: string[];
  esPoder: boolean;
  esMesa: boolean;
  esInvitado: boolean;
};

function personasDeSala(sala: SalaEnVivo): PersonaSala[] {
  const desdePresencia = (sala.personas ?? []).map((p) => ({
    nombre: p.nombre,
    imageUrl: p.imageUrl ?? null,
    unidades: [] as string[],
    esPoder: false,
    esMesa: !!p.esMesa,
    esInvitado: !!p.esInvitado,
  }));
  if (desdePresencia.length > 0) return desdePresencia;

  const porPersona = new Map<string, PersonaSala>();
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
        esInvitado: false,
      });
    }
  }
  return [...porPersona.values()];
}

function ResumenSala({ sala }: { sala: SalaEnVivo | null | undefined }) {
  if (!sala) return null;
  const personas = personasDeSala(sala);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">
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
            coeficiente · {sala.unidadesConectadas}/{sala.totalUnidades} unidades
            {personas.length > 0 ? ` · ${personas.length} en sala` : ""}
          </span>
        </div>
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
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
        <p className="mt-1.5 text-[11px] text-white/40">
          Quórum {sala.quorumRequerido}% ·{" "}
          {sala.hayQuorum ? "alcanzado" : "aún sin quórum"}
        </p>
      </div>

      {personas.length > 0 ? (
        <ul className="mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pb-2">
          {personas.map((per) => (
            <li
              key={per.nombre}
              className="flex items-center gap-2.5 py-1"
            >
              {per.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={per.imageUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{
                    backgroundColor: [
                      "#1a73e8",
                      "#188038",
                      "#c5221f",
                      "#e37400",
                      "#9334e6",
                      "#00786a",
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
                <p className="truncate text-sm text-white/85">
                  {per.nombre}
                  {per.esMesa ? (
                    <span className="ml-1.5 text-[10px] text-white/40">
                      mesa
                    </span>
                  ) : per.esInvitado ? (
                    <span className="ml-1.5 text-[10px] text-amber-200/70">
                      invitado
                    </span>
                  ) : null}
                </p>
                {per.unidades.length > 0 ? (
                  <p className="truncate text-[11px] text-white/40">
                    {per.unidades.join(", ")}
                    {per.esPoder ? " · Poder" : ""}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-white/40">Nadie conectado aún.</p>
      )}
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
  cierraEn?: number | null;
  abiertaEn?: number | null;
};

const DURACIONES_PREGUNTA: { label: string; segundos: number }[] = [
  { label: "1 min", segundos: 60 },
  { label: "2 min", segundos: 120 },
  { label: "5 min", segundos: 300 },
  { label: "10 min", segundos: 600 },
  { label: "15 min", segundos: 900 },
  { label: "Sin límite", segundos: 0 },
];

const DURACIONES_PALABRA: { label: string; segundos: number }[] = [
  { label: "1 min", segundos: 60 },
  { label: "2 min", segundos: 120 },
  { label: "3 min", segundos: 180 },
  { label: "5 min", segundos: 300 },
  { label: "Sin límite", segundos: 0 },
];

function formatearRestante(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

function CuentaRegresivaVoto({
  cierraEn,
  grande = false,
  claro = false,
}: {
  cierraEn: number;
  grande?: boolean;
  /** Para fondos claros (modales blancos). */
  claro?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = cierraEn - now;
  if (ms <= 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full font-semibold",
          grande ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[10px]",
          claro
            ? "bg-amber-100 text-amber-800"
            : "bg-amber-500/20 text-amber-200",
        )}
      >
        <Timer className={grande ? "h-4 w-4" : "h-3 w-3"} aria-hidden />
        Tiempo agotado
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold tabular-nums",
        grande ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-[10px]",
        claro
          ? ms < 30_000
            ? "bg-red-100 text-red-700"
            : "bg-emerald-100 text-emerald-800"
          : ms < 30_000
            ? "bg-red-500/20 text-red-200"
            : "bg-emerald-500/20 text-emerald-200",
      )}
    >
      <Clock className={grande ? "h-4 w-4" : "h-3 w-3"} aria-hidden />
      {formatearRestante(ms)}
    </span>
  );
}

/** Cronómetro que cuenta hacia arriba desde un instante (votación sin límite). */
function CronometroDesde({ desde }: { desde: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1.5 text-base font-semibold tabular-nums text-amber-200">
      <Timer className="h-4 w-4" aria-hidden />
      {formatearRestante(now - desde)}
    </span>
  );
}

/** Asignar presidente de la asamblea (mesa). */
function ModalAsignarPresidente({
  asambleaId,
  presidenteNombre,
  presidenteUserId,
  candidatos,
  onClose,
}: {
  asambleaId: Id<"asambleas">;
  presidenteNombre: string | null;
  presidenteUserId: Id<"users"> | null;
  candidatos: { userId: Id<"users">; nombre: string; esMesa?: boolean }[];
  onClose: () => void;
}) {
  const asignar = useMutation(api.asambleas.asignarPresidente);
  const [nombreLibre, setNombreLibre] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(userId?: Id<"users">, nombre?: string) {
    setBusy(true);
    setError(null);
    try {
      await asignar({
        asambleaId,
        userId,
        nombre: nombre?.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar.");
      setBusy(false);
    }
  }

  const unicos = new Map<string, (typeof candidatos)[number]>();
  for (const c of candidatos) {
    if (!unicos.has(c.userId as string)) unicos.set(c.userId as string, c);
  }
  const lista = [...unicos.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, undefined, { sensitivity: "base" }),
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="modal-presidente-titulo"
        className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#14161b] text-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <h2
            id="modal-presidente-titulo"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <Crown className="h-5 w-5 text-amber-300" aria-hidden />
            Presidente de la asamblea
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-sm text-white/55">
            Queda registrado en la bitácora y en el encabezado de la sala.
          </p>

          {presidenteNombre ? (
            <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/80">
                Actual
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {presidenteNombre}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void elegir()}
                className="mt-2 text-xs font-semibold text-amber-200/80 hover:text-amber-100 disabled:opacity-50"
              >
                Quitar asignación
              </button>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">
              Personas en la sala
            </p>
            {lista.length === 0 ? (
              <p className="text-sm text-white/40">
                Nadie con cuenta conectado todavía. Puedes escribir el nombre
                abajo.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {lista.map((c) => {
                  const activo = presidenteUserId === c.userId;
                  return (
                    <li key={c.userId as string}>
                      <button
                        type="button"
                        disabled={busy || activo}
                        onClick={() => void elegir(c.userId, c.nombre)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60",
                          activo
                            ? "bg-amber-500/20 text-amber-100"
                            : "bg-white/[0.04] text-white/90 hover:bg-white/10",
                        )}
                      >
                        <span className="min-w-0 truncate">
                          {c.nombre}
                          {c.esMesa ? (
                            <span className="ml-1.5 text-[10px] text-white/40">
                              mesa
                            </span>
                          ) : null}
                        </span>
                        {activo ? (
                          <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                        ) : (
                          <span className="shrink-0 text-[11px] font-semibold text-white/40">
                            Asignar
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-white/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/45">
              O escribir el nombre
            </p>
            <div className="flex gap-2">
              <input
                value={nombreLibre}
                onChange={(e) => setNombreLibre(e.target.value)}
                placeholder="Nombre del presidente"
                maxLength={120}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-base text-white placeholder:text-white/35 outline-none focus:border-white/25"
              />
              <button
                type="button"
                disabled={busy || !nombreLibre.trim()}
                onClick={() => void elegir(undefined, nombreLibre)}
                className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
              >
                Guardar
              </button>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Sheet de orden del día (botón ListOrdered en la barra). */
function ModalOrdenDiaSala({
  asambleaId,
  puntos,
  votaciones,
  onClose,
}: {
  asambleaId: Id<"asambleas">;
  puntos: PuntoSala[];
  votaciones: VotacionSala[];
  onClose: () => void;
}) {
  const toggleHecho = useMutation(api.asambleas.togglePuntoHecho);
  const toggleVotacion = useMutation(api.asambleas.toggleVotacion);
  const extender = useMutation(api.asambleas.extenderVotacion);
  const [modal, setModal] = useState<"punto" | "pregunta" | null>(null);
  const [eligiendoId, setEligiendoId] = useState<string | null>(null);
  const [duracionAbrir, setDuracionAbrir] = useState(300);
  const porId = new Map(votaciones.map((v) => [v._id as string, v]));
  const idsEnOrden = new Set(
    puntos.map((p) => p.votacionId as string | undefined).filter(Boolean),
  );
  /** Preguntas abiertas que no están en el orden (creadas antes del enlace). */
  const huerfanasAbiertas = votaciones.filter(
    (v) => v.estado === "abierta" && !idsEnOrden.has(v._id as string),
  );

  async function abrirConTiempo(id: Id<"votaciones">, segundos: number) {
    setEligiendoId(null);
    await toggleVotacion({ id, duracionSegundos: segundos }).catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="modal-orden-dia-titulo"
        className="relative z-10 flex h-[min(90dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#14161b] text-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 flex-col border-b border-white/10">
          <div className="flex justify-center pt-2.5 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <h2
              id="modal-orden-dia-titulo"
              className="flex items-center gap-2 text-base font-semibold"
            >
              <ListOrdered className="h-5 w-5 text-white/50" aria-hidden />
              Orden del día
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 px-5 pb-3">
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
              title="Configura la pregunta, el tiempo y ábrela de inmediato"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
            >
              <Unlock className="h-3.5 w-3.5" aria-hidden />
              Abrir pregunta
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {huerfanasAbiertas.length > 0 ? (
            <div className="mb-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">
                Votaciones abiertas
              </p>
              <ul className="space-y-2">
                {huerfanasAbiertas.map((vt) => (
                  <li
                    key={vt._id as string}
                    className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-white/90">
                      {vt.pregunta}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        Votación abierta
                      </span>
                      {vt.cierraEn ? (
                        <CuentaRegresivaVoto cierraEn={vt.cierraEn} />
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          void extender({
                            id: vt._id,
                            segundosExtra: 60,
                          }).catch(() => {})
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20"
                      >
                        <Timer className="h-3 w-3" aria-hidden /> +1 min
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void toggleVotacion({ id: vt._id }).catch(() => {})
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20"
                      >
                        <Lock className="h-3 w-3" aria-hidden /> Cerrar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {puntos.length === 0 && huerfanasAbiertas.length === 0 ? (
            <p className="text-sm text-white/45">Aún no hay puntos.</p>
          ) : puntos.length === 0 ? null : (
            <ul className="space-y-2">
              {puntos.map((p, i) => {
                const vt = p.votacionId
                  ? porId.get(p.votacionId as string)
                  : undefined;
                const abierta = vt?.estado === "abierta";
                const eligiendo = eligiendoId === (vt?._id as string);
                return (
                  <li
                    key={`${p.titulo}-${i}`}
                    className="rounded-xl bg-white/[0.04] px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        title={p.hecho ? "Marcar pendiente" : "Marcar hecho"}
                        onClick={() =>
                          void toggleHecho({ asambleaId, index: i }).catch(
                            () => {},
                          )
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
                            p.hecho
                              ? "text-white/40 line-through"
                              : "text-white/90",
                          )}
                        >
                          {p.titulo}
                        </p>
                        {vt ? (
                          <div className="mt-1.5 space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                  abierta
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "bg-white/10 text-white/50",
                                )}
                              >
                                {abierta
                                  ? "Votación abierta"
                                  : "Votación lista"}
                              </span>
                              {abierta && vt.cierraEn ? (
                                <CuentaRegresivaVoto cierraEn={vt.cierraEn} />
                              ) : null}
                              {abierta ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void extender({
                                        id: vt._id,
                                        segundosExtra: 60,
                                      }).catch(() => {})
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20"
                                  >
                                    <Timer className="h-3 w-3" aria-hidden />{" "}
                                    +1 min
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void extender({
                                        id: vt._id,
                                        segundosExtra: 300,
                                      }).catch(() => {})
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20"
                                  >
                                    +5 min
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void toggleVotacion({
                                        id: vt._id,
                                      }).catch(() => {})
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-200 hover:bg-red-500/30"
                                  >
                                    <Lock className="h-3 w-3" aria-hidden />{" "}
                                    Cerrar
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDuracionAbrir(300);
                                    setEligiendoId(
                                      eligiendo ? null : (vt._id as string),
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20"
                                >
                                  <Unlock className="h-3 w-3" aria-hidden />{" "}
                                  Abrir
                                </button>
                              )}
                            </div>
                            {eligiendo && !abierta ? (
                              <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                                <p className="mb-1.5 text-[11px] text-white/50">
                                  Tiempo de la votación
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {DURACIONES_PREGUNTA.map((d) => (
                                    <button
                                      key={d.segundos}
                                      type="button"
                                      onClick={() =>
                                        setDuracionAbrir(d.segundos)
                                      }
                                      className={cn(
                                        "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                        duracionAbrir === d.segundos
                                          ? "bg-emerald-500 text-white"
                                          : "bg-white/10 text-white/70 hover:bg-white/15",
                                      )}
                                    >
                                      {d.label}
                                    </button>
                                  ))}
                                </div>
                                <div className="mt-2 flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEligiendoId(null)}
                                    className="rounded-lg px-2 py-1 text-[11px] text-white/50 hover:text-white"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void abrirConTiempo(
                                        vt._id,
                                        duracionAbrir,
                                      )
                                    }
                                    className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600"
                                  >
                                    Abrir ahora
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {modal ? (
        <ModalPuntoSala
          asambleaId={asambleaId}
          modo={modal}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
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
  const [duracion, setDuracion] = useState(300);
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
        await crearPregunta({
          asambleaId,
          pregunta: t,
          opciones: ops,
          duracionSegundos: duracion,
        });
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
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="modal-punto-sala-titulo"
        className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl sm:rounded-2xl"
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

          {abrirYa ? (
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-800">
                <Timer className="h-4 w-4 text-zinc-500" aria-hidden />
                Tiempo abierta
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DURACIONES_PREGUNTA.map((d) => (
                  <button
                    key={d.segundos}
                    type="button"
                    onClick={() => setDuracion(d.segundos)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      duracion === d.segundos
                        ? "bg-brand text-white"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500">
                Luego puedes cerrarla a mano o sumar más tiempo.
              </p>
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

/** Mesa: acceso rápido al modal de seguimiento (quién votó / quién falta). */
function MesaSeguimientoVotos({
  abiertas,
  onVerResultados,
}: {
  abiertas: VotacionSala[];
  onVerResultados?: (id: Id<"votaciones">) => void;
}) {
  const toggle = useMutation(api.asambleas.toggleVotacion);
  const extender = useMutation(api.asambleas.extenderVotacion);

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <ShieldCheck className="h-4 w-4" aria-hidden /> Votaciones abiertas
      </h2>
      <ul className="space-y-2">
        {abiertas.map((vt) => (
          <li
            key={vt._id as string}
            className="rounded-xl bg-white/[0.04] px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm text-white/90">
                {vt.pregunta}
              </p>
              {vt.cierraEn ? (
                <CuentaRegresivaVoto cierraEn={vt.cierraEn} />
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {onVerResultados ? (
                <button
                  type="button"
                  onClick={() => onVerResultados(vt._id)}
                  className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-black hover:bg-white/90"
                >
                  Quién votó
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  void extender({ id: vt._id, segundosExtra: 60 }).catch(
                    () => {},
                  )
                }
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
              >
                <Timer className="h-3 w-3" aria-hidden /> +1 min
              </button>
              <button
                type="button"
                onClick={() => void toggle({ id: vt._id }).catch(() => {})}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-500/20 px-2 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-500/30"
              >
                <Lock className="h-3 w-3" aria-hidden /> Cerrar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Popup para emitir el voto (no vive en el panel lateral). */
function ModalVotarSala({
  votacion,
  miVoto,
  onClose,
  onVerResultados,
}: {
  votacion: {
    _id: Id<"votaciones">;
    pregunta: string;
    opciones: { texto: string }[];
    estado?: string;
    cierraEn?: number | null;
  } | null;
  miVoto: number | undefined;
  onClose: () => void;
  onVerResultados: () => void;
}) {
  const votar = useMutation(api.asambleas.votar);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!votacion?.cierraEn) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [votacion?.cierraEn]);

  if (!votacion) return null;

  const tiempoAgotado =
    votacion.cierraEn != null && votacion.cierraEn <= now;
  const cerrada =
    votacion.estado === "cerrada" || tiempoAgotado;
  const puedeVotarAqui = !cerrada;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative z-10 w-full max-w-md rounded-t-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  cerrada ? "text-amber-700" : "text-emerald-600",
                )}
              >
                {cerrada
                  ? tiempoAgotado
                    ? "Se acabó el tiempo"
                    : "Votación cerrada"
                  : miVoto !== undefined
                    ? "Puedes cambiar tu voto"
                    : "Votación abierta"}
              </p>
              {votacion.cierraEn ? (
                <CuentaRegresivaVoto cierraEn={votacion.cierraEn} claro />
              ) : null}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-zinc-900">
              {votacion.pregunta}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {cerrada ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {tiempoAgotado
              ? "El tiempo para votar terminó. Ya no se aceptan más votos."
              : "Esta votación ya está cerrada."}
            {miVoto !== undefined ? (
              <p className="mt-1 text-amber-800/80">
                Tu voto quedó registrado:{" "}
                <span className="font-semibold">
                  {votacion.opciones[miVoto]?.texto ?? `opción ${miVoto + 1}`}
                </span>
                .
              </p>
            ) : (
              <p className="mt-1 text-amber-800/80">
                No alcanzaste a votar en esta pregunta.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {votacion.opciones.map((o, i) => {
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
                      await votar({
                        votacionId: votacion._id,
                        opcionIndex: i,
                      });
                    } catch (e) {
                      const msg = mensajeErrorUsuario(
                        e,
                        "No se pudo registrar tu voto.",
                      );
                      if (
                        /cerrada|tiempo|terminó|termino/i.test(msg)
                      ) {
                        setError(
                          "Se acabó el tiempo. Ya no se pueden emitir votos.",
                        );
                      } else {
                        setError(msg);
                      }
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className={cn(
                    "flex h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-sm font-medium transition-colors",
                    elegida
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100",
                    busy !== null && "opacity-70",
                  )}
                >
                  <span>{o.texto}</span>
                  {busy === i ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : elegida ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {!cerrada && miVoto !== undefined ? (
          <p className="mt-3 text-xs text-zinc-500">
            Tu voto quedó registrado. Puedes cambiarlo mientras siga abierta.
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onVerResultados}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              cerrada
                ? "bg-zinc-900 font-semibold text-white hover:bg-zinc-800"
                : "text-zinc-500 hover:bg-zinc-100",
            )}
          >
            Ver resultados
          </button>
          {puedeVotarAqui ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              {miVoto !== undefined ? "Listo" : "Más tarde"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Popup de resultados + pestañas Ya votaron / Pendientes (todos). */
function ModalResultadosSala({
  votacionId,
  onClose,
  onVolverAVotar,
}: {
  asambleaId: Id<"asambleas">;
  votacionId: Id<"votaciones">;
  esMesa: boolean;
  onClose: () => void;
  onVolverAVotar?: () => void;
}) {
  const res = useQuery(api.asambleas.resultadosVotacion, { votacionId });
  const seg = useQuery(api.asambleas.seguimientoVoto, { votacionId });
  const [tab, setTab] = useState<"resultados" | "votaron" | "pendientes">(
    "pendientes",
  );

  const totalCoef = res
    ? res.opciones.reduce((s, o) => s + o.coeficiente, 0)
    : 0;

  const votaron = seg?.votaron ?? [];
  const pendientes = seg?.pendientes ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white text-zinc-900 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Seguimiento de votos
                {res?.estado === "abierta" ? " · en vivo" : ""}
              </p>
              {res?.cierraEn ? (
                <CuentaRegresivaVoto cierraEn={res.cierraEn} claro />
              ) : null}
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold">
              {res?.pregunta ?? "…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex gap-1 border-b border-zinc-100 px-4 pt-2">
          {(
            [
              { id: "resultados" as const, label: "Resultados" },
              {
                id: "votaron" as const,
                label: `Ya votaron (${votaron.length})`,
              },
              {
                id: "pendientes" as const,
                label: `Pendientes (${pendientes.length})`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors",
                tab === t.id
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {!res ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : tab === "resultados" ? (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                {res.totalVotos} unidad{res.totalVotos === 1 ? "" : "es"} ·{" "}
                {totalCoef.toFixed(2)}% de coeficiente
              </p>
              {res.opciones.map((o) => {
                const pct =
                  totalCoef > 0 ? (o.coeficiente / totalCoef) * 100 : 0;
                return (
                  <div key={o.texto}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{o.texto}</span>
                      <span className="tabular-nums text-zinc-500">
                        {o.votos} · {o.coeficiente.toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : tab === "votaron" ? (
            <ListaUnidadesModal
              numeros={votaron}
              vacio="Nadie ha votado todavía."
              tono="ok"
            />
          ) : (
            <ListaUnidadesModal
              numeros={pendientes}
              vacio="Todas las unidades presentes ya votaron."
              tono="pendiente"
            />
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 px-6 py-4">
          {onVolverAVotar ? (
            <button
              type="button"
              onClick={onVolverAVotar}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
            >
              Votar / cambiar voto
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
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
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
        estado === "concedida"
          ? "bg-emerald-500 text-white hover:bg-emerald-600"
          : levantada
            ? "bg-amber-500 text-white hover:bg-amber-600"
            : "bg-white/10 text-white/85 hover:bg-white/20",
      )}
    >
      <Hand className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
    </button>
  );
}

/* ── Manos levantadas (mesa / presidente) ────────────────────────────── */
function ManosLevantadas({
  asambleaId,
  filas,
}: {
  asambleaId: Id<"asambleas">;
  filas: {
    userId: Id<"users"> | null;
    codigoInvitado?: string | null;
    nombre: string;
    estado: "pedida" | "concedida";
    cierraEn?: number | null;
  }[];
}) {
  const resolver = useMutation(api.salaVideo.resolverPalabra);
  const extender = useMutation(api.salaVideo.extenderPalabra);
  const [eligiendoId, setEligiendoId] = useState<string | null>(null);
  const [duracion, setDuracion] = useState(120);

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-200">
        <Hand className="h-4 w-4" aria-hidden /> Dar la palabra
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-white/45">
        Quien levanta la mano aparece aquí. Al conceder, se le activa el
        micrófono y puede hablar o compartir pantalla.
      </p>
      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-center text-sm text-white/40">
          Nadie ha levantado la mano todavía.
        </p>
      ) : (
      <ul className="space-y-2">
        {filas.map((f) => {
          const id = (f.codigoInvitado ?? f.userId ?? f.nombre) as string;
          const eligiendo = eligiendoId === id;
          const destino = f.codigoInvitado
            ? { codigoInvitado: f.codigoInvitado }
            : f.userId
              ? { userId: f.userId }
              : null;
          if (!destino) return null;
          return (
            <li
              key={id}
              className="rounded-xl bg-white/[0.04] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-white/85">
                  {f.nombre}
                </span>
                {f.estado === "concedida" ? (
                  <>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                      Al aire
                    </span>
                    {f.cierraEn ? (
                      <CuentaRegresivaVoto cierraEn={f.cierraEn} />
                    ) : null}
                  </>
                ) : (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                    Mano alzada
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {f.estado === "concedida" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void extender({
                          asambleaId,
                          ...destino,
                          segundosExtra: 60,
                        }).catch(() => {})
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      <Timer className="h-3 w-3" aria-hidden /> +1 min
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void resolver({
                          asambleaId,
                          ...destino,
                          conceder: false,
                        }).catch(() => {})
                      }
                      title="Silenciar y quitar la palabra"
                      className="inline-flex items-center gap-1 rounded-lg bg-red-500/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600"
                    >
                      <MicOff className="h-3 w-3" aria-hidden />
                      Silenciar
                    </button>
                  </>
                ) : eligiendo ? (
                  <div className="w-full space-y-2">
                    <p className="text-[11px] text-white/50">
                      Tiempo para hablar
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DURACIONES_PALABRA.map((d) => (
                        <button
                          key={d.segundos}
                          type="button"
                          onClick={() => setDuracion(d.segundos)}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                            duracion === d.segundos
                              ? "bg-emerald-500 text-white"
                              : "bg-white/10 text-white/70 hover:bg-white/15",
                          )}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEligiendoId(null)}
                        className="rounded-lg px-2.5 py-1 text-xs text-white/50 hover:text-white"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEligiendoId(null);
                          void resolver({
                            asambleaId,
                            ...destino,
                            conceder: true,
                            duracionSegundos: duracion,
                          }).catch(() => {});
                        }}
                        className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
                      >
                        Activar audio
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDuracion(120);
                        setEligiendoId(id);
                      }}
                      className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
                    >
                      Dar la palabra
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void resolver({
                          asambleaId,
                          ...destino,
                          conceder: false,
                        }).catch(() => {})
                      }
                      className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      Bajar
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </section>
  );
}

function ListaUnidadesModal({
  numeros,
  vacio,
  tono,
}: {
  numeros: string[];
  vacio: string;
  tono: "ok" | "pendiente";
}) {
  if (numeros.length === 0) {
    return <p className="text-sm text-zinc-500">{vacio}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {numeros.map((n) => (
        <span
          key={n}
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
            tono === "ok"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-900",
          )}
        >
          {n}
        </span>
      ))}
    </div>
  );
}

/* (lista de personas vive en ResumenSala) */
