"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { AlertTriangle, Database, TrendingUp } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Lo que va a costar una asamblea, antes de celebrarla.
 *
 * Existe por una factura de 185 GB que nadie vio venir. El problema no fue el
 * consumo: fue que era invisible hasta que llegaba el cobro un mes después,
 * cuando ya no había nada que hacer. Esto lo pone delante antes.
 */
export function CosteSalaPanel() {
  const condos = useQuery(api.automatizaciones.condominiosConAsambleas);
  const [asambleaId, setAsambleaId] = useState<Id<"asambleas"> | "">("");

  const coste = useQuery(
    api.diagnosticoSala.costeDeLaSala,
    asambleaId ? { asambleaId: asambleaId as Id<"asambleas"> } : "skip",
  );

  const asambleas = (condos ?? []).flatMap((c) =>
    c.asambleas.map((a) => ({ ...a, condominio: c.condominioNombre })),
  );

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <Database
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Qué le va a costar una asamblea a la base de datos
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            No son estimaciones: se miden las consultas de verdad, con los datos
            que hay ahora en esa asamblea. Lo único supuesto es la
            multiplicación por cuánta gente hay conectada.
          </p>
        </div>
      </div>

      <div className="mt-4 max-w-md">
        <Select
          value={asambleaId}
          onChange={(e) => setAsambleaId(e.target.value as Id<"asambleas"> | "")}
          aria-label="Asamblea"
        >
          <option value="">Elige una asamblea…</option>
          {asambleas.map((a) => (
            <option key={a.asambleaId} value={a.asambleaId}>
              {a.condominio} · {a.titulo} · {a.fecha}
            </option>
          ))}
        </Select>
      </div>

      {asambleaId && coste === undefined && (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" /> Midiendo…
        </div>
      )}

      {coste && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <Cifra etiqueta="Conectados ahora" valor={String(coste.suscriptores)} />
            <Cifra
              etiqueta="Peso de todo lo suscrito"
              valor={coste.pesoTodasLasConsultas}
            />
            <Cifra
              etiqueta="Consumo estimado de la asamblea"
              valor={coste.totalEstimado}
              destacado
            />
          </div>

          {coste.advertencia && (
            <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                {coste.advertencia}
              </p>
            </div>
          )}

          {/* Qué evento cuesta qué. Ordenado por lo que más pesa, que casi
              nunca es lo que uno cree. */}
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              Lo que cuesta cada cosa que pasa
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted-foreground">
                    <th className="pb-1.5 pr-3 font-medium">Evento</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">Cada vez</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">Veces</th>
                    <th className="pb-1.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {coste.eventos.map((e) => (
                    <tr key={e.evento} className="border-b border-border/50">
                      <td className="py-2 pr-3">
                        <span className="block text-foreground">{e.evento}</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                          {e.detalle}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-muted-foreground">
                        {e.porVez}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-muted-foreground">
                        {e.vecesTipicas}
                      </td>
                      <td className="py-2 text-right font-mono font-medium text-foreground">
                        {e.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-foreground">
              Qué pesa cada consulta que todos tienen abierta
            </h3>
            <ul className="space-y-1">
              {coste.consultas.map((c) => (
                <li
                  key={c.nombre}
                  className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5"
                >
                  <span className="min-w-0">
                    <span className="font-mono text-[11px] text-foreground">
                      {c.nombre}
                    </span>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {c.que}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {c.documentos} docs · {c.peso}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function Cifra({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{etiqueta}</p>
      <p
        className={
          destacado
            ? "text-xl font-semibold tracking-tight text-foreground"
            : "text-base font-medium text-foreground"
        }
      >
        {valor}
      </p>
    </div>
  );
}
