import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarPassword } from "../convex/lib/passwordFuerte.ts";

/**
 * LA POLITICA DE CONTRASENAS.
 *
 * No tenia pruebas, y ahora que la aplican tambien las rutas por las que un
 * administrador le pone la clave a otro conviene que las tenga: cualquier
 * cambio aqui afecta a quien no eligio su propia clave.
 */

const ok = (p: string, datos?: { email?: string; nombre?: string }) =>
  evaluarPassword(p, datos).ok;
const problema = (p: string) => evaluarPassword(p).problemas[0] ?? "";

// ─────────────────────────────────────────────────────────────
// Claves de solo numeros: la cedula
// ─────────────────────────────────────────────────────────────

test("una cedula de diez digitos se acepta", () => {
  /* Es lo unico que un guarda recuerda seguro. La alternativa real no es una
   * clave mejor: es una apuntada en un papel en la porteria. */
  assert.equal(ok("1006820136"), true);
});

test("y otras cedulas colombianas, de ocho a diez digitos", () => {
  for (const cedula of ["79458213", "521904837", "1013456789", "52847193"]) {
    assert.equal(ok(cedula), true, `deberia aceptar ${cedula}`);
  }
});

test("pero se marca debil: un numero es un numero por largo que sea", () => {
  const f = evaluarPassword("1006820136");
  assert.equal(f.ok, true);
  assert.equal(f.etiqueta, "débil", "la barra no puede decir que es buena");
  const larga = evaluarPassword("100682013645789");
  assert.equal(larga.ok, true);
  assert.ok(larga.puntaje <= 1, "ni siquiera quince digitos la suben");
});

test("siete digitos siguen siendo pocos", () => {
  assert.equal(ok("1006820"), false);
  assert.match(problema("1006820"), /al menos 8/i);
});

// ─────────────────────────────────────────────────────────────
// Lo que la excepcion NO relaja
// ─────────────────────────────────────────────────────────────

test("un numero que ES una cuesta entera sigue cayendo", () => {
  assert.equal(ok("12345678"), false, "ademas esta en la lista de comunes");
  assert.equal(ok("23456789"), false);
  assert.match(problema("23456789"), /secuencias/i);
  assert.equal(ok("98765432"), false);
});

test("un numero de un solo digito repetido sigue cayendo", () => {
  assert.equal(ok("11111111"), false);
  assert.equal(ok("22222222"), false);
  assert.match(problema("22222222"), /repetir/i);
});

test("pero un tramo suelto dentro de una cedula NO la tumba", () => {
  /* 1013456789 lleva "3456" y 1000820136 lleva "000". Son cedulas reales, y
   * ese patron no lo eligio nadie: viene dado. */
  assert.equal(ok("1013456789"), true);
  assert.equal(ok("1000820136"), true);
  assert.equal(ok("30011122"), true);
});

test("en una clave con letras, el tramo suelto SI la tumba", () => {
  /* La excepcion es solo para numeros: ahi el patron si es una eleccion. */
  assert.equal(ok("Clave1234x"), false);
  assert.match(problema("Clave1234x"), /secuencias/i);
  assert.equal(ok("Claaave12x"), false);
  assert.match(problema("Claaave12x"), /repetir/i);
});

test("las conocidas siguen cayendo", () => {
  for (const mala of ["00000000", "1234567890", "123456789"]) {
    assert.equal(ok(mala), false, `deberia rechazar ${mala}`);
  }
});

test("el telefono en el correo tampoco vale de clave", () => {
  /* `pedazosPersonales` mira correo y nombre; si la cedula es el usuario del
   * correo, la clave deja de ser un secreto distinto de la identidad. */
  assert.equal(
    ok("1006820136", { email: "1006820136@gmail.com" }),
    false,
  );
});

// ─────────────────────────────────────────────────────────────
// Nada mas cambio
// ─────────────────────────────────────────────────────────────

test("una clave corta de solo letras sigue necesitando variedad", () => {
  assert.equal(ok("abcdefgh"), false);
  assert.equal(ok("SOLOLETRAS"), false);
});

test("con doce caracteres bastan dos clases, como antes", () => {
  assert.equal(ok("clavelarga123"), true);
  assert.equal(ok("clavelargaaa"), false, "la triple a la tumba");
});

test("con menos de doce siguen haciendo falta tres clases", () => {
  assert.equal(ok("Clave123"), true);
  assert.equal(ok("clave123"), false, "solo dos clases y menos de 12");
});

test("no se usa el nombre ni el correo dentro de la clave", () => {
  assert.equal(
    ok("Gabriel2026!", { nombre: "Gabriel Guarda", email: "g@alfa.test" }),
    false,
  );
});

test("una clave larga y variada sigue siendo excelente", () => {
  const f = evaluarPassword("Porteria#Norte92");
  assert.equal(f.ok, true);
  assert.ok(f.puntaje >= 3, "no se le puede haber bajado el puntaje a las buenas");
});
