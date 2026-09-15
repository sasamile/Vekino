import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esValorIncidenteValido,
  liquidarDeposito,
  montosDeDepositoResuelto,
} from "../convex/lib/depositoReserva.ts";

/**
 * LA CUENTA DEL DEPÓSITO.
 *
 * El depósito es un tope: descuenta hasta donde alcanza y nunca queda en
 * negativo. Aquí solo la aritmética; quién puede qué se prueba en
 * `incidentesReserva.test.ts`.
 */

const valorado = (valor: number) => ({ estado: "valorado" as const, valor });

test("sin incidentes se devuelve todo y la razón es opcional", () => {
  const l = liquidarDeposito(60000, []);
  assert.equal(l.totalDescuento, 0);
  assert.equal(l.saldoDevolucion, 60000);
  assert.equal(l.razonObligatoria, false);
  assert.equal(l.puedeLiquidar, true);
  assert.equal(l.estadoResultante, "devuelto");
});

test("un incidente menor descuenta su valor", () => {
  const l = liquidarDeposito(60000, [valorado(10000)]);
  assert.equal(l.totalIncidentes, 10000);
  assert.equal(l.totalDescuento, 10000);
  assert.equal(l.saldoDevolucion, 50000);
  assert.equal(l.excedenteNoCubierto, 0);
  assert.equal(l.razonObligatoria, true);
  assert.equal(l.estadoResultante, "devuelto_parcial");
});

test("varios incidentes se suman", () => {
  const l = liquidarDeposito(60000, [valorado(10000), valorado(15000)]);
  assert.equal(l.totalIncidentes, 25000);
  assert.equal(l.saldoDevolucion, 35000);
});

test("un incidente mayor al depósito descuenta solo el depósito", () => {
  const l = liquidarDeposito(60000, [valorado(100000)]);
  assert.equal(l.totalIncidentes, 100000);
  assert.equal(l.totalDescuento, 60000);
  assert.equal(l.saldoDevolucion, 0);
  assert.equal(l.excedenteNoCubierto, 40000);
  assert.equal(l.estadoResultante, "no_devuelto");
});

test("varios incidentes que juntos superan el depósito no dejan saldo negativo", () => {
  const l = liquidarDeposito(60000, [valorado(40000), valorado(35000), valorado(5000)]);
  assert.equal(l.totalIncidentes, 80000);
  assert.equal(l.totalDescuento, 60000);
  assert.equal(l.saldoDevolucion, 0);
  assert.ok(l.saldoDevolucion >= 0);
});

test("justo el depósito: devuelve cero, no negativo", () => {
  const l = liquidarDeposito(60000, [valorado(60000)]);
  assert.equal(l.saldoDevolucion, 0);
  assert.equal(l.excedenteNoCubierto, 0);
  assert.equal(l.estadoResultante, "no_devuelto");
});

test("un pendiente impide liquidar y no descuenta", () => {
  const l = liquidarDeposito(60000, [valorado(10000), { estado: "pendiente" }]);
  assert.equal(l.puedeLiquidar, false);
  assert.equal(l.pendientes, 1);
  assert.equal(l.totalDescuento, 10000);
});

test("un descartado no afecta el dinero ni exige razón", () => {
  const l = liquidarDeposito(60000, [{ estado: "descartado", valor: 99999 }]);
  assert.equal(l.totalDescuento, 0);
  assert.equal(l.saldoDevolucion, 60000);
  assert.equal(l.razonObligatoria, false);
  assert.equal(l.estadoResultante, "devuelto");
});

test("un valor corrupto no suma ni devuelve más de lo recibido", () => {
  const l = liquidarDeposito(60000, [valorado(-5000), valorado(Number.NaN)]);
  assert.equal(l.totalDescuento, 0);
  assert.equal(l.saldoDevolucion, 60000);
});

test("sólo valores mayores a cero son válidos", () => {
  assert.equal(esValorIncidenteValido(10000), true);
  assert.equal(esValorIncidenteValido(0), false);
  assert.equal(esValorIncidenteValido(-1), false);
  assert.equal(esValorIncidenteValido(Number.POSITIVE_INFINITY), false);
});

test("los depósitos históricos se leen por su estado", () => {
  assert.equal(montosDeDepositoResuelto({ monto: 60000, estado: "registrado" }), null);
  assert.deepEqual(montosDeDepositoResuelto({ monto: 60000, estado: "devuelto" }), {
    devuelto: 60000,
    descontado: 0,
  });
  assert.deepEqual(montosDeDepositoResuelto({ monto: 60000, estado: "no_devuelto" }), {
    devuelto: 0,
    descontado: 60000,
  });
  assert.deepEqual(
    montosDeDepositoResuelto({
      monto: 60000,
      estado: "devuelto_parcial",
      montoDevuelto: 50000,
      montoDescontado: 10000,
    }),
    { devuelto: 50000, descontado: 10000 },
  );
});
