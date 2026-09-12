import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filasDesdeHoja,
  mapearTipo,
  mapaColumnas,
  resolverUnidad,
} from "../convex/lib/importarVehiculos.ts";

test("reconoce encabezados con alias en español", () => {
  const m = mapaColumnas(["Nro. unidad", "PLACA", "Marca", "Color"]);
  assert.equal(m.unidad, 0);
  assert.equal(m.placa, 1);
  assert.equal(m.marca, 2);
  assert.equal(m.color, 3);
});

test("arma filas y se salta las vacías", () => {
  const filas = filasDesdeHoja(
    ["Unidad", "Placa", "Tipo", "Marca"],
    [
      ["409", "ABC123", "Carro", "Chevrolet"],
      ["", "", "", ""],
      ["410", "XYZ12D", "Moto", "Yamaha"],
    ],
  );
  assert.equal(filas.length, 2);
  assert.equal(filas[0]?.placa, "ABC123");
  assert.equal(filas[1]?.tipo, "Moto");
});

test("sin placa o unidad en el encabezado no adivina", () => {
  assert.throws(
    () => filasDesdeHoja(["Nombre", "Marca"], [["Ana", "Ford"]]),
    /placa y otra de unidad/,
  );
});

test("el tipo del Excel manda; si no, la placa", () => {
  assert.equal(mapearTipo("moto", "ABC123"), "moto");
  assert.equal(mapearTipo("Bicicleta", "X"), "bicicleta");
  assert.equal(mapearTipo(undefined, "ABC12D"), "moto");
  assert.equal(mapearTipo("", "BCS670"), "carro");
});

test("empareja la casa por número, con o sin la palabra unidad", () => {
  const unidades = [
    { _id: "u409", numero: "409" },
    { _id: "u410", numero: "410" },
  ];
  const casa = resolverUnidad(unidades, "Casa 409");
  assert.equal(casa.ok, true);
  if (casa.ok) assert.equal(casa.unidadId, "u409");
  const r = resolverUnidad(unidades, "unidad 409");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.unidadId, "u409");
  assert.equal(resolverUnidad(unidades, "999").ok, false);
});

test("dos 101 sin torre quedan ambiguos; con torre se desambiguan", () => {
  const unidades = [
    { _id: "a", numero: "101", torre: "T I" },
    { _id: "b", numero: "101", torre: "T II" },
  ];
  assert.equal(resolverUnidad(unidades, "101").ok, false);
  const r = resolverUnidad(unidades, "101", "T II");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.unidadId, "b");
  const porNumero = resolverUnidad(unidades, "101", "2");
  assert.equal(porNumero.ok, true);
  if (porNumero.ok) assert.equal(porNumero.unidadId, "b");
});
