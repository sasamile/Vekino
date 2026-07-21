"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  KeyRound, Loader2, Check, Vote, Home, Radio, ArrowRight, ShieldCheck,
  ListChecks, Users, BarChart3, Circle, CheckCircle2, Clock,
} from "lucide-react";

const STORAGE_KEY = "vekino_apoderado_codigo";

export default function ApoderadoPage() {
  const [input, setInput] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [restaurado, setRestaurado] = useState(false);
  const data = useQuery(api.asambleas.accederConCodigo, codigo ? { codigo } : "skip");

  // Restaura la sesión guardada al montar (sobrevive a recargas).
  useEffect(() => {
    const guardado = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (guardado) setCodigo(guardado);
    setRestaurado(true);
  }, []);

  // Si el código guardado resultó inválido, límpialo para no quedar atascado.
  useEffect(() => {
    if (codigo && data === null) {
      window.localStorage.removeItem(STORAGE_KEY);
      setCodigo(null);
    }
  }, [codigo, data]);

  function ingresar(cod: string) {
    const c = cod.trim().toUpperCase();
    window.localStorage.setItem(STORAGE_KEY, c);
    setCodigo(c);
  }

  function salir() {
    window.localStorage.removeItem(STORAGE_KEY);
    setCodigo(null);
    setInput("");
  }

  // Evita el parpadeo del formulario mientras se restaura desde localStorage.
  if (!restaurado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-white to-primary/10 dark:from-background dark:to-primary/5">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-white to-primary/10 px-4 py-10 dark:from-background dark:to-primary/5">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Acceso de apoderado</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresa el código que te compartió el propietario para votar por las casas que representas.
          </p>
        </div>

        {!codigo || data === null ? (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            {data === null && (
              <p className="mb-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-600">
                Código inválido o sin poderes activos. Verifica con el propietario.
              </p>
            )}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Código de acceso</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value.toUpperCase())}
                  placeholder="XXXXXX"
                  maxLength={8}
                  className="h-14 w-full rounded-xl border border-input bg-card pl-11 text-center font-mono text-2xl font-bold tracking-[0.3em] text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>
            </label>
            <button
              onClick={() => ingresar(input)}
              disabled={input.trim().length < 4}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Ingresar <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : data === undefined ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Sala data={data} codigo={codigo} onSalir={salir} />
        )}
      </div>
    </div>
  );
}

function Sala({
  data,
  codigo,
  onSalir,
}: {
  data: NonNullable<ReturnType<typeof useApoderado>>;
  codigo: string;
  onSalir: () => void;
}) {
  const registrar = useMutation(api.asambleas.registrarAsistenciaConCodigo);
  const [regBusy, setRegBusy] = useState(false);
  const [regErr, setRegErr] = useState<string | null>(null);
  const activa = data.asamblea.estado === "programada" || data.asamblea.estado === "en_curso";
  const q = data.quorum;
  const alcanzado = q.pct >= q.quorumRequerido;
  const abiertas = data.votaciones.filter((vt) => vt.estado === "abierta");
  // Solo resultados de votaciones que se abrieron alguna vez (nunca abiertas = sin resultados).
  const cerradas = data.votaciones.filter((vt) => vt.estado === "cerrada" && vt.abiertaAlgunaVez);
  return (
    <div className="space-y-5">
      {/* Encabezado del apoderado */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Apoderado</p>
            <p className="text-lg font-bold text-foreground">{data.apoderadoNombre}</p>
          </div>
          <button onClick={onSalir} className="text-sm text-muted-foreground hover:text-foreground">Salir</button>
        </div>
        <div className="mt-3 rounded-xl bg-muted/40 p-3">
          <p className="text-sm font-medium capitalize text-foreground">{data.asamblea.titulo}</p>
          <p className="text-xs capitalize text-muted-foreground">
            Asamblea {data.asamblea.tipo} · {data.asamblea.fecha} · {data.asamblea.hora}
            {data.asamblea.estado === "en_curso" && <span className="ml-2 inline-flex items-center gap-1 font-medium normal-case text-emerald-600"><Radio className="h-3 w-3 animate-pulse" /> En vivo</span>}
            {data.asamblea.estado === "finalizada" && <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 font-medium normal-case text-muted-foreground">Finalizada</span>}
          </p>
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Casas que representas ({data.unidades.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {data.unidades.map((u, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                <Home className="h-3 w-3" /> {u.unidadNumero}{u.coeficiente != null ? ` · ${u.coeficiente}%` : ""}
              </span>
            ))}
          </div>
          {!data.validado && <p className="mt-2 text-xs text-amber-600">Algún poder está pendiente de validación por la administración.</p>}
        </div>
      </div>

      {/* Registro de asistencia */}
      {activa && (
        data.asistenciaRegistrada ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Asistencia registrada</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">Tu casa ya cuenta para el quórum. Puedes votar cuando abran una votación.</p>
            </div>
          </div>
        ) : data.asamblea.modalidad === "virtual" ? (
          /* Virtual: el apoderado sí puede auto-registrarse. */
          <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4">
            <p className="text-sm font-semibold text-foreground">Confirma tu asistencia</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Registra tu presencia para que tu casa cuente en el quórum.</p>
            {regErr && <p className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-600">{regErr}</p>}
            <button
              onClick={async () => {
                setRegBusy(true); setRegErr(null);
                try { await registrar({ codigo }); }
                catch (e) { setRegErr(e instanceof Error ? e.message : "No se pudo registrar."); }
                finally { setRegBusy(false); }
              }}
              disabled={regBusy}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {regBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar mi asistencia
            </button>
          </div>
        ) : (
          /* Presencial / mixta: el admin corrobora. El apoderado muestra su código. */
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Asistencia pendiente</p>
            </div>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Al llegar a la asamblea, muestra este código al administrador para que registre tu asistencia. No puedes registrarte por tu cuenta en asambleas presenciales.
            </p>
            <div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-white/60 p-3 text-center dark:bg-background/40">
              <p className="text-[11px] uppercase tracking-wide text-amber-600">Tu código</p>
              <p className="font-mono text-2xl font-bold tracking-[0.3em] text-foreground">{codigo}</p>
            </div>
          </div>
        )
      )}

      {/* Quórum */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><Users className="h-5 w-5 text-brand" /> Quórum</h2>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${alcanzado ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {alcanzado ? "Alcanzado" : "Sin quórum"}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground tabular-nums">{q.pct}%</span>
          <span className="text-sm text-muted-foreground">de {q.quorumRequerido}% requerido</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${alcanzado ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, q.pct)}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{q.unidadesPresentes} de {q.totalUnidades} unidades presentes</p>
      </div>

      {/* Orden del día */}
      {data.ordenDia.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <ListChecks className="h-5 w-5 text-brand" /> Orden del día
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {data.ordenDia.filter((p) => p.hecho).length}/{data.ordenDia.length} realizados
            </span>
          </h2>
          <ol className="space-y-2.5">
            {data.ordenDia.map((p, i) => {
              const hecho = !!p.hecho;
              return (
                <li
                  key={i}
                  className={`flex gap-3 rounded-lg p-2 ${hecho ? "bg-emerald-500/5" : ""}`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      hecho ? "bg-emerald-500 text-white" : "bg-brand/10 text-brand"
                    }`}
                  >
                    {hecho ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${hecho ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {p.titulo}
                    </p>
                    {p.descripcion && <p className="text-xs text-muted-foreground">{p.descripcion}</p>}
                    {p.votacionId && (
                      <span className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${p.estadoVotacion === "abierta" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        <Vote className="h-3 w-3" /> {p.estadoVotacion === "abierta" ? "Votación abierta" : "Con votación"}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Votaciones abiertas (para votar) */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground"><Vote className="h-5 w-5 text-brand" /> Votaciones {abiertas.length > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{abiertas.length} abierta{abiertas.length !== 1 ? "s" : ""}</span>}</h2>
        {abiertas.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">No hay votaciones abiertas en este momento.</p>
        ) : (
          <div className="space-y-4">
            {abiertas.map((vt) => (
              <VotacionApoderado key={vt._id} codigo={codigo} vt={vt} habilitado={activa} />
            ))}
          </div>
        )}
      </div>

      {/* Resultados (votaciones cerradas) */}
      {cerradas.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground"><BarChart3 className="h-5 w-5 text-brand" /> Resultados</h2>
          <div className="space-y-4">
            {cerradas.map((vt) => (
              <ResultadoApoderado key={vt._id} vt={vt} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultadoApoderado({
  vt,
}: {
  vt: { pregunta: string; opciones: { texto: string; votos: number }[]; miVoto: number | null };
}) {
  const total = vt.opciones.reduce((s, o) => s + o.votos, 0);
  const maxVotos = Math.max(0, ...vt.opciones.map((o) => o.votos));
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="mb-3 font-semibold text-foreground">{vt.pregunta}</p>
      <div className="space-y-2">
        {vt.opciones.map((op, i) => {
          const pct = total > 0 ? Math.round((op.votos / total) * 100) : 0;
          const gana = op.votos === maxVotos && maxVotos > 0;
          const esMio = vt.miVoto === i;
          return (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 text-foreground">
                  {esMio ? <CheckCircle2 className="h-3.5 w-3.5 text-brand" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                  {op.texto}{gana && <span className="rounded bg-emerald-100 px-1.5 text-[11px] font-semibold text-emerald-700">Ganadora</span>}
                </span>
                <span className="tabular-nums text-muted-foreground">{op.votos} · {pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${gana ? "bg-emerald-500" : "bg-brand/40"}`} style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VotacionApoderado({
  codigo,
  vt,
  habilitado,
}: {
  codigo: string;
  vt: { _id: Id<"votaciones">; pregunta: string; estado: "abierta" | "cerrada"; opciones: { texto: string; votos: number }[]; miVoto: number | null };
  habilitado: boolean;
}) {
  const votar = useMutation(api.asambleas.votarConCodigo);
  const [busy, setBusy] = useState<number | null>(null);
  const total = vt.opciones.reduce((s, o) => s + o.votos, 0);
  const abierta = vt.estado === "abierta";

  async function emitir(i: number) {
    setBusy(i);
    try { await votar({ codigo, votacionId: vt._id, opcionIndex: i }); } catch { /* noop */ } finally { setBusy(null); }
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="font-semibold text-foreground">{vt.pregunta}</p>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${abierta ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{abierta ? "Abierta" : "Cerrada"}</span>
      </div>
      <div className="space-y-2">
        {vt.opciones.map((op, i) => {
          const pct = total > 0 ? Math.round((op.votos / total) * 100) : 0;
          const esMio = vt.miVoto === i;
          return (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-foreground">
                  {abierta && habilitado && (
                    <button onClick={() => emitir(i)} disabled={busy !== null}
                      className={`inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-semibold disabled:opacity-60 ${esMio ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card hover:border-brand/50"}`}>
                      {busy === i ? <Loader2 className="h-3 w-3 animate-spin" /> : esMio ? <Check className="h-3 w-3" /> : null}
                      {esMio ? "Tu voto" : "Votar"}
                    </button>
                  )}
                  {op.texto}
                </span>
                <span className="tabular-nums text-muted-foreground">{op.votos} · {pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${esMio ? "bg-brand" : "bg-brand/50"}`} style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tipo auxiliar para el retorno de accederConCodigo.
function useApoderado() {
  return useQuery(api.asambleas.accederConCodigo, { codigo: "" });
}
