import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  claveUnidad,
  clavePeriodo,
  descomponerReferencia,
  etiquetaUnidad,
  numeroDeTorre,
  referenciaPago,
} from "../convex/lib/referenciaPago.ts";

test("la casa se lee al principio de la referencia", () => {
  assert.equal(
    referenciaPago({ numero: "513", periodo: "2026-08" }),
    "513202608",
  );
});

test("una torre en romano se vuelve digito", () => {
  assert.equal(numeroDeTorre("T-III"), 3);
  assert.equal(numeroDeTorre("t-iv"), 4);
  assert.equal(numeroDeTorre("2"), 2);
  assert.equal(numeroDeTorre(""), 0);
  assert.equal(numeroDeTorre(null), 0);
});

test("el relleno a cuatro digitos separa torre de apartamento", () => {
  /* Sin relleno los dos darian 11001 y serian la misma unidad. */
  assert.notEqual(claveUnidad("T-I", "1001"), claveUnidad("T-II", "001"));
  assert.equal(claveUnidad("T-I", "1001"), "11001");
  assert.equal(claveUnidad("T-II", "001"), "20001");
});

test("sin torre la clave es el numero pelado, sin ceros de adorno", () => {
  assert.equal(claveUnidad(null, "0513"), "513");
  assert.equal(claveUnidad("", "513"), "513");
});

test("el periodo son seis digitos o no es periodo", () => {
  assert.equal(clavePeriodo("2026-08"), "202608");
  assert.equal(clavePeriodo("202608"), "202608");
  assert.equal(clavePeriodo("2026"), "");
  assert.equal(clavePeriodo(""), "");
});

test("devuelve null cuando le falta algo, en vez de inventarse media referencia", () => {
  assert.equal(referenciaPago({ numero: "", periodo: "2026-08" }), null);
  assert.equal(referenciaPago({ numero: "513", periodo: "" }), null);
  assert.equal(referenciaPago({ numero: "LOCAL", periodo: "2026-08" }), null);
});

test("la referencia se puede leer al reves", () => {
  for (const [torre, numero] of [[null, "513"], ["T-III", "1001"], [null, "9"]] as const) {
    const ref = referenciaPago({ torre, numero, periodo: "2026-08" })!;
    assert.deepEqual(descomponerReferencia(ref), {
      unidad: claveUnidad(torre, numero),
      periodo: "2026-08",
    });
  }
});

test("no confunde una referencia vieja con una nueva", () => {
  /* 11776 era el consecutivo contable: cinco digitos, sin periodo detras.
   * Descomponerlo daria el mes 76, que no existe. */
  assert.equal(descomponerReferencia("11776"), null);
  assert.equal(descomponerReferencia("999999"), null);
});

test("etiqueta legible para la pantalla de pago", () => {
  assert.equal(etiquetaUnidad(null, "513"), "Casa 513");
  assert.equal(etiquetaUnidad("T-III", "1001"), "Torre III apto 1001");
});

test("ninguna unidad real choca con otra de su condominio", () => {
  const unidades: { cond: string; torre: string | null; numero: string }[] =
    JSON.parse(readFileSync(new URL("./unidades.fixture.json", import.meta.url), "utf8"));

  const vistas = new Map<string, string>();
  let sinReferencia = 0;

  for (const u of unidades) {
    const ref = referenciaPago({ torre: u.torre, numero: u.numero, periodo: "2026-08" });
    if (!ref) {
      sinReferencia++;
      continue;
    }
    const clave = `${u.cond}:${ref}`;
    const previa = vistas.get(clave);
    assert.equal(
      previa,
      undefined,
      `colision en ${u.cond}: "${previa}" y "${u.torre ?? ""} ${u.numero}" comparten ${ref}`,
    );
    vistas.set(clave, `${u.torre ?? ""} ${u.numero}`);
  }

  assert.equal(sinReferencia, 0, `${sinReferencia} unidades sin referencia`);
  assert.equal(vistas.size, unidades.length);
});
