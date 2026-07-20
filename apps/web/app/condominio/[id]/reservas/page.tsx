"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  CalendarCheck, Plus, Trash2, Loader2, CheckCircle, XCircle,
  Settings, MapPin, Clock,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Select, Input, Textarea } from "@/components/ui/input";
import { TableCard, Table, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Estado = "pendiente" | "aprobada" | "rechazada" | "cancelada";

const ESTADO_TONE: Record<Estado, React.ComponentProps<typeof Badge>["tone"]> = {
  pendiente: "warning", aprobada: "success", rechazada: "destructive", cancelada: "neutral",
};
const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada", cancelada: "Cancelada",
};

function fmtFecha(s: string) {
  const parts = s.split("-");
  const y = Number(parts[0] ?? 2026);
  const m = Number(parts[1] ?? 1);
  const d = Number(parts[2] ?? 1);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
}

type ReservaRow = NonNullable<ReturnType<typeof useQuery<typeof api.reservas.listByCondominio>>>[number];
type ZonaRow = NonNullable<ReturnType<typeof useQuery<typeof api.reservas.listZonas>>>[number];

export default function ReservasPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const reservas = useQuery(api.reservas.listByCondominio, { condominioId });
  const zonas = useQuery(api.reservas.listZonas, { condominioId });
  const unidades = useQuery(api.unidades.listByCondominio, { condominioId });

  const [estadoFiltro, setEstadoFiltro] = useState<"" | Estado>("");
  const [zonaFiltro, setZonaFiltro] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [zonasOpen, setZonasOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Id<"reservas"> | null>(null);
  const updateEstado = useMutation(api.reservas.updateEstado);

  const filtered = (reservas ?? []).filter((r) => {
    if (estadoFiltro && r.estado !== estadoFiltro) return false;
    if (zonaFiltro && r.zonaId !== zonaFiltro) return false;
    return true;
  });

  const total = reservas?.length ?? 0;
  const pendientes = reservas?.filter((r) => r.estado === "pendiente").length ?? 0;
  const aprobadas = reservas?.filter((r) => r.estado === "aprobada").length ?? 0;
  const rechazadas = reservas?.filter((r) => r.estado === "rechazada").length ?? 0;

  async function cambiarEstado(id: Id<"reservas">, estado: Estado) {
    await updateEstado({ id, estado });
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Reservas"
          description="Reservas de zonas comunes del conjunto"
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setZonasOpen(true)}>
                <Settings className="h-4 w-4" />
                Zonas
              </Button>
              <Button onClick={() => setFormOpen(true)} disabled={(zonas ?? []).filter((z) => z.activa).length === 0}>
                <Plus className="h-4 w-4" aria-hidden />
                Nueva reserva
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={CalendarCheck} label="Total reservas" value={total} tone="neutral" />
          <StatCard icon={Clock} label="Pendientes" value={pendientes} tone="warning" />
          <StatCard icon={CheckCircle} label="Aprobadas" value={aprobadas} tone="success" />
          <StatCard icon={XCircle} label="Rechazadas" value={rechazadas} tone="destructive" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {reservas === undefined ? "Cargando…" : `${filtered.length} reserva${filtered.length === 1 ? "" : "s"}`}
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

        {reservas === undefined ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={estadoFiltro || zonaFiltro ? "Sin resultados" : (zonas ?? []).length === 0 ? "Sin zonas comunes" : "Sin reservas"}
            description={
              estadoFiltro || zonaFiltro
                ? "Ninguna reserva coincide con los filtros."
                : (zonas ?? []).length === 0
                ? "Primero crea las zonas comunes desde el botón Zonas."
                : "Crea la primera reserva de una zona común."
            }
            action={
              estadoFiltro || zonaFiltro ? (
                <Button variant="outline" size="sm" onClick={() => { setEstadoFiltro(""); setZonaFiltro(""); }}>
                  Limpiar filtros
                </Button>
              ) : (zonas ?? []).length === 0 ? (
                <Button size="sm" onClick={() => setZonasOpen(true)}>
                  <MapPin className="h-4 w-4" />Crear zona
                </Button>
              ) : (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" />Nueva reserva
                </Button>
              )
            }
          />
        ) : (
          <TableCard>
            <Table>
              <THead>
                <TR>
                  <TH>Zona</TH>
                  <TH>Fecha / Horario</TH>
                  <TH>Unidad</TH>
                  <TH>Solicitante</TH>
                  <TH>Estado</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((r) => (
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
    </PageContainer>
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
  const createZona = useMutation(api.reservas.createZona);
  const toggleZona = useMutation(api.reservas.toggleZona);
  const removeZona = useMutation(api.reservas.removeZona);
  const [nombre, setNombre] = useState("");
  const [capacidad, setCapacidad] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addZona() {
    if (!nombre.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createZona({ condominioId, nombre, capacidad: capacidad ? Number(capacidad) : undefined, descripcion: descripcion || undefined });
      setNombre(""); setCapacidad(""); setDescripcion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear la zona.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Zonas comunes" description="Administra los espacios reservables" footer={
      <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
    }>
      <div className="space-y-4">
        {zonas.length > 0 && (
          <div className="space-y-2">
            {zonas.map((z) => (
              <div key={z._id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", !z.activa && "text-muted-foreground line-through")}>{z.nombre}</p>
                  {z.capacidad && <p className="text-xs text-muted-foreground">Cap. {z.capacidad} personas</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleZona({ id: z._id })}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      z.activa ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20" : "bg-muted text-muted-foreground hover:bg-muted/80",
                    )}
                  >
                    {z.activa ? "Activa" : "Inactiva"}
                  </button>
                  <button
                    onClick={() => removeZona({ id: z._id })}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">Nueva zona</p>
          <div className="grid grid-cols-2 gap-2">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (ej. Piscina)" />
            <Input type="number" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} placeholder="Capacidad" min={1} />
          </div>
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" onClick={addZona} disabled={!nombre.trim() || busy} className="w-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <Plus className="h-4 w-4" />Agregar zona
          </Button>
        </div>
      </div>
    </Modal>
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
