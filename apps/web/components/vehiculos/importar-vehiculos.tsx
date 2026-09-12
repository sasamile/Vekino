"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { api } from "@vekino/backend/api";
import {
  filasDesdeHoja,
  resolverUnidad,
  type FilaVehiculoExcel,
} from "@vekino/backend/importarVehiculos";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { descargarXlsx } from "@/lib/excel-simple";
import { leerHoja } from "@/lib/leer-hoja";
import { cn } from "@/lib/utils";

const ENCABEZADOS = [
  "Unidad",
  "Torre",
  "Placa",
  "Tipo",
  "Marca",
  "Color",
  "Observaciones",
] as const;

type Preview = {
  fila: FilaVehiculoExcel;
  estado: "actualizar" | "crear" | "omitir";
  motivo?: string;
};

/**
 * Sube el Excel del parqueadero y actualiza por placa.
 *
 * El valor de la hoja es poder rehacerla cuando cambian casas, marcas o
 * colores — no teclear cada carro. Lo que ya existe se pisa; lo nuevo se
 * crea; una fila sin unidad o sin placa se deja fuera y se lista.
 */
export function ImportarVehiculosModal({
  condominioId,
  onClose,
}: {
  condominioId: Id<"condominios">;
  onClose: () => void;
}) {
  const unidades = useQuery(api.unidades.listByCondominio, { condominioId });
  const registrados = useQuery(api.vehiculos.listByCondominio, { condominioId });
  const bulkUpsert = useMutation(api.vehiculos.bulkUpsert);

  const fileRef = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<"idle" | "preview" | "guardando" | "hecho">("idle");
  const [preview, setPreview] = useState<Preview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    creados: number;
    actualizados: number;
    restaurados: number;
    omitidos: { placa: string; motivo: string }[];
  } | null>(null);

  const placas = useMemo(() => {
    const s = new Set<string>();
    for (const v of registrados ?? []) {
      s.add(v.placa.toUpperCase().replace(/[^A-Z0-9]/g, ""));
    }
    return s;
  }, [registrados]);

  const unidadMin = useMemo(
    () =>
      (unidades ?? []).map((u) => ({
        _id: u._id as string,
        numero: u.numero,
        torre: u.torre ?? null,
      })),
    [unidades],
  );

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const hoja = await leerHoja(file);
      const filas = filasDesdeHoja(hoja.encabezados, hoja.filas);
      if (filas.length === 0) {
        throw new Error("No hay filas con placa y unidad.");
      }
      setPreview(
        filas.map((fila) => {
          const placa = fila.placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (!placa) {
            return { fila, estado: "omitir" as const, motivo: "Sin placa" };
          }
          const u = resolverUnidad(unidadMin, fila.unidad, fila.torre);
          if (!u.ok) {
            return {
              fila,
              estado: "omitir" as const,
              motivo:
                u.motivo === "ambigua"
                  ? "Unidad en más de una torre: indica la torre"
                  : `No hay unidad ${fila.unidad}`,
            };
          }
          return {
            fila,
            estado: placas.has(placa) ? ("actualizar" as const) : ("crear" as const),
          };
        }),
      );
      setPaso("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
      setPaso("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function aplicar() {
    const aplicables = preview.filter((p) => p.estado !== "omitir").map((p) => p.fila);
    if (aplicables.length === 0) return;
    setPaso("guardando");
    setError(null);
    try {
      let creados = 0;
      let actualizados = 0;
      let restaurados = 0;
      const omitidos: { placa: string; motivo: string }[] = [
        ...preview
          .filter((p) => p.estado === "omitir")
          .map((p) => ({ placa: p.fila.placa || "—", motivo: p.motivo ?? "Omitida" })),
      ];
      const BATCH = 80;
      for (let i = 0; i < aplicables.length; i += BATCH) {
        const res = await bulkUpsert({
          condominioId,
          filas: aplicables.slice(i, i + BATCH),
        });
        creados += res.creados;
        actualizados += res.actualizados;
        restaurados += res.restaurados;
        omitidos.push(...res.omitidos);
      }
      setResultado({ creados, actualizados, restaurados, omitidos });
      setPaso("hecho");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setPaso("preview");
    }
  }

  async function descargarActual() {
    const filas = (registrados ?? [])
      .filter((v) => !v.archivadoEn)
      .map((v) => [
        v.unidadNumero,
        "",
        v.placa,
        v.tipo,
        v.marca ?? "",
        v.color ?? "",
        v.observaciones ?? "",
      ]);
    await descargarXlsx({
      nombreArchivo: `vehiculos-${new Date().toISOString().slice(0, 10)}`,
      hoja: "Vehículos",
      encabezados: [...ENCABEZADOS],
      filas,
    });
  }

  async function descargarPlantilla() {
    await descargarXlsx({
      nombreArchivo: "plantilla-vehiculos",
      hoja: "Vehículos",
      encabezados: [...ENCABEZADOS],
      filas: [["409", "", "ABC123", "carro", "Chevrolet", "Blanco", ""]],
    });
  }

  const nAct = preview.filter((p) => p.estado === "actualizar").length;
  const nNew = preview.filter((p) => p.estado === "crear").length;
  const nSkip = preview.filter((p) => p.estado === "omitir").length;
  const cargandoListas = unidades === undefined || registrados === undefined;

  const footer =
    paso === "hecho" ? (
      <Button size="sm" onClick={onClose}>Listo</Button>
    ) : paso === "idle" ? (
      <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
    ) : (
      <>
        <Button variant="ghost" size="sm" onClick={() => setPaso("idle")} disabled={paso === "guardando"}>
          Volver
        </Button>
        <Button
          size="sm"
          onClick={aplicar}
          disabled={nAct + nNew === 0 || paso === "guardando"}
        >
          {paso === "guardando" && <Loader2 className="h-4 w-4 animate-spin" />}
          Actualizar {nAct + nNew} vehículo{nAct + nNew === 1 ? "" : "s"}
        </Button>
      </>
    );

  return (
    <Modal
      open
      onClose={onClose}
      title="Actualizar vehículos"
      description="Sube el Excel. La placa decide si se actualiza o se crea."
      className="max-w-2xl"
      footer={footer}
    >
      <div className="space-y-4">
        {paso === "idle" && (
          <>
            <p className="text-sm text-muted-foreground">
              Columnas: unidad (o casa/apto), placa, y si las tienes: torre, tipo, marca, color, observaciones.
              Un campo vacío no borra lo que ya está registrado.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={descargarActual} disabled={cargandoListas}>
                <Download className="h-4 w-4" /> Descargar listado
              </Button>
              <Button variant="outline" size="sm" onClick={descargarPlantilla}>
                <FileSpreadsheet className="h-4 w-4" /> Plantilla
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => void onFile(e)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={cargandoListas}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-8 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              <Upload className="h-5 w-5" />
              {cargandoListas ? "Cargando el parqueadero…" : "Elegir Excel o CSV"}
            </button>
          </>
        )}

        {paso === "preview" || paso === "guardando" ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Dato n={nAct} etiqueta="Se actualizan" />
              <Dato n={nNew} etiqueta="Se crean" />
              <Dato n={nSkip} etiqueta="Se omiten" muted={nSkip === 0} />
            </div>
            <div className="max-h-[40vh] overflow-auto rounded-xl border border-border">
              <Table>
                <THead>
                  <TR>
                    <TH>Placa</TH>
                    <TH>Unidad</TH>
                    <TH>Qué pasa</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.slice(0, 80).map((p, i) => (
                    <TR key={`${p.fila.placa}-${i}`}>
                      <TD className="font-mono text-sm">{p.fila.placa || "—"}</TD>
                      <TD>{p.fila.unidad || "—"}</TD>
                      <TD>
                        <span
                          className={cn(
                            "text-xs",
                            p.estado === "omitir"
                              ? "text-red-600 dark:text-red-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {p.estado === "actualizar"
                            ? "Actualizar"
                            : p.estado === "crear"
                              ? "Crear"
                              : p.motivo}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            {preview.length > 80 && (
              <p className="text-xs text-muted-foreground">
                Mostrando 80 de {preview.length}. Se aplican todas al confirmar.
              </p>
            )}
          </>
        ) : null}

        {paso === "hecho" && resultado && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              {resultado.actualizados} actualizado{resultado.actualizados === 1 ? "" : "s"}
              {resultado.creados > 0 ? ` · ${resultado.creados} nuevo${resultado.creados === 1 ? "" : "s"}` : ""}
              {resultado.restaurados > 0
                ? ` · ${resultado.restaurados} vuelto${resultado.restaurados === 1 ? "" : "s"} a circulación`
                : ""}
              .
            </p>
            {resultado.omitidos.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-xl border border-border p-3">
                <p className="mb-2 text-xs font-medium text-foreground">
                  No se cargaron {resultado.omitidos.length}
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {resultado.omitidos.slice(0, 30).map((o, i) => (
                    <li key={`${o.placa}-${i}`}>
                      {o.placa}: {o.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function Dato({ n, etiqueta, muted }: { n: number; etiqueta: string; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-border px-2 py-3">
      <p className={cn("text-lg font-semibold", muted ? "text-muted-foreground" : "text-foreground")}>
        {n}
      </p>
      <p className="text-[11px] text-muted-foreground">{etiqueta}</p>
    </div>
  );
}
