"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { AlertTriangle, FileSpreadsheet, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { descargarXlsxReporte } from "@/lib/excel-reporte";
import {
  ETIQUETA_CRITERIO_FECHA,
  FILTROS_VACIOS,
  SIN_REGISTRAR,
  type CriterioFecha,
  type EstadoDeposito,
  type FilaAuditoriaDeposito,
  type FiltrosAuditoria,
  etiquetaEstado,
  etiquetaOrigen,
  etiquetaRol,
  fechaBogota,
  filtrarAuditoria,
  horaBogota,
  opcionesXlsxAuditoriaDepositos,
  resumirAuditoria,
} from "@/lib/auditoria-depositos";
import { cop } from "@/lib/utils";

/**
 * AUDITORÍA DE DEPÓSITOS: qué pasó con cada garantía y quién la tocó.
 *
 * No es el reporte de reservas con otra tabla: allí la fila es una reserva y
 * lo que se cuadra es la caja del mes; aquí la fila es un DEPÓSITO y lo que
 * se sigue es el dinero de un tercero que el conjunto tuvo en la mano.
 *
 * Todo lo que se pinta viene sellado del servidor. Lo único que se calcula en
 * el navegador son los totales de lo FILTRADO, para que el resumen no diga
 * una cosa y la tabla de abajo otra.
 */

/** Primer y último día del mes en curso: el rango que se pide casi siempre. */
function mesActual() {
  const hoy = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const fin = new Date(y, m + 1, 0).getDate();
  return {
    desde: `${y}-${p(m + 1)}-01`,
    hasta: `${y}-${p(m + 1)}-${p(fin)}`,
  };
}

const ESTADO_TONE: Record<string, React.ComponentProps<typeof Badge>["tone"]> = {
  registrado: "warning",
  devuelto: "success",
  devuelto_parcial: "warning",
  no_devuelto: "destructive",
};

export function AuditoriaDepositosPanel({
  condominioId,
}: {
  condominioId: Id<"condominios">;
}) {
  const inicial = mesActual();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [criterio, setCriterio] = useState<CriterioFecha>("cualquiera");
  const [filtros, setFiltros] = useState<FiltrosAuditoria>(FILTROS_VACIOS);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* El rango y el criterio los aplica el servidor —son los que deciden qué
     depósitos se leen—; lo demás se filtra aquí, sobre lo que ya llegó. */
  const data = useQuery(api.reservas.auditoriaDepositos, {
    condominioId,
    desde,
    hasta,
    criterio,
  });

  const filas = useMemo<FilaAuditoriaDeposito[]>(
    () => (data ? filtrarAuditoria(data.filas, filtros) : []),
    [data, filtros],
  );
  const resumen = useMemo(() => resumirAuditoria(filas), [filas]);

  async function descargarExcel() {
    if (filas.length === 0) return;
    setGenerando(true);
    setError(null);
    try {
      await descargarXlsxReporte(
        opcionesXlsxAuditoriaDepositos({ filas, desde, hasta, criterio }),
      );
    } catch {
      setError("No se pudo generar el Excel. Intenta de nuevo.");
    } finally {
      setGenerando(false);
    }
  }

  const cargando = data === undefined;
  const set = <K extends keyof FiltrosAuditoria>(k: K, v: FiltrosAuditoria[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Desde</label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Hasta</label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Qué fecha</label>
          <Select
            value={criterio}
            onChange={(e) => setCriterio(e.target.value as CriterioFecha)}
            className="w-56"
          >
            {(Object.keys(ETIQUETA_CRITERIO_FECHA) as CriterioFecha[]).map((k) => (
              <option key={k} value={k}>{ETIQUETA_CRITERIO_FECHA[k]}</option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={descargarExcel}
          disabled={filas.length === 0 || generando}
        >
          {generando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}{" "}
          Descargar Excel
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1 space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Buscar</label>
          <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={filtros.busqueda}
            onChange={(e) => set("busqueda", e.target.value)}
            placeholder="Solicitante, casa, zona o responsable"
            className="pl-9"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Estado</label>
          <Select
            value={filtros.estado}
            onChange={(e) => set("estado", e.target.value as "" | EstadoDeposito)}
            className="w-44"
          >
            <option value="">Todos los estados</option>
            <option value="registrado">Sin devolver</option>
            <option value="devuelto">Devuelto</option>
            <option value="devuelto_parcial">Devuelto parcial</option>
            <option value="no_devuelto">Retenido</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Incidentes</label>
          <Select
            value={filtros.incidentes}
            onChange={(e) => set("incidentes", e.target.value as FiltrosAuditoria["incidentes"])}
            className="w-40"
          >
            <option value="todos">Todos</option>
            <option value="con">Con incidentes</option>
            <option value="sin">Sin incidentes</option>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : data.filas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No se recibió ni se devolvió ningún depósito en ese rango.
        </p>
      ) : filas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Ningún depósito del rango coincide con los filtros.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Dato valor={String(resumen.total)} etiqueta="Depósitos" />
            <Dato valor={cop(resumen.recibido)} etiqueta="Valor recibido" />
            <Dato valor={cop(resumen.enCustodia)} etiqueta="En custodia" />
            <Dato valor={cop(resumen.descontado)} etiqueta="Descontado" />
            <Dato valor={cop(resumen.devuelto)} etiqueta="Devuelto" />
          </div>

          {resumen.sinRolRegistrado > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {resumen.sinRolRegistrado === 1
                ? "Un depósito no tiene registrado el rol de quien lo operó"
                : `${resumen.sinRolRegistrado} depósitos no tienen registrado el rol de quien los operó`}
              : son anteriores a que ese dato se guardara. Se muestra el nombre, que sí
              quedó, y no el rol que esa persona tiene hoy.
            </p>
          )}

          <div className="max-h-[55vh] overflow-auto rounded-xl border border-border">
            <Table>
              <THead>
                <TR>
                  <TH>Reserva</TH>
                  <TH>Depósito</TH>
                  <TH>Recepción</TH>
                  <TH>Devolución</TH>
                  <TH>Incidentes</TH>
                </TR>
              </THead>
              <TBody>
                {filas.map((f) => (
                  <TR key={f.reservaId}>
                    <TD>
                      {f.fecha}
                      <span className="block text-xs text-muted-foreground">
                        {f.zonaNombre} · Casa {f.unidadNumero}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {f.solicitanteNombre}
                      </span>
                    </TD>
                    <TD>
                      {cop(f.monto)}
                      <span className="mt-1 block">
                        <Badge tone={ESTADO_TONE[f.estado] ?? "neutral"}>
                          {etiquetaEstado(f.estado)}
                        </Badge>
                      </span>
                      {f.enCustodia > 0 && f.saldoPrevisto !== null && (
                        <span className="block text-xs text-muted-foreground">
                          Se devolvería {cop(f.saldoPrevisto)}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <Responsable
                        cuando={f.fechaRegistro}
                        quien={f.recibidoPorNombre}
                        rol={f.recibidoPorRol}
                        origen={f.recibidoOrigen}
                      />
                      {f.observacionesIngreso && (
                        <span className="block text-xs text-muted-foreground">
                          {f.observacionesIngreso}
                        </span>
                      )}
                    </TD>
                    <TD>
                      {f.fechaResolucion == null ? (
                        <span className="text-xs text-muted-foreground">
                          Sin devolver
                        </span>
                      ) : (
                        <>
                          <Responsable
                            cuando={f.fechaResolucion}
                            quien={f.resueltoPorNombre ?? SIN_REGISTRAR}
                            rol={f.resueltoPorRol}
                            origen={f.resueltoOrigen}
                          />
                          <span className="block text-xs text-foreground">
                            Devuelto {cop(f.devuelto ?? 0)}
                            {(f.descontado ?? 0) > 0
                              ? ` · descontado ${cop(f.descontado ?? 0)}`
                              : ""}
                          </span>
                          {f.motivoDevolucion && (
                            <span className="block text-xs text-red-600 dark:text-red-400">
                              {f.motivoDevolucion}
                            </span>
                          )}
                          {!f.cifrasCongeladas && (
                            <span className="block text-xs text-muted-foreground">
                              Cifras deducidas del estado: la devolución es anterior a
                              que se guardaran.
                            </span>
                          )}
                        </>
                      )}
                    </TD>
                    <TD>
                      {f.incidentes === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <>
                          {cop(f.valorIncidentes)}
                          <span className="block text-xs text-muted-foreground">
                            {f.descripcionIncidentes}
                          </span>
                        </>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

/** Quién hizo algo, cuándo y con qué autoridad. */
function Responsable({
  cuando,
  quien,
  rol,
  origen,
}: {
  cuando: number;
  quien: string;
  rol: string | null;
  origen: string | null;
}) {
  return (
    <>
      {fechaBogota(cuando)}
      <span className="block text-xs text-muted-foreground">
        {horaBogota(cuando)} · {quien}
      </span>
      <span className="block text-xs text-muted-foreground">
        {etiquetaRol(rol)}
        {origen ? ` · ${etiquetaOrigen(origen)}` : ""}
      </span>
    </>
  );
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <Card className="p-3">
      <p className="text-lg font-bold text-foreground">{valor}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{etiqueta}</p>
    </Card>
  );
}

export function AuditoriaDepositosModal({
  condominioId,
  onClose,
}: {
  condominioId: Id<"condominios">;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Auditoría de depósitos"
      description="Qué pasó con cada garantía, cuándo y quién la recibió o la devolvió"
      className="max-w-5xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
      }
    >
      <AuditoriaDepositosPanel condominioId={condominioId} />
    </Modal>
  );
}
