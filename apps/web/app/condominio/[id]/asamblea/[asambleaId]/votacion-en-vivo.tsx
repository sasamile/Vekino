"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  Maximize2, Minimize2, Plus, Trash2, Lock, Unlock, Loader2, Vote, ListOrdered,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Opcion = { texto: string; votos: number };

/** Chip solo con número de unidad (voto secreto en pantalla pública). */
function UnidadChip({ numero, votó }: { numero: string; votó: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-12 items-center justify-center rounded-lg border px-2.5 py-1.5 text-sm font-semibold tabular-nums transition-colors",
        votó
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {numero}
    </span>
  );
}

function BarrasYGrafica({
  opciones,
  totalCoef,
  grande,
}: {
  opciones: { texto: string; votos: number; coeficiente: number }[];
  totalCoef: number;
  grande?: boolean;
}) {
  const maxCoef = Math.max(1, ...opciones.map((o) => o.coeficiente));
  const barMax = grande ? 200 : 140;
  return (
    <div className={cn("grid gap-6", grande ? "lg:grid-cols-2" : "md:grid-cols-2")}>
      {/* Progreso horizontal */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progreso</p>
        {opciones.map((op, i) => {
          const pct = totalCoef > 0 ? Math.round((op.coeficiente / totalCoef) * 100) : 0;
          return (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{op.texto}</span>
                <span className="tabular-nums text-muted-foreground">
                  {op.votos} und · {op.coeficiente} coef · {pct}%
                </span>
              </div>
              <div className={cn("overflow-hidden rounded-full bg-muted", grande ? "h-4" : "h-2.5")}>
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* Barras verticales (altura en px: % no funciona bien en flex) */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gráfica</p>
        <div
          className={cn(
            "flex items-end justify-around gap-3 border-b border-border pb-0",
            grande ? "h-64" : "h-48",
          )}
        >
          {opciones.map((op, i) => {
            const pct = totalCoef > 0 ? Math.round((op.coeficiente / totalCoef) * 100) : 0;
            const barH =
              op.coeficiente > 0
                ? Math.max(12, Math.round((op.coeficiente / maxCoef) * barMax))
                : 4;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <span className="text-xs font-semibold tabular-nums text-foreground">{pct}%</span>
                <div
                  className={cn(
                    "w-full max-w-16 rounded-t-md transition-all",
                    op.coeficiente > 0 ? "bg-brand" : "bg-muted",
                  )}
                  style={{ height: barH }}
                  title={`${op.texto}: ${op.votos} und`}
                />
                <span className="line-clamp-2 min-h-8 text-center text-[11px] text-muted-foreground">
                  {op.texto}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ColumnasUnidades({
  votaron,
  pendientes,
  grande,
}: {
  votaron: string[];
  pendientes: string[];
  grande?: boolean;
}) {
  return (
    <div className={cn("grid gap-4", grande ? "md:grid-cols-2" : "sm:grid-cols-2")}>
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">
          Ya votaron{" "}
          <span className="font-normal text-muted-foreground">({votaron.length})</span>
        </p>
        {votaron.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nadie ha votado aún.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {votaron.map((n) => (
              <UnidadChip key={n} numero={n} votó />
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">
          Pendientes{" "}
          <span className="font-normal text-muted-foreground">({pendientes.length})</span>
        </p>
        {pendientes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todas las unidades presentes ya votaron.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pendientes.map((n) => (
              <UnidadChip key={n} numero={n} votó={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Tablero de UNA votación abierta (pantalla normal o fullscreen público). */
export function TableroVotacionAbierta({
  asambleaId,
  votacionId,
  pregunta,
  opciones,
  enCurso,
  fullscreen,
  onToggleFullscreen,
  onCerrar,
}: {
  asambleaId: Id<"asambleas">;
  votacionId: Id<"votaciones">;
  pregunta: string;
  opciones: Opcion[];
  enCurso: boolean;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onCerrar?: () => void;
}) {
  const res = useQuery(api.asambleas.resultadosVotacion, { votacionId });
  const det = useQuery(api.asambleas.asistentesDetallado, { asambleaId });
  const toggle = useMutation(api.asambleas.toggleVotacion);
  const [busy, setBusy] = useState(false);

  const presentes = useMemo(
    () => (det?.filas ?? []).filter((f) => f.presente),
    [det?.filas],
  );
  // Todas las unidades que ya emitieron voto (propias + por poder), no solo las "presentes".
  const votaron = useMemo(
    () =>
      (det?.filas ?? [])
        .filter((f) => f.votos[votacionId as string] != null)
        .map((f) => f.unidadNumero)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [det?.filas, votacionId],
  );
  const pendientes = useMemo(
    () =>
      presentes
        .filter((f) => f.votos[votacionId as string] == null)
        .map((f) => f.unidadNumero)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [presentes, votacionId],
  );

  const totalCoef = res ? res.opciones.reduce((s, o) => s + o.coeficiente, 0) : 0;
  const totalVotos = res?.totalVotos ?? votaron.length;
  const ops = res?.opciones ?? opciones.map((o) => ({ ...o, coeficiente: 0 }));

  async function cerrar() {
    setBusy(true);
    try {
      await toggle({ id: votacionId });
      onCerrar?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-5", fullscreen && "mx-auto max-w-6xl")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone="success">Abierta</Badge>
            <span className="text-xs text-muted-foreground">
              {totalVotos} unidad{totalVotos === 1 ? "" : "es"} votaron
              {pendientes.length > 0
                ? ` · ${pendientes.length} pendiente${pendientes.length === 1 ? "" : "s"}`
                : presentes.length > 0
                  ? " · sin pendientes"
                  : ""}
            </span>
          </div>
          <h2
            className={cn(
              "font-bold tracking-tight text-foreground",
              fullscreen ? "text-3xl sm:text-4xl" : "text-xl",
            )}
          >
            {pregunta}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {onToggleFullscreen ? (
            <Button variant="outline" size="sm" onClick={onToggleFullscreen}>
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {fullscreen ? "Salir" : "Pantalla completa"}
            </Button>
          ) : null}
          {!fullscreen && enCurso ? (
            <Button variant="outline" size="sm" onClick={cerrar} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Cerrar votación
            </Button>
          ) : null}
        </div>
      </div>

      {!res ? (
        <Spinner className="mx-auto h-5 w-5" />
      ) : (
        <BarrasYGrafica opciones={ops} totalCoef={totalCoef} grande={fullscreen} />
      )}

      <ColumnasUnidades votaron={votaron} pendientes={pendientes} grande={fullscreen} />
    </div>
  );
}

export function VotacionEnVivoTab({
  asambleaId,
  agenda,
}: {
  asambleaId: Id<"asambleas">;
  agenda: string[];
}) {
  const a = useQuery(api.asambleas.get, { id: asambleaId });
  const enCurso = a?.estado === "en_curso";
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const createVotacion = useMutation(api.asambleas.createVotacion);
  const cerrarHuerfanas = useMutation(api.asambleas.cerrarVotacionesSiInactiva);
  const toggle = useMutation(api.asambleas.toggleVotacion);
  const remove = useMutation(api.asambleas.removeVotacion);
  const [pregunta, setPregunta] = useState("");
  const [opciones, setOpciones] = useState<string[]>(["A favor", "En contra", "Abstención"]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenId, setFullscreenId] = useState<Id<"votaciones"> | null>(null);

  useEffect(() => {
    if (!a || enCurso) return;
    void cerrarHuerfanas({ asambleaId }).catch(() => {});
  }, [a, enCurso, asambleaId, cerrarHuerfanas]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const abiertas = useMemo(
    () => (votaciones ?? []).filter((v) => v.estado === "abierta"),
    [votaciones],
  );
  const cerradas = useMemo(
    () => (votaciones ?? []).filter((v) => v.estado === "cerrada"),
    [votaciones],
  );

  async function crear() {
    const ops = opciones.map((o) => o.trim()).filter(Boolean);
    if (!pregunta.trim() || ops.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await createVotacion({ asambleaId, pregunta, opciones: ops });
      setPregunta("");
      setOpciones(["A favor", "En contra", "Abstención"]);
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear.");
    } finally {
      setBusy(false);
    }
  }

  const fsVt = fullscreenId ? abiertas.find((v) => v._id === fullscreenId) : null;

  return (
    <>
      {fsVt ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-6 sm:p-10">
          <TableroVotacionAbierta
            asambleaId={asambleaId}
            votacionId={fsVt._id}
            pregunta={fsVt.pregunta}
            opciones={fsVt.opciones}
            enCurso={!!enCurso}
            fullscreen
            onToggleFullscreen={() => setFullscreenId(null)}
          />
        </div>
      ) : null}

      <div className="space-y-5">
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Vote className="h-5 w-5 text-brand" /> Votación en vivo
            </h2>
            <Button variant="outline" size="sm" onClick={() => setShowForm((s) => !s)}>
              <Plus className="h-4 w-4" /> Nueva pregunta
            </Button>
          </div>

          {!enCurso && a ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              La asamblea aún no ha iniciado. Puedes preparar preguntas (quedan cerradas). Ábrelas
              cuando pulses <strong>Iniciar asamblea</strong>.
            </div>
          ) : null}

          {showForm && (
            <div className="mb-4 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <Input
                value={pregunta}
                onChange={(e) => setPregunta(e.target.value)}
                placeholder="¿Se aprueba…?"
              />
              {agenda.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {agenda.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPregunta(p)}
                      className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand hover:bg-brand/20"
                    >
                      {i + 1}. {p.length > 30 ? `${p.slice(0, 30)}…` : p}
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                {opciones.map((op, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={op}
                      onChange={(e) =>
                        setOpciones((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                      }
                      placeholder={`Opción ${i + 1}`}
                    />
                    {opciones.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setOpciones((prev) => prev.filter((_, idx) => idx !== i))}
                        className="rounded p-1.5 text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setOpciones((p) => [...p, ""])}
                className="text-sm font-medium text-brand hover:underline"
              >
                + Agregar opción
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={crear} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear
                </Button>
              </div>
            </div>
          )}

          {votaciones === undefined ? (
            <Spinner className="mx-auto my-6 h-5 w-5" />
          ) : abiertas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
              <Vote className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-base font-medium text-foreground">No hay votación activa</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Abre una pregunta preparada o crea una nueva para que los presentes puedan votar.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {abiertas.map((vt) => (
                <TableroVotacionAbierta
                  key={vt._id}
                  asambleaId={asambleaId}
                  votacionId={vt._id}
                  pregunta={vt.pregunta}
                  opciones={vt.opciones}
                  enCurso={!!enCurso}
                  onToggleFullscreen={() => setFullscreenId(vt._id)}
                />
              ))}
            </div>
          )}
        </Card>

        {cerradas.length > 0 ? (
          <Card className="p-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListOrdered className="h-4 w-4 text-muted-foreground" /> Preguntas preparadas / cerradas
            </h3>
            <div className="space-y-2">
              {cerradas.map((vt) => (
                <div
                  key={vt._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <p className="text-sm text-foreground">{vt.pregunta}</p>
                  <div className="flex items-center gap-1">
                    <Badge tone="neutral">Cerrada</Badge>
                    <button
                      type="button"
                      disabled={!enCurso}
                      title={!enCurso ? "Inicia la asamblea para abrir" : "Abrir votación"}
                      onClick={() => toggle({ id: vt._id }).catch(() => {})}
                      className="rounded p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      aria-label="Abrir"
                    >
                      <Unlock className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove({ id: vt._id }).catch(() => {})}
                      className="rounded p-1.5 text-muted-foreground hover:text-red-600"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}

/** Detalle admin: por pregunta, qué unidad votó qué (no es pantalla pública). */
export function DetalleVotosTab({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const det = useQuery(api.asambleas.asistentesDetallado, { asambleaId });
  const [sel, setSel] = useState<Id<"votaciones"> | null>(null);

  useEffect(() => {
    if (!sel && votaciones && votaciones.length > 0) {
      setSel(votaciones[0]!._id);
    }
  }, [votaciones, sel]);

  const vt = (votaciones ?? []).find((v) => v._id === sel);
  const filas = useMemo(() => {
    if (!vt || !det) return [];
    return det.filas
      .filter((f) => f.votos[vt._id as string] != null)
      .map((f) => {
        const idx = f.votos[vt._id as string] as number;
        return {
          unidad: f.unidadNumero,
          opcion: vt.opciones[idx]?.texto ?? `Opción ${idx + 1}`,
          quien: f.asistente ?? f.propietario ?? "—",
        };
      })
      .sort((a, b) => a.unidad.localeCompare(b.unidad, undefined, { numeric: true }));
  }, [vt, det]);

  if (votaciones === undefined) {
    return (
      <Card className="p-8">
        <Spinner className="mx-auto h-5 w-5" />
      </Card>
    );
  }
  if (votaciones.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Aún no hay votaciones.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Detalle de votos por pregunta</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Vista solo para administración. No usar en pantalla pública (voto secreto).
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {votaciones.map((v, i) => (
          <button
            key={v._id}
            type="button"
            onClick={() => setSel(v._id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              sel === v._id
                ? "bg-brand text-brand-foreground"
                : "border border-border text-muted-foreground hover:bg-accent",
            )}
          >
            P{i + 1}: {v.pregunta.length > 28 ? `${v.pregunta.slice(0, 28)}…` : v.pregunta}
          </button>
        ))}
      </div>
      {vt ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-md text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Unidad</th>
                <th className="py-2 pr-4 font-medium">Quién</th>
                <th className="py-2 font-medium">Voto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted-foreground">
                    Nadie ha votado en esta pregunta.
                  </td>
                </tr>
              ) : (
                filas.map((r) => (
                  <tr key={r.unidad}>
                    <td className="py-2 pr-4 font-medium text-foreground">{r.unidad}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.quien}</td>
                    <td className="py-2 text-foreground">{r.opcion}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
