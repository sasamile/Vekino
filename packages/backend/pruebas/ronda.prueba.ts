import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contar,
  duracionMs,
  duracionTexto,
  estadoDeRonda,
  ordenarLineaDeTiempo,
  type Hito,
} from "../convex/lib/ronda.ts";

const T = (h: number, m: number) => new Date(2026, 8, 4, h, m).getTime();

test("el ejemplo de la especificacion: 10:00 p.m. a 11:03 p.m.", () => {
  assert.equal(duracionTexto(T(22, 0), T(23, 3)), "1 hora y 3 minutos");
});

test("dice las horas y los minutos en palabras, en singular y plural", () => {
  assert.equal(duracionTexto(T(22, 0), T(23, 0)), "1 hora");
  assert.equal(duracionTexto(T(22, 0), T(22, 1)), "1 minuto");
  assert.equal(duracionTexto(T(22, 0), T(22, 45)), "45 minutos");
  assert.equal(duracionTexto(T(20, 0), T(23, 30)), "3 horas y 30 minutos");
});

test("no dice '0 horas y 60 minutos'", () => {
  const casi = T(22, 0) + 59.7 * 60_000;
  assert.equal(duracionTexto(T(22, 0), casi), "1 hora");
});

test("una ronda relampago no queda en blanco", () => {
  assert.equal(duracionTexto(T(22, 0), T(22, 0)), "menos de un minuto");
});

test("sin cierre no hay duracion, y no se inventa", () => {
  assert.equal(duracionTexto(T(22, 0), undefined), null);
  assert.equal(duracionTexto(undefined, T(23, 0)), null);
  assert.equal(duracionMs(T(22, 0), undefined), null);
});

test("un cierre anterior al inicio no produce una duracion negativa", () => {
  assert.equal(duracionTexto(T(23, 0), T(22, 0)), null);
  assert.equal(duracionMs(T(23, 0), T(22, 0)), null);
});

test("la linea de tiempo empieza por el inicio y acaba por el cierre", () => {
  const hitos: Hito[] = [
    { en: T(22, 25), tipo: "vehiculo", titulo: "ABC123 en parqueaderos" },
    { en: T(23, 3), tipo: "cierre", titulo: "Finalizacion de ronda" },
    { en: T(22, 12), tipo: "novedad", titulo: "Puerta bloque B abierta" },
    { en: T(22, 0), tipo: "inicio", titulo: "Inicio de ronda" },
  ];
  assert.deepEqual(
    ordenarLineaDeTiempo(hitos).map((h) => h.tipo),
    ["inicio", "novedad", "vehiculo", "cierre"],
  );
});

test("un evento en el mismo instante que la apertura va despues de ella", () => {
  /* Si no, la linea de tiempo empieza por la mitad. */
  const hitos: Hito[] = [
    { en: T(22, 0), tipo: "novedad", titulo: "Algo" },
    { en: T(22, 0), tipo: "inicio", titulo: "Inicio" },
    { en: T(22, 0), tipo: "cierre", titulo: "Cierre" },
  ];
  assert.deepEqual(
    ordenarLineaDeTiempo(hitos).map((h) => h.tipo),
    ["inicio", "novedad", "cierre"],
  );
});

test("cuenta cada cosa por separado para el encabezado", () => {
  const hitos: Hito[] = [
    { en: 1, tipo: "inicio", titulo: "" },
    { en: 2, tipo: "novedad", titulo: "" },
    { en: 3, tipo: "novedad", titulo: "" },
    { en: 4, tipo: "vehiculo", titulo: "" },
    { en: 5, tipo: "evento", titulo: "" },
    { en: 6, tipo: "cierre", titulo: "" },
  ];
  assert.deepEqual(contar(hitos), { novedades: 2, vehiculos: 1, eventos: 1 });
});

test("una ronda vieja sin estado se lee como finalizada", () => {
  /* Dejarla sin estado la sacaria de todos los listados. */
  assert.equal(estadoDeRonda(undefined), "finalizada");
  assert.equal(estadoDeRonda("en_curso"), "en_curso");
  assert.equal(estadoDeRonda("finalizada"), "finalizada");
});
