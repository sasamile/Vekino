import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DESCRIPCION,
  MAX_NOMBRE,
  MAX_SERIAL,
  calcularCambios,
  mapearColumnas,
  normalizarEncabezado,
  normalizarSerial,
  normalizarTexto,
  resumirCambios,
  validarImportacion,
  type FilaCruda,
} from "../convex/lib/inventario.ts";

/**
 * LAS CUENTAS DE LA CARGA MASIVA.
 *
 * Aqui, en node:test y sin base, porque `lib/inventario.ts` no la toca: es la
 * misma funcion que usan la previsualizacion y la escritura definitiva, asi
 * que lo que se fije aqui vale para las dos y no puede desincronizarse.
 *
 * Lo que se prueba en `inventario.test.ts` (con runtime) es lo otro: que la
 * autorizacion y el aislamiento entre companias se cumplan de verdad.
 */

const sinSeriales = new Set<string>();

// ─────────────────────────────────────────────────────────────
// Normalizacion
// ─────────────────────────────────────────────────────────────

test("el serial se guarda en mayusculas y sin espacios sobrantes", () => {
  assert.equal(normalizarSerial("  vk-1042 "), "VK-1042");
  assert.equal(normalizarSerial("vk   1042"), "VK 1042");
});

test("sin serial es null, y null no es la cadena vacia", () => {
  assert.equal(normalizarSerial(undefined), null);
  assert.equal(normalizarSerial(null), null);
  assert.equal(normalizarSerial("   "), null);
});

test("el mismo aparato tecleado con otra caja es el mismo serial", () => {
  assert.equal(normalizarSerial("vk-1042"), normalizarSerial("VK-1042 "));
});

test("normalizarTexto deja undefined y no cadenas vacias", () => {
  assert.equal(normalizarTexto("  hola "), "hola");
  assert.equal(normalizarTexto("   "), undefined);
  assert.equal(normalizarTexto(undefined), undefined);
});

// ─────────────────────────────────────────────────────────────
// Encabezados
// ─────────────────────────────────────────────────────────────

test("el encabezado se compara sin tildes, sin signos y en minusculas", () => {
  assert.equal(normalizarEncabezado("Descripción"), "descripcion");
  assert.equal(normalizarEncabezado(" SERIAL "), "serial");
  assert.equal(normalizarEncabezado("Foto (URL)"), "fotourl");
});

test("Excel puede autocorregir la plantilla y la carga sigue funcionando", () => {
  const cols = mapearColumnas(["Nombre", "Serial", "Descripción", "Foto (URL)"]);
  assert.deepEqual(cols, { nombre: 0, serial: 1, descripcion: 2, fotoUrl: 3 });
});

test("las columnas de mas se ignoran y el orden no importa", () => {
  const cols = mapearColumnas(["Bodega", "serial", "NOMBRE"]);
  assert.equal(cols.nombre, 2);
  assert.equal(cols.serial, 1);
  assert.equal(cols.descripcion, null);
});

test("una columna que falta se reporta como ausente, no revienta", () => {
  const cols = mapearColumnas(["Nombre"]);
  assert.equal(cols.nombre, 0);
  assert.equal(cols.serial, null);
  assert.equal(cols.fotoUrl, null);
});

// ─────────────────────────────────────────────────────────────
// Validacion: fila a fila
// ─────────────────────────────────────────────────────────────

test("una carga limpia no deja ninguna fila invalida", () => {
  const filas: FilaCruda[] = [
    { nombre: "Radio Motorola", serial: "VK-1" },
    { nombre: "Linterna", descripcion: "Recargable" },
  ];
  const informe = validarImportacion(filas, sinSeriales);
  assert.equal(informe.validas, 2);
  assert.equal(informe.invalidas, 0);
  assert.equal(informe.total, 2);
});

test("sin nombre la fila no entra, y se dice por que", () => {
  const informe = validarImportacion([{ serial: "VK-1" }], sinSeriales);
  assert.equal(informe.invalidas, 1);
  const fila = informe.filas[0];
  assert.equal(fila?.estado, "invalida");
  assert.equal(
    fila.estado === "invalida" ? fila.motivos[0]?.codigo : null,
    "FALTA_NOMBRE",
  );
});

test("el numero de fila que se reporta es el que se ve en el Excel", () => {
  /* La primera fila de datos es la 2: la 1 son los encabezados. Si este
   * numero no coincide con la hoja, la lista de errores no sirve para
   * corregirla, que es su unica razon de existir. */
  const informe = validarImportacion(
    [{ nombre: "Bien" }, { serial: "SIN-NOMBRE" }],
    sinSeriales,
  );
  assert.equal(informe.filas[0]?.fila, 2);
  assert.equal(informe.filas[1]?.fila, 3);
  assert.equal(informe.filas[1]?.estado, "invalida");
});

test("las filas en blanco del final se saltan sin contarse como error", () => {
  const informe = validarImportacion(
    [{ nombre: "Radio" }, {}, { nombre: "", serial: "  " }],
    sinSeriales,
  );
  assert.equal(informe.validas, 1);
  assert.equal(informe.vacias, 2);
  assert.equal(informe.invalidas, 0);
});

test("el serial repetido DENTRO del archivo marca las dos filas, no solo la segunda", () => {
  /* Marcar solo la segunda dejaria a quien corrige el archivo sin saber con
   * cual choca. */
  const informe = validarImportacion(
    [
      { nombre: "Radio A", serial: "VK-9" },
      { nombre: "Radio B", serial: "vk-9" },
    ],
    sinSeriales,
  );
  assert.equal(informe.invalidas, 2);
  for (const fila of informe.filas) {
    assert.equal(fila.estado, "invalida");
    if (fila.estado !== "invalida") continue;
    assert.ok(
      fila.motivos.some((m) => m.codigo === "SERIAL_DUPLICADO_EN_ARCHIVO"),
    );
  }
});

test("el serial que ya existe en el inventario se rechaza", () => {
  const informe = validarImportacion(
    [{ nombre: "Radio nuevo", serial: "vk-1042" }],
    new Set(["VK-1042"]),
  );
  assert.equal(informe.invalidas, 1);
  const fila = informe.filas[0];
  assert.ok(
    fila.estado === "invalida" &&
      fila.motivos.some((m) => m.codigo === "SERIAL_YA_EXISTE"),
  );
});

test("dos elementos sin serial no chocan entre si", () => {
  /* Es la razon de que `normalizarSerial` devuelva null y no "": dos cadenas
   * vacias si serian iguales. */
  const informe = validarImportacion(
    [{ nombre: "Chaleco" }, { nombre: "Chaleco" }, { nombre: "Cono" }],
    sinSeriales,
  );
  assert.equal(informe.validas, 3);
  assert.equal(informe.invalidas, 0);
});

test("los textos demasiado largos se rechazan por su campo", () => {
  const informe = validarImportacion(
    [
      { nombre: "x".repeat(MAX_NOMBRE + 1) },
      { nombre: "Radio", serial: "s".repeat(MAX_SERIAL + 1) },
      { nombre: "Radio", descripcion: "d".repeat(MAX_DESCRIPCION + 1) },
    ],
    sinSeriales,
  );
  assert.equal(informe.invalidas, 3);
  const codigos = informe.filas.flatMap((f) =>
    f.estado === "invalida" ? f.motivos.map((m) => m.codigo) : [],
  );
  assert.deepEqual(codigos, [
    "NOMBRE_MUY_LARGO",
    "SERIAL_MUY_LARGO",
    "DESCRIPCION_MUY_LARGA",
  ]);
});

test("una foto que no es URL se rechaza", () => {
  const informe = validarImportacion(
    [{ nombre: "Radio", fotoUrl: "C:\\fotos\\radio.jpg" }],
    sinSeriales,
  );
  const fila = informe.filas[0];
  assert.ok(
    fila.estado === "invalida" &&
      fila.motivos.some((m) => m.codigo === "FOTO_URL_INVALIDA"),
  );
});

test("una fila puede acumular varios motivos a la vez", () => {
  const informe = validarImportacion(
    [{ serial: "s".repeat(MAX_SERIAL + 1), fotoUrl: "no-es-url" }],
    sinSeriales,
  );
  const fila = informe.filas[0];
  assert.equal(fila.estado, "invalida");
  if (fila.estado !== "invalida") return;
  assert.deepEqual(new Set(fila.motivos.map((m) => m.codigo)), new Set([
    "FALTA_NOMBRE",
    "SERIAL_MUY_LARGO",
    "FOTO_URL_INVALIDA",
  ]));
});

test("96 buenas y 4 malas: se reportan las 4, no 'error al importar'", () => {
  const filas: FilaCruda[] = [];
  for (let i = 0; i < 96; i++) filas.push({ nombre: `Radio ${i}`, serial: `VK-${i}` });
  filas.push({ serial: "SIN-NOMBRE-1" });
  filas.push({ serial: "SIN-NOMBRE-2" });
  filas.push({ nombre: "Repe", serial: "DUP" });
  filas.push({ nombre: "Repe otra vez", serial: "dup" });

  const informe = validarImportacion(filas, sinSeriales);
  assert.equal(informe.validas, 96);
  assert.equal(informe.invalidas, 4);
  const malas = informe.filas.filter((f) => f.estado === "invalida");
  assert.deepEqual(
    malas.map((f) => f.fila),
    [98, 99, 100, 101],
  );
  for (const m of malas) {
    assert.ok(m.estado === "invalida" && m.motivos.length > 0);
  }
});

test("el archivo sin ninguna fila devuelve un informe vacio, no lanza", () => {
  /* Quien decide que hacer con un archivo vacio es la capa que lo recibe;
   * esta funcion nunca lanza porque su trabajo es explicar, no cortar. */
  const informe = validarImportacion([], sinSeriales);
  assert.deepEqual(informe, {
    filas: [],
    total: 0,
    validas: 0,
    invalidas: 0,
    vacias: 0,
  });
});

test("la fila valida sale ya normalizada, lista para insertar", () => {
  const informe = validarImportacion(
    [{ nombre: "  Radio  ", serial: " vk-7 ", descripcion: "  " }],
    sinSeriales,
  );
  const fila = informe.filas[0];
  assert.equal(fila.estado, "valida");
  if (fila.estado !== "valida") return;
  assert.deepEqual(fila.item, { nombre: "Radio", serial: "VK-7" });
});

// ─────────────────────────────────────────────────────────────
// Diferencias para el historial
// ─────────────────────────────────────────────────────────────

test("solo se registra lo que de verdad cambio", () => {
  const cambios = calcularCambios(
    { nombre: "Radio", serial: "VK-1", descripcion: "vieja" },
    { nombre: "Radio", serial: "VK-2", descripcion: "vieja" },
  );
  assert.equal(cambios.length, 1);
  assert.deepEqual(cambios[0], {
    campo: "Serial",
    antes: "VK-1",
    despues: "VK-2",
  });
});

test("guardar sin tocar nada no genera ningun cambio", () => {
  const antes = { nombre: "Radio", serial: "VK-1", descripcion: undefined };
  assert.deepEqual(calcularCambios(antes, { ...antes }), []);
});

test("vaciar un campo se registra como quitarlo", () => {
  const cambios = calcularCambios(
    { nombre: "Radio", descripcion: "con bateria" },
    { nombre: "Radio", descripcion: undefined },
  );
  assert.deepEqual(cambios, [{ campo: "Descripción", antes: "con bateria" }]);
});

test("la foto se resume: la URL de S3 no dice nada en una linea de tiempo", () => {
  const cambios = calcularCambios(
    { fotoUrl: "https://bucket.s3.amazonaws.com/a/muy/larga.jpg" },
    { fotoUrl: "https://bucket.s3.amazonaws.com/otra/mas/larga.jpg" },
  );
  assert.deepEqual(cambios, [
    { campo: "Foto", antes: "(foto anterior)", despues: "(foto nueva)" },
  ]);
});

test("un campo ausente del formulario no se juzga", () => {
  /* `editar` manda siempre los cuatro; esto protege a quien llame con menos. */
  assert.deepEqual(calcularCambios({ nombre: "Radio", serial: "VK-1" }, { nombre: "Radio" }), []);
});

test("el resumen nombra los campos tocados", () => {
  assert.equal(resumirCambios([]), "Se guardó el elemento sin cambios.");
  assert.equal(
    resumirCambios([{ campo: "Serial" }]),
    "Se actualizó serial.",
  );
  assert.equal(
    resumirCambios([{ campo: "Nombre" }, { campo: "Serial" }, { campo: "Foto" }]),
    "Se actualizaron nombre, serial y foto.",
  );
});
