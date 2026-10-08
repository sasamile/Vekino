# Fase 0 — Red de seguridad de facturación

| | |
|---|---|
| **Fecha** | 2026-10-08 |
| **Rama** | `main` |
| **Commit base** | `c38554c` (HEAD). La auditoría se hizo sobre `2336530`; entre ambos entró el merge `b9dedde` (Aval multiconvenio), que movió líneas de `pagos.ts` sin cambiar el comportamiento auditado (§8). |
| **Auditoría de referencia** | [`docs/audits/AUDITORIA_FACTURACION.md`](AUDITORIA_FACTURACION.md) |
| **Código productivo modificado** | Ninguno |
| **Datos de producción modificados** | Ninguno (solo lectura) |
| **Commit** | No se hizo |

---

## 1. Resumen

### Objetivo

Dejar una red de seguridad **antes** de tocar la lógica de facturación: pruebas que describen el comportamiento correcto según la auditoría y que **fallan hoy** donde hay un defecto, junto con pruebas de **control** que pasan hoy y deben seguir pasando cuando se corrija. La Fase 0 no corrige nada.

### Resultado general

| Suite | Comando | Resultado |
|---|---|---|
| Backend existente — pruebas puras | `cd packages/backend && bun run test:unit` | ✅ 370 / 370 |
| Backend existente — convex-test | `cd packages/backend && bun run test:seguridad` | ✅ 882 / 882 (39 archivos) |
| Web existente — 8 archivos | `cd apps/web && bun test pruebas/<archivo>.test.mjs` | ✅ 137 / 137 |
| Móvil existente | `cd apps/mobile && bun run test` | ✅ 13 / 13 |
| **Backend facturación (nueva)** | `cd packages/backend && bun run test:facturacion` | 55 pruebas: **32 ❌ reproducen un defecto** · 23 ✅ control |
| **Web facturación (nueva)** | `cd apps/web && bun run test:facturacion` | 36 pruebas: **26 ❌ reproducen un defecto** · 10 ✅ control |

**En total: 91 pruebas nuevas. 58 fallan** por el defecto que documentan (cada fallo revisado: es la aserción del comportamiento esperado, no un error de montaje) y **33 pasan** (controles). Las suites existentes siguen intactas: las nuevas viven en scripts aparte (§2) precisamente para no dejar roja la suite del equipo mientras se corrigen.

Ninguna prueba toca producción. El backend corre sobre `convex-test` (base en memoria) con la red bloqueada: si una función intentara llamar a internet, la prueba falla. La web corre el `POST` real de `/api/facturas/upload` con S3 simulado.

> **La Fase 0 no está "corregida".** Lo que existe ahora es una red que demuestra los problemas actuales y que dirá si las fases 1, 2 y 3 realmente los resuelven.

### Lo más importante que confirmó la red

1. **F-01 (doble pago) es real y determinista.** El backend acepta abrir una transacción para una factura ya absorbida por la siguiente: con `vencida`, `abonada` o `pendiente` da igual, solo rechaza `pagada`. En cuanto la vigente queda pagada, la web, el inicio y el bot de WhatsApp vuelven a ofrecer la anterior. Con datos reales, una casa que paga septiembre ($656.804) ve *"Total pendiente: $366.113 · Agosto de 2026 · Pagar ahora"*.
2. **F-02:** un pago aprobado por la pasarela o un comprobante aprobado se convierten en `vencida` o `abonada` en cuanto llega el PDF siguiente o alguien pulsa "Conciliar".
3. **F-03:** la casa del PQRS real se ve "Vencida" estando al día.
4. **Hallazgo nuevo (§7):** la cartera de la **administración** también falla en un caso. Marca `en_mora`, con saldo 0, a quien pagó la vigente antes de su vencimiento si la anterior había quedado vencida. La auditoría daba ese modelo por correcto.
5. **F-04:** confirmado con los PDF vigentes de S3: el "saldo anterior fantasma" de septiembre en Ciudad del Campo es un crédito (saldo a favor) que el parser lee como deuda.
6. **F-06:** la regla del descuento quedó confirmada por el propio documento: *"…DEBE PAGAR LA TOTALIDAD DEL ESTADO DE CUENTA HASTA EL DIA 15 DEL PRESENTE MES"*.

---

## 2. Cómo está organizada la red

### Archivos creados o modificados

| Archivo | Tipo | Qué es |
|---|---|---|
| `packages/backend/pruebas/facturacion/escenario.ts` | nuevo | Escenario común: conjunto, dos casas, administración, propietarios, guarda; carga por `bulkUpsert` con la forma exacta de `upload-facturas.tsx`; pago aprobado por `registrarPago` + `aplicarEstado`; comprobante por `crearMio` + `aprobar`; reloj fijo (2026-10-08) y red bloqueada |
| `packages/backend/pruebas/facturacion/pagos.regresion.ts` | nuevo | R-1/R-2 (casos A, B, C), F-01 (`armarDatosTrn`), F-03 (cartera nueva), F-06, F-13, F-20 |
| `packages/backend/pruebas/facturacion/estados.regresion.ts` | nuevo | §11: transiciones `pagada → vencida/abonada` por inferencia (F-02, F-12) |
| `packages/backend/pruebas/facturacion/importacion.regresion.ts` | nuevo | F-11 (idempotencia, migración, `upsertFactura`), F-07 (período contra documento), F-09 (huecos), F-04 (conciliación con documentos que no cuadran) |
| `packages/backend/pruebas/facturacion/residente.regresion.ts` | nuevo | F-03 (`navBadges`), F-01/F-12 (factura que ofrece el bot), F-16 (`listMia`) |
| `packages/backend/pruebas/facturacion/parqueadero.regresion.ts` | nuevo | F-08 (cobros de parqueadero), F-10 (reporte de aporte) |
| `packages/backend/vitest.facturacion.config.mts` | nuevo | Reusa la configuración base de vitest; solo cambia `include` a `pruebas/facturacion/**/*.regresion.ts` |
| `packages/backend/package.json` | modificado | + script `test:facturacion` |
| `apps/web/pruebas/facturacion/parserFacturas.test.mjs` | nuevo | `POST` real de `/api/facturas/upload` con PDFs anonimizados: F-04 (casos A–E), F-15, F-07 |
| `apps/web/pruebas/facturacion/resumenResidente.test.mjs` | nuevo | Páginas reales `/mi/[id]` y `/mi/[id]/cuenta` montadas con happy-dom: F-03 y F-01 |
| `apps/web/pruebas/facturacion/fixtures/*.pdf` (9) | nuevos | Cuentas de cobro reales **anonimizadas** |
| `apps/web/pruebas/facturacion/fixtures/README.md` | nuevo | Origen, anonimización y verificación de cada fixture |
| `apps/web/pruebas/facturacion/fixtures/anonimizar.mjs` | nuevo | Generador usado (para agregar fixtures con el mismo método) |
| `apps/web/package.json` | modificado | + script `test:facturacion` |
| `docs/audits/FASE-0-FACTURACION.md` | nuevo | Este reporte |

### Decisiones

- **Infraestructura existente, sin dependencias nuevas.** Backend: `convex-test` + vitest, como `pruebas/*.test.ts`. Web: `bun test` + happy-dom + `mock.module`, como `pruebas/*.test.mjs`. Hay precedente de ambas cosas: montar páginas reales (`erroresCrudos`, `navegacionCompania`) y llamar al `POST` de una ruta API (`incidentesFase7`).
- **Suite aparte, roja por diseño.** El sufijo `.regresion.ts` no coincide con el `*.test.ts` de la configuración base, así que `vitest run` no las ve. En la web, `pruebas/facturacion/` no está en ningún script existente. Cuando un grupo pase entero, se renombra a `*.test.ts` (backend) o se suma a un script existente (web) y queda en la suite normal.
- **Se prueba por las puertas de producción.** Las facturas entran por `facturas.bulkUpsert` y la conciliación corre como en producción. Solo dos pruebas insertan directo (sin conciliar) para aislar una pieza: los estados posibles de una histórica en `armarDatosTrn` y el botón "Conciliar".
- **Expectativas que no adelantan el diseño de la corrección.** Por ejemplo, F-07 exige que una factura cuyo documento dice "Octubre" no quede guardada en silencio como septiembre (rechazo **o** no guardarla), sin imponer cómo avisarlo. F-09 exige "sin veredicto" sin fijar el nombre del estado. F-04 caso D exige que la factura "cuadre **o** venga marcada en `parseErrors`".
- **Nombres.** `F<nn>-<qué-falla>` para defectos y `F<nn>-control` para controles, con descripción en español (convención del proyecto). El número es el hallazgo de la auditoría.
- **Deterministas.** Reloj fijo en el "hoy" de la auditoría, de modo que agosto ya venció y septiembre no, como en los datos reales. Sin red. Datos sin aleatoriedad.

### Datos reales (solo lectura)

- **Cadenas de facturas reales** (montos y estados de producción, anonimizados): la casa del PQRS `m179ddw0…`, otra casa de Arboleda con agosto vencida, y una casa de CDC con saldo a favor.
- **9 PDFs reales anonimizados.** 6 del historial git (`a0cf84b^`) y 3 vigentes de S3, descargados en solo lectura. Se reemplazaron nombre, casa, teléfono, NIT, cuentas y consecutivos; montos, conceptos y totales quedaron intactos. Verificado (detalle en `fixtures/README.md`):
  1. ningún dato reemplazado aparece en los fixtures;
  2. el `POST` real devuelve exactamente lo mismo para el original y para el anonimizado en los 9.
- Las exportaciones, los PDFs originales y los scripts auxiliares quedaron solo en el directorio temporal de la sesión.

---

## 3. Pruebas creadas

`❌ FALLA` = reproduce un defecto hoy; la columna dice en qué fase debe pasar a verde. `✅ PASA` = control.

| # | ID | Hallazgo | Escenario | Archivo | Resultado hoy |
|---|---|---|---|---|---|
| 1 | `F02-control` | F-02 | un pago aprobado sin factura siguiente deja la factura 'pagada' | `estados.regresion.ts` | ✅ PASA (control) |
| 2 | `F02-pagada-a-vencida` | F-02 | agosto pagado por la pasarela no pasa a 'vencida' porque septiembre arrastre los $300.000 | `estados.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 3 | `F02-pagada-a-abonada` | F-02 | agosto pagado por la pasarela no pasa a 'abonada' porque septiembre arrastre $40.000 | `estados.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 4 | `F12-comprobante-sobrescrito` | F-12 | un comprobante aprobado por la administración tampoco se borra por inferencia | `estados.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 5 | `F02-conciliar-boton` | F-02 | el botón 'Conciliar' (facturas.reconciliar) tampoco degrada una factura pagada con evidencia | `estados.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 6 | `F02-control` | F-02 | un 'pagada' INFERIDO (sin evidencia) sí se corrige si se vuelve a subir el PDF siguiente corregido | `estados.regresion.ts` | ✅ PASA (control) |
| 7 | `F11-control` | F-11 | subir el lote A dos veces ('solo nuevas') no duplica ni cambia estados | `importacion.regresion.ts` | ✅ PASA (control) |
| 8 | `F11-control` | F-11 | re-subir agosto y septiembre con 'actualizar' no duplica y conserva lo que dedujo la conciliación | `importacion.regresion.ts` | ✅ PASA (control) |
| 9 | `F11-control` | F-11 | volver a subir agosto (con 'actualizar') no deshace un pago aprobado | `importacion.regresion.ts` | ✅ PASA (control) |
| 10 | `F11-bulkFacturas-duplica` | F-11 | la migración no crea una segunda factura de agosto para la casa 101 si ya la subió la web | `importacion.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 11 | `F11-bulkFacturas-resetea-estado` | F-11 | re-ejecutar la migración no devuelve a 'pendiente' una factura pagada | `importacion.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 12 | `F11-upsertFactura-resetea-estado` | F-11 | la importación por script (upsertFactura) no devuelve a 'pendiente' una factura pagada | `importacion.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 13 | `F07-periodo-contradice-documento` | F-07 | un documento de 'Octubre / 2026' no queda guardado en silencio como 2026-09 | `importacion.regresion.ts` | ❌ FALLA → verde en Fase 2 |
| 14 | `F07-periodo-contradice-documento` | F-07 | un documento de '01-octubre-2026' no queda guardado en silencio como 2026-09 | `importacion.regresion.ts` | ❌ FALLA → verde en Fase 2 |
| 15 | `F07-control` | F-07 | si la etiqueta del documento ('Septiembre / 2026') coincide con el período, se guarda | `importacion.regresion.ts` | ✅ PASA (control) |
| 16 | `F07-control` | F-07 | si la etiqueta del documento ('01-septiembre-2026') coincide con el período, se guarda | `importacion.regresion.ts` | ✅ PASA (control) |
| 17 | `F09-hueco-de-periodo` | F-09 | agosto → [septiembre sin cargar] → octubre: el saldo de octubre no basta para juzgar agosto | `importacion.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 18 | `F09-control` | F-09 | con saldo anterior 0 en octubre, agosto no queda vencida ni abonada | `importacion.regresion.ts` | ✅ PASA (control) |
| 19 | `F04-saldo-a-favor-leido-como-deuda` | F-04 | con la lectura actual, agosto (a favor $262.000) no puede quedar 'vencida' | `importacion.regresion.ts` | ❌ FALLA → verde en Fase 2 |
| 20 | `F04-control` | F-04 | con la lectura correcta (la de la fila Totales), la misma regla deja agosto en 'saldo_a_favor' | `importacion.regresion.ts` | ✅ PASA (control) |
| 21 | `F13-pago-parcial-marcado-pagada` | F-13 | $250.000 aprobados sobre $300.000 dejan un saldo de $50.000: agosto no puede quedar 'pagada' | `pagos.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 22 | `F02-control` | F-02 | septiembre trae los $50.000: agosto queda abonada (no vencida) y el pago sigue aprobado y ligado | `pagos.regresion.ts` | ✅ PASA (control) |
| 23 | `F02-conciliacion-sobrescribe-pago (Caso A)` | F-02 | la contabilidad cortó antes de aplicar el abono y septiembre arrastra $300.000: agosto no puede quedar 'vencida' con $250.000 aprobados | `pagos.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 24 | `F01-factura-historica-doble-pago (Caso C)` | F-01 | tras cargar septiembre, el residente no puede iniciar otro pago de agosto (web ni WhatsApp) | `pagos.regresion.ts` | ❌ FALLA → verde en Fase 1 |
| 25 | `F01-control (Caso C)` | F-01 | septiembre, la vigente, sí se puede pagar y por $350.000 | `pagos.regresion.ts` | ✅ PASA (control) |
| 26 | `F01-factura-historica-doble-pago (Caso B)` | F-01 | cuando la vigente queda pagada, la absorbida no vuelve a ser pagable | `pagos.regresion.ts` | ❌ FALLA → verde en Fase 1 |
| 27 | `F03-cartera-mora-tras-pago (Caso B)` | F-03 | la cartera de la administración debe ver la casa al día después de pagar septiembre | `pagos.regresion.ts` | ❌ FALLA → verde en Fase 1 |
| 28 | `F01-armarDatosTrn-no-vigente` | F-01 | agosto (vencida) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts` | ❌ FALLA → verde en Fase 1 |
| 29 | `F01-armarDatosTrn-no-vigente` | F-01 | agosto (abonada) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts` | ❌ FALLA → verde en Fase 1 |
| 30 | `F01-armarDatosTrn-no-vigente` | F-01 | agosto (pendiente) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts` | ❌ FALLA → verde en Fase 1 |
| 31 | `F01-control` | F-01 | la vigente (septiembre) sí se acepta, por su total acumulado | `pagos.regresion.ts` | ✅ PASA (control) |
| 32 | `F01-control` | F-01 | una factura pagada se sigue rechazando | `pagos.regresion.ts` | ✅ PASA (control) |
| 33 | `F06-descuento-vencido` | F-06 | el 8 de octubre (fecha del pago QA real) se cobra $380.000, no $340.000 | `pagos.regresion.ts` | ❌ FALLA → verde en Fase 3 |
| 34 | `F06-control` | F-06 | el 10 de septiembre (dentro del 1–15) se cobra con descuento: $340.000 | `pagos.regresion.ts` | ✅ PASA (control) |
| 35 | `F06-control` | F-06 | el 20 de octubre (después del vencimiento guardado) se cobra $380.000 | `pagos.regresion.ts` | ✅ PASA (control) |
| 36 | `F20-listPorFactura-sin-control` | F-20 | el vecino de la 202 no puede listar los pagos de la factura de la 101 | `pagos.regresion.ts` | ❌ FALLA → verde en Fase 4 |
| 37 | `F20-control` | F-20 | la dueña de la factura sí ve su pago | `pagos.regresion.ts` | ✅ PASA (control) |
| 38 | `F08-control` | F-08 | un reporte del carro es un cobro pendiente por la tarifa del carro | `parqueadero.regresion.ts` | ✅ PASA (control) |
| 39 | `F08-control` | F-08 | dos carros distintos de la misma casa en el mismo mes son dos cobros (la identidad es casa + vehículo + período) | `parqueadero.regresion.ts` | ✅ PASA (control) |
| 40 | `F08-reportes-duplican-cobro` | F-08 | tres reportes del mismo carro en septiembre son UN cobro de $7.000, no tres | `parqueadero.regresion.ts` | ❌ FALLA → verde en Fase 4 |
| 41 | `F08-estados-paralelos` | F-08 | marcarlo 'cobrada' en Vigilancia no lo deja 'pendiente' en Cobros de parqueadero | `parqueadero.regresion.ts` | ❌ FALLA → verde en Fase 4 |
| 42 | `F08-refacturar` | F-08 | un cargo ya facturado en octubre no se puede volver a facturar en noviembre | `parqueadero.regresion.ts` | ❌ FALLA → verde en Fase 4 |
| 43 | `F10-control` | F-10 | un mes con $7.000 de aporte suma $7.000 | `parqueadero.regresion.ts` | ✅ PASA (control) |
| 44 | `F10-aporte-suma-arrastre` | F-10 | agosto y septiembre con $7.000 de aporte cada uno suman $14.000, no $21.000 | `parqueadero.regresion.ts` | ❌ FALLA → verde en Fase 4 |
| 45 | `F10-aporte-concepto-equivocado` | F-10 | el código 5 de Arboleda ('Parqueadero visitante') no es aporte voluntario | `parqueadero.regresion.ts` | ❌ FALLA → verde en Fase 4 |
| 46 | `F03-control` | F-03 | la carga reproduce los estados de producción: abril y junio 'vencida', mayo/julio/agosto 'pagada', septiembre 'pendiente' | `residente.regresion.ts` | ✅ PASA (control) |
| 47 | `F03-control` | F-03 | la cartera de la administración la ve 'pendiente', sin mora, debiendo solo septiembre ($289.000) | `residente.regresion.ts` | ✅ PASA (control) |
| 48 | `F03-navBadges-historial` | F-03 | el contador de vencidas no cuenta abril y junio, ya saldadas | `residente.regresion.ts` | ❌ FALLA → verde en Fase 1 |
| 49 | `F03-navBadges-mora-actual` | F-03 | si la factura vigente ya venció, el contador sí la cuenta | `residente.regresion.ts` | ❌ FALLA → verde en Fase 1 |
| 50 | `F01-control` | F-01 | con la vigente pendiente, el bot ofrece la vigente | `residente.regresion.ts` | ✅ PASA (control) |
| 51 | `F01-bot-ofrece-absorbida` | F-01 | si la vigente ya está pagada, el bot no ofrece pagar la absorbida | `residente.regresion.ts` | ❌ FALLA → verde en Fase 1 |
| 52 | `F12-bot-elige-por-orden-de-carga` | F-12 | el bot elige la factura por período, no por la última que se subió | `residente.regresion.ts` | ❌ FALLA → verde en Fase 1 |
| 53 | `F16-control` | F-16 | la propietaria ve sus dos facturas, una vez cada una | `residente.regresion.ts` | ✅ PASA (control) |
| 54 | `F16-listMia-duplica` | F-16 | un vínculo repetido a la misma casa no repite las facturas | `residente.regresion.ts` | ❌ FALLA → verde en Fase 4 |
| 55 | `F16-listMia-vigencia` | F-16 | un arrendatario cuyo contrato venció ya no ve las facturas de la casa | `residente.regresion.ts` | ❌ FALLA → verde en Fase 4 |
| 56 | `F04-control` | F-04 | cdc-control: total, descuento, saldo anterior (filas de marzo) y cargos del mes (filas de abril) coinciden con el documento | `parserFacturas.test.mjs` | ✅ PASA (control) |
| 57 | `F04-cdc-total-negativo (Caso A)` | F-04 | 'Pague sin descuento $-400.000' (anticipo) no se lee como $0 | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 58 | `F04-cdc-total-negativo (Caso A)` | F-04 | agosto real de una casa con $262.000 a favor no se lee como $0 | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 59 | `F04-cdc-creditos (Caso B)` | F-04 | la fila 'CI ANTICIPO DE CLIENTE' ($-760.000) no se ignora | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 60 | `F04-cdc-creditos (Caso B)` | F-04 | la fila 'NCC NOTA CREDITO CLIENTE' ($-270.000) no se ignora: saldo anterior $-86.000, no $184.000 | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 61 | `F04-cdc-varias-filas (Caso C)` | F-04 | con filas de abril, de mayo y un crédito, separa saldo anterior, cargos del mes y total | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 62 | `F04-saldo-anterior-fantasma` | F-04 | septiembre vigente de una casa real: el saldo anterior es $-262.000 (a favor), no $+335.000 | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 63 | `F04-pdf-sin-lineas (Caso D)` | F-04 | una página sin filas de conceptos no sale como factura válida sin advertencia | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 64 | `F04-control (Caso E)` | F-04 | cdc-control.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ✅ PASA (control) |
| 65 | `F04-cuadre (Caso E)` | F-04 | cdc-anticipo-total-negativo.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 66 | `F04-cuadre (Caso E)` | F-04 | cdc-nota-credito.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 67 | `F04-cuadre (Caso E)` | F-04 | cdc-agosto-saldo-a-favor.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 68 | `F04-cuadre (Caso E)` | F-04 | cdc-septiembre-saldo-anterior-negativo.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 69 | `F04-cuadre (Caso E)` | F-04 | cdc-filas-incompletas.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 70 | `F04-cuadre (Caso E)` | F-04 | cdc-pagina-sin-filas.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 71 | `F04-control (Caso E)` | F-04 | arboleda-control.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ✅ PASA (control) |
| 72 | `F04-cuadre (Caso E)` | F-04 | arboleda-saldo-a-favor.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 73 | `F15-control` | F-15 | arboleda-control: período '01-junio-2026' y total $15.760 | `parserFacturas.test.mjs` | ✅ PASA (control) |
| 74 | `F15-control` | F-15 | el saldo a favor de $376.000 se reconoce en saldoAFavor | `parserFacturas.test.mjs` | ✅ PASA (control) |
| 75 | `F15-arboleda-total-entre-parentesis` | F-15 | 'TOTAL A PAGAR $(376,000)' se lee como $-376.000, no como $0 | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 76 | `F15-arboleda-periodo` | F-15 | el período de septiembre es '01-septiembre-2026', no el texto de la línea siguiente | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 77 | `F07-subida-sin-sesion` | F-07 | sin sesión, /api/facturas/upload rechaza la petición y no escribe en S3 | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 1 |
| 78 | `F07-s3-antes-de-confirmar` | F-07 | leer un PDF para la vista previa no publica nada en S3 | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 79 | `F07-s3-sobrescribe` | F-07 | dos lecturas del mismo período y la misma casa no reutilizan la misma llave de S3 | `parserFacturas.test.mjs` | ❌ FALLA → verde en Fase 2 |
| 80 | `F03-historial-como-mora` | F-03 | la casa del PQRS (abril y junio vencidas pero ya saldadas, septiembre aún no vence) se ve 'Pendiente', no 'Vencida' | `resumenResidente.test.mjs` | ❌ FALLA → verde en Fase 1 |
| 81 | `F03-control` | F-03 | septiembre sin pagar y sin vencer, sin historial vencido: 'Pendiente' | `resumenResidente.test.mjs` | ✅ PASA (control) |
| 82 | `F03-control` | F-03 | todo pagado: 'Al día' y ningún botón de pagar | `resumenResidente.test.mjs` | ✅ PASA (control) |
| 83 | `F03-mora-actual-oculta` | F-03 | el 20 de octubre septiembre ya venció sin pagarse: la casa está en mora y debe verse 'Vencida' | `resumenResidente.test.mjs` | ❌ FALLA → verde en Fase 1 |
| 84 | `F03-historial-como-mora (Caso B)` | F-03 | con septiembre pagada, la casa se ve 'Al día' aunque agosto haya quedado vencida | `resumenResidente.test.mjs` | ❌ FALLA → verde en Fase 1 |
| 85 | `F01-web-ofrece-absorbida (Casos B y C)` | F-01 | con septiembre pagada, 'Mis facturas' no ofrece pagar agosto ($366.113 que ya iban en septiembre) | `resumenResidente.test.mjs` | ❌ FALLA → verde en Fase 1 |
| 86 | `F01-control` | F-01 | con septiembre sin pagar, los únicos botones 'Pagar' son de septiembre (la vigente) | `resumenResidente.test.mjs` | ✅ PASA (control) |
| 87 | `F03-historial-como-mora (inicio)` | F-03 | la casa del PQRS no se pinta en rojo de 'vencida': solo debe septiembre, que aún no vence | `resumenResidente.test.mjs` | ❌ FALLA → verde en Fase 1 |
| 88 | `F03-control (inicio)` | F-03 | septiembre sin pagar y sin vencer, sin historial vencido: tarjeta de pendiente, no roja | `resumenResidente.test.mjs` | ✅ PASA (control) |
| 89 | `F03-mora-actual-oculta (inicio)` | F-03 | el 20 de octubre, con septiembre vencida sin pagar, la tarjeta sí debe estar en rojo | `resumenResidente.test.mjs` | ❌ FALLA → verde en Fase 1 |
| 90 | `F01-inicio-ofrece-absorbida (Caso B)` | F-01 | con septiembre pagada, el inicio dice 'Estás al día', no 'Total pendiente: $366.113' | `resumenResidente.test.mjs` | ❌ FALLA → verde en Fase 1 |
| 91 | `F03-control (inicio)` | F-03 | todo pagado: 'Estás al día' | `resumenResidente.test.mjs` | ✅ PASA (control) |

---

## 4. Defectos reproducidos

Para cada hallazgo: causa, flujo, resultado actual, resultado esperado, evidencia (lo que imprime la prueba hoy) y pruebas asociadas (número de la tabla de §3).

### F-01 — Una factura absorbida se puede volver a cobrar (CRÍTICO)

- **Causa:** `armarDatosTrn` (`packages/backend/convex/pagos.ts:313`) solo rechaza `estado === "pagada"`. No sabe cuál es la factura vigente de la casa. Las superficies del residente también consideran pagable cualquier `pendiente`/`vencida`/`abonada`: la web elige "la más reciente sin pagar" (`apps/web/app/mi/[id]/cuenta/page.tsx:78-90`) y el bot elige por orden de creación (`soportesPago.ts:144-158`).
- **Flujo:** pago por la pasarela (web, WhatsApp) y presentación de deuda.
- **Resultado actual:** se acepta abrir una transacción para agosto ya absorbido por septiembre, por la web y por el bot, con agosto en `vencida`, `abonada` o `pendiente`. Con septiembre pagada, la web muestra dos botones "Pagar" de agosto ($366.113), el inicio muestra *"Total pendiente: $366.113 · Agosto… Pagar ahora"* y el bot ofrece agosto.
- **Resultado esperado:** solo la factura vigente (la última de la cadena por período) es pagable; con la vigente pagada, la casa está al día y nada se ofrece para pagar.
- **Evidencia:** `la web aceptó cobrar agosto otra vez: expected true to be false`; `botones "Pagar" en: FAC-2026-08-0001, FAC-2026-08-0001`; `el bot ofrece 2026-08 (vencida)`.
- **Pruebas:** #24, #26, #28–30, #51, #85, #90 (defecto) · #25, #31, #32, #50, #86 (control).

### F-02 — La conciliación borra la evidencia de pago (CRÍTICO)

- **Causa:** `conciliarCadenaUnidad` (`facturas.ts:79-116`) sobrescribe el estado (`:107`) de toda factura que no sea la última, con lo que deduce del saldo anterior del PDF siguiente. No lee `pagos` ni `soportesPago`. `reconciliar` (`:599`) hace lo mismo para todo el conjunto.
- **Flujo:** carga del PDF del mes siguiente y botón "Conciliar" de Finanzas.
- **Resultado actual:** agosto pagado por la pasarela pasa a `vencida` (septiembre arrastra $300.000) o a `abonada` (arrastra $40.000). Con un abono aprobado de $250.000 y el corte contable antes de aplicarlo, agosto queda `vencida`. "Conciliar" degrada igual.
- **Resultado esperado:** con evidencia de pago, la inferencia no degrada el estado. Qué hacer con la diferencia (discrepancia para revisión) lo decide la Fase 3. Un `pagada` **inferido** sí puede corregirse con un PDF corregido (control #6).
- **Evidencia:** `expected 'vencida' to be 'pagada'`; `expected 'abonada' to be 'pagada'`; `expected 'vencida' not to be 'vencida'`.
- **Pruebas:** #2, #3, #5, #23 (defecto) · #1, #6, #22 (control). Relacionada: #4 (F-12).

### F-03 — Lo que ve el residente no coincide con su cartera (ALTO)

- **Causa:** la web calcula el estado del resumen con `tieneVencidas = conDeuda.some(estado === "vencida")` sobre **todo el historial** (`cuenta/page.tsx:113`; inicio `app/mi/[id]/page.tsx:141`, `:403-404`). `portal.navBadges` cuenta todas las `vencida` históricas (`portal.ts:280`).
- **Flujo:** inicio y "Mis facturas" del residente; contador de vencidas.
- **Resultado actual, en las dos direcciones:**
  - La casa del PQRS —abril y junio vencidas pero saldadas después, septiembre aún sin vencer— ve **"Vencida"** y la tarjeta roja. La cartera dice `pendiente`, sin mora. El contador entrega 2.
  - Casa con septiembre vencida el 20 de octubre y sin historial vencido: ve **"Pendiente"** y la tarjeta ámbar. La cartera dice `en_mora`. El contador entrega 0. *Esta dirección no estaba en la auditoría* (§7).
  - Casa con septiembre pagada y agosto absorbida: ve "Vencida".
- **Resultado esperado:** el estado del residente sale de la misma regla que la cartera (`lib/cartera.ts`).
- **Evidencia:** `Expected: "Pendiente" Received: "Vencida"`; `Expected: "Vencida" Received: "Pendiente"`; `expected 2 to be +0`; `expected +0 to be 1`.
- **Pruebas:** #48, #49, #80, #83, #84, #87, #89 (defecto) · #46, #47, #81, #82, #88, #91 (control). Más el hallazgo nuevo #27 (§7).

### F-04 — El parser de Ciudad del Campo lee mal créditos y saldos a favor (ALTO)

- **Causa** (`apps/web/app/api/facturas/upload/route.ts`):
  - los montos se leen sin signo: `\$([\d.,]+)` (`:192-199`) y `NUM_RE` (`:202`);
  - solo se reconocen filas con código de 3 dígitos (`:206`), así que las de crédito con código `CI` ("ANTICIPO DE CLIENTE") y `NCC` ("NOTA CREDITO CLIENTE") se ignoran;
  - no se compara contra la fila "Totales" ni se valida el cuadre.

  La conciliación usa `Σ lineas.saldoAnterior` (`lib/cartera.ts:74-76`).
- **Flujo:** subida de PDFs → conciliación → estado y desglose que ve el residente.
- **Resultado actual:**

  | Documento | Lectura actual | Documento real |
  |---|---|---|
  | Anticipo | total 0, saldo anterior 0 | total **−400.000**, saldo anterior **−760.000** |
  | Agosto de una casa vigente | total 0 | total **−262.000** |
  | Nota crédito | saldo anterior 184.000 | saldo anterior **−86.000** |
  | Septiembre vigente | saldo anterior +335.000 | saldo anterior **−262.000** |
  | Página sin filas | 0 líneas, total 8.474.750, 0 errores | — |
  | Cuadre | 7 de 9 documentos no cuadran, ninguno marcado | — |

  En el backend, con la lectura actual, agosto (a favor $262.000) queda `vencida`.
- **Resultado esperado:** montos con signo, filas de crédito incluidas y saldo anterior igual a la fila "Totales". Toda factura cuadra (Σ líneas = total) o sale marcada. Con la lectura correcta, la **misma** regla de conciliación da `saldo_a_favor` (control #20): el arreglo es del parser y de la validación, no de la regla.
- **Evidencia:** `Expected: -400000 Received: 0`; `Expected: -86000 Received: 184000`; `las líneas suman 670000 y el total leído es 73000`; `salió con 0 líneas, total 8474750 y 0 errores`.
- **Pruebas:** #19, #57–63, #65–70, #72 (defecto) · #20, #56, #64, #71 (control).
- **Nota sobre los fixtures 907 y 904:** son páginas de **continuación**: el PDF guardado desde la migración no trae la primera hoja. El defecto que demuestran es que el parser no detecta que el documento no cuadra, no un fallo de agrupación de páginas.

### F-06 — El descuento se cobra hasta el 15 del mes siguiente (ALTO)

- **Causa:** la carga fija `fechaVencimiento` en el 15 del mes **siguiente** (`apps/web/components/upload-facturas.tsx:140-143`), y `armarDatosTrn` la usa como límite del descuento (`pagos.ts:318-323`).
- **Flujo:** monto que se cobra por la pasarela.
- **Resultado actual:** el 8 de octubre, para la cuenta de septiembre, se cobran $340.000 (con descuento).
- **Resultado esperado:** $380.000. El documento lo dice: *"PARA BENEFICIARSE DEL DESCUENTO… DEBE PAGAR LA TOTALIDAD DEL ESTADO DE CUENTA HASTA EL DIA 15 DEL PRESENTE MES"*; para la cuenta de septiembre, el descuento vence el 15 de septiembre.
- **Evidencia:** `expected 340000 to be 380000`. Es el mismo monto del pago QA real `m978jsk6…` del 2026-10-08.
- **Pruebas:** #33 (defecto) · #34, #35 (control).

### F-07 — Identidad del período y endpoint de subida (ALTO)

- **Causa:**
  - el período lo elige quien sube y no se compara con `periodoLabel`;
  - `/api/facturas/upload` no consulta la sesión (`route.ts:243`);
  - escribe en S3 al **leer** el PDF, antes de confirmar (`:302`), con una llave fija por (período, casa) (`:23`).
- **Flujo:** subida de facturas.
- **Resultado actual:** un documento de "Octubre / 2026" (o "01-octubre-2026") queda guardado como 2026-09. Sin sesión, el endpoint responde 200 y publica en S3. La vista previa ya publicó el PDF, y dos lecturas de la misma casa y período usan la misma llave.
- **Resultado esperado:** rechazo o advertencia ante la contradicción. 401/403 sin sesión. Nada en S3 hasta confirmar, y llaves que no se pisan.
- **Evidencia:** `quedó guardada como 2026-09 con periodoLabel "Octubre / 2026"`; `sin sesión respondió 200`; `llaves: …/2026-09/unidad-999.pdf, …/2026-09/unidad-999.pdf`.
- **Pruebas:** #13, #14, #77, #78, #79 (defecto) · #15, #16 (control).

### F-08 — Cobros de parqueadero (ALTO)

- **Causa:** un cargo por **reporte** (sin identidad casa + vehículo + período). Dos estados que no se hablan: `gestion` (`guardia.ts:2292`) y `cobroEstado` (`parqueadero.ts:124`). `marcarFacturado` no valida el estado previo.
- **Flujo:** del reporte del guarda a la cuenta de cobro.
- **Resultado actual:**
  - tres reportes del mismo carro en septiembre son tres cargos de $7.000;
  - "Marcar cobrada" en Vigilancia lo deja `pendiente` en Cobros de parqueadero;
  - un cargo facturado en octubre se vuelve a facturar en noviembre sin error.
- **Resultado esperado:** un cargo por (casa, vehículo, período) —dos carros distintos sí son dos cobros, control #39—, un solo estado y transiciones validadas.
- **Evidencia:** `un cargo por reporte: expected 3 to be 1`; `expected 'pendiente' not to be 'pendiente'`; `promise resolved "{ ok: true }" instead of rejecting`.
- **Pruebas:** #40, #41, #42 (defecto) · #38, #39 (control).

### F-09 — La conciliación juzga a través de un mes sin cargar (MEDIO)

- **Causa:** la cadena se ordena por período sin verificar continuidad (`facturas.ts:84-105`).
- **Flujo:** carga con un mes faltante (en producción falta julio en CDC y mayo en 30 casas de Arboleda).
- **Resultado actual:** agosto queda `vencida` porque octubre arrastra la cuota de **septiembre**.
- **Resultado esperado:** sin veredicto. Con saldo anterior 0 sí puede darse por pagada, nunca vencida ni abonada (control #18).
- **Evidencia:** `agosto quedó "vencida"`.
- **Pruebas:** #17 (defecto) · #18 (control).

### F-10 — Reporte de aporte voluntario (MEDIO)

- **Causa:** suma `línea.total` (que trae el arrastre) entre meses e identifica el concepto por `codigo === 5` en todos los conjuntos (`lib/aporte.ts:68-72`).
- **Resultado actual:** $7.000 + $7.000 de aporte suman $21.000. El "Parqueadero visitante" de Arboleda (código 5) entra al reporte.
- **Resultado esperado:** $14.000; el concepto, identificado por conjunto.
- **Evidencia:** `expected 21000 to be 14000`; `expected { color: 'gris', … } to be undefined`.
- **Pruebas:** #44, #45 (defecto) · #43 (control).

### F-11 — Idempotencia de las importaciones (MEDIO)

- **Causa:** `migrations.bulkFacturas` deduplica solo por `legacyId` y su patch sobrescribe `estado`. `facturas.upsertFactura` también sobrescribe `estado` en el update.
- **Resultado actual:** la migración crea una segunda factura de agosto para la misma casa. Re-ejecutarla, o correr `upsertFactura`, devuelve a `pendiente` una factura pagada.
- **Resultado esperado:** una factura por (conjunto, casa, período) venga de donde venga, y el estado no se resetea.
- **Evidencia:** `dos facturas de agosto para la misma casa: … got 2`; `expected 'pendiente' to be 'pagada'`.
- **Pruebas:** #10, #11, #12 (defecto) · #7, #8, #9 (control: la carga por la web **sí** es idempotente).

### F-12 — Comprobantes y factura que ofrece el bot (MEDIO)

- **Causa:** la aprobación de un comprobante se pierde con la conciliación. `facturaVigenteDeUnidad` elige por orden de creación, no por período.
- **Resultado actual:** el comprobante aprobado pasa a `vencida` con el PDF siguiente. Si julio se sube tarde, el bot ofrece julio en vez de septiembre.
- **Evidencia:** `expected 'vencida' to be 'pagada'`; `expected '2026-07' to be '2026-09'`.
- **Pruebas:** #4, #52 (defecto).

### F-13 — Un pago parcial aprobado deja la factura "pagada" (MEDIO)

- **Causa:** `aplicarEstado` (`pagos.ts:630`) pone `pagada` sin comparar el monto (`:666-673`).
- **Resultado actual:** $250.000 aprobados sobre $300.000 dejan agosto `pagada`.
- **Resultado esperado:** `abonada` (quedan $50.000).
- **Evidencia:** `expected 'pagada' to be 'abonada'`.
- **Pruebas:** #21.

### F-15 — Parser de Arboleda (MEDIO)

- **Causa:** `TOTAL A PAGAR\s+\$([\d,]+)` (`route.ts:123`) no admite la notación contable `$(376,000)`. `Periodo:\s*([^\n]+)` (`:117`) cruza el salto de línea con `\s*` cuando la fecha bajó un renglón, como pasó en el formato de septiembre.
- **Resultado actual:** total 0 y período `Arboleda Campestre Aptos"`. El saldo a favor sí se reconoce (control #74).
- **Resultado esperado:** total −376.000 y período `01-septiembre-2026`.
- **Pruebas:** #75, #76 (defecto) · #73, #74 (control).

### F-16 — `listMia` (BAJO)

- **Causa:** no reutiliza `misUnidadIds` (`model/authz.ts:93`): no deduplica ni filtra vínculos vencidos.
- **Resultado actual:** con un vínculo repetido, cada factura sale dos veces. Una arrendataria con el contrato vencido sigue viendo las facturas de la casa.
- **Pruebas:** #54, #55 (defecto) · #53 (control).

### F-20 — Pagos visibles para cualquier sesión (BAJO, seguridad)

- **Causa:** `pagos.listPorFactura` (`pagos.ts:1176`) solo exige sesión.
- **Resultado actual:** el vecino de la 202 lista los pagos de la factura de la 101.
- **Pruebas:** #36 (defecto) · #37 (control).

---

## 5. Pruebas que deben fallar actualmente (58)

Agrupadas por la fase que debe ponerlas en verde. Entre paréntesis, lo que da hoy → lo esperado.

### Fase 1 — contención (18)

| # | Prueba | Hoy → esperado |
|---|---|---|
| 24 | `F01-factura-historica-doble-pago (Caso C)` | se acepta pagar agosto → rechazo |
| 26 | `F01-factura-historica-doble-pago (Caso B)` | se acepta pagar agosto con septiembre pagada → rechazo |
| 27 | `F03-cartera-mora-tras-pago (Caso B)` | cartera `en_mora` → `al_dia` |
| 28–30 | `F01-armarDatosTrn-no-vigente` (vencida, abonada, pendiente) | se acepta → rechazo |
| 48 | `F03-navBadges-historial` | 2 → 0 |
| 49 | `F03-navBadges-mora-actual` | 0 → 1 |
| 51 | `F01-bot-ofrece-absorbida` | agosto → septiembre o nada |
| 52 | `F12-bot-elige-por-orden-de-carga` | julio → septiembre |
| 77 | `F07-subida-sin-sesion` | 200 → 401/403 |
| 80 | `F03-historial-como-mora` | "Vencida" → "Pendiente" |
| 83 | `F03-mora-actual-oculta` | "Pendiente" → "Vencida" |
| 84 | `F03-historial-como-mora (Caso B)` | "Vencida" → "Al día" |
| 85 | `F01-web-ofrece-absorbida (Casos B y C)` | 2 botones de agosto → 0 |
| 87 | `F03-historial-como-mora (inicio)` | tarjeta roja → no roja |
| 89 | `F03-mora-actual-oculta (inicio)` | no roja → roja |
| 90 | `F01-inicio-ofrece-absorbida (Caso B)` | "Total pendiente: $366.113" → "Estás al día" |

### Fase 2 — ingestión confiable (21)

| # | Prueba | Hoy → esperado |
|---|---|---|
| 13–14 | `F07-periodo-contradice-documento` | guardada como 2026-09 → rechazo/no guardar |
| 19 | `F04-saldo-a-favor-leido-como-deuda` | agosto `vencida` → no vencida |
| 57–58 | `F04-cdc-total-negativo (Caso A)` | 0 → −400.000 / −262.000 |
| 59–60 | `F04-cdc-creditos (Caso B)` | 0 / 184.000 → −760.000 / −86.000 |
| 61 | `F04-cdc-varias-filas (Caso C)` | saldo anterior 184.000 → −86.000 |
| 62 | `F04-saldo-anterior-fantasma` | +335.000 → −262.000 |
| 63 | `F04-pdf-sin-lineas (Caso D)` | 0 líneas sin aviso → cuadra o marcada |
| 65–70, 72 | `F04-cuadre (Caso E)` (7 documentos) | no cuadra sin aviso → cuadra o marcada |
| 75 | `F15-arboleda-total-entre-parentesis` | 0 → −376.000 |
| 76 | `F15-arboleda-periodo` | `Arboleda Campestre Aptos"` → `01-septiembre-2026` |
| 78 | `F07-s3-antes-de-confirmar` | publica en la vista previa → nada |
| 79 | `F07-s3-sobrescribe` | misma llave → llaves distintas |

### Fase 3 — modelo de pagos y estados (11)

| # | Prueba | Hoy → esperado |
|---|---|---|
| 2 | `F02-pagada-a-vencida` | `vencida` → `pagada` |
| 3 | `F02-pagada-a-abonada` | `abonada` → `pagada` |
| 4 | `F12-comprobante-sobrescrito` | `vencida` → `pagada` |
| 5 | `F02-conciliar-boton` | `vencida` → `pagada` |
| 10 | `F11-bulkFacturas-duplica` | 2 facturas → 1 |
| 11 | `F11-bulkFacturas-resetea-estado` | `pendiente` → `pagada` |
| 12 | `F11-upsertFactura-resetea-estado` | `pendiente` → `pagada` |
| 17 | `F09-hueco-de-periodo` | `vencida` → sin veredicto |
| 21 | `F13-pago-parcial-marcado-pagada` | `pagada` → `abonada` |
| 23 | `F02-conciliacion-sobrescribe-pago (Caso A)` | `vencida` → no vencida |
| 33 | `F06-descuento-vencido` | $340.000 → $380.000 |

### Fase 4 — cobros operativos, reportes y lectura (8)

| # | Prueba | Hoy → esperado |
|---|---|---|
| 36 | `F20-listPorFactura-sin-control` | lista → rechazo |
| 40 | `F08-reportes-duplican-cobro` | 3 cargos → 1 |
| 41 | `F08-estados-paralelos` | `pendiente` → no pendiente |
| 42 | `F08-refacturar` | `{ ok: true }` → rechazo |
| 44 | `F10-aporte-suma-arrastre` | 21.000 → 14.000 |
| 45 | `F10-aporte-concepto-equivocado` | incluido → excluido |
| 54 | `F16-listMia-duplica` | 4 → 2 |
| 55 | `F16-listMia-vigencia` | 2 → 0 |

La asignación sigue el plan de la auditoría (§20), con dos ajustes: `F12-bot-elige-por-orden-de-carga` pasa a Fase 1 porque es parte de "solo se paga la vigente en todas las superficies", y `F03-cartera-mora-tras-pago` también, porque el resumen del residente se va a derivar de esa cartera.

---

## 6. Pruebas que ya pasan (33)

Son la otra mitad de la red: fijan lo que hoy está bien, para que la corrección no lo rompa.

| # | Prueba | Qué protege |
|---|---|---|
| 1 | `F02-control` | Un pago aprobado sin factura siguiente deja la factura `pagada` |
| 6 | `F02-control` | Un `pagada` inferido (sin evidencia) sí se corrige con un PDF corregido |
| 7–9 | `F11-control` | La carga por la web es idempotente (dos veces, con "actualizar", tras un pago) |
| 15–16 | `F07-control` | Una factura cuyo período coincide con su documento se guarda |
| 18 | `F09-control` | Con saldo anterior 0, agosto no queda vencida ni abonada aunque falte un mes |
| 20 | `F04-control` | Con la lectura correcta del PDF, la regla de conciliación da `saldo_a_favor` |
| 22 | `F02-control` | Con $50.000 de saldo, agosto queda `abonada` y el pago sigue `aprobada` y ligado |
| 25, 31 | `F01-control` | La vigente se puede pagar, por su total acumulado |
| 32 | `F01-control` | Una factura `pagada` se sigue rechazando |
| 34–35 | `F06-control` | Dentro del 1–15 se cobra con descuento; después del vencimiento, sin descuento |
| 37 | `F20-control` | La dueña de la factura sí ve su pago |
| 38–39 | `F08-control` | Un reporte = un cobro por la tarifa del carro; dos carros = dos cobros |
| 43 | `F10-control` | Un mes de aporte suma su valor |
| 46–47 | `F03-control` | La cadena del PQRS reproduce los estados de producción; la cartera la ve `pendiente` sin mora |
| 50 | `F01-control` | Con la vigente pendiente, el bot ofrece la vigente |
| 53 | `F16-control` | La propietaria ve sus facturas una vez |
| 56, 64, 71 | `F04-control` | El parser acierta con un documento limpio de CDC (saldo anterior, mes, total, descuento) y cuadra en CDC y Arboleda |
| 73–74 | `F15-control` | Arboleda: período, total y saldo a favor en el formato que funciona |
| 81–82, 88, 91 | `F03-control` | Sin historial vencido: "Pendiente"/"Al día" correctos en Mis facturas y en el inicio |
| 86 | `F01-control` | Con la vigente sin pagar, el único "Pagar" es el de la vigente |

---

## 7. Discrepancias con la auditoría y hallazgos nuevos

| # | Qué | Detalle | Prueba |
|---|---|---|---|
| D-1 | **Nuevo:** la cartera de la administración marca `en_mora` a quien ya pagó | `carteraDeUnidad` (`lib/cartera.ts:245`) decide la mora con el último período ya vencido (agosto, `vencida`) sin mirar que la factura siguiente, que lo absorbe, está `pagada`. Una casa que pagó todo antes del vencimiento de la vigente queda `en_mora` con saldo 0 hasta que esta vence. La auditoría (§6.3) daba este modelo por correcto. Latente: solo ocurre cuando la vigente queda pagada por Vekino. | #27 |
| D-2 | **Nuevo:** la web oculta la mora real | Si la vigente ya venció sin pagarse y no hay historial vencido, la web muestra "Pendiente" y tarjeta ámbar mientras la cartera dice `en_mora`. Es la dirección contraria de F-03, que la auditoría no describía. | #83, #89, #49 |
| D-3 | F-06 confirmado | La auditoría lo dejó "pendiente de confirmar la regla". Los PDF de CDC dicen *"HASTA EL DIA 15 DEL PRESENTE MES"*. | #33 |
| D-4 | F-04 §14.5 confirmado con los PDF vigentes | Los PDF de S3 (agosto y septiembre de dos casas de CDC) muestran agosto con total negativo (−262.000 y −3.200) y septiembre con saldo anterior negativo. El "saldo anterior fantasma" es un crédito leído como deuda. | #58, #62, #19 |
| D-5 | F-15: causa precisa | Arboleda imprime los negativos entre paréntesis (`$(376,000)`), y en septiembre la fecha del período bajó un renglón. | #75, #76 |
| D-6 | F-04: páginas de continuación | Los PDF de las casas 907 y 904 guardados en la migración son páginas de continuación (no traen la primera hoja). La auditoría lo atribuía a que el documento "no lista todas las filas"; el defecto demostrable es que nadie detecta que no cuadra. | #63, #69, #70 |
| D-7 | F-17: matiz | En CDC, "CUENTA DE COBRO Nro." se repite entre meses para la misma casa (agosto y septiembre llevan el mismo número). No es un consecutivo por documento, y no sirve como identidad. | — |
| D-8 | Código movido | El merge `b9dedde` (Aval multiconvenio) movió líneas de `pagos.ts`. `armarDatosTrn`, `aplicarEstado` y la conciliación no cambiaron de comportamiento. Las referencias de este documento usan las líneas actuales. | — |

---

## 8. Riesgos pendientes

**Todo lo que reproducen las 58 pruebas rojas sigue sin corregir.** Además:

| Riesgo | Por qué no tiene prueba automática en la Fase 0 | Dónde se resuelve |
|---|---|---|
| **F-05** — Los pagos por el portal público de Aval o el banco no se ven en Vekino hasta el PDF siguiente | No hay código en Vekino que los procese: el defecto es la ausencia del flujo | Fase 3 (importar el recaudo) |
| **App móvil** — "Pagar" en facturas absorbidas (`facturas.tsx:1037-1041`) y suma de pendientes (F-18) | El proyecto no tiene infraestructura para montar componentes React Native. El backend (#24–30) cubre el camino del dinero también para el móvil | Fase 1 (cambio) + QA manual |
| Bot de WhatsApp — la conversación (`whatsapp.ts`, `whatsappAgente.ts`) | Se cubren las consultas que usa (`facturaVigenteDeUnidad`, `datosParaTrnDeUsuario`), no el diálogo | Fase 1 |
| **F-13** — Reverso de pagos y consultas agotadas a los 60 min | Requiere simular las acciones HTTP de Aval | Fase 3 |
| **F-14** — `AVAL_AMBIENTE` por defecto "qa"; `limpieza` borra `pagos` | Depende de configuración del deployment | Fase 1 (verificar variables) / Fase 3 |
| Período por defecto de la subida = último cargado (`finanzas/page.tsx:69`) | Es estado de la UI de administración; la consecuencia (guardar con el período equivocado) sí está cubierta (#13–14) | Fase 2 |
| **F-17, F-19, F-21** — Números de factura, métricas de recaudo, unicidad declarativa e historial | Una prueba fijaría un diseño que aún no está decidido | Fases 3 y 4 |
| **Datos de producción** — 62 casas al día que ven "Vencida"; estados de CDC agosto/septiembre derivados de lecturas erróneas | La Fase 0 no toca datos | Fase 1 (revisión manual) y Fase 2 (re-procesar PDFs) |

---

## 9. Próxima fase: qué implementar en la Fase 1

**Objetivo:** cerrar la puerta del doble pago y dejar de mostrar mora falsa, **antes** de abrir la pasarela por API (el bot de WhatsApp ya la usa). Sin tocar todavía el parser ni el modelo de pagos.

1. **Una sola definición de "factura vigente"** en el backend: la última de la cadena de la casa, por período (función pura en `lib/cartera.ts`, junto a `carteraDeUnidad`). Que la usen todos.
2. **`armarDatosTrn` acepta solo la vigente** y rechaza las absorbidas con un mensaje claro. Así pasan #24, #26, #28–30 sin romper los controles #25, #31, #32.
3. **`facturaVigenteDeUnidad` (bot y agente) elige por período y devuelve la vigente**; si está pagada, el bot responde "estás al día". → #51, #52 (control #50).
4. **Corregir `carteraDeUnidad`**: una factura posterior `pagada` o `saldo_a_favor` cubre la mora de las anteriores que absorbe. → #27, sin romper #47.
5. **Estado del residente derivado de la cartera.** Que el backend entregue, por casa, el resumen de `carteraDeUnidad` y cuál es la vigente (por ejemplo, en `listMia` o en una consulta propia). La web ("Mis facturas" e inicio) pinta "Al día / Pendiente / Vencida" desde ahí y ofrece "Pagar" solo en la vigente. `navBadges` cuenta la mora actual. → #48, #49, #80, #83, #84, #85, #87, #89, #90 (controles #81, #82, #86, #88, #91). La app móvil necesita el mismo cambio: no tiene prueba automática, así que debe verificarse a mano.
6. **Autenticación y autorización en `/api/facturas/upload`** (como `/api/incidentes/reporte`, con `@/lib/auth-server`). → #77. Si se usa otro mecanismo, ajustar el doble de sesión de `parserFacturas.test.mjs`.
7. **Fuera de las pruebas:** revisar con la administración las 62 casas al día marcadas "Vencida" (auditoría §14.2), responder el PQRS `m179ddw0…` y confirmar `AVAL_AMBIENTE=prod` en el deployment productivo.

**Criterio de salida de la Fase 1:** las 18 pruebas de §5 "Fase 1" en verde y las 33 de §6 todavía en verde, con `bun run test:facturacion` en backend y web. Las de las fases 2–4 siguen rojas: es lo esperado, y cualquiera que se ponga verde antes de tiempo merece una mirada, porque puede ser una corrección accidental o una expectativa debilitada.

Después: **Fase 2** (parser con signo, Totales y cuadre, período desde el documento, S3 tras confirmar; 21 pruebas), **Fase 3** (evidencia de pago frente a inferencia, idempotencia de todas las rutas, huecos, descuento, monto pagado; 11 pruebas) y **Fase 4** (parqueadero, aporte, `listMia`, acceso a pagos; 8 pruebas).
