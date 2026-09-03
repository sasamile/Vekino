import { test } from "node:test";
import assert from "node:assert/strict";
import { faltantesParaProduccion } from "../convex/lib/avalProduccion.ts";

/** Una configuración de producción completa y correcta. */
const buena = {
  endpoint: "https://psp.ath.com.co",
  authBasic: "BASIC_DE_PRODUCCION",
  xAuthorization: "LLAVE_DEL_CONVENIO_EN_PRODUCCION",
  agrmId: "00030713",
  companyId: "00089898",
  channel: "1",
  trnSrc: "2",
  secretUser: "usuarioReal",
  secretPassword: "claveReal",
  ambiente: "prod",
  insecureTls: false,
};

test("en QA no se exige nada: el ambiente de pruebas debe funcionar sin configurar", () => {
  assert.deepEqual(
    faltantesParaProduccion({ ...buena, ambiente: "qa", insecureTls: true }),
    [],
  );
});

test("una produccion bien configurada no se queja", () => {
  assert.deepEqual(faltantesParaProduccion(buena), []);
});

test("no deja salir a produccion apuntando a QA", () => {
  const r = faltantesParaProduccion({ ...buena, endpoint: "https://qa.psp.ath.com.co" });
  assert.equal(r.length, 1);
  assert.match(r[0]!, /AVAL_ENDPOINT/);
});

test("reconoce la llave de ejemplo del manual y se niega", () => {
  const delManual =
    "L17Y8lLzv7M=ZnJOZm1OZ1JNUUlJTCtxZGdYNmhQUzh1N3ZwRXFMQlBZZG5VWDVFVXNKakUzQkNMSmpWcVltd0RhUVowZTA0VWZ1UWxyNGpWUTRhaWFDTTRPUEdHUkdiTXZTQWZveWkwNW1qSEJQc2tkOXo2dVNaeTVXOGxYazVxenBHd1FXK2k4ZWl1TGc9PQ==";
  const r = faltantesParaProduccion({ ...buena, xAuthorization: delManual });
  assert.match(r.join(" "), /AVAL_X_AUTHORIZATION/);
});

test("los usuarios de ejemplo tampoco pasan", () => {
  assert.match(
    faltantesParaProduccion({ ...buena, secretUser: "usuario1" }).join(" "),
    /AVAL_SECRET_USER/,
  );
  assert.match(
    faltantesParaProduccion({ ...buena, secretPassword: "usuario1951" }).join(" "),
    /AVAL_SECRET_USER/,
  );
});

test("en un canal de pagos el TLS no se relaja", () => {
  assert.match(
    faltantesParaProduccion({ ...buena, insecureTls: true }).join(" "),
    /TLS/,
  );
});

test("cuando falta todo, lo dice todo de una vez", () => {
  /* Si avisara de un problema por intento, cambiar a produccion serian cinco
   * despliegues a ciegas. */
  const r = faltantesParaProduccion({
    ...buena,
    endpoint: "https://qa.psp.ath.com.co",
    authBasic:
      "MzFoMHJlbzJwbTBndmhndjZyOGsycnFnamg6MTc0Y2o0bmp1bjYybXIzYmMxanRmY3Vsb2RsbmFjZmdmNDBvdDVkYzZjaHVvZG9rbDRxcA==",
    secretUser: "usuario1",
    insecureTls: true,
  });
  assert.equal(r.length, 4);
});
