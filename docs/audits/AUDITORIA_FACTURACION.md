# Auditoría técnica y funcional de facturación — Vekino

| | |
|---|---|
| **Fecha** | 2026-10-08 |
| **Base auditada** | rama `main`, commit `2336530` (árbol limpio) |
| **Alcance** | `packages/backend/convex`, `apps/web`, `apps/mobile`, historial git, datos del deployment Convex `agreeable-bee-782` (solo lectura) |
| **Cambios realizados** | Ninguno. No se modificó código, esquema ni datos. Este documento es el único archivo creado. |

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Alcance auditado](#2-alcance-auditado)
3. [Arquitectura actual de facturación](#3-arquitectura-actual-de-facturación)
4. [Flujo completo de generación de cargos](#4-flujo-completo-de-generación-de-cargos)
5. [Flujo completo de pagos](#5-flujo-completo-de-pagos)
6. [Flujo de generación/presentación de facturas](#6-flujo-de-generaciónpresentación-de-facturas)
7. [Flujo entre períodos](#7-flujo-entre-períodos)
8. [Auditoría de base de datos](#8-auditoría-de-base-de-datos)
9. [Auditoría de queries](#9-auditoría-de-queries)
10. [Auditoría de backend](#10-auditoría-de-backend)
11. [Auditoría de frontend](#11-auditoría-de-frontend)
12. [Auditoría de tests](#12-auditoría-de-tests)
13. [Casos potenciales de duplicidad](#13-casos-potenciales-de-duplicidad)
14. [Evidencia encontrada](#14-evidencia-encontrada)
15. [Hallazgos clasificados por severidad](#15-hallazgos-clasificados-por-severidad)
16. [Causa raíz de cada problema](#16-causa-raíz-de-cada-problema)
17. [Escenarios de reproducción](#17-escenarios-de-reproducción)
18. [Riesgos actuales](#18-riesgos-actuales)
19. [Recomendaciones](#19-recomendaciones)
20. [Plan de corrección propuesto](#20-plan-de-corrección-propuesto)
21. [Respuesta final](#21-respuesta-final)
- [Anexo A — Método y comandos ejecutados](#anexo-a--método-y-comandos-ejecutados)

---

## 1. Resumen ejecutivo

### Respuesta corta

**Sí: existe un riesgo real de que Vekino le muestre a un residente como deuda —y en algunos canales le permita pagar de nuevo— un concepto que ya pagó.** Ese riesgo **no** viene de que Vekino genere cargos duplicados: Vekino no genera obligaciones. Las importa, como estados de cuenta en PDF, del software contable de cada conjunto. En las **2.792 facturas** de la base no hay **ningún** duplicado por (unidad, período).

El problema está en tres capas que se combinan:

1. **Cómo se deriva el estado de cada factura.** El estado (`pagada`, `abonada`, `vencida`) **no sale de un pago**. Sale de una inferencia: el "saldo anterior" que trae la factura del mes siguiente. Esa inferencia (a) pisa cualquier pago registrado en Vekino, (b) depende de un parser de PDF que en Ciudad del Campo II lee mal los saldos a favor y las filas de crédito, y (c) se equivoca cuando faltan meses en la cadena.
2. **Cómo se presenta.** La vista web del residente pinta **"Vencida"** en rojo si **cualquier** factura histórica quedó vencida, aunque la persona esté al día. Además, cuando la factura más reciente queda pagada, las anteriores —cuyo saldo ya iba absorbido en ella— **vuelven a aparecer como deuda pagable**.
3. **Dónde vive el pago.** Hoy el recaudo entra **por fuera** de Vekino (portal público de Aval, banco). Vekino no se entera hasta que se sube el PDF del mes siguiente. La pasarela por API apenas está en certificación: hay 1 pago en la base, de QA y fallido.

### Evidencia principal (datos reales, solo lectura)

| # | Hecho medido | Valor |
|---|---|---|
| E-1 | Facturas duplicadas por (condominio, unidad, período) | **0** de 2.792 |
| E-2 | Unidades cuyo resumen web de residente se pinta **"Vencida"** | **182 de 379 (48 %)** |
| E-3 | …de ellas, unidades **al día** según la propia conciliación (penúltima `pagada` y la vigente aún no vence) | **62** (32 Arboleda, 30 CDC) |
| E-4 | PQRS real `m179ddw0…` (2026-08-08): *"solicito actualizar el estado de cuenta ya que… me encuentro al día"* | Unidad **T-I 1004** (Arboleda): hoy es una de las 62 |
| E-5 | PDFs de CDC con total **negativo** (saldo a favor) que el parser actual guarda como **0** | **32 de 32** |
| E-6 | PDFs de CDC donde el "saldo anterior" extraído ≠ fila **Totales** del mismo PDF | **252 de 1.215 (20,7 %)** |
| E-7 | Estados en BD que contradicen el saldo anterior real del PDF siguiente | **74 de 1.010** pares evaluables |
| E-8 | Facturas de sept-2026 (vigentes) cuyo desglose muestra un "saldo anterior" que el total no incluye | p. ej. CDC 607, 401, 410, 503 |
| E-9 | Transiciones de cadena con **meses faltantes** (la conciliación juzga a través del hueco) | **240** |
| E-10 | Reportes de parqueadero del **mismo vehículo, mismo mes**, cada uno como cobro independiente pendiente | **34** grupos (2–4 reportes c/u) |
| E-11 | Pagos por pasarela registrados / comprobantes de pago | **1** (QA, `fallida`) / **0** |

### Las causas, en orden de impacto

| Hallazgo | Severidad | Estado |
|---|---|---|
| **F-01** Facturas absorbidas se tratan como deuda pagable; al pagar la vigente reaparecen | CRÍTICO | Latente: se activa con el primer pago aprobado por API o comprobante aprobado |
| **F-02** La conciliación pisa el pago real e ignora la tabla `pagos` | CRÍTICO | Latente para la API; el mismo mecanismo ya opera con pagos externos |
| **F-03** "Vencida" del residente calculado con el historial, no con la deuda vigente | ALTO | **Materializado** (E-2, E-3, E-4) |
| **F-04** Parser CDC: negativos → 0, créditos ignorados, filas faltantes | ALTO | **Materializado** (E-5 a E-8) |
| **F-05** Pagos hechos fuera de Vekino no se reflejan hasta la siguiente carga | ALTO | **Materializado** por diseño |
| **F-06** Descuento ofrecido/cobrado hasta el 15 del mes **siguiente** | ALTO | Latente (pago QA del 2026-10-08 lo evidencia) |
| **F-07** Identidad de la factura depende de un período elegido a mano; PDFs se sobrescriben en S3; endpoint sin autenticación | ALTO | Latente |
| **F-08** Cobros de parqueadero: dos estados paralelos y un cobro por reporte | ALTO | Latente (E-10) |

El resto (F-09 a F-21) se detalla en la [sección 15](#15-hallazgos-clasificados-por-severidad).

---

## 2. Alcance auditado

### 2.1 Código

| Capa | Archivos |
|---|---|
| Esquema | `packages/backend/convex/schema.ts` (tablas `facturas`, `pagos`, `soportesPago`, `guardiaNovedadReportes`, `reservas`, `guardiaReservaDepositos`, `reservaIncidentes`, `condominios.aporteVoluntario`, `usuarioUnidad`) |
| Backend facturación | `facturas.ts`, `lib/cartera.ts`, `pagos.ts`, `avalHttp.ts`, `lib/avalProduccion.ts`, `lib/referenciaPago.ts`, `soportesPago.ts`, `pagosPruebas.ts`, `http.ts` (retorno Aval), `migrations.ts` (`bulkFacturas`, `setTotalConDescuento`), `limpieza.ts` |
| Backend cobros operativos | `parqueadero.ts`, `lib/cobroParqueadero.ts`, `guardia.ts` (`reportarNovedad`, `gestionarNovedad`, depósitos), `aporte.ts`, `lib/aporte.ts`, `reservas.ts` (alquiler/depósito), `model/depositoReserva.ts`, `lib/depositoReserva.ts` |
| Backend lectura residente | `portal.ts` (`navBadges`), `notificacionesFeed.ts`, `whatsapp.ts` (bot), `whatsappAgente.ts` (agente IA), `whatsappNotifs.ts`, `model/authz.ts` (`misUnidadIds`) |
| Web ingestión | `apps/web/app/api/facturas/upload/route.ts`, `apps/web/app/api/facturas/pdf-layout.ts`, `apps/web/lib/emparejar-unidad.ts`, `apps/web/components/upload-facturas.tsx`, `apps/web/components/create-factura-form.tsx` |
| Web admin | `apps/web/app/condominio/[id]/finanzas/page.tsx`, `…/comprobantes/page.tsx`, `…/reportes/page.tsx`, `…/page.tsx`, `…/vigilancia/page.tsx`, `apps/web/components/vehiculos/cobros-parqueadero.tsx`, `…/reporte-aporte.tsx`, `apps/web/components/reservas/estado-cuenta-modal.tsx` |
| Web residente | `apps/web/app/mi/[id]/page.tsx`, `apps/web/app/mi/[id]/cuenta/page.tsx`, `apps/web/components/portal/portal-pay-button.tsx`, `apps/web/app/mi/[id]/pago/retorno/page.tsx` |
| Móvil | `apps/mobile/src/app/(app)/(tabs)/facturas.tsx`, `…/(tabs)/index.tsx`, `…/_layout.tsx`, `apps/mobile/src/components/condominio/admin-home.tsx` |
| Pruebas | `packages/backend/pruebas/*.test.ts` y `*.prueba.ts` (todas revisadas; relevantes: `cartera.test.ts`, `cartera.prueba.ts`, `seguridad.test.ts`, `referenciaPago.prueba.ts`, `cobroParqueadero.prueba.ts`, `avalProduccion.prueba.ts`, `periodos.prueba.ts`) |
| Historial | Commit `a0cf84b` (eliminó `migrate/`): scripts de migración de facturas y **1.870 PDFs** de facturas reales enero–junio 2026 nombrados por el `_id` de la factura en Convex |

### 2.2 Datos

Exportación de **solo lectura** (`bunx convex data <tabla> --format jsonl`) del deployment configurado en `packages/backend/.env.local` (`dev:agreeable-bee-782`). Según el README es el deployment "actual" y contiene los datos migrados y operativos de **Arboleda Campestre** y **Ciudad del Campo II** (CDC). Tablas: `facturas` (2.792), `pagos` (1), `soportesPago` (0), `unidades` (379), `condominios` (3), `usuarioUnidad` (377), `memberships`, `guardiaNovedadReportes` (124), `pqrs` (1), `soporteTickets` (5), `waMessages` (869).

Las exportaciones y los scripts de análisis quedaron **solo en el scratchpad de la sesión**: no se escribieron en el repositorio ni se enviaron a ningún servicio externo.

### 2.3 Limitaciones

- No se pudo confirmar si `agreeable-bee-782` es el único deployment productivo. Los datos son claramente reales: unidades, residentes, montos y fechas de carga coinciden con la operación.
- Los PDFs de **agosto y septiembre 2026** están en S3 y no se descargaron. Para esos meses la evidencia se infiere de las incoherencias internas de la BD; para enero–junio se reprodujo el parser sobre los PDFs del historial git.
- El software contable de los conjuntos y el portal público de Aval quedan **fuera** del sistema auditado. Lo que pase allá solo se observa a través de los PDFs que se suben.
- Los correos de la administración (el PQRS cita "el correo enviado el 16 de julio") no están disponibles.

---

## 3. Arquitectura actual de facturación

### 3.1 Modelo conceptual real

Vekino **no tiene un libro de obligaciones**. La unidad de información es la **factura**: una copia (snapshot) del estado de cuenta que emite el software contable externo (PuntoSoftware u otro) para una unidad y un mes. Cada factura trae **todo** lo que la unidad debe a esa fecha, arrastre incluido:

```
línea = { codigo, concepto, saldoAnterior, actual, total = saldoAnterior + actual }
totalAPagar = Σ total  (deuda acumulada, NO la cuota del mes)
```

El propio código lo documenta (`packages/backend/convex/lib/cartera.ts:156-160`): *"Cada factura ABSORBE lo que quedo debiendo la anterior… Sumar los saldos de las facturas viejas para saber cuanto debe una casa no es contar dos veces: es resucitar deuda que ya se pago."*

```
 Software contable ──PDF consolidado──▶ /api/facturas/upload (Next, parser regex)
                                              │  invoices[] (unidad por emparejamiento, período elegido a mano)
                                              ▼
                                   facturas.bulkUpsert (Convex)
                                              │  insert/skip/patch por (condominio, unidad, período)
                                              ▼
                                   conciliarCadenaUnidad  ◀── también: createManual, reconciliar, upsertFactura(insert)
                                              │  estado(f[i-1]) := f(saldoAnterior(f[i]), f[i-1].totalAPagar)
                                              ▼
   ┌──────────────────────── facturas (estado: pendiente|pagada|vencida|abonada|saldo_a_favor) ───────────────────────┐
   │                                                                                                                    │
   ▼ lectura residente                                            ▼ pago                                               ▼ lectura admin
 listMia → web/móvil, navBadges, feed,              crearPagoFactura / bot → Aval Trn → pagos           carteraPorUnidad, estadoCuentaUnidad,
 bot/agente (facturaVigenteDeUnidad)                consultarEstado → aplicarEstado → factura "pagada"   listPage, resumenPeriodo, serie
                                                    soportesPago.aprobar → factura "pagada"
                                                    portal público Aval (externo) → NADA en Vekino
```

### 3.2 Separación obligación → factura → pago → saldo

**No existe.** Los cuatro conceptos están mezclados en una sola fila:

| Concepto | Dónde vive hoy | Problema |
|---|---|---|
| Obligación (cargo de un concepto en un mes) | `facturas.lineas[].actual`, dentro de la factura del mes | Sin identidad propia. No se puede preguntar "¿el cargo X de agosto está pagado?" |
| Factura | `facturas` | Es a la vez documento, obligación y **saldo acumulado** |
| Pago | `pagos` (solo pasarela por API) y `soportesPago` (comprobantes) | No alimenta ningún saldo. Solo pone `estado = "pagada"` a una factura |
| Saldo | `facturas.totalAPagar` de la **última** factura | Se infiere; el estado de las anteriores se **re-deduce** en cada carga |

### 3.3 Tablas y relaciones

| Tabla | Clave lógica | Relaciones | Índices relevantes |
|---|---|---|---|
| `facturas` (`schema.ts:281-339`) | (condominioId, unidadId, periodo) **solo en código** | `unidadId → unidades`, `membershipId? → memberships` | `by_unidad`, `by_condominio_periodo`, `by_condominio`, `by_legacyId`, `by_estado`, `by_periodo`, `by_membership` |
| `pagos` (`schema.ts:352-404`) | `rqUID`, `pmtAuthId` | `facturaId → facturas` (1:N), `unidadId`, `membershipId?`, `userId?` | `by_factura`, `by_pmtAuthId`, `by_rqUID`, `by_estado`, `by_condominio` |
| `soportesPago` (`schema.ts:2465-2495`) | — | `facturaId? → facturas`, `unidadId?` | `by_factura`, `by_condominio_estado` |
| `guardiaNovedadReportes` (`schema.ts:1822-1944`) | — (un cobro por reporte) | `vehiculoId?`, `unidades[]` | `by_condominio`, `by_vehiculo` |
| `reservas` (`schema.ts:550-609`) | — | `unidadId`, `zonaId` | `by_unidad`, `by_condominio_fecha` |
| `guardiaReservaDepositos` (`schema.ts:1957-2017`) | `reservaId` (1:1, en código) | `reservaId` | `by_reserva` |
| `usuarioUnidad` (`schema.ts:240-276`) | (membershipId, unidadId) **solo en código** | — | `by_membership`, `by_unidad` |

### 3.4 Funciones por responsabilidad

| Responsabilidad | Funciones |
|---|---|
| Generar/importar cargos | `POST /api/facturas/upload` (`route.ts:243`), `facturas.bulkUpsert` (`facturas.ts:508`), `facturas.createManual` (`facturas.ts:645`), `facturas.upsertFactura` (interna, `facturas.ts:133`), `migrations.bulkFacturas` (interna, `migrations.ts:454`), `guardia.reportarNovedad` (cobro de parqueadero, `guardia.ts:2549`), `reservas.create` (alquiler/depósito pactado) |
| Determinar estado | `conciliarCadenaUnidad` (`facturas.ts:79`), `facturas.reconciliar` (`facturas.ts:599`), `pagos.aplicarEstado` (`pagos.ts:617`), `soportesPago.aprobar` (`soportesPago.ts:257`), `pagosPruebas.revertir*` |
| Registrar pagos | `pagos.crearPagoFactura`, `pagos.crearPagoFacturaBot`, `pagos.registrarPago`, `pagos.consultarEstado`, `pagos.consultarEstadoPorPmt`, `http /aval/retorno`, `soportesPago.crearMio`, `soportesPago.crearDesdeBot`, `reservas.registrarPagoAlquiler`, `reservas.registrarDeposito`, `guardia.registrarDepositoReserva` |
| Consultar saldos | `lib/cartera.carteraDeUnidad`, `facturas.carteraPorUnidad`, `facturas.estadoCuentaUnidad`, `facturas.resumenPeriodo`, `facturas.serie`, `aporte.consultarPlaca`, `aporte.reporte` |
| Construir lo que ve el residente | `facturas.listMia`, `portal.navBadges`, `notificacionesFeed.feed`, `soportesPago.facturaVigenteDeUnidad` (bot y agente), y el cálculo en cliente de `apps/web/app/mi/[id]/*.tsx` y `apps/mobile/…/facturas.tsx` |

### 3.5 Jobs y procesos automáticos

- **No hay cron de facturación.** `crons.ts` solo programa visitantes y sala de asamblea. Ningún proceso genera cargos ni cambia estados de facturas por calendario.
- **Scheduler de pagos:** `crearTrnYRegistrar` agenda `consultarEstado` a los 2 min y se re-agenda hasta `MAX_INTENTOS = 30` (60 min) (`pagos.ts:708-727`, `pagos.ts:1025-1036`).
- **Conciliación**: se dispara en cada `bulkUpsert`, en cada `createManual`, en el insert de `upsertFactura` y con el botón **"Conciliar"** de Finanzas (`finanzas/page.tsx:94-128`).

### 3.6 Estados

| Entidad | Estados | Quién los pone |
|---|---|---|
| `facturas.estado` | `pendiente`, `pagada`, `vencida`, `abonada`, `saldo_a_favor` | Carga (`pendiente`/`saldo_a_favor` si total < 0), conciliación (todas menos la última), `aplicarEstado` (`pagada`), `soportesPago.aprobar` (`pagada`), `pagosPruebas` (vuelta a `pendiente`/`vencida`), migración (lo que traiga) |
| `pagos.estado` | `iniciada`, `pendiente`, `aprobada`, `rechazada`, `fallida`, `expirada`, `no_autorizada`, `error` | `registrarPago`, `aplicarEstado` |
| `soportesPago.estado` | `pendiente_revision`, `aprobado`, `rechazado` | `crearMio`/`crearDesdeBot`, `aprobar`/`rechazar` |
| `guardiaNovedadReportes.cobroEstado` | `pendiente`, `facturado`, `descartado` | `reportarNovedad`, `parqueadero.*` |
| `guardiaNovedadReportes.gestion` | `pendiente`, `cobrada`, `descartada` | `reportarNovedad`, `guardia.gestionarNovedad` |

Los estados son `v.union` de literales, así que Convex rechaza valores inválidos. **No** hay máquina de estados: cualquier transición está permitida, incluida `pagada → vencida`.

### 3.7 Idempotencia existente

| Operación | Mecanismo | Protege contra |
|---|---|---|
| Insertar factura (UI) | `query by_condominio_periodo + filter(unidadId).first()` antes de insertar (`facturas.ts:539-545`) | Re-subir el mismo período |
| Factura manual | Igual, y lanza error si existe (`facturas.ts:682-693`) | Doble alta manual |
| Migración | `by_legacyId.unique()` (`migrations.ts:504-507`) | Re-ejecutar la migración (pero **no** contra la factura subida por UI del mismo período) |
| Concurrencia | Mutaciones Convex serializables (OCC): la lectura del rango de índice entra en el conjunto de lectura | Dos cargas simultáneas del mismo período |
| Depósito de reserva | `by_reserva.first()` (`reservas.ts:552-556`, `guardia.ts:1780-1784`) | Doble depósito |
| Comprobante | Uno `pendiente_revision` por factura (`soportesPago.ts:80-88`) | Comprobantes repetidos sin revisar |
| Notificación de pago | Solo en la transición a `aprobada` (`pagos.ts:662-667`) | Doble WhatsApp |
| Pago por API | **Ninguno en Vekino.** Lo frena Aval con el código 27 mientras haya otra transacción pendiente con la misma referencia | — |

---

## 4. Flujo completo de generación de cargos

### 4.1 Cuota de administración e intereses (flujo principal: PDF del software contable)

Recorrido real del código:

1. **Finanzas → "Subir facturas"** (`apps/web/app/condominio/[id]/finanzas/page.tsx:134-140`). El período por defecto es `periodoActivo`, es decir el **último período ya cargado** (`finanzas/page.tsx:69`). El componente lo copia a su estado (`upload-facturas.tsx:56`).
2. **`POST /api/facturas/upload`** (`route.ts:243-321`), **sin autenticación**:
   - parte el PDF por páginas y las agrupa por factura (`isInvoiceStart`, `route.ts:78-82`);
   - detecta el formato (`arboleda` o `cdc`, `route.ts:52-54`);
   - extrae con regex: `numeroInterno`, `periodoLabel`, `totalAPagar` (`TOTAL A PAGAR $…` o `Pague sin descuento … $…`), `totalConDescuento` y líneas (`route.ts:114-239`);
   - **sube cada PDF a S3 antes de que el usuario confirme**, con llave determinista `condominios/facturas/{legacyId}/{periodo}/unidad-{n}.pdf` (`route.ts:23`, `route.ts:300-302`).
3. **Emparejamiento de unidad** en el cliente (`lib/emparejar-unidad.ts:130-197`): lecturas posibles del identificador y propagación de restricciones sobre el lote.
4. **`facturas.bulkUpsert`** en lotes de 20 (`upload-facturas.tsx:145-182`):
   - `numeroFactura = FAC-{periodo}-{índice del lote}` (`upload-facturas.tsx:153`);
   - `fechaEmision = Date.now()` (`:164`);
   - `fechaVencimiento = new Date(año, mes, 15)`, es decir **el 15 del mes siguiente** (`:140-143`);
   - `estado = "pendiente"` (o `saldo_a_favor` si total < 0) (`:166`).
5. **Backend** (`facturas.ts:508-592`): por cada factura busca (condominio, período, unidad):
   - si existe y `skipExisting` (por defecto `true`, "Solo insertar facturas nuevas") → **omite**;
   - si existe y no `skipExisting` → **patch** de números y PDF, **sin tocar `estado`**;
   - si no existe → **insert**.

   Al final concilia todas las unidades tocadas.
6. **Conciliación** (`facturas.ts:79-116`). Ordena la cadena de la unidad **por período** y, para cada par (anterior, siguiente):
   ```
   deuda = Σ siguiente.lineas[].saldoAnterior
   anterior.totalAPagar < 0 && deuda ≤ 1  → saldo_a_favor
   deuda ≤ 1                              → pagada
   deuda < anterior.totalAPagar − 1       → abonada
   en otro caso                           → vencida
   ```
   y **sobrescribe** `anterior.estado` sin mirar cómo llegó a ese estado.

### 4.2 Las 16 preguntas por flujo

| # | Pregunta | Cuota admin. (PDF) | Factura manual (`createManual`) | Cobro parqueadero (reporte guarda) | Reserva (alquiler/depósito) |
|---|---|---|---|---|---|
| 1 | Evento que origina | La administración sube el PDF del período | Admin/contadora/junta llena el formulario | Guarda reporta un vehículo en ronda (`guardia.ts:2549-2576`) | Residente o admin crea la reserva |
| 2 | Servicio que genera | Software contable externo; Vekino solo **importa** | `facturas.createManual` | `guardia.reportarNovedad` (crea el "cargo por pasar") | `reservas.create` → `valoresPactados` |
| 3 | Responsable | Unidad por **emparejamiento** del identificador del PDF; `membershipId` **no se asigna** en la carga por UI | Unidad elegida; `membershipId` = primer vínculo con nombre/propietario (`facturas.ts:695-712`) | Unidad dueña del vehículo + casas señaladas (`unidades[]`) | Unidad de la reserva |
| 4 | Valor | Lo calcula la contabilidad; Vekino lo extrae por regex | Monto digitado | Tarifa de carro/moto del conjunto (`parqueadero.ts:30-38`) o `cobroMonto` | Tarifa de la zona congelada |
| 5 | Persistencia | `facturas` + PDF en S3 | `facturas` | `guardiaNovedadReportes.cobro*` | `reservas.valorReserva`, `depositoRequerido`, `pagoAlquiler*`; `guardiaReservaDepositos` |
| 6 | Identificador | `_id`; lógico (condominio, unidad, período); `numeroFactura` sintético; `numeroInterno` del PDF **no validado** | Igual; `numeroFactura = FAC-{periodo}-{unidad}-{últimos 6 dígitos de Date.now()}` | `_id` del reporte (**uno por reporte**, no por vehículo y mes) | `_id` de la reserva |
| 7 | ¿Cómo se sabe que existe? | `by_condominio_periodo` + `filter(unidadId)` | Igual, y lanza error | No se verifica | Depósito: `by_reserva`; alquiler: no se verifica |
| 8 | ¿Cómo se sabe que se pagó? | `estado`: conciliación / Aval / comprobante | Igual | `cobroEstado = facturado` significa "pasado a factura", **no pagado**. Y existe un segundo campo, `gestion = cobrada` | `pagoAlquilerMonto` presente; depósito `estado` |
| 9 | Si ya pagó | Aval API → `pagada` al instante. Portal externo o banco → **nada** hasta la siguiente carga. Comprobante → `pagada` al aprobar | Igual | N/A (se cobra en la factura contable) | Se marca a mano |
| 10 | Nueva factura/período | Insert + **re-conciliación de toda la cadena**: todas menos la última se re-juzgan | Igual | Nada | Nada |
| 11 | ¿Cómo se evita que reaparezca? | **No hay mecanismo.** Depende de que la contabilidad no arrastre el concepto y de que la UI muestre solo la vigente (y la UI falla, ver F-01 y F-03) | Igual | Solo el `cobroEstado` (y hay dos campos que no se sincronizan, F-08) | — |
| 12 | Pago parcial | No se registra en Vekino. `abonada` se **infiere** del PDF siguiente | Igual | — | El alquiler acepta cualquier monto |
| 13 | Pago reversado | **No existe flujo.** El estado final del pago es inmutable (`pagos.ts:955-957`) | Igual | — | — |
| 14 | Concepto anulado | **No existe anulación ni borrado** de facturas. Corrección solo re-subiendo con `skipExisting=false` | Igual | `descartar` / `devolverAPendiente` sin historial | `cancelada` |
| 15 | Proceso ejecutado 2 veces | Idempotente en BD (omite o hace patch). **S3 se sobrescribe siempre**, incluso si se cancela | Lanza error | `marcarFacturado` dos veces sobrescribe `cobroPeriodo` sin aviso | Alquiler: la segunda llamada sobrescribe |
| 16 | Dos procesos simultáneos | Convex OCC: el insert concurrente en el mismo rango de índice provoca conflicto y reintento → **no duplica** | Igual | Dos guardas reportando el mismo carro → **dos cobros** (no es carrera, es falta de identidad) | Depósito protegido; alquiler, el último gana |

### 4.3 Factura manual

`createManual` (`facturas.ts:645-761`) crea una sola línea `Administración de {mes}` con `saldoAnterior = 0`. Si después se sube el PDF del mismo período con la opción por defecto ("Solo insertar facturas nuevas"), **la factura del PDF se omite** y queda la manual. Así se pierde el desglose real y cualquier arrastre.

### 4.4 Migración histórica

`migrations.bulkFacturas` (`migrations.ts:454-519`) es idempotente **solo por `legacyId`**:
- no busca por (unidad, período), así que si ya existe una factura subida por UI para ese período, **inserta un duplicado**;
- en el patch sobrescribe `estado` con lo que traiga el script (siempre `"pendiente"` en los scripts eliminados, ver `git show a0cf84b^:migrate/insert-facturas-cdc.mjs`);
- **no concilia**.

Hoy no hay duplicados porque cada período entró por una sola vía (enero–junio por migración, julio–septiembre por UI; ver E-1 y §14.1). Re-ejecutar cualquier script de migración pondría en riesgo los estados.

### 4.5 Cobros operativos (parqueadero, reservas, aporte)

- **Parqueadero:** cada reporte de guarda con vehículo nace con `cobroEstado: "pendiente"` **y** `gestion: "pendiente"` (`guardia.ts:2558`, `guardia.ts:2572`). Son dos máquinas de estado sobre el mismo cargo, movidas desde dos pantallas distintas: "Marcar cobrada a la casa X" en Vigilancia (`vigilancia/page.tsx:779-889` → `gestionarNovedad`) y "Facturado" en Cobros de parqueadero (`parqueadero.ts:124-149`). **No se sincronizan** (F-08).
- **Reservas:** el alquiler y el depósito se registran como marcas operativas. **No están vinculados a la factura.** Si la administración además pasa el alquiler a la cuenta de cobro contable, Vekino no tiene cómo saberlo.
- **Aporte voluntario:** no genera cargos. **Lee** la línea código 5 de las facturas (`lib/aporte.ts:68-72`).

---

## 5. Flujo completo de pagos

### 5.1 Canales

| Canal | Código | ¿Deja rastro en Vekino? | ¿Cambia la factura? |
|---|---|---|---|
| Pasarela Aval por API (web/móvil sin `avalPortalUrl`) | `crearPagoFactura` → `crearTrnYRegistrar` → `consultarEstado` → `aplicarEstado` | `pagos` | `pagada` si `aprobada` |
| Pasarela Aval por API desde **WhatsApp** (bot y agente) | `crearPagoFacturaBot` (`whatsapp.ts:1164-1189`, `whatsappAgente.ts:320-332`) | `pagos` | `pagada` si `aprobada` |
| **Portal público de Aval** (botón "Pagar" cuando hay `avalPortalUrl`: **ambos conjuntos lo tienen**; el móvil además tiene un *fallback* quemado por subdominio, `facturas.tsx:1499-1511`) | `window.open(avalPortalUrl)` (`portal-pay-button.tsx:83-86`, `cuenta/page.tsx:633-636`, `facturas.tsx:1149-1160`) | **Ninguno** | **No** |
| Banco / consignación / otros | — | Ninguno | No |
| Comprobante (app o WhatsApp) | `soportesPago.crearMio` / `crearDesdeBot` → `aprobar` | `soportesPago` | `pagada` si se aprueba **y** tiene `facturaId` |

Hoy la BD tiene **1 pago** (QA, `fallida`) y **0 comprobantes** (E-11): todo el recaudo real entra por canales que **no dejan rastro en Vekino**.

### 5.2 Respuestas a las preguntas de pagos

| Pregunta | Respuesta (con evidencia en código) |
|---|---|
| ¿Cómo se registra? | `registrarPago` inserta `iniciada` o `error` (`pagos.ts:571-614`); el estado lo pone `aplicarEstado` tras consultar `BasicData` (`pagos.ts:945-1023`). |
| ¿Cómo se vincula con lo facturado? | `pagos.facturaId`: **una** factura. La referencia que viaja al banco es **solo el número de casa** (`lib/referenciaPago.ts:59-67`, `pagos.ts:750-753`), sin período ni id de factura. |
| ¿Un pago puede cubrir varios conceptos? | Sí, implícitamente: la factura acumula conceptos y arrastre. Pero **Vekino no registra** que pagar la vigente salda las anteriores (F-01). |
| ¿Un concepto puede recibir varios pagos? | Sí. No hay límite. Aval rechaza (código 27) otra transacción de la misma casa **solo mientras haya una pendiente**. |
| ¿Cómo se calcula el saldo restante? | **No se calcula.** `aplicarEstado` pone `pagada` sin comparar `pago.monto` contra lo adeudado (`pagos.ts:653-660`). |
| ¿Cómo cambia el estado? | `aprobada` → factura `pagada`. Ningún otro estado del pago revierte la factura. |
| Pagos parciales | Por API, imposibles (monto fijo). Por portal, posibles, y solo se ven un mes después vía conciliación (`abonada`). |
| Pagos duplicados | Posibles sobre **distintas** facturas de la misma unidad (F-01): Aval solo bloquea las concurrentes. |
| Pagos anulados/reversados | **No soportado.** `consultarEstado` no vuelve a consultar un estado final (`pagos.ts:955-957`). `pagosPruebas` es solo para QA. |
| Pago registrado pero factura sin actualizar | (a) Si tras 30 consultas (60 min) Aval no da estado final, **nadie vuelve a preguntar** (`pagos.ts:1030`). (b) Si el pago se aprobó y luego llega el PDF siguiente, **la conciliación sobrescribe `pagada`** (F-02). |
| ¿Las consultas de facturación miran los pagos? | **No.** Ninguna query de facturas o cartera lee `pagos` ni `soportesPago`. Solo `pagos.listPorFactura` y `pagosPruebas`. |

### 5.3 "El residente pagó" vs. "el sistema lo considera pagado"

| Situación | ¿Pagó? | ¿Vekino lo considera pagado? | ¿Cuándo se corrige? |
|---|---|---|---|
| Pagó por el portal público o el banco | Sí | **No** (sigue `pendiente`; después del vencimiento la UI lo trata igual) | Cuando se sube el PDF siguiente, **si** la contabilidad aplicó el pago antes de su corte |
| Pagó por API y Aval aprobó | Sí | Sí, de inmediato | — hasta la siguiente carga, que **lo vuelve a juzgar** con el PDF |
| Pagó por API y la contabilidad aplicó el pago **después** de su corte | Sí | Primero sí; después de la siguiente carga **no** (`vencida`/`abonada`) | Nunca automáticamente. Mientras tanto la factura siguiente incluye el monto como saldo anterior |
| Pagó y envió comprobante; se aprobó con factura vinculada | Sí | Sí | Igual que el caso API |
| Pagó y envió comprobante **sin** factura vinculada | Sí | **No**: `aprobar` no marca nada (`soportesPago.ts:281-289`) | Siguiente PDF |
| Tenía **saldo a favor** (CDC) | — | Factura con total **0** y, si el PDF siguiente trae filas de meses anteriores, la anterior queda **`vencida`** (F-04) | Nunca: el error está en el parseo |
| Pagó la vigente; las anteriores estaban `vencida` | Sí (la vigente absorbe las anteriores) | La vigente sí; **las anteriores siguen `vencida` y se ofrecen para pagar** (F-01) | Hasta la siguiente carga (y vuelve a ocurrir cada vez que la vigente quede pagada) |

---

## 6. Flujo de generación/presentación de facturas

### 6.1 ¿La factura es una fotografía o genera obligaciones?

Es una **fotografía**. Vekino no calcula cuotas, intereses ni arrastres: todo viene del PDF. Re-subir **no crea** cargos nuevos: omite o hace patch. **Pero sí re-escribe estados**: re-subir o pulsar "Conciliar" re-juzga toda la cadena con los datos del PDF.

### 6.2 Qué ve el residente y de dónde sale

| Superficie | Fuente | Cálculo de deuda | Problemas |
|---|---|---|---|
| Web — Inicio (`apps/web/app/mi/[id]/page.tsx:139-201`, `:368-440`) | `facturas.listMia` | "Pagable" = la de mayor `fechaVencimiento` entre `pendiente/vencida/abonada` (`facturasPagables`) | Tarjeta **roja** "Total pendiente" si existe **cualquier** `vencida` histórica (`:141`, `:196`, `:403-404`, `:438`) → F-03 |
| Web — Mis facturas (`apps/web/app/mi/[id]/cuenta/page.tsx`) | `facturas.listMia` | Igual (`:78-90`, `:112-117`) | Badge **"Vencida"** por historial (`:113`, `:275-284`). Cuando la vigente está `pagada`, una `vencida` vieja pasa a ser "pagable" y aparece con **"Pagar"** (`:509-513`) → F-01. Etiqueta "Pague del 1 al 15" junto a "Vence: 15 de {mes siguiente}" (`:582`, `:501`) → F-06 |
| Móvil — Facturas (`facturas.tsx:430-489`) | `facturas.listMia` | **Suma** `totalAPagar` de **todas** las `pendiente` (`:448-449`) | "Pagar" habilitado en **cualquier** `pendiente/vencida/abonada` (`:1037-1041`), incluidas las absorbidas → F-01 |
| Móvil — Inicio (`(tabs)/index.tsx:233-234`) | `facturas.listMia` | Suma de todas las `pendiente` | Igual que arriba (frágil, F-18) |
| Badges de navegación (`portal.ts:246-307`) | `facturas` por unidad | Cuenta **todas** las `vencida` históricas (`:280-282`): 391 en 182 unidades | Hoy la barra lateral **no** pinta este contador (`apps/web/components/portal/portal-sidebar.tsx:111-113`). Riesgo latente si se vuelve a mostrar → F-03 |
| Campana de notificaciones (`notificacionesFeed.ts:61-83`) | `facturas` 45 días | "Por pagar · $total" si no está `pagada` | Muestra "Por pagar" en `vencida`/`abonada` ya absorbidas |
| WhatsApp — bot "Mi factura" / "Pagar en línea" (`whatsapp.ts:1117-1189`) | `soportesPago.facturaVigenteDeUnidad` | La primera `pendiente/vencida/abonada` entre las **12 más recientemente creadas** (`soportesPago.ts:144-158`) | Elige por **orden de inserción**, no por período; si la vigente está `pagada`, ofrece pagar una anterior → F-01 |
| WhatsApp — agente IA (`whatsappAgente.ts:301-332`) | Igual | Igual | Igual |

### 6.3 Qué ve la administración

`carteraPorUnidad` y `estadoCuentaUnidad` (`facturas.ts:904-1001`) usan `lib/cartera.ts`, que **sí** aplica el modelo correcto: deuda = la última factura y mora = el último período vencido (`lib/cartera.ts:192-254`). **La vista de administración y la del residente aplican reglas distintas** sobre los mismos datos.

---

## 7. Flujo entre períodos

| Pregunta | Respuesta |
|---|---|
| ¿Cómo se identifica un período? | Texto `"AAAA-MM"` **elegido por quien sube** (`upload-facturas.tsx:56`, `:236-242`). No se deriva del PDF ni se valida contra `periodoLabel` (que sí viene del PDF). |
| ¿Qué pasa al cerrar un período? | **No existe cierre.** Un período nunca se "congela": cualquier carga posterior o el botón "Conciliar" re-escribe sus estados. |
| ¿Qué pasa al iniciar uno nuevo? | Se sube el PDF del nuevo mes. Cada factura nueva "juzga" a la anterior de su unidad. |
| ¿Se arrastran conceptos anteriores? | Sí, **los arrastra la contabilidad** en la columna "saldo anterior" de cada línea. Vekino los copia. |
| Saldos pendientes | Viven en `totalAPagar` de la última factura. |
| Conceptos ya pagados | Desaparecen del PDF siguiente **si** la contabilidad registró el pago antes de su corte. Vekino no tiene registro propio. |
| ¿Un cargo puntual puede reaparecer en un período posterior? | **Sí**, como "saldo anterior", siempre que la contabilidad no haya aplicado el pago. Además, si el parser lee mal un crédito (F-04), Vekino **muestra** un saldo anterior que el total del PDF no contiene (E-8). |
| ¿Hay re-generación de facturas? | Re-subir con `skipExisting=false` hace patch de números y PDF. No crea cargos, pero **cambia** lo que el residente ve de un período ya emitido, sin historial de versiones. |
| ¿Re-generar puede crear cargos nuevos? | En la BD no (patch). En la **identidad**: subir el PDF de octubre con el período por defecto (septiembre) **sobrescribe** septiembre, o lo omite y **sobrescribe los PDFs de S3 de septiembre** (F-07). |
| Meses faltantes | La cadena se ordena por período **sin verificar continuidad**. Con un hueco (p. ej. julio de CDC), junio se juzga con el saldo anterior de agosto, que ya incluye los cargos de julio (F-09). Hay 240 transiciones así. |

---

## 8. Auditoría de base de datos

> Convex no tiene restricciones `UNIQUE`, claves foráneas con integridad referencial ni `CHECK`. Toda unicidad depende del código de las mutaciones y de la serialización OCC. `v.id("tabla")` valida el formato y la tabla del id, **no** su existencia.

| Tabla / campo | Observación | Riesgo |
|---|---|---|
| `facturas` — unicidad (condominio, unidad, período) | Solo en código (`bulkUpsert`, `createManual`, `upsertFactura`). `migrations.bulkFacturas` **no** la respeta | Duplicado si la migración convive con la carga por UI del mismo período |
| `facturas` — índice compuesto | No existe `by_condominio_unidad_periodo`. Se usa `by_condominio_periodo` + `.filter(unidadId)`, que lee todo el período | Rendimiento; los conflictos OCC abarcan todo el período |
| `facturas.numeroInterno` | Sin índice ni unicidad. **156 grupos** con el mismo `numeroInterno` en distintos períodos de la misma unidad (CDC) y 204 facturas sin él | No sirve como identidad del documento |
| `facturas.numeroFactura` | Sintético, depende del orden del lote (`FAC-{periodo}-{i}`). Hoy 0 repetidos, pero no es determinista ni único entre cargas | Un mismo documento puede cambiar de número |
| `facturas.periodo` | `v.string()` sin formato en `bulkUpsert` (sí lo valida `createManual`) | Períodos mal formados |
| `facturas.membershipId` | Opcional; la carga por UI **no lo llena** | El responsable se resuelve en lectura |
| `facturas.estado` | Unión de literales; transiciones libres | `pagada → vencida` permitido sin rastro |
| `facturas` — auditoría | Sin historial de estados ni de versiones del PDF | No se puede reconstruir "qué vio el residente" en una fecha |
| `facturas.pdfUrl` | URL pública S3 con llave determinista por (legacyId, período, unidad) | Sobrescritura silenciosa (F-07) |
| `pagos.facturaId` | Obligatorio, 1:N | Un pago no puede repartirse entre facturas |
| `pagos.pmtAuthId` | Opcional (no existe en pagos `error`). `by_pmtAuthId` sin unicidad; `getPagoPorPmt` usa `.first()` | Bajo |
| `pagos.ambiente` | Texto libre; por defecto `"qa"` si falta `AVAL_AMBIENTE` (`pagos.ts:86`) | Si producción corre sin esa variable, los pagos reales quedan como `qa` y `pagosPruebas.revertirTodos` los borraría (F-14) |
| `pagos.monto` | No se compara con la deuda | F-13 |
| `soportesPago.facturaId` / `unidadId` | Opcionales | Aprobación sin efecto (F-12) |
| `soportesPago.monto` | **No existe** | Se aprueba sin saber cuánto se pagó |
| `guardiaNovedadReportes` | Dos campos de estado de cobro (`cobroEstado`, `gestion`); sin identidad (vehículo, período) | F-08 |
| `usuarioUnidad` (membership, unidad) | Unicidad solo en código. Hoy 0 duplicados | `listMia` no deduplica (F-16) |
| `reservas.pagoAlquiler*` | Un único registro sobrescribible, sin historial | Bajo |

---

## 9. Auditoría de queries

> Convex no tiene SQL ni JOINs. Las "uniones" se hacen en código (`Promise.all` + `db.get`). Los riesgos equivalentes son: multiplicación por vínculos repetidos, agregaciones sobre totales acumulados y filtros de estado que mezclan historial con deuda.

| Query / cálculo | Ubicación | Hallazgo |
|---|---|---|
| `listMia` | `facturas.ts:764-830` | Recorre **todos** los vínculos de la membresía **sin filtrar vigencia** (a diferencia de `misUnidadIds`, `model/authz.ts:93-109`) y **sin deduplicar** (`sets.flat()`). Con dos vínculos a la misma unidad, cada factura sale dos veces. Hoy no hay vínculos repetidos |
| `navBadges.facturasVencidas` | `portal.ts:266-283` | Cuenta **todas** las `vencida` de la historia: 182 unidades suman 391. Hoy no se pinta en la web (`portal-sidebar.tsx:111-113`), pero el dato que expone es incorrecto |
| `facturaVigenteDeUnidad` | `soportesPago.ts:144-158` | `order("desc").take(12)` sobre `by_unidad` ordena por **`_creationTime`**, no por período. Elige la primera sin pagar aunque esté absorbida |
| Resumen del residente (web) | `cuenta/page.tsx:112-117`, `mi/[id]/page.tsx:139-146` | `conDeuda` mezcla estados **históricos** (`vencida`, `abonada` de meses ya absorbidos) con deuda. El total sale bien mientras la vigente esté sin pagar; el **estado** (rojo/"Vencida") no |
| Resumen del residente (móvil) | `facturas.tsx:448-449`, `index.tsx:233-234` | Suma `totalAPagar` (acumulado) de varias `pendiente`. Hoy hay una por unidad. Si la conciliación no corre (migración, `upsertFactura`), **duplica deuda** |
| `aporte.reporte` | `aporte.ts:149-171` + `lib/aporte.ts:68-72` | Suma `línea.total` (= saldo anterior + actual) **entre períodos**: cuenta el arrastre una vez por mes. En CDC, $81,7 M reportados contra $47,2 M de cargos reales; unidad 402: $9,41 M contra $525 mil (F-10) |
| `aporteDeFactura` | `lib/aporte.ts:22`, `:68-72` | Identifica el concepto por `codigo === 5` **en todos los conjuntos**. En Arboleda el código 5 es **"Parqueadero visitante"**, otro concepto (1.170 líneas, $8,7 M) |
| `resumenPeriodo.sumaPagado` / `serie` | `facturas.ts:341-453` | "Recaudo" = Σ `totalAPagar` de facturas `pagada`: incluye arrastre y excluye abonos. Es una aproximación, no dinero recibido (F-19) |
| `listPage` con filtros | `facturas.ts:302-326` | Escanea 250 por período. Con más de 250 unidades, la búsqueda y el filtro de estado omiten facturas |
| `carteraPorUnidad` / `estadoCuentaUnidad` | `facturas.ts:904-1001` | Correctas en modelo. Heredan los estados erróneos de F-04 y F-09 |
| Conciliación | `facturas.ts:84-91` | Ordena por período sin verificar continuidad (F-09). Usa `Σ lineas.saldoAnterior` en vez del saldo anterior total del documento (F-04) |
| Comparaciones por valor | Conciliación (`deuda` vs. `totalAPagar` con tolerancia 1) | Depende 100 % de la exactitud del parser |

No se encontraron uniones que multipliquen registros ni condiciones de fecha erróneas en las consultas de BD. Los problemas de fecha están en la **definición** de `fechaVencimiento` (F-06).

---

## 10. Auditoría de backend

| Función | Ubicación | Hallazgo |
|---|---|---|
| `conciliarCadenaUnidad` | `facturas.ts:79-116` | (1) Sobrescribe `pagada` puesta por Aval o comprobante (F-02). (2) No lee `pagos`. (3) Juzga a través de huecos (F-09). (4) Depende de `lineas.saldoAnterior` (F-04). (5) Sin registro de cambios |
| `bulkUpsert` | `facturas.ts:508-592` | Identidad (unidad, período) sin validar contra el documento (F-07). `skipExisting` **omite** también la corrección de datos. El patch no recalcula `saldo_a_favor` |
| `upsertFactura` (interna) | `facturas.ts:133-234` | En el update **sobrescribe `estado`** con lo que mande el script y **no concilia** (solo concilia en insert, `:230`) (F-11) |
| `createManual` | `facturas.ts:645-761` | Línea única con `saldoAnterior=0`; bloquea la carga posterior del PDF del mismo período (con `skipExisting=true`) |
| `reconciliar` | `facturas.ts:599-629` | Re-juzga **todas** las cadenas del conjunto: pisa en bloque cualquier pago registrado |
| `armarDatosTrn` | `pagos.ts:268-356` | Solo rechaza `estado === "pagada"` (`:311-313`). Permite pagar facturas absorbidas (F-01). Aplica descuento si `ahora ≤ fechaVencimiento` (= 15 del mes siguiente) (`:315-321`, F-06) |
| `crearTrnYRegistrar` | `pagos.ts:734-896` | Referencia = número de casa, sin período (`:750-753`). La descripción dice "Administracion {periodoLabel}", que en Arboleda sept-2026 sale mal parseado (F-15) |
| `aplicarEstado` | `pagos.ts:617-670` | `pagada` sin validar monto, moneda ni ambiente (`:653-660`). Sin manejo de reverso (F-13) |
| `consultarEstado` | `pagos.ts:945-1023` | Tras 30 intentos abandona. Un pago aprobado más tarde nunca se refleja (F-13) |
| `verificarPago` | `pagos.ts:1059-1068` | `action` pública: ejecuta la consulta y devuelve el **documento completo** del pago (incluye `trnRaw`, `basicDataRaw`) **sin validar acceso** (F-20) |
| `listPorFactura` | `pagos.ts:1158-1168` | Solo exige sesión: cualquier usuario autenticado lista los pagos de cualquier factura (F-20) |
| `soportesPago.aprobar` | `soportesPago.ts:257-297` | `pagada` sin monto; sin factura vinculada no hace nada. La conciliación lo pisa (F-12) |
| `soportesPago.crearMio` | `soportesPago.ts:51-104` | Permite comprobante sobre factura ya `pagada` o absorbida |
| `facturaVigenteDeUnidad` | `soportesPago.ts:144-158` | Ver §9. El bot vincula el comprobante a esa factura (`whatsapp.ts:1060-1067`) |
| `parqueadero.marcarFacturado` | `parqueadero.ts:124-149` | No verifica el estado previo: re-marcar cambia `cobroPeriodo` sin rastro (F-08) |
| `parqueadero.devolverAPendiente` | `parqueadero.ts:179-194` | Borra `cobroPeriodo`, `cobradoPor`, `cobradoEn` sin historial |
| `guardia.gestionarNovedad` | `guardia.ts:2292-2317` | Mueve `gestion`, no `cobroEstado` (F-08) |
| `migrations.bulkFacturas` | `migrations.ts:454-519` | F-11 |
| `pagosPruebas.revertir*` | `pagosPruebas.ts:107-172` | Distingue prueba de producción **solo** por `ambiente`, que por defecto es `"qa"` (F-14) |
| `faltantesParaProduccion` | `lib/avalProduccion.ts:45-68` | Si `ambiente !== "prod"` no verifica nada (`:46`): producción sin `AVAL_AMBIENTE` correría con TLS relajado y pagos etiquetados `qa` |
| `limpieza.limpiar` | `limpieza.ts:25-42`, `:106-140` | Borra `pagos` y `soportesPago` (la evidencia de pago) sin tocar las facturas `pagada` que respaldan (F-14) |
| `POST /api/facturas/upload` | `route.ts:243-321` | **Sin autenticación**; escribe en S3 en llaves deterministas (F-07) |
| `parseCdc` | `route.ts:180-239` | Regex de montos sin signo (`\$([\d.,]+)`, `NUM_RE`): total negativo → 0, filas de crédito ignoradas; suma filas de meses anteriores sin el crédito (F-04) |
| `parseArboleda` | `route.ts:114-178` | `TOTAL A PAGAR\s+\$([\d,]+)` sin signo; `Periodo:` mal capturado en sept-2026 (F-15) |

---

## 11. Auditoría de frontend

### 11.1 Problema real vs. problema de presentación

| Síntoma que reporta el residente | ¿Real (dinero/estado) o presentación? | Hallazgo |
|---|---|---|
| "Estoy al día y me aparece **Vencida**" | **Presentación**, con efecto real: induce reclamos y pagos | F-03 (62 unidades hoy) |
| "Pagué la cuota y me vuelve a salir para pagar la de antes" | **Real**: el backend acepta el pago de la factura absorbida | F-01 |
| "El mes pasado lo pagué y en esta factura me lo vuelven a cobrar como saldo anterior" | **Real** si la contabilidad no aplicó el pago (externo a Vekino, F-02/F-05). **Presentación** si el desglose de Vekino muestra un saldo que el total no contiene (F-04, CDC 607/401/410/503) | F-02, F-04, F-05 |
| "Pagué por el portal y la app me sigue diciendo pendiente" | **Real** en Vekino (no hay registro), correcto en la contabilidad | F-05 |
| "Pagué con descuento y me cobraron la diferencia" | **Real** (riesgo) | F-06 |
| "Me aparecen montos enormes mes a mes" | **Presentación**: cada factura muestra la deuda acumulada, no la cuota | §11.2 |

### 11.2 Cálculos en el cliente

- **Web:** `montoAPagarHoy` (`cuenta/page.tsx:30-41`) elige `totalConDescuento` si `ahora ≤ fechaVencimiento`, la misma regla de F-06. `facturasPagables` (`:78-90`) elige **una por unidad**: correcto mientras la vigente no esté pagada. `tieneVencidas` (`:113`) mira todo el historial.
- **Móvil:** suma `totalAPagar` de las `pendiente` (`facturas.tsx:448-449`). El detalle permite pagar cualquier factura no pagada (`:1037-1041`).
- **Listas:** cada fila muestra `totalAPagar` (deuda acumulada a esa fecha). Ver "Abril $400.800 – Vencida", "Mayo $837.800 – Abono parcial" invita a leerlo como cargos que se suman. No hay rótulo de "incluye saldo anterior".
- **No** hay en el frontend lógica que **duplique filas**: no se encontró `concat` de listas ni claves repetidas. La duplicación visual solo ocurriría con vínculos `usuarioUnidad` repetidos (F-16), que hoy no existen.

### 11.3 Ingestión (admin)

- El período por defecto al subir es el último cargado (`finanzas/page.tsx:69`, `:138`; `upload-facturas.tsx:56`).
- La vista previa no muestra el `periodoLabel` del PDF frente al período elegido, ni compara contra lo ya cargado.
- La subida a S3 ocurre al **seleccionar** el archivo, antes de "Insertar"; cancelar no la revierte.

---

## 12. Auditoría de tests

### 12.1 Qué existe

| Archivo | Cubre |
|---|---|
| `pruebas/cartera.prueba.ts` (node:test, 395 líneas) | `carteraDeUnidad`, `estadoCuentaDeCadena`, `saldoAnteriorDe` (funciones puras). Regla de "no sumar históricos", mora por último período vencido, caso de los 116 días |
| `pruebas/cartera.test.ts` (convex-test, 696 líneas) | `carteraPorUnidad`, `estadoCuentaUnidad` (vista de **administración**), aislamiento entre conjuntos, "la mora no bloquea reservas". Las facturas se **insertan directamente con el estado ya puesto** |
| `pruebas/seguridad.test.ts` | `listByPeriodo`, `listPeriodos` por rol; `bulkUpsert` con lote vacío sin sesión (`:337-341`) |
| `pruebas/referenciaPago.prueba.ts` | Formato de la referencia del banco |
| `pruebas/avalProduccion.prueba.ts` | `faltantesParaProduccion` |
| `pruebas/cobroParqueadero.prueba.ts` | `estadoDe`, `totales`, `periodoSiguiente` (funciones puras) |
| `pruebas/periodos.prueba.ts` | `periodosElegibles` |

### 12.2 Qué no existe

| Escenario | ¿Hay test? |
|---|---|
| `bulkUpsert` insert/skip/patch e idempotencia de re-subida | **No** |
| `conciliarCadenaUnidad` (reglas, huecos, saldo a favor, tolerancia) | **No** |
| `createManual`, `reconciliar`, `upsertFactura`, `migrations.bulkFacturas` | **No** |
| Parser de PDF (`route.ts`: `parseCdc`, `parseArboleda`, `isInvoiceStart`) y `emparejarLote` | **No** |
| `pagos.*` (`armarDatosTrn`, `aplicarEstado`, `consultarEstado`, reintentos) | **No** |
| `soportesPago.*` (aprobar/rechazar/vincular) | **No** |
| Vista del residente (`listMia`, cálculos de web y móvil, `navBadges`, bot) | **No** |
| Cobros duplicados / pagos previos / pagos parciales / reverso / anulación | **No** |
| Facturación recurrente (cadena de varios meses con pagos intermedios) | **No** (solo con estados pre-cargados) |
| Concurrencia | **No** |
| `parqueadero.marcarFacturado` / sincronía con `gestion` | **No** |
| `aporte.reporte` | **No** |

### 12.3 El escenario pedido

> *Se genera un cargo → el residente paga → se genera una nueva factura → el mismo concepto vuelve a aparecer.*

**Sí puede ocurrir sin que ningún test falle.** Ningún test ejecuta `bulkUpsert` ni la conciliación con un pago intermedio, ninguno pasa por `aplicarEstado` o `soportesPago.aprobar`, y ninguno mira la vista del residente. Las dos variantes del escenario (§17, escenarios R-1 y R-2) recorren código sin cobertura.

---

## 13. Casos potenciales de duplicidad

| Condición buscada | Veredicto | Dónde / por qué |
|---|---|---|
| Doble generación de un mismo cargo | **No** en BD (0 casos). **Sí** como riesgo de proceso en parqueadero | F-08: un cobro por reporte; dos estados paralelos |
| Doble inserción en BD | **No** en la carga por UI (OCC + búsqueda previa). **Posible** mezclando migración y UI | F-11 |
| Repetición de cargos entre períodos | **Sí**, como saldo anterior arrastrado por la contabilidad (correcto si no se pagó). Incorrecto si el pago no llegó a tiempo a la contabilidad o el parser invierte un crédito | F-02, F-04, F-05 |
| Reaparición de cargos ya pagados | **Sí** | F-01 (UI y backend), F-02 (conciliación), F-04 (parser), F-03 (estado visual) |
| Facturas que vuelven a incluir conceptos anteriores | Sí, por diseño del documento contable | §7 |
| Consultas que mezclan saldo pendiente con cargo original | **Sí** | Vista del residente: `conDeuda`/`tieneVencidas` (F-03); móvil suma acumulados; `aporte.reporte` (F-10) |
| Procesos automáticos no idempotentes | Ninguno de facturación. La conciliación es idempotente en resultado pero **no conservadora** (pisa pagos). S3 no es idempotente | F-02, F-07 |
| Reintentos que vuelven a generar cargos | No para facturas. Para pagos: cada clic crea una transacción; Aval bloquea solo mientras esté pendiente | F-13 |
| Carreras de concurrencia | **No** en mutaciones (OCC). Las acciones de pago no son transaccionales, mitigado por Aval | §3.7 |
| Falta de restricciones únicas | **Sí** (Convex no las tiene). La unicidad depende del código | §8 |
| Estados inconsistentes | **Sí**: 74/1.010 contradicen el PDF; dos campos de cobro en parqueadero | F-04, F-08 |
| Pago registrado que no actualiza el estado esperado | **Sí**: portal externo; comprobante sin factura; consulta agotada; conciliación posterior | F-05, F-12, F-13, F-02 |
| Pagos asociados al concepto equivocado | **Posible**: el bot vincula el comprobante por orden de creación; el pago por API puede ir a una factura absorbida | F-12, F-01 |
| Conceptos que dependen de fechas y no de ids estables | **Sí**: la identidad de la factura es el **período elegido a mano**; el estado depende de la factura "siguiente" por orden de período | F-07, F-09 |
| Consultas que miran solo "pendiente" sin el historial real | **Sí**: el estado de cada factura se re-deduce sin mirar `pagos` | F-02 |
| Cálculos que regeneran obligaciones equivalentes | No en Vekino (no calcula obligaciones) | — |

---

## 14. Evidencia encontrada

Todos los análisis son de solo lectura sobre la exportación descrita en §2.2. Los ids son los `_id` de Convex. Por privacidad no se incluyen nombres de residentes.

### 14.1 Inventario

| Conjunto | Período | Facturas | Origen | Estados |
|---|---|---|---|---|
| Arboleda | 2026-03 … 06 | 170 / 173 / **143** / 168 | Migración (`legacyId`), cargada 2026-07-19 | mezcla |
| Arboleda | 2026-07 / 08 / 09 | 172 c/u | UI: 2026-08-05 / 08-13 / **09-16** | 09: 172 `pendiente` |
| CDC | 2026-01 … 06 | 198–205 | Migración, 2026-07-19 | mezcla |
| CDC | **2026-07** | **0** | — | hueco |
| CDC | 2026-08 / 09 | 201 / 205 | UI: 2026-08-21 / 09-08 | 09: 205 `pendiente` |

- Duplicados (condominio, unidad, período): **0**. Duplicados de `numeroFactura`: **0**. Vínculos `usuarioUnidad` repetidos: **0**.
- `fechaVencimiento` siempre el **15 del mes siguiente** al período.
- `pagos`: 1 → `m978jsk6bwxgw8307x4xmhh52n8fx7b3`, `qa`, **`fallida`**, 2026-10-08, monto **$340.000**, referencia `409`, factura `js79j0rwmd5y6mfn0ewatse0558e16bm` (CDC 409, 2026-09, total $380.000, con descuento $340.000, `pendiente`).
- `soportesPago`: 0.

### 14.2 Residentes "al día" que ven "Vencida" (F-03)

182 de 379 unidades disparan el estado rojo/"Vencida" en la web. En 62 la penúltima factura está `pagada` y la vigente (sept) aún no vence (15-oct). Ejemplos:

| Unidad | `unidadId` | Vencidas históricas | Penúltima | Vigente | Lo que ve hoy en la web |
|---|---|---|---|---|---|
| Arboleda **T-I 1004** (autor del PQRS) | `jd7bz839v5mh3e7bm2hk8a6sh98av7kn` | 2026-04, 2026-06 | 2026-08 `pagada` | 2026-09 `pendiente` $289.000 | Badge **"Vencida"** en Mis facturas, tarjeta roja "Total pendiente $289.000" en Inicio, y abril y junio listadas como "Vencida" |
| Arboleda T-III 402 | `jd73rc1dzw2v285jyg586wxgpx8atp9z` | 2026-07 | 2026-08 `pagada` | 2026-09 `pendiente` | Igual |
| Arboleda T-III 601 | `jd7fv4r4ssfrr0fnn0zcswjyq58avq12` | 2026-04, 2026-07 | 2026-08 `pagada` | 2026-09 `pendiente` | Igual |
| Arboleda T-III 301 | `jd71prnnhee73vk577qjcrxags8avq4p` | 2026-04, 06, 07 | 2026-08 `pagada` | 2026-09 `pendiente` | Igual |

### 14.3 El PQRS real (unidad T-I 1004)

PQRS `m179ddw0y8fxcx71y8rrprhqy18c2fr8`, 2026-08-08, estado `abierto`: solicita actualizar el estado de cuenta porque está al día y remite a un correo del 16 de julio. Cadena de la unidad:

| Período | Factura | Total | Saldo ant. (líneas) | Estado en BD | Juzgada por |
|---|---|---|---|---|---|
| 2026-03 | `js73q79gc6k4gjdjwzry95t40h8avkn9` | 267.500 | 7.500 | pagada | abril (saldo ant. 0) |
| 2026-04 | `js70nsry3nnr2d54z96hqd7r618at3s9` | 385.000 | 0 | **vencida** | mayo (saldo ant. 385.000) |
| 2026-05 | `js7b5gmt5bz4btj76gs92aah5d8atacb` | 680.040 | 385.000 | pagada | junio (saldo ant. 0) |
| 2026-06 | `js71zect2nbcam2wazhvh3gmts8av6fv` | **15.760** | 0 | **vencida** | julio (saldo ant. 289.000) |
| 2026-07 | `js78t0pe50d25188eetw5pz6218bxyx0` | 584.156 | 289.000 | pagada | agosto (saldo ant. 0) |
| 2026-08 | `js77eg9zz7an3mdjnf3052yqkh8cc10e` | 289.000 | 0 | pagada | septiembre (saldo ant. 0) |
| 2026-09 | `js7de2jn9ytgwhf1fc3kepwg458egktz` | 289.000 | 0 | pendiente | — |

Lectura del PDF de junio (historial git), parseado con el extractor actual:

```
Periodo: 01-junio-2026      Vr. Admon 289.000
2  ADMINISTRACION DE junio       0      15,760     15,760
TOTAL A PAGAR                                    $15,760
```

**Interpretación.** El documento contable de junio cobraba solo $15.760 (la unidad venía con abono). El de julio arrastró $289.000 como saldo anterior. El de agosto ya llegó en cero: la contabilidad dio por pagado todo. El 8 de agosto (fecha del PQRS, con julio recién cargado el 5) el residente veía junio **Vencida** y julio por $584.156, que **incluía los $289.000 que reclamaba haber pagado**. Hoy, con todo saldado según la propia contabilidad, **sigue viendo "Vencida"** por abril y junio (F-03). El origen del arrastre de julio es contable (externo); que la marca persista es de Vekino.

### 14.4 Parser de CDC reproducido sobre 1.215 PDFs reales (F-04)

Se ejecutó **el mismo código** de `pdf-layout.ts` + `parseCdc` (`route.ts`) sobre los PDFs de CDC del commit `a0cf84b^`, y se comparó contra la fila **Totales** y la línea **"Pague sin descuento"** del mismo PDF:

| Medida | Resultado |
|---|---|
| PDFs con total **negativo** (saldo a favor) | 32 → el parser devuelve **0 en los 32** |
| "Saldo anterior" extraído ≠ fila Totales | **252** (20,7 %) |
| …deuda real positiva, parser **menor** (deuda oculta) | 50 |
| …deuda real positiva, parser **mayor** (deuda inflada) | 1 |
| …saldo anterior real **negativo** (crédito) | 201 (en 2, el parser lo lee como **deuda positiva**) |
| PDFs sin ninguna línea extraída | 33 |

Ejemplos con el texto del PDF:

```
js7cc4yt1c6a9x8dbehwfx7n8h8atgzx  (CDC 716, 2026-05)        BD: total=0, estado=vencida
  Totales        -760.000.00        360.000.00        -400.000.00
  Pague sin descuento 16 - 30                         $-400.000.00
  PARSER ACTUAL → totalAPagar: 0

js7btg382q5151s9xvgv2d03th8atwmp  (CDC 907, 2026-06)        BD: total=10.457.050, estado=abonada
  (solo lista filas de abril y mayo)  Totales  10.097.050.00 ... 10.457.050.00
  PARSER ACTUAL → saldo anterior por líneas = 406.000   (real: 10.097.050)
```

Contraste contra los estados guardados (misma regla de conciliación, con el saldo anterior **real** del PDF siguiente). Pares evaluables: 1.010; coinciden 936.

| Tipo | n | Ejemplo |
|---|---|---|
| BD **peor** que el PDF (el residente ve deuda o mora que no tiene) | 2 | CDC 701 `js7atjkvcdbeqerkkbw9am0dad8av76v` (2026-04): BD **vencida**; el PDF de mayo trae saldo anterior **−86.000** (a favor) y el parser leyó **+184.000**. CDC 701 `js70ghnhmt014cgmj0xscfe7258avn2c` (2026-03): BD abonada; PDF −264.400 |
| BD **mejor** que el PDF (deuda oculta) | 72 | CDC 907 `js7b84wbrrcrajc52zds5bd73d8atp75` (2026-03): BD **pagada**; el PDF de abril arrastra 9.377.050. CDC 904: deuda de $6,8 M → $9,5 M sin pagos y aun así marzo–mayo `pagada` |
| Totales negativos guardados como 0 | 32 | 30 quedaron `pagada` (deberían ser `saldo_a_favor`); **2 quedaron `vencida`**: CDC 716 mayo (−$400.000) y CDC 611 mayo `js7ccfs553vwb5j3nsw23j2wdd8av7kz` (**−$835.100**) |

### 14.5 Facturas vigentes (sept-2026) con saldo anterior "fantasma" (F-04)

Facturas cargadas con el parser actual cuyo desglose suma más saldo anterior del que contiene el total del propio PDF. La anterior quedó `vencida`/`abonada` por esa lectura:

| Unidad CDC | Factura sept | Total (PDF) | Saldo ant. (líneas) | Mes (líneas) | Anterior (ago) | Estado ago |
|---|---|---|---|---|---|---|
| 607 | `js7bagwc3de1pd0x2p0jmrwd198e0dbg` | 331.800 | **342.000** | 335.000 | `js72s65624jx68vzgxwcataw198cxagw` total **0** | **vencida** |
| 401 | `js7bmbk16by748atvfhdp3nsdh8e0gs4` | 73.000 | **335.000** | 335.000 | `js798nmpx0mt8j585renv5hewh8cwxys` total **0** | **vencida** |
| 410 | `js7e60ay93bxq3t44m212755x58e01t1` | 300.670 | **349.000** | 398.000 | `js75dzje49hda6w5j8fzpwc5bx8cx7mk` total **0** | **vencida** |
| 503 | `js751xdb0771vt4v251ysjzetd8e0fvk` | 365.000 | 335.000 | 335.000 | `js7fh92tqb3m5d7ka6zgngb12n8cxcz4` total 30.000 | **vencida** |

Patrón: el total de agosto se guardó en 0 (consistente con un total negativo no leído; **19** facturas CDC de agosto tienen total 0 y estado `vencida`). Septiembre lista la cuota de agosto como "saldo anterior", pero **no** el crédito que la compensa. El residente ve agosto **Vencida** y, en el desglose de septiembre, **"Saldo ant. $342.000"**, mientras el total a pagar ($331.800) ya lo descuenta. Es exactamente el reclamo de "me vuelven a cobrar lo que ya pagué". *Confirmarlo exige abrir esos 4 PDFs de S3, no descargados en esta auditoría.*

### 14.6 Huecos de período (F-09)

| Transición | Unidades | Estados resultantes de la anterior |
|---|---|---|
| CDC 2026-06 → 2026-08 (falta julio) | 194 | 136 pagada, 42 abonada, 16 vencida |
| Arboleda 2026-04 → 2026-06 (falta mayo) | 27 | 13 vencida, 10 abonada, 4 pagada |
| Otras | 19 | — |

Con un mes faltante, el saldo anterior del PDF siguiente incluye los cargos del mes ausente: una unidad que pagó junio y no julio queda con **junio `vencida`**.

### 14.7 Ventana de descuento (F-06)

- Todas las facturas: `fechaVencimiento` = 15 del mes siguiente.
- El PDF de CDC dice "Pague con descuento del 1 - 15 / sin descuento 16 - 30", sin mes. La UI web pone ambos textos juntos ("Pague del 1 al 15 (con descuento)" y "Vence: 15 de octubre").
- Septiembre de Arboleda se cargó el **16-sep**; el de CDC, el **8-sep**.
- Pago QA del **2026-10-08** sobre la factura de **2026-09**: Vekino calculó **$340.000** (con descuento) frente a $380.000 sin descuento. Si la regla real es "1–15 del mes del período", ese pago habría dejado **$40.000** que la contabilidad arrastraría como saldo anterior.

### 14.8 Cobros de parqueadero (F-08)

122 reportes con vehículo, todos `cobroEstado=pendiente` / `gestion=pendiente` (nadie los ha gestionado aún). **34 grupos** vehículo-mes con varios reportes, cada uno un cobro independiente: p. ej. `TTQ436`, sept-2026, 4 reportes (`n5766q6b…`, `n574dtq7…`, `n574sef4…`, `n57cfc0r…`); `HDW-741`, 4; `NJT831`, 4; `IIZ-955`, 4; `IWX-606`, 3.

### 14.9 Aporte voluntario (F-10)

| Conjunto | Facturas con la línea | Σ `total` (lo que suma el reporte) | Σ `actual` (cargos reales) |
|---|---|---|---|
| CDC (código 5 = "CONT. VOL. AREAS COMUNES") | 833 | **$81.693.906** | $47.204.200 |
| Arboleda (código 5 = **"Parqueadero visitante"**, otro concepto) | 1.170 | $8.721.722 | $3.284.500 |

Unidad CDC 402 (`jd78jwhk4eqy7e3v26f4s3xqkn8avmhr`): el reporte suma **$9.414.600**; los cargos del rango suman **$525.200**.

### 14.10 Otros

- Arboleda 2026-09: `periodoLabel` = `Arboleda Campestre Aptos"` en las 172 facturas (sale en notificaciones, bot y descripción del pago).
- Arboleda 2026-09: 5 facturas con total 0 y línea "Saldo a favor" > 0 quedaron `pendiente`, no `saldo_a_favor`.
- 156 grupos de `numeroInterno` repetido entre períodos de la misma unidad (CDC). El campo no identifica el documento.

---

## 15. Hallazgos clasificados por severidad

### CRÍTICO

#### F-01 — Las facturas absorbidas se tratan como deuda pagable y reaparecen al pagar la vigente

- **Severidad:** CRÍTICO
- **Archivo(s):** `packages/backend/convex/pagos.ts`; `apps/web/app/mi/[id]/cuenta/page.tsx`; `apps/web/app/mi/[id]/page.tsx`; `apps/mobile/src/app/(app)/(tabs)/facturas.tsx`; `packages/backend/convex/soportesPago.ts`; `packages/backend/convex/whatsapp.ts`; `packages/backend/convex/whatsappAgente.ts`
- **Línea(s):** `pagos.ts:311-313`; `cuenta/page.tsx:69-90`, `:112-117`, `:509-513`; `mi/[id]/page.tsx:56-90`, `:140-146`; `facturas.tsx:1037-1041`; `soportesPago.ts:144-158`; `whatsapp.ts:1117-1189`; `whatsappAgente.ts:320-332`
- **Flujo afectado:** pago de facturas (web, móvil, WhatsApp) y resumen de deuda del residente
- **Causa raíz:** el modelo dice que solo la **última** factura es deuda, porque absorbe a las anteriores (`lib/cartera.ts:156-191`). Las superficies del residente y el backend de pagos, en cambio, tratan como pagable **cualquier** factura `pendiente/vencida/abonada`. La web solo lo disimula eligiendo "la más reciente sin pagar", que deja de ser la vigente en cuanto esta queda `pagada`.
- **Condición para reproducirlo:** unidad con una factura vieja `vencida` o `abonada` cuya vigente se marca `pagada` (pago Aval aprobado o comprobante aprobado). En el móvil basta con abrir la factura vieja, incluso sin pagar la vigente.
- **Impacto:** se cobra dos veces el saldo arrastrado. Ejemplo con datos reales en R-1: $366.113.
- **Evidencia:** código citado. Hoy hay 182 unidades con facturas `vencida` históricas, **todas** expuestas en cuanto su vigente quede `pagada` por Vekino. No ha ocurrido aún porque no hay pagos aprobados (E-11).
- **Recomendación:** definir la "factura vigente" por unidad (la última de la cadena por período) como **única pagable**, en el backend (`armarDatosTrn`) y en todas las superficies. Marcar las anteriores como "absorbida/histórica", no como deuda.

#### F-02 — La conciliación sobrescribe el pago real e ignora la tabla `pagos`

- **Severidad:** CRÍTICO
- **Archivo(s):** `packages/backend/convex/facturas.ts`; `packages/backend/convex/pagos.ts`; `packages/backend/convex/soportesPago.ts`; `packages/backend/convex/lib/referenciaPago.ts`
- **Línea(s):** `facturas.ts:79-116` (patch en `:107-112`), `:581-588`, `:599-629`; `pagos.ts:653-660`; `soportesPago.ts:281-289`; `referenciaPago.ts:19-25`, `:59-67`
- **Flujo afectado:** cambio de período / carga del PDF siguiente; botón "Conciliar"
- **Causa raíz:** el estado de una factura es un **campo único** que escriben tres fuentes (Aval, comprobante, conciliación), y gana la última. La conciliación no distingue "pagada por evidencia" de "inferida". Vekino tampoco devuelve sus pagos a la contabilidad, y la referencia de pago no lleva período, así que la contabilidad no puede imputarlos al mes correcto.
- **Condición para reproducirlo:** (1) pago aprobado por Aval de la factura N; (2) la contabilidad corta el mes N+1 **antes** de aplicar ese pago; (3) se sube el PDF N+1, con saldo anterior > 0; (4) `conciliarCadenaUnidad` pone N en `vencida`/`abonada`.
- **Impacto:** la factura pagada (con `pagos.estado = aprobada`) vuelve a figurar sin pagar, y la factura N+1 incluye el monto otra vez. El residente ve el doble cobro y, con F-01, puede pagarlo de nuevo. El caso del PQRS (§14.3) muestra que el arrastre contable ya ocurre con pagos externos.
- **Evidencia:** código. Caso T-I 1004: junio $15.760 → julio arrastra $289.000 → agosto en cero.
- **Recomendación:** la conciliación no debe degradar una factura con evidencia de pago (pago aprobado o comprobante aprobado). Debe registrar una **discrepancia** para revisión y mostrar "pago en verificación". Hace falta además un circuito pago → contabilidad: archivo de recaudo con id de factura/período, o consulta del recaudo del banco.

### ALTO

#### F-03 — El estado "Vencida" del residente se calcula con el historial, no con la deuda vigente

- **Severidad:** ALTO
- **Archivo(s):** `apps/web/app/mi/[id]/cuenta/page.tsx`; `apps/web/app/mi/[id]/page.tsx`; `packages/backend/convex/portal.ts`; `packages/backend/convex/notificacionesFeed.ts`
- **Línea(s):** `cuenta/page.tsx:113`, `:275-284`; `mi/[id]/page.tsx:141`, `:196`, `:403-404`, `:438-456`; `portal.ts:280-282`; `notificacionesFeed.ts:75-78`
- **Flujo afectado:** presentación al residente (inicio, mis facturas, badges, campana)
- **Causa raíz:** `tieneVencidas = conDeuda.some(estado === "vencida")` cuenta facturas históricas ya absorbidas, saldadas en meses posteriores. `navBadges` hace la misma cuenta, aunque hoy la barra lateral no la pinta (`portal-sidebar.tsx:111-113`). La administración ve otra cosa: `lib/cartera.ts` decide la mora por el **último** período vencido.
- **Condición para reproducirlo:** cualquier unidad que alguna vez quedó `vencida`, aunque hoy esté al día.
- **Impacto:** el residente al día ve "Vencida" en Mis facturas y la tarjeta roja en Inicio, y su cuota vigente aparece rotulada como si estuviera en mora. Genera reclamos ("ya pagué") y pagos indebidos.
- **Evidencia:** 182/379 unidades afectadas; 62 al día; incluye al autor del PQRS (§14.2, §14.3).
- **Recomendación:** derivar el estado del residente de `carteraDeUnidad` (el mismo cálculo de la administración); badges = mora actual; historial en otra sección.

#### F-04 — El parser de CDC lee mal saldos a favor y créditos, y la conciliación usa esos datos

- **Severidad:** ALTO
- **Archivo(s):** `apps/web/app/api/facturas/upload/route.ts`; `packages/backend/convex/lib/cartera.ts`; `packages/backend/convex/facturas.ts`
- **Línea(s):** `route.ts:192-199` (regex sin signo), `:202` (`NUM_RE` sin signo), `:205-225` (solo filas con código de 3 dígitos), `:236` (`saldoAFavor: 0`); `cartera.ts:74-76`; `facturas.ts:99-105`
- **Flujo afectado:** ingestión → conciliación → estado y desglose que ve el residente
- **Causa raíz:** (a) los montos negativos no se reconocen: total → 0, sin `saldo_a_favor`; (b) las filas de crédito o abono sin código se ignoran, mientras las de meses anteriores se suman como deuda; (c) cuando el PDF no lista todas las filas, el saldo de las líneas queda muy por debajo del real. La conciliación usa `Σ lineas.saldoAnterior` en lugar de la fila **Totales** y no valida `Σ líneas ≈ total`.
- **Condición para reproducirlo:** cualquier PDF de CDC con saldo a favor, abono anticipado o mora larga (más filas de las que lista).
- **Impacto:** unidades con saldo a favor quedan `vencida` (CDC 716: −$400.000; CDC 611: −$835.100); el desglose muestra saldos anteriores inexistentes (CDC 607, 401, 410, 503 en sept-2026); y deudores de millones aparecen `pagada` (deuda oculta: CDC 904, 907).
- **Evidencia:** §14.4 y §14.5 (reproducción sobre 1.215 PDFs reales).
- **Recomendación:** parser con signo; saldo anterior desde Totales; validación de cuadre bloqueante en la vista previa; banderas de "lectura dudosa"; re-procesar los PDFs de CDC.

#### F-05 — Los pagos hechos fuera de Vekino no se reflejan hasta la siguiente carga

- **Severidad:** ALTO
- **Archivo(s):** `apps/web/components/portal/portal-pay-button.tsx`; `apps/web/app/mi/[id]/cuenta/page.tsx`; `apps/mobile/src/app/(app)/(tabs)/facturas.tsx`; `packages/backend/convex/soportesPago.ts`
- **Línea(s):** `portal-pay-button.tsx:83-86`; `cuenta/page.tsx:633-636`; `facturas.tsx:1149-1160`, `:1499-1511`; `soportesPago.ts:281-289`
- **Flujo afectado:** pago y presentación
- **Causa raíz:** con `avalPortalUrl` configurado (ambos conjuntos), "Pagar" abre el portal público del banco y Vekino no recibe nada. No hay importación del recaudo. Un comprobante aprobado sin `facturaId` no marca nada.
- **Condición para reproducirlo:** residente que paga por el portal, PSE o el banco.
- **Impacto:** la factura sigue con "Pendiente" y el botón "Pagar" hasta el PDF siguiente (≈ 1 mes), con riesgo de pago doble; la campana sigue diciendo "Por pagar".
- **Evidencia:** 0 pagos aprobados y 0 comprobantes en toda la base (E-11): todo el recaudo es externo.
- **Recomendación:** importar el archivo de recaudo del convenio, conciliar por referencia + fecha + monto y marcar "pago reportado/en verificación". Mostrar "Si ya pagaste, puede tardar hasta la próxima factura en reflejarse".

#### F-06 — El descuento se ofrece y se cobra hasta el 15 del mes siguiente

- **Severidad:** ALTO (pendiente de confirmar la regla con cada administración)
- **Archivo(s):** `apps/web/components/upload-facturas.tsx`; `packages/backend/convex/pagos.ts`; `apps/web/app/mi/[id]/cuenta/page.tsx`; `packages/backend/convex/whatsapp.ts`; `packages/backend/convex/whatsappAgente.ts`
- **Línea(s):** `upload-facturas.tsx:140-143`; `pagos.ts:315-321`; `cuenta/page.tsx:30-41`, `:582`; `whatsapp.ts:1130-1132`; `whatsappAgente.ts:307-308`
- **Flujo afectado:** monto a pagar
- **Causa raíz:** `fechaVencimiento` es un único campo que sirve a la vez de vencimiento, de fin del descuento y de inicio de mora, y se fija por convención (día 15 del mes siguiente) en vez de leerse del PDF.
- **Condición para reproducirlo:** pagar por API entre el 16 del mes del período y el 15 del mes siguiente.
- **Impacto:** se cobra menos de lo debido; la contabilidad arrastra la diferencia (más intereses) y la factura siguiente la "vuelve a cobrar", mientras la pagada queda `abonada`.
- **Evidencia:** pago QA del 2026-10-08 sobre la factura 2026-09: $340.000 en vez de $380.000 (§14.7).
- **Recomendación:** fecha límite de descuento explícita (`fechaLimiteDescuento`), leída del PDF o configurada por conjunto, separada del vencimiento.

#### F-07 — La identidad de la factura depende de un período elegido a mano; los PDFs se sobrescriben; el endpoint no tiene autenticación

- **Severidad:** ALTO
- **Archivo(s):** `apps/web/components/upload-facturas.tsx`; `apps/web/app/condominio/[id]/finanzas/page.tsx`; `apps/web/app/api/facturas/upload/route.ts`; `packages/backend/convex/facturas.ts`
- **Línea(s):** `upload-facturas.tsx:56-57`, `:153`; `finanzas/page.tsx:69`, `:138`; `route.ts:23`, `:243-321`, `:300-302`; `facturas.ts:539-570`
- **Flujo afectado:** ingestión
- **Causa raíz:** (a) el período no sale del documento y se ofrece por defecto el **último cargado**; (b) no se compara con `periodoLabel` ni con `numeroInterno`; (c) S3 se escribe al **seleccionar** el archivo, con una llave que solo depende de (período, unidad); (d) el endpoint acepta cualquier petición.
- **Condición para reproducirlo:** subir el PDF de octubre sin cambiar el selector (queda "2026-09").
- **Impacto:** con la opción por defecto se omiten las facturas pero **los PDFs de septiembre quedan reemplazados por los de octubre**: el residente descarga un documento que no corresponde a los montos. Sin la opción, septiembre recibe los montos de octubre y octubre no se crea. Con el endpoint abierto, un tercero puede reemplazar facturas publicadas.
- **Evidencia:** código. En la BD no se observan duplicados (E-1); la sobrescritura de S3 no se puede verificar desde la BD.
- **Recomendación:** período derivado del PDF y confirmado; bloqueo si no coincide; S3 solo después de confirmar, con llave versionada; autenticación y autorización en la ruta; lote de importación con id y reversión.

#### F-08 — Cobros de parqueadero: dos estados paralelos y un cobro por reporte

- **Severidad:** ALTO
- **Archivo(s):** `packages/backend/convex/guardia.ts`; `packages/backend/convex/parqueadero.ts`; `packages/backend/convex/lib/cobroParqueadero.ts`; `apps/web/app/condominio/[id]/vigilancia/page.tsx`
- **Línea(s):** `guardia.ts:2292-2317`, `:2558`, `:2572`; `parqueadero.ts:124-149`, `:179-194`; `cobroParqueadero.ts:36-42`, `:64-81`; `vigilancia/page.tsx:779-889`
- **Flujo afectado:** cargo por parqueo sin aporte
- **Causa raíz:** (a) dos campos (`gestion`, `cobroEstado`) para el mismo hecho, movidos desde dos pantallas; (b) identidad del cargo = reporte, no (vehículo/unidad, período); (c) `marcarFacturado` no valida el estado previo; (d) `devolverAPendiente` sin historial.
- **Condición para reproducirlo:** marcar "cobrada" en Vigilancia: en "Cobros de parqueadero" sigue `pendiente` y se pasa otra vez a la factura. O varios reportes del mismo carro en el mes, todos marcados `facturado`.
- **Impacto:** cargo de aporte o multa cobrado 2 a 4 veces en la cuenta contable.
- **Evidencia:** 34 grupos vehículo-mes con 2–4 reportes (§14.8).
- **Recomendación:** un solo estado de cobro; cargo con identidad (unidad, vehículo, período) que agrupe los reportes; validaciones de transición; historial.

### MEDIO

#### F-09 — La conciliación juzga a través de meses faltantes

- **Severidad:** MEDIO
- **Archivo(s):** `packages/backend/convex/facturas.ts`
- **Línea(s):** `facturas.ts:84-105`
- **Flujo afectado:** estado de facturas
- **Causa raíz:** la cadena se ordena por período sin verificar que los meses sean consecutivos.
- **Condición para reproducirlo:** cualquier unidad con un mes no cargado (julio en CDC, mayo para 30 unidades de Arboleda).
- **Impacto:** estados incorrectos (junio `vencida` porque julio no se pagó).
- **Evidencia:** 240 transiciones (§14.6).
- **Recomendación:** no juzgar a través de huecos; dejar el estado "sin veredicto" y mostrar el hueco a la administración.

#### F-10 — El reporte de aporte voluntario suma arrastres y confunde conceptos

- **Severidad:** MEDIO
- **Archivo(s):** `packages/backend/convex/aporte.ts`; `packages/backend/convex/lib/aporte.ts`
- **Línea(s):** `aporte.ts:164-171`; `lib/aporte.ts:22`, `:68-72`
- **Flujo afectado:** reporte administrativo; color del guarda
- **Causa raíz:** suma `línea.total` (que incluye el saldo anterior) entre meses, e identifica el concepto por `codigo === 5`, que en Arboleda es "Parqueadero visitante".
- **Condición para reproducirlo:** consultar el reporte con un rango de varios meses.
- **Impacto:** valores inflados (CDC: $81,7 M frente a $47,2 M); si se usa para cobrar, provoca cobros indebidos.
- **Evidencia:** §14.9.
- **Recomendación:** usar `actual` para "cargos del período" y el `total` de la última factura para la deuda; mapear el concepto por conjunto.

#### F-11 — Las rutas de migración e importación interna pueden duplicar facturas o resetear estados

- **Severidad:** MEDIO
- **Archivo(s):** `packages/backend/convex/migrations.ts`; `packages/backend/convex/facturas.ts`
- **Línea(s):** `migrations.ts:499-516`; `facturas.ts:181-201`, `:230`
- **Flujo afectado:** migración e importación por scripts
- **Causa raíz:** `bulkFacturas` deduplica solo por `legacyId` y su patch sobrescribe `estado`; `upsertFactura` en el update también sobrescribe `estado`. Ninguna concilia.
- **Condición para reproducirlo:** volver a correr un script de importación sobre un período ya cargado por UI o ya pagado.
- **Impacto:** facturas duplicadas por (unidad, período); facturas pagadas devueltas a `pendiente`; el móvil sumaría varias `pendiente`.
- **Evidencia:** código; scripts en `git show a0cf84b^:migrate/*` mandan `estado: "pendiente"`.
- **Recomendación:** misma identidad y misma conciliación que `bulkUpsert`; nunca sobrescribir `estado`.

#### F-12 — Los comprobantes de pago no tienen monto, se vinculan por orden de creación y la conciliación los pisa

- **Severidad:** MEDIO
- **Archivo(s):** `packages/backend/convex/soportesPago.ts`; `packages/backend/convex/whatsapp.ts`
- **Línea(s):** `soportesPago.ts:51-104`, `:144-158`, `:257-297`; `whatsapp.ts:1060-1067`
- **Flujo afectado:** pago manual
- **Causa raíz:** el comprobante no registra monto ni fecha de pago; la factura se elige por `_creationTime`; la aprobación pone `pagada` sin validar montos.
- **Condición para reproducirlo:** comprobante enviado por WhatsApp cuando la factura creada más recientemente no es la vigente (p. ej. al cargar tarde julio de CDC); o aprobar un comprobante parcial.
- **Impacto:** se paga una factura y queda marcada otra; pagos parciales registrados como totales y luego revertidos por la conciliación.
- **Evidencia:** código (0 comprobantes en datos).
- **Recomendación:** registrar monto y fecha; vincular siempre a la vigente por período; tratar la aprobación como evidencia de pago (F-02).

#### F-13 — Los pagos por API no validan monto, no tienen reverso y pueden quedar sin resolver

- **Severidad:** MEDIO
- **Archivo(s):** `packages/backend/convex/pagos.ts`
- **Línea(s):** `pagos.ts:617-670`, `:727`, `:955-957`, `:1025-1036`
- **Flujo afectado:** pago por pasarela
- **Causa raíz:** `aplicarEstado` no compara monto; los estados finales son inmutables; la consulta se abandona a los 60 min.
- **Condición para reproducirlo:** Aval confirma después del minuto 60; un pago se reversa (contracargo); un monto difiere del adeudado.
- **Impacto:** pagos reales sin reflejo; facturas `pagada` con pago insuficiente; sin rastro de reversos.
- **Evidencia:** código.
- **Recomendación:** re-consulta diaria de pagos no finales; comparar monto pagado vs. adeudado; estado `reversada`; registro de eventos del pago.

#### F-14 — Las herramientas operativas pueden borrar o revertir pagos reales

- **Severidad:** MEDIO
- **Archivo(s):** `packages/backend/convex/pagos.ts`; `packages/backend/convex/lib/avalProduccion.ts`; `packages/backend/convex/pagosPruebas.ts`; `packages/backend/convex/limpieza.ts`
- **Línea(s):** `pagos.ts:86`, `:90-92`; `avalProduccion.ts:46`; `pagosPruebas.ts:144-172`; `limpieza.ts:38-39`
- **Flujo afectado:** operación y soporte
- **Causa raíz:** `ambiente` vale `"qa"` por defecto, y los chequeos de producción solo corren si `ambiente === "prod"`. `limpieza` incluye `pagos` y `soportesPago` entre sus tablas.
- **Condición para reproducirlo:** producción configurada sin `AVAL_AMBIENTE=prod` y luego `revertirTodos`; o correr `limpiar` después de entrar en operación.
- **Impacto:** facturas pagadas devueltas a `pendiente`/`vencida`; evidencia de pago borrada.
- **Evidencia:** código.
- **Recomendación:** ambiente obligatorio y explícito; distinguir prueba de producción por endpoint/convenio; excluir `pagos` y `soportesPago` de `limpieza` una vez en operación.

#### F-15 — Saldos a favor en Arboleda quedan como "pendiente" y el período sale mal parseado

- **Severidad:** MEDIO
- **Archivo(s):** `apps/web/app/api/facturas/upload/route.ts`; `packages/backend/convex/facturas.ts`
- **Línea(s):** `route.ts:117`, `:123`; `facturas.ts:574`
- **Flujo afectado:** ingestión de Arboleda
- **Causa raíz:** regex sin signo; captura de `Periodo:` frágil; `saldo_a_favor` solo si total < 0 (un 0 no cuenta).
- **Condición para reproducirlo:** cualquier PDF de Arboleda con saldo a favor o con otro formato del encabezado.
- **Impacto:** "1 factura por pagar · $0"; textos "Factura de Arboleda Campestre Aptos"" en notificaciones, bot y descripción del pago.
- **Evidencia:** §14.10.
- **Recomendación:** igual que F-04.

### BAJO

#### F-16 — `listMia` no deduplica ni filtra por vigencia

- **Severidad:** BAJO
- **Archivo(s):** `packages/backend/convex/facturas.ts`
- **Línea(s):** `facturas.ts:779-799`
- **Flujo afectado:** listado del residente
- **Causa raíz:** no reutiliza `misUnidadIds`.
- **Condición para reproducirlo:** vínculo repetido a la misma unidad, o vínculo de arrendatario vencido.
- **Impacto:** facturas duplicadas en pantalla; un exinquilino ve facturas.
- **Evidencia:** hoy 0 vínculos repetidos.
- **Recomendación:** usar `misUnidadIds` y deduplicar por `_id`.

#### F-17 — `numeroFactura` no es determinista y `numeroInterno` no se valida

- **Severidad:** BAJO
- **Archivo(s):** `apps/web/components/upload-facturas.tsx`; `packages/backend/convex/facturas.ts`
- **Línea(s):** `upload-facturas.tsx:153`; `facturas.ts:717-720`
- **Flujo afectado:** identificación de facturas
- **Causa raíz:** el número depende del orden del lote.
- **Condición para reproducirlo:** re-subir el mismo período con la opción de actualizar.
- **Impacto:** el mismo documento cambia de número; soporte confuso.
- **Evidencia:** 156 grupos de `numeroInterno` repetido.
- **Recomendación:** usar el número del documento como identidad secundaria y validarlo.

#### F-18 — El móvil suma `totalAPagar` de varias pendientes

- **Severidad:** BAJO
- **Archivo(s):** `apps/mobile/src/app/(app)/(tabs)/facturas.tsx`; `apps/mobile/src/app/(app)/(tabs)/index.tsx`
- **Línea(s):** `facturas.tsx:448-449`; `index.tsx:233-234`
- **Flujo afectado:** resumen móvil
- **Causa raíz:** suma montos acumulados.
- **Condición para reproducirlo:** dos `pendiente` en la misma unidad (F-11).
- **Impacto:** deuda duplicada en pantalla.
- **Evidencia:** hoy 0 unidades con más de una `pendiente`.
- **Recomendación:** usar la vigente por unidad.

#### F-19 — "Recaudo" en las métricas de administración es una aproximación

- **Severidad:** BAJO
- **Archivo(s):** `packages/backend/convex/facturas.ts`; `apps/web/app/condominio/[id]/reportes/page.tsx`
- **Línea(s):** `facturas.ts:361-364`, `:439-441`; `reportes/page.tsx:174`
- **Flujo afectado:** reportes
- **Causa raíz:** suma `totalAPagar` de las facturas `pagada`.
- **Condición para reproducirlo:** siempre.
- **Impacto:** incluye arrastre y omite abonos.
- **Evidencia:** código.
- **Recomendación:** calcular el recaudo desde los pagos o la diferencia de saldos.

#### F-20 — Fuga de datos de pagos

- **Severidad:** BAJO (seguridad, colateral)
- **Archivo(s):** `packages/backend/convex/pagos.ts`
- **Línea(s):** `pagos.ts:1059-1068`, `:1158-1168`
- **Flujo afectado:** consulta de pagos
- **Causa raíz:** `verificarPago` y `listPorFactura` no validan pertenencia.
- **Condición para reproducirlo:** cualquier sesión con un id de pago o de factura.
- **Impacto:** exposición de montos y respuestas crudas del banco.
- **Evidencia:** código.
- **Recomendación:** validar pertenencia a la unidad, como `estadoPago`.

#### F-21 — Sin unicidad declarativa ni historial de cambios

- **Severidad:** BAJO (estructural)
- **Archivo(s):** `packages/backend/convex/schema.ts`
- **Línea(s):** `schema.ts:281-339`
- **Flujo afectado:** integridad general
- **Causa raíz:** Convex no ofrece `UNIQUE`; no hay un índice (condominio, unidad, período); no hay bitácora de estados.
- **Condición para reproducirlo:** cualquier nueva ruta de escritura que olvide la verificación.
- **Impacto:** duplicados; imposible auditar qué vio el residente en una fecha.
- **Evidencia:** §8.
- **Recomendación:** índice compuesto y una única función de escritura; tabla de eventos de facturación.

---

## 16. Causa raíz de cada problema

Las 21 observaciones se reducen a **cinco causas raíz**:

| Causa raíz | Descripción | Hallazgos |
|---|---|---|
| **RC-1. Sin libro de pagos ni de obligaciones** | El pago no es una entidad que reduzca un saldo: solo pinta un estado. La obligación no tiene identidad propia, vive dentro del snapshot mensual | F-01, F-02, F-05, F-12, F-13, F-19 |
| **RC-2. El estado se infiere del documento siguiente y se re-escribe sin memoria** | `estado` es un campo único con varios escritores; la inferencia gana; no hay historial ni veredicto "sin datos" | F-02, F-09, F-11, F-14 |
| **RC-3. Dos modelos de deuda en el mismo producto** | La administración usa "deuda = última factura" (`lib/cartera.ts`); el residente, el bot y el backend de pagos usan "deuda = toda factura no pagada" | F-01, F-03, F-18 |
| **RC-4. Ingestión frágil y sin identidad de documento** | Regex sin signo, totales no validados, período elegido a mano, llaves de S3 sobrescribibles, endpoint abierto | F-04, F-06, F-07, F-15, F-17 |
| **RC-5. Cobros operativos sin identidad ni estado único** | Parqueadero y aporte usan el reporte o la línea como identidad, con estados duplicados | F-08, F-10 |

**Capa responsable:**

| Hallazgo | Frontend | Backend | Base de datos / modelo | Externo (contabilidad/banco) |
|---|---|---|---|---|
| F-01 | ✔ | ✔ | ✔ (sin noción de vigente) | |
| F-02 | | ✔ | ✔ | ✔ (corte contable) |
| F-03 | ✔ | ✔ (`navBadges`, hoy no visible) | | |
| F-04 | ✔ (parser en Next) | ✔ (conciliación) | | |
| F-05 | ✔ | | ✔ | ✔ |
| F-06 | ✔ | ✔ | ✔ | |
| F-07 | ✔ | ✔ | ✔ | |
| F-08 | ✔ | ✔ | ✔ | |

---

## 17. Escenarios de reproducción

Todos usan código y datos reales. **No se ejecutaron contra la base**: se reconstruyen leyendo el código.

### R-1 — Pagar la vigente resucita la factura anterior (F-01) · unidad Arboleda T-II 1004

Estado real hoy (`jd72k7gqv784jp1pe4v8v8t0ph8at1xy`):
- 2026-08 `js7ay93ckr85a0cbh8pcns1cyx8cckxq`: total $366.113, **`vencida`**.
- 2026-09 `js72xejs9cbg9zc97021wxy6qs8eh7px`: total **$656.804** = $366.113 (saldo anterior) + $290.691, `pendiente`.

1. El residente paga septiembre ($656.804) por la pasarela (web sin `avalPortalUrl`, o bot "Pagar en línea", que siempre usa la API).
2. `consultarEstado` → `aplicarEstado(aprobada)` → septiembre `pagada` (`pagos.ts:653-660`).
3. Web `cuenta/page.tsx:112-117`: `conDeuda = [agosto]` → `pagables = [agosto]` → "Estado actual: **Vencida · $366.113 · 1 factura por pagar**" con botón **Pagar**.
4. Móvil: agosto conserva **Pagar** (`facturas.tsx:1037-1041`). Bot y agente: `facturaVigenteDeUnidad` devuelve agosto (`soportesPago.ts:153`).
5. `crearPagoFactura(agosto)` → `armarDatosTrn` solo rechaza `pagada` → transacción por **$366.113**.
6. Resultado: **$366.113 pagados dos veces**. La factura de octubre (contable) mostraría saldo a favor, pero Vekino no lo sabría hasta cargarla.

### R-2 — La conciliación deshace un pago aprobado (F-02)

1. Factura N (`pendiente`) pagada por API el día 10 → `pagos.estado = aprobada`, factura `pagada`.
2. La contabilidad emite N+1 con corte del día 5, o aplica el recaudo del banco días después: saldo anterior = total de N.
3. La administración sube N+1 → `bulkUpsert` → `conciliarCadenaUnidad`: `deuda ≥ total(N)` → N pasa a **`vencida`** (`facturas.ts:105-108`).
4. El residente ve N "Vencida" y N+1 con el monto de N incluido. La tabla `pagos` sigue diciendo `aprobada`, pero ninguna vista la consulta.
5. Con F-01, el residente puede pagar N otra vez. Variante real con pago externo: T-I 1004, junio → julio (§14.3).

### R-3 — Residente al día ve "Vencida" (F-03) · unidad Arboleda T-III 402

1. Julio `vencida` (la contabilidad lo arrastró), agosto `pagada`, septiembre `pendiente` (vence el 15-oct).
2. `mi/[id]/page.tsx:141`: `vencidas.length > 0` → `DeudaAlert` en rojo con ícono de alerta (`:403-404`, `:438-456`).
3. `cuenta/page.tsx:113`: badge "Vencida" en el resumen; julio listado como "Vencida".
4. Lo correcto según `carteraDeUnidad`: "pendiente", sin mora.

### R-4 — Saldo a favor convertido en deuda (F-04) · unidad CDC 401

1. PDF de agosto con total a pagar negativo → `parseCdc` no reconoce `$-…` → `totalAPagar = 0`, `pendiente` (`js798nmpx0mt8j585renv5hewh8cwxys`).
2. PDF de septiembre: filas de agosto (sin asterisco) con $335.000 antes del mes → `saldoAnterior += 335.000`. La fila del crédito no tiene código de 3 dígitos → ignorada. "Pague sin descuento $73.000" → total 73.000 (`js7bmbk16by748atvfhdp3nsdh8e0gs4`).
3. Conciliación: `deuda = 335.000 > 1`, `total(ago) = 0` → agosto **`vencida`**.
4. El residente ve agosto "Vencida" y en el desglose de septiembre "Saldo ant. $335.000 · Mes $335.000", con total $73.000.
5. Reproducido sobre PDFs reales de enero–junio: CDC 716 y 611 (mayo, total negativo → `vencida`), CDC 701 (abril, crédito −86.000 leído +184.000 → `vencida`).

### R-5 — PDF de octubre subido como septiembre (F-07)

1. En noviembre la administración abre Finanzas. El selector muestra el último período (`2026-10`). Sube el PDF de noviembre sin cambiarlo.
2. `/api/facturas/upload` sube cada PDF a `…/2026-10/unidad-{n}.pdf`, **sobrescribiendo** los de octubre, antes de cualquier confirmación.
3. "Solo insertar facturas nuevas" (por defecto) → 0 nuevas, N omitidas. Las facturas de octubre muestran los montos de octubre y el PDF de noviembre.
4. Si desmarca la opción → octubre recibe los montos de noviembre; noviembre no existe. La siguiente conciliación re-juzga septiembre con el saldo anterior de noviembre.

### R-6 — Parqueadero cobrado varias veces (F-08) · placa TTQ436, sept-2026

1. Cuatro rondas reportan el carro (`n5766q6b…`, `n574dtq7…`, `n574sef4…`, `n57cfc0r…`) → 4 cargos `pendiente`.
2. En Vigilancia, la administración pulsa "Marcar cobrada a la casa X" en el primero (`gestion = cobrada`).
3. En Vehículos → Cobros de parqueadero los 4 siguen `pendiente` (`estadoDe` solo mira `cobroEstado`).
4. Marca los 4 como `facturado` en 2026-10 → 4 × tarifa mensual en la cuenta de cobro de octubre.

### R-7 — Descuento fuera de plazo (F-06)

1. La factura 2026-09 de CDC 409 (`js79j0rwmd5y6mfn0ewatse0558e16bm`) tiene total $380.000 y con descuento $340.000; vence en BD el 2026-10-15.
2. El 2026-10-08 se inicia el pago → `armarDatosTrn`: `Date.now() ≤ fechaVencimiento` → **$340.000** (ocurrió: pago `m978jsk6…`, QA, fallido).
3. Si la regla es "1–15 de septiembre", la contabilidad registra un abono de $340.000; octubre trae $40.000 + intereses de saldo anterior; septiembre queda `abonada`.

---

## 18. Riesgos actuales

| Riesgo | Hoy | Disparador | Probabilidad | Impacto |
|---|---|---|---|---|
| Residentes al día viendo "Vencida" (F-03) | **Activo**: 62 unidades | — | Cierta | Reclamos, pérdida de confianza, pagos indebidos |
| Desglose con saldo anterior fantasma y estados erróneos en CDC (F-04) | **Activo** (sept-2026: ≥ 4 casos; ene–jun: 74 estados contradictorios) | Cada carga de CDC | Alta | Reclamos y pagos duplicados; deuda oculta en informes |
| Pagos externos invisibles (F-05) | **Activo** (100 % del recaudo) | — | Cierta | "Pagué y sigue pendiente" |
| Doble pago de facturas absorbidas (F-01) | Latente | Primer pago aprobado por API (bot hoy, web al quitar `avalPortalUrl`) o primer comprobante aprobado | **Muy alta** tras el go-live | Dinero cobrado dos veces |
| Pago aprobado deshecho por la conciliación (F-02) | Latente | Pago por API + corte contable previo | Alta | Doble cobro en la factura siguiente |
| Descuento fuera de plazo (F-06) | Latente | Pagos por API del 16 al 15 siguiente | Alta (si la regla es la del PDF) | Residuos arrastrados como "cobro nuevo" |
| PDFs sobrescritos / período equivocado (F-07) | Latente | Error de operador; endpoint abierto | Media | Documentos que no coinciden con montos |
| Cobros de parqueadero duplicados (F-08) | Latente (nadie ha facturado aún) | Primera gestión de cobros | Alta | Cargos repetidos en la cuenta de cobro |

**El hito que multiplica el riesgo es la salida a producción de la pasarela por API.** El bot de WhatsApp ya usa ese camino. Antes de habilitarlo deben estar resueltos F-01, F-02 y F-06.

---

## 19. Recomendaciones

1. **Un solo modelo de deuda en todo el producto.** La deuda de una unidad es la factura **vigente** (la última de la cadena por período). Las anteriores son **historial**. Aplicarlo en `armarDatosTrn`, `listMia` (devolver `esVigente`), web, móvil, bot, agente, campana y `navBadges`. Reutilizar `lib/cartera.ts`.
2. **El pago como evidencia, no como pintura.** Las facturas con pago aprobado o comprobante aprobado no pueden pasar a `vencida`/`abonada` por inferencia: se marcan "en discrepancia" para que la administración revise.
3. **Separar estado histórico de estado de pago.** Por ejemplo: `veredictoContable` (lo que dijo el PDF siguiente) y `estadoPago` (lo que registró Vekino), más una bitácora de eventos.
4. **Parser robusto y validado.** Montos con signo; saldo anterior desde la fila Totales; validación de cuadre (`Σ líneas ≈ total`, `saldo anterior + mes − descuento ≈ total`); banderas de lectura dudosa que **bloqueen** la inserción o exijan revisión; suite de PDFs de referencia de ambos formatos.
5. **Identidad del documento.** Período tomado del PDF y confirmado; validar `numeroInterno`/`periodoLabel`; subir a S3 solo tras confirmar, con llave versionada; autenticar `/api/facturas/upload`; lote de importación con id y reversión.
6. **Ventana de descuento explícita.** Leerla del PDF o configurarla por conjunto; nunca usar `fechaVencimiento` como sustituto.
7. **Recaudo externo.** Importar el archivo de recaudo del convenio (referencia = casa, fecha, monto) para marcar "pago reportado" sin esperar al PDF siguiente. Comunicar en la UI que el reflejo puede tardar.
8. **Cobros operativos.** Un solo estado de cobro de parqueadero; cargo agrupado por (unidad, vehículo, período); validaciones de transición; reporte de aporte basado en `actual`.
9. **Operación segura.** `AVAL_AMBIENTE` obligatorio; `limpieza` sin `pagos`/`soportesPago` tras el go-live; re-consulta diaria de pagos no finales; validar monto en `aplicarEstado`.
10. **Pruebas de regresión** antes de cualquier cambio (§20, fase 0).

---

## 20. Plan de corrección propuesto

> Propuesta técnica. **No se implementó nada.** El orden prioriza contener el daño visible, luego cerrar la puerta del doble pago antes del go-live de la API, y finalmente sanear el modelo.

### Fase 0 — Red de seguridad (pruebas primero)

Escribir pruebas que **fallen hoy** y documenten cada hallazgo (convex-test + node:test):

- Cadena "cargo → pago aprobado → nueva factura": la factura pagada no debe volver a `vencida` y la vista del residente no debe pedir pagar de nuevo (R-1, R-2).
- `armarDatosTrn` rechaza facturas no vigentes (R-1).
- El resumen del residente coincide con `carteraDeUnidad` (R-3).
- `parseCdc`/`parseArboleda` con fixtures: total negativo, crédito, varias filas de meses anteriores, sin líneas (R-4). Usar PDFs del historial git, anonimizados.
- Conciliación con hueco de período (F-09).
- `bulkUpsert` con período que no coincide con `periodoLabel` (R-5).
- Parqueadero: `gestion` y `cobroEstado` coherentes; varios reportes, un solo cargo (R-6).
- Monto con descuento después de la fecha límite (R-7).
- Idempotencia: re-subir el mismo lote dos veces; `bulkFacturas` contra factura de UI.

### Fase 1 — Contención inmediata (sin tocar la lógica de cobro)

1. Resumen del residente (web inicio y cuenta, móvil, `navBadges`, campana) calculado con la regla de `carteraDeUnidad`: deja de pintar "Vencida" por historial (F-03).
2. Ocultar "Pagar" en facturas no vigentes en todas las superficies, y rechazarlas en `armarDatosTrn` (F-01). Es la única medida de esta fase que toca el backend de pagos, y debe estar **antes** de activar la API.
3. Autenticación y autorización en `/api/facturas/upload` (F-07).
4. Revisión manual con la administración de las 62 unidades de §14.2 y de los casos CDC de §14.5 (incluye responder el PQRS `m179ddw0…`).
5. Verificar `AVAL_AMBIENTE` en el deployment productivo (F-14).

### Fase 2 — Ingestión confiable

1. Parser con signo, saldo anterior desde Totales y validaciones de cuadre bloqueantes (F-04, F-15).
2. Período derivado del PDF, comparación con lo cargado y vista previa de diferencias; S3 tras confirmar, con llave versionada (F-07).
3. Lote de importación (`importaciones`: id, archivo, hash, período, usuario, resultado) para trazabilidad y reversión.
4. Re-procesar los PDFs de CDC (los de S3 y los del historial) y recalcular estados con la regla corregida, primero en modo informe (dry-run) para revisar antes de escribir.

### Fase 3 — Modelo de pagos y estados

1. Separar `estadoPago` (evidencia en Vekino) de `veredictoContable` (inferido del PDF siguiente); bitácora `facturaEventos` (F-02, F-21).
2. La conciliación no degrada facturas con evidencia de pago: genera discrepancias (F-02).
3. Fecha límite de descuento explícita por factura o conjunto (F-06).
4. Monto pagado vs. adeudado; estado `reversada`; re-consulta diaria de pagos no finales (F-13).
5. Comprobantes con monto y fecha, vinculados a la vigente por período (F-12).
6. Importación del archivo de recaudo del convenio y exportación de los pagos de Vekino para la contabilidad (F-05, F-02).
7. Identidad única (condominio, unidad, período) en una sola función de escritura usada por UI, manual, scripts y migración; índice compuesto (F-11, F-21).

### Fase 4 — Cobros operativos y reportes

1. Unificar `gestion`/`cobroEstado`; cargo por (unidad, vehículo, período) que agrupe reportes; transiciones validadas con historial (F-08).
2. Reporte de aporte con `actual` y concepto mapeado por conjunto (F-10).
3. Recaudo de métricas desde pagos/saldos (F-19); `listMia` con `misUnidadIds` y deduplicación (F-16); control de acceso en `verificarPago`/`listPorFactura` (F-20).

### Criterio de salida

- Las pruebas de la fase 0 pasan.
- En una corrida de solo lectura sobre los datos reales: 0 unidades "Vencida" al día; 0 facturas absorbidas pagables; 0 estados que contradigan el saldo anterior real del PDF siguiente; 0 totales negativos guardados como 0.

---

## 21. Respuesta final

### ¿Existe actualmente un riesgo real de doble facturación/cobro?

**Sí.**

**Por qué.** Vekino no genera cargos y no duplica registros (0 duplicados en 2.792 facturas; la carga es idempotente por unidad y período, y las mutaciones de Convex son serializables). Pero tiene tres mecanismos que hacen que un concepto **ya pagado se presente otra vez como deuda**, y uno que **permite pagarlo de nuevo**.

| | |
|---|---|
| **Flujos que lo provocan** | (1) Pago de facturas: web "Mis facturas", móvil, bot y agente de WhatsApp, más `pagos.armarDatosTrn` (F-01). (2) Carga de un nuevo período, que dispara `conciliarCadenaUnidad` (F-02, F-04, F-09). (3) Presentación del residente: `tieneVencidas` en Inicio y Mis facturas (F-03). |
| **Condiciones que lo activan** | (1) La factura vigente queda `pagada` por Vekino mientras hay anteriores `vencida`/`abonada`; en el móvil, basta con abrir una anterior. (2) Llega un PDF cuyo saldo anterior no refleja el pago (corte contable, pago externo, descuento fuera de plazo) o que el parser lee mal (saldos a favor y créditos en CDC). (3) Cualquier unidad con un mes histórico vencido. |
| **Código responsable** | `pagos.ts:311-313`; `apps/web/app/mi/[id]/cuenta/page.tsx:78-117`; `apps/web/app/mi/[id]/page.tsx:139-146`, `:403-404`; `facturas.tsx:1037-1041`; `soportesPago.ts:144-158`; `facturas.ts:79-116`; `apps/web/app/api/facturas/upload/route.ts:192-225`; `upload-facturas.tsx:140-143` con `pagos.ts:315-321`. |
| **Facilidad de reproducción** | F-03 y F-04: **ya están ocurriendo** (62 unidades al día marcadas "Vencida"; casos CDC en la factura vigente). F-01: **determinista**, ocurre con el primer pago aprobado por API o comprobante aprobado. F-02: requiere un pago por API antes de un corte contable, algo frecuente en la práctica. |
| **Impacto** | Reclamos de residentes ("ya pagué"), pagos dobles del saldo arrastrado (cientos de miles de pesos por unidad; $366.113 en R-1), residuos por descuento mal aplicado, y en sentido contrario deuda oculta en informes de administración (CDC 904/907). |
| **Capa** | **Combinación.** Frontend (cálculo de deuda y estado del residente), backend (pagos aceptan facturas absorbidas; la conciliación pisa pagos; el parser vive en el backend de Next), modelo de datos (sin libro de pagos, sin vigencia, sin historial de estados) y un factor externo (corte contable y recaudo fuera de Vekino). |

**Diagnóstico de los reportes actuales.** Con los datos disponibles, lo que hoy reportan los residentes se explica principalmente por:

- **F-03** — Vekino marca "Vencida" a quien está al día. Caso confirmado: el PQRS de T-I 1004.
- **F-04** — En CDC se muestran como saldo anterior cuotas que el PDF ya compensó, y se marcan vencidas facturas con saldo a favor.
- **F-05** — Los pagos por el portal no se ven hasta la siguiente factura.
- **El arrastre contable externo** — Pagos aplicados después del corte, que Vekino replica sin forma de detectarlo.

El doble **pago** efectivo (F-01, F-02) todavía no ha ocurrido porque no hay pagos por API aprobados, pero está listo para ocurrir en cuanto se active la pasarela.

---

## Anexo A — Método y comandos ejecutados

Todas las operaciones fueron de **lectura**. No se ejecutó `convex dev`/`deploy`, ni ninguna mutación, ni ningún script del repositorio que escriba.

| Paso | Comando / acción | Efecto |
|---|---|---|
| Lectura de código | Lectura de los archivos de §2.1 | — |
| Historial | `git show a0cf84b^:migrate/<script>`; `git archive a0cf84b^ migrate/.tmp-descuento` → scratchpad | Extrae scripts y 1.870 PDFs a un directorio temporal de la sesión |
| Datos | `bunx convex data <tabla> --limit 8000 --format jsonl` sobre `facturas`, `pagos`, `soportesPago`, `unidades`, `condominios`, `usuarioUnidad`, `memberships`, `guardiaNovedadReportes`, `pqrs`, `soporteTickets`, `waMessages` | Exportación de solo lectura al scratchpad |
| Análisis | Scripts Node en el scratchpad: duplicados, cadenas, coherencia de conciliación, huecos, descuadres, parqueadero y aporte | — |
| Reproducción del parser | Copia literal de `extraerTextoConLayout` (`pdf-layout.ts`) y `parseCdc` (`route.ts`) usando el `unpdf` instalado en el repo, aplicada a los 1.870 PDFs; comparación contra la fila **Totales** y **"Pague sin descuento"** de cada PDF | — |
| Cruce de estados | Regla de `conciliarCadenaUnidad` aplicada con el saldo anterior real del PDF siguiente vs. el estado guardado | — |

Los datos exportados, los PDFs y los scripts quedaron fuera del repositorio, en el directorio temporal de la sesión, y no se enviaron a ningún servicio externo.
