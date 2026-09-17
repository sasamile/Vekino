import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { construirXlsxReporte, fechaASerialExcel } from "../../../apps/web/lib/excel-reporte.ts";
import { rolActorDeposito } from "../convex/model/roles.ts";
import {
  COLUMNAS_AUDITORIA_DEPOSITOS,
  fechaBogota,
  filasAuditoriaDepositos,
  filtrarAuditoria,
  horaBogota,
  indicadoresAuditoriaDepositos,
  nombreArchivoAuditoriaDepositos,
  opcionesXlsxAuditoriaDepositos,
  resumirAuditoria,
  type FilaAuditoriaDeposito,
} from "../../../apps/web/lib/auditoria-depositos.ts";

/**
 * LA AUDITORÍA DE DEPÓSITOS, SIN NAVEGADOR.
 *
 * Lo que se prueba aquí es lo que decide qué se ve y qué se escribe: el
 * filtrado, los totales de lo filtrado y el Excel —que se abre de verdad, se
 * descomprime y se leen sus celdas—. Que la consulta traiga los depósitos
 * correctos y con el sello del rol es de `auditoriaDepositos.test.ts`, que
 * corre las mutaciones reales.
 *
 * El caso que más importa es el del dato que NO existe: un depósito anterior
 * a que se guardara el rol no puede salir con el rol de hoy, y uno sin
 * devolver no puede salir con fecha de devolución.
 */

/* Instantes fijos en hora de Colombia: 2026-09-16 09:30 y 2026-09-20 14:05. */
const RECIBIDO_A = new Date("2026-09-16T09:30:00-05:00").getTime();
const RECIBIDO_B = new Date("2026-09-18T08:00:00-05:00").getTime();
const DEVUELTO_B = new Date("2026-09-20T14:05:00-05:00").getTime();
const RECIBIDO_C = new Date("2026-09-19T20:00:00-05:00").getTime();
const DEVUELTO_C = new Date("2026-09-21T10:00:00-05:00").getTime();

/** En custodia, con un incidente valorado y otro sin valorar. */
const EN_CUSTODIA: FilaAuditoriaDeposito = {
  reservaId: "res_a",
  fecha: "2026-09-16",
  horaInicio: "10:00",
  horaFin: "12:00",
  zonaNombre: "Salón, primer piso",
  unidadNumero: "409",
  solicitanteNombre: "CAMILO ANDRÉS RIVEROS",
  estadoReserva: "aprobada",
  monto: 60000,
  estado: "registrado",
  fechaRegistro: RECIBIDO_A,
  recibidoPorNombre: "Pedro Guarda",
  recibidoPorRol: "guardia",
  recibidoOrigen: "porteria",
  observacionesIngreso: "Recibido en efectivo",
  fechaResolucion: null,
  resueltoPorNombre: null,
  resueltoPorRol: null,
  resueltoOrigen: null,
  motivoDevolucion: null,
  devuelto: null,
  descontado: null,
  enCustodia: 60000,
  saldoPrevisto: 50000,
  cifrasCongeladas: false,
  valorIncidentes: 10000,
  descripcionIncidentes: "Silla rota · Sin valorar",
  incidentes: 2,
};

/** Devuelto parcial por incidentes, con las cifras congeladas. */
const PARCIAL: FilaAuditoriaDeposito = {
  reservaId: "res_b",
  fecha: "2026-09-18",
  horaInicio: "14:00",
  horaFin: "18:00",
  zonaNombre: "Cancha",
  unidadNumero: "0012",
  solicitanteNombre: "Ana Núñez",
  estadoReserva: "aprobada",
  monto: 50000,
  estado: "devuelto_parcial",
  fechaRegistro: RECIBIDO_B,
  recibidoPorNombre: "Pedro Guarda",
  recibidoPorRol: "guardia",
  recibidoOrigen: "porteria",
  observacionesIngreso: null,
  fechaResolucion: DEVUELTO_B,
  resueltoPorNombre: "Marta Admin",
  resueltoPorRol: "administrador",
  resueltoOrigen: "administracion",
  motivoDevolucion: "Se dañó el mesón",
  devuelto: 30000,
  descontado: 20000,
  enCustodia: 0,
  saldoPrevisto: null,
  cifrasCongeladas: true,
  valorIncidentes: 20000,
  descripcionIncidentes: "Mesón roto",
  incidentes: 1,
};

/** Devuelto completo, ANTES de que se guardaran el rol y las cifras. */
const HISTORICO: FilaAuditoriaDeposito = {
  reservaId: "res_c",
  fecha: "2026-09-19",
  horaInicio: "08:00",
  horaFin: "09:00",
  zonaNombre: "BBQ",
  unidadNumero: "7",
  solicitanteNombre: "Luis",
  estadoReserva: "aprobada",
  monto: 40000,
  estado: "devuelto",
  fechaRegistro: RECIBIDO_C,
  recibidoPorNombre: "Quien fuera",
  recibidoPorRol: null,
  recibidoOrigen: null,
  observacionesIngreso: null,
  fechaResolucion: DEVUELTO_C,
  resueltoPorNombre: "Quien fuera",
  resueltoPorRol: null,
  resueltoOrigen: null,
  motivoDevolucion: null,
  devuelto: 40000,
  descontado: 0,
  enCustodia: 0,
  saldoPrevisto: null,
  cifrasCongeladas: false,
  valorIncidentes: 0,
  descripcionIncidentes: "",
  incidentes: 0,
};

const FILAS = [EN_CUSTODIA, PARCIAL, HISTORICO];
const TODOS = { busqueda: "", estado: "" as const, incidentes: "todos" as const };

// ─────────────────────────────────────────────────────────────
// El rol con el que se actúa
// ─────────────────────────────────────────────────────────────

test("el rol se resuelve por responsabilidad, no por la ventanilla", () => {
  /* Un administrador que opera la portería sigue siendo administrador. */
  assert.equal(
    rolActorDeposito({ roles: ["administrador", "guardia"], esPlataforma: false, origen: "porteria" }),
    "administrador",
  );
  assert.equal(
    rolActorDeposito({ roles: ["guardia"], esPlataforma: false, origen: "porteria" }),
    "guardia",
  );
  assert.equal(
    rolActorDeposito({ roles: ["contadora"], esPlataforma: false, origen: "administracion" }),
    "contadora",
  );
  assert.equal(
    rolActorDeposito({ roles: ["junta_directiva"], esPlataforma: false, origen: "administracion" }),
    "junta_directiva",
  );
});

test("sin membresía manda quién es: staff de plataforma o guarda de la compañía", () => {
  /* El staff de Vekino entra a cualquier conjunto por soporte y no es un
     cargo del conjunto; el guarda de la empresa de vigilancia no tiene fila
     en `memberships` y solo llega por la portería. */
  assert.equal(rolActorDeposito({ esPlataforma: true, origen: "administracion" }), "plataforma");
  assert.equal(rolActorDeposito({ esPlataforma: true, origen: "porteria" }), "plataforma");
  assert.equal(rolActorDeposito({ esPlataforma: false, origen: "porteria" }), "guardia");
  /* Roles que no operan depósitos no cuentan: no se llega aquí con ellos. */
  assert.equal(
    rolActorDeposito({ roles: ["propietario"], esPlataforma: true, origen: "administracion" }),
    "plataforma",
  );
});

// ─────────────────────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────────────────────

test("sin filtros no se pierde ninguna fila y el orden es el del servidor", () => {
  assert.deepEqual(
    filtrarAuditoria(FILAS, TODOS).map((f) => f.reservaId),
    ["res_a", "res_b", "res_c"],
  );
});

test("la búsqueda no pide tildes ni mayúsculas, y también encuentra por responsable", () => {
  const ids = (busqueda: string) =>
    filtrarAuditoria(FILAS, { ...TODOS, busqueda }).map((f) => f.reservaId);
  assert.deepEqual(ids("nunez"), ["res_b"]);
  assert.deepEqual(ids("camilo andres"), ["res_a"]);
  assert.deepEqual(ids("Marta"), ["res_b"], "por quien devolvió");
  assert.deepEqual(ids("Pedro"), ["res_a", "res_b"], "por quien recibió");
  assert.deepEqual(ids("409"), ["res_a"], "por casa");
  assert.deepEqual(ids("cancha"), ["res_b"], "por zona");
  assert.deepEqual(ids("nadie"), []);
});

test("el estado filtra por el tipo de devolución, que es el mismo dato", () => {
  assert.deepEqual(
    filtrarAuditoria(FILAS, { ...TODOS, estado: "registrado" }).map((f) => f.reservaId),
    ["res_a"],
  );
  assert.deepEqual(
    filtrarAuditoria(FILAS, { ...TODOS, estado: "devuelto_parcial" }).map((f) => f.reservaId),
    ["res_b"],
  );
  assert.deepEqual(
    filtrarAuditoria(FILAS, { ...TODOS, estado: "no_devuelto" }).map((f) => f.reservaId),
    [],
  );
});

test("el filtro de incidentes mira cuántos hubo, no cuánto valieron", () => {
  assert.deepEqual(
    filtrarAuditoria(FILAS, { ...TODOS, incidentes: "con" }).map((f) => f.reservaId),
    ["res_a", "res_b"],
  );
  assert.deepEqual(
    filtrarAuditoria(FILAS, { ...TODOS, incidentes: "sin" }).map((f) => f.reservaId),
    ["res_c"],
  );
});

test("los filtros se acumulan", () => {
  assert.deepEqual(
    filtrarAuditoria(FILAS, { busqueda: "pedro", estado: "devuelto_parcial", incidentes: "con" })
      .map((f) => f.reservaId),
    ["res_b"],
  );
});

// ─────────────────────────────────────────────────────────────
// Totales
// ─────────────────────────────────────────────────────────────

test("los totales son los de lo que se está viendo, no los del rango", () => {
  assert.deepEqual(resumirAuditoria(FILAS), {
    total: 3,
    recibido: 150000,
    enCustodia: 60000,
    devuelto: 70000,
    descontado: 20000,
    valorIncidentes: 30000,
    conIncidentes: 2,
    sinRolRegistrado: 1,
  });
  const soloParcial = filtrarAuditoria(FILAS, { ...TODOS, estado: "devuelto_parcial" });
  const r = resumirAuditoria(soloParcial);
  assert.equal(r.total, 1);
  assert.equal(r.recibido, 50000);
  assert.equal(r.enCustodia, 0);
  assert.equal(r.devuelto, 30000);
  assert.equal(r.sinRolRegistrado, 0);
});

test("solo cuenta como sin rol el depósito que de verdad no lo tiene", () => {
  /* El que sigue en custodia no tiene rol de devolución porque no se ha
     devuelto: eso no es un dato que falte. */
  assert.equal(resumirAuditoria([EN_CUSTODIA]).sinRolRegistrado, 0);
  assert.equal(resumirAuditoria([HISTORICO]).sinRolRegistrado, 1);
});

// ─────────────────────────────────────────────────────────────
// Fechas
// ─────────────────────────────────────────────────────────────

test("el instante se lee en hora de Colombia, no en la del servidor", () => {
  assert.equal(fechaBogota(RECIBIDO_A), "2026-09-16");
  assert.equal(horaBogota(RECIBIDO_A), "09:30");
  assert.equal(horaBogota(DEVUELTO_B), "14:05");
  /* Las 20:00 de Bogotá ya son del día siguiente en UTC: el reporte tiene que
     seguir diciendo el 19. */
  assert.equal(fechaBogota(RECIBIDO_C), "2026-09-19");
  assert.equal(horaBogota(RECIBIDO_C), "20:00");
});

// ─────────────────────────────────────────────────────────────
// Excel
// ─────────────────────────────────────────────────────────────

test("cada fila del Excel está alineada con sus columnas", () => {
  const filas = filasAuditoriaDepositos(FILAS);
  assert.equal(filas.length, 3);
  for (const f of filas) assert.equal(f.length, COLUMNAS_AUDITORIA_DEPOSITOS.length);
});

test("un depósito sin devolver deja vacías TODAS las celdas de la devolución", () => {
  const col = (e: string) => COLUMNAS_AUDITORIA_DEPOSITOS.findIndex((c) => c.encabezado === e);
  const fila = filasAuditoriaDepositos([EN_CUSTODIA])[0]!;
  for (const encabezado of [
    "Fecha devolucion",
    "Hora devolucion",
    "Valor devuelto",
    "Valor descontado",
    "Devuelto por",
    "Rol de quien devolvio",
    "Devuelto en",
    "Motivo de la devolucion",
  ]) {
    assert.equal(fila[col(encabezado)], null, encabezado);
  }
  /* Lo que sí pasó, en cambio, va completo. */
  assert.equal(fila[col("Valor deposito")], 60000);
  assert.equal(fila[col("Saldo en custodia")], 60000);
  assert.equal(fila[col("Estado")], "Sin devolver");
  assert.equal(fila[col("Recibido por")], "Pedro Guarda");
  assert.equal(fila[col("Rol de quien recibio")], "Guarda");
  assert.equal(fila[col("Recibido en")], "Portería");
});

test("el rol que no se guardó dice Sin registrar; no se rellena con el de hoy", () => {
  const col = (e: string) => COLUMNAS_AUDITORIA_DEPOSITOS.findIndex((c) => c.encabezado === e);
  const fila = filasAuditoriaDepositos([HISTORICO])[0]!;
  assert.equal(fila[col("Recibido por")], "Quien fuera");
  assert.equal(fila[col("Rol de quien recibio")], "Sin registrar");
  assert.equal(fila[col("Recibido en")], "Sin registrar");
  assert.equal(fila[col("Rol de quien devolvio")], "Sin registrar");
  /* Lo que sí quedó registrado se lee tal cual. */
  assert.equal(fila[col("Fecha devolucion")], "2026-09-21");
  assert.equal(fila[col("Valor devuelto")], 40000);
});

test("el archivo se llama por su rango", () => {
  assert.equal(
    nombreArchivoAuditoriaDepositos("2026-09-01", "2026-09-30"),
    "Auditoria_depositos_2026-09-01_a_2026-09-30.xlsx",
  );
});

test("los indicadores son los totales de lo filtrado", () => {
  assert.deepEqual(
    indicadoresAuditoriaDepositos(resumirAuditoria(FILAS)).map((i) => [i.etiqueta, i.valor]),
    [
      ["Depósitos", 3],
      ["Valor recibido", 150000],
      ["En custodia", 60000],
      ["Descontado por incidentes", 20000],
      ["Devuelto", 70000],
    ],
  );
});

const desescapar = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

async function abrir(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const leer = async (ruta: string) => (await zip.file(ruta)?.async("string")) ?? null;
  const sheet = (await leer("xl/worksheets/sheet1.xml"))!;
  const sst = (await leer("xl/sharedStrings.xml"))!;
  const tabla = await leer("xl/tables/table1.xml");
  const cadenas = [...sst.matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g)].map((m) =>
    desescapar(m[1]!),
  );
  const celdas = new Map<string, { v?: string; texto?: string }>();
  for (const m of sheet.matchAll(/<c r="([A-Z]+\d+)" s="(\d+)"( t="s")?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const v = /<v>([^<]*)<\/v>/.exec(m[4] ?? "")?.[1];
    celdas.set(m[1]!, m[3] ? { texto: cadenas[Number(v)] } : { v });
  }
  const filaDe = (texto: string) => {
    for (const [ref, c] of celdas) {
      if (/^A\d+$/.test(ref) && c.texto === texto) return Number(ref.slice(1));
    }
    return -1;
  };
  return { celdas, filaDe, tabla };
}

test("el Excel lleva el resumen arriba y una fila por depósito debajo", async () => {
  const opts = opcionesXlsxAuditoriaDepositos({
    filas: FILAS,
    desde: "2026-09-01",
    hasta: "2026-09-30",
    criterio: "cualquiera",
  });
  const { celdas, filaDe, tabla } = await abrir(await construirXlsxReporte(opts));

  assert.equal(filaDe("Auditoría de depósitos"), 1);
  assert.equal(
    celdas.get("A2")?.texto,
    "Del 2026-09-01 al 2026-09-30  ·  Recepción o devolución",
  );
  const rCabecera = filaDe("Fecha reserva");
  assert.ok(rCabecera > filaDe("Depósitos"), "el resumen va antes que la tabla");

  /* Los encabezados, en orden y con la columna nueva donde debe estar. */
  const letra = (i: number) => String.fromCharCode(65 + i);
  COLUMNAS_AUDITORIA_DEPOSITOS.forEach((c, i) => {
    assert.equal(celdas.get(`${letra(i)}${rCabecera}`)?.texto, c.encabezado);
  });

  /* Primera fila: en custodia. Las fechas van como número de Excel. */
  const col = (e: string) =>
    letra(COLUMNAS_AUDITORIA_DEPOSITOS.findIndex((c) => c.encabezado === e));
  const f1 = rCabecera + 1;
  assert.equal(Number(celdas.get(`${col("Fecha recepcion")}${f1}`)?.v), fechaASerialExcel("2026-09-16"));
  assert.equal(Number(celdas.get(`${col("Valor deposito")}${f1}`)?.v), 60000);
  assert.equal(celdas.get(`${col("Estado")}${f1}`)?.texto, "Sin devolver");
  /* Sin devolución, la celda no existe ni como texto ni como número. */
  assert.equal(celdas.get(`${col("Fecha devolucion")}${f1}`)?.v, undefined);
  assert.equal(celdas.get(`${col("Devuelto por")}${f1}`)?.texto, undefined);

  /* Segunda: devuelta parcial, con su motivo y su responsable. */
  const f2 = rCabecera + 2;
  assert.equal(Number(celdas.get(`${col("Valor devuelto")}${f2}`)?.v), 30000);
  assert.equal(Number(celdas.get(`${col("Valor descontado")}${f2}`)?.v), 20000);
  assert.equal(celdas.get(`${col("Motivo de la devolucion")}${f2}`)?.texto, "Se dañó el mesón");
  assert.equal(celdas.get(`${col("Devuelto por")}${f2}`)?.texto, "Marta Admin");
  assert.equal(
    celdas.get(`${col("Rol de quien devolvio")}${f2}`)?.texto,
    "Administrador del condominio",
  );
  assert.equal(celdas.get(`${col("Descripción del incidente")}${f2}`)?.texto, "Mesón roto");

  /* La casa "0012" sigue siendo texto: no pierde los ceros. */
  assert.equal(celdas.get(`${col("Casa")}${f2}`)?.texto, "0012");
  /* Nada después del último depósito. */
  assert.equal(celdas.has(`A${rCabecera + 1 + FILAS.length}`), false);

  /* Es una tabla de Excel, con filtro en cada encabezado. */
  assert.ok(tabla?.includes("<autoFilter"));
  assert.ok(tabla?.includes('displayName="TablaDepositos"'));
});

test("el Excel advierte de los depósitos sin rol registrado", async () => {
  const conHueco = opcionesXlsxAuditoriaDepositos({
    filas: FILAS,
    desde: "2026-09-01",
    hasta: "2026-09-30",
    criterio: "recepcion",
  });
  assert.ok(
    conHueco.resumen.notas?.some((n) => n.includes('1 depósito(s) dicen "Sin registrar"')),
    "lo dice cuando falta",
  );
  const completo = opcionesXlsxAuditoriaDepositos({
    filas: [EN_CUSTODIA, PARCIAL],
    desde: "2026-09-01",
    hasta: "2026-09-30",
    criterio: "recepcion",
  });
  assert.ok(
    completo.resumen.notas?.some((n) => n.includes("sellado en ese momento")),
    "y dice de dónde sale cuando está completo",
  );
  assert.equal(completo.resumen.subtitulo?.includes("Fecha de recepción"), true);
});

test("sin depósitos el Excel se arma igual, con los totales en cero", async () => {
  const opts = opcionesXlsxAuditoriaDepositos({
    filas: [],
    desde: "2026-09-01",
    hasta: "2026-09-30",
    criterio: "devolucion",
  });
  const { filaDe } = await abrir(await construirXlsxReporte(opts));
  assert.ok(filaDe("Fecha reserva") > 0);
  assert.deepEqual(
    opts.resumen.indicadores.map((i) => i.valor),
    [0, 0, 0, 0, 0],
  );
});
