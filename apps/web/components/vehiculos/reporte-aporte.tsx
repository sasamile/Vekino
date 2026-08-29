"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Download, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn, cop } from "@/lib/utils";

/**
 * Reporte de los vehículos con aporte voluntario.
 *
 * Va por MESES, no por días: las facturas son mensuales y en ningún lado
 * existe el día en que empezó o terminó un cupo. Decir "45 días" cuando lo
 * único que se sabe es "mes y medio de facturas" sería inventar precisión.
 */

const PUNTO: Record<string, string> = {
  rojo: "bg-red-500",
  azul: "bg-sky-500",
  morado: "bg-violet-500",
  gris: "bg-muted-foreground",
};

/** Mes actual y los cuatro anteriores, que es lo que se pide casi siempre. */
function rangoPorDefecto() {
  const h = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const hasta = `${h.getFullYear()}-${p(h.getMonth() + 1)}`;
  const d = new Date(h.getFullYear(), h.getMonth() - 4, 1);
  return { desde: `${d.getFullYear()}-${p(d.getMonth() + 1)}`, hasta };
}

export function ReporteAporteModal({
  condominioId,
  onClose,
}: {
  condominioId: Id<"condominios">;
  onClose: () => void;
}) {
  const inicial = rangoPorDefecto();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [config, setConfig] = useState(false);

  const data = useQuery(api.aporte.reporte, { condominioId, desde, hasta });

  function descargar() {
    if (!data) return;
    const cab = ["Casa", "Torre", "Residente", "Placas", "Meses", "Desde", "Hasta", "Valor total", "Estado"];
    /* Comillas siempre: los nombres traen comas y sin esto las columnas se
       corren al abrirlo en Excel. */
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = data.filas.map((f) => [
      f.unidadNumero, f.unidadTorre ?? "", f.residenteNombre,
      f.placas.join(" / "), f.meses, f.desde ?? "", f.hasta ?? "",
      f.valorTotal, f.enMora ? "En mora" : "Al día",
    ]);
    const csv = [cab, ...filas].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Aporte_voluntario_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Aporte voluntario de áreas comunes"
      description="Quién pagó cupo de parqueadero, por cuántos meses y cuánto"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          <Button size="sm" onClick={descargar} disabled={!data || data.filas.length === 0}>
            <Download className="h-4 w-4" /> Descargar CSV
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Desde</label>
            <Input type="month" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Hasta</label>
            <Input type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => setConfig(true)}>
            <Settings2 className="h-4 w-4" /> Tarifas
          </Button>
        </div>

        {data === undefined ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.filas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Ninguna factura de ese rango trae aporte voluntario.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Dato valor={String(data.resumen.casas)} etiqueta="Casas con aporte" />
              <Dato valor={cop(data.resumen.valorTotal)} etiqueta="Total facturado" />
              <Dato valor={String(data.resumen.enMora)} etiqueta="En mora" alerta={data.resumen.enMora > 0} />
            </div>

            <div className="max-h-[45vh] overflow-auto rounded-xl border border-border">
              <Table>
                <THead>
                  <TR><TH>Casa</TH><TH>Placas</TH><TH>Meses</TH><TH>Total</TH></TR>
                </THead>
                <TBody>
                  {data.filas.map((f) => (
                    <TR key={f.unidadId}>
                      <TD>
                        <span className="flex items-center gap-2">
                          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PUNTO[f.color])} />
                          {[f.unidadTorre, f.unidadNumero].filter(Boolean).join(" ")}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {f.residenteNombre}
                        </span>
                      </TD>
                      <TD>
                        {f.placas.length > 0 ? (
                          <span className="font-mono text-xs">{f.placas.join(" · ")}</span>
                        ) : (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            sin vehículo registrado
                          </span>
                        )}
                      </TD>
                      <TD>
                        {f.meses}
                        <span className="block text-xs text-muted-foreground">
                          {f.desde} → {f.hasta}
                        </span>
                      </TD>
                      <TD>{cop(f.valorTotal)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            {data.resumen.sinVehiculo > 0 && (
              <p className="text-[13px] text-amber-700 dark:text-amber-400">
                {data.resumen.sinVehiculo} casas pagan aporte pero no tienen
                ningún vehículo registrado. El guarda no las va a encontrar
                buscando por placa.
              </p>
            )}
          </>
        )}
      </div>

      {config && (
        <TarifasModal condominioId={condominioId} onClose={() => setConfig(false)} />
      )}
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

/**
 * Las tarifas y el umbral de mora.
 *
 * Configurable porque suben con el IPC cada año, y porque la regla exacta de
 * los «60 días» está por confirmar con la administración: cuando la definan,
 * es cambiar este número y no el código.
 */
function TarifasModal({
  condominioId,
  onClose,
}: {
  condominioId: Id<"condominios">;
  onClose: () => void;
}) {
  const leyenda = useQuery(api.aporte.leyenda, { condominioId });
  const guardar = useMutation(api.aporte.configurar);
  const [carro, setCarro] = useState("");
  const [moto, setMoto] = useState("");
  const [meses, setMeses] = useState("");
  const [busy, setBusy] = useState(false);

  const t = leyenda?.tarifas;
  const valCarro = carro || String(t?.tarifaCarro ?? "");
  const valMoto = moto || String(t?.tarifaMoto ?? "");
  const valMeses = meses || String(t?.mesesParaMora ?? "");

  return (
    <Modal
      open
      onClose={onClose}
      title="Tarifas del aporte"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await guardar({
                  condominioId,
                  tarifaCarro: Number(valCarro) || 0,
                  tarifaMoto: Number(valMoto) || 0,
                  mesesParaMora: Number(valMeses) || 2,
                });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Carro (mensual)</label>
            <Input type="number" value={valCarro} onChange={(e) => setCarro(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Moto (mensual)</label>
            <Input type="number" value={valMoto} onChange={(e) => setMoto(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Meses de atraso para salir en rojo
          </label>
          <Input type="number" min={1} value={valMeses} onChange={(e) => setMeses(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">
            La administración pidió «60 días o más». Dos meses es la lectura
            directa de eso con lo que hay hoy; si la regla es otra, se cambia
            aquí.
          </p>
        </div>
      </div>
    </Modal>
  );
}
