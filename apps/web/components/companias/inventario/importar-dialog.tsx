"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  COLUMNAS_PLANTILLA,
  MAX_DESCRIPCION,
  MAX_FILAS_IMPORTACION,
  MAX_NOMBRE,
  MAX_SERIAL,
  mapearColumnas,
  type ClaveColumna,
  type FilaCruda,
} from "@vekino/backend/inventario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ErrorBoundary, ErrorMessage } from "@/components/ui/error-boundary";
import { ArchivoExcelInvalido, leerXlsx } from "@/lib/excel-lectura";

/**
 * Carga masiva de elementos desde un Excel.
 *
 * Tres pasos deliberados —elegir archivo → ver el informe → confirmar— en vez
 * de "subir y rezar". El paso del medio es el que importa: si de cien filas
 * hay cuatro malas, el administrador ve CUÁLES y POR QUÉ antes de decidir, y
 * decide él si corrige el archivo o importa solo las buenas.
 *
 * Nada se escribe hasta el último botón, y lo que se escribe entra en una sola
 * transacción: no existe el resultado a medias.
 */

/** La forma del informe, tal como lo devuelven la query y la mutación. */
type FilaInforme =
  | { fila: number; estado: "vacia" }
  | { fila: number; estado: "valida"; item: { nombre: string } }
  | {
      fila: number;
      estado: "invalida";
      motivos: Array<{ mensaje: string; columna?: string }>;
      datos: FilaCruda;
    };

type Informe = {
  filas: FilaInforme[];
  total: number;
  validas: number;
  invalidas: number;
  vacias: number;
};

export function ImportarItemsDialog({
  companiaId,
  onClose,
}: {
  companiaId: Id<"companiasSeguridad">;
  onClose: () => void;
}) {
  const [filas, setFilas] = useState<FilaCruda[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    importados: number;
    informe: Informe;
  } | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  /* Un contador y no `filas.length`: dos archivos distintos con el mismo
   * numero de filas no resetearian el boundary, y el segundo se quedaria
   * mirando el error del primero. */
  const [intento, setIntento] = useState(0);

  return (
    <Modal
      open
      onClose={onClose}
      title="Cargar inventario desde Excel"
      description={nombreArchivo ?? "Descarga la plantilla, rellénala y súbela."}
      className="max-w-3xl"
    >
      <ErrorBoundary
        resetKey={intento}
        fallback={(e) => (
          <ErrorMessage title="No se pudo revisar el archivo" detail={e.message} />
        )}
      >
        <Contenido
          companiaId={companiaId}
          filas={filas}
          setFilas={(f) => {
            setIntento((n) => n + 1);
            setFilas(f);
          }}
          nombreArchivo={nombreArchivo}
          setNombreArchivo={setNombreArchivo}
          resultado={resultado}
          setResultado={setResultado}
          errorArchivo={errorArchivo}
          setErrorArchivo={setErrorArchivo}
          onClose={onClose}
        />
      </ErrorBoundary>
    </Modal>
  );
}

/** Cuántas filas en blanco se preformatean en la plantilla. */
const FILAS_EN_BLANCO = 40;

/**
 * Cómo se ve cada columna de la plantilla.
 *
 * Vive aquí y no en `COLUMNAS_PLANTILLA` porque es presentación: anchos,
 * globos de ayuda y formato de celda no le importan al servidor, que solo
 * empareja por el nombre del encabezado. El `Record<ClaveColumna, …>` es a
 * propósito — el día que se añada una columna al dominio, esto no compila
 * hasta que alguien decida cómo se ve.
 *
 * Los límites de los textos de ayuda se leen de las constantes reales de la
 * validación: si mañana el nombre admite 200 caracteres, la plantilla lo dice
 * sola en vez de quedarse mintiendo.
 */
const PRESENTACION: Record<
  ClaveColumna,
  { ancho: number; ayuda: string; formato?: "texto" }
> = {
  nombre: {
    ancho: 34,
    ayuda: `Qué es el elemento. Máximo ${MAX_NOMBRE} caracteres.\nEjemplo: Radio Motorola DEP450`,
  },
  serial: {
    ancho: 20,
    /* Formato de texto: sin él, Excel convierte "0012345" en 12345 al
     * escribirlo y el serial deja de casar con la etiqueta del aparato. */
    formato: "texto",
    ayuda: `Opcional, pero no puede repetirse dentro del inventario activo. Máximo ${MAX_SERIAL} caracteres.`,
  },
  descripcion: {
    ancho: 46,
    ayuda: `Opcional. Detalles útiles para identificarlo. Máximo ${MAX_DESCRIPCION} caracteres.`,
  },
  fotoUrl: {
    ancho: 38,
    ayuda:
      "Opcional. Dirección de una imagen que empiece por http:// o https://",
  },
};

function Contenido({
  companiaId,
  filas,
  setFilas,
  nombreArchivo,
  setNombreArchivo,
  resultado,
  setResultado,
  errorArchivo,
  setErrorArchivo,
  onClose,
}: {
  companiaId: Id<"companiasSeguridad">;
  filas: FilaCruda[];
  setFilas: (f: FilaCruda[]) => void;
  nombreArchivo: string | null;
  setNombreArchivo: (n: string | null) => void;
  resultado: { importados: number; informe: Informe } | null;
  setResultado: (r: { importados: number; informe: Informe } | null) => void;
  errorArchivo: string | null;
  setErrorArchivo: (e: string | null) => void;
  onClose: () => void;
}) {
  const importar = useMutation(api.inventario.importar);
  const inputArchivo = useRef<HTMLInputElement>(null);

  const [leyendo, setLeyendo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorImportar, setErrorImportar] = useState<string | null>(null);

  /**
   * El informe, en vivo.
   *
   * Reactivo y no una llamada suelta: si mientras el administrador mira la
   * lista otra persona crea un elemento con uno de esos seriales, el informe
   * se actualiza solo y el botón deja de prometer algo que ya no es cierto.
   * `"skip"` mientras no hay archivo — la query rechaza cero filas.
   */
  const previo = useQuery(
    api.inventario.previsualizarImportacion,
    filas.length > 0 ? { companiaId, filas } : "skip",
  ) as Informe | undefined;

  async function descargarPlantilla() {
    /* La generación del .xlsx se carga solo cuando hace falta: JSZip pesa y no
     * tiene por qué estar en el bundle de quien nunca importa nada. */
    const { descargarXlsx } = await import("@/lib/excel-simple");
    await descargarXlsx({
      nombreArchivo: "plantilla-inventario",
      hoja: "Inventario",
      /* El texto del encabezado sigue saliendo de COLUMNAS_PLANTILLA y no se
       * toca: es la llave con la que la carga empareja las columnas. Lo que se
       * añade aquí es solo presentación. */
      encabezados: COLUMNAS_PLANTILLA.map((c) => ({
        encabezado: c.encabezado,
        requerida: c.requerida,
        ...PRESENTACION[c.clave],
      })),
      filas: [],
      /* La fila de ejemplo, ahora en gris cursiva sobre fondo suave para que
       * se lea como lo que es. Sigue siendo una fila de datos normal: quien
       * la deje sin tocar la importa, igual que antes. */
      filasEjemplo: [COLUMNAS_PLANTILLA.map((c) => c.ejemplo)],
      /* El área de escritura, con el borde ya puesto. El lector recorta la
       * cola vacía, así que no cuentan para el límite de filas ni entran como
       * elementos en blanco. */
      filasVacias: FILAS_EN_BLANCO,
    });
  }

  async function elegirArchivo(archivo: File) {
    setErrorArchivo(null);
    setErrorImportar(null);
    setResultado(null);
    setLeyendo(true);
    try {
      const hoja = await leerXlsx(archivo);
      const cols = mapearColumnas(hoja.encabezados);

      if (cols.nombre == null) {
        throw new Error(
          `No se encontró la columna "Nombre". Descarga la plantilla y úsala como base. Las columnas de este archivo son: ${hoja.encabezados.filter(Boolean).join(", ") || "(ninguna)"}.`,
        );
      }

      const celda = (fila: string[], i: number | null) =>
        i == null ? undefined : (fila[i] ?? "").trim() || undefined;

      const crudas: FilaCruda[] = hoja.filas.map((f) => ({
        nombre: celda(f, cols.nombre),
        serial: celda(f, cols.serial),
        descripcion: celda(f, cols.descripcion),
        fotoUrl: celda(f, cols.fotoUrl),
      }));

      /* Los dos límites se comprueban aquí ADEMÁS de en el servidor: no por
       * seguridad —el servidor manda— sino para que el mensaje llegue al
       * instante y en términos del archivo que el usuario acaba de elegir. */
      if (crudas.length === 0) {
        throw new Error(
          "El archivo no tiene ninguna fila debajo de los encabezados.",
        );
      }
      if (crudas.length > MAX_FILAS_IMPORTACION) {
        throw new Error(
          `El archivo trae ${crudas.length} filas y el máximo por carga es ${MAX_FILAS_IMPORTACION}. Pártelo en varios archivos.`,
        );
      }

      setNombreArchivo(archivo.name);
      setFilas(crudas);
    } catch (err) {
      setErrorArchivo(
        err instanceof ArchivoExcelInvalido || err instanceof Error
          ? err.message
          : "No se pudo leer el archivo.",
      );
    } finally {
      setLeyendo(false);
      if (inputArchivo.current) inputArchivo.current.value = "";
    }
  }

  async function confirmar(omitirInvalidas: boolean) {
    setErrorImportar(null);
    setBusy(true);
    try {
      const r = await importar({ companiaId, filas, omitirInvalidas });
      if (!r.aplicado) {
        /* No se escribió nada. El servidor revalida, así que esto puede pasar
         * aunque el informe dijera que estaba bien: entre una cosa y otra
         * alguien pudo crear un elemento con uno de esos seriales. */
        setErrorImportar(
          "No se importó nada: el archivo sigue teniendo filas con problemas. Revisa la lista actualizada.",
        );
        return;
      }
      setResultado({ importados: r.importados, informe: r.informe as Informe });
    } catch (err) {
      setErrorImportar(
        err instanceof Error ? err.message : "No se pudo importar.",
      );
    } finally {
      setBusy(false);
    }
  }

  function volverAEmpezar() {
    setFilas([]);
    setNombreArchivo(null);
    setResultado(null);
    setErrorArchivo(null);
    setErrorImportar(null);
  }

  // ── Paso 3: hecho ──────────────────────────────────────────
  if (resultado) {
    const { importados, informe } = resultado;
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2
            className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <p className="text-sm font-medium text-foreground">
            {importados} elemento{importados === 1 ? "" : "s"} importado
            {importados === 1 ? "" : "s"}
          </p>
          {informe.invalidas > 0 && (
            <p className="max-w-md text-[12.5px] text-muted-foreground">
              Se descartaron {informe.invalidas} fila
              {informe.invalidas === 1 ? "" : "s"} con problemas. Corrígelas en
              el archivo y vuelve a subirlo cuando quieras.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={volverAEmpezar}>
            Cargar otro archivo
          </Button>
          <Button onClick={onClose}>Listo</Button>
        </div>
      </div>
    );
  }

  // ── Paso 1: elegir archivo ─────────────────────────────────
  if (filas.length === 0) {
    return (
      <div className="space-y-5">
        <Paso
          numero={1}
          titulo="Descarga la plantilla"
          detalle={
            <>
              Trae las columnas que el sistema entiende. Solo{" "}
              <strong>Nombre</strong> es obligatorio; el serial no puede
              repetirse entre elementos activos, y si el elemento no tiene
              serial grabado se deja vacío.
            </>
          }
        >
          <Button variant="secondary" size="sm" onClick={descargarPlantilla}>
            Descargar plantilla
          </Button>
        </Paso>

        <Paso
          numero={2}
          titulo="Sube el archivo relleno"
          detalle={`Formato .xlsx, hasta ${MAX_FILAS_IMPORTACION} filas. Antes de guardar nada verás qué filas entran y cuáles no.`}
        >
          <Button
            size="sm"
            onClick={() => inputArchivo.current?.click()}
            disabled={leyendo}
          >
            {leyendo ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Leyendo…
              </>
            ) : (
              <>
                <FileUp className="h-4 w-4" aria-hidden />
                Elegir archivo
              </>
            )}
          </Button>
          <input
            ref={inputArchivo}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void elegirArchivo(f);
            }}
          />
        </Paso>

        {errorArchivo && <Aviso>{errorArchivo}</Aviso>}
      </div>
    );
  }

  // ── Paso 2: el informe ─────────────────────────────────────
  if (previo === undefined) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Revisando {filas.length} filas…
      </p>
    );
  }

  const invalidas = previo.filas.filter((f) => f.estado === "invalida");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Badge tone="success">{previo.validas} listas para importar</Badge>
        {previo.invalidas > 0 && (
          <Badge tone="destructive">{previo.invalidas} con problemas</Badge>
        )}
        {previo.vacias > 0 && (
          <Badge tone="neutral">{previo.vacias} en blanco (se saltan)</Badge>
        )}
      </div>

      {previo.validas === 0 && (
        <Aviso>
          Ninguna fila se puede importar. Corrige el archivo y vuelve a subirlo.
        </Aviso>
      )}

      {invalidas.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
            Filas con problemas
          </p>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="w-16 px-3 py-2 text-left font-medium text-muted-foreground">
                    Fila
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Contenido
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Problema
                  </th>
                </tr>
              </thead>
              <tbody>
                {invalidas.map((f) => (
                  <tr key={f.fila} className="border-t border-border/70 align-top">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {f.fila}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {f.estado === "invalida" &&
                        ([f.datos.nombre, f.datos.serial]
                          .filter(Boolean)
                          .join(" · ") ||
                          "(sin datos legibles)")}
                    </td>
                    <td className="px-3 py-2">
                      <ul className="space-y-0.5">
                        {f.estado === "invalida" &&
                          f.motivos.map((m, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-1.5 text-destructive"
                            >
                              <AlertTriangle
                                className="mt-0.5 h-3 w-3 shrink-0"
                                aria-hidden
                              />
                              <span>
                                {m.columna && <strong>{m.columna}: </strong>}
                                {m.mensaje}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Puedes corregir el archivo y volver a subirlo, o importar solo las
            filas válidas. Nada entra a medias: o se guarda todo lo que
            confirmes, o no se guarda nada.
          </p>
        </div>
      )}

      {errorImportar && <Aviso>{errorImportar}</Aviso>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={volverAEmpezar}
          className="text-[12.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Elegir otro archivo
        </button>
        {previo.validas > 0 && (
          <Button
            onClick={() => confirmar(previo.invalidas > 0)}
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {previo.invalidas > 0
              ? `Importar solo las ${previo.validas} válidas`
              : `Importar ${previo.validas} elementos`}
          </Button>
        )}
      </div>
    </div>
  );
}

function Paso({
  numero,
  titulo,
  detalle,
  children,
}: {
  numero: number;
  titulo: string;
  detalle: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-[13px] font-medium text-foreground">
        {numero} · {titulo}
      </p>
      <p className="text-[12.5px] text-muted-foreground">{detalle}</p>
      {children}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
      {children}
    </p>
  );
}
