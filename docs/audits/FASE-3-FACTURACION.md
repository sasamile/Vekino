# Fase 3 — Modelo de pagos y estados de facturación

> **Fecha:** 2026-10-08 · **Base:** `0a51658` (ingestión confiable de la Fase 2) · **Estado:** cambios en el *working tree*, **sin commit**.
> Referencias: [`AUDITORIA_FACTURACION.md`](AUDITORIA_FACTURACION.md) (hallazgos F-xx y secciones §), [`FASE-0-FACTURACION.md`](FASE-0-FACTURACION.md) (pruebas #1–#91), [`FASE-1-FACTURACION.md`](FASE-1-FACTURACION.md) (factura vigente, regla de cartera) y [`FASE-2-FACTURACION.md`](FASE-2-FACTURACION.md) (lectura dudosa, importaciones, re-procesamiento).

---

## 1. Resumen ejecutivo

### Qué se corrigió

1. **La evidencia de pago manda sobre la inferencia** (F-02, F-12). El estado de una factura ya no es un campo que escriben cinco rutas y gana la última. Se guardan aparte:
   - la **evidencia** (`estadoPago`): lo que suman los pagos aprobados de la pasarela y los comprobantes aprobados;
   - la **inferencia** (`veredictoContable`): lo que dice la factura siguiente con su saldo anterior.

   `estado` lo calcula **una sola función** (`estadoDeFactura`) a partir de la carga, la evidencia y el veredicto. La evidencia es un piso que la inferencia no baja. Un "pagada" inferido sin evidencia sí se corrige con un PDF corregido.
2. **Discrepancias en vez de pagos borrados** (F-02). Si la factura siguiente arrastra lo que Vekino vio pagado, se registra una **discrepancia** (tabla `discrepanciasPago`). La vigente queda **"pago en verificación"**: no se cobra en línea ni se declara en mora por ese monto. Se resuelve sola con un documento que refleje el pago, o la resuelve la administración con una nota.
3. **El monto pagado cuenta** (F-13). 250.000 de 300.000 es un abono. Varios pagos se suman. Si se pagó dentro del plazo, la deuda se compara con el total con descuento. Lo pagado de más queda como excedente.
   - Los pagos tienen un estado nuevo, `reversada`, con su ruta.
   - Una **re-consulta diaria** rescata los pagos que la pasarela no confirmó en la primera hora.
4. **Comprobantes con monto, solo para la vigente** (F-12). La app y el bot piden cuánto y cuándo. La administración confirma el monto al aprobar. Aprobar un comprobante es evidencia por ese monto.
5. **No se juzga a través de un mes faltante** (F-09). Con un hueco, la factura queda sin veredicto, salvo que el saldo anterior siguiente esté en $0. La cartera no inventa "en mora" ni "al día" con eso. Finanzas ve los meses faltantes.
6. **El descuento tiene su fecha** (F-06):
   - el parser lee "HASTA EL DIA 15 DEL PRESENTE MES" y la confirmación lo guarda en `fechaLimiteDescuento`;
   - sin ese campo, rige el día 15 del mes del período;
   - la pasarela, la web, el móvil, el bot, el agente y la campana cobran y anuncian con esa fecha.

   El **vencimiento nuevo** (fin del mes del período), que decidió el responsable, se aplica **solo a lo que se cargue desde ahora**.
7. **Una sola escritura de facturas** (F-11). `model/facturas.ts` (`escribirFactura`) inserta y actualiza por identidad, con el índice nuevo `by_condominio_unidad_periodo`. Pasan por ahí la carga por PDF, la alta manual, el script, la migración y el re-procesamiento. Ninguna ruta escribe `estado`.
   - Cada cambio queda en la **bitácora** `facturaEventos`.
   - La migración ya no duplica lo que subió la web ni pisa pagos.
8. **Operación segura** (F-14, F-21):
   - `AVAL_AMBIENTE` es obligatorio;
   - `pagosPruebas` solo toca pagos marcados como de prueba y se niega en producción;
   - `limpieza` no toca pagos, comprobantes, bitácora, discrepancias ni importaciones.
9. **Endurecimientos de la Fase 2:**
   - confirmar una lectura sin total exige escribir el total del PDF;
   - la llave de idempotencia de una importación incluye el modo de carga;
   - dos documentos de la misma unidad en un PDF no se guardan;
   - el re-procesamiento no aplica un PDF publicado que es otro documento (CDC 802).

### Qué NO se corrigió (a propósito)

- F-08, F-10, F-16 y F-20 son de la Fase 4. Sus 8 pruebas siguen rojas con el mismo mensaje.
- De F-05 (recaudo externo) solo hay diseño (§12).
- No se re-fechó ninguna factura existente (§8).
- No se aplicó el re-procesamiento de la Fase 2.
- **No se modificó ningún dato** en Convex ni en S3, y no hubo ninguna llamada a Aval.

### Resultado

| | Resultado |
|---|---|
| Pruebas de la Fase 3 | **11 de 11** pasaron de ❌ a ✅ (#2, #3, #4, #5, #10, #11, #12, #17, #21, #23, #33) |
| Controles de la Fase 0, pruebas de las Fases 1 y 2 | **33 de 33**, **18 de 18** y **21 de 21** siguen ✅. Una prueba de la Fase 2 se ajustó, comentada y justificada (§13.3) |
| Pruebas de la Fase 4 | **8 de 8** siguen ❌ con la misma aserción y los mismos valores. En #54 y #55 cambia solo la vista previa que imprime vitest de cada factura, porque ahora tiene más campos (§13.2) |
| Las 91 de la Fase 0 | **83 ✅ · 8 ❌** |
| Suites generales | Todas verdes, sin errores de tipos nuevos. **74 pruebas nuevas**: 29 unitarias, 30 de convex-test, 11 web y 4 del móvil |
| Datos reales (simulación local) | **0** pagos aprobados, así que **0** discrepancias. **Ninguna unidad cambia de estado hoy.** Cambian 92 facturas históricas: 87 juzgadas a través de un mes faltante (CDC no tiene julio; Arboleda no tiene mayo en 27 unidades) y 5 saldos a favor de Arboleda. **CDC 802 no se toca**: la Fase 2 se equivocó (§2.1) |
| Descuento | 197 vigentes de CDC se cobran desde hoy por el total de su documento ($40.000 más cada una): el descuento de septiembre venció el 15 de septiembre (#33) |
| Vencimiento | Fin del mes del período, **solo para lo que se cargue desde ahora**. ⚠ Deja una ventana de "falsa mora" de 8 a 16 días por mes (§8.2) |
| Escrituras | **Cero** en Convex y en S3; **cero** llamadas a Aval |

---

## 2. Verificaciones heredadas (PASO 1)

### 2.1 CDC 802: el dato de la Fase 2 estaba mal

La Fase 2 dijo que, en septiembre, el parser viejo "tomó otra cifra" y guardó $342.000 donde el documento dice −$103.400, y lo marcó como el caso más urgente. **No es así.**

- **El PDF publicado** (`js7emmx2036pr957y87xz07apn8e1xmm`, GET anónimo) es el estado de cuenta **Nro. 0** de la casa. Sus líneas, sin datos personales:

  | Renglón | Lo que dice |
  |---|---|
  | Única fila de conceptos | `SF  CI  ANTICIPO DE CLIENTE … -103.400.00 · Julio / 2026 · -103.400.00` |
  | Fila de la cuota del mes (`*`) | **No hay** |
  | Totales | `-103.400.00 · 0.00 · -103.400.00` |
  | Pague con descuento / sin descuento | `$-103.400.00` / `$-103.400.00` |
  | Fecha | `Septi. 01 / 2026` |

  La tabla R5 de la Fase 2 es correcta **para ese documento**: saldo anterior −$103.400, sin cargos del mes, total −$103.400.
- **Lo guardado** es otro estado de cuenta: el **Nro. 12163**, la cuenta regular de la casa, la misma de los meses anteriores. Tiene total $342.000, con descuento $302.000, líneas de cuota $314.000, código 5 $7.000 y código 8 $21.000, y saldo anterior $0.
- **La regex vieja no atrapó otra cifra.** Con el documento publicado, el parser viejo da total $0, sin líneas y sin etiqueta.
- **La explicación.** El PDF consolidado de septiembre traía **dos** estados de cuenta para la casa 802, del mismo titular: el Nro. 12163 y el Nro. 0.
  - La ruta de carga vieja subía cada grupo a la llave `…/2026-09/unidad-802.pdf`, así que el segundo **pisó al primero en S3 dentro de la misma carga**. El `Last-Modified` de los 205 objetos de septiembre de CDC coincide con la creación de las facturas (2026-09-08 20:03); no hubo escritura posterior.
  - `emparejarLote` le dio la unidad 802 al primero (12163) y dejó el segundo "sin unidad". La base tiene los números del 12163; S3 muestra el Nro. 0.
- **El cruce de los 922 PDF publicados contra lo guardado** (titular, consecutivo y total) coincide en 921. Por consecutivo:
  - en la historia de git hay 1.666 que coinciden, 201 con el consecutivo vacío en lo guardado (enero) y 3 sin lectura;
  - en S3 coinciden 921.

  **Solo difiere 802 de septiembre.**
- **Consecuencias:**
  - la conclusión "CDC 802 no debe $342.000, urgente" de la Fase 2 es errónea: lo guardado es la cuenta regular;
  - el re-procesamiento de la Fase 2 habría reemplazado datos correctos por los de la otra cuenta;
  - la ruta de confirmación de la Fase 2 no tiene este problema: publica con llaves por contenido y solo lo que se inserta o actualiza.
- **Lo que se corrigió en esta fase:**
  - el re-procesamiento omite una factura cuyo PDF publicado tiene otro consecutivo (`documento_distinto`, §9);
  - la carga ya no deja pasar dos documentos de la misma unidad: ninguno se empareja ni se guarda (`documento_repetido`, §9).
- **Lo que sigue abierto:** la contabilidad debe aclarar qué es la cuenta Nro. 0 (−$103.400) de la casa 802 (§16).

### 2.2 Deployment

| Pregunta | Respuesta |
|---|---|
| ¿`packages/backend/.env.local` todavía tiene la deploy key? | **Sí.** Variables (solo nombres): `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOY_KEY`, `DEEPGRAM_API_KEY`, `CONVEX_URL`, `CONVEX_SITE_URL`. La llave es de tipo `dev`, del deployment `agreeable-bee-782`: todo comando de Convex va al que usan los residentes |
| ¿Está desplegada la Fase 2? | **El esquema sí.** `bunx convex data` (solo lectura) lista la tabla `importaciones`, que crea la Fase 2. El prompt dice que la Fase 2 no está desplegada; el deployment dice que su esquema y su backend sí. Los datos no cambiaron desde la exportación de la Fase 2: 0 importaciones, 0 facturas con los campos nuevos, 2 pagos (`fallida`, QA) y 0 comprobantes. No se pudo verificar si la web de la Fase 2 está publicada |
| `AVAL_AMBIENTE` | **`qa`**, leído con `bunx convex env get AVAL_AMBIENTE` y clasificado sin imprimir otra cosa. Está definido, así que hacerlo obligatorio no rompe nada. Pero quiere decir que **la pasarela del deployment de los residentes cobra contra el ambiente de pruebas** (§16) |

### 2.3 Idempotencia de las importaciones

La llave era (conjunto, hash, período), **sin el modo**. Un PDF confirmado con "solo nuevas" y después el mismo con "actualizar" respondía "repetida" y no actualizaba nada. **Corregido** en el PASO 11: la llave incluye `soloNuevas` (§9).

---

## 3. Cambios por componente

| Componente | Archivo | Cambio |
|---|---|---|
| **Esquema** (solo aditivo) | `packages/backend/convex/schema.ts` | `facturas`: campos opcionales `estadoPago`, `veredictoContable`, `pagoEnVerificacion`, `fechaLimiteDescuento`, `origen` y `lecturaDudosa.confirmada.{totalVerificado,totalLeido}`. Índice nuevo `by_condominio_unidad_periodo`. <br>`pagos`: literal `reversada` y campos opcionales `esPrueba`, `reversadaAt`, `motivoReverso` y `consultaAgotadaAt`. Índice `by_unidad`. <br>`soportesPago`: campos opcionales `monto`, `fechaPago` y `montoAsumido`. Índice `by_unidad`. <br>Tablas nuevas `facturaEventos` (bitácora) y `discrepanciasPago` |
| **Regla del estado** *(nuevo)* | `convex/lib/estadoFactura.ts` | Puro y sin dependencias: <br>· `evidenciaDePago` (monto, descuento, excedente); <br>· `estadoDeFactura` (la función única); <br>· `discrepanciaDePar` y `aplicadoEnPosterior`; <br>· `calcularCadena` (toda la cadena de una unidad: estados, veredictos, discrepancias y marca de la vigente) |
| **Regla de cartera** | `convex/lib/cartera.ts` | · `veredictoConciliacion` exige meses consecutivos (`sin_veredicto`), con `periodosConsecutivos` y `periodoSiguiente`. <br>· `motivoNoPagable` tiene el motivo nuevo `pago_en_verificacion`, con su mensaje y `mensajePagoEnVerificacion`. <br>· `carteraDeUnidad`: `motivoRevision` (`lectura`, `pago_en_verificacion` o `mes_faltante`) y `montoEnVerificacion`. <br>· Descuento y vencimiento: `fechaLimiteDescuentoDe`, `descuentoVigente`, `montoAPagarHoy` y `vencimientoDePeriodo`. <br>· Montos: `formatoPesos` y `leerMontoPesos` |
| **Modelo** *(nuevo)* | `convex/model/estadoFactura.ts` | `recalcularCadena`: el **único** lugar que escribe `estado`. Lee pagos, comprobantes y discrepancias de la unidad, aplica `calcularCadena`, escribe solo lo que cambió y deja los eventos |
| | `convex/model/facturas.ts` *(nuevo)* | `escribirFactura`: el único escritor por identidad (opciones `siExiste`, `conLectura`, `conFechas` y `soloDefinidos`); una manual la reemplaza el PDF. `actualizarDocumento`: los números de una factura ya identificada |
| **Facturas** | `convex/facturas.ts` | `bulkUpsert`, `upsertFactura`, `createManual`, `confirmarLectura` (con `totalVerificado`), `reconciliar`, `reprocesarLecturas` y `backfillFechas` pasan por el modelo. <br>`iniciarImportacion` y `finalizarImportacion`: idempotencia con el modo y `documento_repetido`. <br>**Nuevas** para Finanzas: `pagosPorRevisar`, `resolverDiscrepancia`, `mesesFaltantes` y `eventos` |
| **Pagos** | `convex/pagos.ts`, `convex/crons.ts` | · `AVAL_AMBIENTE` obligatorio. <br>· `armarDatosTrn` cobra `montoAPagarHoy`. <br>· `registrarPago` marca `esPrueba`. <br>· `aplicarEstado` registra evidencia y recalcula la cadena; un pago aprobado o reversado no se mueve con una consulta. <br>· **Nuevas:** `reversarPago` (interna) y `reconsultaDiaria`, con su cron diario |
| | `convex/lib/avalProduccion.ts` | `ambienteAval`: solo "qa" o "prod"; sin la variable, error |
| **Comprobantes** | `convex/soportesPago.ts` | `crearMio` y `crearDesdeBot` aceptan solo la vigente y reciben `monto` y `fechaPago`. Nueva `registrarMontoBot`. `aprobar` recibe monto y fecha (o asume pago completo) y recalcula la cadena. `listMios` y `listByCondominio` devuelven el monto |
| **Operación** | `convex/pagosPruebas.ts`, `convex/limpieza.ts`, `convex/migrations.ts` | · `pagosPruebas`: solo pagos `esPrueba`, nueva `marcarDePrueba`, se niega en producción y recalcula con su bitácora. <br>· `limpieza`: sin pagos ni comprobantes; constante `NUNCA_SE_LIMPIA`. <br>· `bulkFacturas`, `setTotalConDescuento` y `fixSaldoAFavorEstado` pasan por el modelo |
| **Lectura** | `convex/lib/lecturaFactura.ts`, `convex/lib/reproceso.ts` | · Motivos de rechazo `documento_repetido` y `factura_duplicada`. <br>· El planificador usa `calcularCadena` y omite `documento_distinto` |
| **Bot, agente, campana y avisos** | `convex/whatsapp.ts`, `convex/whatsappAgente.ts`, `convex/notificacionesFeed.ts`, `convex/whatsappNotifs.ts` | · Bot: fecha real del descuento, "pago en verificación" y pregunta "¿Cuánto pagaste?" después de la foto. <br>· Agente: `pagoEnVerificacion`, `descuentoHasta` y `venceEl` en hora de Colombia. <br>· Campana: "Pago en verificación · $X", y "Por pagar" con el monto de hoy. <br>· Aviso de pago: un abono dice cuánto falta, no "estás al día" |
| | `convex/_generated/api.d.ts` | Registro de los tres módulos nuevos, a mano y en el orden de `codegen` (no se corrió ningún comando de Convex) |
| **Web: carga** | `apps/web/app/api/facturas/parser.ts`, `confirmar/route.ts`, `lib/emparejar-unidad.ts` | · El parser lee `diaLimiteDescuento`. <br>· La confirmación guarda `fechaLimiteDescuento`, pone el vencimiento nuevo y no manda los documentos repetidos. <br>· El emparejamiento marca "documento repetido en el PDF" |
| **Web: residente** | `app/mi/[id]/page.tsx`, `app/mi/[id]/cuenta/page.tsx`, `components/portal/portal-pay-button.tsx`, `components/portal/portal-ui.tsx` | Monto y fecha del descuento con `montoAPagarHoy` y `fechaLimiteDescuentoDe`, y fechas de plazo en hora de Colombia (`fechaPlazo`). "Pago en verificación" con su mensaje y sin "Pagar" |
| **Web: administración** | `app/condominio/[id]/finanzas/page.tsx`, `components/finanzas/*` *(nuevo)*, `app/condominio/[id]/comprobantes/page.tsx`, `app/condominio/[id]/reservas/page.tsx`, `components/create-factura-form.tsx` | · Finanzas: "Pagos por revisar" (discrepancias con "Resolver", excedentes, pagos sin estado final), "Meses faltantes", historial de cada factura, por qué está en su estado, y "Confirmar lectura" con el total escrito. <br>· Comprobantes: aprobar pide monto y fecha. <br>· Reservas: el porqué de "En revisión". <br>· Factura manual: vencimiento propuesto con la regla nueva |
| **Móvil** | `apps/mobile/src/lib/resumen-facturas.ts`, `src/app/(app)/(tabs)/facturas.tsx` | "Pago en verificación" (estado, tarjeta y detalle). Fecha real del descuento. "Ya pagué" pide monto y fecha. Factura manual con el vencimiento nuevo |
| **Pruebas** | ver §13 | 74 pruebas nuevas. Se renombraron dos archivos de la Fase 0, sin cambiar el contenido, y se ajustó una prueba de la Fase 2 (justificado) |

**Las pruebas de la Fase 0 no se tocaron.** `estados.regresion.ts` e `importacion.regresion.ts` quedaron completamente en verde y se renombraron a `*.test.ts` con el **mismo contenido** (mismo SHA-1), según la convención de la Fase 0 (§2). `git diff` sobre los demás `*.regresion.ts`, `escenario.ts`, `parserFacturas.test.mjs`, `resumenResidente.test.mjs` y los fixtures está vacío.

---

## 4. Modelo de estados

### 4.1 Tres fuentes, guardadas aparte

| Fuente | Campo | Qué es | Quién la produce |
|---|---|---|---|
| **Carga** | (del documento) | `pendiente` o `saldo_a_favor` según el total (`estadoDeCarga`); `pendiente` si la lectura está en revisión | La carga del PDF, la manual, el script, la migración |
| **Evidencia** | `estadoPago` `{estado, montoPagado, montoAdeudado, conDescuento, excedente?}` | Lo que Vekino **vio** pagar: pagos aprobados de la pasarela y comprobantes aprobados de **esta** factura | `aplicarEstado`, `soportesPago.aprobar`, `reversarPago`, `pagosPruebas` |
| **Veredicto** | `veredictoContable` `{estado, motivo?, facturaSiguienteId?, saldoAnteriorSiguiente?}` | Lo que la factura **siguiente** dice de esta con su saldo anterior. `sin_veredicto` (`mes_faltante`) con un hueco; `heredado` para el estado de antes de la Fase 3 | La conciliación, con `veredictoConciliacion` |

**Por qué estos nombres.** `estadoPago` y `veredictoContable` dicen de dónde sale cada uno: la evidencia es del pago, y el veredicto es lo que concluye la contabilidad con su documento.

`estado` sigue siendo el campo que leen todas las superficies, con los mismos cinco valores. **No cambió de significado:** cambió quién lo decide. Se agregaron, aparte, `pagoEnVerificacion` y `motivoRevision`.

### 4.2 La función única y su precedencia

`estadoDeFactura({carga, evidencia, veredicto})` (`lib/estadoFactura.ts`). Solo la llama `recalcularCadena` (`model/estadoFactura.ts`), el **único** código que escribe `facturas.estado`.

| evidencia \ veredicto | ninguno o sin veredicto | pagada | abonada | vencida | saldo a favor |
|---|---|---|---|---|---|
| **ninguna** | carga | pagada | abonada | vencida | saldo a favor |
| **abonada** | abonada | **pagada** (la contabilidad dice que quedó saldada) | abonada | **abonada** (la inferencia no la baja) | saldo a favor |
| **pagada** | pagada | pagada | **pagada** | **pagada** (#2) | pagada |

- **La inferencia puede mejorar, nunca degradar** lo que respalda la evidencia: #2, #3, #4, #5 y #23.
- **Un "pagada" inferido sin evidencia se corrige** con el documento siguiente corregido (#6).
- **Veredicto conservado.** Si el par no se puede juzgar (alguna lectura en revisión) o no hay siguiente, se conserva el veredicto que había. Es la semántica de la Fase 2: el re-procesamiento "conserva su estado".
- **Estado heredado.** Una factura de antes de la Fase 3, sin veredicto ni evidencia guardados, conserva su `pagada`, `abonada` o `vencida` como veredicto `heredado`, para no degradar en silencio lo que ya se veía. Si alguna vez tuvo evidencia (`estadoPago`), no se hereda: un pago reversado no la deja pagada. Sobre los datos reales de hoy, **0** facturas quedan en ese caso (§14).

### 4.3 La bitácora (`facturaEventos`)

| Campo | Contenido |
|---|---|
| `facturaId`, `condominioId`, `unidadId`, `periodo` | La factura |
| `estadoAntes` → `estadoDespues` | Sin `estadoAntes` cuando el evento es la creación |
| `origen` | `carga`, `conciliacion`, `pago`, `comprobante`, `confirmacion_lectura`, `reproceso`, `migracion` y `discrepancia` |
| `actor`, `actorUserId` | La persona, "Pasarela Aval" o el script (`migrations.bulkFacturas`…) |
| `detalle`, `datos`, `at` | Qué pasó, en español; los montos y los campos que cambiaron; cuándo |

**Cuándo se escribe un evento:**
- toda factura que la operación **escribió** (creada o actualizada) deja uno, aunque su estado no cambie;
- toda factura cuyo **estado** cambió por efecto de otra deja uno, con origen `conciliacion` si lo movió el veredicto;
- también aparecer o desaparecer la marca "pago en verificación", y abrir, reabrir o resolver una discrepancia.

**Lo que permite:** reconstruir qué vio el residente en una fecha: el estado de cada factura en cada momento y por qué cambió. Finanzas lo muestra en el detalle de cada factura ("Historial de la factura").

**Nada se escribe si nada cambió.** "Conciliar" sobre un conjunto ya conciliado no llena la bitácora.

---

## 5. Discrepancias de pago (PASO 4)

**Definición** (`discrepanciaDePar`). Hay discrepancia entre N y N+1 si las dos son de meses consecutivos, ninguna está en revisión y se cumple:

> saldo anterior de N+1 > (lo adeudado en N − lo pagado en Vekino para N) + $1

El monto no aplicado es `min(pagado, saldo anterior − lo que quedaba por pagar)`.

- **No es discrepancia** el caso consistente: agosto $300.000, pagados $250.000, septiembre arrastra $50.000 (#22 y #25). Tampoco un par sin pagos, ni uno con un mes faltante, ni uno con una lectura en revisión.
- **El caso de la auditoría (F-06):** agosto pagado con descuento ($340.000) y septiembre arrastra $40.000. Es una discrepancia de $40.000: la contabilidad no reconoció el descuento. La revisa la administración.

**Registro.** Tabla `discrepanciasPago` con:
- N y N+1, sus períodos;
- lo adeudado, lo pagado, el saldo anterior siguiente y lo no aplicado;
- los pagos y comprobantes involucrados;
- el estado (`abierta` o `resuelta`) y la resolución.

Abrirla, actualizarla, reabrirla o resolverla deja un evento en la bitácora de N.

**Efecto en cada superficie.** Al residente nunca se le pide pagar dos veces:

| Superficie | Con una discrepancia abierta |
|---|---|
| Cobro (`armarDatosTrn`, `puedePagar`) | La vigente lleva `pagoEnVerificacion` y `motivoNoPagable` responde `pago_en_verificacion`: no se cobra en línea. Mensaje estable: "Tu pago está registrado, pero la contabilidad aún no lo refleja. La administración lo está verificando; mientras tanto esta factura no se puede pagar en línea." |
| Cartera (administración, reservas, insignias) | `en_revision` con `motivoRevision: "pago_en_verificacion"` y `montoEnVerificacion`. **Nunca "en mora"** por ese monto, aunque la vigente haya vencido |
| Web del residente (inicio y "Mis facturas") | "Pago en verificación" y "Tu pago de $X está registrado; la contabilidad aún no lo refleja. La administración lo está verificando." Sin "Pagar" |
| Móvil | Estado "Pago en verificación", la tarjeta igual, y el mensaje en el detalle |
| Bot | En "Factura", el mensaje de verificación en lugar del botón "Pagar". Un botón "Pagar" viejo responde lo mismo |
| Agente | `ver_estado_cuenta` devuelve `pagoEnVerificacion` y `queDecir`; `generar_link_pago` no genera enlace |
| Campana | "Pago en verificación · $X" |
| Finanzas | "Pagos por revisar": cada discrepancia con montos y "Resolver" |

**Por qué bloquear y no cobrar el neto.** El prompt lo recomienda, y cobrar "total − no aplicado" sería cobrar un número que no está en ningún documento. Con la contabilidad atrasada, ese neto puede volver a quedar mal en el documento siguiente. Bloquear es lo que hace la Fase 2 con una lectura dudosa. La salida rápida existe: la administración la resuelve en Finanzas.

**Resolución:**

| Tipo | Cuándo |
|---|---|
| `documento_corregido` (automática) | La contabilidad corrige N+1 (se vuelve a cargar con "actualizar") y ya refleja el pago |
| `aplicado_en_documento_posterior` (automática) | Llega N+2 y su saldo anterior muestra el pago aplicado: saldo anterior de N+2 ≤ total de N+1 − no aplicado − lo pagado de N+1 en Vekino + $1 |
| `pago_reversado` (automática) | El pago que la originó se reversó o se borró (prueba) |
| `administracion` (manual) | Administración o contadora (`resolverDiscrepancia`), con una **nota obligatoria** de qué se verificó, que queda en la bitácora |

**Reaperturas.**
- Una resolución automática se reabre si la contradicción vuelve (otro documento, otro pago).
- Una de la administración se respeta mientras los montos no cambien.

**Al resolverla, la vigente vuelve a ser pagable por el valor de su documento.** Por eso la nota es obligatoria y la pantalla lo advierte: si la contabilidad va a emitir un documento corregido, no hace falta resolverla.

**Límite conocido.** Un pago hecho por fuera de Vekino durante N+1 también baja el saldo de N+2, y se confundiría con el pago no aplicado. Lo resuelve importar el recaudo del banco (§12).

---

## 6. Monto pagado, comprobantes y reversos

### 6.1 Evidencia por monto (`evidenciaDePago`)

1. Se suman **todos** los pagos de la factura: pasarela aprobada (no reversada) más comprobantes aprobados.
2. **Lo adeudado** es el total con descuento si lo pagado **dentro del plazo** alcanza para él (±$1); si no, el total.
3. El momento de cada pago:
   - en la pasarela, la **creación de la transacción**, porque ahí se cotiza el monto que cobra el banco;
   - en un comprobante, la **fecha que declaró** el residente y confirmó la administración.
4. El resultado:

   | Pagado frente a lo adeudado | Estado |
   |---|---|
   | ≥ adeudado (±$1) | `pagada` |
   | por encima | `pagada`, con `excedente`, que aparece en "Pagos por revisar" y no se aplica solo |
   | por debajo | `abonada` (#21) |

### 6.2 La pasarela

- **`aplicarEstado` ya no escribe la factura.** Actualiza el pago y, en la transición a aprobada, recalcula la cadena (origen `pago`, actor "Pasarela Aval").
- **El aviso por WhatsApp** sale solo en la transición, como antes. Ahora dice cuánto falta si fue un abono, en vez de "¡Gracias por estar al día!".
- **Un pago aprobado o reversado no se mueve con una consulta posterior.** Solo cuenta el intento.
- **Reversos.** El repositorio documenta los códigos 1 (pendiente), 2 (rechazada), 3 (fallida), 4 (aprobada), 5 (expirada) y 6 (no autorizada), y **ningún código de reverso**. No se inventó ninguno: `mapStatusCode` no cambió.
  - Se agregó el estado `reversada` y la ruta interna `pagos.reversarPago({pagoId, motivo, actor})`, a mano y con motivo obligatorio. La evidencia se recalcula, con su evento. Si el pago había abierto una discrepancia, se cierra como `pago_reversado`.
  - **Falta:** que Aval documente cómo reporta un contracargo o reverso (§12).
- **Pagos sin estado final.** `consultarEstado` sigue preguntando cada 2 minutos durante una hora.
  - **Nuevo:** `reconsultaDiaria` (cron, 6:00 de Colombia) vuelve a agendar la consulta de los pagos `iniciada` o `pendiente` creados hace más de 2 horas y menos de **7 días** (`DIAS_RECONSULTA`), espaciadas 15 segundos.
  - Pasados los 7 días, el pago queda marcado (`consultaAgotadaAt`) y aparece en "Pagos por revisar". La prueba simula a Aval; nunca se lo llama.

### 6.3 Comprobantes

- **Monto y fecha.**
  - La **app** pide "¿Cuánto pagaste?" y "¿Qué día pagaste?" antes de elegir el archivo, con el monto de hoy como sugerencia.
  - El **bot** toma el monto del texto de la foto ("pagué 340.000") o lo pregunta. Se puede contestar "omitir".
  - La **administración**, al aprobar, confirma o corrige el monto y la fecha. **La pantalla no deja aprobar sin ellos.**
- **Solo la vigente.** `crearMio` y `crearDesdeBot` rechazan una factura histórica con un mensaje estable: "Ese comprobante debe ir con la factura vigente de la unidad: el saldo de esa factura ya quedó incluido en la más reciente."
- **Aprobar es evidencia** por ese monto (origen `comprobante`). Sin factura vinculada, queda aprobado y no cambia ningún estado.
- **Desviación del prompt, justificada.** El PASO 6 dice que `aprobar` exige monto y fecha. La prueba #4 de la Fase 0, que debe quedar en verde y no se puede modificar, aprueba un comprobante **sin monto** (`aprobarComprobante` en `escenario.ts`). La mutación lo acepta y lo toma como **pago completo de lo que se debía ese día**: guarda ese monto y `montoAsumido: true`, que se ve en la pantalla.
  - Las versiones viejas de la app (que no mandan el monto) siguen funcionando.
  - La pantalla de la administración **sí** lo exige.

---

## 7. Huecos de período (F-09)

- **Regla** (`veredictoConciliacion`). Un par (N, N+1) se juzga solo si N+1 es el mes siguiente a N. Si no, `sin_veredicto` (`mes_faltante`) y la factura queda con su estado de carga.
  - **Excepción:** si el saldo anterior de N+1 está en $0 (±$1), todo lo anterior quedó saldado y N es `pagada` (o saldo a favor), hubiera hueco o no (#18).
- **En la cartera y el resumen.** "Sin veredicto" nunca produce "en mora" ni "al día":
  - si el período que decidiría la mora no tiene veredicto, la unidad está `en_revision` (`mes_faltante`);
  - si lo cubre una posterior con evidencia, o no queda saldo, sigue la regla de siempre.
- **En Finanzas.** "Meses faltantes" lista cada unidad con su hueco ("falta 2026-07") y las que no tienen los meses más recientes del conjunto (`al_final`).
- **Datos reales** (§14, Anexo H1):
  - a **CDC** le falta **julio de 2026** completo (194 unidades con junio → agosto);
  - a **Arboleda** le falta **mayo** en 27 unidades (abril → junio).

  De esos pares, 87 quedan sin veredicto y 153 se siguen juzgando, porque el saldo anterior siguiente está en $0. **Ninguna unidad cambia de estado hoy:** la mora la deciden agosto y septiembre.
- **CDC 716, mayo** (Fase 2, §11.4). Era `vencida`: se juzgaba con agosto, cuyo saldo anterior ($413.500) incluye junio y julio.
  - Con las reglas nuevas queda **sin veredicto**: `pendiente` con lo guardado; `saldo a favor` con la lectura nueva de su PDF (−$400.000).
  - La unidad sigue "Pendiente" ($335.000).

---

## 8. Descuento y vencimiento (F-06)

### 8.1 El plazo del descuento

- **Lo que dicen los documentos** (corpus de la Fase 2, solo los números de las frases de plantilla):

  | Formato | Frase | Documentos |
  |---|---|---|
  | CDC | "…HASTA EL DIA **15** DEL PRESENTE MES" | 1.404 |
  | CDC | "Pague con descuento del **1 - 15**" / "Pague sin descuento **16 - 30**" | 1.605 |
  | CDC | Descuento por pronto pago de $40.000 | 1.404 |
  | Arboleda | "…realizar el pago oportuno antes del día **15**, para poder pagar los servicios públicos…" | 1.168 de 1.168 |
  | Arboleda | Descuento | **ninguno** |
- **El parser** lee el día (`diaLimiteDescuento`) de la primera frase, o de la segunda si no está: **1.621** documentos de CDC dan día 15 y **ninguno** da otro. La confirmación lo guarda como `fechaLimiteDescuento`: el último instante de ese día, hora de Colombia.
- **Sin el campo** (todo lo cargado hasta hoy): `fechaLimiteDescuentoDe` aplica el **día 15 del mes del período**. Es la única regla documentada, y Arboleda no tiene descuento (sus facturas no traen `totalConDescuento`). **Sin `totalConDescuento`, no hay descuento.**
  - **Por qué una regla general y no una por conjunto:** no existe configuración por conjunto, y crearla exigiría escribirla en la base. Además, las pruebas #33–#35 usan un conjunto de prueba con descuento y sin fecha, y #34 exige el descuento el 10 de septiembre.
- **Quién lo usa:** `armarDatosTrn` (lo que cobra la pasarela), la web (`montoAPagarHoy` de `lib/cartera.ts`, sin regla propia), el móvil, el bot, el agente y la campana.
- **Textos:**
  - antes: "Pague del 1 al 15 (con descuento)" junto a "Vence: 15 de {mes siguiente}", y "Con descuento hasta el {vencimiento}";
  - ahora: "Con descuento hasta el 15 de septiembre de 2026" y "Sin descuento, hasta el {vencimiento}", con las fechas en hora de Colombia.
- **Efecto hoy** (Anexo D):
  - las 1.556 facturas de CDC con descuento usan la regla del día 15, que coincide con lo que dicen sus documentos;
  - de las **198** vigentes que hoy se pueden pagar con descuento, **197** se cobran desde hoy por el total ($40.000 más cada una, $7.880.000 en total). Es lo que dice el documento. Antes la pasarela cobraba el descuento hasta el 15 de octubre (#33).

### 8.2 El vencimiento: decisión y alternativas

**Decisión del responsable:** "Pagar con descuento hasta el 15 del presente mes, del 16 a 30 se paga el precio completo".

- **Cómo se aplicó:**
  - `vencimientoDePeriodo` = **último día del mes del período**, a medianoche de Colombia: ese día todavía se paga y la mora empieza al siguiente, la misma convención de siempre.
  - **Interpretación:** el "30" se leyó como el último día del mes: 28 o 29 en febrero, 31 donde lo hay. Es la lectura que nunca pone en mora antes que la literal.
  - Lo usan la confirmación de carga y el vencimiento que proponen la factura manual (web y móvil). La manual ahora guarda la medianoche de Colombia del día elegido, no el fin del día en la hora del navegador.
- **Solo para lo que entra desde ahora.** Las facturas ya guardadas conservan su vencimiento (15 del mes siguiente). Una re-carga con "actualizar" no re-fecha. `bulkUpsert` sigue aceptando el vencimiento que manda quien carga, porque así lo fijan los controles #47 y #49.
- **Qué dice cada formato:**
  - **CDC** fija el plazo: con descuento del 1 al 15, sin descuento del 16 al 30. Coincide con la decisión.
  - **Arboleda** solo *recomienda* pagar antes del 15 y no habla de vencimiento.
- **Cuántas unidades cambiarían de estado hoy** (8 de octubre, escenario B con las reglas nuevas, 377 unidades):

  | Vencimiento de TODAS las facturas | En mora | Cambian frente a hoy |
  |---|---|---|
  | Como está guardado (15 del mes siguiente) | 76 (CDC 32 · Arboleda 44) | — |
  | Fin del mes del período (la decisión) | **366** | **290** pasan de "Pendiente" a "En mora" (CDC 168 · Arboleda 122) |
  | Día 15 del mes del período (texto de Arboleda) | 366 | 290 (los mismos) |

  Re-fechar lo existente pondría **hoy** en mora a casi todo el que no ha pagado septiembre en Vekino: el 30 de septiembre ya pasó y el PDF de octubre no ha llegado. Por eso no se hizo. **Requiere autorización.**
- **⚠ Lo que la decisión implica para lo nuevo** (Anexo V1). Con el vencimiento a fin de mes, entre el día 1 y la carga del PDF siguiente, la vigente ya venció y Vekino todavía no ve los pagos hechos por fuera (banco o portal). Esas unidades se verían **"En mora"** durante esos días.
  - Con los ciclos reales, la ventana fue de **8 días** (CDC, agosto) a **16 días** (Arboleda, agosto).
  - Entre el 74 % y el 84 % de las unidades **habían pagado o abonado** por fuera.
  - Con el vencimiento viejo (el 15 del mes siguiente), el PDF llegaba antes y la ventana casi no existía.
  - **Sale con la primera carga** desde que se despliegue (octubre: vence el 31, y la ventana empieza el 1.º de noviembre).
  - **Opciones**, en §16 y §17: cargar el PDF antes del día 1, importar el recaudo diario (F-05), o mantener el vencimiento del 15 del mes siguiente para la mora y usar el fin de mes solo como el plazo del precio completo.

---

## 9. Escritura única e idempotencia

- **`escribirFactura`** (`model/facturas.ts`):
  - busca la factura por su identidad (conjunto, unidad, período) con el índice nuevo, y el `legacyId` solo desempata;
  - con dos facturas para la misma identidad no adivina (`factura_duplicada`);
  - un `legacyId` que ya es de otra factura es `conflicto_legacy`;
  - **nunca escribe `estado`**: la factura nueva entra con el de carga y `recalcularCadena` pone el definitivo.
- **Las rutas:**

  | Ruta | Si ya existe | Fechas | Estado que manda quien llama |
  |---|---|---|---|
  | `bulkUpsert` (PDF) | "solo nuevas": omitir; "actualizar": números del documento y marca de lectura | No re-fecha | Se ignora |
  | `createManual` | Error ("Ya existe…") | Las elegidas | — (`origen: "manual"`) |
  | `upsertFactura` (script) | Actualiza los campos que trae | Las suyas | Se ignora; al insertar, un juicio queda como veredicto `heredado` |
  | `migrations.bulkFacturas` | Solo actualiza lo que ella creó (mismo `legacyId`); lo cargado por PDF no se toca | Las suyas | Igual que el script |
  | `reprocesarLecturas` | Números de la lectura nueva (`actualizarDocumento`) | No | — |

  **#10:** la migración ya no duplica agosto. **#11 y #12:** volver a correr la migración o el script no devuelve a "pendiente" una factura pagada. **Todas las rutas concilian** (`recalcularCadena`, por unidad).
- **Factura manual seguida del PDF** (auditoría §4.3).
  - Antes: con "solo nuevas", el PDF se omitía y la manual se quedaba (con su línea única y sin saldo anterior); con "actualizar", se reemplazaba.
  - **Ahora** (era trivial): una factura `origen: "manual"` la reemplaza el PDF del mismo período **en los dos modos**, porque era un sustituto mientras llegaba el documento. El plan de la importación lo muestra como "actualizar" y la bitácora dice "El PDF reemplazó la factura hecha a mano".
  - Las manuales de antes no tienen `origen`: en los datos reales hay **0**.
- **Dos documentos de la misma unidad en un PDF** (el caso 802):
  - el emparejamiento de la web ya no se lo da al primero: los dos quedan "documento repetido en el PDF";
  - y, por si alguien llama directo, `iniciarImportacion` y `bulkUpsert` los rechazan a los dos (`documento_repetido`);
  - la confirmación no los manda a guardar ni a S3, y quedan contados al cerrar la importación.
- **El consecutivo no sirve como control en la carga.** Una idea era rechazar una re-carga cuyo número interno no coincidiera con el guardado. Los datos lo descartan:
  - en Arboleda, el consecutivo es **distinto en cada documento** (172 de 172 unidades);
  - en CDC cambia en 205 de 206 unidades;
  - un documento corregido trae otro número, y ese control bloquearía las correcciones legítimas.

  Solo se usa en el **re-procesamiento**, donde se vuelve a leer **el mismo** documento que se cargó: si el consecutivo no coincide, el PDF publicado es otro (`documento_distinto`). En el escenario B lo es solo CDC 802 de septiembre.
- **Idempotencia.** La llave es (conjunto, hash, período, **modo**). El mismo PDF con "solo nuevas" y después con "actualizar" son dos importaciones.

---

## 10. Operación segura (F-14, F-21)

| Herramienta | Antes | Ahora |
|---|---|---|
| `AVAL_AMBIENTE` | Sin la variable se asumía "qa": en un deployment de producción mal configurado, los pagos reales quedaban como de prueba | Obligatorio y solo "qa" o "prod" (`ambienteAval`). Sin él no se crea ni se consulta ninguna transacción. El deployment actual lo tiene en `qa` (§2.2) |
| `pagosPruebas.revertir*` | Tocaba todo pago que no dijera "prod" y reescribía el estado de la factura | Solo pagos `esPrueba`, que la pasarela marca al crearlos con `AVAL_AMBIENTE=qa`. Uno viejo se marca a mano y de a uno (`marcarDePrueba`). Se niega si el deployment es "prod" o no tiene la variable. Borra el pago y **recalcula la cadena**, con un evento en la bitácora. Otro pago o comprobante sigue contando. Los 2 pagos reales actuales (`fallida`) no tienen la marca |
| `limpieza` | Borraba "Pagos de pasarela" y "Soportes de pago" | No los toca. `NUNCA_SE_LIMPIA` = pagos, comprobantes, bitácora, discrepancias, importaciones y facturas. Una prueba pide limpiarlas por nombre y comprueba que no se borra nada |

---

## 11. Regla de mora

**Decisión del responsable:** **mantener la actual**: una factura posterior `abonada` cubre la mora. **No se cambió.**

**Impacto de la alternativa** ("en mora si el saldo anterior real de la vigente es mayor que $1"), por conjunto y sin unidades de prueba (Anexo M1):

| | Regla actual | Alternativa | Cambian |
|---|---|---|---|
| Sobre lo guardado hoy | En mora: CDC 39 · Arboleda 44 | En mora: CDC 66 · Arboleda 85 | **68** de "Pendiente" a "En mora" (CDC 27 · Arboleda 41). Monto en mora: **$309.109.505** |
| Escenario B (lecturas nuevas) | En mora: CDC 32 · Arboleda 44 | En mora: CDC 64 · Arboleda 85 | **73** (CDC 32 · Arboleda 41). Monto en mora: **$307.730.415** |

Son las casas que arrastran deuda vieja y abonaron el último mes, como CDC 504 ($24,7 millones), que hoy se ve "Pendiente". Si se decide la alternativa, se implementa en `carteraDeUnidad` y se revisan las pruebas que fijan la regla vieja (PASO 12).

---

## 12. Diseño de recaudo y exportación (F-05): solo diseño

El repositorio **no tiene** documentación ni una muestra del archivo de recaudo del convenio, ni la especificación de reversos de Aval. No se implementó nada.

### 12.1 Importación del archivo de recaudo

- **Qué resuelve.** Hoy Vekino solo ve los pagos de su pasarela y los comprobantes. Lo pagado por el banco o el portal del convenio se conoce con el PDF siguiente. Importar el recaudo diario:
  - vuelve evidencia esos pagos;
  - cierra discrepancias sin esperar al mes siguiente;
  - y elimina la ventana de "falsa mora" del vencimiento nuevo (§8.2).
- **Diseño:**
  1. Una tabla `recaudos` (archivo, hash, fecha de corte, filas) y una pantalla en Finanzas con la misma mecánica de `importaciones`: vista previa sin escribir, confirmación idempotente por hash.
  2. Cada fila (referencia, fecha, monto, canal, id de la transacción en el banco) se empareja a una unidad por la referencia. La referencia es el número de casa que ya manda Vekino a la pasarela (`lib/referenciaPago.ts`).
  3. La fila se asigna a la factura **vigente en la fecha del pago**.
  4. Entra como evidencia: un tercer origen en `pagosRegistrados` (`recaudo`), con su evento `pago` en la bitácora.
  5. **Sin duplicar:** los pagos de la pasarela de Vekino también aparecen en el recaudo. Se reconocen por `pmtAuthId` o `approvalId` y no se cuentan dos veces.
  6. Lo que no empareja (referencia desconocida, unidad sin vigente) va a "Pagos por revisar".

### 12.2 Exportación a la contabilidad

Un archivo (CSV o Excel) con los pagos de Vekino, para que la contabilidad los impute al mes correcto: fecha, casa, número de factura, período, monto, medio, `approvalId`, `pmtAuthId` y estado (incluidos los reversados), más los comprobantes aprobados con su monto y fecha.

### 12.3 Qué pedir

| A quién | Qué |
|---|---|
| **Banco / Aval** | · Formato del archivo de recaudo (campos, codificación, separador), un **archivo de muestra real**, canal (SFTP, correo o portal), frecuencia y hora de corte. <br>· Qué trae la referencia: ¿el número de casa que manda Vekino (`InvoiceNum`) o lo que digita el pagador en el portal? <br>· Si los pagos de la pasarela aparecen en el recaudo y con qué identificador. <br>· **Cómo reporta un reverso o contracargo** (código en `BasicData` o en el recaudo), y si puede cambiar el estado de una transacción ya aprobada. <br>· Fecha de la transacción frente a fecha de abono. <br>· Un archivo por convenio (Nura) o uno solo |
| **Contabilidad** | · Fecha de corte de cada estado de cuenta: qué pagos refleja el saldo anterior. <br>· Cómo decide el descuento: ¿por la fecha del pago o por la del abono? (§5, discrepancia de $40.000). <br>· Si puede importar la exportación de Vekino. <br>· Qué es la cuenta Nro. 0 de CDC 802 (§2.1). <br>· Cómo emite un estado de cuenta corregido. <br>· Los meses que faltan en Vekino: julio de CDC y mayo de Arboleda (§7) |

---

## 13. Pruebas

### 13.1 Resultado por suite (antes = `0a51658`, después = *working tree*)

| Suite | Antes | Después |
|---|---|---|
| Backend · facturación (`bun run test:facturacion`) | 36 ✅ · 19 ❌ (55) | **27 ✅ · 8 ❌ (35)**. Más **20 ✅** que pasaron a la suite normal (`estados.test.ts` 6, `importacion.test.ts` 14). **Suma: 47 ✅ · 8 ❌ (55)**, lo esperado sin renombrar |
| Backend · unitarias (`test:unit`) | 410 ✅ | **439 ✅** (+29) |
| Backend · convex-test (`test:seguridad`) | 922 ✅ (42 archivos) | **972 ✅ (45 archivos)**: +30 nuevas y las 20 renombradas |
| Web · facturación | 6 · 15 · 18 · 7 · 36 | 6 · 15 · **4** · 18 · 7 · **43**, todas ✅ (la confirmación de la Fase 3 va en su propio proceso) |
| Web · todo (`bun run test`) | 219 ✅ | **230 ✅** |
| Móvil | 21 ✅ | **25 ✅** |
| Tipos (`tsc --noEmit`) | Backend y web sin errores; móvil solo `auth.ts(34,11)` | **Igual** |

### 13.2 Cruce resultado por resultado contra la tabla #1–#91

"Antes" es la línea base de esta fase; "Después", el *working tree*. Los títulos, la fase y la columna "Fase 0" salen de la tabla de la Fase 0 y del cruce de la Fase 2.

#### Las 11 pruebas de la Fase 3

| # | Prueba | Archivo | Fase 0 | Antes | Después |
|---|---|---|---|---|---|
| 2 | `F02-pagada-a-vencida` — agosto pagado por la pasarela no pasa a 'vencida' porque septiembre arrastre los $300.000 | `estados.regresion.ts → estados.test.ts` | ❌ | ❌ | ✅ |
| 3 | `F02-pagada-a-abonada` — agosto pagado por la pasarela no pasa a 'abonada' porque septiembre arrastre $40.000 | `estados.regresion.ts → estados.test.ts` | ❌ | ❌ | ✅ |
| 4 | `F12-comprobante-sobrescrito` — un comprobante aprobado por la administración tampoco se borra por inferencia | `estados.regresion.ts → estados.test.ts` | ❌ | ❌ | ✅ |
| 5 | `F02-conciliar-boton` — el botón 'Conciliar' (facturas.reconciliar) tampoco degrada una factura pagada con evidencia | `estados.regresion.ts → estados.test.ts` | ❌ | ❌ | ✅ |
| 10 | `F11-bulkFacturas-duplica` — la migración no crea una segunda factura de agosto para la casa 101 si ya la subió la web | `importacion.regresion.ts → importacion.test.ts` | ❌ | ❌ | ✅ |
| 11 | `F11-bulkFacturas-resetea-estado` — re-ejecutar la migración no devuelve a 'pendiente' una factura pagada | `importacion.regresion.ts → importacion.test.ts` | ❌ | ❌ | ✅ |
| 12 | `F11-upsertFactura-resetea-estado` — la importación por script (upsertFactura) no devuelve a 'pendiente' una factura pagada | `importacion.regresion.ts → importacion.test.ts` | ❌ | ❌ | ✅ |
| 17 | `F09-hueco-de-periodo` — agosto → [septiembre sin cargar] → octubre: el saldo de octubre no basta para juzgar agosto | `importacion.regresion.ts → importacion.test.ts` | ❌ | ❌ | ✅ |
| 21 | `F13-pago-parcial-marcado-pagada` — $250.000 aprobados sobre $300.000 dejan un saldo de $50.000: agosto no puede quedar 'pagada' | `pagos.regresion.ts` | ❌ | ❌ | ✅ |
| 23 | `F02-conciliacion-sobrescribe-pago (Caso A)` — la contabilidad cortó antes de aplicar el abono y septiembre arrastra $300.000: agosto no puede quedar 'vencida' con $250.000 aprobados | `pagos.regresion.ts` | ❌ | ❌ | ✅ |
| 33 | `F06-descuento-vencido` — el 8 de octubre (fecha del pago QA real) se cobra $380.000, no $340.000 | `pagos.regresion.ts` | ❌ | ❌ | ✅ |

#### Los 33 controles de la Fase 0

| # | Prueba | Archivo | Fase 0 | Antes | Después |
|---|---|---|---|---|---|
| 1 | `F02-control` — un pago aprobado sin factura siguiente deja la factura 'pagada' | `estados.regresion.ts → estados.test.ts` | ✅ | ✅ | ✅ |
| 6 | `F02-control` — un 'pagada' INFERIDO (sin evidencia) sí se corrige si se vuelve a subir el PDF siguiente corregido | `estados.regresion.ts → estados.test.ts` | ✅ | ✅ | ✅ |
| 7 | `F11-control` — subir el lote A dos veces ('solo nuevas') no duplica ni cambia estados | `importacion.regresion.ts → importacion.test.ts` | ✅ | ✅ | ✅ |
| 8 | `F11-control` — re-subir agosto y septiembre con 'actualizar' no duplica y conserva lo que dedujo la conciliación | `importacion.regresion.ts → importacion.test.ts` | ✅ | ✅ | ✅ |
| 9 | `F11-control` — volver a subir agosto (con 'actualizar') no deshace un pago aprobado | `importacion.regresion.ts → importacion.test.ts` | ✅ | ✅ | ✅ |
| 15 | `F07-control` — si la etiqueta del documento ('Septiembre / 2026') coincide con el período, se guarda | `importacion.regresion.ts → importacion.test.ts` | ✅ | ✅ | ✅ |
| 16 | `F07-control` — si la etiqueta del documento ('01-septiembre-2026') coincide con el período, se guarda | `importacion.regresion.ts → importacion.test.ts` | ✅ | ✅ | ✅ |
| 18 | `F09-control` — con saldo anterior 0 en octubre, agosto no queda vencida ni abonada | `importacion.regresion.ts → importacion.test.ts` | ✅ | ✅ | ✅ |
| 20 | `F04-control` — con la lectura correcta (la de la fila Totales), la misma regla deja agosto en 'saldo_a_favor' | `importacion.regresion.ts → importacion.test.ts` | ✅ | ✅ | ✅ |
| 22 | `F02-control` — septiembre trae los $50.000: agosto queda abonada (no vencida) y el pago sigue aprobado y ligado | `pagos.regresion.ts` | ✅ | ✅ | ✅ |
| 25 | `F01-control (Caso C)` — septiembre, la vigente, sí se puede pagar y por $350.000 | `pagos.regresion.ts` | ✅ | ✅ | ✅ |
| 31 | `F01-control` — la vigente (septiembre) sí se acepta, por su total acumulado | `pagos.regresion.ts` | ✅ | ✅ | ✅ |
| 32 | `F01-control` — una factura pagada se sigue rechazando | `pagos.regresion.ts` | ✅ | ✅ | ✅ |
| 34 | `F06-control` — el 10 de septiembre (dentro del 1–15) se cobra con descuento: $340.000 | `pagos.regresion.ts` | ✅ | ✅ | ✅ |
| 35 | `F06-control` — el 20 de octubre (después del vencimiento guardado) se cobra $380.000 | `pagos.regresion.ts` | ✅ | ✅ | ✅ |
| 37 | `F20-control` — la dueña de la factura sí ve su pago | `pagos.regresion.ts` | ✅ | ✅ | ✅ |
| 38 | `F08-control` — un reporte del carro es un cobro pendiente por la tarifa del carro | `parqueadero.regresion.ts` | ✅ | ✅ | ✅ |
| 39 | `F08-control` — dos carros distintos de la misma casa en el mismo mes son dos cobros (la identidad es casa + vehículo + período) | `parqueadero.regresion.ts` | ✅ | ✅ | ✅ |
| 43 | `F10-control` — un mes con $7.000 de aporte suma $7.000 | `parqueadero.regresion.ts` | ✅ | ✅ | ✅ |
| 46 | `F03-control` — la carga reproduce los estados de producción: abril y junio 'vencida', mayo/julio/agosto 'pagada', septiembre 'pendiente' | `residente.regresion.ts` | ✅ | ✅ | ✅ |
| 47 | `F03-control` — la cartera de la administración la ve 'pendiente', sin mora, debiendo solo septiembre ($289.000) | `residente.regresion.ts` | ✅ | ✅ | ✅ |
| 50 | `F01-control` — con la vigente pendiente, el bot ofrece la vigente | `residente.regresion.ts` | ✅ | ✅ | ✅ |
| 53 | `F16-control` — la propietaria ve sus dos facturas, una vez cada una | `residente.regresion.ts` | ✅ | ✅ | ✅ |
| 56 | `F04-control` — cdc-control: total, descuento, saldo anterior (filas de marzo) y cargos del mes (filas de abril) coinciden con el documento | `parserFacturas.test.mjs` | ✅ | ✅ | ✅ |
| 64 | `F04-control (Caso E)` — cdc-control.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ✅ | ✅ | ✅ |
| 71 | `F04-control (Caso E)` — arboleda-control.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ✅ | ✅ | ✅ |
| 73 | `F15-control` — arboleda-control: período '01-junio-2026' y total $15.760 | `parserFacturas.test.mjs` | ✅ | ✅ | ✅ |
| 74 | `F15-control` — el saldo a favor de $376.000 se reconoce en saldoAFavor | `parserFacturas.test.mjs` | ✅ | ✅ | ✅ |
| 81 | `F03-control` — septiembre sin pagar y sin vencer, sin historial vencido: 'Pendiente' | `resumenResidente.test.mjs` | ✅ | ✅ | ✅ |
| 82 | `F03-control` — todo pagado: 'Al día' y ningún botón de pagar | `resumenResidente.test.mjs` | ✅ | ✅ | ✅ |
| 86 | `F01-control` — con septiembre sin pagar, los únicos botones 'Pagar' son de septiembre (la vigente) | `resumenResidente.test.mjs` | ✅ | ✅ | ✅ |
| 88 | `F03-control (inicio)` — septiembre sin pagar y sin vencer, sin historial vencido: tarjeta de pendiente, no roja | `resumenResidente.test.mjs` | ✅ | ✅ | ✅ |
| 91 | `F03-control (inicio)` — todo pagado: 'Estás al día' | `resumenResidente.test.mjs` | ✅ | ✅ | ✅ |

#### Las 18 pruebas de la Fase 1

| # | Prueba | Archivo | Fase 0 | Antes | Después |
|---|---|---|---|---|---|
| 24 | `F01-factura-historica-doble-pago (Caso C)` — tras cargar septiembre, el residente no puede iniciar otro pago de agosto (web ni WhatsApp) | `pagos.regresion.ts` | ❌ | ✅ | ✅ |
| 26 | `F01-factura-historica-doble-pago (Caso B)` — cuando la vigente queda pagada, la absorbida no vuelve a ser pagable | `pagos.regresion.ts` | ❌ | ✅ | ✅ |
| 27 | `F03-cartera-mora-tras-pago (Caso B)` — la cartera de la administración debe ver la casa al día después de pagar septiembre | `pagos.regresion.ts` | ❌ | ✅ | ✅ |
| 28 | `F01-armarDatosTrn-no-vigente` — agosto (vencida) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts` | ❌ | ✅ | ✅ |
| 29 | `F01-armarDatosTrn-no-vigente` — agosto (abonada) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts` | ❌ | ✅ | ✅ |
| 30 | `F01-armarDatosTrn-no-vigente` — agosto (pendiente) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts` | ❌ | ✅ | ✅ |
| 48 | `F03-navBadges-historial` — el contador de vencidas no cuenta abril y junio, ya saldadas | `residente.regresion.ts` | ❌ | ✅ | ✅ |
| 49 | `F03-navBadges-mora-actual` — si la factura vigente ya venció, el contador sí la cuenta | `residente.regresion.ts` | ❌ | ✅ | ✅ |
| 51 | `F01-bot-ofrece-absorbida` — si la vigente ya está pagada, el bot no ofrece pagar la absorbida | `residente.regresion.ts` | ❌ | ✅ | ✅ |
| 52 | `F12-bot-elige-por-orden-de-carga` — el bot elige la factura por período, no por la última que se subió | `residente.regresion.ts` | ❌ | ✅ | ✅ |
| 77 | `F07-subida-sin-sesion` — sin sesión, /api/facturas/upload rechaza la petición y no escribe en S3 | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 80 | `F03-historial-como-mora` — la casa del PQRS (abril y junio vencidas pero ya saldadas, septiembre aún no vence) se ve 'Pendiente', no 'Vencida' | `resumenResidente.test.mjs` | ❌ | ✅ | ✅ |
| 83 | `F03-mora-actual-oculta` — el 20 de octubre septiembre ya venció sin pagarse: la casa está en mora y debe verse 'Vencida' | `resumenResidente.test.mjs` | ❌ | ✅ | ✅ |
| 84 | `F03-historial-como-mora (Caso B)` — con septiembre pagada, la casa se ve 'Al día' aunque agosto haya quedado vencida | `resumenResidente.test.mjs` | ❌ | ✅ | ✅ |
| 85 | `F01-web-ofrece-absorbida (Casos B y C)` — con septiembre pagada, 'Mis facturas' no ofrece pagar agosto ($366.113 que ya iban en septiembre) | `resumenResidente.test.mjs` | ❌ | ✅ | ✅ |
| 87 | `F03-historial-como-mora (inicio)` — la casa del PQRS no se pinta en rojo de 'vencida': solo debe septiembre, que aún no vence | `resumenResidente.test.mjs` | ❌ | ✅ | ✅ |
| 89 | `F03-mora-actual-oculta (inicio)` — el 20 de octubre, con septiembre vencida sin pagar, la tarjeta sí debe estar en rojo | `resumenResidente.test.mjs` | ❌ | ✅ | ✅ |
| 90 | `F01-inicio-ofrece-absorbida (Caso B)` — con septiembre pagada, el inicio dice 'Estás al día', no 'Total pendiente: $366.113' | `resumenResidente.test.mjs` | ❌ | ✅ | ✅ |

#### Las 21 pruebas de la Fase 2

| # | Prueba | Archivo | Fase 0 | Antes | Después |
|---|---|---|---|---|---|
| 13 | `F07-periodo-contradice-documento` — un documento de 'Octubre / 2026' no queda guardado en silencio como 2026-09 | `importacion.regresion.ts → importacion.test.ts` | ❌ | ✅ | ✅ |
| 14 | `F07-periodo-contradice-documento` — un documento de '01-octubre-2026' no queda guardado en silencio como 2026-09 | `importacion.regresion.ts → importacion.test.ts` | ❌ | ✅ | ✅ |
| 19 | `F04-saldo-a-favor-leido-como-deuda` — con la lectura actual, agosto (a favor $262.000) no puede quedar 'vencida' | `importacion.regresion.ts → importacion.test.ts` | ❌ | ✅ | ✅ |
| 57 | `F04-cdc-total-negativo (Caso A)` — 'Pague sin descuento $-400.000' (anticipo) no se lee como $0 | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 58 | `F04-cdc-total-negativo (Caso A)` — agosto real de una casa con $262.000 a favor no se lee como $0 | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 59 | `F04-cdc-creditos (Caso B)` — la fila 'CI ANTICIPO DE CLIENTE' ($-760.000) no se ignora | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 60 | `F04-cdc-creditos (Caso B)` — la fila 'NCC NOTA CREDITO CLIENTE' ($-270.000) no se ignora: saldo anterior $-86.000, no $184.000 | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 61 | `F04-cdc-varias-filas (Caso C)` — con filas de abril, de mayo y un crédito, separa saldo anterior, cargos del mes y total | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 62 | `F04-saldo-anterior-fantasma` — septiembre vigente de una casa real: el saldo anterior es $-262.000 (a favor), no $+335.000 | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 63 | `F04-pdf-sin-lineas (Caso D)` — una página sin filas de conceptos no sale como factura válida sin advertencia | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 65 | `F04-cuadre (Caso E)` — cdc-anticipo-total-negativo.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 66 | `F04-cuadre (Caso E)` — cdc-nota-credito.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 67 | `F04-cuadre (Caso E)` — cdc-agosto-saldo-a-favor.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 68 | `F04-cuadre (Caso E)` — cdc-septiembre-saldo-anterior-negativo.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 69 | `F04-cuadre (Caso E)` — cdc-filas-incompletas.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 70 | `F04-cuadre (Caso E)` — cdc-pagina-sin-filas.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 72 | `F04-cuadre (Caso E)` — arboleda-saldo-a-favor.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 75 | `F15-arboleda-total-entre-parentesis` — 'TOTAL A PAGAR $(376,000)' se lee como $-376.000, no como $0 | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 76 | `F15-arboleda-periodo` — el período de septiembre es '01-septiembre-2026', no el texto de la línea siguiente | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 78 | `F07-s3-antes-de-confirmar` — leer un PDF para la vista previa no publica nada en S3 | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |
| 79 | `F07-s3-sobrescribe` — dos lecturas del mismo período y la misma casa no reutilizan la misma llave de S3 | `parserFacturas.test.mjs` | ❌ | ✅ | ✅ |

#### Las 8 de la Fase 4, que siguen fallando

| # | Prueba | Archivo | Fase 0 | Antes | Después | Mismo fallo |
|---|---|---|---|---|---|---|
| 36 | `F20-listPorFactura-sin-control` — el vecino de la 202 no puede listar los pagos de la factura de la 101 | `pagos.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 40 | `F08-reportes-duplican-cobro` — tres reportes del mismo carro en septiembre son UN cobro de $7.000, no tres | `parqueadero.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 41 | `F08-estados-paralelos` — marcarlo 'cobrada' en Vigilancia no lo deja 'pendiente' en Cobros de parqueadero | `parqueadero.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 42 | `F08-refacturar` — un cargo ya facturado en octubre no se puede volver a facturar en noviembre | `parqueadero.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 44 | `F10-aporte-suma-arrastre` — agosto y septiembre con $7.000 de aporte cada uno suman $14.000, no $21.000 | `parqueadero.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 45 | `F10-aporte-concepto-equivocado` — el código 5 de Arboleda ('Parqueadero visitante') no es aporte voluntario | `parqueadero.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 54 | `F16-listMia-duplica` — un vínculo repetido a la misma casa no repite las facturas | `residente.regresion.ts` | ❌ | ❌ | ❌ | sí (*) |
| 55 | `F16-listMia-vigencia` — un arrendatario cuyo contrato venció ya no ve las facturas de la casa | `residente.regresion.ts` | ❌ | ❌ | ❌ | sí (*) |

(*) **#54 y #55: mismo fallo, otra vista previa.** La aserción y los valores son los mismos:
- #54: "cada factura aparece dos veces: … to have a length of 2 but got 4";
- #55: "… to have a length of +0 but got 2".

Solo cambia cómo vitest resume cada factura en el mensaje: `{ …(22) }` antes, `{ …(23) }` y `{ …(24) }` ahora. Es porque `listMia` devuelve la factura completa, y ahora trae los campos de la Fase 3 (`origen`, `veredictoContable`). Normalizando esa vista previa, los 8 mensajes son idénticos.

### 13.3 Cambios en pruebas existentes

- **Fase 0:**
  - `estados.regresion.ts` → `estados.test.ts` e `importacion.regresion.ts` → `importacion.test.ts`, por la convención de la Fase 0 (§2): quedaron completamente en verde. **El contenido no cambió** (mismo SHA-1). Se movieron con `mv`, sin *staging*.
  - Ningún otro archivo de la Fase 0 se tocó.
- **Fase 2:** `reproceso.test.ts`, prueba "una factura con un comprobante aprobado tampoco, ni siquiera por la conciliación".
  - Subía el comprobante de **agosto** con `soportesPago.crearMio`, cuando septiembre ya existía.
  - El PASO 6 exige que un comprobante solo vaya a la factura vigente, y `crearMio` ahora lo rechaza.
  - **Cambio:** el comprobante entra como uno subido antes de la Fase 3 (`pendiente_revision`, insertado) y la administración lo aprueba con `aprobar`. Lo que la prueba protege —el re-procesamiento no toca una factura con un comprobante aprobado— no cambió. El cambio va comentado en el archivo.
- **Web:** `test:facturacion` encadena `confirmarFacturasFase3.test.mjs` en su propio proceso, porque simula S3 y la sesión a su manera.

### 13.4 Pruebas nuevas (74)

| Suite | Archivo | Qué prueban |
|---|---|---|
| Unitarias (29) | `packages/backend/pruebas/estadoFactura.prueba.ts` | · **Función del estado:** todas las combinaciones de carga, evidencia y veredicto. <br>· **Evidencia:** abono, suma de pagos, excedente, tolerancia de $1, descuento dentro y fuera del plazo, comprobante sin monto. <br>· **Pares:** consecutivos, diciembre → enero, hueco sin veredicto, hueco con saldo en $0. <br>· **Discrepancias:** definición, #22 no lo es, hueco y revisión no se juzgan, documento posterior. <br>· **Cadena:** abre y marca la vigente; se resuelve con el documento corregido; pago reversado; resolución de la administración respetada y reabierta; heredado; sin heredar si hubo evidencia; mes faltante. <br>· **Cartera:** pago en verificación y mes faltante. <br>· **Cobro:** motivo y mensaje. <br>· **Descuento:** día 15, fecha del documento, sin descuento. <br>· **Vencimiento:** fin de mes, febrero bisiesto, mora desde el día siguiente. <br>· Montos escritos y `AVAL_AMBIENTE` |
| convex-test (30) | `packages/backend/pruebas/facturacion/modeloPagos.test.ts` | · **Bitácora** por ruta: carga, conciliación, pago, comprobante, confirmación, "Conciliar", migración, script, re-procesamiento. <br>· **Discrepancias:** registro; no pagable; no hay mora el 20 de octubre; campana; se resuelve sola con el documento corregido y con el posterior; manual con nota y permisos, sin reabrirse; #22 no lo es. <br>· **Monto:** abono más pago; aviso una sola vez; excedente en Finanzas; descuento dentro y fuera del plazo; reverso. <br>· **Re-consulta diaria** con Aval simulado. <br>· **Comprobantes:** con monto, sin monto, sobre una histórica (app y bot), sin factura. <br>· **Escritura única** desde las cuatro rutas; manual seguida del PDF; documentos repetidos. <br>· **Operación segura:** `AVAL_AMBIENTE` ausente; `limpieza`; `pagosPruebas` sin marca, en producción y marcado; `esPrueba`. <br>· **Lectura sin total:** exige el total, coincide, corrige. <br>· Idempotencia con el modo; meses faltantes; `documento_distinto` |
| Web (4) | `apps/web/pruebas/confirmarFacturasFase3.test.mjs` | Vencimiento a fin de mes y plazo del descuento del documento; sin descuento, sin plazo; dos documentos de una unidad no se guardan ni se publican, y quedan registrados |
| Web (7) | `apps/web/pruebas/facturacion/fase3Residente.test.mjs` | Páginas reales: <br>· "pago en verificación" en "Mis facturas" y el inicio, sin "Pagar" ni "Vencida"; <br>· descuento con su fecha (10 de septiembre, 8 de octubre, "Mis facturas"); <br>· emparejamiento de identificadores repetidos |
| Móvil (4) | `apps/mobile/pruebas/fase3Facturas.prueba.ts` | Tarjeta "Pago en verificación"; estado visible; lo por pagar con descuento hasta el 15; `descuentoDe` |

---

## 14. Impacto sobre los datos reales (PASO 16)

**No se escribió nada.** Es una simulación local sobre la exportación de solo lectura del 2026-10-08 (2.792 facturas, 379 unidades, 3 conjuntos, 2 pagos `fallida` en QA, 0 comprobantes, 0 importaciones) y el corpus de la Fase 2.

- **Mismo código** que el backend: `calcularCadena`, `planificarReproceso` y `carteraDeUnidad` del *working tree*. Las reglas de la Fase 2 se tomaron de `HEAD`.
- **Momento:** `ahora` = 2026-10-08 12:00 (Bogotá).
- **Unidades de prueba aparte:** CDC 999 y Arboleda 9999 (Anexo P1). Quedan 377.

| Pregunta | Respuesta |
|---|---|
| **Evidencia de pago** | **0** pagos aprobados y **0** comprobantes, así que **0 discrepancias**. Los 2 pagos son `fallida` (QA) |
| **Estado de cada unidad, hoy, al desplegar y "Conciliar"** | **No cambia ninguna** (CDC: 161 pendientes · 39 en mora · 5 al día; Arboleda: 122 · 44 · 6). Cambian **92 facturas históricas** (Anexo H2): 87 juzgadas a través de un mes faltante quedan sin veredicto (CDC 45 abonada y 19 vencida; Arboleda 10 y 13) y 5 de Arboleda de septiembre en $0 con saldo a favor pasan a saldo a favor (Fase 2, R4.1). Estado `heredado`: **0** |
| **Huecos** (Anexo H1) | **CDC, junio → agosto: 194 unidades** (falta julio entero; 58 quedan sin veredicto y 136 se juzgan con saldo en $0). **Arboleda, abril → junio: 27** (falta mayo; 23 sin veredicto y 4 con saldo en $0). Además, CDC mayo → agosto (7), junio → septiembre (4), febrero → abril (2) y enero → marzo (2); Arboleda mayo → julio (2) y abril → julio (2) |
| **Fecha del descuento** (Anexo D) | 1.556 facturas de CDC con descuento: **todas** usan hoy la regla del día 15 (0 con la fecha guardada). Su documento dice día 15 en **1.621 de 1.621**. Arboleda: sin descuento. Cobro de hoy: **197** vigentes pasan de $X − 40.000 a $X (§8.1) |
| **Mora** (§11, Anexo M1) | La alternativa pone en mora a **68** unidades más hoy (CDC 27 · Arboleda 41) y a **73** en el escenario B |
| **Vencimiento** (§8.2, Anexo V1) | Re-fechar lo existente a fin de mes: **290** unidades pasan hoy a "En mora". Lo nuevo: una ventana de 8 a 16 días por mes en la que entre el 74 % y el 84 % de las unidades se verían en mora sin estarlo |
| **Escenario B de la Fase 2, recalculado** (Anexo B1) | Estado del residente: CDC 168 pendientes · 32 en mora · 5 al día (Fase 2: 167 · 32 · 6); Arboleda sin cambios (122 · 44 · 6). **La única unidad distinta es CDC 802**: la Fase 2 la llevaba a "al día" con el documento equivocado; la Fase 3 lo omite (`documento_distinto`) y sigue "Pendiente" con $342.000, su cuenta regular. **70 facturas** quedan distinto que en la Fase 2: las juzgadas a través de un hueco (68), CDC 716 mayo (saldo a favor y sin veredicto, no `vencida`) y CDC 802 septiembre (omitida) |

Los anexos van al final (H, B, M, V, D y P).

---

## 15. Orden de despliegue y compatibilidad

**Estado de partida.** El prompt dice que la Fase 2 no está desplegada. El deployment muestra que **su esquema y su backend sí** (§2.2). No se sabe si la web de la Fase 2 está publicada. Esta fase **no desplegó nada**.

1. **Antes de desplegar:**
   - confirmar a qué deployment se despliega (la deploy key de `.env.local` apunta al de los residentes, de tipo `dev`) y que `AVAL_AMBIENTE` sigue definido (hoy `qa`);
   - decidir el vencimiento (§8.2).
2. **Backend primero.** El esquema es aditivo:
   - campos opcionales, dos tablas e índices nuevos (el compuesto de facturas se construye sobre 2.792 documentos) y un literal nuevo en `pagos.estado`;
   - todo documento existente sigue siendo válido;
   - las firmas nuevas solo agregan argumentos opcionales (`crearMio`, `crearDesdeBot`, `aprobar`, `confirmarLectura`, `finalizarImportacion`), así que **la web y el móvil viejos siguen funcionando** contra el backend nuevo.
3. **Web después**, en seguida. Las pantallas nuevas de Finanzas llaman funciones que solo existen en el backend nuevo.
4. **Después de desplegar, nada cambia hasta que algo recalcule.** Los estados se recalculan por unidad con la próxima carga, pago, comprobante o "Conciliar".
   - Pulsar "Conciliar" cambia las 92 facturas del Anexo H2 y escribe sus eventos.
   - **Es una escritura sobre datos reales:** la decide la administración.
   - El re-procesamiento de la Fase 2 sigue sin aplicar y requiere autorización.

| Combinación | Qué pasa |
|---|---|
| Backend nuevo + web vieja | Funciona. La web vieja anuncia el descuento hasta el vencimiento, pero la pasarela ya cobra el monto correcto: entre el 16 y el 15 del mes siguiente el residente vería un monto menor que el que se le cobra. Desplegar la web en seguida |
| Backend nuevo + móvil viejo | Funciona. "Ya pagué" sin monto: la administración lo escribe al aprobar. El móvil viejo no conoce "pago en verificación": muestra el estado guardado, pero "Pagar" lo decide `puedePagar`, que dice que no |
| Backend viejo + web nueva | No: las consultas nuevas de Finanzas no existen. No desplegar la web antes |
| Bot y agente | Van con el backend |
| Pagos en curso al desplegar | Siguen: `consultarEstado` es el mismo. Un pago aprobado a partir de ahí se evalúa por monto |

---

## 16. Riesgos pendientes

| Riesgo | Detalle | Fase |
|---|---|---|
| **Vencimiento a fin de mes** | Ventana de "falsa mora" entre el día 1 y la carga del PDF siguiente (§8.2): hasta 16 días al mes, para la mayoría de las unidades | Decisión |
| **Pasarela en QA** | `AVAL_AMBIENTE=qa` en el deployment de los residentes. Un pago aprobado en QA cuenta como evidencia y no movió plata. Hoy hay 0. `pagosPruebas` los puede quitar | Operación |
| **S3 público** (heredado) | Los PDF de facturas se sirven públicos y con llaves predecibles. Las unidades de prueba tienen documentos personales ajenos | Trabajo aparte |
| **Deployment de tipo dev** (heredado) | El que usan los residentes. Un `convex dev` con el `.env.local` del repositorio sube código ahí | Trabajo aparte |
| **Versiones viejas del móvil con el portal del banco** (heredado) | Abren el portal del convenio (`avalPortalUrl`), que cobra lo que el banco dice, sin las reglas de Vekino | Fase 4 |
| **Pagos por fuera de Vekino** | No se ven hasta el PDF siguiente. Confunden la resolución automática por documento posterior (§5) | F-05 |
| **Reversos** | Aval no documenta cómo los reporta. Hoy se reversa a mano (`reversarPago`) | F-05 / Aval |
| **CDC 802** | La cuenta Nro. 0 (−$103.400) no está en Vekino. ¿Es un saldo a favor real de la casa? | Contabilidad |
| **Meses faltantes** | CDC julio y Arboleda mayo: mientras falten, esos meses no se juzgan | Administración |
| **Comprobantes sin monto** | De apps viejas o de la API: se toman como pago completo (`montoAsumido`) | — |
| **Discrepancias abiertas** | Bloquean el pago en línea de la vigente hasta resolverse. Es a propósito; requiere que Finanzas las revise | Operación |

---

## 17. Recomendación para la Fase 4

1. **F-08, F-10, F-16 y F-20** (sus 8 pruebas): cobros de parqueadero, aporte voluntario, `listMia` y `listPorFactura`.
2. **Recaudo (F-05):** con una muestra real del archivo del convenio, implementar el diseño de §12. Es lo que hace confiable el vencimiento a fin de mes y cierra discrepancias sin esperar al mes siguiente.
3. **Vencimiento:** si se mantiene a fin de mes, decidir cómo se trata la ventana (§8.2) antes de la primera carga de octubre. Y decidir si se re-fechan las facturas existentes (290 unidades cambiarían hoy).
4. **Aplicar, con autorización**, el re-procesamiento de la Fase 2 (escenario B), que con las reglas nuevas ya no toca CDC 802, y cargar los meses faltantes.
5. **Reversos:** pedirle a Aval la especificación y conectarla a `reversarPago`.
6. Fuera de la facturación: S3 privado y un deployment de producción separado.

---

## 18. Anexo de comandos (todos de solo lectura)

| Para qué | Comando |
|---|---|
| Base | `git status`, `git log --oneline` |
| Datos | `bunx convex data <tabla> --format jsonl` (facturas, unidades, condominios, pagos, soportesPago, usuarioUnidad, importaciones, pqrs), hacia el scratchpad |
| Variable | `bunx convex env get AVAL_AMBIENTE`, clasificada sin imprimirla (`qa` / `prod` / sin definir) |
| S3 | `GET` anónimo del PDF publicado de CDC 802 de septiembre y cabeceras (`Last-Modified`) de los 922 PDF publicados (ya conocidos por la Fase 2) |
| Pruebas | `bun run test:facturacion`, `test:unit` y `test:seguridad` (backend); `bun run test:facturacion` y `bun run test` (web); `bun run test` (móvil); `tsc --noEmit` en los tres paquetes; reportes JSON y JUnit para el cruce |
| Análisis | Scripts en el scratchpad (nunca en el repositorio): <br>· frases de plazo del corpus (solo números); <br>· consecutivo por unidad; <br>· cruce documento contra lo guardado; <br>· impacto de la Fase 3 (`impacto-fase3.ts`), con las reglas de `HEAD` y las del *working tree*; <br>· anexos; <br>· cruce #1–#91. <br>Salidas: solo ids, unidades, períodos y montos |

Nada se escribió en Convex ni en S3, y no hubo llamadas a Aval: las pruebas corren con la red bloqueada y sin `AVAL_AMBIENTE`.

---

## Anexos — Impacto sobre los datos reales (PASO 16)

Simulación local, sin escribir (§14). Sin nombres: unidades, ids de Convex, períodos, estados y montos. `ahora` = 2026-10-08 12:00 (Bogotá). Las unidades de prueba van aparte (P1).

### H1. Huecos de período, por grupo (sin unidades de prueba)

| Conjunto | Hueco | Unidades | Factura juzgada a través del hueco: veredicto con las reglas nuevas |
|---|---|---|---|
| CDC | 2026-06 → 2026-08 (falta 2026-07) | 194 | 58 sin veredicto · 136 pagada (saldo anterior en $0) |
| Arboleda | 2026-04 → 2026-06 (falta 2026-05) | 27 | 23 sin veredicto · 4 pagada (saldo anterior en $0) |
| CDC | 2026-05 → 2026-08 (falta 2026-06, 2026-07) | 7 | 2 sin veredicto · 5 pagada (saldo anterior en $0) |
| CDC | 2026-06 → 2026-09 (falta 2026-07, 2026-08) | 4 | 4 pagada (saldo anterior en $0) |
| Arboleda | 2026-05 → 2026-07 (falta 2026-06) | 2 | 2 pagada (saldo anterior en $0) |
| Arboleda | 2026-04 → 2026-07 (falta 2026-05, 2026-06) | 2 | 2 pagada (saldo anterior en $0) |
| CDC | 2026-02 → 2026-04 (falta 2026-03) | 2 | 2 sin veredicto |
| CDC | 2026-01 → 2026-03 (falta 2026-02) | 2 | 2 sin veredicto |

### H2. Facturas cuyo estado cambia con las reglas nuevas, sobre lo guardado hoy (92)

Lo que haría el botón "Conciliar" (o la próxima carga de esa unidad) después de desplegar. Ninguna cambia el estado de la unidad.

| # | Conjunto | Unidad | Factura | Período | Total | Estado hoy → nuevo | Por qué |
|---|---|---|---|---|---|---|---|
| 1 | Arboleda | T-I 502 | FAC-2026-04-0072 `js7bqzwh0gtepv694wydkh9ca18at087` | 2026-04 | $2.098.261 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 2 | Arboleda | T-I 504 | FAC-2026-04-0100 `js74n71a1yfqegqn8jjf4t709h8avetg` | 2026-04 | $1.387.984 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 3 | Arboleda | T-I 604 | FAC-2026-04-0091 `js71fbbfqtg84f33eetf9p67px8at17g` | 2026-04 | $635.050 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 4 | Arboleda | T-I 701 | FAC-2026-04-0071 `js78sc20e4j1sqd53v18vyrvjx8avajb` | 2026-04 | $3.132.101 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 5 | Arboleda | T-I 901 | FAC-2026-09-0068 `js73bg1a31tms8kp8by3q69j6s8eh9jd` | 2026-09 | $0 | pendiente → **saldo a favor** | su documento: total negativo o en $0 con saldo a favor |
| 6 | Arboleda | T-I 1003 | FAC-2026-04-0022 `js78vk5fg0k1mb5zawepdcdzj98atw20` | 2026-04 | $635.050 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 7 | Arboleda | T-I 1101 | FAC-2026-04-0121 `js7fpmv014yrm5jfhm6qyyw4f58atnan` | 2026-04 | $1.553.642 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 8 | Arboleda | T-II 302 | FAC-2026-09-0100 `js76ecqge1qm1andv8t578djgh8egmy4` | 2026-09 | $0 | pendiente → **saldo a favor** | su documento: total negativo o en $0 con saldo a favor |
| 9 | Arboleda | T-II 501 | FAC-2026-04-0099 `js79trrntae9r96w0jhhb2rm798av5b4` | 2026-04 | $772.429 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 10 | Arboleda | T-II 604 | FAC-2026-09-0001 `js7b3qc0k3sy8mzbc5s7ccarcs8eg3rz` | 2026-09 | $0 | pendiente → **saldo a favor** | su documento: total negativo o en $0 con saldo a favor |
| 11 | Arboleda | T-II 902 | FAC-2026-09-0105 `js7316tymssvwcdq9zr7fj0br98egkzw` | 2026-09 | $0 | pendiente → **saldo a favor** | su documento: total negativo o en $0 con saldo a favor |
| 12 | Arboleda | T-II 1003 | FAC-2026-04-0043 `js76gb0d9pj6tv8h4haxr5kb1n8atgeg` | 2026-04 | $1.624.740 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 13 | Arboleda | T-II 1101 | FAC-2026-04-0135 `js75d8k0088fjy7nts170gaq5s8avzt8` | 2026-04 | $450.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 14 | Arboleda | T-III 103 | FAC-2026-04-0042 `js74399p8q4qyasn61phekp4g58atce1` | 2026-04 | $1.306.467 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 15 | Arboleda | T-III 301 | FAC-2026-04-0123 `js760qmmqy2rkk1rxjvn0epded8atwak` | 2026-04 | $409.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 16 | Arboleda | T-III 302 | FAC-2026-04-0087 `js75ba4dewmdb4mp4gynzkwgy18at5gh` | 2026-04 | $1.549.652 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 17 | Arboleda | T-III 304 | FAC-2026-04-0075 `js767zrbgd3dg335r2ym7bq6eh8ata0n` | 2026-04 | $2.293.601 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 18 | Arboleda | T-III 702 | FAC-2026-04-0085 `js76fpbeptk5aznjg60aa63cnh8athmz` | 2026-04 | $419.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 19 | Arboleda | T-III 702 | FAC-2026-09-0085 `js74ggbcym5pp94tzxyb9hahzh8egyvy` | 2026-09 | $0 | pendiente → **saldo a favor** | su documento: total negativo o en $0 con saldo a favor |
| 20 | Arboleda | T-III 801 | FAC-2026-04-0086 `js70wnqc3ynktcww18awfszx1x8avr5t` | 2026-04 | $4.856.522 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 21 | Arboleda | T-III 1003 | FAC-2026-04-0054 `js7exs9a2pn6bq98bd93b4q1ns8at2p4` | 2026-04 | $635.050 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 22 | Arboleda | T-III 1101 | FAC-2026-04-0037 `js7f8mjbsh3hg3b65kf1vhtjqs8at3m4` | 2026-04 | $1.269.963 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 23 | Arboleda | T-III 1102 | FAC-2026-04-0013 `js763vkre7rmnrs4dwgqsjped98attd1` | 2026-04 | $2.150.463 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 24 | Arboleda | T-IV 203 | FAC-2026-04-0031 `js7dspjj40yf28n31h65fdvcv18av99c` | 2026-04 | $4.896.276 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 25 | Arboleda | T-IV 703 | FAC-2026-04-0119 `js7ba3ypj49jm2svn3xzf4h3r58av7rc` | 2026-04 | $911.922 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 26 | Arboleda | T-IV 803 | FAC-2026-04-0036 `js7b8znn13zmdq7cazrs0nkwqs8athar` | 2026-04 | $890.201 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 27 | Arboleda | T-IV 1004 | FAC-2026-04-0139 `js70zd0dxybbw52r0zynfnmbqn8avp9c` | 2026-04 | $664.648 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 28 | Arboleda | T-IV 1104 | FAC-2026-04-0155 `js78t883jd3s7519rrq7dsq55x8at80t` | 2026-04 | $1.395.289 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 29 | CDC | 102 | FAC-2026-06-0002 `js79mym6d2r7e7m1pc0vr5jz958avnt7` | 2026-06 | $365.850 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 30 | CDC | 104 | FAC-2026-06-0004 `js72t62327nvynatz91b3fw9an8atq8x` | 2026-06 | $720.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 31 | CDC | 105 | FAC-2026-02-0172 `js7ce19tfxhkjpppb0a243p6th8att3m` | 2026-02 | $3.693.200 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 32 | CDC | 105 | FAC-2026-06-0005 `js71s42sm7qph0n7pdkey9nvvx8avks4` | 2026-06 | $1.340.500 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 33 | CDC | 108 | FAC-2026-06-0008 `js7942sk2z5yjb2ag5mafwj49x8at1rv` | 2026-06 | $360.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 34 | CDC | 109 | FAC-2026-06-0009 `js7e5e7y83hefrwk8164rdt2558atwgk` | 2026-06 | $1.391.800 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 35 | CDC | 110 | FAC-2026-06-0010 `js7f2g7ga74ddtq1eewqjy1x2n8ataxv` | 2026-06 | $976.600 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 36 | CDC | 111 | FAC-2026-02-0174 `js702tw7mnd9x25sgfbvqa93b58avv1h` | 2026-02 | $15.074.950 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 37 | CDC | 111 | FAC-2026-06-0011 `js78yhjdxq1d4ax36dvkeqq6p98ataby` | 2026-06 | $15.364.150 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 38 | CDC | 112 | FAC-2026-06-0012 `js7bk05dq753c3y6jnwryt3db98at8b3` | 2026-06 | $15.583.100 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 39 | CDC | 201 | FAC-2026-06-0014 `js7145z7g26ky2q0snjg1cxrqx8av0zy` | 2026-06 | $3.157.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 40 | CDC | 204 | FAC-2026-06-0017 `js76qsq1xxn6rd141hy2bn8avh8av60h` | 2026-06 | $360.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 41 | CDC | 205 | FAC-2026-06-0018 `js7cr7v5m8tbvxp6g4jqrj4ra98avn1a` | 2026-06 | $335.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 42 | CDC | 206 | FAC-2026-06-0019 `js72ayag6yjn73wbmh24t4b8mx8atv8k` | 2026-06 | $384.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 43 | CDC | 207 | FAC-2026-06-0020 `js763kmdcz4xhpqsxpwd2jhdpn8at6ne` | 2026-06 | $367.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 44 | CDC | 211 | FAC-2026-06-0024 `js7635de3r21wamc8wvybqn77x8av8nc` | 2026-06 | $4.432.200 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 45 | CDC | 212 | FAC-2026-06-0025 `js73e8b9gk5smvgqwykxpz5ren8at8nb` | 2026-06 | $465.600 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 46 | CDC | 214 | FAC-2026-06-0027 `js7afva66d0gc52abmv0g1mnws8avbsb` | 2026-06 | $367.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 47 | CDC | 216 | FAC-2026-06-0029 `js72wnbcarmge24ne5sfj380k98atxks` | 2026-06 | $1.626.450 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 48 | CDC | 217 | FAC-2026-06-0030 `js7cx1jfks31ebebsgmc5x8xbn8av74v` | 2026-06 | $397.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 49 | CDC | 220 | FAC-2026-01-0185 `js718yxkagr4pjxts9j8ycjan58avpfy` | 2026-01 | $7.751.900 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 50 | CDC | 220 | FAC-2026-06-0033 `js74eazhyghnehw6mqt8tag34x8avyf0` | 2026-06 | $4.916.900 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 51 | CDC | 304 | FAC-2026-06-0043 `js7d2c7xrjcxk0yhw47pq3rd3x8atzzp` | 2026-06 | $409.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 52 | CDC | 306 | FAC-2026-06-0045 `js723zn00rs0a4hhy2399tt8818av78w` | 2026-06 | $422.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 53 | CDC | 309 | FAC-2026-06-0048 `js7eh2141fz11tjw79wywd8mhs8atk5m` | 2026-06 | $360.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 54 | CDC | 319 | FAC-2026-06-0057 `js75kc7x2x3t38g5qw482mkqhx8atb81` | 2026-06 | $730.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 55 | CDC | 402 | FAC-2026-06-0064 `js7a7p3sjxzpzt73btyqnzc6118ath84` | 2026-06 | $9.435.010 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 56 | CDC | 404 | FAC-2026-06-0066 `js7dvvv0dareafrkb0s3fwbh7h8avfa7` | 2026-06 | $2.976.100 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 57 | CDC | 405 | FAC-2026-06-0067 `js77ppx9e7pvm7a8spykh56esd8avk1b` | 2026-06 | $3.274.800 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 58 | CDC | 408 | FAC-2026-06-0070 `js78b6d3bh5zsws2ebcnxnzrkd8atvc3` | 2026-06 | $360.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 59 | CDC | 501 | FAC-2026-06-0083 `js7b4ahvjmamfk3ha1xh42kwed8avz16` | 2026-06 | $24.584.620 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 60 | CDC | 502 | FAC-2026-01-0194 `js7a0bxvgzj7666ckyers48hjx8atbg3` | 2026-01 | $17.998.130 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 61 | CDC | 504 | FAC-2026-06-0086 `js72pvdysgkxxnm09rb7yc2yxx8avfjd` | 2026-06 | $24.434.520 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 62 | CDC | 507 | FAC-2026-06-0089 `js722amnn5n7stpwdqgrce5yf58atpd2` | 2026-06 | $798.500 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 63 | CDC | 508 | FAC-2026-06-0090 `js70a4cmpz2dk7ztbh32dwf4ed8av248` | 2026-06 | $24.654.720 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 64 | CDC | 509 | FAC-2026-06-0091 `js75h8t67a0cf59n36zb59yd9h8avdmq` | 2026-06 | $360.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 65 | CDC | 512 | FAC-2026-06-0094 `js79j2w9jx2ynvxrjcfba30j198at2e7` | 2026-06 | $360.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 66 | CDC | 608 | FAC-2026-06-0110 `js758bwa9mx4vd0mpg4xgska4h8at4t1` | 2026-06 | $7.177.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 67 | CDC | 609 | FAC-2026-06-0111 `js71n7x1th4cgbsbae9cfd5zvh8atx1f` | 2026-06 | $752.600 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 68 | CDC | 611 | FAC-2026-05-0199 `js7ccfs553vwb5j3nsw23j2wdd8av7kz` | 2026-05 | $0 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 69 | CDC | 613 | FAC-2026-06-0114 `js78gvyr2pqmygbkva5nj8gv3x8av49x` | 2026-06 | $24.593.278 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 70 | CDC | 621 | FAC-2026-06-0122 `js75r81dyb6z5arzs601srgz098atvca` | 2026-06 | $360.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 71 | CDC | 625 | FAC-2026-06-0126 `js7cx7c0h84rh2wr1qfe6pc6p98attex` | 2026-06 | $569.300 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 72 | CDC | 702 | FAC-2026-06-0129 `js7dj74pzy04c98ypmeq25s10n8avx03` | 2026-06 | $1.350.600 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 73 | CDC | 703 | FAC-2026-06-0130 `js750xsqzsk8vr921xzavmakfx8avc4h` | 2026-06 | $1.408.200 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 74 | CDC | 710 | FAC-2026-06-0137 `js74amhhh162t70fa040pfccdx8atw41` | 2026-06 | $674.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 75 | CDC | 711 | FAC-2026-06-0138 `js779nmnsy0rs6yfpskd68njm18attcx` | 2026-06 | $10.549.600 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 76 | CDC | 712 | FAC-2026-06-0139 `js78r718wmbavq5tjbsynckzy98av0ej` | 2026-06 | $367.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 77 | CDC | 716 | FAC-2026-05-0201 `js7cc4yt1c6a9x8dbehwfx7n8h8atgzx` | 2026-05 | $0 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 78 | CDC | 717 | FAC-2026-06-0143 `js7ethd3n99pb41se49pcsmgh58atjmm` | 2026-06 | $520.950 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 79 | CDC | 803 | FAC-2026-06-0155 `js7awrdb2g1eas6661hk1taxed8atf3g` | 2026-06 | $446.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 80 | CDC | 806 | FAC-2026-06-0158 `js75tedzm63g97dyz5z91803as8avff5` | 2026-06 | $1.083.800 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 81 | CDC | 813 | FAC-2026-06-0164 `js795sa006q0zj2qa1rgz7ascx8av8k6` | 2026-06 | $24.800.120 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 82 | CDC | 818 | FAC-2026-06-0169 `js73sh112wy9xd7m2n5m3met618at5xt` | 2026-06 | $360.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 83 | CDC | 820 | FAC-2026-06-0171 `js78jwny9da4jfmc3748gje10x8avhps` | 2026-06 | $693.500 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 84 | CDC | 823 | FAC-2026-06-0174 `js7d0zt51xtfmtj7b63fywd0kn8atbya` | 2026-06 | $360.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 85 | CDC | 825 | FAC-2026-06-0176 `js7b81mwk8w85947m0g95ekhxh8at7ye` | 2026-06 | $526.950 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 86 | CDC | 902 | FAC-2026-06-0177 `js71y6tgtt7x2407ey996j5z1d8atsg5` | 2026-06 | $360.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 87 | CDC | 904 | FAC-2026-06-0179 `js7160z5e9czn9tq7f2nrccman8at5et` | 2026-06 | $8.474.750 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 88 | CDC | 906 | FAC-2026-06-0181 `js78q0dhxsavbp0bd0c9n9kgjh8atfey` | 2026-06 | $1.394.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 89 | CDC | 907 | FAC-2026-06-0182 `js7btg382q5151s9xvgv2d03th8atwmp` | 2026-06 | $10.457.050 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 90 | CDC | 910 | FAC-2026-06-0184 `js73j9te0x7s4g6tpvy0tq1dax8atc0a` | 2026-06 | $374.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 91 | CDC | 912 | FAC-2026-06-0186 `js7dy152bpecpg4k9ew321vhb18at0fh` | 2026-06 | $486.000 | vencida → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |
| 92 | CDC | 915 | FAC-2026-06-0189 `js7848re9bd0v7cmc0806jtdp98avcrt` | 2026-06 | $416.000 | abonada → **pendiente** | mes faltante: el saldo anterior siguiente no la juzga |

### B1. Escenario B de la Fase 2, recalculado con las reglas de la Fase 3: facturas que quedan distinto (70)

| # | Conjunto | Unidad | Factura | Período | Hoy | Escenario B (Fase 2) | Escenario B (Fase 3) | Por qué |
|---|---|---|---|---|---|---|---|---|
| 1 | Arboleda | T-I 502 | FAC-2026-04-0072 `js7bqzwh0gtepv694wydkh9ca18at087` | 2026-04 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 2 | Arboleda | T-I 504 | FAC-2026-04-0100 `js74n71a1yfqegqn8jjf4t709h8avetg` | 2026-04 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 3 | Arboleda | T-I 604 | FAC-2026-04-0091 `js71fbbfqtg84f33eetf9p67px8at17g` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 4 | Arboleda | T-I 701 | FAC-2026-04-0071 `js78sc20e4j1sqd53v18vyrvjx8avajb` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 5 | Arboleda | T-I 1003 | FAC-2026-04-0022 `js78vk5fg0k1mb5zawepdcdzj98atw20` | 2026-04 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 6 | Arboleda | T-I 1101 | FAC-2026-04-0121 `js7fpmv014yrm5jfhm6qyyw4f58atnan` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 7 | Arboleda | T-II 501 | FAC-2026-04-0099 `js79trrntae9r96w0jhhb2rm798av5b4` | 2026-04 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 8 | Arboleda | T-II 1003 | FAC-2026-04-0043 `js76gb0d9pj6tv8h4haxr5kb1n8atgeg` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 9 | Arboleda | T-II 1101 | FAC-2026-04-0135 `js75d8k0088fjy7nts170gaq5s8avzt8` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 10 | Arboleda | T-III 103 | FAC-2026-04-0042 `js74399p8q4qyasn61phekp4g58atce1` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 11 | Arboleda | T-III 301 | FAC-2026-04-0123 `js760qmmqy2rkk1rxjvn0epded8atwak` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 12 | Arboleda | T-III 302 | FAC-2026-04-0087 `js75ba4dewmdb4mp4gynzkwgy18at5gh` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 13 | Arboleda | T-III 304 | FAC-2026-04-0075 `js767zrbgd3dg335r2ym7bq6eh8ata0n` | 2026-04 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 14 | Arboleda | T-III 702 | FAC-2026-04-0085 `js76fpbeptk5aznjg60aa63cnh8athmz` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 15 | Arboleda | T-III 801 | FAC-2026-04-0086 `js70wnqc3ynktcww18awfszx1x8avr5t` | 2026-04 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 16 | Arboleda | T-III 1003 | FAC-2026-04-0054 `js7exs9a2pn6bq98bd93b4q1ns8at2p4` | 2026-04 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 17 | Arboleda | T-III 1101 | FAC-2026-04-0037 `js7f8mjbsh3hg3b65kf1vhtjqs8at3m4` | 2026-04 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 18 | Arboleda | T-III 1102 | FAC-2026-04-0013 `js763vkre7rmnrs4dwgqsjped98attd1` | 2026-04 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 19 | Arboleda | T-IV 203 | FAC-2026-04-0031 `js7dspjj40yf28n31h65fdvcv18av99c` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 20 | Arboleda | T-IV 703 | FAC-2026-04-0119 `js7ba3ypj49jm2svn3xzf4h3r58av7rc` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 21 | Arboleda | T-IV 803 | FAC-2026-04-0036 `js7b8znn13zmdq7cazrs0nkwqs8athar` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 22 | Arboleda | T-IV 1004 | FAC-2026-04-0139 `js70zd0dxybbw52r0zynfnmbqn8avp9c` | 2026-04 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 23 | Arboleda | T-IV 1104 | FAC-2026-04-0155 `js78t883jd3s7519rrq7dsq55x8at80t` | 2026-04 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 24 | CDC | 102 | FAC-2026-06-0002 `js79mym6d2r7e7m1pc0vr5jz958avnt7` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 25 | CDC | 104 | FAC-2026-06-0004 `js72t62327nvynatz91b3fw9an8atq8x` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 26 | CDC | 105 | FAC-2026-02-0172 `js7ce19tfxhkjpppb0a243p6th8att3m` | 2026-02 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 27 | CDC | 105 | FAC-2026-06-0005 `js71s42sm7qph0n7pdkey9nvvx8avks4` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 28 | CDC | 108 | FAC-2026-06-0008 `js7942sk2z5yjb2ag5mafwj49x8at1rv` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 29 | CDC | 109 | FAC-2026-06-0009 `js7e5e7y83hefrwk8164rdt2558atwgk` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 30 | CDC | 110 | FAC-2026-06-0010 `js7f2g7ga74ddtq1eewqjy1x2n8ataxv` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 31 | CDC | 201 | FAC-2026-06-0014 `js7145z7g26ky2q0snjg1cxrqx8av0zy` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 32 | CDC | 204 | FAC-2026-06-0017 `js76qsq1xxn6rd141hy2bn8avh8av60h` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 33 | CDC | 205 | FAC-2026-06-0018 `js7cr7v5m8tbvxp6g4jqrj4ra98avn1a` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 34 | CDC | 206 | FAC-2026-06-0019 `js72ayag6yjn73wbmh24t4b8mx8atv8k` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 35 | CDC | 207 | FAC-2026-06-0020 `js763kmdcz4xhpqsxpwd2jhdpn8at6ne` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 36 | CDC | 212 | FAC-2026-06-0025 `js73e8b9gk5smvgqwykxpz5ren8at8nb` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 37 | CDC | 214 | FAC-2026-06-0027 `js7afva66d0gc52abmv0g1mnws8avbsb` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 38 | CDC | 216 | FAC-2026-06-0029 `js72wnbcarmge24ne5sfj380k98atxks` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 39 | CDC | 217 | FAC-2026-06-0030 `js7cx1jfks31ebebsgmc5x8xbn8av74v` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 40 | CDC | 220 | FAC-2026-01-0185 `js718yxkagr4pjxts9j8ycjan58avpfy` | 2026-01 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 41 | CDC | 304 | FAC-2026-06-0043 `js7d2c7xrjcxk0yhw47pq3rd3x8atzzp` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 42 | CDC | 306 | FAC-2026-06-0045 `js723zn00rs0a4hhy2399tt8818av78w` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 43 | CDC | 309 | FAC-2026-06-0048 `js7eh2141fz11tjw79wywd8mhs8atk5m` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 44 | CDC | 319 | FAC-2026-06-0057 `js75kc7x2x3t38g5qw482mkqhx8atb81` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 45 | CDC | 408 | FAC-2026-06-0070 `js78b6d3bh5zsws2ebcnxnzrkd8atvc3` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 46 | CDC | 502 | FAC-2026-01-0194 `js7a0bxvgzj7666ckyers48hjx8atbg3` | 2026-01 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 47 | CDC | 507 | FAC-2026-06-0089 `js722amnn5n7stpwdqgrce5yf58atpd2` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 48 | CDC | 509 | FAC-2026-06-0091 `js75h8t67a0cf59n36zb59yd9h8avdmq` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 49 | CDC | 512 | FAC-2026-06-0094 `js79j2w9jx2ynvxrjcfba30j198at2e7` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 50 | CDC | 609 | FAC-2026-06-0111 `js71n7x1th4cgbsbae9cfd5zvh8atx1f` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 51 | CDC | 621 | FAC-2026-06-0122 `js75r81dyb6z5arzs601srgz098atvca` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 52 | CDC | 625 | FAC-2026-06-0126 `js7cx7c0h84rh2wr1qfe6pc6p98attex` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 53 | CDC | 702 | FAC-2026-06-0129 `js7dj74pzy04c98ypmeq25s10n8avx03` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 54 | CDC | 703 | FAC-2026-06-0130 `js750xsqzsk8vr921xzavmakfx8avc4h` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 55 | CDC | 710 | FAC-2026-06-0137 `js74amhhh162t70fa040pfccdx8atw41` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 56 | CDC | 712 | FAC-2026-06-0139 `js78r718wmbavq5tjbsynckzy98av0ej` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 57 | CDC | 716 | FAC-2026-05-0201 `js7cc4yt1c6a9x8dbehwfx7n8h8atgzx` | 2026-05 | vencida | vencida | **saldo a favor** | mes faltante: sin veredicto; su lectura nueva es negativa (saldo a favor) |
| 58 | CDC | 717 | FAC-2026-06-0143 `js7ethd3n99pb41se49pcsmgh58atjmm` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 59 | CDC | 802 | FAC-2026-09-0048 `js7emmx2036pr957y87xz07apn8e1xmm` | 2026-09 | pendiente | saldo a favor | **pendiente** | el PDF publicado es otro documento (otro consecutivo): no se re-procesa |
| 60 | CDC | 803 | FAC-2026-06-0155 `js7awrdb2g1eas6661hk1taxed8atf3g` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 61 | CDC | 806 | FAC-2026-06-0158 `js75tedzm63g97dyz5z91803as8avff5` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 62 | CDC | 818 | FAC-2026-06-0169 `js73sh112wy9xd7m2n5m3met618at5xt` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 63 | CDC | 820 | FAC-2026-06-0171 `js78jwny9da4jfmc3748gje10x8avhps` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 64 | CDC | 823 | FAC-2026-06-0174 `js7d0zt51xtfmtj7b63fywd0kn8atbya` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 65 | CDC | 825 | FAC-2026-06-0176 `js7b81mwk8w85947m0g95ekhxh8at7ye` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 66 | CDC | 902 | FAC-2026-06-0177 `js71y6tgtt7x2407ey996j5z1d8atsg5` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 67 | CDC | 906 | FAC-2026-06-0181 `js78q0dhxsavbp0bd0c9n9kgjh8atfey` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 68 | CDC | 910 | FAC-2026-06-0184 `js73j9te0x7s4g6tpvy0tq1dax8atc0a` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |
| 69 | CDC | 912 | FAC-2026-06-0186 `js7dy152bpecpg4k9ew321vhb18at0fh` | 2026-06 | vencida | vencida | **pendiente** | mes faltante: sin veredicto |
| 70 | CDC | 915 | FAC-2026-06-0189 `js7848re9bd0v7cmc0806jtdp98avcrt` | 2026-06 | abonada | abonada | **pendiente** | mes faltante: sin veredicto |

### M1. Alternativa de mora (saldo anterior real de la vigente > $1): unidades que cambian, sobre lo guardado hoy (68)

| # | Conjunto | Unidad | Estado con la regla actual | Con la alternativa | Monto en mora (alternativa) | Saldo vigente |
|---|---|---|---|---|---|---|
| 1 | Arboleda | T-I 102 | Pendiente | **En mora** | $12.000 | $313.000 |
| 2 | Arboleda | T-I 504 | Pendiente | **En mora** | $1.110.318 | $1.416.436 |
| 3 | Arboleda | T-I 604 | Pendiente | **En mora** | $290.214 | $580.348 |
| 4 | Arboleda | T-I 701 | Pendiente | **En mora** | $774.199 | $1.097.591 |
| 5 | Arboleda | T-I 802 | Pendiente | **En mora** | $330.695 | $643.305 |
| 6 | Arboleda | T-I 804 | Pendiente | **En mora** | $21.389 | $314.889 |
| 7 | Arboleda | T-I 904 | Pendiente | **En mora** | $288.000 | $582.000 |
| 8 | Arboleda | T-I 1003 | Pendiente | **En mora** | $284.000 | $568.000 |
| 9 | Arboleda | T-II 201 | Pendiente | **En mora** | $312.695 | $625.305 |
| 10 | Arboleda | T-II 204 | Pendiente | **En mora** | $28.106 | $312.608 |
| 11 | Arboleda | T-II 401 | Pendiente | **En mora** | $310.500 | $627.610 |
| 12 | Arboleda | T-II 501 | Pendiente | **En mora** | $706.710 | $1.026.160 |
| 13 | Arboleda | T-II 603 | Pendiente | **En mora** | $33.000 | $357.500 |
| 14 | Arboleda | T-II 701 | Pendiente | **En mora** | $1.500 | $307.500 |
| 15 | Arboleda | T-II 704 | Pendiente | **En mora** | $229.107 | $517.989 |
| 16 | Arboleda | T-II 1001 | Pendiente | **En mora** | $319.213 | $645.323 |
| 17 | Arboleda | T-II 1003 | Pendiente | **En mora** | $547.731 | $843.061 |
| 18 | Arboleda | T-III 204 | Pendiente | **En mora** | $284.000 | $574.134 |
| 19 | Arboleda | T-III 802 | Pendiente | **En mora** | $201.256 | $511.314 |
| 20 | Arboleda | T-III 1004 | Pendiente | **En mora** | $325.997 | $617.153 |
| 21 | Arboleda | T-III 1101 | Pendiente | **En mora** | $468.471 | $778.843 |
| 22 | Arboleda | T-III 1102 | Pendiente | **En mora** | $1.741.776 | $2.088.098 |
| 23 | Arboleda | T-III 1103 | Pendiente | **En mora** | $31.837 | $315.837 |
| 24 | Arboleda | T-III 1104 | Pendiente | **En mora** | $309.630 | $619.175 |
| 25 | Arboleda | T-IV 202 | Pendiente | **En mora** | $478.825 | $778.825 |
| 26 | Arboleda | T-IV 501 | Pendiente | **En mora** | $200.000 | $502.000 |
| 27 | Arboleda | T-IV 503 | Pendiente | **En mora** | $200.000 | $480.000 |
| 28 | Arboleda | T-IV 601 | Pendiente | **En mora** | $410.000 | $727.000 |
| 29 | Arboleda | T-IV 602 | Pendiente | **En mora** | $200.000 | $500.000 |
| 30 | Arboleda | T-IV 603 | Pendiente | **En mora** | $410.000 | $691.000 |
| 31 | Arboleda | T-IV 702 | Pendiente | **En mora** | $301.000 | $621.500 |
| 32 | Arboleda | T-IV 802 | Pendiente | **En mora** | $413.000 | $713.000 |
| 33 | Arboleda | T-IV 902 | Pendiente | **En mora** | $410.000 | $725.000 |
| 34 | Arboleda | T-IV 903 | Pendiente | **En mora** | $250.500 | $530.500 |
| 35 | Arboleda | T-IV 904 | Pendiente | **En mora** | $410.000 | $695.000 |
| 36 | Arboleda | T-IV 1001 | Pendiente | **En mora** | $409.000 | $710.000 |
| 37 | Arboleda | T-IV 1002 | Pendiente | **En mora** | $728.862 | $1.035.342 |
| 38 | Arboleda | T-IV 1003 | Pendiente | **En mora** | $410.000 | $690.000 |
| 39 | Arboleda | T-IV 1004 | Pendiente | **En mora** | $1.709.389 | $2.012.857 |
| 40 | Arboleda | T-IV 1101 | Pendiente | **En mora** | $412.500 | $724.500 |
| 41 | Arboleda | T-IV 1104 | Pendiente | **En mora** | $1.224.256 | $1.528.155 |
| 42 | CDC | 105 | Pendiente | **En mora** | $837.600 | $1.193.600 |
| 43 | CDC | 109 | Pendiente | **En mora** | $427.000 | $762.000 |
| 44 | CDC | 113 | Pendiente | **En mora** | $6.000 | $348.000 |
| 45 | CDC | 203 | Pendiente | **En mora** | $206.000 | $724.000 |
| 46 | CDC | 204 | Pendiente | **En mora** | $7.000 | $342.000 |
| 47 | CDC | 206 | Pendiente | **En mora** | $56.000 | $391.000 |
| 48 | CDC | 207 | Pendiente | **En mora** | $335.000 | $684.000 |
| 49 | CDC | 212 | Pendiente | **En mora** | $258.600 | $612.600 |
| 50 | CDC | 214 | Pendiente | **En mora** | $628.000 | $977.000 |
| 51 | CDC | 216 | Pendiente | **En mora** | $1.116.450 | $1.451.450 |
| 52 | CDC | 219 | Pendiente | **En mora** | $14.000 | $343.100 |
| 53 | CDC | 302 | Pendiente | **En mora** | $35.000 | $366.300 |
| 54 | CDC | 306 | Pendiente | **En mora** | $162.000 | $504.000 |
| 55 | CDC | 308 | Pendiente | **En mora** | $3.000 | $344.000 |
| 56 | CDC | 309 | Pendiente | **En mora** | $7.000 | $342.000 |
| 57 | CDC | 319 | Pendiente | **En mora** | $347.000 | $682.000 |
| 58 | CDC | 409 | Pendiente | **En mora** | $38.000 | $380.000 |
| 59 | CDC | 509 | Pendiente | **En mora** | $335.000 | $670.000 |
| 60 | CDC | 512 | Pendiente | **En mora** | $7.000 | $349.000 |
| 61 | CDC | 609 | Pendiente | **En mora** | $542.600 | $877.600 |
| 62 | CDC | 702 | Pendiente | **En mora** | $942.000 | $1.277.000 |
| 63 | CDC | 726 | Pendiente | **En mora** | $21.000 | $356.000 |
| 64 | CDC | 803 | Pendiente | **En mora** | $21.000 | $483.500 |
| 65 | CDC | 823 | Pendiente | **En mora** | $335.000 | $677.000 |
| 66 | CDC | 825 | Pendiente | **En mora** | $99.950 | $246.950 |
| 67 | CDC | 902 | Pendiente | **En mora** | $7.000 | $342.000 |
| 68 | CDC | 923 | Pendiente | **En mora** | $29.000 | $371.000 |

### V1. Vencimiento a fin de mes: la ventana entre el día 1 y la carga del PDF siguiente

| Conjunto | Período | Se cargó el siguiente | Días de la ventana | Unidades juzgadas por el siguiente | De ellas, pagaron o abonaron por fuera de Vekino |
|---|---|---|---|---|---|
| CDC | 2026-08 | 2026-09-08 | 8 | 201 | 169 (84 %) |
| Arboleda | 2026-06 | 2026-08-05 | 35 | 168 | 131 (78 %) |
| Arboleda | 2026-07 | 2026-08-13 | 13 | 172 | 133 (77 %) |
| Arboleda | 2026-08 | 2026-09-16 | 16 | 172 | 128 (74 %) |

### D1. Plazo del descuento: de dónde sale en cada factura

| Qué | CDC | Arboleda |
|---|---|---|
| Facturas guardadas con valor con descuento | 1556 | 0 |
| … con la fecha del documento guardada (`fechaLimiteDescuento`) | 0 | — |
| … que usan la regla del día 15 del mes del período | 1556 | — |
| Documentos del corpus en los que el parser lee el día ("HASTA EL DIA N…" o "del 1 - N") | 1621, todos con día 15 | 0 (no ofrece descuento) |
| Facturas con descuento cuyo documento no dice el día | 0 | — |
| Vigentes que hoy se pueden pagar con descuento | 198 | — |
| … cuyo cobro de hoy cambia (regla vieja: hasta el vencimiento; nueva: hasta el 15 del mes del período) | 197 (septiembre), $7.880.000 en total | — |

### P1. Unidades de prueba (no cuentan en ninguna cifra)

| Conjunto | Unidad | Estado hoy | Con las reglas nuevas | Alternativa de mora |
|---|---|---|---|---|
| CDC | 999 | Al día | Al día | Al día |
| Arboleda | 9999 | Al día | Al día | Al día |
