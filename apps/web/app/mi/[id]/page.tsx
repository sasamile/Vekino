"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  CreditCard,
  PiggyBank,
  CalendarCheck,
  MessageSquareWarning,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Download,
  Clock,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cop, cn } from "@/lib/utils";
import { ESTADO_FACTURA, fechaLarga, fechaISO } from "@/components/portal/portal-ui";

const FECHA_MIN = 946684800000;

type Factura = {
  _id: Id<"facturas">;
  numeroFactura: string;
  periodoLabel: string;
  estado: "pendiente" | "pagada" | "vencida" | "abonada";
  totalAPagar: number;
  totalConDescuento?: number;
  saldoAFavor: number;
  fechaVencimiento: number;
  pdfUrl?: string;
};

export default function PortalInicio() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;

  const home = useQuery(api.portal.home, { condominioId });
  const facturas = useQuery(api.facturas.listMia, { condominioId }) as
    | Factura[]
    | undefined;
  const actividades = useQuery(api.portal.misActividades, { condominioId });

  if (home === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }
  if (!home.allowed) return null;

  const base = `/mi/${condominioId}`;
  const primerNombre = home.userName.split(" ")[0] ?? home.userName;
  const unidadPrincipal = home.unidades[0] ?? null;

  const lista = facturas ?? [];
  const conDeuda = lista.filter((f) => f.estado !== "pagada");
  const vencidas = lista.filter((f) => f.estado === "vencida");
  const tieneVencidas = vencidas.length > 0;
  const tienePendientes = conDeuda.length > 0;
  const estaAlDia = !tienePendientes;

  // Deuda actual = la factura MÁS RECIENTE sin pagar. Su total ya consolida el
  // saldo anterior (los meses viejos se arrastran vía "saldoAnterior"), así que
  // ese es el saldo real a pagar — no la suma de facturas viejas.
  const proximoPago = [...conDeuda].sort(
    (a, b) => b.fechaVencimiento - a.fechaVencimiento,
  )[0];
  const saldoAFavor = lista.reduce((s, f) => Math.max(s, f.saldoAFavor), 0);

  const saludo = getSaludo();

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-linear-to-r from-primary/90 via-primary/70 to-primary/40 p-6 text-white shadow-lg md:p-8">
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/90">
              {saludo}
            </p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">
              Hola, {primerNombre}!
            </h1>
            <p className="text-sm font-medium text-white/90 md:text-base">
              {home.condominio.name}
              {unidadPrincipal ? <> · {unidadPrincipal.numero}</> : null}
            </p>
          </div>
        </div>
      </div>

      {/* Estado de facturas */}
      {facturas === undefined ? (
        <Card className="p-6">
          <Spinner className="mx-auto h-5 w-5" />
        </Card>
      ) : (
        <EstadoFacturas
          base={base}
          estaAlDia={estaAlDia}
          tieneVencidas={tieneVencidas}
          conteo={tieneVencidas ? vencidas.length : conDeuda.length}
        />
      )}

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          color="emerald"
          icon={CreditCard}
          title="Próximo pago"
          value={proximoPago ? cop(proximoPago.totalAPagar) : cop(0)}
          sub={
            proximoPago && proximoPago.fechaVencimiento > FECHA_MIN
              ? `Vence: ${fechaLarga(proximoPago.fechaVencimiento)}`
              : "Estás al día"
          }
        />
        <StatCard
          color="sky"
          icon={PiggyBank}
          title="Saldo a favor"
          value={cop(saldoAFavor)}
          sub={saldoAFavor > 0 ? "A favor de tu unidad" : "Sin saldo a favor"}
        />
        <StatCard
          color="indigo"
          icon={CalendarCheck}
          title="Reservas activas"
          value={String(actividades?.reservasActivas.length ?? 0)}
          sub="Zonas comunes"
        />
        <StatCard
          color="amber"
          icon={MessageSquareWarning}
          title="PQRS abiertos"
          value={String(actividades?.ticketsAbiertos ?? 0)}
          sub="Peticiones y reclamos"
        />
      </div>

      {/* Reservas + Historial */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Reservas activas */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Reservas activas</CardTitle>
              <CardDescription>Próximas reservas confirmadas</CardDescription>
            </div>
            <Link
              href={`${base}/reservas`}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              Ver todas <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {!actividades ? (
              <Spinner className="mx-auto h-5 w-5" />
            ) : actividades.reservasActivas.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CalendarCheck className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No tienes reservas activas
                </p>
              </div>
            ) : (
              actividades.reservasActivas.slice(0, 3).map((r) => (
                <div
                  key={r._id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {r.zonaNombre}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fechaISO(r.fecha)} · {r.horaInicio}–{r.horaFin}
                    </p>
                  </div>
                  <Badge tone={r.estado === "aprobada" ? "success" : "warning"}>
                    {r.estado === "aprobada" ? "Aprobada" : "Pendiente"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Historial de pagos */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Historial de pagos</CardTitle>
              <CardDescription>Últimas facturas y pagos</CardDescription>
            </div>
            <Link
              href={`${base}/cuenta`}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              Ver todo <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {facturas === undefined ? (
              <Spinner className="mx-auto h-5 w-5" />
            ) : lista.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Aún no tienes facturas.
              </div>
            ) : (
              lista.slice(0, 5).map((f) => {
                const meta = ESTADO_FACTURA[f.estado];
                return (
                  <div
                    key={f._id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        Cuenta de {f.periodoLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {f.fechaVencimiento > FECHA_MIN
                          ? `Vence: ${fechaLarga(f.fechaVencimiento)}`
                          : f.numeroFactura}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-foreground">
                          {cop(f.totalAPagar)}
                        </p>
                        {meta && (
                          <Badge tone={meta.tone} className="mt-0.5">
                            {meta.label}
                          </Badge>
                        )}
                      </div>
                      {f.pdfUrl && (
                        <a
                          href={f.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Descargar factura"
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EstadoFacturas({
  base,
  estaAlDia,
  tieneVencidas,
  conteo,
}: {
  base: string;
  estaAlDia: boolean;
  tieneVencidas: boolean;
  conteo: number;
}) {
  const tone = estaAlDia ? "green" : tieneVencidas ? "red" : "orange";
  const titulo = estaAlDia
    ? "Estás al día"
    : tieneVencidas
      ? "Tienes facturas vencidas"
      : "Tienes facturas pendientes";
  const sub = estaAlDia
    ? "No tienes pagos pendientes."
    : `${conteo} factura${conteo !== 1 ? "s" : ""} por pagar.`;

  const styles = {
    green: {
      card: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/10",
      icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
      title: "text-emerald-700 dark:text-emerald-400",
      btn: "bg-emerald-600 text-white hover:bg-emerald-700",
    },
    red: {
      card: "border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/10",
      icon: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
      title: "text-red-700 dark:text-red-400",
      btn: "bg-red-600 text-white hover:bg-red-700",
    },
    orange: {
      card: "border-orange-200 bg-orange-50/60 dark:border-orange-900/40 dark:bg-orange-950/10",
      icon: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
      title: "text-orange-700 dark:text-orange-400",
      btn: "bg-orange-600 text-white hover:bg-orange-700",
    },
  }[tone];

  const Icon = estaAlDia ? CheckCircle2 : tieneVencidas ? AlertCircle : Clock;

  return (
    <Card className={cn("shadow-sm", styles.card)}>
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-sm",
              styles.icon,
            )}
          >
            <Icon className="h-7 w-7" />
          </div>
          <div>
            <p className={cn("text-lg font-bold", styles.title)}>{titulo}</p>
            <p className="text-sm text-muted-foreground">{sub}</p>
          </div>
        </div>
        <Link
          href={`${base}/cuenta`}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold shadow-sm transition-colors",
            styles.btn,
          )}
        >
          Ver mis pagos
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

const STAT_COLORS = {
  emerald: {
    card: "from-emerald-500/10 border-emerald-200/60 dark:border-emerald-900/40",
    title: "text-emerald-700 dark:text-emerald-400",
    chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-400",
  },
  sky: {
    card: "from-sky-500/10 border-sky-200/60 dark:border-sky-900/40",
    title: "text-sky-700 dark:text-sky-400",
    chip: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400",
    value: "text-sky-700 dark:text-sky-400",
  },
  indigo: {
    card: "from-indigo-500/10 border-indigo-200/60 dark:border-indigo-900/40",
    title: "text-indigo-700 dark:text-indigo-400",
    chip: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
    value: "text-indigo-700 dark:text-indigo-400",
  },
  amber: {
    card: "from-amber-500/10 border-amber-200/60 dark:border-amber-900/40",
    title: "text-amber-700 dark:text-amber-400",
    chip: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    value: "text-amber-700 dark:text-amber-400",
  },
} as const;

function StatCard({
  color,
  icon: Icon,
  title,
  value,
  sub,
}: {
  color: keyof typeof STAT_COLORS;
  icon: typeof CreditCard;
  title: string;
  value: string;
  sub: string;
}) {
  const s = STAT_COLORS[color];
  return (
    <Card
      className={cn(
        "bg-linear-to-br to-card via-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        s.card,
      )}
    >
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className={cn("text-sm font-medium", s.title)}>{title}</CardTitle>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", s.chip)}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold tabular-nums", s.value)}>{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function getSaludo(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}
