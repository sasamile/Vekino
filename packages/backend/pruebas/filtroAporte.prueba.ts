import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coincide, esEstado, filtrar, normalizar, ordenarPeriodos, resumir,
  type FilaAporte,
} from "../convex/lib/filtroAporte.ts";

const fila = (p: Partial<FilaAporte> = {}): FilaAporte => ({
  unidadNumero: "409", unidadTorre: null, residenteNombre: "Camilo Andrade",
  placas: ["ABC123"], meses: 3, valorTotal: 150000, enMora: false, color: "azul",
  ...p,
});

test("busca igual con guiones, espacios o mayusculas", () => {
  /* Quien escribe "ABC-123" y quien escribe "abc123" quieren el mismo carro. */
  for (const q of ["ABC123", "abc-123", "abc 123", "Abc123"]) {
    assert.equal(coincide(fila(), q), true, q);
  }
});

test("las tildes y la enne no estorban", () => {
  const f = fila({ residenteNombre: "José Núñez" });
  assert.equal(coincide(f, "jose"), true);
  assert.equal(coincide(f, "nunez"), true);
  assert.equal(coincide(f, "NÚÑEZ"), true);
});

test("busca por casa, torre, residente y placa", () => {
  const f = fila({ unidadTorre: "T-III", placas: ["XYZ99D", "MOT01A"] });
  assert.equal(coincide(f, "409"), true, "casa");
  assert.equal(coincide(f, "tiii"), true, "torre");
  assert.equal(coincide(f, "camilo"), true, "residente");
  assert.equal(coincide(f, "MOT01A"), true, "segunda placa");
  assert.equal(coincide(f, "zzz"), false);
});

test("sin busqueda pasan todas", () => {
  assert.equal(coincide(fila(), ""), true);
  assert.equal(coincide(fila(), "   "), true);
});

test("el estado separa al dia, en mora y sin vehiculo", () => {
  const alDia = fila();
  const enMora = fila({ enMora: true });
  const sinVeh = fila({ placas: [] });
  assert.equal(esEstado(alDia, "al_dia"), true);
  assert.equal(esEstado(alDia, "en_mora"), false);
  assert.equal(esEstado(enMora, "en_mora"), true);
  assert.equal(esEstado(sinVeh, "sin_vehiculo"), true);
  assert.equal(esEstado(alDia, "sin_vehiculo"), false);
  for (const f of [alDia, enMora, sinVeh]) assert.equal(esEstado(f, "todas"), true);
});

test("una casa en mora Y sin vehiculo sale en los dos filtros", () => {
  const f = fila({ enMora: true, placas: [] });
  assert.equal(esEstado(f, "en_mora"), true);
  assert.equal(esEstado(f, "sin_vehiculo"), true);
});

test("busqueda y estado se aplican juntos", () => {
  const filas = [
    fila({ unidadNumero: "409" }),
    fila({ unidadNumero: "410", enMora: true }),
    fila({ unidadNumero: "411", enMora: true }),
  ];
  assert.equal(filtrar(filas, "41", "en_mora").length, 2);
  assert.equal(filtrar(filas, "409", "en_mora").length, 0);
});

test("el resumen cuenta lo que se ve, no el universo", () => {
  /* Si al filtrar por mora el total siguiera siendo el de todas, el numero de
   * arriba contradiria la tabla de abajo. */
  const filas = [
    fila({ valorTotal: 100000 }),
    fila({ valorTotal: 50000, enMora: true, placas: [] }),
  ];
  assert.deepEqual(resumir(filas), {
    casas: 2, valorTotal: 150000, enMora: 1, sinVehiculo: 1,
  });
  assert.deepEqual(resumir(filtrar(filas, "", "en_mora")), {
    casas: 1, valorTotal: 50000, enMora: 1, sinVehiculo: 1,
  });
});

test("los periodos salen del mas reciente al mas viejo y sin repetir", () => {
  assert.deepEqual(
    ordenarPeriodos(["2026-05", "2026-09", "2026-05", "2026-01"]),
    ["2026-09", "2026-05", "2026-01"],
  );
});

test("normalizar no revienta con nada", () => {
  assert.equal(normalizar(""), "");
  assert.equal(normalizar(null as unknown as string), "");
});
