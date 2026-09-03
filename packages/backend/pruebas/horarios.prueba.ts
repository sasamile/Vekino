import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aMinutos,
  cabeEnAlgunaFranja,
  cruzaMedianoche,
  fechasVecinas,
  rango,
  rangoAbsoluto,
  seSolapan,
} from "../convex/lib/horarios.ts";

test("lee HH:MM y rechaza lo que no lo es", () => {
  assert.equal(aMinutos("09:00"), 540);
  assert.equal(aMinutos("02:00"), 120);
  assert.equal(aMinutos("9:05"), 545);
  assert.equal(aMinutos("25:00"), null);
  assert.equal(aMinutos("09:70"), null);
  assert.equal(aMinutos("nueve"), null);
});

test("un fin que no supera al inicio cae al dia siguiente", () => {
  assert.deepEqual(rango("09:00", "22:00"), { inicio: 540, fin: 1320 });
  assert.deepEqual(rango("09:00", "02:00"), { inicio: 540, fin: 120 + 1440 });
  assert.equal(cruzaMedianoche("09:00", "02:00"), true);
  assert.equal(cruzaMedianoche("09:00", "22:00"), false);
});

test("el salon abierto 09:00-02:00 acepta tanto la manana como la madrugada", () => {
  const franjas = [{ horaInicio: "09:00", horaFin: "02:00" }];
  const cabe = (i: string, f: string) =>
    cabeEnAlgunaFranja(rango(i, f)!, franjas);

  assert.equal(cabe("10:00", "12:00"), true, "media manana");
  assert.equal(cabe("18:00", "23:00"), true, "noche");
  assert.equal(cabe("22:00", "01:00"), true, "cruzando la medianoche");
  assert.equal(cabe("09:00", "02:00"), true, "la franja entera");
});

test("no acepta lo que se sale de la franja", () => {
  const franjas = [{ horaInicio: "09:00", horaFin: "02:00" }];
  const cabe = (i: string, f: string) =>
    cabeEnAlgunaFranja(rango(i, f)!, franjas);

  assert.equal(cabe("08:00", "10:00"), false, "empieza antes de abrir");
  assert.equal(cabe("23:00", "03:00"), false, "termina despues de cerrar");
});

test("una franja normal no se vuelve nocturna por accidente", () => {
  const franjas = [{ horaInicio: "09:00", horaFin: "22:00" }];
  assert.equal(cabeEnAlgunaFranja(rango("21:00", "23:00")!, franjas), false);
  assert.equal(cabeEnAlgunaFranja(rango("09:00", "22:00")!, franjas), true);
});

test("el solape de medianoche, que es el bug que aprobaba dos reservas", () => {
  /* Viernes 23:00-01:00 y sabado 00:00-02:00 se pisan una hora. Comparando
   * "23:00" < "01:00" como texto el sistema decia que no. */
  const viernes = rangoAbsoluto("2026-09-04", "23:00", "01:00")!;
  const sabado = rangoAbsoluto("2026-09-05", "00:00", "02:00")!;
  assert.equal(seSolapan(viernes, sabado), true);
});

test("tocarse en un extremo no es pisarse", () => {
  const a = rangoAbsoluto("2026-09-04", "23:00", "01:00")!;
  const b = rangoAbsoluto("2026-09-05", "01:00", "03:00")!;
  assert.equal(seSolapan(a, b), false);
});

test("dos reservas del mismo dia que no se tocan siguen sin tocarse", () => {
  const a = rangoAbsoluto("2026-09-04", "10:00", "12:00")!;
  const b = rangoAbsoluto("2026-09-04", "14:00", "16:00")!;
  assert.equal(seSolapan(a, b), false);
});

test("para revisar un dia hay que mirar tambien la vispera", () => {
  assert.deepEqual(fechasVecinas("2026-09-05"), [
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
  ]);
  assert.deepEqual(fechasVecinas("2026-01-01"), [
    "2025-12-31",
    "2026-01-01",
    "2026-01-02",
  ]);
});

test("fechas y horas invalidas devuelven null, no un rango raro", () => {
  assert.equal(rangoAbsoluto("no-es-fecha", "09:00", "10:00"), null);
  assert.equal(rangoAbsoluto("2026-09-04", "xx", "10:00"), null);
  assert.equal(rango("09:00", "xx"), null);
});
