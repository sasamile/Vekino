import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarPlaca, placaValida } from "../convex/lib/placa.ts";

test("la misma placa escrita de cinco formas es una sola", () => {
  /* Sin esto el mismo carro se registra dos veces, y el segundo registro no
   * hereda ni la casa ni el aporte voluntario del primero. */
  for (const p of ["abc123", "ABC-123", "abc 123", " Abc123 ", "a-b-c-1-2-3"]) {
    assert.equal(normalizarPlaca(p), "ABC123");
  }
});

test("no revienta con nada", () => {
  assert.equal(normalizarPlaca(null), "");
  assert.equal(normalizarPlaca(undefined), "");
  assert.equal(normalizarPlaca("...---"), "");
});

test("acepta formatos de carro y de moto", () => {
  assert.equal(placaValida("ABC123"), true);
  assert.equal(placaValida("ABC-123"), true);
  assert.equal(placaValida("XYZ12D"), true);
});

test("rechaza lo que claramente no es placa", () => {
  assert.equal(placaValida("AB1"), false, "muy corta");
  assert.equal(placaValida("ABCDEF"), false, "sin numeros");
  assert.equal(placaValida("123456"), false, "sin letras");
  assert.equal(placaValida(""), false);
});
