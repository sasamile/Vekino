"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Activity, Info, Users } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Spinner } from "@/components/ui/spinner";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CosteSalaPanel } from "@/components/dashboard/coste-sala-panel";

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const NOMBRE_MODULO: Record<string, string> = {
  app: "Abrir la app",
  pagos: "Pagos y comprobantes",
  facturas: "Facturas",
  asamblea: "Asambleas y votación",
  reservas: "Reservas de zonas",
  comunicados: "Comunicados",
  soporte: "Soporte / PQRS",
  whatsapp: "WhatsApp",
};

/** "2026-08-07" → Date local sin corrimiento de zona. */
function aFecha(dia: string): Date {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function fechaLarga(dia: string): string {
  const f = aFecha(dia);
  return `${f.getDate()} de ${MESES_CORTOS[f.getMonth()]}. de ${f.getFullYear()}`;
}

/**
 * Panel de uso de la plataforma.
 *
 * Responde una sola pregunta: ¿la gente está usando esto, y para qué? Es
 * deliberadamente honesto — si un módulo no se usa, el panel lo muestra
 * vacío en vez de maquillarlo, porque ese vacío es justo el dato que sirve
 * para decidir qué construir después.
 */
export default function UsoPage() {
  const [condominioId, setCondominioId] = useState<Id<"condominios"> | "">("");
  const condos = useQuery(api.automatizaciones.condominiosConAsambleas);
  const datos = useQuery(api.uso.panel, {
    condominioId: condominioId || undefined,
    dias: 365,
  });

  /* El mapa se dibuja por SEMANAS, como el de GitHub: cada columna es una
   * semana y cada fila un día. Hay que rellenar los días sin actividad —si
   * solo se pintaran los que tienen datos, el calendario quedaría corrido. */
  const semanas = useMemo(() => {
    if (!datos) return [];
    const porDia = new Map(datos.mapa.map((d) => [d.dia, d]));

    const fin = aFecha(datos.hasta);
    const inicio = new Date(fin);
    inicio.setDate(inicio.getDate() - 364);
    // Se retrocede al domingo para que las filas cuadren con los días.
    inicio.setDate(inicio.getDate() - inicio.getDay());

    const cols: Array<Array<{ dia: string; usuarios: number; acciones: number } | null>> = [];
    const cursor = new Date(inicio);
    while (cursor <= fin) {
      const col: Array<{ dia: string; usuarios: number; acciones: number } | null> = [];
      for (let i = 0; i < 7; i++) {
        if (cursor > fin) {
          col.push(null);
        } else {
          const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
          col.push(porDia.get(iso) ?? { dia: iso, usuarios: 0, acciones: 0 });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(col);
    }
    return cols;
  }, [datos]);

  const maxUsuarios = useMemo(
    () => Math.max(1, ...(datos?.mapa ?? []).map((d) => d.usuarios)),
    [datos],
  );

  function intensidad(usuarios: number): string {
    if (usuarios === 0) return "bg-muted/60";
    const r = usuarios / maxUsuarios;
    if (r <= 0.25) return "bg-emerald-200 dark:bg-emerald-900";
    if (r <= 0.5) return "bg-emerald-300 dark:bg-emerald-700";
    if (r <= 0.75) return "bg-emerald-400 dark:bg-emerald-600";
    return "bg-emerald-500 dark:bg-emerald-400";
  }

  if (datos === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  const totalAcciones = datos.mapa.reduce((n, d) => n + d.acciones, 0);
  const pctEntraron =
    datos.totalUsuarios > 0
      ? Math.round((datos.hanEntradoAlgunaVez / datos.totalUsuarios) * 100)
      : 0;
  const pctActivos =
    datos.totalUsuarios > 0
      ? Math.round((datos.activosEnPeriodo / datos.totalUsuarios) * 100)
      : 0;

  return (
    <div className="px-4 py-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Uso de la plataforma
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quién la abre, cada cuánto y para qué. Sirve para decidir qué
            construir después.
          </p>
        </div>
        <Select
          value={condominioId}
          onChange={(e) =>
            setCondominioId(e.target.value as Id<"condominios"> | "")
          }
          className="w-full sm:w-64"
        >
          <option value="">Todos los condominios</option>
          {(condos ?? []).map((c) => (
            <option key={c.condominioId} value={c.condominioId}>
              {c.condominioNombre}
            </option>
          ))}
        </Select>
      </div>

      {/* ── Cifras de cabecera ── */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Tarjeta
          icono={Users}
          valor={`${datos.hanEntradoAlgunaVez} de ${datos.totalUsuarios}`}
          etiqueta="han entrado alguna vez"
          pie={`${pctEntraron}% de las cuentas activas`}
        />
        <Tarjeta
          icono={Activity}
          valor={String(datos.activosEnPeriodo)}
          etiqueta="personas activas en el último año"
          pie={`${pctActivos}% de las cuentas activas`}
        />
        <Tarjeta
          icono={Activity}
          valor={String(totalAcciones)}
          etiqueta="acciones registradas"
          pie="pagos, votos, reservas, poderes, soporte"
        />
      </div>

      {/* ── Advertencia honesta sobre el dato ── */}
      {!datos.midiendoDesde && (
        <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            La medición de <strong>aperturas de la app</strong> arranca desde
            hoy: antes no se guardaba en ninguna parte. Lo que ves ahora está
            reconstruido de las acciones que sí dejaban rastro (pagos, votos,
            reservas, poderes, soporte), así que subestima el uso real. En unos
            días el mapa empieza a contar la historia completa.
          </p>
        </div>
      )}

      {/* ── Mapa de calor ── */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Actividad del último año
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cada cuadro es un día. Más verde, más personas distintas ese día.
        </p>

        <div className="mt-4 overflow-x-auto pb-2">
          <div className="flex gap-[3px]">
            {semanas.map((col, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {col.map((d, j) =>
                  d ? (
                    <div
                      key={d.dia}
                      title={
                        d.usuarios === 0
                          ? `${fechaLarga(d.dia)}: sin actividad`
                          : `${fechaLarga(d.dia)}: ${d.usuarios} persona${d.usuarios === 1 ? "" : "s"}, ${d.acciones} acción${d.acciones === 1 ? "" : "es"}`
                      }
                      className={cn(
                        "h-[11px] w-[11px] rounded-[2px]",
                        intensidad(d.usuarios),
                      )}
                    />
                  ) : (
                    <div key={`v-${j}`} className="h-[11px] w-[11px]" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
          <span>Menos</span>
          <div className="h-[11px] w-[11px] rounded-[2px] bg-muted/60" />
          <div className="h-[11px] w-[11px] rounded-[2px] bg-emerald-200 dark:bg-emerald-900" />
          <div className="h-[11px] w-[11px] rounded-[2px] bg-emerald-300 dark:bg-emerald-700" />
          <div className="h-[11px] w-[11px] rounded-[2px] bg-emerald-400 dark:bg-emerald-600" />
          <div className="h-[11px] w-[11px] rounded-[2px] bg-emerald-500 dark:bg-emerald-400" />
          <span>Más</span>
        </div>
      </section>

      {/* ── Qué usan ── */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Qué usan de verdad
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Personas distintas que tocaron cada módulo en el último año.
        </p>

        {datos.modulos.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Todavía no hay actividad registrada en este período.
          </p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {datos.modulos.map((m) => {
              const pct = Math.round(
                (m.usuarios / Math.max(1, datos.modulos[0]?.usuarios ?? 1)) * 100,
              );
              return (
                <div key={m.modulo} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 truncate text-xs text-foreground">
                    {NOMBRE_MODULO[m.modulo] ?? m.modulo}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {m.usuarios} pers. · {m.acciones}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Activos por mes ── */}
      {datos.meses.length > 0 && (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Personas activas por mes
          </h2>
          <div className="mt-4 flex items-end gap-1.5 overflow-x-auto pb-1">
            {datos.meses.map((m) => {
              const max = Math.max(...datos.meses.map((x) => x.usuarios), 1);
              const alto = Math.max(4, Math.round((m.usuarios / max) * 120));
              const [y, mm] = m.mes.split("-").map(Number);
              return (
                <div
                  key={m.mes}
                  className="flex min-w-9 flex-1 flex-col items-center gap-1"
                  title={`${m.usuarios} personas`}
                >
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {m.usuarios}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-emerald-500 dark:bg-emerald-400"
                    style={{ height: `${alto}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {MESES_CORTOS[(mm ?? 1) - 1]}
                    {mm === 1 ? ` ${String(y).slice(2)}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <CosteSalaPanel />
    </div>
  );
}

function Tarjeta({
  icono: Icono,
  valor,
  etiqueta,
  pie,
}: {
  icono: typeof Users;
  valor: string;
  etiqueta: string;
  pie: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icono className="h-4 w-4" aria-hidden />
        <span className="text-xs">{etiqueta}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{pie}</p>
    </div>
  );
}
