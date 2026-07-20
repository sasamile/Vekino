"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  ArrowLeft, Calendar, MapPin, Users, Loader2, CheckCircle2,
  Vote, ListOrdered, Scale, Radio, Check, UserPlus, X, Trash2, Search,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { fechaISO } from "@/components/portal/portal-ui";
import { cn } from "@/lib/utils";

const ESTADO_META: Record<string, { label: string; tone: "info" | "success" | "warning" | "destructive" }> = {
  programada: { label: "Programada", tone: "info" },
  en_curso: { label: "En curso", tone: "warning" },
  finalizada: { label: "Finalizada", tone: "success" },
  cancelada: { label: "Cancelada", tone: "destructive" },
};

export default function AsambleaSala() {
  const params = useParams<{ id: string; asambleaId: string }>();
  const condominioId = params.id as Id<"condominios">;
  const asambleaId = params.asambleaId as Id<"asambleas">;

  const a = useQuery(api.asambleas.get, { id: asambleaId });
  const quorum = useQuery(api.asambleas.quorum, { asambleaId });
  const mi = useQuery(api.asambleas.miParticipacion, { asambleaId });
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const registrar = useMutation(api.asambleas.registrarAsistencia);

  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (a === undefined) {
    return (
      <PageContainer>
        <div className="flex justify-center py-24"><Spinner className="h-5 w-5" /></div>
      </PageContainer>
    );
  }
  if (a === null) {
    return (
      <PageContainer>
        <p className="py-24 text-center text-sm text-muted-foreground">Asamblea no encontrada.</p>
      </PageContainer>
    );
  }

  const meta = ESTADO_META[a.estado];
  const activa = a.estado === "programada" || a.estado === "en_curso";
  const presente = mi?.presente ?? false;

  async function asistir() {
    setRegistrando(true);
    setError(null);
    try {
      await registrar({ asambleaId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar la asistencia.");
    } finally {
      setRegistrando(false);
    }
  }

  const pct = quorum?.pct ?? 0;
  const requerido = quorum?.quorumRequerido ?? 51;
  const quorumOk = pct >= requerido;

  return (
    <PageContainer className="space-y-6">
      <Link
        href={`/mi/${condominioId}/asambleas`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a asambleas
      </Link>

      {/* Cabecera */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {meta && <Badge tone={meta.tone}>{meta.label}</Badge>}
              <Badge tone="neutral" className="capitalize">{a.tipo}</Badge>
              {a.estado === "en_curso" && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <Radio className="h-3.5 w-3.5 animate-pulse" /> En vivo
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{a.titulo}</h1>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {fechaISO(a.fecha)} · {a.hora}</p>
              {a.lugar && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {a.lugar}</p>}
            </div>
          </div>

          {activa && (
            <div className="shrink-0">
              {presente ? (
                <span className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  Asistencia registrada
                </span>
              ) : (
                <button
                  onClick={asistir}
                  disabled={registrando}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-6 text-sm font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90 disabled:opacity-60"
                >
                  {registrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  Registrar mi asistencia
                </button>
              )}
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {presente && mi && mi.unidades.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Presente con: {mi.unidades.map((u) => `Unidad ${u}`).join(", ")}
          </p>
        )}
      </Card>

      {/* Quórum en tiempo real */}
      <Card className="p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Scale className="h-5 w-5 text-brand" /> Quórum en tiempo real
        </h2>
        {quorum === undefined || quorum === null ? (
          <Spinner className="mx-auto my-4 h-5 w-5" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatBox
                value={`${pct.toFixed(2)}%`}
                label="Coeficiente presente"
                tone={quorumOk ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}
              />
              <StatBox value={String(quorum.unidadesPresentes)} label="Unidades presentes" tone="text-sky-600 dark:text-sky-400" />
              <StatBox value={String(quorum.totalUnidades)} label="Total unidades" tone="text-foreground" />
            </div>
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progreso de quórum</span>
                <span className="font-medium tabular-nums text-foreground">
                  {pct.toFixed(2)}% / {requerido}% requerido
                </span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", quorumOk ? "bg-emerald-500" : "bg-brand")}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
                <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${requerido}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Línea roja = {requerido}% mínimo deliberatorio</p>
            </div>
          </>
        )}
      </Card>

      {/* Poderes */}
      {activa && <PoderesSection asambleaId={asambleaId} condominioId={condominioId} />}

      {/* Orden del día */}
      {(() => {
        const puntos = a.ordenDia ?? a.agenda.map((t) => ({ titulo: t, descripcion: undefined, votacionId: undefined }));
        if (puntos.length === 0) return null;
        return (
          <Card className="p-6">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
              <ListOrdered className="h-5 w-5 text-brand" /> Orden del día
            </h2>
            <ol className="space-y-2 text-sm text-foreground">
              {puntos.map((p, i) => (
                <li key={i} className="flex gap-2 rounded-lg bg-muted/40 p-3">
                  <span className="font-semibold text-muted-foreground">{i + 1}.</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.titulo}</span>
                      {p.votacionId && <Badge tone="info">Con votación</Badge>}
                    </div>
                    {p.descripcion && <p className="text-muted-foreground">{p.descripcion}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        );
      })()}

      {/* Votaciones en vivo */}
      <Card className="p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Vote className="h-5 w-5 text-brand" /> Votaciones
        </h2>
        {votaciones === undefined ? (
          <Spinner className="mx-auto my-4 h-5 w-5" />
        ) : votaciones.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            Aún no hay votaciones. Cuando la administración abra una pregunta, podrás votar aquí.
          </p>
        ) : (
          <div className="space-y-4">
            {votaciones.map((vt) => (
              <VotacionCard
                key={vt._id}
                vt={vt}
                miVoto={mi?.votos?.[vt._id as string] ?? null}
                presente={presente}
              />
            ))}
          </div>
        )}
      </Card>
    </PageContainer>
  );
}

function StatBox({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 text-center">
      <p className={cn("text-2xl font-bold tabular-nums", tone)}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function VotacionCard({
  vt,
  miVoto,
  presente,
}: {
  vt: {
    _id: Id<"votaciones">;
    pregunta: string;
    opciones: { texto: string; votos: number }[];
    estado: "abierta" | "cerrada";
  };
  miVoto: number | null;
  presente: boolean;
}) {
  const votar = useMutation(api.asambleas.votar);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = vt.opciones.reduce((s, o) => s + o.votos, 0);
  const abierta = vt.estado === "abierta";

  async function emitir(i: number) {
    setBusy(i);
    setError(null);
    try {
      await votar({ votacionId: vt._id, opcionIndex: i });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el voto.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="font-semibold text-foreground">{vt.pregunta}</p>
        <Badge tone={abierta ? "success" : "neutral"}>{abierta ? "Abierta" : "Cerrada"}</Badge>
      </div>

      <div className="space-y-2">
        {vt.opciones.map((op, i) => {
          const pct = total > 0 ? Math.round((op.votos / total) * 100) : 0;
          const esMiVoto = miVoto === i;
          return (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-foreground">
                  {abierta && presente && (
                    <button
                      onClick={() => emitir(i)}
                      disabled={busy !== null}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-60",
                        esMiVoto
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border bg-card text-foreground hover:border-brand/50 hover:bg-brand/5",
                      )}
                    >
                      {busy === i ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : esMiVoto ? (
                        <Check className="h-3 w-3" />
                      ) : null}
                      {esMiVoto ? "Tu voto" : "Votar"}
                    </button>
                  )}
                  {!abierta && esMiVoto && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                      <Check className="h-3.5 w-3.5" /> Tu voto
                    </span>
                  )}
                  {op.texto}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {op.votos} · {pct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", esMiVoto ? "bg-brand" : "bg-brand/50")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {abierta && !presente && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Registra tu asistencia arriba para poder votar.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{total} voto{total !== 1 ? "s" : ""} en total</p>
    </div>
  );
}

/* ───────────────────────── Poderes ───────────────────────── */

function PoderesSection({
  asambleaId,
  condominioId,
}: {
  asambleaId: Id<"asambleas">;
  condominioId: Id<"condominios">;
}) {
  const home = useQuery(api.portal.home, { condominioId });
  const otorgados = useQuery(api.asambleas.poderesOtorgados, { asambleaId });
  const recibidos = useQuery(api.asambleas.poderesRecibidos, { asambleaId });
  const otorgar = useMutation(api.asambleas.otorgarPoder);
  const responder = useMutation(api.asambleas.responderPoder);
  const revocar = useMutation(api.asambleas.revocarPoder);

  const unidades = home && home.allowed ? home.unidades : [];
  const [unidadId, setUnidadId] = useState("");
  const [rep, setRep] = useState<{ _id: Id<"users">; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unidades que ya delegué (para no repetir).
  const delegadasIds = new Set((otorgados ?? []).map((p) => p.unidadId as string));
  const disponibles = unidades.filter((u) => !delegadasIds.has(u._id));

  async function darPoder() {
    if (!unidadId || !rep) {
      setError("Elige una unidad y un representante.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await otorgar({ asambleaId, unidadId: unidadId as Id<"unidades">, representanteUserId: rep._id });
      setUnidadId("");
      setRep(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo otorgar el poder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
        <UserPlus className="h-5 w-5 text-brand" /> Poderes
      </h2>

      {/* Poderes recibidos (aceptar/rechazar) */}
      {recibidos && recibidos.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-sm font-medium text-foreground">Poderes que te otorgaron</p>
          {recibidos.map((p) => (
            <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Unidad {p.unidadNumero} · {p.otorganteNombre}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.validado ? "Aceptado — puedes votar por esta unidad" : "Pendiente de tu aceptación"}
                </p>
              </div>
              {!p.validado ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => responder({ poderId: p._id, aceptar: true })}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Check className="h-3.5 w-3.5" /> Aceptar
                  </button>
                  <button
                    onClick={() => responder({ poderId: p._id, aceptar: false })}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" /> Rechazar
                  </button>
                </div>
              ) : (
                <Badge tone="success">Aceptado</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Otorgar poder */}
      {disponibles.length > 0 && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">Delegar mi voto a un representante</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Unidad</span>
              <select
                value={unidadId}
                onChange={(e) => setUnidadId(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                <option value="">Selecciona…</option>
                {disponibles.map((u) => (
                  <option key={u._id} value={u._id}>Unidad {u.numero}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Representante</span>
              <UserSearch condominioId={condominioId} value={rep} onChange={setRep} />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={darPoder}
            disabled={busy || !unidadId || !rep}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Otorgar poder
          </button>
        </div>
      )}

      {/* Poderes que otorgué (revocar) */}
      {otorgados && otorgados.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Poderes que otorgaste</p>
          {otorgados.map((p) => (
            <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Unidad {p.unidadNumero} → {p.representanteNombre}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.validado ? "Aceptado por el representante" : "Pendiente de aceptación"}
                </p>
              </div>
              <button
                onClick={() => revocar({ poderId: p._id }).catch(() => {})}
                aria-label="Revocar"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function UserSearch({
  condominioId,
  value,
  onChange,
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
      <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-sm">
        <span className="truncate text-foreground">{value.name}</span>
        <button onClick={() => onChange(null)} aria-label="Quitar" className="text-muted-foreground hover:text-red-600">
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
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar nombre o correo…"
        className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {open && term.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          {results === undefined ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados.</p>
          ) : (
            results.map((u) => (
              <button
                key={u._id}
                onClick={() => { onChange({ _id: u._id, name: u.name }); setOpen(false); setTerm(""); }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium text-foreground">{u.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{u.email}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
