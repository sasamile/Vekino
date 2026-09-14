"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { descargarXlsxReporte } from "@/lib/excel-reporte";
import {
  ESTADO_DEPOSITO,
  csvReporteReservas,
  nombreArchivoReporteReservas,
  opcionesXlsxReporteReservas,
} from "@/lib/reporte-reservas";
import { cop } from "@/lib/utils";

/**
 * Reporte de reservas de un rango, con alquiler cobrado y depósito.
 *
 * El valor pactado no es un pago. Hasta que alguien registra el cobro, aquí
 * dice "Sin registrar" — no "No se recibió". Esa frase acusaba a la casa de
 * no pagar cuando la administración no tenía dónde anotar que sí cobró.
 */

/** Primer y último día del mes en curso, que es el rango que se pide casi siempre. */
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

export function ReporteReservasPanel({
  condominioId,
}: {
  condominioId: Id<"condominios">;
}) {
  const inicial = mesActual();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);

  const data = useQuery(api.reservas.reporte, { condominioId, desde, hasta });

  /* CSV y Excel salen de `lib/reporte-reservas`: mismas filas y columnas, para
     que las dos descargas no puedan decir cosas distintas. */
  function descargarCsv() {
    if (!data) return;
    const csv = csvReporteReservas(data.filas);
    // BOM para que Excel abra los acentos bien.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoReporteReservas(desde, hasta, "csv");
    a.click();
    URL.revokeObjectURL(url);
  }

  async function descargarExcel() {
    if (!data) return;
    setGenerandoExcel(true);
    setErrorExcel(null);
    try {
      await descargarXlsxReporte(
        opcionesXlsxReporteReservas({ filas: data.filas, resumen: data.resumen, desde, hasta }),
      );
    } catch {
      setErrorExcel("No se pudo generar el Excel. Intenta de nuevo.");
    } finally {
      setGenerandoExcel(false);
    }
  }

  const sinFilas = !data || data.filas.length === 0;

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
        <Button size="sm" variant="outline" onClick={descargarCsv} disabled={sinFilas}>
          <Download className="h-4 w-4" /> Descargar CSV
        </Button>
        <Button size="sm" variant="outline" onClick={descargarExcel} disabled={sinFilas || generandoExcel}>
          {generandoExcel ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}{" "}
          Descargar Excel
        </Button>
      </div>
      {errorExcel && (
        <p className="text-sm text-red-600 dark:text-red-400">{errorExcel}</p>
      )}

      {data === undefined ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : data.filas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No hubo reservas en ese rango.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato valor={String(data.resumen.total)} etiqueta="Reservas" />
            <Dato valor={cop(data.resumen.alquilerEsperado)} etiqueta="Alquiler pactado" />
            <Dato valor={cop(data.resumen.alquilerRecibido)} etiqueta="Alquiler cobrado" />
            <Dato valor={cop(data.resumen.depositoRecibido)} etiqueta="Depósito recibido" />
          </div>
          {(data.resumen.alquilerSinRegistrar > 0 || data.resumen.depositoSinRegistrar > 0) && (
            <p className="text-sm text-muted-foreground">
              {[
                data.resumen.alquilerSinRegistrar > 0
                  ? `${data.resumen.alquilerSinRegistrar} alquiler${data.resumen.alquilerSinRegistrar === 1 ? "" : "es"} sin registrar`
                  : null,
                data.resumen.depositoSinRegistrar > 0
                  ? `${data.resumen.depositoSinRegistrar} depósito${data.resumen.depositoSinRegistrar === 1 ? "" : "s"} sin registrar`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              .
            </p>
          )}
          {data.resumen.depositosSinDevolver > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {data.resumen.depositosSinDevolver} depósito{data.resumen.depositosSinDevolver === 1 ? "" : "s"} sin devolver.
            </p>
          )}
          {data.resumen.depositosRetenidos > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {data.resumen.depositosRetenidos} depósito{data.resumen.depositosRetenidos === 1 ? "" : "s"} retenido{data.resumen.depositosRetenidos === 1 ? "" : "s"}.
            </p>
          )}

          <div className="max-h-[55vh] overflow-auto rounded-xl border border-border">
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH><TH>Zona</TH><TH>Casa</TH>
                  <TH>Estado</TH><TH>Alquiler</TH><TH>Depósito</TH>
                </TR>
              </THead>
              <TBody>
                {data.filas.map((f) => (
                  <TR key={f._id}>
                    <TD>
                      {f.fecha}
                      <span className="block text-xs text-muted-foreground">
                        {f.horaInicio}–{f.horaFin}
                      </span>
                    </TD>
                    <TD>{f.zonaNombre}</TD>
                    <TD>
                      {f.unidadNumero}
                      <span className="block text-xs text-muted-foreground">
                        {f.solicitanteNombre}
                      </span>
                    </TD>
                    <TD className="capitalize">{f.estado}</TD>
                    <TD>
                      <CeldaAlquiler
                        pactado={f.valorReserva}
                        cobrado={f.pagoAlquilerMonto}
                        estimado={f.valoresEstimados}
                      />
                    </TD>
                    <TD>
                      <CeldaDeposito
                        esperado={f.depositoRequerido}
                        recibido={f.depositoRecibido}
                        estado={f.depositoEstado}
                        retencion={f.depositoRetencion}
                      />
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

function CeldaAlquiler({
  pactado,
  cobrado,
  estimado,
}: {
  pactado: number | null;
  cobrado: number | null;
  estimado?: boolean;
}) {
  if (pactado == null && cobrado == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <>
      {pactado != null ? cop(pactado) : "—"}
      {estimado && pactado != null && (
        <span className="block text-xs text-muted-foreground">Estimado</span>
      )}
      <span className="block text-xs text-muted-foreground">
        {cobrado != null ? `Cobrado ${cop(cobrado)}` : "Sin registrar"}
      </span>
    </>
  );
}

function CeldaDeposito({
  esperado,
  recibido,
  estado,
  retencion,
}: {
  esperado: number | null;
  recibido: number | null;
  estado: string | null;
  retencion: string | null;
}) {
  if (recibido != null) {
    return (
      <>
        {cop(recibido)}
        <span className="block text-xs text-muted-foreground">
          {estado ? ESTADO_DEPOSITO[estado] ?? estado : ""}
        </span>
        {estado === "no_devuelto" && retencion ? (
          <span className="block text-xs text-red-600 dark:text-red-400">{retencion}</span>
        ) : null}
      </>
    );
  }
  if (esperado) {
    return (
      <span className="text-xs text-muted-foreground">
        Sin registrar ({cop(esperado)})
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

export function ReporteReservasModal({
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
      title="Reporte de reservas"
      description="Alquiler cobrado y estado del depósito de cada una"
      className="max-w-3xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
      }
    >
      <ReporteReservasPanel condominioId={condominioId} />
    </Modal>
  );
}

function Dato({ valor, etiqueta, alerta }: { valor: string; etiqueta: string; alerta?: boolean }) {
  return (
    <Card className="p-3">
      <p className={alerta ? "text-lg font-bold text-amber-600 dark:text-amber-400" : "text-lg font-bold text-foreground"}>
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{etiqueta}</p>
    </Card>
  );
}

export { FileSpreadsheet };
