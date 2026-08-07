"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  ArrowLeft, Users, Loader2, CheckCircle2, Vote, ListOrdered, Radio, Check,
  UserPlus, X, Trash2, Copy, ChevronDown, ThumbsUp, TrendingUp, QrCode, Search,
  KeyRound, XCircle, Camera, FileUp, MessageCircle,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { fechaISO, etiquetaUnidad } from "@/components/portal/portal-ui";
import { cn } from "@/lib/utils";
import { useUploadToS3 } from "@/hooks/use-upload-s3";
import { AsambleaTabsTour } from "@/components/portal/asamblea-tabs-tour";
import { IndicadorSala } from "@/components/asamblea/indicador-sala";
import { ensurePoderPdf } from "@/lib/poder-documento";

function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(data)}`;
}
function opcionColor(texto: string, activo: boolean) {
  const t = texto.toLowerCase();
  if (t.includes("favor") || t.includes("sí") || t === "si" || t.includes("aprob"))
    return activo ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (t.includes("contra") || t === "no" || t.includes("rechaz"))
    return activo ? "border-red-600 bg-red-600 text-white" : "border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300";
  return activo ? "border-slate-600 bg-slate-600 text-white" : "border-border bg-card text-foreground hover:bg-accent";
}

const TABS = [
  { key: "votar", label: "Votar", icon: Vote },
  { key: "poderes", label: "Poderes", icon: UserPlus },
  { key: "resultados", label: "Resultados", icon: TrendingUp },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AsambleaSala() {
  const params = useParams<{ id: string; asambleaId: string }>();
  const condominioId = params.id as Id<"condominios">;
  const asambleaId = params.asambleaId as Id<"asambleas">;

  const a = useQuery(api.asambleas.get, { id: asambleaId });
  const home = useQuery(api.portal.home, { condominioId });
  const mi = useQuery(api.asambleas.miParticipacion, { asambleaId });
  const poderPublicoAbierto = a?.estado === "programada";

  const [tab, setTab] = useState<TabKey>("votar");
  const tabInicialRef = useRef(false);

  useEffect(() => {
    if (!a || tabInicialRef.current) return;
    tabInicialRef.current = true;
    if (a.estado === "programada") setTab("poderes");
    else if (a.estado === "finalizada") setTab("resultados");
  }, [a]);

  useEffect(() => {
    if (!a) return;
    if (a.estado !== "programada" && tab === "poderes") {
      setTab(a.estado === "finalizada" ? "resultados" : "votar");
    }
  }, [a, tab]);

  if (a === undefined) return <PageContainer><div className="flex justify-center py-24"><Spinner className="h-5 w-5" /></div></PageContainer>;
  if (a === null) return <PageContainer><p className="py-24 text-center text-sm text-muted-foreground">Asamblea no encontrada.</p></PageContainer>;

  const cerrada = a.estado === "finalizada" || a.estado === "cancelada";
  const tabsVisibles = poderPublicoAbierto ? TABS : TABS.filter((t) => t.key !== "poderes");

  return (
    <PageContainer className="space-y-5">
      <Link href={`/mi/${condominioId}/asambleas`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{a.titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fechaISO(a.fecha)} · {a.hora} · <span className="capitalize">{a.modalidad}</span>
          {a.estado === "en_curso" && <span className="ml-2 inline-flex items-center gap-1 font-medium text-emerald-600"><Radio className="h-3.5 w-3.5 animate-pulse" /> En vivo</span>}
        </p>

        {/* Estado de conexión (solo lectura). El latido corre dentro de /sala. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <IndicadorSala asambleaId={asambleaId} />
          {a.estado === "en_curso" &&
          a.modalidad !== "presencial" &&
          !(mi?.delegoTodo && (mi?.representa?.length ?? 0) === 0) ? (
            <Link
              href={`/sala/${condominioId}/${asambleaId}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90"
            >
              <Radio className="h-4 w-4" /> Entrar a la sala
            </Link>
          ) : null}
        </div>
      </div>

      {poderPublicoAbierto && a.modalidad !== "presencial" ? (
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-1 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-foreground">
            Sala cerrada · puedes cargar poderes
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            La administración abrirá la sala cuando inicie la reunión. Mientras
            tanto otorga o recibe poderes desde la pestaña Poderes.
          </p>
        </div>
      ) : null}

      {/* Estado cerrado */}
      {cerrada && (
        <div className={cn("mx-auto flex max-w-2xl flex-col items-center gap-2 rounded-2xl border p-6 text-center",
          a.estado === "finalizada" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
          {a.estado === "finalizada" ? <CheckCircle2 className="h-10 w-10 text-emerald-600" /> : <XCircle className="h-10 w-10 text-red-600" />}
          <p className="text-lg font-bold text-foreground">{a.estado === "finalizada" ? "Esta asamblea ya finalizó" : "Esta asamblea fue cancelada"}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {a.estado === "finalizada"
              ? "Las votaciones quedaron cerradas. Puedes consultar los resultados en la pestaña Resultados."
              : "La convocatoria fue cancelada por la administración."}
          </p>
          {a.estado === "finalizada" && (
            <button onClick={() => setTab("resultados")} className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground shadow-sm hover:bg-brand/90">
              <TrendingUp className="h-4 w-4" /> Ver resultados
            </button>
          )}
        </div>
      )}

      <nav className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
        {tabsVisibles.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors",
                active ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </nav>

      {poderPublicoAbierto ? (
        <AsambleaTabsTour
          enabled
          onGoToTab={(k) => setTab(k)}
        />
      ) : null}

      {tab === "votar" && <VotarTab a={a} asambleaId={asambleaId} condominioId={condominioId} mi={mi} userId={home?.allowed ? (home.userId as string) : ""} />}
      {tab === "poderes" && poderPublicoAbierto && (
        <PoderesSection
          asambleaId={asambleaId}
          condominioId={condominioId}
          mi={mi}
          asambleaTitulo={a.titulo}
        />
      )}
      {tab === "resultados" && <ResultadosTab asambleaId={asambleaId} mi={mi} />}
    </PageContainer>
  );
}

/* ───────── Tab VOTAR ───────── */
function VotarTab({
  a, asambleaId, condominioId, mi, userId,
}: {
  a: { estado: string; modalidad: string; agenda: string[]; ordenDia?: { titulo: string; descripcion?: string; votacionId?: Id<"votaciones">; hecho?: boolean }[] };
  asambleaId: Id<"asambleas">;
  condominioId: Id<"condominios">;
  mi: { presente: boolean; unidades: string[]; representa: string[]; votos: Record<string, number> } | null | undefined;
  userId: string;
}) {
  const quorum = useQuery(api.asambleas.quorum, { asambleaId });
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const home = useQuery(api.portal.home, { condominioId });
  const otorgados = useQuery(api.asambleas.poderesOtorgados, { asambleaId });
  const registrar = useMutation(api.asambleas.registrarAsistencia);
  const registrarConCodigo = useMutation(
    api.asambleas.registrarAsistenciaConCodigoAsamblea,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordenOpen, setOrdenOpen] = useState(false);

  const activa = a.estado === "programada" || a.estado === "en_curso";
  const presente = mi?.presente ?? false;
  const representa = mi?.representa ?? [];

  // ¿Delegó todo su voto y no representa a nadie? → ya no vota directamente.
  const misUnidades = home && home.allowed ? home.unidades : [];
  const delegadasIds = new Set((otorgados ?? []).map((p) => p.unidadId as string));
  const propiasVotables = misUnidades.filter((u) => !delegadasIds.has(u._id)).length;
  const delegoTodo = misUnidades.length > 0 && propiasVotables === 0;
  /* Delegó TODO y no representa a nadie: no tiene ninguna unidad que marcar.
   * El backend ya lo rechaza (`filas.length === 0`), así que mostrarle el
   * formulario era ofrecerle una acción condenada a fallar. Si además es
   * apoderado de otras unidades, sí debe registrarse: por eso no basta con
   * `delegoTodo`. */
  const sinNadaQueRegistrar = delegoTodo && representa.length === 0;
  const nombreApoderado = (otorgados ?? [])[0]?.representanteNombre;
  const esPresencial = a.modalidad === "presencial";
  /* En virtual la asistencia SOLO se registra con el código que la
   * administración proyecta en la reunión. Sin eso, cualquiera confirmaría
   * asistencia desde su casa sin conectarse y el quórum quedaría inflado. */
  const esVirtual = a.modalidad === "virtual";
  const abiertas = (votaciones ?? []).filter((v) => v.estado === "abierta");
  const puntos = a.ordenDia ?? a.agenda.map((t) => ({ titulo: t, descripcion: undefined, votacionId: undefined, hecho: undefined as boolean | undefined }));
  const hechos = puntos.filter((p) => p.hecho).length;
  const pct = quorum?.pct ?? 0;
  const req = quorum?.quorumRequerido ?? 51;

  async function asistir() {
    setBusy(true); setError(null);
    try { await registrar({ asambleaId }); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar."); }
    finally { setBusy(false); }
  }

  /** Registro con el código de la reunión (asambleas virtuales). */
  async function asistirConCodigo(valor: string) {
    const limpio = valor.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (limpio.length < 4) {
      setError("Escribe el código que aparece en la reunión.");
      return;
    }
    setBusy(true); setError(null);
    try { await registrarConCodigo({ asambleaId, codigo: limpio }); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      {presente ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-5 w-5" /> Estás presente</p>
          {mi && mi.unidades.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">Tu(s) casa(s): {mi.unidades.join(", ")}</p>}
          {representa.length > 0 && <p className="mt-0.5 text-xs text-brand">También votas por poder por: {representa.join(", ")}</p>}
        </div>
      ) : activa && esVirtual && !sinNadaQueRegistrar ? (
        <CodigoAsistenciaCard
          busy={busy}
          error={error}
          onSubmit={asistirConCodigo}
        />
      ) : activa && !esPresencial && !sinNadaQueRegistrar ? (
        <Card className="border-brand/30 bg-brand/3 p-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand"><Users className="h-8 w-8" /></div>
          <p className="text-lg font-semibold text-foreground">¿Estás en la asamblea?</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Confirma tu asistencia para poder votar.</p>
          <button onClick={asistir} disabled={busy} className="mx-auto mt-5 flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-brand text-base font-bold text-brand-foreground shadow-sm hover:bg-brand/90 disabled:opacity-60">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Sí, estoy presente
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </Card>
      ) : activa && esPresencial && !delegoTodo ? (
        <Card className="p-6 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><QrCode className="h-6 w-6" /></div>
          <p className="text-base font-semibold text-foreground">Asamblea presencial</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Muestra este código en el punto de registro. El registrador marcará tu asistencia.</p>
          {userId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl(JSON.stringify({ asambleaId, userId }))} alt="Tu QR de asistencia" className="mx-auto mt-4 h-48 w-48 rounded-xl border border-border bg-white p-2" />
          )}
        </Card>
      ) : null}

      {delegoTodo && activa && (
        <Card className="p-6 text-center">
          <UserPlus className="mx-auto h-9 w-9 text-brand" />
          <p className="mt-2 text-base font-semibold text-foreground">Delegaste tu voto</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {nombreApoderado ? <><b className="text-foreground">{nombreApoderado}</b> vota por ti.</> : "Tu apoderado vota por ti."} Ya no votas directamente en esta asamblea.
            {a.estado === "programada"
              ? " Puedes revocar el poder en la pestaña Poderes."
              : " Si necesitas un cambio, contacta a la administración."}
          </p>
        </Card>
      )}
      {!delegoTodo && presente && abiertas.length > 0 && abiertas.map((vt) => (
        <VotacionHero key={vt._id} vt={vt} miVoto={mi?.votos?.[vt._id as string] ?? null} />
      ))}
      {!delegoTodo && presente && activa && abiertas.length === 0 && (
        <Card className="p-8 text-center">
          <Vote className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-base font-medium text-foreground">No hay votación activa</p>
          <p className="mt-1 text-sm text-muted-foreground">Cuando abran una pregunta, aparecerá aquí para que votes.</p>
        </Card>
      )}
      {!presente && activa && !sinNadaQueRegistrar && <p className="text-center text-sm text-muted-foreground">Regístrate arriba para poder votar.</p>}

      {quorum && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Quórum</span>
            <span className="tabular-nums text-muted-foreground">{pct.toFixed(1)}% de {req}% · {quorum.unidadesPresentes}/{quorum.totalUnidades} casas</span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", pct >= req ? "bg-emerald-500" : "bg-brand")} style={{ width: `${Math.min(100, pct)}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${req}%` }} />
          </div>
        </div>
      )}

      {puntos.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <button onClick={() => setOrdenOpen((o) => !o)} className="flex w-full items-center justify-between p-4 text-left">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ListOrdered className="h-5 w-5 text-brand" /> Orden del día ({hechos}/{puntos.length})
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", ordenOpen && "rotate-180")} />
          </button>
          {ordenOpen && (
            <ol className="space-y-2 border-t border-border p-4 text-sm">
              {puntos.map((p, i) => {
                const hecho = !!p.hecho;
                return (
                  <li
                    key={i}
                    className={cn(
                      "flex gap-2 rounded-lg p-2",
                      hecho && "bg-emerald-500/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                        hecho ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {hecho ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <div>
                      <span className={cn(hecho ? "text-muted-foreground line-through" : "text-foreground")}>
                        {p.titulo}
                      </span>
                      {hecho && <Badge tone="success" className="ml-2">Hecho</Badge>}
                      {p.votacionId && <Badge tone="info" className="ml-2">Con votación</Badge>}
                      {p.descripcion && <p className="text-muted-foreground">{p.descripcion}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function VotacionHero({
  vt, miVoto,
}: {
  vt: { _id: Id<"votaciones">; pregunta: string; opciones: { texto: string; votos: number }[] };
  miVoto: number | null;
}) {
  const votar = useMutation(api.asambleas.votar);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function emitir(i: number) {
    setBusy(i); setError(null);
    try { await votar({ votacionId: vt._id, opcionIndex: i }); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo votar."); }
    finally { setBusy(null); }
  }
  return (
    <Card className="border-brand/40 p-6 shadow-md">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><Radio className="h-3.5 w-3.5 animate-pulse" /> Votación abierta — toca tu respuesta</div>
      <h2 className="mb-4 text-xl font-bold text-foreground">{vt.pregunta}</h2>
      <div className="space-y-3">
        {vt.opciones.map((op, i) => {
          const esMio = miVoto === i;
          return (
            <button key={i} onClick={() => emitir(i)} disabled={busy !== null}
              className={cn("flex h-16 w-full items-center justify-between rounded-xl border-2 px-5 text-base font-semibold transition-colors disabled:opacity-60", opcionColor(op.texto, esMio))}>
              <span className="flex items-center gap-3">
                {busy === i ? <Loader2 className="h-5 w-5 animate-spin" /> : esMio ? <CheckCircle2 className="h-6 w-6" /> : <span className="h-6 w-6 rounded-full border-2 border-current opacity-40" />}
                {op.texto}
              </span>
              {esMio && <span className="text-sm font-bold">TU VOTO</span>}
            </button>
          );
        })}
      </div>
      {miVoto != null && <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600"><ThumbsUp className="h-4 w-4" /> Tu voto quedó registrado. Puedes cambiarlo mientras esté abierta.</p>}
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
    </Card>
  );
}

/* ───────── Tab RESULTADOS ───────── */
function ResultadosTab({
  asambleaId, mi,
}: {
  asambleaId: Id<"asambleas">;
  mi: { votos: Record<string, number> } | null | undefined;
}) {
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  if (votaciones === undefined) return <Card className="p-8"><Spinner className="mx-auto h-5 w-5" /></Card>;
  // Solo votaciones que se abrieron alguna vez: si nunca se votó, aún no hay resultados.
  const visibles = votaciones.filter((vt) => vt.abiertaAlgunaVez === true);
  if (visibles.length === 0) return <Card className="p-6"><p className="text-center text-sm text-muted-foreground">Aún no hay resultados. Las votaciones aparecerán aquí cuando se abran.</p></Card>;
  return (
    <div className="space-y-4">
      {visibles.map((vt) => {
        const total = vt.opciones.reduce((s, o) => s + o.votos, 0);
        const miVoto = mi?.votos?.[vt._id as string] ?? null;
        return (
          <Card key={vt._id} className="p-5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-semibold text-foreground">{vt.pregunta}</p>
              <Badge tone={vt.estado === "abierta" ? "success" : "neutral"}>{vt.estado === "abierta" ? "Abierta" : "Cerrada"}</Badge>
            </div>
            <div className="space-y-2">
              {vt.opciones.map((op, i) => {
                const pct = total > 0 ? Math.round((op.votos / total) * 100) : 0;
                const esMio = miVoto === i;
                return (
                  <div key={i}>
                    <div className="mb-0.5 flex items-center justify-between text-sm">
                      <span className="text-foreground">{op.texto}{esMio && <span className="ml-1.5 font-medium text-brand">· tu voto</span>}</span>
                      <span className="tabular-nums text-muted-foreground">{op.votos} · {pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", esMio ? "bg-brand" : "bg-brand/50")} style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{total} unidad{total !== 1 ? "es" : ""} votaron</p>
          </Card>
        );
      })}
    </div>
  );
}

/* ───────── Tab PODERES ───────── */
const inputCls = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20";

function apoderadoLink(codigo: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://vekino.com";
  return `${origin}/apoderado?codigo=${encodeURIComponent(codigo)}`;
}

function mensajePoderWhatsApp(opts: {
  codigo: string;
  nombre: string;
  asambleaTitulo: string;
  unidadesLabel?: string;
}) {
  const link = apoderadoLink(opts.codigo);
  const unidades = opts.unidadesLabel ? `\nUnidad(es): ${opts.unidadesLabel}` : "";
  return (
    `Hola ${opts.nombre},\n\n` +
    `Te otorgué poder para representarme en la asamblea "${opts.asambleaTitulo}".${unidades}\n\n` +
    `El día de la asamblea, abre este enlace para entrar a la sala:\n${link}\n\n` +
    `Código: ${opts.codigo}\n\n` +
    `¡Gracias!`
  );
}

/** Normaliza celular Colombia → dígitos con 57. */
function telefonoWa(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("57") && digits.length >= 12) return digits;
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

function PoderCompartir({
  codigo,
  nombre,
  asambleaTitulo,
  unidadesLabel,
  mostrarInstruccion = true,
}: {
  codigo: string;
  nombre: string;
  asambleaTitulo: string;
  unidadesLabel?: string;
  /** Si ya se explicó arriba (p. ej. al crear el poder), omitir el texto. */
  mostrarInstruccion?: boolean;
}) {
  const [tel, setTel] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  function flash(msg: string) {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 1800);
  }

  const mensaje = mensajePoderWhatsApp({
    codigo,
    nombre,
    asambleaTitulo,
    unidadesLabel,
  });
  const link = apoderadoLink(codigo);

  async function copiar(texto: string, ok: string) {
    try {
      await navigator.clipboard.writeText(texto);
      flash(ok);
    } catch {
      flash("No se pudo copiar");
    }
  }

  function abrirWhatsApp() {
    const phone = telefonoWa(tel);
    const q = encodeURIComponent(mensaje);
    const url = phone
      ? `https://wa.me/${phone}?text=${q}`
      : `https://wa.me/?text=${q}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mt-3 space-y-2.5 text-left">
      {mostrarInstruccion ? (
        <p className="text-center text-sm text-foreground">
          Comparte este enlace con{" "}
          <span className="font-semibold">{nombre}</span> para que pueda entrar
          a la sala el día de la asamblea.
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => void copiar(link, "Enlace copiado")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Copy className="h-4 w-4" /> Copiar enlace
        </button>
        <button
          type="button"
          onClick={() => void copiar(codigo, "Código copiado")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Copy className="h-4 w-4" /> Copiar código
        </button>
        <button
          type="button"
          onClick={() => void copiar(mensaje, "Mensaje copiado")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Copy className="h-4 w-4" /> Copiar mensaje
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card/80 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Enviárselo por WhatsApp
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            placeholder="Celular de tu apoderado (opcional)"
            inputMode="tel"
            className={cn(inputCls, "sm:flex-1")}
          />
          <button
            type="button"
            onClick={abrirWhatsApp}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-white hover:bg-[#1ebe5d]"
          >
            <MessageCircle className="h-4 w-4" />
            {tel.trim() ? "Abrir WhatsApp" : "WhatsApp (elegir chat)"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          El mensaje incluye el enlace y el código. Si dejas el número vacío,
          WhatsApp te deja elegir el contacto.
        </p>
      </div>

      {feedback ? (
        <p className="text-center text-xs font-medium text-emerald-600">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}

function PoderesSection({
  asambleaId,
  condominioId,
  mi,
  asambleaTitulo,
}: {
  asambleaId: Id<"asambleas">;
  condominioId: Id<"condominios">;
  mi: { representa: string[] } | null | undefined;
  asambleaTitulo: string;
}) {
  const home = useQuery(api.portal.home, { condominioId });
  const otorgados = useQuery(api.asambleas.poderesOtorgados, { asambleaId });
  const recibidos = useQuery(api.asambleas.poderesRecibidos, { asambleaId });
  const otorgar = useMutation(api.asambleas.otorgarPoder);
  const revocar = useMutation(api.asambleas.revocarPoder);
  const responder = useMutation(api.asambleas.responderPoder);
  const uploadFile = useUploadToS3();

  const unidades = home && home.allowed ? home.unidades : [];
  const [modo, setModo] = useState<"propietario" | "externo">("propietario");
  const [unidadIds, setUnidadIds] = useState<string[]>([]);
  const [rep, setRep] = useState<{ _id: Id<"users">; name: string } | null>(null);
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<{ codigo: string; nombre: string; esPropietario: boolean; unidades: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const delegadasIds = new Set((otorgados ?? []).map((p) => String(p.unidadId)));
  const disponibles = unidades.filter((u) => !delegadasIds.has(String(u._id)));

  const puedeOtorgar =
    !busy &&
    !!file &&
    unidadIds.length > 0 &&
    (modo === "propietario" ? !!rep : nombre.trim().length > 0);

  async function onPoderFile(raw: File | null) {
    if (!raw) {
      setFile(null);
      return;
    }
    setError(null);
    try {
      setFile(await ensurePoderPdf(raw));
    } catch {
      setError("No se pudo procesar el archivo. Usa PDF, JPG o PNG.");
      setFile(null);
    }
  }

  const grupos = new Map<string, { nombre: string; codigo: string; esProp: boolean; poderes: { _id: Id<"poderesAsamblea">; unidadNumero: string; unidadTorre?: string | null; unidadBloque?: string | null }[] }>();
  for (const p of otorgados ?? []) {
    const g = grupos.get(p.codigoAcceso) ?? { nombre: p.representanteNombre, codigo: p.codigoAcceso, esProp: !!p.representanteUserId, poderes: [] };
    g.poderes.push({
      _id: p._id,
      unidadNumero: p.unidadNumero,
      unidadTorre: p.unidadTorre,
      unidadBloque: p.unidadBloque,
    });
    grupos.set(p.codigoAcceso, g);
  }
  const representa = mi?.representa ?? [];

  function toggleUnidad(id: string) {
    setUnidadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleTodas() {
    if (unidadIds.length === disponibles.length) {
      setUnidadIds([]);
    } else {
      setUnidadIds(disponibles.map((u) => String(u._id)));
    }
  }

  async function darPoder() {
    if (unidadIds.length === 0) return setError("Elige al menos una unidad.");
    if (modo === "propietario" && !rep) return setError("Selecciona el propietario.");
    if (modo === "externo" && !nombre.trim()) return setError("Escribe el nombre del apoderado.");
    if (!file) return setError("Adjunta el documento del poder firmado (PDF o foto).");
    setBusy(true); setError(null);
    try {
      const { url: documentoUrl } = await uploadFile(
        file,
        `condominios/asambleas/${condominioId}/poderes`,
      );

      const common = {
        asambleaId,
        documentoUrl,
        ...(modo === "propietario"
          ? { representanteUserId: rep!._id }
          : { apoderadoNombre: nombre, apoderadoDocumento: documento.trim() || undefined }),
      };

      let last: { codigo: string; nombre: string; esPropietario: boolean } | null = null;
      for (const uid of unidadIds) {
        last = await otorgar({
          ...common,
          unidadId: uid as Id<"unidades">,
        });
      }
      if (last) {
        setNuevo({ ...last, unidades: unidadIds.length });
      }
      setUnidadIds([]); setRep(null); setNombre(""); setDocumento(""); setFile(null);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo otorgar."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      {representa.length > 0 && (
        <Card className="border-brand/30 bg-brand/3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><KeyRound className="h-4 w-4 text-brand" /> Ejerces poder por: {representa.join(", ")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">En la pestaña Votar, tu voto cuenta por tus casas y por estas también.</p>
        </Card>
      )}

      {/* Poderes que me dieron */}
      {recibidos && recibidos.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Poderes que me dieron</p>
          {recibidos.map((p) => (
            <Card key={p._id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {etiquetaUnidad({
                    unidadNumero: p.unidadNumero,
                    unidadTorre: p.unidadTorre,
                    unidadBloque: p.unidadBloque,
                  })}{" "}
                  · de {p.otorganteNombre}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.validado ? "Aceptado — votas por esta casa" : "Pendiente de tu aceptación"}
                  {p.documentoUrl && <> · <a href={p.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Ver documento</a></>}
                </p>
              </div>
              {!p.validado ? (
                <div className="flex gap-2">
                  <button onClick={() => responder({ poderId: p._id, aceptar: true })} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"><Check className="h-3.5 w-3.5" /> Aceptar</button>
                  <button onClick={() => responder({ poderId: p._id, aceptar: false })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:text-red-600"><X className="h-3.5 w-3.5" /> Rechazar</button>
                </div>
              ) : <Badge tone="success">Aceptado</Badge>}
            </Card>
          ))}
        </div>
      )}

      {nuevo && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
          <p className="text-sm font-semibold text-foreground">
            {nuevo.esPropietario
              ? `Poder enlazado con ${nuevo.nombre}`
              : `Poder listo para ${nuevo.nombre}`}
            {nuevo.unidades > 1 ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {nuevo.unidades} unidades
              </span>
            ) : null}
          </p>
          {nuevo.esPropietario ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Es propietario del conjunto: verá tus unidades en su cuenta y su
              voto contará por todas. También puede usar este código:
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Compártele este enlace a tu apoderado para que pueda entrar a la
              sala el día de la asamblea.
            </p>
          )}
          <p className="my-2 select-all font-mono text-3xl font-bold tracking-[0.3em] text-emerald-700 dark:text-emerald-400">
            {nuevo.codigo}
          </p>
          <PoderCompartir
            codigo={nuevo.codigo}
            nombre={nuevo.nombre}
            asambleaTitulo={asambleaTitulo}
            mostrarInstruccion={false}
          />
        </div>
      )}

      {grupos.size > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">Poderes que otorgaste</p>
          {[...grupos.values()].map((g) => (
            <Card key={g.codigo} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {g.nombre}{" "}
                  {g.esProp && (
                    <Badge tone="brand" className="ml-1">
                      Propietario
                    </Badge>
                  )}
                </p>
                <span className="rounded-lg bg-muted px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-foreground">
                  {g.codigo}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {g.poderes.map((p) => (
                  <div
                    key={p._id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {etiquetaUnidad({
                        unidadNumero: p.unidadNumero,
                        unidadTorre: p.unidadTorre,
                        unidadBloque: p.unidadBloque,
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        revocar({ poderId: p._id }).catch(() => {})
                      }
                      className="rounded p-1 text-muted-foreground hover:text-red-600"
                      aria-label="Revocar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <PoderCompartir
                codigo={g.codigo}
                nombre={g.nombre}
                asambleaTitulo={asambleaTitulo}
                unidadesLabel={g.poderes
                  .map((p) =>
                    etiquetaUnidad({
                      unidadNumero: p.unidadNumero,
                      unidadTorre: p.unidadTorre,
                      unidadBloque: p.unidadBloque,
                    }),
                  )
                  .join(", ")}
              />
            </Card>
          ))}
        </div>
      )}

      {disponibles.length > 0 ? (
        <Card className="relative z-10 space-y-3 overflow-visible p-5">
          <p className="text-sm font-semibold text-foreground">Delegar mi voto a otra persona</p>
          <div className="flex gap-2">
            <button onClick={() => setModo("propietario")} className={cn("flex-1 rounded-lg border py-2 text-sm font-medium", modo === "propietario" ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground")}>Propietario del conjunto</button>
            <button onClick={() => setModo("externo")} className={cn("flex-1 rounded-lg border py-2 text-sm font-medium", modo === "externo" ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground")}>Otra persona</button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Unidades a delegar
                {unidadIds.length > 0 ? ` (${unidadIds.length})` : ""}
              </span>
              {disponibles.length > 1 ? (
                <button
                  type="button"
                  onClick={toggleTodas}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  {unidadIds.length === disponibles.length
                    ? "Quitar todas"
                    : "Seleccionar todas"}
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {disponibles.map((u) => {
                const id = String(u._id);
                const active = unidadIds.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleUnidad(id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "border-brand/40 bg-brand/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent/50",
                    )}
                    aria-pressed={active}
                  >
                    {active ? <Check className="h-3.5 w-3.5 text-brand" /> : null}
                    {etiquetaUnidad(u)}
                  </button>
                );
              })}
            </div>
          </div>
          {modo === "propietario" ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Buscar propietario
              </p>
              <UserSearch
                condominioId={condominioId}
                value={rep}
                onChange={setRep}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Nombre</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" className={inputCls} /></label>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Documento (opcional)</span><input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Cédula" className={inputCls} /></label>
            </div>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Documento del poder (obligatorio) — PDF o foto
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                void onPoderFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void onPoderFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent"
              >
                <FileUp className="h-4 w-4" />
                Seleccionar archivo
              </button>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent"
              >
                <Camera className="h-4 w-4" />
                Tomar foto
              </button>
            </div>
            {file ? (
              <p className="text-xs text-emerald-600">
                ✓ {file.name}
                {file.type === "application/pdf" ? " (PDF listo para subir)" : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Desde el celular puedes tomar una foto: se convierte a PDF automáticamente.
              </p>
            )}
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => void darPoder()}
            disabled={!puedeOtorgar}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground shadow-sm hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{" "}
            {unidadIds.length > 1
              ? `Otorgar poder (${unidadIds.length} unidades)`
              : "Otorgar poder"}
          </button>
          {!file ? (
            <p className="text-xs text-muted-foreground">
              Adjunta el poder firmado para habilitar el botón.
            </p>
          ) : null}
        </Card>
      ) : unidades.length > 0 ? (
        <p className="rounded-lg bg-muted/40 p-4 text-center text-sm text-muted-foreground">Ya delegaste todas tus unidades.</p>
      ) : null}
    </div>
  );
}

function UserSearch({
  condominioId, value, onChange,
}: {
  condominioId: Id<"condominios">;
  value: { _id: Id<"users">; name: string } | null;
  onChange: (u: { _id: Id<"users">; name: string } | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const results = useQuery(
    api.asambleas.buscarUsuarios,
    term.trim().length >= 2 ? { condominioId, search: term } : "skip",
  );

  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg border-2 border-brand/50 bg-brand/10 px-3 py-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-brand-foreground">
            ✓
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{value.name}</p>
            <p className="text-[11px] font-medium text-brand">
              Seleccionado · toca la X para cambiar
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Quitar selección"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-red-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Retraso: permite el click del resultado (mousedown) antes de cerrar.
          window.setTimeout(() => setOpen(false), 150);
        }}
        placeholder="Nombre o correo…"
        className={cn(inputCls, "pl-9")}
        autoComplete="off"
      />
      {open && term.trim().length >= 2 ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          {results === undefined ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados.</p>
          ) : (
            results.map((u) => (
              <button
                key={u._id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ _id: u._id, name: u.name });
                  setOpen(false);
                  setTerm("");
                }}
                className="block w-full rounded-md px-3 py-2.5 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium text-foreground">{u.name}</span>{" "}
                <span className="text-xs text-muted-foreground">{u.email}</span>
              </button>
            ))
          )}
        </div>
      ) : term.trim().length > 0 && term.trim().length < 2 ? (
        <p className="mt-1 text-xs text-muted-foreground">Escribe al menos 2 letras.</p>
      ) : null}
    </div>
  );
}

/**
 * Registro de asistencia con el código de la reunión (asambleas virtuales).
 *
 * El código lo proyecta la administración y cambia cada minuto. Si el usuario
 * llegó escaneando el QR, el código viene en la URL (`?c=XXXXXX`) y se
 * precarga: no tiene que teclear nada.
 */
function CodigoAsistenciaCard({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (codigo: string) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [autoEnviado, setAutoEnviado] = useState(false);

  // Código traído por el QR: lo ponemos y lo enviamos una sola vez.
  useEffect(() => {
    if (autoEnviado) return;
    const params = new URLSearchParams(window.location.search);
    const delQr = params.get("c");
    if (!delQr) return;
    setAutoEnviado(true);
    setCodigo(delQr.toUpperCase());
    onSubmit(delQr);
    // Limpiamos la URL para que al recargar no reintente un código ya vencido.
    const limpia = window.location.pathname;
    window.history.replaceState(null, "", limpia);
  }, [autoEnviado, onSubmit]);

  return (
    <Card className="border-brand/30 bg-brand/3 p-8 text-center">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand">
        <KeyRound className="h-8 w-8" />
      </div>
      <p className="text-lg font-semibold text-foreground">
        ¿Sigues la reunión por fuera?
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Si estás en la sala de Vekino, tu asistencia se registra sola al
        entrar. Este código es solo para quien sigue la reunión por Meet o
        Zoom: la administración lo proyecta y cambia cada minuto.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(codigo);
        }}
        className="mx-auto mt-5 w-full max-w-sm space-y-3"
      >
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="A1B2C3"
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          aria-label="Código de asistencia"
          className="h-16 w-full rounded-xl border border-border bg-card text-center text-3xl font-bold tracking-[0.4em] text-foreground placeholder:text-muted-foreground/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
        <button
          type="submit"
          disabled={busy || codigo.trim().length < 4}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand text-base font-bold text-brand-foreground shadow-sm hover:bg-brand/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          Registrar mi asistencia
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
