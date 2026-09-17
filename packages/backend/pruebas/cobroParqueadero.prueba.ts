import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coincide, estadoDe, ocurrioEn, periodoSiguiente, periodoValido, totales,
  type ReporteCobrable,
} from "../convex/lib/cobroParqueadero.ts";

const r = (p: Partial<ReporteCobrable> = {}): ReporteCobrable => ({
  vehiculoPlaca: "ABC123", unidades: [{ numero: "409" }],
  createdAt: new Date(2026, 8, 17, 14, 0).getTime(), titulo: "No tiene aporte voluntario",
  ...p,
});

test("un reporte sin estado cuenta como pendiente", () => {
  /* Los anteriores a que esto se llevara siguen siendo plata por cobrar:
     tratarlos como desconocidos sacaria de la lista a los mas viejos. */
  assert.equal(estadoDe(r()), "pendiente");
  assert.equal(estadoDe(r({ cobroEstado: undefined })), "pendiente");
  assert.equal(estadoDe(r({ cobroEstado: "pendiente" })), "pendiente");
  assert.equal(estadoDe(r({ cobroEstado: "facturado" })), "facturado");
  assert.equal(estadoDe(r({ cobroEstado: "descartado" })), "descartado");
});

test("el cargo se propone para el mes siguiente, no el corriente", () => {
  /* La factura del mes en curso ya se emitio. */
  assert.equal(periodoSiguiente(new Date(2026, 8, 17).getTime()), "2026-10");
  assert.equal(periodoSiguiente(new Date(2026, 0, 5).getTime()), "2026-02");
});

test("diciembre pasa a enero del ano siguiente", () => {
  assert.equal(periodoSiguiente(new Date(2026, 11, 20).getTime()), "2027-01");
});

test("valida el periodo escrito a mano", () => {
  assert.equal(periodoValido("2026-10"), true);
  assert.equal(periodoValido("2026-13"), false);
  assert.equal(periodoValido("2026-00"), false);
  assert.equal(periodoValido("2026-1"), false);
  assert.equal(periodoValido(""), false);
});

test("vale la hora en que OCURRIO, no en la que se registro", () => {
  /* El guarda ve el carro a las 2 a.m. y lo escribe al volver a la caseta. */
  const visto = new Date(2026, 8, 17, 2, 0).getTime();
  const escrito = new Date(2026, 8, 17, 6, 30).getTime();
  assert.equal(ocurrioEn(r({ createdAt: escrito, ocurrioEn: visto })), visto);
  assert.equal(ocurrioEn(r({ createdAt: escrito })), escrito);
});

test("los totales separan pendiente de facturado", () => {
  const lista = [
    r(), r({ cobroEstado: "facturado" }),
    r({ cobroEstado: "descartado" }), r({ cobroEstado: "pendiente" }),
  ];
  const t = totales(lista, () => 58000);
  assert.equal(t.pendientes, 2);
  assert.equal(t.valorPendiente, 116000);
  assert.equal(t.facturados, 1);
  assert.equal(t.valorFacturado, 58000);
  assert.equal(t.descartados, 1);
});

test("cuenta casas distintas, no reportes", () => {
  /* A una casa con tres carros se le cobra por cada uno, pero para la
     administracion es una sola gestion. */
  const lista = [
    r({ unidades: [{ numero: "409" }] }),
    r({ unidades: [{ numero: "409" }] }),
    r({ unidades: [{ numero: "513" }] }),
  ];
  assert.equal(totales(lista, () => 1).casas, 2);
});

test("busca por placa, casa o motivo, sin importar guiones ni tildes", () => {
  assert.equal(coincide(r(), "abc-123"), true);
  assert.equal(coincide(r(), "409"), true);
  assert.equal(coincide(r(), "APORTE"), true);
  assert.equal(coincide(r(), "zzz"), false);
  assert.equal(coincide(r(), ""), true);
});

test("un reporte sin placa ni casa no revienta la busqueda", () => {
  const vacio = r({ vehiculoPlaca: undefined, unidades: undefined, titulo: undefined });
  assert.equal(coincide(vacio, "409"), false);
  assert.equal(coincide(vacio, ""), true);
  assert.equal(totales([vacio], () => 0).casas, 0);
});
