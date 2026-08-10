"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Database, TrendingUp } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Lo que va a costar una asamblea, antes de celebrarla — en plata.
 *
 * Existe por una factura de 185 GB que nadie vio venir. Los pesos se miden
 * ejecutando las consultas reales; la proyección va por defecto a la asamblea
 * llena (todas las unidades del conjunto), no a la sala vacía de hoy.
 */
export function CosteSalaPanel() {
  const condos = useQuery(api.automatizaciones.condominiosConAsambleas);
  const [asambleaId, setAsambleaId] = useState<Id<"asambleas"> | "">("");
  const [gente, setGente] = useState<string>("");

  const simular = Number(gente);
  const coste = useQuery(
    api.diagnosticoSala.costeDeLaSala,
    asambleaId
      ? {
          asambleaId: asambleaId as Id<"asambleas">,
          ...(Number.isFinite(simular) && simular > 0
            ? { simular }
            : {}),
        }
      : "skip",
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
            Los pesos se miden con los datos reales de esa asamblea. La
            proyección asume la asamblea llena — todas las unidades del
            conjunto — salvo que pongas otro número de gente.
          </p>
        </div>
      </div>

      <div className="mt-4 flex max-w-2xl flex-wrap gap-2">
        <Select
          className="min-w-64 flex-1"
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
        <Input
          className="w-36"
          type="number"
          min={1}
          placeholder="¿Cuánta gente?"
          value={gente}
          onChange={(e) => setGente(e.target.value)}
          aria-label="Personas a simular"
        />
      </div>

      {asambleaId && coste === undefined && (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" /> Midiendo…
        </div>
      )}

      {coste && (
        <div className="mt-5 space-y-5">
          {/* La cifra que importa: la plata. */}
          <div className="rounded-xl border border-border bg-background px-4 py-3.5">
            <p className="text-[11px] text-muted-foreground">
              Costo estimado de esta asamblea con {coste.simuladoCon} personas
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {coste.costo.total}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {coste.totalTransferido} transferidos ({coste.costo.transferencia})
              + {coste.totalLlamadas.toLocaleString("es-CO")} llamadas a
              funciones ({coste.costo.llamadas}). Equivale al{" "}
              {coste.porcentajeDelPlanMensual}% de los 50 GB mensuales que
              incluye el plan. Cambio usado: {coste.precios.cambio}.
            </p>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <Cifra
              etiqueta="Conectados ahora"
              valor={String(coste.conectadosAhora)}
            />
            <Cifra
              etiqueta="Unidades del conjunto"
              valor={String(coste.unidades)}
            />
            <Cifra
              etiqueta="Peso de todo lo suscrito"
              valor={coste.pesoTodasLasConsultas}
            />
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              Lo que cuesta cada cosa que pasa, con {coste.simuladoCon} personas
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted-foreground">
                    <th className="pb-1.5 pr-3 font-medium">Evento</th>
                    <th className="pb-1.5 pr-3 text-right font-medium">
                      Cada vez
                    </th>
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
                        {e.veces.toLocaleString("es-CO")}
                      </td>
                      <td className="py-2 text-right font-mono font-medium text-foreground">
                        {e.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
              Los pesos están medidos; las <em>veces</em> son el supuesto
              (30 puntos de orden del día, una votación por persona, dos
              entradas/salidas por persona). Después de la próxima asamblea se
              ajustan con lo que pase de verdad.
            </p>
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
                      {c.creceConGente ? " — engorda con la gente" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {c.peso}
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

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{etiqueta}</p>
      <p className="text-base font-medium text-foreground">{valor}</p>
    </div>
  );
}
