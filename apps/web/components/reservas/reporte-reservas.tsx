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
import { cop } from "@/lib/utils";

/**
 * Reporte de reservas de un rango, con el depósito.
 *
 * Cruza la reserva con lo que la portería recibió y devolvió, que hoy vive
 * en dos tablas distintas. La pregunta que de verdad se hace la
 * administración —«a quién le queda pendiente devolverle el depósito»— no se
 * podía responder sin mirar dos pantallas.
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

const ESTADO_DEPOSITO: Record<string, string> = {
  registrado: "Sin devolver",
  devuelto: "Devuelto",
  no_devuelto: "Retenido",
};

export function ReporteReservasModal({
  condominioId,
  onClose,
}: {
  condominioId: Id<"condominios">;
  onClose: () => void;
}) {
  const inicial = mesActual();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);

  const data = useQuery(api.reservas.reporte, { condominioId, desde, hasta });

  function descargarCsv() {
    if (!data) return;
    const cab = [
      "Fecha", "Inicio", "Fin", "Zona", "Casa", "Solicitante",
      "Estado", "Deposito esperado", "Deposito recibido", "Estado deposito",
    ];
    /* Se escapa con comillas: los nombres de zona traen comas ("Salón, primer
       piso") y sin esto el archivo sale con las columnas corridas. */
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = data.filas.map((f) => [
      f.fecha, f.horaInicio, f.horaFin, f.zonaNombre, f.unidadNumero,
      f.solicitanteNombre, f.estado,
      f.depositoRequerido ?? "", f.depositoRecibido ?? "",
      f.depositoEstado ? ESTADO_DEPOSITO[f.depositoEstado] ?? f.depositoEstado : "",
    ]);
    const csv = [cab, ...filas].map((r) => r.map(esc).join(",")).join("\n");
    // BOM para que Excel abra los acentos bien.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Reservas_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reporte de reservas"
      description="Con el estado del depósito de cada una"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          <Button size="sm" onClick={descargarCsv} disabled={!data || data.filas.length === 0}>
            <Download className="h-4 w-4" /> Descargar CSV
          </Button>
        </>
      }
    >
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
        </div>

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
              <Dato valor={cop(data.resumen.depositoEsperado)} etiqueta="Depósito esperado" />
              <Dato valor={cop(data.resumen.depositoRecibido)} etiqueta="Recibido" />
              <Dato
                valor={String(data.resumen.depositosSinDevolver)}
                etiqueta="Sin devolver"
                alerta={data.resumen.depositosSinDevolver > 0}
              />
            </div>

            <div className="max-h-[45vh] overflow-auto rounded-xl border border-border">
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH><TH>Zona</TH><TH>Casa</TH>
                    <TH>Estado</TH><TH>Depósito</TH>
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
                        {f.depositoRecibido != null ? (
                          <>
                            {cop(f.depositoRecibido)}
                            <span className="block text-xs text-muted-foreground">
                              {f.depositoEstado
                                ? ESTADO_DEPOSITO[f.depositoEstado] ?? f.depositoEstado
                                : ""}
                            </span>
                          </>
                        ) : f.depositoRequerido ? (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            No se recibió ({cop(f.depositoRequerido)})
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
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
