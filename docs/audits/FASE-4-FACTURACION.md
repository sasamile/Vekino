# Fase 4 — Cobros operativos, lectura, accesos y cierre de facturación

> **Fecha:** 2026-10-08 · **Base:** `081916a` (modelo de pagos de la Fase 3) · **Estado:** cambios en el *working tree*, **sin commit**.
> Referencias: [`AUDITORIA_FACTURACION.md`](AUDITORIA_FACTURACION.md) (hallazgos F-xx y secciones §), [`FASE-0-FACTURACION.md`](FASE-0-FACTURACION.md) (pruebas #1–#91), [`FASE-1-FACTURACION.md`](FASE-1-FACTURACION.md), [`FASE-2-FACTURACION.md`](FASE-2-FACTURACION.md) y [`FASE-3-FACTURACION.md`](FASE-3-FACTURACION.md).

---

## 1. Resumen ejecutivo

### Qué se corrigió

**Bloque A — los hallazgos que quedaban de la auditoría (las 8 pruebas de la Fase 4):**

1. **Cobros de parqueadero (F-08).** El cargo ya no es cada reporte del guarda sino un **cobro por (casa, vehículo, mes)**, con el mes en hora de Colombia. Tres rondas que ven el mismo carro en septiembre son un cobro de $7.000, no tres (#40); dos carros siguen siendo dos (#39).
   - **Un solo estado** (`pendiente` / `facturado` / `descartado`) en la tabla nueva `cobrosParqueadero`. Lo mueven las dos pantallas: "cobrada" en Vigilancia es "facturado" en Cobros de parqueadero (#41).
   - **Transiciones validadas:** un cobro facturado no se vuelve a facturar, ni en otro período (#42); descartar exige motivo.
   - **Historia** (`cobroParqueaderoEventos`): quién, cuándo, el estado y el período anteriores, y el motivo. Devolver a pendiente ya no borra nada sin rastro.
   - **Reportes viejos:** se agrupan al leer, sin escribir; se enlazan solos la primera vez que alguien gestiona su mes. Para dejarlos enlazados de una vez está `parqueadero.agruparReportes`, con `dryRun: true` por defecto (§4.1). **No se ejecutó.**
2. **Aporte voluntario (F-10).** El reporte suma el **cargo del mes** (`actual`), no el `total` de la línea, que trae el arrastre (#44). La deuda se muestra aparte, la de la última factura. El concepto se reconoce **por su texto**, no por el código 5, que en Arboleda es "Parqueadero visitante" (#45). El color del guarda usa la misma regla. Un conjunto puede declarar cómo llama al aporte (opcional, sin escribir datos).
3. **La lista del residente (F-16).** `listMia` toma las unidades de `misUnidadIds`: solo vínculos **vigentes** (#55) y cada casa una vez (#54). Cada factura sale una vez, y la **vigente de cada unidad llega siempre**, aunque haya más de 50 facturas.
4. **Acceso a los pagos (F-20).** `pagos.listPorFactura` solo responde a quien tiene un vínculo vigente con la unidad, a la administración y a la contadora del conjunto (#36). `pagos.verificarPago` valida lo mismo **antes** de hablar con el banco y **nunca** devuelve `trnRaw`/`basicDataRaw`. De paso se cerraron otros dos huecos (§4.4).
5. **Recaudo honesto (F-19).** Dos cifras, por separado, en `facturas.resumenPeriodo`, `facturas.serie`, Reportes, el inicio de la administración, Finanzas y el móvil:
   - **según la contabilidad:** por unidad y mes consecutivo, total(N) − saldo anterior(N+1), con créditos; lo que no se puede calcular se cuenta y se dice por qué;
   - **registrado en Vekino:** pagos y comprobantes aprobados.
6. **Número de factura (F-17).** Las cargas nuevas lo toman del período y de la casa del documento (`FAC-2026-10-104`), no de la posición en el lote. Una factura existente **no se renumera**.

**Bloque B — lo que la Fase 3 dejó pendiente para el despliegue:**

7. **Mora B** (decisión del responsable). El fin de mes es el plazo del precio completo, que es lo que ve el residente; **la mora empieza el 16 del mes siguiente** (`inicioDeMora`). El residente ve las dos fechas con texto claro en la web, el móvil, el bot y el agente. No se re-fechó ninguna factura.
8. **"Sin verificar".** Una factura **histórica** que quedó `pendiente` (nadie pudo juzgarla: falta el mes siguiente) se muestra "Sin verificar", con "Falta el estado de cuenta del mes siguiente para saber si se pagó". La regla vive en `lib/cartera.ts` (`estadoVisibleDeFactura`); el campo `estado` no cambia. Superficies: web, móvil, bot, agente, campana y Finanzas.
9. **Pasarela en QA.** Con `AVAL_AMBIENTE=qa`, la pasarela solo opera sobre las unidades declaradas en `AVAL_UNIDADES_PRUEBA` (no se definió); sin la lista, sobre ninguna. Rechazo estable en `armarDatosTrn` y `puedePagar`. Web, móvil, bot y agente no ofrecen "Pagar en línea" a una unidad real. Con `prod`, todo como en la Fase 3.
10. **Versiones viejas del móvil.** La app no tiene actualizaciones por aire (`expo-updates` no está instalado). Se agregó un **control de versión mínima**: la app informa su versión y `appMovil.versionMinima` dice si debe actualizar. Sin `MOVIL_VERSION_MINIMA`, no bloquea a nadie.

### Qué NO se corrigió (a propósito)

- **Bloque C** (PDF privados): no se marcó. Solo se informan los hechos (§6).
- **Recaudo externo (F-05) y reversos de Aval:** no se entregó la muestra del archivo ni la especificación. Siguen como diseño (Fase 3, §12).
- No se ejecutó `parqueadero.agruparReportes`, ni el re-procesamiento de la Fase 2, ni "Conciliar".
- **No se escribió nada** en Convex ni en S3, no se definió ninguna variable de entorno, no se publicó el móvil y no hubo llamadas a Aval.

### Resultado

| | Resultado |
|---|---|
| Pruebas de la Fase 4 | **8 de 8** pasaron de ❌ a ✅ (#36, #40, #41, #42, #44, #45, #54, #55) |
| Controles de la Fase 0 y pruebas de las Fases 1, 2 y 3 | **33 de 33**, **18 de 18**, **21 de 21** y **11 de 11** siguen ✅. Ningún archivo de la Fase 0 cambió de contenido. Una prueba de la Fase 3 y tres anteriores a la auditoría contradecían la decisión B y se ajustaron, comentadas y justificadas (§7.3) |
| Las 91 de la Fase 0 | **91 ✅ · 0 ❌** |
| Suites generales | Todas verdes, sin errores de tipos nuevos. **64 pruebas nuevas**: 19 unitarias, 29 de convex-test, 12 web y 4 del móvil |
| `test:facturacion` | Backend: los 5 archivos de la red, ya renombrados a `*.test.ts`, por nombre (55 pruebas). Web: las 36 de `pruebas/facturacion`. Ninguno corre vacío (§7.3) |
| Datos reales (simulación local, §8) | · **Parqueadero:** 122 cobros por $790.000 → **52 por $336.000**. <br>· **Aporte:** CDC, de $81,7 a **$47,2 millones** en cargos; Arboleda, de $8,7 millones a **$0**, porque no tiene aporte. El color del guarda cambia en **1** casa. <br>· **Mora:** **ninguna unidad cambia hoy**, porque lo guardado vence el 15. La regla B rige desde la primera carga de octubre. <br>· **"Sin verificar":** 0 hoy y 87 después de "Conciliar". <br>· **Pasarela en QA:** 366 casas reales dejan de ver "Pagar en línea" en el bot y el agente. En la web y el móvil nuevos no cambia nada. <br>· **Pagos:** 3, los 3 con respuestas crudas del banco que cualquier sesión podía leer |
| Escrituras | **Cero** en Convex y en S3. Ninguna variable definida, nada publicado del móvil, **cero** llamadas a Aval y sin commit |

---

## 2. Verificaciones de solo lectura (PASO 1)

### 2.1 Qué está desplegado

| Pregunta | Respuesta |
|---|---|
| ¿A qué deployment va todo comando de Convex? | Al de los residentes, `agreeable-bee-782` (tipo *dev*). `packages/backend/.env.local` sigue teniendo `CONVEX_DEPLOY_KEY` (variables, solo nombres: `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOY_KEY`, `DEEPGRAM_API_KEY`, `CONVEX_URL`, `CONVEX_SITE_URL`) |
| Tablas (`bunx convex data`) | `importaciones` **existe** (0 filas): esquema de la Fase 2. `facturaEventos` y `discrepanciasPago` **existen** (0 filas cada una): esquema de la Fase 3. Facturas: 2.792; ninguna con los campos nuevos de las Fases 2 y 3 (nada se ha recalculado ni cargado desde entonces) |
| ¿Corre el código de la Fase 3? | **Sí.** Hay un pago nuevo (`m975…`, 2026-10-08 17:57 Bogotá): `fallida`, QA, **$380.000** sobre la factura de septiembre y con `esPrueba: true`. Ese campo lo pone `registrarPago` desde la Fase 3, y el monto es el sin descuento (el descuento de septiembre venció el 15; antes cobraba $340.000) |
| ¿Está publicada la web de las Fases 2 y 3? | **No.** GET anónimo a `https://www.vekino.com/api/facturas/confirmar` → **404** (la ruta de la Fase 2 no existe); `/api/facturas/upload` → 405 (existe, solo POST). Los paquetes JS públicos no contienen ninguna cadena de las pantallas de las Fases 2 y 3 ("Pagos por revisar", "Meses faltantes", "Confirmar lectura", `pago_en_verificacion`) y apuntan a `agreeable-bee-782.convex.cloud`. `vekino-web.vercel.app` responde 402 |
| ¿La web publicada tiene la Fase 1? | **No se pudo saber** con un GET: lo que cambió la Fase 1 en la subida (401 sin sesión) solo se ve con un POST, y esta fase no hizo peticiones que pudieran escribir |
| `AVAL_AMBIENTE` | `qa` (clasificado sin imprimirlo). `AVAL_UNIDADES_PRUEBA` y `MOVIL_VERSION_MINIMA` (con sus variantes `_IOS` y `_ANDROID`): sin definir |

**Conclusión:** hoy corren el esquema y el backend de la Fase 3 con una web anterior a la Fase 2. Es la combinación que la Fase 3 (§15) daba por funcional ("backend nuevo + web vieja"), con dos efectos: la web vieja anuncia el descuento hasta el vencimiento mientras la pasarela ya cobra el total, y su ruta de subida sigue publicando en S3 al leer el PDF (F-07). El orden de despliegue del §9 parte de este estado.

### 2.2 PDF de las facturas

| Pregunta | Respuesta |
|---|---|
| Cómo se publican | `PutObjectCommand` **sin ACL**, en la ruta vieja (`upload/route.ts` de `02833b0`) y en la de confirmación de la Fase 2. La lectura pública viene de la **política del bucket** `vekino` (us-east-1), no de cada objeto. El listado anónimo está bloqueado |
| Llaves | 2.792 facturas con `pdfUrl`, todas en `vekino.s3.us-east-1.amazonaws.com`: **2.503 predecibles** (`condominios/facturas/{conjunto}/{período}/unidad-{casa}.pdf`) y 289 del sistema anterior (`condominios/{id}/facturas/factura-{período}-{id}-{marca de tiempo}.pdf`). Ninguna con la llave de la Fase 2 (no ha habido importaciones) |
| Dónde se usa `pdfUrl` | Web: inicio y "Mis facturas" del residente, Finanzas, el modal de estado de cuenta de reservas y la factura manual. Móvil: "Ver PDF" del detalle. Bot: lo manda como documento (WhatsApp descarga la URL pública). Agente: solo dice si hay PDF (`tienePdf`). Backend: `facturas.ts`, `migrations.ts`, `model/facturas.ts`. La campana y los avisos no lo usan |
| Credenciales (solo nombres) | Web: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`. Backend: las mismas, y aparte `AWS_INCIDENTES_BUCKET_NAME`, `AWS_INCIDENTES_ACCESS_KEY_ID`, `AWS_INCIDENTES_SECRET_ACCESS_KEY`, `AWS_INCIDENTES_REGION` |
| Lo que ya existe para el Bloque C | El backend ya usa `@aws-sdk/s3-request-presigner` (`files.ts`) y ya tiene un bucket **privado** con URLs firmadas para la evidencia de incidentes (`incidenteArchivos.ts`). Hacer privados los PDF de facturas no necesitaría dependencias nuevas (§6) |

### 2.3 Móvil

- **`expo-updates` no está instalado** (ni en `package.json` ni en `node_modules`). `app.json` no tiene `updates` ni `runtimeVersion`, y `eas.json` no tiene canales. **No hay forma de publicar una actualización por aire** con la configuración actual: una versión instalada solo se reemplaza con un build nuevo desde la tienda.
- `eas.json`: perfiles `development`, `preview` y `production`; `appVersionSource: "remote"` y `autoIncrement` (el número de build lo lleva EAS). `production` y `preview` apuntan a `agreeable-bee-782`.
- `app.json`: `version` **"1.0.0"**. No había ningún control de versión mínima.

### 2.4 Unidades de prueba

CDC **999** (`jd74hkf5rgmtdnxbfaa70vx2md8at7tx`) y Arboleda **9999** (`jd78amat67hhq9ax6jhg3yzxvd8avtjm`): fuera de la numeración de cada conjunto, con 1 y 2 facturas (marzo y abril, en $0) y un vínculo cada una. El código **no** las reconoce por el número —"999" puede existir en otro conjunto—: se declaran por **id** en `AVAL_UNIDADES_PRUEBA` (§5.3), sin escribir datos.

### 2.5 Línea base (PASO 0)

El *working tree* estaba limpio en `081916a`, que contiene la Fase 3. La línea base coincidió con la esperada en todas las suites: backend facturación **27 ✅ · 8 ❌ (35)**; `test:unit` **439 ✅**; `test:seguridad` **972 ✅ (45 archivos)**; web facturación **6 · 15 · 4 · 18 · 7 · 43**, todo verde; web `bun run test` **230 ✅**; móvil **25 ✅**; `tsc` sin errores en backend y web, y en el móvil solo el preexistente `packages/backend/convex/auth.ts(34,11)`. Los 8 fallos eran #36, #40, #41, #42, #44, #45, #54 y #55, con los mensajes de la Fase 3.

### 2.6 Las 8 pruebas y sus controles (PASO 2)

Lo que asierta cada una, leído del archivo:

| # | Prueba | Escenario | Qué asierta | Cómo lo cumple la Fase 4 |
|---|---|---|---|---|
| 36 | `F20-listPorFactura-sin-control` | Agosto de la 101 con un pago aprobado | `pagos.listPorFactura` llamada por el vecino de la 202 **lanza un error** | `exigirAccesoAPagos` (§4.4) |
| 37 | `F20-control` | El mismo | Llamada por la dueña de la 101: **1** pago, `estado: "aprobada"` | Vínculo vigente con la unidad |
| 38 | `F08-control` | Un carro de la 101, un reporte el 3 de septiembre | `parqueadero.listar`: `resumen.pendientes` = **1** y `valorPendiente` = **$7.000** | Un cobro pendiente |
| 39 | `F08-control` | Dos carros de la 101, reportados el 3 y el 4 | `pendientes` = **2** y `valorPendiente` = **$14.000** | La placa es parte de la identidad |
| 40 | `F08-reportes-duplican-cobro` | El mismo carro, reportado el 3, el 10 y el 17 de septiembre | `pendientes` = **1** y `valorPendiente` = **$7.000** | Agrupación por casa, placa y mes (§4.1) |
| 41 | `F08-estados-paralelos` | Un reporte que la administración marca "cobrada" con `guardia.gestionarNovedad` | La fila de `parqueadero.listar` con `_id` = el reporte **no** está `pendiente` | Vigilancia mueve el cobro. La fila conserva `_id` = su primer reporte |
| 42 | `F08-refacturar` | Un reporte facturado en 2026-10 con `marcarFacturado` | Facturarlo otra vez, en 2026-11, **lanza un error** | `transicionCobro` |
| 43 | `F10-control` | Agosto con "CONT. VOL. AREAS COMUNES" (código 5) por $7.000 | `aporte.reporte` de agosto: `valorTotal` de la 101 = **$7.000** | El cargo del mes |
| 44 | `F10-aporte-suma-arrastre` | Agosto: $7.000. Septiembre: la misma línea con $7.000 anteriores y $7.000 del mes | De agosto a septiembre, `valorTotal` = **$14.000** (antes, $21.000) | Suma `actual`, no `total` (§4.2) |
| 45 | `F10-aporte-concepto-equivocado` | La 202 con "Parqueadero visitante" (código 5) por $10.000 | La 202 **no aparece** en `aporte.reporte` | Concepto por texto: sin cargos ni deuda, la casa no sale |
| 53 | `F16-control` | Agosto y septiembre de la 101 | `facturas.listMia` de la dueña: los períodos **2026-08 y 2026-09** | — |
| 54 | `F16-listMia-duplica` | Un segundo vínculo de la dueña a la 101 | `listMia` devuelve **2** facturas | `misUnidadIds` no repite casas (§4.3) |
| 55 | `F16-listMia-vigencia` | Una arrendataria cuyo vínculo terminó hace 30 días | `listMia` devuelve **0** | Solo vínculos vigentes |

**Compatibilidad:** ninguna contradice a otra ni pide un diseño forzado. Hay tres puntos del diseño que vienen de ellas:

- #41 y #42 identifican el cobro por **el id de un reporte**. Por eso las mutaciones siguen recibiendo `reporteId` y la fila de cada cobro conserva `_id` = su primer reporte. Esto es lo mismo que necesita la web publicada (§4.1).
- #43 y #44 leen `valorTotal`. Ese campo pasa a ser los **cargos** del rango, y la deuda va en un campo aparte.
- #45 pide que la casa no aparezca, no una fila en $0. El reporte solo lista casas con cargos o con deuda.

---

## 3. Cambios por componente

| Componente | Archivo | Cambio |
|---|---|---|
| **Esquema** (solo aditivo) | `convex/schema.ts` | Tablas nuevas `cobrosParqueadero` (índices `by_condominio`, `by_condominio_clave`) y `cobroParqueaderoEventos` (`by_cargo`). `guardiaNovedadReportes`: campo opcional `cargoId` e índice `by_cargo`. `condominios.aporteVoluntario`: campo opcional `conceptos` |
| **Parqueadero** | `convex/lib/cobroParqueadero.ts` | Puro: `periodoEnColombia`, `periodoDeReporte`, `claveCobro`, `casaDelCobro`, `estadoDeReportesViejos`, `TRANSICIONES_COBRO` y `transicionCobro`, `agruparEnCobros`, `gestionDeCobro`. `periodoSiguiente` pasa a hora de Colombia |
| | `convex/model/cobroParqueadero.ts` *(nuevo)* | El único escritor del estado: `cobroDeReporte` (crea o encuentra el cobro y enlaza los reportes viejos de su clave), `agregarReporteACobro`, `aplicarAccionCobro`, `historiaDeCobro` |
| | `convex/parqueadero.ts` | `listar` devuelve cobros (una fila por casa, vehículo y mes); `marcarFacturado`, `descartar` y `devolverAPendiente` (ahora con motivo opcional) pasan por el modelo. **Nuevas:** `historial` y `agruparReportes` (interna, `dryRun` por defecto) |
| | `convex/guardia.ts` | `reportarNovedad` mete el reporte de un vehículo en su cobro del mes. `gestionarNovedad` mueve el cobro en un reporte de vehículo (con `periodo` opcional). `listNovedadReportes` y las vistas del guarda derivan `gestion` del cobro y agregan `cobro` |
| | `convex/limpieza.ts` | Los cobros y su historia se limpian con los reportes de los que salen |
| **Aporte** | `convex/lib/aporte.ts` | `CONCEPTO_APORTE` por texto, `normalizarConcepto`, `esLineaDeAporte` (con `conceptos` opcionales), `cargoAporteDeFactura` (`actual`), `deudaAporteDeFactura` (`total`) |
| | `convex/aporte.ts` | `reporte` suma cargos y da la deuda de la última factura (`deudaUltimaFactura`, `periodoUltimaFactura`); `consultarPlaca` con la regla nueva; `configurar` conserva `conceptos`; `diagnostico` |
| | `convex/lib/filtroAporte.ts` | Campo opcional `deudaUltimaFactura` |
| **Residente** | `convex/facturas.ts` | `listMia` con `misUnidadIds` y `facturasDelResidente`. `listPage` agrega `estadoVisible`. `resumenPeriodo` y `serie` con las dos cifras de recaudo (`sumaPagado` se conserva, documentado como "no es recaudo") |
| **Reglas** | `convex/lib/cartera.ts` | `DIA_INICIO_MORA`, `inicioDeMora` y la mora de `carteraDeUnidad` desde el 16; `fechaEnPalabras`, `plazosDeFactura`, `textosDePlazos`; `estadoVisibleDeFactura`, `ETIQUETA_SIN_VERIFICAR`, `TEXTO_SIN_VERIFICAR`; `facturasDelResidente` |
| | `convex/lib/recaudo.ts` *(nuevo)* | `recaudoContablePorPeriodo` y `recaudoVekinoPorPeriodo` |
| | `convex/lib/lecturaFactura.ts` | `numeroFacturaDe` |
| | `convex/lib/avalProduccion.ts` | `unidadesDePruebaAval`, `pasarelaPermitida`, `MENSAJE_PASARELA_DE_PRUEBAS` |
| | `convex/lib/versionApp.ts` *(nuevo)* | `leerVersion`, `compararVersiones`, `decidirVersion` |
| **Pagos** | `convex/model/accesoPagos.ts` *(nuevo)* | `puedeVerPagosDeUnidad`, `exigirAccesoAPagos`, `pagoPublico` |
| | `convex/pagos.ts` | `armarDatosTrn`: vínculo vigente y regla de QA. **Nuevas:** `opcionesDePago` y `pagoParaUsuario` (interna). `listPorFactura`, `verificarPago`, `estadoPago` y `estadoPagoPorPmt` con la regla de acceso y sin datos crudos |
| | `convex/soportesPago.ts` | **Nueva** `sinVerificarDeUnidad` (interna, para el bot y el agente) |
| | `convex/model/facturas.ts` | Al actualizar, `numeroFactura` no cambia (salvo una manual reemplazada por su PDF) |
| **Bot, agente y campana** | `convex/whatsapp.ts`, `convex/whatsappAgente.ts`, `convex/notificacionesFeed.ts` | Plazos de la regla B; meses "Sin verificar"; sin "Pagar en línea" con la pasarela en QA. Campana: "Sin verificar · …" |
| **Versión mínima** | `convex/appMovil.ts` *(nuevo)* | Query pública `versionMinima` |
| | `convex/_generated/api.d.ts` | Registro a mano de los módulos nuevos, en el orden de `codegen` (no se corrió ningún comando de Convex) |
| **Web: residente** | `app/mi/[id]/cuenta/page.tsx`, `app/mi/[id]/page.tsx`, `components/portal/portal-pay-button.tsx` | "Sin verificar"; "Precio completo hasta…" y "En mora desde…"; sin "Pagar" en línea con la pasarela en QA (si no hay portal del banco) |
| **Web: administración** | `components/vehiculos/cobros-parqueadero.tsx`, `app/condominio/[id]/vigilancia/page.tsx` | Una fila por cobro del mes, con sus reportes y su historia; devolver con motivo. Vigilancia pide el período al marcar "cobrada" y el motivo al descartar, y muestra el cobro del mes |
| | `components/vehiculos/reporte-aporte.tsx` | Cargos del rango y deuda de la última factura, por separado (pantalla y CSV) |
| | `app/condominio/[id]/reportes/page.tsx`, `app/condominio/[id]/page.tsx`, `app/condominio/[id]/finanzas/page.tsx` | Las dos cifras de recaudo, la tabla "Recaudo por período" y "Sin verificar" en la tabla de Finanzas |
| | `app/api/facturas/confirmar/route.ts` | `numeroFacturaDe` en las cargas nuevas |
| **Móvil** | `src/lib/resumen-facturas.ts`, `src/app/(app)/(tabs)/facturas.tsx`, `src/app/(app)/(tabs)/index.tsx` | `estadoVisible` con la cadena ("Sin verificar"), `plazosDe`; el detalle usa `opcionesDePago` ("Ya pagué" no depende de la pasarela); "Precio completo hasta…" y "En mora desde…" |
| | `src/components/condominio/admin-home.tsx`, `src/app/(app)/reportes.tsx` | Recaudo de la contabilidad y de Vekino |
| | `src/lib/version-minima.ts`, `src/components/aviso-version-minima.tsx` *(nuevos)*, `src/app/_layout.tsx` | Aviso de versión mínima, encima de todo (también en la pantalla de ingreso) |
| **Pruebas** | ver §7 | 3 archivos de la Fase 0 renombrados sin cambiar el contenido; `test:facturacion` del backend corre la red explícitamente; 4 pruebas existentes ajustadas a la regla B (justificado) |

**Las pruebas de la Fase 0 no se tocaron:** `pagos.regresion.ts`, `parqueadero.regresion.ts` y `residente.regresion.ts` se renombraron a `*.test.ts` con el **mismo SHA-1**: el del contenido (`sha1sum`: `bfb9d45…`, `ac71e79…`, `b3efd45…`) y el del blob de git (`git hash-object` contra `git rev-parse HEAD:<archivo>`: `54ea48f…`, `52d7ac7…`, `fc0bfc4…`). `escenario.ts`, `parserFacturas.test.mjs`, `resumenResidente.test.mjs` y los fixtures no cambiaron.

---

## 4. Bloque A — Los hallazgos que quedaban

### 4.1 Cobros de parqueadero (F-08)

**Identidad: (casa, vehículo, mes).**

- **El mes** es el del momento en que **ocurrió** el reporte (`ocurrioEn`, o el registro si no se indicó), **en hora de Colombia** (`periodoEnColombia`). El servidor corre en UTC: un carro visto el 30 de septiembre a las 10 p. m. ya es 1.º de octubre en UTC.
- **El vehículo** es la placa normalizada (sin espacios ni guiones, en mayúsculas), la misma de `normalizarPlaca`.
- **La casa** es la que **responde por el vehículo** cuando se reporta: la del vehículo, que `reportarNovedad` ya agregaba de primera. Queda guardada en el cobro. Un reporte puede nombrar **varias casas** (`unidades[]`): por ejemplo, la del carro y la de enfrente de donde estaba parqueado. Solo se le cobra a la del vehículo; las demás son contexto y se muestran en la fila (`casasNombradas`). Para los reportes viejos, que no guardaban cuál era:
  1. la casa del vehículo, si está entre las del reporte;
  2. si el reporte nombra una sola casa, esa;
  3. si no, ninguna: el cobro queda "sin casa" (`casaPorDefinir`) y la administración decide. No se adivina.

  Hoy los 122 reportes con vehículo nombran una sola casa: la regla 3 no aplica a ninguno.
- **La clave** es `unidadId|PLACA|AAAA-MM` (`claveCobro`), con índice por conjunto y clave. Las mutaciones de Convex son serializables y leen el índice antes de insertar: no se crean dos cobros de la misma clave.

**Un solo estado.** Vive en el cobro, no en los reportes. Las dos pantallas lo leen y lo mueven por el mismo código (`model/cobroParqueadero.ts`):

| En Vigilancia (`gestion`) | En Cobros de parqueadero |
|---|---|
| "Marcar cobrada" | facturado, en el período que se elija (por defecto, el mes siguiente) |
| "Descartar" | descartado, con motivo |
| "Reabrir" | pendiente |

Para un reporte de vehículo, `listNovedadReportes` deriva `gestion` del cobro. Una novedad sin vehículo (una gotera) sigue con su `gestion` de siempre: no es un cobro de parqueadero.

**Transiciones validadas** (`TRANSICIONES_COBRO`). Cualquier otra se rechaza con un mensaje estable:

| Desde \ acción | Facturar | Descartar | Devolver |
|---|---|---|---|
| pendiente | ✅ facturado (período AAAA-MM obligatorio) | ✅ descartado (motivo obligatorio) | ❌ "Este cobro ya está pendiente." |
| facturado | ❌ "Este cobro ya se facturó en 2026-10. Si quedó en la cuenta de cobro equivocada, primero devuélvelo a pendiente." (#42) | ❌ (primero devolver) | ✅ pendiente |
| descartado | ❌ (primero devolver) | ❌ "Este cobro ya está descartado." | ✅ pendiente |

**Historia** (`cobroParqueaderoEventos`, con el patrón de la bitácora de la Fase 3): por cada cambio, la acción, el estado antes y después, el período de la cuenta antes y después, el monto, el motivo, el origen (`cobros`, `vigilancia`, `reporte`, `migracion`), quién y cuándo. Se ve en Cobros de parqueadero ("Ver historia").

**Reportes que llegan a un cobro ya facturado.** El reporte entra al cobro como evidencia y **no genera otro cargo**: el cobro del mes ya está en una cuenta de cobro.

**Reportes viejos** (sin `cargoId`; hoy los 122):

- **Al leer**, se agrupan por la misma clave sin escribir nada (`agruparEnCobros`). Su estado inicial sale de sus dos estados viejos (`estadoDeReportesViejos`):
  - "cobrada" en Vigilancia o "facturado" en Cobros es el mismo hecho: facturado;
  - si un reporte del mes ya se facturó, el cobro del mes está facturado;
  - descartado, solo si todos lo están;
  - si no estaban de acuerdo, la fila lo avisa (`mezclado`).

  Hoy los 122 están `pendiente`/`pendiente`: los 52 cobros nacen pendientes.
- **La primera vez que alguien gestiona** un reporte viejo, desde cualquiera de las dos pantallas, se crea su cobro y se enlazan todos los reportes viejos de la misma clave. Es la operación normal de la aplicación.
- **`parqueadero.agruparReportes`** (interna) los deja enlazados de una vez, con un evento por cobro. `dryRun` vale `true` por defecto: dice qué haría sin escribir. Sobre los datos reales diría **122 reportes por enlazar en 52 cobros** (34 con varios reportes), 0 sin casa y 0 con estados mezclados (Anexo P1). Probada en convex-test: el `dryRun` no escribe, la aplicación escribe exactamente eso y una segunda pasada sale vacía. **No se ejecutó.**

**Compatibilidad con la web anterior.** Cada fila de Cobros de parqueadero conserva `_id` = el primer reporte del cobro, que es lo que la pantalla vieja manda a `marcarFacturado`, `descartar` y `devolverAPendiente`: con el backend nuevo, la web vieja factura el mes entero. La pantalla vieja de Vigilancia no pide motivo al descartar: se acepta, y la historia dice "Descartado desde Vigilancia sin escribir el motivo.", con quién y cuándo. La nueva lo pide.

**Tarifas:** las de siempre (`aporteVoluntario` del conjunto o $7.000 carro / $3.000 moto), por cobro y no por reporte.

### 4.2 Aporte voluntario (F-10)

- **El concepto se reconoce por su texto** (`esLineaDeAporte`), sin mayúsculas, tildes ni puntuación: "CONT VOL…", "CONT VOLUNTARIA…", "CONTRIBUCION VOLUNTARIA", "APORTE VOLUNTARIO". **El código 5 no basta.**
- **Qué es el aporte en cada conjunto** (datos reales):
  - **Ciudad del Campo:** código 5, con tres redacciones: "CONT. VOL. AREAS COMUNES" (626 líneas), "CONT VOLUNTARIA AREAS COM" (117) y "CONT VOLUNTARIA AREAS COMUN" (90). El "APORTE NAVIDEÑO" (código 7, 35 líneas) **no** es el cupo y no entra.
  - **Arboleda:** el código 5 es "Parqueadero visitante" (1.170 líneas). **Arboleda no tiene aporte voluntario en sus facturas.**
- **Configuración por conjunto, opcional:** `condominios.aporteVoluntario.conceptos`. Si un conjunto llama distinto al aporte, se escriben sus textos desde "Tarifas" (`aporte.configurar`, que ahora los conserva al cambiar tarifas). Sin configuración rige el texto. Hoy ningún conjunto la tiene, y no hace falta escribirla.
- **Lo que se suma y lo que no:**
  - El reporte suma el **cargo del mes** (`actual`) de cada factura del rango: $7.000 + $7.000 = $14.000 (#44).
  - La **deuda** del aporte es el `total` de la última factura del rango (`deudaUltimaFactura`). No se suma entre meses: ya trae lo anterior.
  - El color de cada casa en el reporte sale de esa deuda.
- **El color del guarda** (`aporte.consultarPlaca`) usa la misma regla de concepto, con la deuda de la última factura de la casa. **Cambia 1 casa de 265 vehículos**: un vehículo de Arboleda pasa de rojo a gris; su "Parqueadero visitante" se leía como aporte vencido. En Ciudad del Campo no cambia ninguno (Anexo A2).

### 4.3 La lista del residente (F-16)

- **Unidades:** `misUnidadIds`, la puerta de todo el acceso del residente. Solo vínculos **vigentes** (#55) y cada casa una vez aunque tenga dos vínculos (#54).
- **Facturas:** por unidad, por el índice `by_condominio_unidad_periodo` en orden de período descendente (hasta 50 por unidad). `facturasDelResidente` deja **siempre todas las del período más reciente de cada unidad** —la vigente, y su gemela si la hubiera, para que `facturaVigente` vea el empate—, completa hasta 50 con las más recientes y no repite ninguna (`_id`). Antes se recortaba a 50 por fecha de carga entre todas las unidades, y una casa cuyas facturas se cargaron antes podía quedarse sin su vigente; con ella, sin estado ni botón de pago.
- **Hoy no cambia lo que ve nadie:** 0 vínculos repetidos, 0 vínculos con vigencia y como máximo 8 facturas por unidad (Anexo L1). Protege lo que viene.

### 4.4 Quién ve los pagos (F-20)

**Regla única** (`model/accesoPagos.ts`). Pueden ver los pagos de una unidad:

- el staff de plataforma;
- la **administración** y la **contadora** del conjunto, con membresía activa;
- quien tenga un **vínculo vigente** con la unidad.

No pueden la junta directiva (ve la cartera, no los pagos de cada casa), el vecino, un guarda, otro conjunto, ni un arrendatario con el contrato vencido.

| Función | Antes | Ahora |
|---|---|---|
| `pagos.listPorFactura` (query) | Solo pedía sesión. Devolvía el registro entero, con `trnRaw` y `basicDataRaw` | La regla única sobre la unidad de la factura (#36; #37 sigue verde). Devuelve `pagoPublico`: sin respuestas crudas del banco, sin enlace de pago, sin ids de usuario ni de la petición |
| `pagos.verificarPago` (action) | **No validaba nada.** Cualquier sesión con el id de un pago lo hacía consultar al banco (la página de retorno lo llama cada 15 s) y recibía el registro entero | Valida la regla **antes** de hablar con el banco y devuelve `pagoPublico` |
| `pagos.estadoPago` (query) | **Hueco:** un pago sin `userId` no se validaba; y un vínculo vencido seguía dando acceso | La regla única |
| `pagos.estadoPagoPorPmt` (query) | Igual que `estadoPago` | La regla única (responde `null` si no) |
| `pagos.armarDatosTrn` (`crearPagoFactura`, `puedePagar`) | Aceptaba un vínculo vencido | Solo vínculos vigentes, como F-16 |
| `pagos.puedePagar` / `opcionesDePago` | — | Solo responden sobre la sesión propia; no devuelven datos del pago |

**Revisión de las demás funciones públicas:**

- `pagos.ts`: el resto son internas (`internalQuery`, `internalMutation`, `internalAction`).
- `soportesPago.ts`: `crearMio` y `listMios` ya usaban `misUnidadIds`; `listByCondominio`, `countPendientes`, `vincularFactura`, `aprobar` y `rechazar` exigen administrador, contadora o junta directiva.
- **Observación sin cambio:** la **junta directiva puede aprobar y rechazar comprobantes**. Aprobar es evidencia de pago y mueve estados. Si solo debe hacerlo quien lleva las cuentas, es un cambio de una línea, pero es una decisión de la administración (§10).

**Datos reales:** 3 pagos (`fallida`, QA), los 3 con respuestas crudas guardadas, que estas funciones entregaban a cualquier sesión.

### 4.5 Recaudo (F-19)

| Cifra | Cálculo | Cuándo no se calcula |
|---|---|---|
| **Según la contabilidad** | Por unidad y meses **seguidos**: total(N) − saldo anterior(N+1). El saldo anterior es el de la fila Totales si el documento lo trae (`saldoAnteriorDe`). Con créditos: un saldo anterior negativo cuenta como pagado de más | Sin la factura N+1: `sinSiguiente` si el conjunto aún no tiene ese mes, `mesFaltante` si el conjunto lo tiene y la unidad no. Con una lectura en revisión: `enRevision`. **Con una factura cuyas líneas no suman su total: `noCuadra`** |
| **Registrada en Vekino** | Pagos de la pasarela `aprobada` (los reversados no) y comprobantes `aprobado` con monto, de las facturas del período | Comprobantes aprobados sin monto (anteriores a la Fase 3): se cuentan aparte (`comprobantesSinMonto`) y no se suman |

- **Por qué `noCuadra`.** La primera corrida sobre los datos reales dio, para agosto de Ciudad del Campo, un recaudo de **−$160,7 millones**. No es recaudo. Agosto se cargó antes de la Fase 2 (el 2026-08-21, sin las hojas de continuación): 44 facturas cuyas líneas suman $203,8 millones frente a $86,1 millones de totales, 22 de ellas en $0. Esas facturas no tienen la marca de revisión (son anteriores a la Fase 2), pero tienen la misma falla. Con la guarda, agosto da **$49.008.400 en 142 unidades** y 59 sin calcular. Las cifras de Ciudad del Campo mejorarán al aplicar el re-procesamiento de la Fase 2 y cargar el consolidado original de agosto (§9, pasos 6 y 7).
- **Dónde está:**
  - `facturas.resumenPeriodo` y `facturas.serie` (campos `recaudoContable`, `recaudoContableUnidades`, `recaudoContableSinCalcular` y `recaudoVekino*`);
  - Reportes: dos tarjetas y la tabla "Recaudo por período";
  - el inicio de la administración ("Recaudo del mes (contabilidad)", y "Sin calcular · Falta el mes siguiente" cuando aplica);
  - Finanzas;
  - el móvil (inicio de la administración y reportes).
- **`sumaPagado`** (la suma del total de las pagadas) se conserva para las versiones anteriores de la web y del móvil, documentado en el código como "no es recaudo". Las pantallas nuevas no lo usan.
- **Hoy**, el recaudo registrado en Vekino es **$0** en todos los períodos (0 pagos aprobados, 0 comprobantes). Las cifras por conjunto y mes, antes y después, están en el Anexo R1.

### 4.6 Número de factura (F-17)

- **Cargas nuevas:** `FAC-{período}-{casa del documento}` (`numeroFacturaDe`): `FAC-2026-10-104`, o `FAC-2026-10-104-T-I` en Arboleda. El mismo documento da siempre el mismo número, y la identidad (conjunto, unidad, período) ya era única. Sin casa legible, la posición, como antes.
- **Existentes:** no se renumeran. Además, `escribirFactura` ya **no cambia el número** de una factura que existe al actualizarla. Ese era el síntoma de F-17: re-subir con "actualizar" le daba otro. La excepción es una factura manual reemplazada por su PDF, que toma el del documento.
- Las 2.792 facturas actuales tienen el número por posición (`FAC-AAAA-MM-NNNN`) y lo conservan.

---

## 5. Bloque B — Lo que la Fase 3 dejó pendiente

### 5.1 Cuándo empieza la mora: decisión B

**Decisión del responsable:** "El fin de mes es el plazo del precio completo, que es lo que se le muestra al residente. Para Vekino, la mora empieza el día 16 del mes siguiente."

**Cómo se aplicó** (`inicioDeMora`): la mora de una factura sin pagar empieza a la **medianoche (Colombia) del día 16 del mes siguiente al del período**, o al día siguiente de su vencimiento si este es posterior. Por tipo de factura:

- **nuevas** (vencen el último día del mes): la mora empieza el 16 del mes siguiente;
- **ya guardadas** (vencen el 15 del mes siguiente): el 16, exactamente como siempre;
- **con un plazo propio más largo**, como una manual hasta el 25: no entra en mora antes de su plazo.

La regla sale del período: **no se re-fechó ninguna factura**. Los días de mora se cuentan desde el inicio de la mora (el 16 es el día 1). `vencimientoEnMora` sigue siendo el plazo que se le mostró al residente.

**Lo que ve el residente** (`textosDePlazos`, igual en todas las superficies):

> Con descuento hasta el 15 de octubre de 2026 · Precio completo hasta el 31 de octubre de 2026 · En mora desde el 16 de noviembre de 2026

| Superficie | Dónde |
|---|---|
| Web | "Mis facturas" (tarjeta de la factura pendiente y cada fila de la vigente), inicio ("Precio completo hasta el … · En mora desde el …"; en mora: "En mora desde el 16 de …") |
| Móvil | Lista ("Precio completo hasta…") y detalle ("En mora desde…") |
| Bot | La factura vigente: "Precio completo hasta el …" y "En mora desde el …" |
| Agente | `ver_estado_cuenta` devuelve `precioCompletoHasta` y `enMoraDesde` |

**Impacto, con los ciclos reales de carga** (Anexo M1). Las tres alternativas, para los ciclos que no son de la migración:

| Ciclo | A (Fase 3: mora desde el día 1) | **B (decidida: desde el 16)** | C ("plazo vencido" hasta el PDF) |
|---|---|---|---|
| CDC agosto (septiembre llegó el 8) | 7,6 días × **162** casas en falsa mora | **0** | 0 |
| Arboleda junio (julio llegó el 4 de agosto; falta mayo) | 34,9 × 131 | 19,9 × 131 | 0 |
| Arboleda julio (agosto llegó el 13) | 12,5 × 133 | **0** | 0 |
| Arboleda agosto (septiembre llegó el 16 a las 12:01) | 15,5 × 128 | **0,5 × 128** | 0 |
| Mora real que deja de verse frente a A | — | 39 / 37 / 39 / 44 casas, 15 días (del 1 al 15) | Las mismas, hasta que llega el PDF (7,6 a 34,9 días) |

- **Mes típico.** Ciudad del Campo carga entre el 8 y el 21, y Arboleda entre el 4 y el 16. Con B, la falsa mora desaparece cuando el PDF llega antes del 16, y se reduce a horas cuando llega ese día. Solo una carga muy tardía la deja. El costo es que la mora real se ve el 16 y no el 1.º.
- **Hoy no cambia ninguna unidad:** las 2.792 facturas guardadas vencen el 15 del mes siguiente, y con ellas A y B dan lo mismo (comprobado el 8, el 16 y el 20 de octubre). La diferencia empieza con la primera carga de octubre: con A, esas facturas estarían en mora desde el 1.º de noviembre; con B, desde el 16.

**Las pruebas de la red que miran la mora** —#47 y #49 (backend) y #81, #82, #83, #88, #89 y #91 (web)— siguen verdes sin tocarlas. Usan facturas con el vencimiento viejo, y el 16 es el mismo día con las dos reglas. Cuatro pruebas existentes sí contradecían la decisión y se ajustaron (§7.3).

### 5.2 "Sin verificar"

- **Regla** (`estadoVisibleDeFactura`, `lib/cartera.ts`), en este orden:
  1. en revisión, si su lectura lo está;
  2. pago en verificación, si lo tiene;
  3. **"Sin verificar"**, si es **histórica** (hay una factura posterior de la unidad) y quedó `pendiente`;
  4. su estado.

  Una histórica `pendiente` es una que ninguna factura siguiente pudo juzgar: falta el mes siguiente, o hubo un hueco. **No se sabe si se pagó**, y "Pendiente" decía que se debe, cuando lo que se debe hoy ya está en la vigente. Texto: **"Falta el estado de cuenta del mes siguiente para saber si se pagó."** El campo `estado` no cambia.
- **Superficies:**

| Superficie | Qué se ve |
|---|---|
| Web · "Mis facturas" | Insignia "Sin verificar" y el texto, en la fila |
| Web · inicio | Igual, en "Facturas recientes" |
| Móvil | Lista, detalle e inicio: "Sin verificar" y el texto |
| Bot | En "Factura": "ℹ️ {meses}: *Sin verificar*. Falta el estado de cuenta del mes siguiente para saber si se pagó. Lo que debes hoy ya está en esta factura." (`soportesPago.sinVerificarDeUnidad`) |
| Agente | `ver_estado_cuenta` devuelve `mesesSinVerificar` y qué decir (no son deuda aparte) |
| Campana | "Sin verificar · Falta el estado de cuenta del mes siguiente para saber si se pagó." (antes: "Su saldo pasó a la factura siguiente") |
| Finanzas | La tabla muestra "Sin verificar" (`listPage` agrega `estadoVisible`), y el detalle, el texto |

- **Cuántas** (Anexo S1):
  - **hoy, 0**: la conciliación vieja juzgaba a través de los huecos, así que ninguna histórica quedó `pendiente`;
  - **después de "Conciliar" con las reglas de la Fase 3, 87**: las del Anexo H2 de la Fase 3 que quedan sin veredicto por un mes faltante (CDC junio 58; Arboleda abril 23; CDC mayo, febrero y enero, 2 cada una).

### 5.3 La pasarela en QA

- **Regla** (`pasarelaPermitida`, `lib/avalProduccion.ts`):

| `AVAL_AMBIENTE` | Sobre qué unidades opera la pasarela |
|---|---|
| `qa` | Solo las unidades cuyo **id** esté en `AVAL_UNIDADES_PRUEBA` (separadas por comas, espacios o saltos de línea); **sin la lista, ninguna** |
| `prod` | Todas, como en la Fase 3 |
| Sin definir | No decide esta regla: la pasarela ya se niega a crear o consultar transacciones (Fase 3) |

  **No se definió la variable.** Los ids candidatos son los de §2.4.
- **Mensaje estable** (`MENSAJE_PASARELA_DE_PRUEBAS`): "El pago en línea todavía no está habilitado: la pasarela está en modo de pruebas. Paga por los canales habituales del conjunto y, si quieres, envía el comprobante."
- **Dónde se aplica:**

| Dónde | Qué hace con una unidad real en QA |
|---|---|
| `armarDatosTrn` (`crearPagoFactura`, el bot y el agente) | Rechaza con el mensaje estable, **después** de las reglas de vigencia, saldo y revisión |
| `puedePagar` | Responde que no |
| `opcionesDePago` *(nueva)* | `{ debe, pasarela, motivo }`: la factura se sigue debiendo (`debe`) aunque la pasarela no la acepte |
| Web | Con el portal del banco (`avalPortalUrl`, que tienen los dos conjuntos), "Pagar" abre el portal y no cambia. Sin portal, en vez del botón se muestra el mensaje |
| Móvil | "Pagar" aparece si hay portal del banco o la pasarela acepta. "**Ya pagué**" depende de `debe`, no de la pasarela. Si no hay ninguna de las dos, el detalle dice por qué |
| Bot | No muestra el botón "💳 Pagar en línea"; muestra el mensaje y "🧾 Ya pagué". Un botón "Pagar" viejo del chat recibe el mensaje |
| Agente | `generar_link_pago` responde `{ pagoEnLineaNoDisponible, queDecir }` sin generar enlace; `ver_estado_cuenta` informa `pagoEnLineaDisponible` |

- **Impacto** (Anexo Q1): hoy **366 unidades reales** tienen una vigente pagable (Arboleda 166, CDC 200). Con `qa` y sin lista, **el bot y el agente dejan de ofrecerles "Pagar en línea"**, que hoy les abre transacciones de prueba que no mueven plata. La web y el móvil nuevos no cambian para ellas: tienen el portal del banco.
- **Versiones viejas del móvil:** el detalle usa `puedePagar` para mostrar "Pagar" **y** "Ya pagué". Con el backend nuevo en `qa`, en una versión vieja esas casas no ven ninguno de los dos botones hasta actualizar. Pueden pagar por el banco y mandar el comprobante por WhatsApp. Si se prefiere evitarlo, hay dos salidas, que son decisión del responsable: pasar a `prod`, o publicar el móvil nuevo antes de desplegar el backend (§9, matriz).

### 5.4 Versiones viejas del móvil

- **Actualización por aire: no está configurada.** No hay OTA que publicar. Para tenerla, en un build futuro, sin hacerlo ahora:
  1. instalar `expo-updates` con la versión del SDK 54: `bunx expo install expo-updates`, y después `bunx expo install --check`;
  2. `app.json`: `"runtimeVersion": { "policy": "appVersion" }` y `"updates": { "url": "https://u.expo.dev/bd586790-b6fc-4c11-b8ec-c655b3775186" }` (el `projectId` del proyecto);
  3. `eas.json`: `"channel": "production"` en el perfil `production` y `"channel": "preview"` en `preview`;
  4. un **build nuevo de tienda** (`eas build --profile production`): solo los builds que traen `expo-updates` pueden recibir OTA;
  5. desde ahí, cada cambio de JS se publica con `eas update --channel production --message "…"` y se verifica con `eas update:list` antes de anunciarlo.

  **Nada de esto se ejecutó** (regla 2).
- **Versión mínima (nuevo):**
  - la app manda su versión (`expo.version` de `app.json`, la que quedó en el build) y su plataforma a `appMovil.versionMinima`;
  - si es anterior a `MOVIL_VERSION_MINIMA` (o `MOVIL_VERSION_MINIMA_IOS` / `_ANDROID`), muestra encima de todo "Actualiza Vekino" con el enlace a la tienda;
  - **sin la variable no bloquea a nadie**, y una versión que no se puede leer tampoco.

  Para que sirva, **cada build de tienda debe subir `expo.version`** (hoy todas dicen "1.0.0"; el número de build lo lleva EAS aparte).
- **Lo que no se puede arreglar desde el código para las versiones ya instaladas:**
  - no tienen el aviso de versión mínima (es nuevo), así que no se les puede pedir que actualicen desde la app;
  - siguen con su lógica de pantalla: sumaban `pendiente` antes de la Fase 1, no conocen "en revisión", "pago en verificación" ni "sin verificar", anuncian el vencimiento como único plazo y su "Pagar" abre el portal del banco, que cobra lo que diga el banco.

  Lo que sí las protege es el backend, que decide qué se puede pagar (`armarDatosTrn`), quién ve qué (`listMia`, pagos) y el estado de cuenta.

---

## 6. Bloque C — PDF privados: fuera de alcance

**No se marcó en "Decisiones del responsable", así que no se hizo.** Lo verificado (§2.2):

- **Situación:** 2.792 PDF públicos por política del bucket, 2.503 con llave predecible. Las unidades de prueba tienen documentos personales ajenos servidos públicamente (Fase 2, §12).
- **Lo necesario existe en el repositorio:** el presignador de AWS ya es dependencia del backend, y hay un bucket privado con URLs firmadas para la evidencia de incidentes. Con eso, el cambio sería:
  - las superficies piden una URL firmada y de corta duración a una query que valide el acceso, igual que §4.4;
  - el bucket deja de ser público, o los PDF van a uno privado.
- **Dos cosas que no se resuelven con código:**
  - el bot manda el PDF por su URL, y WhatsApp la descarga; con URL firmada, debe ser de vida suficiente para esa descarga;
  - hacer privado el bucket es un cambio de infraestructura (paso 4 del §9, con autorización).

---

## 7. Pruebas

### 7.1 Resultado por suite (antes = `081916a`, después = *working tree*)

| Suite | Antes | Después |
|---|---|---|
| Backend · facturación (`bun run test:facturacion`) | 27 ✅ · 8 ❌ (35, los tres `*.regresion.ts`) | **55 ✅ (55)**: los cinco archivos de la red, por nombre (§7.3) |
| Backend · unitarias (`test:unit`) | 439 ✅ | **458 ✅** (+19) |
| Backend · convex-test (`test:seguridad`) | 972 ✅ (45 archivos) | **1.036 ✅ (49 archivos)**: 29 nuevas y las 35 renombradas |
| Web · facturación | 6 · 15 · 4 · 18 · 7 · 43 | 6 · 15 · 4 · **12** · 18 · 7 · 43, todas ✅. La de la Fase 4 va en su propio proceso |
| Web · todo (`bun run test`) | 230 ✅ | **242 ✅** |
| Móvil | 25 ✅ | **29 ✅** |
| Tipos (`tsc --noEmit`) | Backend y web sin errores; móvil solo `auth.ts(34,11)` | **Igual** |

### 7.2 Cruce resultado por resultado contra la tabla #1–#91

"Antes" es la línea base de esta fase (`081916a`); "Después", el *working tree*. Los títulos, la fase y la columna "Fase 0" salen de la tabla de la Fase 0 y del cruce de la Fase 2. Fuentes de los resultados:

- **backend:** los reportes JSON de vitest, de la red y de la suite normal, porque los archivos de la red pasaron a `*.test.ts`;
- **web:** el JUnit de `pruebas/facturacion`.

#### Las 8 pruebas de la Fase 4

| # | Prueba | Archivo | Fase 0 | Antes | Después |
|---|---|---|---|---|---|
| 36 | `F20-listPorFactura-sin-control` — el vecino de la 202 no puede listar los pagos de la factura de la 101 | `pagos.regresion.ts → pagos.test.ts` | ❌ | ❌ | ✅ |
| 40 | `F08-reportes-duplican-cobro` — tres reportes del mismo carro en septiembre son UN cobro de $7.000, no tres | `parqueadero.regresion.ts → parqueadero.test.ts` | ❌ | ❌ | ✅ |
| 41 | `F08-estados-paralelos` — marcarlo 'cobrada' en Vigilancia no lo deja 'pendiente' en Cobros de parqueadero | `parqueadero.regresion.ts → parqueadero.test.ts` | ❌ | ❌ | ✅ |
| 42 | `F08-refacturar` — un cargo ya facturado en octubre no se puede volver a facturar en noviembre | `parqueadero.regresion.ts → parqueadero.test.ts` | ❌ | ❌ | ✅ |
| 44 | `F10-aporte-suma-arrastre` — agosto y septiembre con $7.000 de aporte cada uno suman $14.000, no $21.000 | `parqueadero.regresion.ts → parqueadero.test.ts` | ❌ | ❌ | ✅ |
| 45 | `F10-aporte-concepto-equivocado` — el código 5 de Arboleda ('Parqueadero visitante') no es aporte voluntario | `parqueadero.regresion.ts → parqueadero.test.ts` | ❌ | ❌ | ✅ |
| 54 | `F16-listMia-duplica` — un vínculo repetido a la misma casa no repite las facturas | `residente.regresion.ts → residente.test.ts` | ❌ | ❌ | ✅ |
| 55 | `F16-listMia-vigencia` — un arrendatario cuyo contrato venció ya no ve las facturas de la casa | `residente.regresion.ts → residente.test.ts` | ❌ | ❌ | ✅ |

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
| 22 | `F02-control` — septiembre trae los $50.000: agosto queda abonada (no vencida) y el pago sigue aprobado y ligado | `pagos.regresion.ts → pagos.test.ts` | ✅ | ✅ | ✅ |
| 25 | `F01-control (Caso C)` — septiembre, la vigente, sí se puede pagar y por $350.000 | `pagos.regresion.ts → pagos.test.ts` | ✅ | ✅ | ✅ |
| 31 | `F01-control` — la vigente (septiembre) sí se acepta, por su total acumulado | `pagos.regresion.ts → pagos.test.ts` | ✅ | ✅ | ✅ |
| 32 | `F01-control` — una factura pagada se sigue rechazando | `pagos.regresion.ts → pagos.test.ts` | ✅ | ✅ | ✅ |
| 34 | `F06-control` — el 10 de septiembre (dentro del 1–15) se cobra con descuento: $340.000 | `pagos.regresion.ts → pagos.test.ts` | ✅ | ✅ | ✅ |
| 35 | `F06-control` — el 20 de octubre (después del vencimiento guardado) se cobra $380.000 | `pagos.regresion.ts → pagos.test.ts` | ✅ | ✅ | ✅ |
| 37 | `F20-control` — la dueña de la factura sí ve su pago | `pagos.regresion.ts → pagos.test.ts` | ✅ | ✅ | ✅ |
| 38 | `F08-control` — un reporte del carro es un cobro pendiente por la tarifa del carro | `parqueadero.regresion.ts → parqueadero.test.ts` | ✅ | ✅ | ✅ |
| 39 | `F08-control` — dos carros distintos de la misma casa en el mismo mes son dos cobros (la identidad es casa + vehículo + período) | `parqueadero.regresion.ts → parqueadero.test.ts` | ✅ | ✅ | ✅ |
| 43 | `F10-control` — un mes con $7.000 de aporte suma $7.000 | `parqueadero.regresion.ts → parqueadero.test.ts` | ✅ | ✅ | ✅ |
| 46 | `F03-control` — la carga reproduce los estados de producción: abril y junio 'vencida', mayo/julio/agosto 'pagada', septiembre 'pendiente' | `residente.regresion.ts → residente.test.ts` | ✅ | ✅ | ✅ |
| 47 | `F03-control` — la cartera de la administración la ve 'pendiente', sin mora, debiendo solo septiembre ($289.000) | `residente.regresion.ts → residente.test.ts` | ✅ | ✅ | ✅ |
| 50 | `F01-control` — con la vigente pendiente, el bot ofrece la vigente | `residente.regresion.ts → residente.test.ts` | ✅ | ✅ | ✅ |
| 53 | `F16-control` — la propietaria ve sus dos facturas, una vez cada una | `residente.regresion.ts → residente.test.ts` | ✅ | ✅ | ✅ |
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
| 24 | `F01-factura-historica-doble-pago (Caso C)` — tras cargar septiembre, el residente no puede iniciar otro pago de agosto (web ni WhatsApp) | `pagos.regresion.ts → pagos.test.ts` | ❌ | ✅ | ✅ |
| 26 | `F01-factura-historica-doble-pago (Caso B)` — cuando la vigente queda pagada, la absorbida no vuelve a ser pagable | `pagos.regresion.ts → pagos.test.ts` | ❌ | ✅ | ✅ |
| 27 | `F03-cartera-mora-tras-pago (Caso B)` — la cartera de la administración debe ver la casa al día después de pagar septiembre | `pagos.regresion.ts → pagos.test.ts` | ❌ | ✅ | ✅ |
| 28 | `F01-armarDatosTrn-no-vigente` — agosto (vencida) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts → pagos.test.ts` | ❌ | ✅ | ✅ |
| 29 | `F01-armarDatosTrn-no-vigente` — agosto (abonada) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts → pagos.test.ts` | ❌ | ✅ | ✅ |
| 30 | `F01-armarDatosTrn-no-vigente` — agosto (pendiente) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts → pagos.test.ts` | ❌ | ✅ | ✅ |
| 48 | `F03-navBadges-historial` — el contador de vencidas no cuenta abril y junio, ya saldadas | `residente.regresion.ts → residente.test.ts` | ❌ | ✅ | ✅ |
| 49 | `F03-navBadges-mora-actual` — si la factura vigente ya venció, el contador sí la cuenta | `residente.regresion.ts → residente.test.ts` | ❌ | ✅ | ✅ |
| 51 | `F01-bot-ofrece-absorbida` — si la vigente ya está pagada, el bot no ofrece pagar la absorbida | `residente.regresion.ts → residente.test.ts` | ❌ | ✅ | ✅ |
| 52 | `F12-bot-elige-por-orden-de-carga` — el bot elige la factura por período, no por la última que se subió | `residente.regresion.ts → residente.test.ts` | ❌ | ✅ | ✅ |
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

#### Las 11 pruebas de la Fase 3

| # | Prueba | Archivo | Fase 0 | Antes | Después |
|---|---|---|---|---|---|
| 2 | `F02-pagada-a-vencida` — agosto pagado por la pasarela no pasa a 'vencida' porque septiembre arrastre los $300.000 | `estados.regresion.ts → estados.test.ts` | ❌ | ✅ | ✅ |
| 3 | `F02-pagada-a-abonada` — agosto pagado por la pasarela no pasa a 'abonada' porque septiembre arrastre $40.000 | `estados.regresion.ts → estados.test.ts` | ❌ | ✅ | ✅ |
| 4 | `F12-comprobante-sobrescrito` — un comprobante aprobado por la administración tampoco se borra por inferencia | `estados.regresion.ts → estados.test.ts` | ❌ | ✅ | ✅ |
| 5 | `F02-conciliar-boton` — el botón 'Conciliar' (facturas.reconciliar) tampoco degrada una factura pagada con evidencia | `estados.regresion.ts → estados.test.ts` | ❌ | ✅ | ✅ |
| 10 | `F11-bulkFacturas-duplica` — la migración no crea una segunda factura de agosto para la casa 101 si ya la subió la web | `importacion.regresion.ts → importacion.test.ts` | ❌ | ✅ | ✅ |
| 11 | `F11-bulkFacturas-resetea-estado` — re-ejecutar la migración no devuelve a 'pendiente' una factura pagada | `importacion.regresion.ts → importacion.test.ts` | ❌ | ✅ | ✅ |
| 12 | `F11-upsertFactura-resetea-estado` — la importación por script (upsertFactura) no devuelve a 'pendiente' una factura pagada | `importacion.regresion.ts → importacion.test.ts` | ❌ | ✅ | ✅ |
| 17 | `F09-hueco-de-periodo` — agosto → [septiembre sin cargar] → octubre: el saldo de octubre no basta para juzgar agosto | `importacion.regresion.ts → importacion.test.ts` | ❌ | ✅ | ✅ |
| 21 | `F13-pago-parcial-marcado-pagada` — $250.000 aprobados sobre $300.000 dejan un saldo de $50.000: agosto no puede quedar 'pagada' | `pagos.regresion.ts → pagos.test.ts` | ❌ | ✅ | ✅ |
| 23 | `F02-conciliacion-sobrescribe-pago (Caso A)` — la contabilidad cortó antes de aplicar el abono y septiembre arrastra $300.000: agosto no puede quedar 'vencida' con $250.000 aprobados | `pagos.regresion.ts → pagos.test.ts` | ❌ | ✅ | ✅ |
| 33 | `F06-descuento-vencido` — el 8 de octubre (fecha del pago QA real) se cobra $380.000, no $340.000 | `pagos.regresion.ts → pagos.test.ts` | ❌ | ✅ | ✅ |

### 7.3 Cambios en pruebas existentes

- **Fase 0:**
  - `pagos.regresion.ts` → `pagos.test.ts`, `parqueadero.regresion.ts` → `parqueadero.test.ts` y `residente.regresion.ts` → `residente.test.ts`, por la convención de la Fase 0 (§2): quedaron completamente en verde. **El contenido no cambió** (mismo SHA-1). Se movieron con `mv`, sin *staging*.
  - Ningún otro archivo de la Fase 0 se tocó.
- **Fase 3:** `pruebas/estadoFactura.prueba.ts`, prueba "vencimiento nuevo: el último día del mes del período…".
  - Afirmaba que el 1.º de octubre ya había mora para una factura de septiembre con vencimiento a fin de mes.
  - **La decisión B lo contradice:** la mora empieza el 16 del mes siguiente.
  - **Cambio:** el 1.º y el 15 de octubre son `pendiente`, y el 16 a medianoche, `en_mora`. Lo que protege —el último día del mes todavía se paga— sigue igual.
  - El cambio va comentado en el archivo.
- **Anteriores a la auditoría:** `pruebas/cartera.prueba.ts`, tres pruebas de `carteraDeUnidad`. Arman facturas con vencimientos arbitrarios, anteriores al 16 del mes siguiente, y esperaban la mora desde el día después de ese vencimiento.
  - "caso 2 — la ultima vencida": julio con plazo el 4 de agosto. Con la regla B, su mora empieza el 16 de agosto: **24 días** el 8 de septiembre, no 35.
  - "las pagadas viejas no arrastran mora…" y "sin fecha en una, pero con fecha en otra…": la factura vencida pasa de agosto a **julio**. Una de agosto no está en mora el 8 de septiembre, y la prueba dejaría de medir lo que mide. La primera conserva sus 20 días; la segunda pasa a 24.

  Lo que protegen —la mora la cuenta la más reciente, una factura sin fecha no inventa días— no cambió. Cada cambio va comentado.
- **Ninguna aserción de la red se debilitó.** Las que miran la mora —#47, #49, #81, #82, #83, #88, #89 y #91— siguen verdes sin tocarlas.
- **`test:facturacion` del backend** (`vitest.facturacion.config.mts`) ya no busca `*.regresion.ts`: con los renombres no quedaba ninguno, y el script habría corrido vacío. Ahora lista **explícitamente** los cinco archivos de la red —`estados`, `importacion`, `pagos`, `parqueadero` y `residente`, **55 pruebas**—, que además corren en la suite normal.
- **`test:facturacion` de la web** suma `pruebas/fase4Facturacion.test.mjs` en su propio proceso, porque simula `convex/react` con respuestas propias. Sigue corriendo la carpeta `pruebas/facturacion`, con las **36** de la red (`parserFacturas` y `resumenResidente`).
- **Las 91 de la red:** `cd packages/backend && bun run test:facturacion` (55) más las 36 de la carpeta `pruebas/facturacion` en `cd apps/web && bun run test:facturacion`.

### 7.4 Pruebas nuevas (64)

| Suite | Archivo | Qué prueban |
|---|---|---|
| Unitarias (19) | `packages/backend/pruebas/fase4Facturacion.prueba.ts` | · **Parqueadero:** el mes en hora de Colombia, también en el borde (30 de septiembre a las 10 p. m.) y en el cambio de año; la identidad con la placa normalizada; la casa de un reporte con varias; los dos estados viejos como uno; las transiciones con sus mensajes; tres reportes = un cobro y el borde de mes separa; un reporte viejo se une al cobro guardado. <br>· **Aporte:** concepto por texto (CDC sí; "Parqueadero visitante" y "APORTE NAVIDEÑO" no; conceptos configurados); cargo (`actual`) y deuda (`total`). <br>· **`listMia`:** la vigente con más de 50 facturas, sin repetidas; el empate del período más reciente. <br>· **Recaudo:** contable con abono, crédito, hueco, sin el mes siguiente, en revisión y lecturas que no cuadran; Vekino con aprobados, reversados, fallidos y comprobantes con y sin monto. <br>· **Mora B:** el 16 para los vencimientos nuevo y viejo, diciembre → enero, un plazo propio más largo; del 1 al 15 sin mora; los días desde el 16; los tres textos. <br>· **"Sin verificar":** histórica pendiente sí; vigente pendiente, vencida y pagada no; revisión primero. <br>· **QA:** sin lista ninguna, con lista solo las declaradas, `prod` todas, sin variable no decide. <br>· **Versión mínima** y **número de factura** |
| convex-test (29) | `packages/backend/pruebas/facturacion/cobrosOperativos.test.ts` | · **Parqueadero:** borde de mes; Vigilancia y Cobros mueven el mismo estado (facturar, reabrir, descartar con motivo, devolver); transiciones inválidas; la historia (quién, cuándo, estado y período anteriores, motivo); un reporte de un mes facturado no crea otro cobro; Vigilancia sin motivo; una novedad sin vehículo no es un cobro; reportes viejos agrupados al leer y enlazados al gestionar; `agruparReportes` en `dryRun`, aplicado y repetido. <br>· **Aporte:** color del guarda (CDC en rojo; el "Parqueadero visitante" de Arboleda en gris); cargos y deuda del reporte; conceptos configurados que sobreviven a cambiar tarifas. <br>· **`listMia`:** 56 facturas en dos casas, la vigente de la cargada antes; arrendatario vigente. <br>· **Pagos:** dueña, administración y contadora sí; vecino, junta, otro conjunto, guarda y sin sesión no; arrendatario vencido no; `verificarPago` sin datos crudos y sin acceso para el vecino; `estadoPago` y `estadoPagoPorPmt` con un pago sin usuario. <br>· **Recaudo:** `resumenPeriodo` y `serie` con abono, crédito, pago aprobado y el último mes sin calcular. <br>· **Mora B:** cartera y contador del 1 al 15 y el 16. <br>· **"Sin verificar":** campana, Finanzas (`listPage`) y el bot. <br>· **QA:** sin lista, con lista, otra unidad, `prod` y una histórica. <br>· **Versión mínima** sin y con la variable. <br>· **F-17:** "actualizar" no cambia el número |
| Web (12) | `apps/web/pruebas/fase4Facturacion.test.mjs` | Páginas reales: <br>· "Sin verificar" en "Mis facturas" y el inicio; <br>· los dos plazos ("Precio completo hasta el 31 de octubre" y "En mora desde el 16 de noviembre"); sin mora el 5 de noviembre y en rojo el 20; una factura vieja sigue entrando en mora el 16; <br>· pasarela en QA sin portal: sin "Pagar" y con el mensaje; con pasarela o portal, con "Pagar"; <br>· Reportes con las dos cifras de recaudo; <br>· Finanzas con "Sin verificar"; <br>· Cobros de parqueadero con una fila por mes y sus reportes |
| Móvil (4) | `apps/mobile/pruebas/fase4Facturas.prueba.ts` | "Sin verificar" con la cadena y desde el backend; la tarjeta cobra solo la vigente; los plazos y la mora del 16; versión mínima y tienda por plataforma |

---

## 8. Impacto sobre los datos reales (PASO 16)

**No se escribió nada.** Es una simulación local sobre la exportación de solo lectura del 2026-10-08:

- 2.792 facturas, 379 unidades, 3 conjuntos;
- 3 pagos (`fallida`, QA) y 0 comprobantes;
- 377 vínculos y 124 reportes del guarda;
- 265 vehículos, 0 importaciones, 0 eventos y 0 discrepancias.

Usa el **mismo código** del *working tree* y, para el "antes", las reglas de `HEAD` (`lib/aporte.ts`, `lib/cartera.ts`). `ahora` = 2026-10-08 12:00 (Bogotá). Las unidades de prueba van aparte. Sin nombres ni placas.

| Pregunta | Respuesta (anexo) |
|---|---|
| Cobros de parqueadero | 122 reportes con vehículo, todos de CDC y de septiembre: **antes 122 cobros por $790.000; después 52 por $336.000**. 34 cobros agrupan 104 reportes. `agruparReportes` en `dryRun`: 122 por enlazar en 52 cobros (P1) |
| Aporte: el reporte | CDC, todo el rango: **$81.693.906 → $47.204.200** en cargos, y deuda de la última factura $14.923.100. Arboleda: **$8.721.722 → $0**, sin aporte. La unidad CDC 402: $9.414.600 → $525.200 (A1) |
| Aporte: el color del guarda | Cambia **1 casa** (un vehículo de Arboleda, de rojo a gris); en CDC, ninguna (A2) |
| Recaudo | Las dos cifras por conjunto y mes, frente a la vieja. El de Vekino es $0 en todos los meses. El contable de CDC queda sin calcular en 47 a 88 unidades por mes, por lecturas anteriores a la Fase 2 que no cuadran; se recupera con el re-procesamiento (R1) |
| Mora A / B / C | B elimina la falsa mora cuando el PDF llega antes del 16 (CDC agosto: de 162 casas × 7,6 días a 0). Hoy no cambia ninguna unidad (M1) |
| "Sin verificar" | **0 hoy; 87 después de "Conciliar"** (S1) |
| Pasarela en QA | 366 unidades reales dejan de ver "Pagar en línea" en el bot y el agente; en la web y el móvil, nada (Q1) |
| PDF públicos | 2.792; 2.503 con llave predecible; superficies en §2.2 (D1) |
| `listMia` y pagos | 0 vínculos repetidos o vencidos; máximo 8 facturas por unidad; 3 pagos con datos crudos expuestos hasta hoy (L1) |

---

## 9. Plan de despliegue consolidado (Fases 2, 3 y 4)

**De dónde se parte** (§2.1):

- el deployment de los residentes (`agreeable-bee-782`, tipo *dev*) ya tiene el esquema y el backend de la Fase 3, con `AVAL_AMBIENTE=qa`;
- la web publicada es anterior a la Fase 2;
- el móvil instalado no tiene actualizaciones por aire;
- nada de lo que escribe la Fase 3 se ha escrito todavía: 0 eventos, 0 discrepancias, 0 importaciones.

**Antes de cada paso que escribe** (3, 5, 6, 7, 8 y 9): una copia de la base con `npx convex export --path <archivo>`, que solo lee. Es la reversión de último recurso.

| # | Qué se hace | Quién autoriza | Cómo se verifica | Cómo se revierte |
|---|---|---|---|---|
| **1** | **Separar desarrollo de producción y sacar la llave del repositorio.** Recomendado: tratar `agreeable-bee-782` como la producción de hecho —ahí están los datos de los residentes— y crear un deployment de **desarrollo** aparte para trabajar. Hay que: <br>· quitar `CONVEX_DEPLOY_KEY` de `packages/backend/.env.local` y **rotarla**; <br>· guardar la nueva solo donde se despliega (la máquina del responsable o el CI); <br>· apuntar el `.env.local` de cada desarrollador a su deployment de desarrollo. <br>Mover los datos a un deployment de producción nuevo (exportar e importar, y cambiar la URL de la web y del móvil) es otra opción, más larga: no hace falta para lo demás | Responsable técnico y dueño de la cuenta de Convex | Desde el repositorio, sin la llave, `bunx convex env get AVAL_AMBIENTE` ya no responde del deployment de los residentes. La web publicada sigue apuntando a `agreeable-bee-782.convex.cloud` (§2.1) | Volver a poner la llave. No se recomienda: la anterior estuvo en el repositorio |
| **2** | **Revisar las variables.** <br>· **`AVAL_AMBIENTE`:** `prod` solo con las credenciales del convenio certificadas (`faltantesParaProduccion` bloquea si falta algo). Si sigue `qa`, definir `AVAL_UNIDADES_PRUEBA` solo con las unidades de prueba (CDC 999 `jd74hkf5rgmtdnxbfaa70vx2md8at7tx`, Arboleda 9999 `jd78amat67hhq9ax6jhg3yzxvd8avtjm`), **antes** del paso 3. <br>· **`MOVIL_VERSION_MINIMA`:** sin definir hasta que el móvil nuevo esté en las tiendas (paso 3) | Responsable técnico; el banco, para `prod` | `bunx convex env get` de cada variable, clasificada. Después del paso 3: el bot no ofrece "Pagar en línea" a una casa real con `qa`, y sí a una unidad de prueba (`pagos.opcionesDePago`) | `bunx convex env set` con el valor anterior |
| **3** | **Desplegar: backend → web → móvil.** <br>· **Backend de la Fase 4** sobre el de la Fase 3, ya desplegado. El esquema es aditivo: 2 tablas, el índice `by_cargo` sobre los 124 reportes del guarda y campos opcionales. <br>· **Web** de las Fases 2, 3 y 4 juntas, **enseguida** del backend (matriz abajo). <br>· **Móvil:** build de tienda con `expo.version` nueva (por ejemplo, 1.1.0). Cuando esté publicado, y si hace falta forzar la actualización, `MOVIL_VERSION_MINIMA=1.1.0` | Responsable técnico | Backend: `bunx convex data` lista `cobrosParqueadero` y `cobroParqueaderoEventos`. Web: GET anónimo a `/api/facturas/confirmar` responde 405, no 404; "Cobros de parqueadero" muestra 52 filas (septiembre, CDC); Reportes muestra las dos cifras de recaudo. Móvil: la versión de la tienda | Backend: volver a desplegar `081916a`; las tablas nuevas quedan y no estorban. **Ojo:** si ya se gestionaron cobros de parqueadero, su estado vive en `cobrosParqueadero`, y el código viejo vuelve a leer el de cada reporte (`cobroEstado`), que la Fase 4 no escribe: exportar antes. Web: *rollback* de Vercel. Móvil: no hay reversión de lo instalado; solo otro build |
| **4** | **Bucket privado (Bloque C).** No está implementado (§6). Cuando se apruebe: <br>1. el código de URLs firmadas, desplegado; <br>2. después, la política del bucket o el bucket privado para los PDF; <br>3. retirar los documentos ajenos de las unidades de prueba | Responsable y dueño de la cuenta de AWS | GET anónimo a un `pdfUrl` → 403; la web, el móvil y el bot abren el PDF con URL firmada | Restaurar la política del bucket |
| **5** | **"Conciliar" en Finanzas** (cada conjunto) y revisar la bitácora. Aplica las reglas de la Fase 3 a lo guardado: cambian **92 facturas históricas** (Fase 3, Anexo H2) y **87 quedan "Sin verificar"** (S1). **Ninguna unidad cambia de estado** | Administración o contadora, con el responsable | `facturaEventos` con ~92 eventos de origen `conciliacion`; "Historial de la factura" en Finanzas; las 87 "Sin verificar" | La bitácora guarda `estadoAntes` de cada factura: un script interno, con autorización, puede devolverlos. No hay botón |
| **6** | **Cargar los meses faltantes y el consolidado original de agosto de CDC,** por Finanzas → "Subir facturas" (ya con la web nueva): <br>· julio de CDC (194 unidades) y mayo de Arboleda (27), con "solo nuevas"; <br>· agosto de CDC, el consolidado **original** que entregue la contabilidad, con "actualizar" (Fase 2, §11.6) | Administración, con los PDF de la contabilidad | "Meses faltantes" vacío; importaciones "completada"; el recaudo contable de agosto de CDC deja de tener unidades `noCuadra` (R1) | Cada importación tiene id: sus facturas insertadas se identifican por `importacionId`, y las actualizadas tienen su evento en la bitácora |
| **7** | **Re-procesamiento de la Fase 2**, primero en simulación y por lotes de unas 20 unidades: <br>1. `bunx convex run facturas:reprocesarLecturas '{"condominioId": …, "lecturas": [...]}'` (`dryRun` por defecto) y comparar con el escenario B (Fase 2, §11; Fase 3, Anexo B1); <br>2. con autorización, lo mismo con `"dryRun": false` | Responsable técnico; la administración revisa el informe | Una segunda pasada sale vacía; la lista "en revisión" de Finanzas; CDC 802 se omite (`documento_distinto`) | Los eventos de origen `reproceso` guardan lo que cambió; restaurarlo exige un script interno. La copia previa es la red |
| **8** | **Agrupar los reportes de parqueadero** (opcional: la aplicación agrupa al leer y enlaza al gestionar): <br>1. `bunx convex run parqueadero:agruparReportes '{"condominioId": "<CDC>"}'` (`dryRun` por defecto) → debe decir 122 reportes en 52 cobros (P1); <br>2. con autorización, `"dryRun": false` | Administración (que confirme los 52 cobros y las tarifas) y responsable | Una segunda corrida dice `reportesPorEnlazar: 0`; "Cobros de parqueadero" sigue con 52 filas; 52 eventos `agrupar` | Antes de gestionar ningún cobro: borrar los cobros creados y quitar `cargoId` de los reportes, con un script interno. Después, el estado vive en los cobros |
| **9** | **Primera carga de octubre con la regla B.** La factura de octubre entra con el vencimiento a fin de mes (31 de octubre); la mora empieza el **16 de noviembre**. Antes de cargarla, avisar a los residentes de las dos fechas | Administración | "Mis facturas": "Precio completo hasta el 31 de octubre de 2026 · En mora desde el 16 de noviembre de 2026"; del 1.º al 15 de noviembre ninguna casa nueva en mora; el 16, las que no pagaron | No aplica: la regla está en el código. Cambiarla es una decisión y un cambio de código |

**Matriz de compatibilidad** (qué pasa si una parte va adelante de la otra):

| Combinación | Qué pasa |
|---|---|
| **Backend 4 + web anterior a la Fase 2** (la publicada hoy) | Funciona. <br>· Cobros de parqueadero viejo: una fila por mes (`_id` = primer reporte), y facturar factura el mes. <br>· Vigilancia vieja: el mismo estado; descartar sin motivo queda registrado. <br>· Aporte: "Valor total" muestra los cargos. <br>· Recaudo: las pantallas viejas leen `sumaPagado`, que se conserva. <br>· Lo que no ve: "Sin verificar", los dos plazos y la deuda del aporte. <br>· Sigue publicando en S3 al leer el PDF (F-07): **desplegar la web enseguida** |
| **Backend 4 + web 4** | Completo |
| **Web 4 + backend 3** | **No.** Las pantallas llaman `pagos.opcionesDePago`, `parqueadero.historial` y los campos nuevos de recaudo, que no existen. No desplegar la web antes |
| **Backend 4 + móvil instalado** | Funciona. <br>· Con `qa` y sin lista: las casas reales no ven "Pagar" ni "Ya pagué" en el detalle (§5.3); pagan por el banco y envían el comprobante por WhatsApp. <br>· No ven "Sin verificar" ni los plazos nuevos. <br>· El backend sigue decidiendo qué se paga |
| **Móvil nuevo + backend 3** | **No.** Usa `appMovil.versionMinima` y `pagos.opcionesDePago`. Publicar el móvil después del backend |
| **Bot y agente** | Van con el backend |

---

## 10. Riesgos abiertos y qué preguntar

### 10.1 Lo que queda abierto después de las cuatro fases

| Riesgo | Detalle | Se cierra con |
|---|---|---|
| **Deployment de tipo dev con la llave en el repositorio** | Todo `convex dev` con el `.env.local` del repositorio sube código al deployment de los residentes | Paso 1 del plan |
| **Pasarela en QA** | Con `qa`, el bot y el agente no ofrecen pago en línea a nadie (salvo las unidades de prueba declaradas), y el móvil instalado oculta "Pagar" y "Ya pagué" (§5.3). Si alguien aprobara un pago de QA, contaría como evidencia; `pagosPruebas` lo quita | Paso 2: certificar el convenio y pasar a `prod` |
| **PDF públicos** | 2.503 llaves predecibles; documentos personales ajenos en las unidades de prueba | Bloque C (paso 4) |
| **Web publicada anterior a la Fase 2** | Publica en S3 al leer el PDF (F-07), no muestra lecturas en revisión, ni pagos en verificación, ni meses faltantes. No se sabe si tiene la Fase 1, es decir, si la subida exige sesión | Paso 3 |
| **Pagos por fuera de Vekino (F-05)** | Casi todo el recaudo. Sin el archivo del convenio, Vekino los ve con el PDF siguiente. Con la regla B, la falsa mora solo aparece si ese PDF llega después del 15 | Muestra del archivo de recaudo (Fase 3, §12) |
| **Reversos** | Aval no documenta cómo los reporta; se reversa a mano (`reversarPago`) | Especificación del banco |
| **Datos sin corregir** | Faltan julio de CDC y mayo de Arboleda (87 facturas "Sin verificar" tras "Conciliar"); agosto de CDC con lecturas viejas (44 que no cuadran); re-procesamiento sin aplicar; el recaudo contable de CDC deja 47 a 88 unidades por mes sin calcular | Pasos 5 a 7 |
| **Mora real más tarde** | Con la regla B, la mora real se ve el 16 y no el 1.º (39 a 44 casas por ciclo) | Es la decisión B; el recaudo diario la acortaría |
| **Versiones viejas del móvil** | Sin OTA ni aviso de versión mínima; se reemplazan solo desde la tienda | Build nuevo y, si hace falta, `MOVIL_VERSION_MINIMA` |
| **La junta directiva aprueba comprobantes** | Aprobar es evidencia de pago y mueve estados (§4.4) | Decisión de la administración (cambio de una línea) |
| **Reportes viejos con varias casas** | Sin la casa del vehículo entre ellas, el cobro queda "sin casa" (hoy, 0) | Revisión de la administración al gestionar |
| **`limpieza`** | Borra los cobros de parqueadero junto con los reportes del guarda. Es para los datos de prueba antes de operar | No correrla con el conjunto en operación |

### 10.2 Qué preguntar

| A quién | Qué |
|---|---|
| **Contabilidad** | · **CDC 802:** ¿qué es la cuenta de cobro Nro. 0 (−$103.400, anticipo de julio)? ¿Es un saldo a favor real de la casa, aparte de la cuenta regular Nro. 12163? <br>· **Recaudo:** fecha de corte de cada estado de cuenta (qué pagos refleja el saldo anterior); si puede importar la exportación de pagos de Vekino; si el descuento se decide por la fecha del pago o la del abono. <br>· **Meses faltantes:** los PDF de **julio de CDC** y **mayo de Arboleda**, y el **consolidado original de agosto de CDC**, completo, con las hojas de continuación. <br>· Si "CONT. VOL. AREAS COMUNES" es el único concepto del cupo de parqueadero en CDC, y si Arboleda cobra el cupo por otro lado. <br>· La línea 1 de Arboleda, "Saldo a favor" (Fase 2, §14) |
| **Banco / Aval** | · **Recaudo:** formato del archivo del convenio, una **muestra real**, canal, frecuencia y hora de corte; qué trae la referencia; si los pagos de la pasarela aparecen en él y con qué identificador. <br>· **Reversos:** cómo reporta un reverso o contracargo, y si una transacción aprobada puede cambiar de estado. <br>· **Producción:** credenciales y certificación del convenio para pasar a `AVAL_AMBIENTE=prod` |
| **Administración** | · Confirmar los 52 cobros de parqueadero de septiembre y las tarifas ($7.000 carro, $3.000 moto). <br>· Quién aprueba comprobantes: ¿también la junta directiva? <br>· Cómo se comunica a los residentes la regla B ("precio completo hasta el fin de mes; en mora desde el 16"). <br>· Si las unidades 999 y 9999 son de prueba y si se borran sus facturas y documentos |

---

## 11. Anexo de comandos (todos de solo lectura)

| Para qué | Comando |
|---|---|
| Base | `git status`, `git log --oneline`, `git show --stat HEAD` |
| Tablas y datos | `bunx convex data` (lista de tablas) y `bunx convex data <tabla> --limit 8000 --format jsonl` de `importaciones`, `facturaEventos`, `discrepanciasPago`, `pagos`, `soportesPago`, `condominios`, `unidades`, `usuarioUnidad`, `memberships`, `guardiaNovedadReportes`, `vehiculos`, `facturas` y `pqrs`, hacia el scratchpad |
| Variables | `bunx convex env get` de `AVAL_AMBIENTE`, `AVAL_UNIDADES_PRUEBA`, `MOVIL_VERSION_MINIMA`, `MOVIL_VERSION_MINIMA_IOS` y `MOVIL_VERSION_MINIMA_ANDROID` (y, al principio, de los nombres candidatos `VERSION_MINIMA_MOVIL` y `APP_VERSION_MINIMA`), clasificadas sin imprimir el valor. Solo los **nombres** de `packages/backend/.env.local` |
| Web publicada | GET anónimo (`curl`, sin cookies) a `/api/facturas/confirmar`, `/api/facturas/upload` y una ruta inexistente de `www.vekino.com`, `vekino.com`, `nuevo.vekino.com`, `app.vekino.com` y `vekino-web.vercel.app`; GET anónimo de las páginas `/mi/x`, `/mi/x/cuenta` y `/condominio/x/finanzas` (también con `RSC: 1`) y de sus paquetes `/_next/static/chunks/*.js`, para buscar cadenas de las Fases 1 a 3 |
| Móvil | Lectura de `app.json`, `eas.json` y `package.json`; búsqueda de `expo-updates` en `node_modules` |
| PDF | Búsqueda de `pdfUrl`, `PutObjectCommand`, `ACL` y `AWS_*` en el código; `git show 02833b0:apps/web/app/api/facturas/upload/route.ts`. **Ningún GET a S3** en esta fase: las llaves se clasificaron desde los `pdfUrl` exportados |
| Pruebas | Las del PASO 0 antes y después; reportes JSON (vitest) y JUnit (bun) para el cruce #1–#91 |
| Análisis | Scripts en el scratchpad, nunca en el repositorio: impacto de la Fase 4 (`impacto-fase4.ts`), anexos, cruce #1–#91. Salidas: solo ids, unidades, períodos y montos |

No se ejecutó `convex dev`, `convex deploy` ni `convex run`, ni ninguna mutación, migración o script que escriba. No se escribió, borró ni sobrescribió ningún objeto de S3. No se definió ninguna variable de entorno. No se publicó el móvil (`eas update` ni `eas build`). No hubo llamadas a Aval: las pruebas corren con la red bloqueada. No se hizo commit.

---

## Anexos — Impacto sobre los datos reales (PASO 16)

Simulación local, sin escribir (§8). Sin nombres ni placas: unidades, ids de Convex, períodos, estados y montos. `ahora` = 2026-10-08 12:00 (Bogotá). Sin unidades de prueba, salvo donde se dice (Q1).

### P1. Cobros de parqueadero: antes y después

| | Antes (un cobro por reporte) | Después (casa + vehículo + mes) |
|---|---|---|
| Reportes con vehículo | 122 (todos de CDC, todos de septiembre de 2026) | 122 |
| Cobros pendientes | 122 | **52** |
| Valor pendiente (tarifas por defecto: carro $7.000, moto $3.000) | $790.000 | **$336.000** |
| Cobros que agrupan varios reportes | — | 34 (con 104 reportes) |

Tamaño de los cobros (reportes por cobro): 1 → 18 · 2 → 12 · 3 → 10 · 4 → 11 · 6 → 1. Estados viejos: cobroEstado=pendiente gestion=pendiente: 122. Reportes con varias casas: 0. Reportes cuyo mes en UTC difiere del de Colombia: 0. Por tipo: carro 106, moto 16.

**`parqueadero.agruparReportes` en `dryRun` (lo que haría, sin escribir):** 122 reportes de vehículo, 0 ya enlazados, **122 por enlazar** en **52 cobros** (34 con varios reportes), 0 sin casa, 0 con estados mezclados; por estado: pendiente 52.

### A1. Aporte voluntario: el reporte antes y después

| Conjunto | Rango | Antes: casas · valor (Σ `total`) | Después: casas · cargos (Σ `actual`) | Después: deuda en la última factura |
|---|---|---|---|---|
| CDC | 2026-01 a 2026-09 | 178 · $81.693.906 | 176 · $47.204.200 | $14.923.100 |
| CDC | 2026-06 a 2026-10 (el de la pantalla) | 149 · $34.779.126 | 142 · $18.997.000 | $14.923.100 |
| Arboleda | 2026-03 a 2026-09 | 86 · $8.721.722 | 0 · $0 | $0 |
| Arboleda | 2026-06 a 2026-10 (el de la pantalla) | 78 · $4.710.991 | 0 · $0 | $0 |

- **Qué es el aporte en cada conjunto.** CDC: código 5, "CONT VOLUNTARIA AREAS COM" (117), "CONT VOLUNTARIA AREAS COMUN" (90), "CONT VOL AREAS COMUNES" (626). Arboleda: el código 5 es "PARQUEADERO VISITANTE" (1170 líneas); **Arboleda no tiene aporte voluntario en sus facturas** (0 líneas con ese concepto).
- Facturas con aporte: CDC 833 → 833; Arboleda 281 → 0.
- La unidad CDC 402 de la auditoría (§14.9): el reporte sumaba $9.414.600; los cargos son $525.200.

### A2. El color del guarda (`aporte.consultarPlaca`)

265 vehículos registrados (no archivados). Cambian **1** vehículo(s) de **1** casa(s): Arboleda: rojo → gris (1). Por conjunto: CDC 0, Arboleda 1.

| Conjunto · color | Antes | Después |
|---|---|---|
| Arboleda gris | 4 | 5 |
| Arboleda rojo | 1 | 0 |
| CDC azul | 48 | 48 |
| CDC gris | 88 | 88 |
| CDC morado | 1 | 1 |
| CDC rojo | 123 | 123 |

### R1. Recaudo por conjunto y mes: la cifra vieja y las dos nuevas

"Antes" es lo que mostraban los reportes: la suma del `totalAPagar` de las facturas `pagada`. Sin unidades de prueba.

| Conjunto | Período | Facturado (Σ total) | Antes ("recaudo") | Según la contabilidad | Unidades calculadas | Sin calcular (sin el mes siguiente · mes faltante · en revisión · no cuadra) | Registrado en Vekino |
|---|---|---|---|---|---|---|---|
| CDC | 2026-01 | $299.824.754 | $49.191.046 | $36.340.850 | 111 | 0 · 2 · 0 · 88 | $0 |
| CDC | 2026-02 | $271.377.619 | $47.895.491 | $46.791.395 | 154 | 0 · 2 · 0 · 47 | $0 |
| CDC | 2026-03 | $284.665.604 | $233.223.684 | $49.523.700 | 137 | 0 · 0 · 0 · 66 | $0 |
| CDC | 2026-04 | $308.057.354 | $221.919.034 | $52.401.850 | 134 | 0 · 0 · 0 · 71 | $0 |
| CDC | 2026-05 | $315.274.514 | $257.943.418 | $51.454.200 | 139 | 0 · 7 · 0 · 59 | $0 |
| CDC | 2026-06 | $326.417.714 | $81.793.596 | — | 0 | 198 · 0 · 0 · 0 | $0 |
| CDC | 2026-08 | $86.066.978 | $51.266.478 | $49.008.400 | 142 | 0 · 0 · 0 · 59 | $0 |
| CDC | 2026-09 | $317.152.666 | $0 | — | 0 | 205 · 0 · 0 · 0 | $0 |
| Arboleda | 2026-03 | $98.062.932 | $44.090.710 | $56.662.107 | 166 | 0 · 0 · 0 · 3 | $0 |
| Arboleda | 2026-04 | $106.860.309 | $41.115.550 | $48.043.819 | 142 | 0 · 29 · 0 · 1 | $0 |
| Arboleda | 2026-05 | $62.845.704 | $33.964.381 | $38.980.907 | 141 | 0 · 2 · 0 · 0 | $0 |
| Arboleda | 2026-06 | $110.198.370 | $34.709.713 | $55.418.089 | 168 | 0 · 0 · 0 · 0 | $0 |
| Arboleda | 2026-07 | $104.078.781 | $29.473.083 | $50.088.295 | 167 | 0 · 0 · 0 · 5 | $0 |
| Arboleda | 2026-08 | $118.818.487 | $36.553.868 | $54.189.028 | 165 | 0 · 0 · 0 · 7 | $0 |
| Arboleda | 2026-09 | $112.002.152 | $0 | — | 0 | 172 · 0 · 0 · 0 | $0 |

### M1. Cuándo empieza la mora: A, B y C con los ciclos reales de carga

Para cada período N, la factura N+1 llegó en la fecha indicada. "Pagaron por fuera" son las unidades que la factura N+1 mostró saldadas o abonadas (estado guardado de N: `pagada`, `abonada` o `saldo_a_favor`); "mora real", las que dejó `vencida`. Sin unidades de prueba. Los ciclos de la migración (cargas del 19 de julio) no son reales y se omiten.

| Conjunto | N | Llegó N+1 | Pagaron por fuera | Mora real | **A** (mora desde el día 1): días de falsa mora × unidades | **B** (mora desde el 16): días × unidades | **C** ("plazo vencido" hasta el PDF): falsa mora | Mora real que deja de verse: B · C |
|---|---|---|---|---|---|---|---|---|
| CDC | 2026-08 | 2026-09-08 15:03 | 162 | 39 | 7.6 d × 162 | 0 d × 0 | 0 | 39 unidades × 15 d · 39 unidades × 7.6 d |
| Arboleda | 2026-06 | 2026-08-04 20:55 | 131 | 37 | 34.9 d × 131 | 19.9 d × 131 | 0 | 37 unidades × 15 d · 37 unidades × 34.9 d |
| Arboleda | 2026-07 | 2026-08-13 11:42 | 133 | 39 | 12.5 d × 133 | 0 d × 0 | 0 | 39 unidades × 15 d · 39 unidades × 12.5 d |
| Arboleda | 2026-08 | 2026-09-16 12:01 | 128 | 44 | 15.5 d × 128 | 0.5 d × 128 | 0 | 44 unidades × 15 d · 44 unidades × 15.5 d |

Vencimientos guardados hoy: 15 del mes siguiente: 2792. Unidades cuyo estado o días de mora cambian con la regla B sobre lo guardado: 2026-10-08 12:00 → 0; 2026-10-16 08:00 → 0; 2026-10-20 10:00 → 0.

### S1. Facturas que se verán "Sin verificar"

Hoy, con los estados guardados: **0**. Después de pulsar "Conciliar" (reglas de la Fase 3): **87** — Arboleda 2026-04: 23; CDC 2026-06: 58; CDC 2026-05: 2; CDC 2026-02: 2; CDC 2026-01: 2. Son las 87 del Anexo H2 de la Fase 3 que quedan sin veredicto por un mes faltante.

| # | Conjunto | Unidad | Factura | Período | Total |
|---|---|---|---|---|---|
| 1 | Arboleda | T-I 502 | `js7bqzwh0gtepv694wydkh9ca18at087` | 2026-04 | $2.098.261 |
| 2 | Arboleda | T-I 504 | `js74n71a1yfqegqn8jjf4t709h8avetg` | 2026-04 | $1.387.984 |
| 3 | Arboleda | T-I 604 | `js71fbbfqtg84f33eetf9p67px8at17g` | 2026-04 | $635.050 |
| 4 | Arboleda | T-I 701 | `js78sc20e4j1sqd53v18vyrvjx8avajb` | 2026-04 | $3.132.101 |
| 5 | Arboleda | T-I 1003 | `js78vk5fg0k1mb5zawepdcdzj98atw20` | 2026-04 | $635.050 |
| 6 | Arboleda | T-I 1101 | `js7fpmv014yrm5jfhm6qyyw4f58atnan` | 2026-04 | $1.553.642 |
| 7 | Arboleda | T-II 501 | `js79trrntae9r96w0jhhb2rm798av5b4` | 2026-04 | $772.429 |
| 8 | Arboleda | T-II 1003 | `js76gb0d9pj6tv8h4haxr5kb1n8atgeg` | 2026-04 | $1.624.740 |
| 9 | Arboleda | T-II 1101 | `js75d8k0088fjy7nts170gaq5s8avzt8` | 2026-04 | $450.000 |
| 10 | Arboleda | T-III 103 | `js74399p8q4qyasn61phekp4g58atce1` | 2026-04 | $1.306.467 |
| 11 | Arboleda | T-III 301 | `js760qmmqy2rkk1rxjvn0epded8atwak` | 2026-04 | $409.000 |
| 12 | Arboleda | T-III 302 | `js75ba4dewmdb4mp4gynzkwgy18at5gh` | 2026-04 | $1.549.652 |
| 13 | Arboleda | T-III 304 | `js767zrbgd3dg335r2ym7bq6eh8ata0n` | 2026-04 | $2.293.601 |
| 14 | Arboleda | T-III 702 | `js76fpbeptk5aznjg60aa63cnh8athmz` | 2026-04 | $419.000 |
| 15 | Arboleda | T-III 801 | `js70wnqc3ynktcww18awfszx1x8avr5t` | 2026-04 | $4.856.522 |
| 16 | Arboleda | T-III 1003 | `js7exs9a2pn6bq98bd93b4q1ns8at2p4` | 2026-04 | $635.050 |
| 17 | Arboleda | T-III 1101 | `js7f8mjbsh3hg3b65kf1vhtjqs8at3m4` | 2026-04 | $1.269.963 |
| 18 | Arboleda | T-III 1102 | `js763vkre7rmnrs4dwgqsjped98attd1` | 2026-04 | $2.150.463 |
| 19 | Arboleda | T-IV 203 | `js7dspjj40yf28n31h65fdvcv18av99c` | 2026-04 | $4.896.276 |
| 20 | Arboleda | T-IV 703 | `js7ba3ypj49jm2svn3xzf4h3r58av7rc` | 2026-04 | $911.922 |
| 21 | Arboleda | T-IV 803 | `js7b8znn13zmdq7cazrs0nkwqs8athar` | 2026-04 | $890.201 |
| 22 | Arboleda | T-IV 1004 | `js70zd0dxybbw52r0zynfnmbqn8avp9c` | 2026-04 | $664.648 |
| 23 | Arboleda | T-IV 1104 | `js78t883jd3s7519rrq7dsq55x8at80t` | 2026-04 | $1.395.289 |
| 24 | CDC | 220 | `js718yxkagr4pjxts9j8ycjan58avpfy` | 2026-01 | $7.751.900 |
| 25 | CDC | 502 | `js7a0bxvgzj7666ckyers48hjx8atbg3` | 2026-01 | $17.998.130 |
| 26 | CDC | 105 | `js7ce19tfxhkjpppb0a243p6th8att3m` | 2026-02 | $3.693.200 |
| 27 | CDC | 111 | `js702tw7mnd9x25sgfbvqa93b58avv1h` | 2026-02 | $15.074.950 |
| 28 | CDC | 611 | `js7ccfs553vwb5j3nsw23j2wdd8av7kz` | 2026-05 | $0 |
| 29 | CDC | 716 | `js7cc4yt1c6a9x8dbehwfx7n8h8atgzx` | 2026-05 | $0 |
| 30 | CDC | 102 | `js79mym6d2r7e7m1pc0vr5jz958avnt7` | 2026-06 | $365.850 |
| 31 | CDC | 104 | `js72t62327nvynatz91b3fw9an8atq8x` | 2026-06 | $720.000 |
| 32 | CDC | 105 | `js71s42sm7qph0n7pdkey9nvvx8avks4` | 2026-06 | $1.340.500 |
| 33 | CDC | 108 | `js7942sk2z5yjb2ag5mafwj49x8at1rv` | 2026-06 | $360.000 |
| 34 | CDC | 109 | `js7e5e7y83hefrwk8164rdt2558atwgk` | 2026-06 | $1.391.800 |
| 35 | CDC | 110 | `js7f2g7ga74ddtq1eewqjy1x2n8ataxv` | 2026-06 | $976.600 |
| 36 | CDC | 111 | `js78yhjdxq1d4ax36dvkeqq6p98ataby` | 2026-06 | $15.364.150 |
| 37 | CDC | 112 | `js7bk05dq753c3y6jnwryt3db98at8b3` | 2026-06 | $15.583.100 |
| 38 | CDC | 201 | `js7145z7g26ky2q0snjg1cxrqx8av0zy` | 2026-06 | $3.157.000 |
| 39 | CDC | 204 | `js76qsq1xxn6rd141hy2bn8avh8av60h` | 2026-06 | $360.000 |
| 40 | CDC | 205 | `js7cr7v5m8tbvxp6g4jqrj4ra98avn1a` | 2026-06 | $335.000 |
| 41 | CDC | 206 | `js72ayag6yjn73wbmh24t4b8mx8atv8k` | 2026-06 | $384.000 |
| 42 | CDC | 207 | `js763kmdcz4xhpqsxpwd2jhdpn8at6ne` | 2026-06 | $367.000 |
| 43 | CDC | 211 | `js7635de3r21wamc8wvybqn77x8av8nc` | 2026-06 | $4.432.200 |
| 44 | CDC | 212 | `js73e8b9gk5smvgqwykxpz5ren8at8nb` | 2026-06 | $465.600 |
| 45 | CDC | 214 | `js7afva66d0gc52abmv0g1mnws8avbsb` | 2026-06 | $367.000 |
| 46 | CDC | 216 | `js72wnbcarmge24ne5sfj380k98atxks` | 2026-06 | $1.626.450 |
| 47 | CDC | 217 | `js7cx1jfks31ebebsgmc5x8xbn8av74v` | 2026-06 | $397.000 |
| 48 | CDC | 220 | `js74eazhyghnehw6mqt8tag34x8avyf0` | 2026-06 | $4.916.900 |
| 49 | CDC | 304 | `js7d2c7xrjcxk0yhw47pq3rd3x8atzzp` | 2026-06 | $409.000 |
| 50 | CDC | 306 | `js723zn00rs0a4hhy2399tt8818av78w` | 2026-06 | $422.000 |
| 51 | CDC | 309 | `js7eh2141fz11tjw79wywd8mhs8atk5m` | 2026-06 | $360.000 |
| 52 | CDC | 319 | `js75kc7x2x3t38g5qw482mkqhx8atb81` | 2026-06 | $730.000 |
| 53 | CDC | 402 | `js7a7p3sjxzpzt73btyqnzc6118ath84` | 2026-06 | $9.435.010 |
| 54 | CDC | 404 | `js7dvvv0dareafrkb0s3fwbh7h8avfa7` | 2026-06 | $2.976.100 |
| 55 | CDC | 405 | `js77ppx9e7pvm7a8spykh56esd8avk1b` | 2026-06 | $3.274.800 |
| 56 | CDC | 408 | `js78b6d3bh5zsws2ebcnxnzrkd8atvc3` | 2026-06 | $360.000 |
| 57 | CDC | 501 | `js7b4ahvjmamfk3ha1xh42kwed8avz16` | 2026-06 | $24.584.620 |
| 58 | CDC | 504 | `js72pvdysgkxxnm09rb7yc2yxx8avfjd` | 2026-06 | $24.434.520 |
| 59 | CDC | 507 | `js722amnn5n7stpwdqgrce5yf58atpd2` | 2026-06 | $798.500 |
| 60 | CDC | 508 | `js70a4cmpz2dk7ztbh32dwf4ed8av248` | 2026-06 | $24.654.720 |
| 61 | CDC | 509 | `js75h8t67a0cf59n36zb59yd9h8avdmq` | 2026-06 | $360.000 |
| 62 | CDC | 512 | `js79j2w9jx2ynvxrjcfba30j198at2e7` | 2026-06 | $360.000 |
| 63 | CDC | 608 | `js758bwa9mx4vd0mpg4xgska4h8at4t1` | 2026-06 | $7.177.000 |
| 64 | CDC | 609 | `js71n7x1th4cgbsbae9cfd5zvh8atx1f` | 2026-06 | $752.600 |
| 65 | CDC | 613 | `js78gvyr2pqmygbkva5nj8gv3x8av49x` | 2026-06 | $24.593.278 |
| 66 | CDC | 621 | `js75r81dyb6z5arzs601srgz098atvca` | 2026-06 | $360.000 |
| 67 | CDC | 625 | `js7cx7c0h84rh2wr1qfe6pc6p98attex` | 2026-06 | $569.300 |
| 68 | CDC | 702 | `js7dj74pzy04c98ypmeq25s10n8avx03` | 2026-06 | $1.350.600 |
| 69 | CDC | 703 | `js750xsqzsk8vr921xzavmakfx8avc4h` | 2026-06 | $1.408.200 |
| 70 | CDC | 710 | `js74amhhh162t70fa040pfccdx8atw41` | 2026-06 | $674.000 |
| 71 | CDC | 711 | `js779nmnsy0rs6yfpskd68njm18attcx` | 2026-06 | $10.549.600 |
| 72 | CDC | 712 | `js78r718wmbavq5tjbsynckzy98av0ej` | 2026-06 | $367.000 |
| 73 | CDC | 717 | `js7ethd3n99pb41se49pcsmgh58atjmm` | 2026-06 | $520.950 |
| 74 | CDC | 803 | `js7awrdb2g1eas6661hk1taxed8atf3g` | 2026-06 | $446.000 |
| 75 | CDC | 806 | `js75tedzm63g97dyz5z91803as8avff5` | 2026-06 | $1.083.800 |
| 76 | CDC | 813 | `js795sa006q0zj2qa1rgz7ascx8av8k6` | 2026-06 | $24.800.120 |
| 77 | CDC | 818 | `js73sh112wy9xd7m2n5m3met618at5xt` | 2026-06 | $360.000 |
| 78 | CDC | 820 | `js78jwny9da4jfmc3748gje10x8avhps` | 2026-06 | $693.500 |
| 79 | CDC | 823 | `js7d0zt51xtfmtj7b63fywd0kn8atbya` | 2026-06 | $360.000 |
| 80 | CDC | 825 | `js7b81mwk8w85947m0g95ekhxh8at7ye` | 2026-06 | $526.950 |
| 81 | CDC | 902 | `js71y6tgtt7x2407ey996j5z1d8atsg5` | 2026-06 | $360.000 |
| 82 | CDC | 904 | `js7160z5e9czn9tq7f2nrccman8at5et` | 2026-06 | $8.474.750 |
| 83 | CDC | 906 | `js78q0dhxsavbp0bd0c9n9kgjh8atfey` | 2026-06 | $1.394.000 |
| 84 | CDC | 907 | `js7btg382q5151s9xvgv2d03th8atwmp` | 2026-06 | $10.457.050 |
| 85 | CDC | 910 | `js73j9te0x7s4g6tpvy0tq1dax8atc0a` | 2026-06 | $374.000 |
| 86 | CDC | 912 | `js7dy152bpecpg4k9ew321vhb18at0fh` | 2026-06 | $486.000 |
| 87 | CDC | 915 | `js7848re9bd0v7cmc0806jtdp98avcrt` | 2026-06 | $416.000 |

### Q1. La pasarela en QA

- Unidades con una vigente que hoy se puede pagar: 366. Reales que dejan de ver "Pagar en línea" en el **bot y el agente** mientras `AVAL_AMBIENTE=qa` y no haya lista: Arboleda 166, CDC 200.
- En la **web y el móvil** no cambia nada para ellas: los dos conjuntos tienen portal del banco (`avalPortalUrl`: CDC sí, Arboleda sí), y "Pagar" abre el portal, no la pasarela de Vekino.
- Unidades de prueba (candidatas para `AVAL_UNIDADES_PRUEBA`, que no se definió): CDC 999 `jd74hkf5rgmtdnxbfaa70vx2md8at7tx`; Arboleda 9999 `jd78amat67hhq9ax6jhg3yzxvd8avtjm`. Hoy tienen 0 vigentes pagables (sus facturas son de marzo y abril, en $0).

### D1. PDF públicos hoy

2.792 facturas con PDF (0 sin), todas en vekino.s3.us-east-1.amazonaws.com. Por forma de la llave: predecible: condominios/facturas/{conjunto}/{período}/unidad-{casa}.pdf: **2.503**; sistema anterior: condominios/{id}/facturas/factura-{período}-{id}-{marca de tiempo}.pdf: **289**.

### L1. Lista del residente y pagos

- Vínculos: 377; repetidos: 0; con vigencia: 0; vencidos: 0. Máximo de facturas por unidad: 8. **Hoy `listMia` no cambia lo que ve nadie**; el arreglo protege lo que viene (contratos con vigencia, años de historial).
- Pagos: 3 (fallida (qa, prueba): 1; fallida (qa): 2); 3 con respuestas crudas del banco guardadas, que `verificarPago` y `listPorFactura` entregaban a cualquier sesión; 0 sin usuario. Comprobantes: 0.
- Números de factura: FAC-AAAA-MM-NNNN (posición): 2792. Ninguno se renumera.
