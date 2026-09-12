import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularCosto,
  horasDeReserva,
} from "../convex/lib/costoReserva.ts";

test("cuenta las horas, y la fraccion se cobra entera", () => {
  assert.equal(horasDeReserva("10:00", "13:00"), 3);
  assert.equal(horasDeReserva("10:00", "12:30"), 3, "2h30 se cobran como 3");
  assert.equal(horasDeReserva("10:00", "11:00"), 1);
});

test("una reserva que cruza la medianoche no da horas negativas", () => {
  assert.equal(horasDeReserva("22:00", "01:00"), 3);
});

test("por hora: multiplica y lo explica", () => {
  const c = calcularCosto(
    { unidadTiempo: "hora", precioPorHora: 20000 },
    "10:00",
    "13:00",
  );
  assert.equal(c.alquiler, 60000);
  assert.match(c.detalle!, /3 horas/);
  assert.equal(c.sinTarifa, false);
});

test("por dia: una jornada aunque escoja tres horas", () => {
  /* Cobrar por horas un espacio que la administracion tarifa por dia daria un
   * numero que no cuadra con la factura. */
  const c = calcularCosto(
    { unidadTiempo: "dia", precioPorDia: 150000 },
    "10:00",
    "13:00",
  );
  assert.equal(c.alquiler, 150000);
});

test("el deposito va aparte del alquiler", () => {
  /* Sumarlos en una sola cifra hace que la reserva parezca el doble de cara. */
  const c = calcularCosto(
    { unidadTiempo: "dia", precioPorDia: 150000, depositoRequerido: 200000 },
    "10:00",
    "18:00",
  );
  assert.equal(c.alquiler, 150000);
  assert.equal(c.deposito, 200000);
  assert.equal(c.totalAPagar, 350000);
});

test("sin tarifa configurada lo dice, no inventa un cero", () => {
  const c = calcularCosto({ unidadTiempo: "dia" }, "10:00", "12:00");
  assert.equal(c.sinTarifa, true);
  assert.equal(c.alquiler, 0);
  assert.equal(c.detalle, null);
});

test("una zona gratis con deposito sigue pidiendo el deposito", () => {
  const c = calcularCosto(
    { unidadTiempo: "dia", depositoRequerido: 100000 },
    "10:00",
    "12:00",
  );
  assert.equal(c.deposito, 100000);
  assert.equal(c.totalAPagar, 100000);
});

test("tarifa mensual", () => {
  const c = calcularCosto(
    { unidadTiempo: "mes", precioPorMes: 90000 },
    "00:00",
    "23:00",
  );
  assert.equal(c.alquiler, 90000);
  assert.match(c.detalle!, /mensual/i);
});

test("sin unidadTiempo se asume por dia, que es lo mas comun", () => {
  const c = calcularCosto({ precioPorDia: 50000 }, "10:00", "12:00");
  assert.equal(c.alquiler, 50000);
});

test("si la modalidad no tiene precio, usa el que sí está puesto", () => {
  /* "Por día" con solo precio por hora: antes salía en cero y la reserva
   * no copiaba el valor de la zona. */
  const porHoraEnDia = calcularCosto(
    { unidadTiempo: "dia", precioPorHora: 20000 },
    "10:00",
    "13:00",
  );
  assert.equal(porHoraEnDia.alquiler, 60000);
  assert.equal(porHoraEnDia.sinTarifa, false);

  const porDiaEnHora = calcularCosto(
    { unidadTiempo: "hora", precioPorDia: 150000 },
    "10:00",
    "13:00",
  );
  assert.equal(porDiaEnHora.alquiler, 150000);
  assert.equal(porDiaEnHora.sinTarifa, false);
});
