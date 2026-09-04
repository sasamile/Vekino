import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodoDe,
  periodosElegibles,
  sumarMeses,
} from "../convex/lib/periodos.ts";

test("el mes en curso SIEMPRE esta en la lista", () => {
  /* Es el fallo que reporto la administracion: el 3 de septiembre la lista
   * llegaba hasta agosto y no se podia facturar el mes. */
  const hoy = new Date(2026, 8, 3); // 3-sep-2026
  assert.ok(periodosElegibles(hoy).includes("2026-09"));
});

test("el mes siguiente tambien, para quien factura a fin de mes", () => {
  const hoy = new Date(2026, 7, 30); // 30-ago-2026
  assert.ok(periodosElegibles(hoy).includes("2026-09"));
});

test("no ofrece meses lejanos que nadie va a cargar", () => {
  const lista = periodosElegibles(new Date(2026, 8, 3));
  assert.ok(!lista.includes("2026-11"));
  assert.equal(lista.at(-1), "2026-10");
});

test("cruza el cambio de ano sin equivocarse", () => {
  assert.equal(sumarMeses("2026-12", 1), "2027-01");
  assert.equal(sumarMeses("2026-01", -1), "2025-12");
  assert.equal(sumarMeses("2026-01", -13), "2024-12");
  const enero = periodosElegibles(new Date(2027, 0, 5));
  assert.ok(enero.includes("2026-12"));
  assert.ok(enero.includes("2027-01"));
});

test("va del mas viejo al mas nuevo y no repite", () => {
  const lista = periodosElegibles(new Date(2026, 8, 3));
  assert.deepEqual([...lista].sort(), lista);
  assert.equal(new Set(lista).size, lista.length);
});

test("todos tienen la forma AAAA-MM", () => {
  for (const p of periodosElegibles(new Date(2026, 8, 3))) {
    assert.match(p, /^\d{4}-(0[1-9]|1[0-2])$/);
  }
});

test("alcanza para cargas tardias de mas de un ano", () => {
  const lista = periodosElegibles(new Date(2026, 8, 3));
  assert.ok(lista.includes("2025-03"));
});

test("periodoDe usa el mes local, no el UTC", () => {
  assert.equal(periodoDe(new Date(2026, 8, 3)), "2026-09");
  assert.equal(periodoDe(new Date(2026, 0, 1)), "2026-01");
});
