import { test } from "node:test";
import assert from "node:assert/strict";
import { certificaPorApi } from "../convex/lib/certificacion.ts";

test("sin lista configurada, nadie se salta el portal", () => {
  /* El valor seguro es que TODOS paguen de verdad. Si la variable no existe,
   * la excepción no existe. */
  assert.equal(certificaPorApi("camiand@gmail.com", undefined), false);
  assert.equal(certificaPorApi("camiand@gmail.com", ""), false);
});

test("solo el correo de la lista entra por la API", () => {
  const lista = "camiand@gmail.com";
  assert.equal(certificaPorApi("camiand@gmail.com", lista), true);
  assert.equal(certificaPorApi("nelson@ejemplo.com", lista), false);
});

test("no falla por mayusculas ni por espacios sueltos", () => {
  const lista = " Camiand@Gmail.com , otro@vekino.com ";
  assert.equal(certificaPorApi("camiand@gmail.com", lista), true);
  assert.equal(certificaPorApi("OTRO@VEKINO.COM", lista), true);
});

test("un usuario sin correo no entra por descuido", () => {
  assert.equal(certificaPorApi(null, "camiand@gmail.com"), false);
  assert.equal(certificaPorApi("", "camiand@gmail.com"), false);
  assert.equal(certificaPorApi("   ", "camiand@gmail.com"), false);
});

test("una lista con comas de mas no abre la puerta a los vacios", () => {
  assert.equal(certificaPorApi("", ",,,"), false);
  assert.equal(certificaPorApi("x@y.com", "x@y.com,,"), true);
});
