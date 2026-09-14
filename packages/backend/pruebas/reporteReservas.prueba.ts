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
  opcionesXlsxReporteReservas,
  type FilaReporteReserva,
} from "../../../apps/web/lib/reporte-reservas.ts";

/**
 * EL REPORTE DE RESERVAS EN CSV Y EN EXCEL.
 *
 * El CSV ya se usaba: se le añade una columna al final y nada más, así que
 * aquí se compara contra el generador de ANTES, copiado tal cual estaba en el
 * componente. El Excel se abre de verdad —se descomprime y se leen las
 * celdas— para comprobar que el resumen va arriba, que la tabla es la misma
 * del CSV y que cifras, fechas y horas son números con formato, no texto.
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
  },
];

/** Como lo calcula `reservas.reporte` para estas filas. */
const RESUMEN = {
  total: 3,
  alquilerEsperado: 410000,
  alquilerRecibido: 150000,
  depositoRecibido: 50000,
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

test("el CSV es el de antes con Observaciones añadida al final", () => {
  const { lineas, esc } = csvDeAntes(FILAS);
  const obs = ["Observaciones", ...FILAS.map((f) => f.observaciones)];
  const esperado = lineas.map((l, i) => `${l},${esc(obs[i])}`).join("\n");
  assert.equal(csvReporteReservas(FILAS), esperado);
});

test("las observaciones con comas, comillas y saltos de línea no corren columnas", () => {
  const csv = csvReporteReservas(FILAS);
  assert.ok(csv.includes('"Cumpleaños, llevan ""decoración""\nsegunda línea & <más>"'));
  assert.ok(csv.split("\n")[0]!.endsWith(',"Observaciones"'));
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
      ["Depósito recibido", 50000, "moneda"],
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
  const sheet = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  const estilos = await zip.file("xl/styles.xml")!.async("string");
  const workbook = await zip.file("xl/workbook.xml")!.async("string");

  const celdas = new Map<string, Celda>();
  const re = /<c r="([A-Z]+\d+)" s="(\d+)"(?: t="inlineStr")?(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const m of sheet.matchAll(re)) {
    const interior = m[3] ?? "";
    const v = /<v>([^<]*)<\/v>/.exec(interior)?.[1];
    const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(interior)?.[1];
    celdas.set(m[1]!, { s: Number(m[2]), v, texto: t === undefined ? undefined : desescapar(t) });
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

  return { celdas, formatoDe, filaDe, sheet, workbook, estilos };
}

const LETRAS = "ABCDEFGHIJKLMN";

test("el Excel pone el resumen arriba y la tabla completa debajo", async () => {
  const opts = opcionesXlsxReporteReservas({
    filas: FILAS,
    resumen: RESUMEN,
    desde: "2026-09-01",
    hasta: "2026-09-30",
  });
  assert.equal(opts.nombreArchivo, "Reservas_2026-09-01_a_2026-09-30.xlsx");
  const { celdas, formatoDe, filaDe, sheet, workbook } = await abrir(await construirXlsxReporte(opts));

  const rResumen = filaDe("Resumen de reservas");
  const rTabla = filaDe("Reporte de reservas");
  const rCabecera = filaDe("Fecha");
  assert.equal(rResumen, 1);
  assert.ok(rResumen < rTabla && rTabla < rCabecera, "el resumen va antes que la tabla");
  assert.equal(rCabecera, rTabla + 1);
  /* Hay al menos una fila en blanco entre la última línea del resumen y el
     título de la tabla. */
  assert.ok(![...celdas.keys()].some((ref) => Number(ref.replace(/^[A-Z]+/, "")) === rTabla - 1));

  // Indicadores: número con formato, en la columna D y dentro del bloque.
  const esperados: Array<[string, number, string]> = [
    ["Número de reservas", 3, "#,##0"],
    ["Alquiler pactado estimado", 410000, '"$ "#,##0'],
    ["Depósito recibido", 50000, '"$ "#,##0'],
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

  // Cabecera de la tabla, igual a la del CSV.
  const cabeceraCsv = csvReporteReservas(FILAS).split("\n")[0]!.split(",").map((s) => s.slice(1, -1));
  const cabeceraXlsx = COLUMNAS_REPORTE_RESERVAS.map((_, j) => celdas.get(`${LETRAS[j]}${rCabecera}`)?.texto);
  assert.deepEqual(cabeceraXlsx, cabeceraCsv);
  assert.equal(cabeceraXlsx.at(-1), "Observaciones");

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
  // La casa "0012" sigue siendo texto: no pierde los ceros.
  assert.equal(celdas.get(`E${rCabecera + 2}`)?.texto, "0012");
  // Nada después de la última reserva.
  assert.equal(celdas.has(`A${rCabecera + 1 + FILAS.length}`), false);

  // Filtro sobre la tabla, y la cabecera se repite al imprimir.
  const ultima = rCabecera + FILAS.length;
  assert.ok(sheet.includes(`<autoFilter ref="A${rCabecera}:N${ultima}"/>`));
  assert.ok(workbook.includes(`'Reservas'!$A$${rCabecera}:$N$${ultima}`));
  assert.ok(workbook.includes(`'Reservas'!$${rCabecera}:$${rCabecera}`));
});

test("sin reservas el Excel se arma igual, sin filtro", async () => {
  const opts = opcionesXlsxReporteReservas({
    filas: [],
    resumen: { total: 0, alquilerEsperado: 0, alquilerRecibido: 0, depositoRecibido: 0 },
    desde: "2026-09-01",
    hasta: "2026-09-30",
  });
  const { sheet, workbook, filaDe } = await abrir(await construirXlsxReporte(opts));
  assert.ok(filaDe("Fecha") > 0);
  assert.ok(!sheet.includes("<autoFilter"));
  assert.ok(!workbook.includes("_FilterDatabase"));
});
