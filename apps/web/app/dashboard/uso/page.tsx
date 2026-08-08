"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Activity, Info, Users } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Spinner } from "@/components/ui/spinner";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const DIAS_SEM = ["D", "L", "M", "X", "J", "V", "S"];

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

type Periodo = 28 | 90 | 365;

/** "2026-08-07" → Date local sin corrimiento de zona. */
function aFecha(dia: string): Date {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function fechaLarga(dia: string): string {
  const f = aFecha(dia);
  return `${f.getDate()} de ${MESES_CORTOS[f.getMonth()]}. de ${f.getFullYear()}`;
}

function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const [periodo, setPeriodo] = useState<Periodo>(90);
  const condos = useQuery(api.automatizaciones.condominiosConAsambleas);
  const datos = useQuery(api.uso.panel, {
    condominioId: condominioId || undefined,
    dias: periodo,
  });

  /* El mapa se dibuja por SEMANAS, como el de GitHub: cada columna es una
   * semana y cada fila un día. Hay que rellenar los días sin actividad —si
   * solo se pintaran los que tienen datos, el calendario quedaría corrido. */
  const { semanas, etiquetasMes } = useMemo(() => {
    if (!datos) return { semanas: [] as Array<Array<{ dia: string; usuarios: number; acciones: number } | null>>, etiquetasMes: [] as { i: number; label: string }[] };
    const porDia = new Map(datos.mapa.map((d) => [d.dia, d]));

    const fin = aFecha(datos.hasta);
    const inicio = new Date(fin);
    inicio.setDate(inicio.getDate() - (periodo - 1));
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
          const iso = isoLocal(cursor);
          col.push(porDia.get(iso) ?? { dia: iso, usuarios: 0, acciones: 0 });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(col);
    }

    const etiquetas: { i: number; label: string }[] = [];
    let mesPrev = -1;
    cols.forEach((col, i) => {
      const primer = col.find((d) => d != null);
      if (!primer) return;
      const mes = aFecha(primer.dia).getMonth();
      if (mes !== mesPrev) {
        etiquetas.push({ i, label: MESES_CORTOS[mes]! });
        mesPrev = mes;
      }
    });

    return { semanas: cols, etiquetasMes: etiquetas };
  }, [datos, periodo]);

  const maxUsuarios = useMemo(
    () => Math.max(1, ...(datos?.mapa ?? []).map((d) => d.usuarios)),
    [datos],
  );

  const diasConActividad = useMemo(
    () => (datos?.mapa ?? []).filter((d) => d.usuarios > 0).length,
    [datos],
  );

  function intensidad(usuarios: number): string {
    if (usuarios === 0) return "bg-muted/70";
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
  const baseModulos = Math.max(1, datos.activosEnPeriodo);

  return (
    <div className="w-full px-4 py-6 sm:px-7">
      <div className="flex w-full flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Uso de la plataforma
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quién la abre, cada cuánto y para qué.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <div className="inline-flex rounded-xl bg-muted p-1">
            {(
              [
                [28, "4 sem."],
                [90, "3 meses"],
                [365, "Año"],
              ] as const
            ).map(([dias, label]) => (
              <button
                key={dias}
                type="button"
                onClick={() => setPeriodo(dias)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  periodo === dias
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Select
            value={condominioId}
            onChange={(e) =>
              setCondominioId(e.target.value as Id<"condominios"> | "")
            }
            className="w-full sm:w-56"
          >
            <option value="">Todos los condominios</option>
            {(condos ?? []).map((c) => (
              <option key={c.condominioId} value={c.condominioId}>
                {c.condominioNombre}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-6 grid w-full gap-3 sm:grid-cols-3">
        <Tarjeta
          icono={Users}
          valor={`${datos.hanEntradoAlgunaVez} de ${datos.totalUsuarios}`}
          etiqueta="han entrado alguna vez"
          pie={`${pctEntraron}% de las cuentas activas`}
        />
        <Tarjeta
          icono={Activity}
          valor={String(datos.activosEnPeriodo)}
          etiqueta={
            periodo === 28
              ? "activas en 4 semanas"
              : periodo === 90
                ? "activas en 3 meses"
                : "activas en el último año"
          }
          pie={`${pctActivos}% de las cuentas activas`}
        />
        <Tarjeta
          icono={Activity}
          valor={String(totalAcciones)}
          etiqueta="acciones registradas"
          pie="pagos, votos, reservas, poderes, soporte"
        />
      </div>

      {!datos.midiendoDesde && (
        <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            La medición de <strong>aperturas de la app</strong> arranca desde
            hoy. Lo histórico se reconstruye de acciones con rastro (pagos,
            votos, reservas…), así que subestima el uso real. Conviene mirar{" "}
            <strong>4 semanas</strong> o <strong>3 meses</strong> mientras se
            llena el dato.
          </p>
        </div>
      )}

      <div className="mt-6 grid w-full gap-4 lg:grid-cols-5">
        {/* ── Mapa de calor ── */}
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 lg:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Actividad por día
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Más verde = más personas distintas ese día.
              </p>
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              {diasConActividad} día{diasConActividad === 1 ? "" : "s"} con
              actividad
            </p>
          </div>

          {diasConActividad === 0 ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Aún no hay actividad en este período.
            </p>
          ) : (
            <div className="mt-4 w-full">
              <div
                className="mb-1 grid gap-[3px]"
                style={{
                  gridTemplateColumns: `auto repeat(${semanas.length}, minmax(0, 1fr))`,
                }}
              >
                <div />
                {semanas.map((_, i) => {
                  const et = etiquetasMes.find((e) => e.i === i);
                  return (
                    <div
                      key={`m-${i}`}
                      className="truncate text-[10px] text-muted-foreground"
                    >
                      {et?.label ?? ""}
                    </div>
                  );
                })}
              </div>
              <div
                className="grid gap-[3px]"
                style={{
                  gridTemplateColumns: `auto repeat(${semanas.length}, minmax(0, 1fr))`,
                }}
              >
                {DIAS_SEM.map((label, row) => (
                  <div key={label} className="contents">
                    <span className="pr-1.5 text-[10px] leading-[14px] text-muted-foreground">
                      {row % 2 === 1 ? label : ""}
                    </span>
                    {semanas.map((col, ci) => {
                      const d = col[row];
                      if (!d) {
                        return <div key={`v-${ci}-${row}`} className="aspect-square" />;
                      }
                      return (
                        <div
                          key={d.dia}
                          title={
                            d.usuarios === 0
                              ? `${fechaLarga(d.dia)}: sin actividad`
                              : `${fechaLarga(d.dia)}: ${d.usuarios} persona${d.usuarios === 1 ? "" : "s"}, ${d.acciones} acción${d.acciones === 1 ? "" : "es"}`
                          }
                          className={cn(
                            "aspect-square min-h-[10px] w-full rounded-[3px]",
                            intensidad(d.usuarios),
                          )}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                <span>Menos</span>
                <div className="h-2.5 w-2.5 rounded-[2px] bg-muted/70" />
                <div className="h-2.5 w-2.5 rounded-[2px] bg-emerald-200 dark:bg-emerald-900" />
                <div className="h-2.5 w-2.5 rounded-[2px] bg-emerald-300 dark:bg-emerald-700" />
                <div className="h-2.5 w-2.5 rounded-[2px] bg-emerald-400 dark:bg-emerald-600" />
                <div className="h-2.5 w-2.5 rounded-[2px] bg-emerald-500 dark:bg-emerald-400" />
                <span>Más</span>
              </div>
            </div>
          )}
        </section>

        {/* ── Qué usan ── */}
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">
            Qué usan de verdad
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            % de las {datos.activosEnPeriodo} personas activas del período.
          </p>

          {datos.modulos.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Todavía no hay actividad registrada.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {datos.modulos.map((m) => {
                const pct = Math.round((m.usuarios / baseModulos) * 100);
                return (
                  <li key={m.modulo}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {NOMBRE_MODULO[m.modulo] ?? m.modulo}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {m.usuarios}
                        </span>{" "}
                        · {pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width] dark:bg-emerald-400"
                        style={{ width: `${Math.max(pct, m.usuarios > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {m.acciones} acción{m.acciones === 1 ? "" : "es"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {datos.meses.length > 0 && (
        <section className="mt-4 w-full rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Personas activas por mes
          </h2>
          <div className="mt-4 flex h-40 items-end gap-1.5 sm:gap-2">
            {datos.meses.map((m) => {
              const max = Math.max(...datos.meses.map((x) => x.usuarios), 1);
              const alto = Math.max(
                m.usuarios > 0 ? 8 : 2,
                Math.round((m.usuarios / max) * 100),
              );
              const [y, mm] = m.mes.split("-").map(Number);
              return (
                <div
                  key={m.mes}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  title={`${m.usuarios} personas`}
                >
                  <span className="text-[10px] font-medium tabular-nums text-foreground">
                    {m.usuarios || ""}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={cn(
                        "w-full rounded-t-md",
                        m.usuarios > 0
                          ? "bg-emerald-500 dark:bg-emerald-400"
                          : "bg-muted",
                      )}
                      style={{ height: `${alto}%` }}
                    />
                  </div>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {MESES_CORTOS[(mm ?? 1) - 1]}
                    {mm === 1 ? ` ${String(y).slice(2)}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
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
