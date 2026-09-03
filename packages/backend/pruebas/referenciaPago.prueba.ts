import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  etiquetaUnidad,
  numeroDeTorre,
  referenciaPago,
} from "../convex/lib/referenciaPago.ts";

test("la referencia es el numero de la casa, igual que en el portal del banco", () => {
  /* El portal publico del convenio muestra "Referencia: 409" cuando el
   * residente escribe su numero de casa. Por la API tiene que dar lo mismo. */
  assert.equal(referenciaPago({ numero: "409" }), "409");
  assert.equal(referenciaPago({ numero: "513" }), "513");
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
  assert.notEqual(referenciaPago({ torre: "T-I", numero: "1001" }), referenciaPago({ torre: "T-II", numero: "001" }));
  assert.equal(referenciaPago({ torre: "T-I", numero: "1001" }), "11001");
  assert.equal(referenciaPago({ torre: "T-II", numero: "001" }), "20001");
});

test("sin torre es el numero pelado, sin ceros de adorno", () => {
  assert.equal(referenciaPago({ torre: null, numero: "0409" }), "409");
  assert.equal(referenciaPago({ torre: "", numero: "409" }), "409");
});

test("solo digitos: el manual de Aval define InvoiceNum como Number(50)", () => {
  for (const u of [{ numero: "409" }, { torre: "T-IV", numero: "802" }]) {
    assert.match(referenciaPago(u)!, /^\d+$/);
  }
});

test("devuelve null cuando la unidad no da un numero, en vez de media referencia", () => {
  assert.equal(referenciaPago({ numero: "" }), null);
  assert.equal(referenciaPago({ numero: "LOCAL" }), null);
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
    const ref = referenciaPago({ torre: u.torre, numero: u.numero });
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
