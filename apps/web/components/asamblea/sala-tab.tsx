"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  AlertTriangle,
  Clock4,
  Hourglass,
  Radio,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Pestaña "Sala": lo que `Dashboard` no puede responder.
 *
 * `Dashboard` muestra el quórum ACUMULADO —quién marcó asistencia alguna
 * vez—. Esta pestaña muestra el quórum VIVO (quién está conectado ahora), la
 * permanencia de cada unidad y, por cada punto votado, si había quórum en el
 * instante exacto de la decisión. Es la diferencia entre "asistió" y "estaba
 * cuando se decidió", que es lo que se discute cuando se impugna un acta.
 */

function fmtHora(ts: number | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SalaTab({
  asambleaId,
  estado,
  modalidad,
}: {
  asambleaId: Id<"asambleas">;
  estado: string;
  modalidad: string;
}) {
  /* El panel de la mesa sí enseña la lista nominal de conexiones, así que es
   * el único que la pide. La sala no la usa. */
  const sala = useQuery(api.asambleaSala.salaEnVivo, {
    asambleaId,
    conDetalle: true,
  });
  const perm = useQuery(api.asambleaSala.permanencia, { asambleaId });
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const exigir = useMutation(api.asambleaSala.exigirConexionParaVotar);
  const [guardando, setGuardando] = useState(false);

  if (sala === undefined || sala === null) {
    return (
      <Card className="p-8">
        <Spinner className="mx-auto h-5 w-5" />
      </Card>
    );
  }

  const enCurso = estado === "en_curso";
  const exigeConexion = sala.exigeConexionParaVotar;
  const puntosVotados = (votaciones ?? []).filter((vt) => vt.abiertaAlgunaVez);

  return (
    <div className="space-y-5">
      {/* ── Conectados ahora ─────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Radio className="h-5 w-5 text-brand" /> Conectados ahora
            {enCurso && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
          </h2>
          <Badge tone={sala.hayQuorum ? "success" : "warning"}>
            {sala.hayQuorum ? "Con quórum" : "Sin quórum"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            value={`${sala.pctCoeficiente.toFixed(2)}%`}
            label="Coeficiente conectado"
            tone={sala.hayQuorum ? "text-emerald-600" : "text-brand"}
          />
          <Stat
            value={String(sala.unidadesConectadas)}
            label="Unidades en sala"
            tone="text-sky-600"
          />
          <Stat
            value={String(sala.totalUnidades)}
            label="Total unidades"
            tone="text-foreground"
          />
          <Stat
            value={fmtHora(sala.iniciadaEn)}
            label="Inicio real"
            tone="text-foreground"
          />
        </div>

        <div className="mt-4">
          <div className="relative h-3 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                sala.hayQuorum ? "bg-emerald-500" : "bg-brand",
              )}
              style={{ width: `${Math.min(100, sala.pctCoeficiente)}%` }}
            />
            <div
              className="absolute inset-y-0 w-0.5 bg-red-500"
              style={{ left: `${sala.quorumRequerido}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Esto es quién está conectado <strong>en este momento</strong>. El
            quórum del Dashboard es acumulado: incluye a quien ya se fue.
          </p>
        </div>

        {sala.conectados.length > 0 ? (
          <div className="mt-5 max-h-72 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Unidad</th>
                  <th className="px-3 py-2 font-medium">Quién</th>
                  <th className="px-3 py-2 font-medium">Desde</th>
                  <th className="px-3 py-2 font-medium">Entró por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sala.conectados.map((c, i) => (
                  <tr key={`${c.unidadNumero}-${i}`}>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {c.unidadNumero}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.userNombre}
                      {c.esPoder ? (
                        <Badge tone="info" className="ml-2">
                          Por poder
                        </Badge>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {fmtHora(c.entroEn)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {ORIGEN_LABEL[c.origen] ?? c.origen}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            Nadie conectado a la sala en este momento.
          </p>
        )}
      </Card>

      {/* ── Exigir conexión para votar ───────────────────────────────── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <ShieldCheck className="h-5 w-5 text-brand" /> Exigir conexión
              para votar
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Con esto activo, solo puede votar quien esté conectado a la sala
              en ese momento. Sin activar, basta con haber marcado asistencia
              aunque ya se haya ido.
            </p>
            {modalidad === "mixta" ? (
              <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                Esta asamblea es mixta: si lo activas, los asistentes que están
                en el salón sin conectarse a la sala virtual no podrán votar.
              </p>
            ) : null}
            {modalidad === "presencial" ? (
              <p className="mt-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                No aplica en asambleas presenciales: no hay sala virtual a la
                que conectarse.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={exigeConexion}
            disabled={guardando || modalidad === "presencial"}
            onClick={async () => {
              setGuardando(true);
              try {
                await exigir({ asambleaId, exigir: !exigeConexion });
              } finally {
                setGuardando(false);
              }
            }}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              "disabled:cursor-not-allowed disabled:opacity-50",
              exigeConexion ? "bg-emerald-500" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
                exigeConexion ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        </div>
      </Card>

      {/* ── Auditoría por punto votado ───────────────────────────────── */}
      {puntosVotados.length > 0 ? (
        <Card className="p-6">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-foreground">
            <Clock4 className="h-5 w-5 text-brand" /> Quórum en el momento de
            cada decisión
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Reconstruido con las conexiones reales. Es lo que se pide cuando se
            impugna un punto concreto y no la asamblea entera.
          </p>
          <div className="space-y-3">
            {puntosVotados.map((vt) => (
              <PuntoAuditoria
                key={vt._id}
                asambleaId={asambleaId}
                votacionId={vt._id}
                pregunta={vt.pregunta}
                abiertaEn={vt.abiertaEn ?? null}
                cerradaEn={vt.cerradaEn ?? null}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {/* ── Permanencia ──────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Hourglass className="h-5 w-5 text-brand" /> Permanencia por unidad
          </h2>
          {perm && !perm.sinIniciar ? (
            <span className="text-xs text-muted-foreground">
              Duración {perm.duracionTotal} · promedio{" "}
              {perm.pctPromedio.toFixed(1)}%
            </span>
          ) : null}
        </div>

        {perm === undefined ? (
          <Spinner className="mx-auto my-4 h-5 w-5" />
        ) : !perm || perm.sinIniciar ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            La asamblea no ha iniciado. La permanencia se empieza a medir
            cuando la mesa la abre y la gente entra a la sala.
          </p>
        ) : perm.unidades.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            Asamblea iniciada, pero todavía nadie ha entrado a la sala.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Ordenado de menor a mayor: arriba está quien menos tiempo estuvo.
            </p>
            <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
              <table className="w-full min-w-2xl text-sm">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Unidad</th>
                    <th className="px-3 py-2 font-medium">Quién</th>
                    <th className="px-3 py-2 font-medium">Tiempo</th>
                    <th className="px-3 py-2 font-medium">Permanencia</th>
                    <th className="px-3 py-2 font-medium">Caídas</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {perm.unidades.map((u) => (
                    <tr key={u.unidadNumero}>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {u.unidadNumero}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {u.personas}
                        {u.esPoder ? (
                          <Badge tone="info" className="ml-2">
                            Poder
                          </Badge>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                        {u.duracion}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                u.pct >= 80
                                  ? "bg-emerald-500"
                                  : u.pct >= 50
                                    ? "bg-amber-500"
                                    : "bg-red-500",
                              )}
                              style={{ width: `${u.pct}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {u.pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {u.reconexiones > 0 ? u.reconexiones : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {u.sigueConectada ? (
                          <Badge tone="success">En sala</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Salió {fmtHora(u.ultimaSalida)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

const ORIGEN_LABEL: Record<string, string> = {
  codigo: "Código en pantalla",
  sala: "Entró a la sala",
  manual_admin: "Registro de la mesa",
  poder_codigo: "Código de poder",
  presencial: "Presencial",
};

/**
 * Una fila de auditoría por punto votado: quórum en el instante en que se
 * abrió y votos emitidos por unidades que no estaban conectadas.
 */
function PuntoAuditoria({
  asambleaId,
  votacionId,
  pregunta,
  abiertaEn,
  cerradaEn,
}: {
  asambleaId: Id<"asambleas">;
  votacionId: Id<"votaciones">;
  pregunta: string;
  abiertaEn: number | null;
  cerradaEn: number | null;
}) {
  const quorum = useQuery(
    api.asambleaSala.quorumEnInstante,
    abiertaEn ? { asambleaId, instante: abiertaEn } : "skip",
  );
  const integridad = useQuery(api.asambleaSala.integridadVotacion, {
    votacionId,
  });

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-lg text-sm font-medium text-foreground">
          {pregunta}
        </p>
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {abiertaEn ? (
            <>
              {fmtHora(abiertaEn)}
              {cerradaEn ? ` – ${fmtHora(cerradaEn)}` : " · abierta"}
            </>
          ) : (
            "Sin registro de apertura"
          )}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        {!abiertaEn ? (
          <span className="text-xs text-muted-foreground">
            Esta votación es anterior al registro de conexiones.
          </span>
        ) : quorum === undefined ? (
          <Spinner className="h-4 w-4" />
        ) : quorum ? (
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">
              {quorum.unidadesPresentes} unidades conectadas ·{" "}
              <strong
                className={cn(
                  "tabular-nums",
                  quorum.hayQuorum ? "text-emerald-600" : "text-red-600",
                )}
              >
                {quorum.pctCoeficiente.toFixed(2)}%
              </strong>{" "}
              de coeficiente
            </span>
            <Badge tone={quorum.hayQuorum ? "success" : "destructive"}>
              {quorum.hayQuorum ? "Con quórum" : "Sin quórum"}
            </Badge>
          </span>
        ) : null}
      </div>

      {integridad?.aplicable && integridad.sinConexion.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {integridad.sinConexion.length} de {integridad.totalVotos} votos se
            emitieron sin conexión activa
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Unidades:{" "}
            {integridad.sinConexion.map((s) => s.unidadNumero).join(", ")}
          </p>
          <p className="mt-1.5 text-xs text-amber-700">
            Puede ser una caída de red momentánea. Decidir si el voto vale es
            de la mesa; el sistema solo lo señala.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 text-center">
      <p className={cn("text-2xl font-bold tabular-nums", tone)}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
