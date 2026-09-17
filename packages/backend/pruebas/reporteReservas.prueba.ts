import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  construirXlsxReporte,
  fechaASerialExcel,
  horaAFraccionExcel,
} from "../../../apps/web/lib/excel-reporte.ts";
import {
  COLUMNAS_REPORTE_RESERVAS,
  csvReporteReservas,
  filasReporteReservas,
  indicadoresResumenReservas,
  nombreArchivoReporteReservas,
  opcionesXlsxReporteReservas,
  type FilaReporteReserva,
} from "../../../apps/web/lib/reporte-reservas.ts";

/**
 * EL REPORTE DE RESERVAS EN CSV Y EN EXCEL.
 *
 * El CSV ya se usaba: se le añaden columnas al final y nada más, así que
 * aquí se compara contra el generador de ANTES, copiado tal cual estaba en el
 * componente. El Excel se abre de verdad —se descomprime y se leen las
 * celdas— para comprobar que el resumen va arriba, que la tabla es la misma
 * del CSV, que cifras, fechas y horas son números con formato y que la tabla
 * es una tabla de Excel con filtro en sus encabezados (Estado incluido).
 *
 * El filtro por estado se aplica en el servidor y se prueba en
 * `cajaReserva.test.ts`; aquí solo cómo se refleja en el archivo.
 */

const FILAS: FilaReporteReserva[] = [
  {
    fecha: "2026-09-16",
    horaInicio: "10:00",
    horaFin: "12:00",
    zonaNombre: "SALÓN PRIMER PISO + BBQ + 10 INGRESOS A PISCINA",
    unidadNumero: "409",
    solicitanteNombre: "CAMILO ANDRES RIVEROS LESMES",
    estado: "aprobada",
    valorReserva: 260000,
    pagoAlquilerMonto: null,
    depositoRequerido: 60000,
    depositoRecibido: null,
    depositoEstado: null,
    depositoRetencion: null,
    observaciones: 'Cumpleaños, llevan "decoración"\nsegunda línea & <más>',
    valorIncidentes: 0,
    descripcionIncidentes: "",
  },
  {
    fecha: "2026-09-20",
    horaInicio: "14:00",
    horaFin: "18:30",
    zonaNombre: "Salón, primer piso",
    unidadNumero: "0012",
    solicitanteNombre: "Ana",
    estado: "aprobada",
    valorReserva: 150000,
    pagoAlquilerMonto: 150000,
    depositoRequerido: 50000,
    depositoRecibido: 50000,
    depositoEstado: "no_devuelto",
    depositoRetencion: "Se dañó el mesón",
    observaciones: null,
    /* Mayor que el depósito: la columna dice lo valorado, no lo descontado. */
    valorIncidentes: 80000,
    /* Dos incidentes unidos por el servidor, uno de ellos sin valorar: la
       descripción cuenta lo que pasó y la cifra solo lo valorado. */
    descripcionIncidentes: "Se dañó el mesón · Vidrio roto",
  },
  {
    fecha: "2026-09-25",
    horaInicio: "08:00",
    horaFin: "09:00",
    zonaNombre: "Cancha",
    unidadNumero: "7",
    solicitanteNombre: "Luis",
    estado: "cancelada",
    valorReserva: null,
    pagoAlquilerMonto: null,
    depositoRequerido: null,
    depositoRecibido: null,
    depositoEstado: null,
    depositoRetencion: null,
    observaciones: "",
    valorIncidentes: 0,
    descripcionIncidentes: "",
  },
];

/** Como lo calcula `reservas.reporte` para estas filas. */
const RESUMEN = {
  total: 3,
  alquilerEsperado: 410000,
  alquilerRecibido: 150000,
  valorIncidentes: 80000,
};

/** El generador del CSV tal como estaba en `reporte-reservas.tsx`. */
function csvDeAntes(filas: FilaReporteReserva[]) {
  const ESTADO_DEPOSITO: Record<string, string> = {
    registrado: "Sin devolver",
    devuelto: "Devuelto",
    no_devuelto: "Retenido",
  };
  const cab = [
    "Fecha", "Inicio", "Fin", "Zona", "Casa", "Solicitante",
    "Estado", "Valor reserva", "Alquiler cobrado", "Deposito esperado",
    "Deposito recibido", "Estado deposito", "Retencion",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = filas.map((f) => [
    f.fecha, f.horaInicio, f.horaFin, f.zonaNombre, f.unidadNumero,
    f.solicitanteNombre, f.estado,
    f.valorReserva ?? "",
    f.pagoAlquilerMonto ?? "",
    f.depositoRequerido ?? "",
    f.depositoRecibido ?? "",
    f.depositoEstado
      ? ESTADO_DEPOSITO[f.depositoEstado] ?? f.depositoEstado
      : f.depositoRequerido
        ? "Sin registrar"
        : "",
    f.depositoRetencion ?? "",
  ]);
  return { lineas: [cab, ...rows].map((r) => r.map(esc).join(",")), esc };
}

// ─────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────

test("el CSV es el de antes con Observaciones, Valor y Descripción de incidentes al final", () => {
  const { lineas, esc } = csvDeAntes(FILAS);
  const obs = ["Observaciones", ...FILAS.map((f) => f.observaciones)];
  const inc = ["Valor de incidentes", ...FILAS.map((f) => f.valorIncidentes)];
  const desc = ["Descripción del incidente", ...FILAS.map((f) => f.descripcionIncidentes)];
  const esperado = lineas
    .map((l, i) => `${l},${esc(obs[i])},${esc(inc[i])},${esc(desc[i])}`)
    .join("\n");
  assert.equal(csvReporteReservas(FILAS), esperado);
});

test("la descripción del incidente va por reserva, y vacía cuando no tuvo", () => {
  /* La primera reserva ocupa dos líneas: su observación trae un salto. */
  const lineas = csvReporteReservas(FILAS).split("\n");
  assert.ok(lineas[2]!.endsWith(',"0",""'), "sin incidentes, celda vacía");
  assert.ok(lineas[3]!.endsWith(',"80000","Se dañó el mesón · Vidrio roto"'));
  assert.ok(lineas[4]!.endsWith(',"0",""'), "la cancelada tampoco tuvo");
});

test("las observaciones con comas, comillas y saltos de línea no corren columnas", () => {
  const csv = csvReporteReservas(FILAS);
  assert.ok(csv.includes('"Cumpleaños, llevan ""decoración""\nsegunda línea & <más>"'));
  assert.ok(
    csv.split("\n")[0]!.endsWith(',"Observaciones","Valor de incidentes","Descripción del incidente"'),
  );
});

test("sin estado el archivo se llama como siempre; con estado lo lleva en el nombre", () => {
  assert.equal(nombreArchivoReporteReservas("2026-09-01", "2026-09-30", "csv"), "Reservas_2026-09-01_a_2026-09-30.csv");
  assert.equal(nombreArchivoReporteReservas("2026-09-01", "2026-09-30", "csv", null), "Reservas_2026-09-01_a_2026-09-30.csv");
  assert.equal(
    nombreArchivoReporteReservas("2026-09-01", "2026-09-30", "xlsx", "cancelada"),
    "Reservas_2026-09-01_a_2026-09-30_cancelada.xlsx",
  );
});

// ─────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────

test("el resumen toma las cifras del servidor, sin recalcularlas", () => {
  assert.deepEqual(
    indicadoresResumenReservas(RESUMEN).map((i) => [i.etiqueta, i.valor, i.tipo]),
    [
      ["Número de reservas", 3, "entero"],
      ["Alquiler pactado estimado", 410000, "moneda"],
      ["Valor de incidentes", 80000, "moneda"],
      ["Total ingresos", 150000, "moneda"],
    ],
  );
});

// ─────────────────────────────────────────────────────────────
// Fechas y horas
// ─────────────────────────────────────────────────────────────

test("fechas y horas se convierten al número que usa Excel", () => {
  assert.equal(fechaASerialExcel("1900-03-01"), 61);
  assert.equal(fechaASerialExcel("2024-01-01"), 45292);
  assert.equal(fechaASerialExcel("2026-09-16"), 46281);
  assert.equal(fechaASerialExcel("2026-02-30"), null);
  assert.equal(fechaASerialExcel("16/09/2026"), null);
  assert.equal(horaAFraccionExcel("00:00"), 0);
  assert.equal(horaAFraccionExcel("12:00"), 0.5);
  assert.equal(horaAFraccionExcel("18:30"), (18 * 60 + 30) / 1440);
  assert.equal(horaAFraccionExcel("24:00"), null);
});

// ─────────────────────────────────────────────────────────────
// XLSX
// ─────────────────────────────────────────────────────────────

type Celda = { s: number; v?: string; texto?: string };

const desescapar = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

async function abrir(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const leer = async (ruta: string) => (await zip.file(ruta)?.async("string")) ?? null;
  const sheet = (await leer("xl/worksheets/sheet1.xml"))!;
  const estilos = (await leer("xl/styles.xml"))!;
  const workbook = (await leer("xl/workbook.xml"))!;
  const tipos = (await leer("[Content_Types].xml"))!;
  const sst = (await leer("xl/sharedStrings.xml"))!;
  const tabla = await leer("xl/tables/table1.xml");
  const relsHoja = await leer("xl/worksheets/_rels/sheet1.xml.rels");

  const cadenas = [...sst.matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g)].map((m) => desescapar(m[1]!));

  const celdas = new Map<string, Celda>();
  const re = /<c r="([A-Z]+\d+)" s="(\d+)"( t="s")?(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const m of sheet.matchAll(re)) {
    const v = /<v>([^<]*)<\/v>/.exec(m[4] ?? "")?.[1];
    celdas.set(
      m[1]!,
      m[3] ? { s: Number(m[2]), texto: cadenas[Number(v)] } : { s: Number(m[2]), v },
    );
  }

  const propios = new Map<number, string>();
  for (const m of estilos.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"\/>/g)) {
    propios.set(Number(m[1]), desescapar(m[2]!));
  }
  const incorporados: Record<number, string> = { 0: "General", 3: "#,##0", 49: "@" };
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)![1]!;
  const fmtIds = [...cellXfs.matchAll(/<xf numFmtId="(\d+)"/g)].map((m) => Number(m[1]));
  const formatoDe = (s: number) => {
    const id = fmtIds[s]!;
    return propios.get(id) ?? incorporados[id] ?? `#${id}`;
  };

  const filaDe = (texto: string) => {
    for (const [ref, c] of celdas) {
      if (/^A\d+$/.test(ref) && c.texto === texto) return Number(ref.slice(1));
    }
    return -1;
  };

  return { celdas, formatoDe, filaDe, sheet, workbook, estilos, tipos, tabla, relsHoja };
}

const LETRAS = "ABCDEFGHIJKLMNOP";

test("el Excel pone el resumen arriba y la tabla completa debajo", async () => {
  const opts = opcionesXlsxReporteReservas({
    filas: FILAS,
    resumen: RESUMEN,
    desde: "2026-09-01",
    hasta: "2026-09-30",
  });
  assert.equal(opts.nombreArchivo, "Reservas_2026-09-01_a_2026-09-30.xlsx");
  const { celdas, formatoDe, filaDe, sheet } = await abrir(await construirXlsxReporte(opts));

  const rResumen = filaDe("Resumen de reservas");
  const rTabla = filaDe("Reporte de reservas");
  const rCabecera = filaDe("Fecha");
  assert.equal(rResumen, 1);
  assert.ok(rResumen < rTabla && rTabla < rCabecera, "el resumen va antes que la tabla");
  assert.equal(celdas.get("A2")?.texto, "Del 2026-09-01 al 2026-09-30  ·  Estado: Todos");
  // Separación: la fila anterior al título de la tabla está vacía.
  assert.ok(![...celdas.keys()].some((ref) => Number(ref.replace(/^[A-Z]+/, "")) === rTabla - 1));
  // Los dos títulos de sección llevan la raya de lado a lado.
  assert.equal(celdas.get(`P${rResumen}`)?.s, celdas.get(`A${rResumen}`)?.s);
  assert.equal(celdas.get(`P${rTabla}`)?.s, celdas.get(`A${rTabla}`)?.s);

  // Indicadores: número con formato, en la columna D y dentro del bloque.
  const esperados: Array<[string, number, string]> = [
    ["Número de reservas", 3, "#,##0"],
    ["Alquiler pactado estimado", 410000, '"$ "#,##0'],
    ["Valor de incidentes", 80000, '"$ "#,##0'],
    ["Total ingresos", 150000, '"$ "#,##0'],
  ];
  let anterior = rResumen;
  for (const [etiqueta, valor, formato] of esperados) {
    const r = filaDe(etiqueta);
    assert.ok(r > anterior && r < rTabla, `${etiqueta} dentro del resumen y en orden`);
    anterior = r;
    const c = celdas.get(`D${r}`)!;
    assert.equal(c.texto, undefined, `${etiqueta} no es texto`);
    assert.equal(Number(c.v), valor);
    assert.equal(formatoDe(c.s), formato);
    assert.ok(sheet.includes(`<mergeCell ref="A${r}:C${r}"/>`));
  }
  // Total ingresos se distingue de los otros indicadores.
  assert.notEqual(
    celdas.get(`D${filaDe("Total ingresos")}`)!.s,
    celdas.get(`D${filaDe("Valor de incidentes")}`)!.s,
  );

  // Cabecera de la tabla, igual a la del CSV.
  const cabeceraCsv = csvReporteReservas(FILAS).split("\n")[0]!.split(",").map((s) => s.slice(1, -1));
  const cabeceraXlsx = COLUMNAS_REPORTE_RESERVAS.map((_, j) => celdas.get(`${LETRAS[j]}${rCabecera}`)?.texto);
  assert.deepEqual(cabeceraXlsx, cabeceraCsv);
  assert.equal(cabeceraXlsx.at(-2), "Valor de incidentes");
  assert.equal(cabeceraXlsx.at(-1), "Descripción del incidente");

  // Filas: mismas reservas y mismos valores que el CSV, con su tipo de Excel.
  const valores = filasReporteReservas(FILAS);
  valores.forEach((fila, i) => {
    const r = rCabecera + 1 + i;
    COLUMNAS_REPORTE_RESERVAS.forEach((col, j) => {
      const ref = `${LETRAS[j]}${r}`;
      const c = celdas.get(ref)!;
      assert.ok(c, `existe ${ref}`);
      const esperado = fila[j];
      if (esperado == null || esperado === "") {
        assert.equal(c.v, undefined, `${ref} vacía`);
        assert.equal(c.texto, undefined, `${ref} vacía`);
        return;
      }
      switch (col.tipo) {
        case "fecha":
          assert.equal(Number(c.v), fechaASerialExcel(String(esperado)), ref);
          assert.equal(formatoDe(c.s), "yyyy-mm-dd", ref);
          break;
        case "hora":
          assert.ok(Math.abs(Number(c.v) - horaAFraccionExcel(String(esperado))!) < 1e-12, ref);
          assert.equal(formatoDe(c.s), "hh:mm", ref);
          break;
        case "moneda":
          assert.equal(c.texto, undefined, `${ref} no es texto`);
          assert.equal(Number(c.v), esperado, ref);
          assert.equal(formatoDe(c.s), '"$ "#,##0', ref);
          break;
        default:
          assert.equal(c.texto, String(esperado), ref);
      }
    });
  });
  // Sin incidentes la celda es un 0 con formato de moneda, no una celda vacía.
  assert.equal(celdas.get(`O${rCabecera + 1}`)?.v, "0");
  assert.equal(formatoDe(celdas.get(`O${rCabecera + 1}`)!.s), '"$ "#,##0');
  assert.equal(Number(celdas.get(`O${rCabecera + 2}`)?.v), 80000);
  // La descripción sí queda en blanco sin incidentes, y es texto cuando los hay.
  assert.equal(celdas.get(`P${rCabecera + 1}`)?.texto, undefined);
  assert.equal(celdas.get(`P${rCabecera + 1}`)?.v, undefined);
  assert.equal(celdas.get(`P${rCabecera + 2}`)?.texto, "Se dañó el mesón · Vidrio roto");
  // La casa "0012" sigue siendo texto: no pierde los ceros.
  assert.equal(celdas.get(`E${rCabecera + 2}`)?.texto, "0012");
  // La fila con observación de dos líneas es más alta que una de una línea.
  const alto = (r: number) => Number(new RegExp(`<row r="${r}" ht="([\\d.]+)"`).exec(sheet)![1]);
  assert.ok(alto(rCabecera + 1) > alto(rCabecera + 2));
  // Nada después de la última reserva.
  assert.equal(celdas.has(`A${rCabecera + 1 + FILAS.length}`), false);
});

test("la tabla principal es una tabla de Excel con filtro, Estado incluido", async () => {
  const opts = opcionesXlsxReporteReservas({ filas: FILAS, resumen: RESUMEN, desde: "2026-09-01", hasta: "2026-09-30" });
  const { filaDe, sheet, workbook, tipos, tabla, relsHoja, estilos } = await abrir(await construirXlsxReporte(opts));
  const rCabecera = filaDe("Fecha");
  const ref = `A${rCabecera}:P${rCabecera + FILAS.length}`;

  assert.ok(tabla, "existe xl/tables/table1.xml");
  assert.ok(tabla.includes(`ref="${ref}"`));
  assert.ok(tabla.includes(`<autoFilter ref="${ref}"/>`), "la tabla trae los botones de filtro");
  assert.ok(tabla.includes(`displayName="TablaReservas"`));
  const nombres = [...tabla.matchAll(/<tableColumn id="\d+" name="([^"]*)"\/>/g)].map((m) => desescapar(m[1]!));
  assert.deepEqual(nombres, COLUMNAS_REPORTE_RESERVAS.map((c) => c.encabezado));
  assert.ok(nombres.includes("Estado"));

  // Enlazada desde la hoja y declarada en el paquete.
  assert.ok(sheet.includes(`<tablePart r:id="rId1"/>`));
  assert.ok(relsHoja?.includes(`Target="../tables/table1.xml"`));
  assert.ok(tipos.includes(`PartName="/xl/tables/table1.xml"`));
  // Un filtro suelto en la hoja chocaría con el de la tabla.
  assert.ok(!sheet.includes("<autoFilter"));
  assert.ok(!workbook.includes("_FilterDatabase"));
  // El estilo de la tabla existe en la hoja de estilos.
  const estilo = /<tableStyleInfo name="([^"]+)"/.exec(tabla)![1]!;
  assert.ok(estilos.includes(`<tableStyle name="${estilo}"`));
  // La cabecera se repite al imprimir.
  assert.ok(workbook.includes(`'Reservas'!$${rCabecera}:$${rCabecera}`));
});

test("el Excel dice por qué estado se filtró", async () => {
  const opts = opcionesXlsxReporteReservas({
    filas: FILAS.filter((f) => f.estado === "cancelada"),
    resumen: { total: 1, alquilerEsperado: 0, alquilerRecibido: 0, valorIncidentes: 0 },
    desde: "2026-09-01",
    hasta: "2026-09-30",
    estado: "cancelada",
  });
  assert.equal(opts.nombreArchivo, "Reservas_2026-09-01_a_2026-09-30_cancelada.xlsx");
  const { celdas, filaDe } = await abrir(await construirXlsxReporte(opts));
  assert.equal(celdas.get("A2")?.texto, "Del 2026-09-01 al 2026-09-30  ·  Estado: Cancelada");
  const rCabecera = filaDe("Fecha");
  assert.equal(celdas.get(`G${rCabecera + 1}`)?.texto, "cancelada");
  assert.equal(celdas.has(`A${rCabecera + 2}`), false);
});

test("sin reservas el Excel se arma igual, sin tabla ni filtro", async () => {
  const opts = opcionesXlsxReporteReservas({
    filas: [],
    resumen: { total: 0, alquilerEsperado: 0, alquilerRecibido: 0, valorIncidentes: 0 },
    desde: "2026-09-01",
    hasta: "2026-09-30",
  });
  const { sheet, workbook, filaDe, tabla, tipos } = await abrir(await construirXlsxReporte(opts));
  assert.ok(filaDe("Fecha") > 0);
  assert.equal(tabla, null);
  assert.ok(!sheet.includes("<autoFilter") && !sheet.includes("<tableParts"));
  assert.ok(!tipos.includes("/xl/tables/"));
  assert.ok(!workbook.includes("_FilterDatabase"));
});
