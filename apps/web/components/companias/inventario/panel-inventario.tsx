"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  Archive,
  Boxes,
  Building2,
  Download,
  FileUp,
  Package,
  Plus,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CellStack,
  Table,
  TableCard,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ImportarItemsDialog } from "./importar-dialog";
import { ItemDetalleDialog } from "./item-detalle-dialog";
import { ItemFormDialog } from "./item-form-dialog";
import { PorConjuntoDialog } from "./por-conjunto-dialog";

/**
 * El inventario de la compañía: listado, alta, carga masiva y archivo.
 *
 * Activos y archivados son dos vistas separadas y la separación la hace el
 * SERVIDOR, no un filtro de esta pantalla: que un elemento dado de baja no
 * salga entre los activos es una regla del modelo. Aquí solo se elige cuál de
 * las dos se pide.
 *
 * Lo que deliberadamente NO hay: nada de asignar elementos a conjuntos ni a
 * guardas. Eso son las tareas 2 y 3, y el backend todavía no lo permite.
 */

type Vista = "activos" | "archivados";

/**
 * Dónde está, que es OTRO eje que "archivado o no".
 *
 * El valor todos es de la pantalla, no del servidor: la query recibe
 * `custodia: undefined` para no filtrar. Mandar la cadena "todos" habría
 * obligado al backend a conocer un valor que no significa nada en el dominio.
 */
type FiltroCustodia = "todos" | "en_compania" | "en_condominio";

function fecha(ms: number): string {
  return new Date(ms).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PanelInventario({
  companiaId,
}: {
  companiaId: Id<"companiasSeguridad">;
}) {
  const [vista, setVista] = useState<Vista>("activos");
  const [busqueda, setBusqueda] = useState("");
  const [custodia, setCustodia] = useState<FiltroCustodia>("todos");
  const [creando, setCreando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [detalle, setDetalle] = useState<Id<"inventarioItems"> | null>(null);
  const [porConjunto, setPorConjunto] = useState(false);

  const conteos = useQuery(api.inventario.conteos, { companiaId });
  const datos = useQuery(api.inventario.listar, {
    companiaId,
    archivo: vista,
    busqueda: busqueda.trim() || undefined,
    /* Un elemento archivado nunca está entregado, así que filtrar por custodia
     * en el archivo solo produciría listas vacías y confusión. */
    custodia:
      vista === "archivados" || custodia === "todos" ? undefined : custodia,
  });

  async function exportar() {
    if (!datos || datos.items.length === 0) return;
    const { descargarXlsx } = await import("@/lib/excel-simple");
    await descargarXlsx({
      /* El nombre dice si lo exportado esta filtrado. Se exporta lo que se ve
       * —es lo que espera quien acaba de buscar— pero un archivo llamado
       * "inventario-activos" con solo los radios dentro se archiva y meses
       * despues se toma por el inventario completo. */
      nombreArchivo: busqueda.trim()
        ? `inventario-${vista}-filtrado`
        : `inventario-${vista}`,
      hoja: "Inventario",
      encabezados: [
        "Nombre",
        "Serial",
        "Descripcion",
        "Estado",
        "Ubicacion",
        "Registrado",
      ],
      filas: datos.items.map((i) => [
        i.nombre,
        i.serial ?? "",
        i.descripcion ?? "",
        i.archivado ? "Archivado" : i.estado,
        /* La ubicación va en su propia columna y no mezclada con el estado:
         * es la misma separación de ejes que sostiene el modelo. */
        i.asignacion
          ? i.asignacion.condominioNombre
          : datos.custodiaIncompleta
            ? "Sin determinar"
            : "En la compañía",
        fecha(i.createdAt),
      ]),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-muted p-1">
          <Pestana
            activa={vista === "activos"}
            onClick={() => setVista("activos")}
            icono={Package}
            label="En inventario"
            n={conteos?.activos}
            aproximado={conteos?.activosAproximado}
          />
          <Pestana
            activa={vista === "archivados"}
            onClick={() => setVista("archivados")}
            icono={Archive}
            label="Archivados"
            n={conteos?.archivados}
            aproximado={conteos?.archivadosAproximado}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportar}
            disabled={!datos || datos.items.length === 0}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exportar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPorConjunto(true)}
          >
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            Por conjunto
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setImportando(true)}>
            <FileUp className="h-3.5 w-3.5" aria-hidden />
            Cargar Excel
          </Button>
          <Button size="sm" onClick={() => setCreando(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nuevo elemento
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, serial o descripción…"
          className="max-w-md"
        />
        {vista === "activos" && (
          <Select
            value={custodia}
            onChange={(e) => setCustodia(e.target.value as FiltroCustodia)}
            className="w-auto"
            aria-label="Filtrar por ubicación"
          >
            <option value="todos">Todas las ubicaciones</option>
            <option value="en_compania">En la compañía</option>
            <option value="en_condominio">En un conjunto</option>
          </Select>
        )}
      </div>

      {datos === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : datos.items.length === 0 ? (
        <Vacio
          vista={vista}
          /* El selector de ubicación solo se pinta en "activos", pero su
             estado sobrevive al cambio de pestaña: sin acotarlo aquí, la
             pestaña de archivados decía "cambia la ubicación" señalando un
             control que no está a la vista. */
          buscando={
            busqueda.trim().length > 0 ||
            (vista === "activos" && custodia !== "todos")
          }
          onCrear={() => setCreando(true)}
          onImportar={() => setImportando(true)}
        />
      ) : (
        <>
          <TableCard>
            <Table>
              <THead>
                <TR>
                  <TH className="w-16">Foto</TH>
                  <TH>Elemento</TH>
                  <TH>Serial</TH>
                  <TH>Ubicación</TH>
                  <TH>Estado</TH>
                  <TH className="text-right">
                    {vista === "archivados" ? "Archivado" : "Registrado"}
                  </TH>
                </TR>
              </THead>
              <TBody>
                {datos.items.map((i) => (
                  <TR
                    key={i._id}
                    className="cursor-pointer hover:bg-accent/60"
                    onClick={() => setDetalle(i._id)}
                  >
                    <TD>
                      {i.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={i.fotoUrl}
                          alt=""
                          className="h-10 w-10 rounded-lg border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
                          <Package
                            className="h-4 w-4 text-muted-foreground"
                            aria-hidden
                          />
                        </div>
                      )}
                    </TD>
                    <TD>
                      <CellStack
                        primary={i.nombre}
                        secondary={i.descripcion ?? undefined}
                      />
                    </TD>
                    <TD>
                      <span className="font-mono text-[12.5px] text-muted-foreground">
                        {i.serial ?? "—"}
                      </span>
                    </TD>
                    <TD>
                      {i.asignacion ? (
                        <Badge tone="info">
                          <Building2 className="h-3 w-3" aria-hidden />
                          {i.asignacion.condominioNombre}
                        </Badge>
                      ) : datos.custodiaIncompleta ? (
                        /* Sin custodia en un mapa que se quedó corto NO
                           significa "está en la bodega": significa que no se
                           sabe. Afirmar lo primero sería mentir sobre dónde
                           está un objeto físico. */
                        <span
                          className="text-[12.5px] text-muted-foreground"
                          title="Hay más elementos entregados de los que caben en una consulta. Abre la ficha del elemento para ver dónde está."
                        >
                          —
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-muted-foreground">
                          En la compañía
                        </span>
                      )}
                    </TD>
                    <TD>
                      {i.archivado ? (
                        <Badge tone="neutral">Archivado</Badge>
                      ) : (
                        <Badge tone="success">{i.estado}</Badge>
                      )}
                    </TD>
                    <TD className="text-right text-[12.5px] text-muted-foreground">
                      {fecha(
                        vista === "archivados" && i.archivadoEn
                          ? i.archivadoEn
                          : i.createdAt,
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableCard>

          {(busqueda.trim() || datos.truncado || datos.custodiaIncompleta) && (
            <p className="text-[12.5px] text-muted-foreground">
              {busqueda.trim() && (
                <>
                  {datos.total} de {datos.totalSinFiltrar}{" "}
                  {vista === "archivados" ? "archivados" : "en inventario"}.{" "}
                </>
              )}
              {/* Callar el tope seria peor que el tope: quien busca un
                  elemento y no lo ve concluye que no existe. */}
              {datos.truncado &&
                "Hay más elementos de los que caben en la lista; usa el buscador para llegar a uno concreto. "}
              {datos.custodiaIncompleta &&
                "Hay más elementos entregados de los que caben en una consulta: los marcados con “—” pueden estar en un conjunto."}
            </p>
          )}
        </>
      )}

      {creando && (
        <ItemFormDialog
          companiaId={companiaId}
          onClose={() => setCreando(false)}
          onGuardado={(id) => setDetalle(id)}
        />
      )}
      {importando && (
        <ImportarItemsDialog
          companiaId={companiaId}
          onClose={() => setImportando(false)}
        />
      )}
      {detalle && (
        <ItemDetalleDialog itemId={detalle} onClose={() => setDetalle(null)} />
      )}
      {porConjunto && (
        <PorConjuntoDialog
          companiaId={companiaId}
          onClose={() => setPorConjunto(false)}
        />
      )}
    </div>
  );
}

function Pestana({
  activa,
  onClick,
  icono: Icono,
  label,
  n,
  aproximado,
}: {
  activa: boolean;
  onClick: () => void;
  icono: typeof Package;
  label: string;
  n: number | undefined;
  /** El conteo llego al tope de lectura: se pinta "2000+" y no "2000". */
  aproximado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
        activa
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icono className="h-3.5 w-3.5" aria-hidden />
      {label}
      {n != null && (
        <span className="tabular-nums text-muted-foreground">
          {n}
          {aproximado ? "+" : ""}
        </span>
      )}
    </button>
  );
}

function Vacio({
  vista,
  buscando,
  onCrear,
  onImportar,
}: {
  vista: Vista;
  buscando: boolean;
  onCrear: () => void;
  onImportar: () => void;
}) {
  if (buscando) {
    return (
      <EmptyState
        icon={Boxes}
        title="Sin resultados"
        description="Ningún elemento coincide con los filtros. Prueba con otra palabra, cambia la ubicación o revisa la otra pestaña."
      />
    );
  }
  if (vista === "archivados") {
    return (
      <EmptyState
        icon={Archive}
        title="No hay elementos archivados"
        description="Cuando des de baja un elemento aparecerá aquí. No se borra nunca: su historial se conserva entero."
      />
    );
  }
  return (
    <EmptyState
      icon={Boxes}
      title="El inventario está vacío"
      description="Añade los elementos de la compañía uno a uno, o carga varios de golpe con un archivo de Excel."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={onImportar}>
            <FileUp className="h-4 w-4" aria-hidden />
            Cargar Excel
          </Button>
          <Button onClick={onCrear}>
            <Plus className="h-4 w-4" aria-hidden />
            Nuevo elemento
          </Button>
        </div>
      }
    />
  );
}
