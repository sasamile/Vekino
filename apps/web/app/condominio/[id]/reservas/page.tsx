"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import {
  CalendarCheck, Plus, Pencil, Trash2, Loader2, CheckCircle, XCircle,
  Settings, MapPin, Clock, FileSpreadsheet, ChevronRight,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useTopbarActions } from "@/components/layout/admin-topbar-context";
import { useNuevoQuery } from "@/hooks/use-nuevo-query";
import { StatCard } from "@/components/layout/stat-card";
import { Select, Input, Textarea } from "@/components/ui/input";
import { TableCard, Table, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, cop } from "@/lib/utils";
import {
  CrearEspacioModal,
  type ZonaEditable,
} from "@/components/reservas/crear-espacio-modal";
import { ReporteReservasModal } from "@/components/reservas/reporte-reservas";
import { EstadoCuentaModal } from "@/components/reservas/estado-cuenta-modal";

const PAGE_SIZE = 30;

type Estado = "pendiente" | "aprobada" | "rechazada" | "cancelada";

const ESTADO_TONE: Record<Estado, React.ComponentProps<typeof Badge>["tone"]> = {
  pendiente: "warning", aprobada: "success", rechazada: "destructive", cancelada: "neutral",
};
const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada", cancelada: "Cancelada",
};

/**
 * Cómo se lee la cartera de la unidad en esta tabla.
 *
 * "Sin facturas" no es "Al día": en un conjunto al que todavía no le han
 * cargado la cartera, decir que la casa está al día sería afirmar algo que
 * nadie ha comprobado.
 *
 * "Con saldo" tampoco es ninguno de los dos: la casa debe de meses viejos
 * pero cubrió el último período que venció. Ponerle "Al día" escondería la
 * deuda; ponerle "En mora" negaría que está pagando.
 *
 * Es información, no una decisión: aprobar o rechazar sigue siendo de quien
 * administra, que es el único que sabe si hay un acuerdo de pago de por medio.
 */
type CarteraFila = FunctionReturnType<typeof api.facturas.carteraPorUnidad>[number];
type EstadoCartera = CarteraFila["estado"];

const CARTERA_TONE: Record<EstadoCartera, React.ComponentProps<typeof Badge>["tone"]> = {
  sin_facturas: "neutral",
  al_dia: "success",
  pendiente: "warning",
  con_saldo: "info",
  en_mora: "destructive",
};
const CARTERA_LABEL: Record<EstadoCartera, string> = {
  sin_facturas: "Sin facturas",
  al_dia: "Al día",
  pendiente: "Por vencer",
  con_saldo: "Con saldo anterior",
  en_mora: "En mora",
};
const CARTERA_HINT: Record<EstadoCartera, string> = {
  sin_facturas: "La unidad no tiene facturas cargadas.",
  al_dia: "Sin facturas pendientes.",
  pendiente: "Debe, pero la factura aún no se vence.",
  con_saldo: "Arrastra deuda de meses anteriores, pero cubrió el último período vencido.",
  en_mora: "El último período vencido sigue sin pago ni abono.",
};

function fmtFecha(s: string) {
  const parts = s.split("-");
  const y = Number(parts[0] ?? 2026);
  const m = Number(parts[1] ?? 1);
  const d = Number(parts[2] ?? 1);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
}

type ReservaRow = {
  _id: Id<"reservas">;
  zonaId: Id<"zonasComunes">;
  unidadId: Id<"unidades">;
  zonaNombre: string;
  unidadNumero: string;
  solicitanteNombre: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estado: string;
};

type ZonaRow = {
  _id: Id<"zonasComunes">;
  nombre: string;
  tipo?: string;
  unidadTiempo?: string;
  precioPorHora?: number;
  precioPorDia?: number;
  capacidad?: number;
  descripcion?: string;
  horariosPorDia?: { dia: number; horaInicio: string; horaFin: string }[];
  requiereAprobacion?: boolean;
  activa: boolean;
};

export default function ReservasPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const zonas = useQuery(api.reservas.listZonas, { condominioId });
  const unidades = useQuery(api.unidades.listByCondominio, { condominioId });
  const counts = useQuery(api.reservas.countsByCondominio, { condominioId });

  const [estadoFiltro, setEstadoFiltro] = useState<"" | Estado>("");
  const [zonaFiltro, setZonaFiltro] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [zonasOpen, setZonasOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Id<"reservas"> | null>(null);
  /* Sólo el id y el número: el detalle lo pide el modal al montarse, no esta
   * página. La tabla se queda con el resumen. */
  const [cuentaAbierta, setCuentaAbierta] = useState<
    { unidadId: Id<"unidades">; unidadNumero: string } | null
  >(null);
  const updateEstado = useMutation(api.reservas.updateEstado);

  const { results, status, loadMore } = usePaginatedQuery(
    api.reservas.listPage,
    {
      condominioId,
      estado: estadoFiltro || undefined,
      zonaId: zonaFiltro ? (zonaFiltro as Id<"zonasComunes">) : undefined,
    },
    { initialNumItems: PAGE_SIZE },
  );

  const [reporteAbierto, setReporteAbierto] = useState(false);
  const loading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";
  const reservas = results as ReservaRow[];
  const hasFilters = Boolean(estadoFiltro || zonaFiltro);

  /* La cartera se pide UNA vez para todas las unidades de la página, no una
   * por fila: treinta reservas suelen ser doce casas, y preguntar por cada
   * fila serían treinta consultas para doce respuestas. */
  const unidadIds = useMemo(
    () => [...new Set(reservas.map((r) => r.unidadId))],
    [reservas],
  );
  const cartera = useQuery(
    api.facturas.carteraPorUnidad,
    unidadIds.length > 0 ? { condominioId, unidadIds } : "skip",
  );
  const carteraMap = useMemo(
    () => new Map((cartera ?? []).map((c) => [c.unidadId, c])),
    [cartera],
  );

  async function cambiarEstado(id: Id<"reservas">, estado: Estado) {
    await updateEstado({ id, estado });
  }

  const sinZonasActivas = (zonas ?? []).filter((z) => z.activa).length === 0;
  useNuevoQuery(() => {
    if (!sinZonasActivas) setFormOpen(true);
  });
  useTopbarActions(
    <>
      <Button variant="outline" onClick={() => setZonasOpen(true)}>
        <Settings className="h-4 w-4" />
        Zonas
      </Button>
      <Button variant="brand" onClick={() => setFormOpen(true)} disabled={sinZonasActivas}>
        <Plus className="h-3.75 w-3.75" aria-hidden />
        Nueva reserva
      </Button>
    </>,
    [sinZonasActivas],
  );

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Reservas"
          description="Reservas de zonas comunes del conjunto"
          action={
            <Button variant="outline" size="sm" onClick={() => setReporteAbierto(true)}>
              <FileSpreadsheet className="h-4 w-4" /> Reporte
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={CalendarCheck} label="Total reservas" value={counts?.total ?? 0} tone="neutral" />
          <StatCard icon={Clock} label="Pendientes" value={counts?.pendiente ?? 0} tone="warning" />
          <StatCard icon={CheckCircle} label="Aprobadas" value={counts?.aprobada ?? 0} tone="success" />
          <StatCard icon={XCircle} label="Rechazadas" value={counts?.rechazada ?? 0} tone="destructive" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? "Cargando…" : `${reservas.length} reserva${reservas.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex gap-2">
            <Select value={zonaFiltro} onChange={(e) => setZonaFiltro(e.target.value)} className="w-44">
              <option value="">Todas las zonas</option>
              {(zonas ?? []).map((z) => (
                <option key={z._id} value={z._id}>{z.nombre}</option>
              ))}
            </Select>
            <Select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as "" | Estado)} className="w-36">
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="aprobada">Aprobada</option>
              <option value="rechazada">Rechazada</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : reservas.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={hasFilters ? "Sin resultados" : (zonas ?? []).length === 0 ? "Sin zonas comunes" : "Sin reservas"}
            description={
              hasFilters
                ? "Ninguna reserva coincide con los filtros."
                : (zonas ?? []).length === 0
                ? "Primero crea las zonas comunes desde el botón Zonas."
                : "Crea la primera reserva de una zona común."
            }
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={() => { setEstadoFiltro(""); setZonaFiltro(""); }}>
                  Limpiar filtros
                </Button>
              ) : (zonas ?? []).length === 0 ? (
                <Button size="sm" onClick={() => setZonasOpen(true)}>
                  <MapPin className="h-4 w-4" />Crear espacio
                </Button>
              ) : (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" />Nueva reserva
                </Button>
              )
            }
          />
        ) : (
          <>
            <TableCard>
              <Table>
                <THead>
                  <TR>
                    <TH>Zona</TH>
                    <TH>Fecha / Horario</TH>
                    <TH>Unidad</TH>
                    <TH>Solicitante</TH>
                    <TH>Estado</TH>
                    <TH>Estado de pago</TH>
                    <TH className="text-right">Días de mora</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {reservas.map((r) => (
                    <TR key={r._id}>
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-brand" />
                          <span className="text-sm font-medium text-foreground">{r.zonaNombre}</span>
                        </div>
                      </TD>
                      <TD>
                        <div>
                          <p className="text-sm font-medium text-foreground">{fmtFecha(r.fecha)}</p>
                          <p className="text-xs text-muted-foreground">{r.horaInicio} – {r.horaFin}</p>
                        </div>
                      </TD>
                      <TD>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                          {r.unidadNumero}
                        </span>
                      </TD>
                      <TD>
                        <span className="text-sm text-foreground">{r.solicitanteNombre}</span>
                      </TD>
                      <TD>
                        <Badge tone={ESTADO_TONE[r.estado as Estado] ?? "neutral"}>
                          {ESTADO_LABEL[r.estado as Estado]}
                        </Badge>
                      </TD>
                      <CeldasCartera
                        cartera={carteraMap.get(r.unidadId)}
                        cargando={cartera === undefined}
                        onVerDetalle={() =>
                          setCuentaAbierta({
                            unidadId: r.unidadId,
                            unidadNumero: r.unidadNumero,
                          })
                        }
                      />
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          {r.estado === "pendiente" && (
                            <>
                              <button
                                onClick={() => cambiarEstado(r._id, "aprobada")}
                                title="Aprobar"
                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => cambiarEstado(r._id, "rechazada")}
                                title="Rechazar"
                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setDeleteTarget(r._id)}
                            aria-label="Eliminar"
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableCard>
            {canLoadMore || loadingMore ? (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => loadMore(PAGE_SIZE)}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Cargando…
                    </>
                  ) : (
                    "Cargar más"
                  )}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {formOpen && (
        <ReservaForm
          condominioId={condominioId}
          zonas={(zonas ?? []).filter((z) => z.activa)}
          unidades={unidades ?? []}
          onClose={() => setFormOpen(false)}
        />
      )}
      {zonasOpen && (
        <ZonasModal condominioId={condominioId} zonas={zonas ?? []} onClose={() => setZonasOpen(false)} />
      )}
      {deleteTarget && <DeleteDialog id={deleteTarget} onClose={() => setDeleteTarget(null)} />}
      {reporteAbierto && (
        <ReporteReservasModal condominioId={condominioId} onClose={() => setReporteAbierto(false)} />
      )}
      {cuentaAbierta && (
        <EstadoCuentaModal
          condominioId={condominioId}
          unidadId={cuentaAbierta.unidadId}
          unidadNumero={cuentaAbierta.unidadNumero}
          onClose={() => setCuentaAbierta(null)}
        />
      )}
    </PageContainer>
  );
}

/**
 * Estado de pago de la unidad y, si debe, desde cuándo.
 *
 * Dos celdas y no una: la administración lee la columna de días en diagonal
 * buscando el número grande, y un "En mora — 78 días" metido en la misma
 * celda que el resto obliga a leer frase por frase.
 *
 * El estado es un botón: el resumen dice CUÁNTO debe la casa, y lo siguiente
 * que se pregunta siempre es POR QUÉ. Se abre el estado de cuenta sin salir
 * de reservas ni perder la solicitud que se estaba mirando.
 *
 * Nada de esto bloquea la reserva. Una casa puede deber y tener un acuerdo de
 * pago; otra puede llevar dos meses y el conjunto decidir que no reserva.
 * Quien decide es quien administra, aquí solo se le dice lo que hay.
 */
function CeldasCartera({
  cartera,
  cargando,
  onVerDetalle,
}: {
  cartera?: CarteraFila;
  cargando: boolean;
  onVerDetalle: () => void;
}) {
  if (!cartera) {
    /* Sin fila hay dos motivos distintos y no se pueden pintar igual: que la
     * consulta siga en camino, o que la unidad se saliera del tope de la
     * consulta al cargar muchas páginas. Lo segundo no va a llegar nunca, y
     * si llegara, un esqueleto girando para siempre le diría a la
     * administración que espere algo que no viene. */
    if (!cargando) {
      return (
        <>
          <TD>
            <span className="text-sm text-muted-foreground" title="No se consultó la cartera de esta unidad.">
              Sin consultar
            </span>
          </TD>
          <TD className="text-right"><span className="text-sm text-muted-foreground">—</span></TD>
        </>
      );
    }
    return (
      <>
        <TD><Skeleton className="h-4 w-20" /></TD>
        <TD className="text-right"><Skeleton className="ml-auto h-4 w-10" /></TD>
      </>
    );
  }

  const { estado, diasMora, facturasPendientes: pendientes } = cartera;

  return (
    <>
      <TD>
        <button
          type="button"
          onClick={onVerDetalle}
          title={`${CARTERA_HINT[estado]} Ver el estado de cuenta.`}
          className="group -m-1 flex flex-col items-start rounded-lg p-1 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span className="flex items-center gap-1">
            <Badge tone={CARTERA_TONE[estado]}>{CARTERA_LABEL[estado]}</Badge>
            <ChevronRight
              className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
          <span className="mt-0.5 text-[11px] text-muted-foreground">
            {pendientes > 0
              ? `${pendientes} factura${pendientes === 1 ? "" : "s"} sin pagar`
              : "Ver estado de cuenta"}
          </span>
        </button>
      </TD>
      <TD className="text-right">
        {estado === "en_mora" ? (
          <span className="text-sm font-medium text-red-600 dark:text-red-400">
            {diasMora} {diasMora === 1 ? "día" : "días"}
          </span>
        ) : (
          /* Una casa al día no lleva "0 días de mora": no lleva ninguno. El
             guion se lee de un vistazo, el cero invita a compararlo. */
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TD>
    </>
  );
}

function ReservaForm({
  condominioId, zonas, unidades, onClose,
}: {
  condominioId: Id<"condominios">;
  zonas: ZonaRow[];
  unidades: { _id: Id<"unidades">; numero: string }[];
  onClose: () => void;
}) {
  const create = useMutation(api.reservas.create);
  const today = new Date().toISOString().slice(0, 10);

  const [zonaId, setZonaId] = useState(zonas[0]?._id ?? "");
  const [unidadId, setUnidadId] = useState("");
  const [fecha, setFecha] = useState(today);
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFin, setHoraFin] = useState("11:00");
  const [observaciones, setObservaciones] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = zonaId.length > 0 && unidadId.length > 0 && fecha.length > 0;
  const unidadesOrdenadas = [...unidades].sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }));

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await create({
        condominioId,
        zonaId: zonaId as Id<"zonasComunes">,
        unidadId: unidadId as Id<"unidades">,
        fecha,
        horaInicio,
        horaFin,
        observaciones: observaciones || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear la reserva.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nueva reserva"
      description="Reserva de zona común para una unidad"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear reserva
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Zona común</label>
            <Select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
              {zonas.map((z) => (
                <option key={z._id} value={z._id}>{z.nombre}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Unidad</label>
            <Select value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              <option value="">Seleccionar</option>
              {unidadesOrdenadas.map((u) => (
                <option key={u._id} value={u._id}>Unidad {u.numero}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Fecha</label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} min={today} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Hora inicio</label>
            <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Hora fin</label>
            <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Observaciones <span className="text-muted-foreground">(opcional)</span></label>
          <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Motivo o detalles…" rows={2} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function ZonasModal({ condominioId, zonas, onClose }: { condominioId: Id<"condominios">; zonas: ZonaRow[]; onClose: () => void }) {
  const toggleZona = useMutation(api.reservas.toggleZona);
  const removeZona = useMutation(api.reservas.removeZona);
  const [crearOpen, setCrearOpen] = useState(false);
  const [editando, setEditando] = useState<ZonaEditable | null>(null);

  const UNIDAD_LABEL: Record<string, string> = {
    hora: "Por hora",
    dia: "Por día",
    mes: "Por mes",
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Espacios comunes"
        description="Administra los espacios reservables del conjunto"
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cerrar
            </Button>
            <Button size="sm" onClick={() => setCrearOpen(true)}>
              <Plus className="h-4 w-4" />
              Nuevo espacio
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {zonas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aún no hay espacios. Crea el primero con “Nuevo espacio”.
            </p>
          ) : (
            zonas.map((z) => (
              <div
                key={z._id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      !z.activa && "text-muted-foreground line-through",
                    )}
                  >
                    {z.nombre}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      z.unidadTiempo
                        ? UNIDAD_LABEL[z.unidadTiempo] ?? z.unidadTiempo
                        : null,
                      z.capacidad ? `Cap. ${z.capacidad}` : null,
                      z.precioPorHora != null
                        ? `${cop(z.precioPorHora)}/h`
                        : null,
                      z.precioPorDia != null
                        ? `${cop(z.precioPorDia)}/día`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {z.horariosPorDia && z.horariosPorDia.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {z.horariosPorDia.length} día
                      {z.horariosPorDia.length === 1 ? "" : "s"} con horario
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleZona({ id: z._id })}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      z.activa
                        ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                    )}
                  >
                    {z.activa ? "Activa" : "Inactiva"}
                  </button>
                  {/* Editar antes que eliminar: hasta ahora, corregir un
                      horario obligaba a borrar la zona —y con ella su
                      historial de reservas— para volverla a crear. */}
                  <button
                    type="button"
                    onClick={() => setEditando(z as ZonaEditable)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeZona({ id: z._id })}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
      {crearOpen && (
        <CrearEspacioModal
          condominioId={condominioId}
          onClose={() => setCrearOpen(false)}
        />
      )}
      {editando && (
        <CrearEspacioModal
          condominioId={condominioId}
          zona={editando}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  );
}

function DeleteDialog({ id, onClose }: { id: Id<"reservas">; onClose: () => void }) {
  const remove = useMutation(api.reservas.remove);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try { await remove({ id }); onClose(); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Eliminar reserva" className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Eliminar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">La reserva se eliminará permanentemente.</p>
    </Modal>
  );
}
