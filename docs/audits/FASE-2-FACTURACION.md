# Fase 2 — Ingestión confiable de facturación

> **Fecha:** 2026-10-08 · **Base:** `02833b0` (contención de la Fase 1) · **Estado:** cambios en el *working tree*, **sin commit**.
> Referencias: [`AUDITORIA_FACTURACION.md`](AUDITORIA_FACTURACION.md) (hallazgos F-xx y secciones §), [`FASE-0-FACTURACION.md`](FASE-0-FACTURACION.md) (pruebas #1–#91) y [`FASE-1-FACTURACION.md`](FASE-1-FACTURACION.md) (factura vigente, Anexo A).

---

## 1. Resumen ejecutivo

### Qué se corrigió

1. **El parser lee lo que dice el documento** (F-04, F-15):
   - montos con signo en los dos formatos (`-760.000.00`, `$-400.000.00`, `$(376,000)`);
   - las filas de crédito (`CI`, `NCC`) y las filas con prefijo `SF`;
   - el saldo anterior real, el de la fila **Totales** de Ciudad del Campo (CDC), que queda guardado como dato propio de la factura (`saldoAnteriorDocumento`);
   - el período, también cuando la fecha baja de renglón (Arboleda, septiembre).
2. **Cada factura se valida**: Σ líneas = total, Totales = "Pague sin descuento", saldo anterior de las líneas = el de Totales, y período legible. La tolerancia es de ±$1, la misma de la conciliación. Lo que no cuadra no se descarta ni pasa por válido: **entra marcado "en revisión", con su motivo**.
3. **Un total que no se pudo leer nunca se guarda en $0.** Se informa la suma de lo que sí se leyó y la factura queda en revisión (`total_no_leido`).
4. **Contrato de "lectura dudosa"** en el backend (`lib/cartera.ts`). Una factura en revisión no se paga, no concilia y no decide "al día" ni "mora". La cartera y el residente ven **"En revisión"**. La administración la ve en Finanzas, con el motivo y la acción "Confirmar lectura" (solo administración y contadora; queda registrado quién y cuándo). La consumen sin regla propia la web, el móvil, el bot, el agente y la campana.
5. **El período sale del documento** y se compara con el elegido:
   - `bulkUpsert` **rechaza** la factura cuyo documento dice otro período (#13, #14);
   - la pantalla bloquea el lote y explica por qué.
6. **Vista previa sin S3; confirmación con llaves que no se pisan** (resto de F-07):
   - La vista previa no publica nada.
   - La confirmación vuelve a leer el PDF **en el servidor** y comprueba por **hash** que es el mismo archivo. Publica solo lo que se inserta o actualiza, con una llave propia de la importación y `If-None-Match: *`: nunca sobrescribe, y el `pdfUrl` anterior sigue sirviendo.
   - Confirmar dos veces no carga dos veces.
   - Cada carga queda en la tabla nueva **`importaciones`**, y cada factura enlazada a su importación.
7. **Re-procesamiento preparado, no aplicado.**
   - Un planificador puro (`lib/reproceso.ts`) y la mutación **interna** `facturas.reprocesarLecturas`, con `dryRun: true` por defecto y probada en convex-test.
   - Con el mismo planificador se hizo el **informe en modo dry-run** sobre los datos reales (§11).
   - **Aplicarlo requiere autorización explícita.**

### Qué NO se corrigió (a propósito)

F-02, F-05, F-06, F-08 a F-13, F-16 y F-20, aunque se vieron de paso (F-09 aparece en el re-procesamiento: §11.4). **No se modificó ningún dato** en Convex ni en S3, y no se aplicó el re-procesamiento.

### Resultado

| | Resultado |
|---|---|
| Pruebas de la Fase 2 | **21 de 21** pasaron de ❌ a ✅ |
| Controles de la Fase 0 y pruebas de la Fase 1 | **33 de 33** y **18 de 18** siguen ✅ |
| Pruebas de las Fases 3 y 4 | **19 de 19** siguen ❌, con el **mismo mensaje de fallo**. Ninguna se puso verde por accidente |
| Suites generales | Todas verdes. **90 pruebas nuevas**: 21 unitarias, 27 de convex-test, 40 web y 2 del móvil |
| Regresión masiva (2.792 PDF reales) | Metas cumplidas (§10). Reproduce exactamente la auditoría §14.4 con el parser viejo (32 · 252 · 33). Única excepción explicada: el concepto del código 6 de Arboleda en agosto (167 documentos) |
| Re-procesamiento (dry-run) | Grupo D de la Fase 1 (21 casas de CDC "Vencida"): con lo publicado hoy, **3 salen de la mora**, **2 confirman mora real** y **16 quedan "en revisión"** porque su PDF de agosto publicado es solo la primera hoja. Con las 36 hojas de continuación de agosto, que siguen en S3 (§11.3), las 16 se resuelven: **12 en mora real y 4 "Pendiente"**. Además, **CDC 802** debe hoy $342.000 según Vekino y el documento dice **saldo a favor de $103.400** |
| Facturas con evidencia de pago | **0** (2 pagos, ambos `fallida`, y 0 comprobantes) |
| Escrituras | **Cero** en Convex y en S3 |

---

## 2. Cambios por componente

| Componente | Archivo | Cambio |
|---|---|---|
| **Lectura (backend, compartida)** | `packages/backend/convex/lib/lecturaFactura.ts` *(nuevo)* | Reglas puras, compartidas por web y backend: <br>· montos con signo (`leerMontoCdc`, `leerMontoArboleda`); <br>· período del documento (`normalizarPeriodo`, `etiquetaDePeriodo`); <br>· cuadre (`validarLectura`, `TOLERANCIA_CUADRE` = $1); <br>· motivos y mensajes (`MENSAJE_LECTURA`, `motivosValidos`); <br>· rechazo por identidad (`rechazoDePeriodo`, `MENSAJE_RECHAZO`); <br>· estado de carga (`estadoDeCarga`). <br>Exportado como `@vekino/backend/lecturaFactura` |
| **Regla de cartera** | `packages/backend/convex/lib/cartera.ts` | · `saldoAnteriorDe` usa el saldo anterior del documento si existe. <br>· `enRevision`; nuevo estado `en_revision` en `carteraDeUnidad` y `resumenResidente`; nuevo motivo `en_revision` en `motivoNoPagable`, con su mensaje. <br>· La regla de la conciliación pasa a ser una función pura, `veredictoConciliacion`, con **los mismos umbrales**: la usan `conciliarCadenaUnidad` y el re-procesamiento |
| **Re-procesamiento** | `packages/backend/convex/lib/reproceso.ts` *(nuevo)* | `planificarReproceso`: el plan de una unidad (lecturas nuevas, estado de carga, re-conciliación, sin tocar facturas con evidencia de pago), con la foto de la cartera y del residente antes y después |
| **Esquema** (solo aditivo) | `packages/backend/convex/schema.ts` | `facturas`: campos opcionales `lineas[].codigoTexto`, `saldoAnteriorDocumento`, `lecturaDudosa {motivos, marcadaAt, confirmada?}` e `importacionId`. Tabla nueva `importaciones` (archivo, hash, período, usuario, conteos, rechazos, estado) con índices `by_condominio` y `by_condominio_hash` |
| **Facturas (backend)** | `packages/backend/convex/facturas.ts` | **`bulkUpsert` valida por su cuenta**: <br>· rechaza período contradictorio, período mal formado y unidad de otro conjunto; <br>· marca lo que no cuadra; decide el estado de carga; <br>· enlaza a la importación y la cuenta. <br>**Nuevas:** <br>· `iniciarImportacion`: plan, idempotencia por hash, bloqueo de doble clic; <br>· `finalizarImportacion`; <br>· `listEnRevision`; <br>· `confirmarLectura`; <br>· `reprocesarLecturas` (interna, `dryRun` por defecto). <br>La conciliación no juzga con documentos en revisión y usa el saldo anterior de Totales |
| **Bot, agente y campana** | `convex/whatsapp.ts`, `convex/whatsappAgente.ts`, `convex/notificacionesFeed.ts` | · Bot: "Tu factura de … está *en revisión*", y un botón "Pagar" viejo responde que está en revisión. <br>· Agente: `ver_estado_cuenta` informa `enRevision`; `generar_link_pago` devuelve `{enRevision, queDecir}` sin generar enlace. <br>· Campana: "En revisión de la administración" |
| | `packages/backend/package.json` | Exporta `./lecturaFactura` |
| **Lectura de PDF (web)** | `apps/web/app/api/facturas/parser.ts` *(nuevo)* | Parser puro (texto por página → facturas): agrupación de páginas, CDC y Arboleda, motivos. Reemplaza al que vivía dentro de la ruta |
| | `apps/web/app/api/facturas/lectura.ts` *(nuevo)* | `leerPdf` (hash SHA-256, texto por página, facturas) y `pdfDeFactura` (sin fecha en los metadatos: el mismo documento da los mismos bytes) |
| | `apps/web/app/api/facturas/permiso.ts` *(nuevo)* | Sesión y permiso de la Fase 1, compartidos por las dos rutas (401/403/500) |
| | `apps/web/app/api/facturas/upload/route.ts` | **Solo vista previa**: lee y devuelve, sin S3 y sin escribir |
| | `apps/web/app/api/facturas/confirmar/route.ts` *(nuevo)* | Confirmación: hash, relectura, `iniciarImportacion`, publicación en S3 sin sobrescribir, `bulkUpsert` y `finalizarImportacion` |
| **Pantallas web** | `apps/web/components/upload-facturas.tsx` | Vista previa por factura (unidad, período del documento contra el elegido, saldo anterior, total, cuadre, motivo) y resumen del lote (entran, en revisión, no entran). Bloqueo por período. Resultado tal como lo devuelve el backend |
| | `apps/web/app/condominio/[id]/finanzas/page.tsx` | Bloque "N facturas en revisión" con motivo, PDF y "Confirmar lectura". Insignia "En revisión" en la tabla. El detalle muestra los créditos (antes se ocultaban los negativos). El período ya no se precarga con "el último cargado" |
| | `apps/web/app/condominio/[id]/reservas/page.tsx` | Cartera: estado "En revisión" con su explicación |
| | `apps/web/app/mi/[id]/cuenta/page.tsx`, `apps/web/app/mi/[id]/page.tsx`, `apps/web/components/portal/portal-pay-button.tsx` | El residente ve "En revisión", sin "Pagar". Mensaje claro si el backend rechaza el pago por revisión |
| **Móvil** | `apps/mobile/src/lib/resumen-facturas.ts`, `src/app/(app)/(tabs)/facturas.tsx`, `src/app/(app)/(tabs)/index.tsx` | `estadoVisible`: la lista y el detalle muestran "En revisión" en vez del estado guardado. La tarjeta ya decía "Factura en revisión" (Fase 1). "Pagar" lo sigue decidiendo `pagos.puedePagar` |
| **Pruebas y scripts** | ver §9 | `apps/web/package.json`: `test:facturacion` encadena las suites nuevas en procesos separados, y `test` corre todas las de la web (§9) |

**Las pruebas de la Fase 0 no se tocaron:** `git diff` sobre `pruebas/facturacion/*.regresion.ts`, `escenario.ts`, `parserFacturas.test.mjs`, `resumenResidente.test.mjs` y los fixtures existentes está vacío. En `fixtures/README.md` solo se **agregaron** entradas (19 líneas, 0 borradas).

---

## 3. Flujo de ingestión nuevo

```
 ADMINISTRACIÓN            WEB (Next)                                   CONVEX                          S3
 ──────────────            ──────────                                   ──────                          ──
 elige el PDF ───────▶ POST /api/facturas/upload  (VISTA PREVIA)
                        · sesión y rol (401 / 403 / 500) ─────────────▶ facturas.permisoSubida
                        · leerPdf: SHA-256 + texto por página
                        · parser: montos con signo, Totales, cuadre,
                          período del documento, motivos
                 ◀───── { hash, facturas, motivos, períodos }          (no se escribe nada)           (no se publica nada)

 revisa: período del documento vs. elegido, cuadre, "entran / en revisión / no entran"

 Confirmar ──────────▶ POST /api/facturas/confirmar
                        · sesión y rol (igual que arriba)
                        · hash(archivo) == hash de la vista previa ─▶ si no: 409, nada escrito
                        · leerPdf OTRA VEZ: los números son los del servidor
                        · iniciarImportacion ─────────────────────────▶ registra archivo, hash, período,
                                                                        usuario; plan por factura:
                                                                        insertar | actualizar | omitir | rechazar
                                                                        (mismo hash y período ya cargado →
                                                                         "repetida": devuelve el resultado
                                                                         anterior; nada se publica ni se escribe)
                        · publica SOLO insertar / actualizar ──────────────────────────────────────────────▶ PutObject
                          condominios/facturas/{conjunto}/{período}/{importacionId}/unidad-{casa}-{sha12}.pdf  If-None-Match: *
                        · bulkUpsert, lotes de 20 ─────────────────────▶ valida otra vez: rechaza período o unidad,
                                                                        marca lo que no cuadra, concilia
                        · finalizarImportacion ───────────────────────▶ conteos; "completada" (o "fallida")
                 ◀───── resultado del backend (insertadas, actualizadas, omitidas, en revisión, rechazos, conciliación)
```

- **Idempotencia:**
  - El mismo archivo (hash) para el mismo período se carga una vez. Un doble clic mientras la primera confirmación sigue "en curso" responde 409.
  - Una importación "fallida", o abandonada (más de 10 minutos en curso), se retoma con el mismo id.
  - Al reintentar, cada PDF cae en la misma llave, porque la llave lleva la huella y `pdfDeFactura` es determinista. S3 responde 412 y se da por publicado.
- **Nunca se sobrescribe:**
  - La llave es nueva en cada importación y `If-None-Match: *` impide pisar un objeto existente.
  - Al actualizar una factura, su `pdfUrl` anterior sigue sirviendo, porque ese objeto no se toca.
- **Reversión** (fuera de alcance, cómo se haría):
  - Las facturas insertadas por una importación se identifican por `importacionId`, y sus PDF por el prefijo `…/{importacionId}/`.
  - Las **actualizadas** no guardan sus valores previos. Revertirlas exige la exportación anterior o volver a cargar el PDF previo.
  - Si se quiere reversión real, la Fase 3 debería guardar, por importación, una copia de los campos que se pisan.

---

## 4. Reglas del parser

### Formatos soportados

| | Ciudad del Campo (CDC) | Arboleda |
|---|---|---|
| **Montos** | `10.097.050.00`, `-760.000.00`, `$-400.000.00`, `-$400.000.00`, `0.00`. Sin centavos distintos de `.00` en el corpus | `15,760`, `$15,760`, `0`, `(376,000)`, `$(376,000)`; también `-15,760` |
| **Filas** | Prefijo opcional `*` (cuota del mes) o `SF` (créditos). Código de 3 dígitos o de letras (`CI`, `NCC`). Mes `Xxxx / AAAA`. Columnas Saldo Anterior · Mes · Este mes · Descto · Saldo | Código 1–9 y concepto. Columnas Saldo Anterior · Actual · Total. Los códigos 1–7 que falten se completan en 0, como antes |
| **Códigos de crédito** | `CI` (anticipo de cliente) y `NCC` (nota crédito cliente): `codigo` 0 y `codigoTexto`. El tipo numérico de `codigo` no cambió (regla 7) | Línea 1, "Saldo a favor", que el documento imprime entre paréntesis |
| **Total** | "Pague sin descuento"; si falta, la fila Totales; si faltan los dos, **`total_no_leido`** y la suma de las líneas | "TOTAL A PAGAR"; si falta, `total_no_leido` y la suma de las líneas |
| **Saldo anterior** | **Fila Totales** (saldo anterior · mes · total) → `saldoAnteriorDocumento` | Σ líneas (el documento no trae Totales) |
| **Período** | Fila `*` (`Septiembre / 2026`). Si no la hay, el campo **"Fecha"** (`Septi. 01 / 2026`). Si se contradicen, no se elige: `periodo_no_leido` | La fecha del campo "Periodo:", en la misma línea o hasta 3 renglones abajo, y solo si tiene forma de período |
| **Saldo a favor** | −total si el total es negativo | max(0, −línea 1, −total) |
| **Concepto** | El del documento | El fijo del código si coincide con el documento; si no, el del documento (en agosto y septiembre de 2026 el código 6 es "Cuota extra camaras", no "Honorarios abogado") |

**Agrupación de páginas:**

- Abre factura la hoja que dice "CUENTA DE COBRO" y, en CDC, trae además el bloque `Casa N MANZANA M`. Las demás hojas son continuación de la anterior.
- Un PDF que **empieza** en una hoja de continuación se marca `pagina_de_continuacion`: no se adivina a quién pertenece.
- Un documento que no tiene el formato de una cuenta de cobro conocida **no se convierte en factura**: sale como error de lectura.

**Formato de enero de 2026 en CDC.** La fila de la cuota trae a la vez el saldo anterior y los cargos del mes. El primer monto después del mes es el cargo ("Este mes") y el último, el total de la fila. La regresión lo detectó al medir, en todo el corpus, el invariante por línea total = saldo anterior + cargo: 53 documentos lo violaban. Ya está corregido (§10.2), con prueba.

### Cuadre y tolerancia

Tolerancia de **±$1** (`TOLERANCIA_CUADRE`, igual a `TOLERANCIA_PAGO` de la conciliación). Se exige:

1. Σ `lineas.total` = total a pagar.
2. En CDC: Totales `saldo anterior + mes = total`, y ese total = "Pague sin descuento".
3. En CDC: Σ `lineas.saldoAnterior` = saldo anterior de Totales.
4. Período legible.

El navegador no decide nada de esto. `bulkUpsert` lo vuelve a comprobar con los números que recibe. Los motivos que manda el parser solo pueden **agregar** dudas, y los códigos desconocidos se ignoran.

### Banderas (motivos) y rechazos

| Motivo (`lecturaDudosa.motivos`) | Mensaje (estable) | Efecto |
|---|---|---|
| `total_no_leido` | No se encontró el total a pagar en el documento. | Entra en revisión. El total informado es la suma de lo leído, **nunca $0 inventado** |
| `sin_lineas` | El documento no trae filas de conceptos. | En revisión |
| `lineas_no_cuadran` | Las líneas no suman el total del documento. | En revisión |
| `saldo_anterior_no_cuadra` | El saldo anterior de las líneas no coincide con el de la fila Totales. | En revisión |
| `totales_no_cuadran` | La fila Totales no coincide con el total a pagar. | En revisión |
| `periodo_no_leido` | No se pudo leer el período del documento. | En revisión (decisión del PASO 7: no se rechaza, para no dejar a la unidad sin la factura del período) |
| `pagina_de_continuacion` | El documento empieza en una hoja de continuación: falta la primera hoja. | En revisión |
| `formato_desconocido` | El documento no tiene el formato de una cuenta de cobro conocida. | No entra (error de lectura) |

| Rechazo (`bulkUpsert`, no se guarda) | Mensaje |
|---|---|
| `periodo_no_coincide` | El período del documento no coincide con el período elegido. |
| `periodo_invalido` | El período elegido no tiene la forma AAAA-MM. |
| `unidad_ajena` | La unidad no pertenece a este conjunto. |

### Catálogo del corpus (PASO 3)

**Corpus: 2.792 PDF**, sin datos personales en el catálogo:

- **1.870 del historial**: `git archive a0cf84b^ migrate/.tmp-descuento`, enero a junio de 2026.
- **922 de S3** (solo lectura): CDC agosto y septiembre; Arboleda julio a septiembre.

| Dato | Ciudad del Campo (1.621) | Arboleda (1.168) |
|---|---|---|
| Páginas por documento | 1: 1.576 · 2: 14 · 3: 10 · 4: 19 · 5: 2 | 1: 1.165 · 2: 3 |
| Formatos de monto en filas | `n` 22.841 · `-n` 1.052 | `9` 16.720 · `9,9` 5.257 · `9,9,9` 197 · `(9,9)` 15 · `(9,9,9)` 3 |
| Total | Totales con 3 columnas: 1.605. Sin Totales ni "Pague sin descuento": **16**. Totales negativos: **44** | `$9,9` 982 · `$9,9,9` 165 · `$9` 4 · `$(9,9)` 14 · `$(9,9,9)` 3. Sin total: 0 |
| Códigos | `001` 3.821 · `008` 3.801 · `005` 1.419 · `009` 1.100 · **`CI` 494** · `002` 234 · `006` 72 · `012` 36 · `007` 35 · **`NCC` 32** · `004` 30 · `003` 27 · `013` 3 · `010` 2 · `011` 2. No hay otros códigos de letras | 1–7 en todos. El 6 es "Honorarios abogado" en 824 y "Cuota extra camaras" en 344 |
| Prefijos de fila | `*` 1.567 · `SF` 526 · ninguno 9.015 | — |
| Período | Sin fila `*`: 54 | En la misma línea: 996. **Dos renglones abajo: 172** (septiembre) |
| Irregulares | Primera hoja sin `Casa … MANZANA` (hoja de continuación guardada sola): **48**. Documentos sin filas: **33**. Saldo anterior negativo en Totales: 257 | Línea 1 entre paréntesis: 18 |
| No son cuentas de cobro | 3 documentos, de las unidades de prueba (§11.7) | |

Ningún formato dependió de una regla de negocio desconocida. Los únicos códigos de letras son `CI` y `NCC`, créditos por su propio nombre. Una pregunta para la administración queda abierta en §14 (la línea 1 de Arboleda).

---

## 5. Contrato de "lectura dudosa"

```
lecturaDudosa = { motivos: string[], marcadaAt, confirmada?: { userId, nombre, at } }
enRevision(f) = lecturaDudosa presente y sin confirmar
```

**Decisión central (PASO 6): la factura dudosa ENTRA, marcada.**

- Rechazarla dejaría a la unidad sin la factura del período. La anterior pasaría a ser la vigente y pagable, con un total desactualizado: exactamente lo que el PASO 6 pide evitar.
- Al entrar, sigue siendo la vigente de su unidad (Fase 1), pero no se puede pagar, y nadie afirma "al día" ni "mora" con ella.

| Dónde | Qué hace con una factura en revisión |
|---|---|
| `lib/cartera.ts` | · `motivoNoPagable` → `en_revision` ("Esta factura está en revisión: la administración debe verificar su lectura antes de que se pueda pagar."). <br>· `carteraDeUnidad` → estado **`en_revision`** si la vigente está en revisión, o si lo está el período que decidiría la mora y este no quedó cubierto. El saldo se informa igual, como referencia. <br>· `resumenResidente` hereda lo mismo (orden de gravedad: mora, revisión, pendiente, al día) |
| Conciliación (`veredictoConciliacion`) | **No juzga** un par si alguna de las dos facturas está en revisión: la anterior conserva su estado (sin veredicto). Usa el saldo anterior del documento (Totales) cuando existe. Los umbrales no cambiaron: el control #20 sigue verde |
| `bulkUpsert` | Marca con los motivos que comprueba él mismo más los del parser. Una factura en revisión entra `pendiente`. Una relectura correcta (re-subida con "actualizar") **quita la marca** |
| `confirmarLectura` | Solo administración y contadora. Registra quién y cuándo, y conserva los motivos originales. Recalcula el estado de carga y vuelve a conciliar la cadena |
| Pagos (`armarDatosTrn`, `puedePagar`) | Rechazan con el mensaje estable. El botón "Pagar" del móvil y de la web no aparece |
| Web · Finanzas | Bloque "N facturas en revisión": unidad, período, total, motivo, PDF y "Confirmar lectura". Insignia en la tabla |
| Web · cartera (reservas) | "En revisión": *la lectura del PDF de su factura no cuadra: hasta que Finanzas la revise no se puede decir si está al día o en mora* |
| Web · residente | "Mis facturas": estado e insignia "En revisión", sin "Pagar". Inicio: "Tu factura está en revisión · Comunícate con la administración" (si no hay nada pagable) |
| Móvil | Tarjeta "Factura en revisión"; lista y detalle con "En revisión"; "Pagar" oculto por `pagos.puedePagar` |
| Bot de WhatsApp | "📄 Tu factura de … está *en revisión* por la administración…". Un botón "Pagar" viejo responde "está en revisión" |
| Agente IA | `ver_estado_cuenta` incluye `enRevision`. `generar_link_pago` responde `{ enRevision, queDecir }` sin generar enlace ("No inventes montos ni fechas") |
| Campana | "En revisión de la administración" |
| `navBadges` | Cuenta solo `en_mora`: una unidad en revisión no suma a "vencidas" |

---

## 6. Pruebas de la Fase 2

Resultado exacto por test (reporte JSON de vitest y JUnit de bun), cruzado contra la tabla de la Fase 0. "Fase 0" es la red original, "Antes" es la línea base de esta fase (`02833b0`) y "Después" es el *working tree*.

### Las 21 pruebas de la Fase 2

| # | Prueba | Archivo | Fase 0 | Antes (Fase 1) | Después |
|---|---|---|---|---|---|
| 13 | `F07-periodo-contradice-documento` — un documento de 'Octubre / 2026' no queda guardado en silencio como 2026-09 | `importacion.regresion.ts` | ❌ | ❌ | ✅ |
| 14 | `F07-periodo-contradice-documento` — un documento de '01-octubre-2026' no queda guardado en silencio como 2026-09 | `importacion.regresion.ts` | ❌ | ❌ | ✅ |
| 19 | `F04-saldo-a-favor-leido-como-deuda` — con la lectura actual, agosto (a favor $262.000) no puede quedar 'vencida' | `importacion.regresion.ts` | ❌ | ❌ | ✅ |
| 57 | `F04-cdc-total-negativo (Caso A)` — 'Pague sin descuento $-400.000' (anticipo) no se lee como $0 | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 58 | `F04-cdc-total-negativo (Caso A)` — agosto real de una casa con $262.000 a favor no se lee como $0 | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 59 | `F04-cdc-creditos (Caso B)` — la fila 'CI ANTICIPO DE CLIENTE' ($-760.000) no se ignora | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 60 | `F04-cdc-creditos (Caso B)` — la fila 'NCC NOTA CREDITO CLIENTE' ($-270.000) no se ignora: saldo anterior $-86.000, no $184.000 | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 61 | `F04-cdc-varias-filas (Caso C)` — con filas de abril, de mayo y un crédito, separa saldo anterior, cargos del mes y total | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 62 | `F04-saldo-anterior-fantasma` — septiembre vigente de una casa real: el saldo anterior es $-262.000 (a favor), no $+335.000 | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 63 | `F04-pdf-sin-lineas (Caso D)` — una página sin filas de conceptos no sale como factura válida sin advertencia | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 65 | `F04-cuadre (Caso E)` — cdc-anticipo-total-negativo.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 66 | `F04-cuadre (Caso E)` — cdc-nota-credito.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 67 | `F04-cuadre (Caso E)` — cdc-agosto-saldo-a-favor.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 68 | `F04-cuadre (Caso E)` — cdc-septiembre-saldo-anterior-negativo.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 69 | `F04-cuadre (Caso E)` — cdc-filas-incompletas.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 70 | `F04-cuadre (Caso E)` — cdc-pagina-sin-filas.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 72 | `F04-cuadre (Caso E)` — arboleda-saldo-a-favor.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 75 | `F15-arboleda-total-entre-parentesis` — 'TOTAL A PAGAR $(376,000)' se lee como $-376.000, no como $0 | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 76 | `F15-arboleda-periodo` — el período de septiembre es '01-septiembre-2026', no el texto de la línea siguiente | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 78 | `F07-s3-antes-de-confirmar` — leer un PDF para la vista previa no publica nada en S3 | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |
| 79 | `F07-s3-sobrescribe` — dos lecturas del mismo período y la misma casa no reutilizan la misma llave de S3 | `parserFacturas.test.mjs` | ❌ | ❌ | ✅ |

**21 de 21 en verde.** No se debilitó ninguna aserción ni se modificó ningún archivo de la Fase 0.

**Sobre #78 y #79** (vista previa sin S3; llaves que no se repiten):

- La #79 sube dos fixtures (`cdc-control.pdf` y `cdc-nota-credito.pdf`, misma casa y mismo período) por la **vista previa**, y exige que las llaves escritas en S3 no se repitan.
- Con la vista previa sin S3 no se escribe ninguna llave, así que la #79 pasa **de forma vacía**: es la misma garantía que la #78.
- La garantía real de "no se pisa" vive en la confirmación y se prueba sin vacío en `confirmarFacturas.test.mjs`:
  - una llave por importación y huella, con `If-None-Match: *`;
  - dos importaciones de la misma casa y el mismo período usan llaves distintas;
  - un reintento que encuentra la llave publicada no la sobrescribe.
- La llave incluye el id de la importación **y** la huella del contenido. No se usó una llave hecha solo de la huella, que sí se repetiría al leer dos veces el mismo archivo (la advertencia del PASO 2).

**Cambio de contrato en una prueba de la Fase 1.** El último caso de `apps/web/pruebas/subidaFacturas.test.mjs` afirmaba que la vista previa publica en S3: era el comportamiento de entonces, y la #78 lo prohíbe. Ahora afirma lo contrario: con permiso, la vista previa lee el PDF, devuelve el hash y **no** publica nada. El cambio está comentado en el archivo. Las otras 5 pruebas de ese archivo (401/403/500) no cambiaron.

---

## 7. Controles

### Los 33 controles de la Fase 0

| # | Prueba | Archivo | Fase 0 | Antes (Fase 1) | Después |
|---|---|---|---|---|---|
| 1 | `F02-control` — un pago aprobado sin factura siguiente deja la factura 'pagada' | `estados.regresion.ts` | ✅ | ✅ | ✅ |
| 6 | `F02-control` — un 'pagada' INFERIDO (sin evidencia) sí se corrige si se vuelve a subir el PDF siguiente corregido | `estados.regresion.ts` | ✅ | ✅ | ✅ |
| 7 | `F11-control` — subir el lote A dos veces ('solo nuevas') no duplica ni cambia estados | `importacion.regresion.ts` | ✅ | ✅ | ✅ |
| 8 | `F11-control` — re-subir agosto y septiembre con 'actualizar' no duplica y conserva lo que dedujo la conciliación | `importacion.regresion.ts` | ✅ | ✅ | ✅ |
| 9 | `F11-control` — volver a subir agosto (con 'actualizar') no deshace un pago aprobado | `importacion.regresion.ts` | ✅ | ✅ | ✅ |
| 15 | `F07-control` — si la etiqueta del documento ('Septiembre / 2026') coincide con el período, se guarda | `importacion.regresion.ts` | ✅ | ✅ | ✅ |
| 16 | `F07-control` — si la etiqueta del documento ('01-septiembre-2026') coincide con el período, se guarda | `importacion.regresion.ts` | ✅ | ✅ | ✅ |
| 18 | `F09-control` — con saldo anterior 0 en octubre, agosto no queda vencida ni abonada | `importacion.regresion.ts` | ✅ | ✅ | ✅ |
| 20 | `F04-control` — con la lectura correcta (la de la fila Totales), la misma regla deja agosto en 'saldo_a_favor' | `importacion.regresion.ts` | ✅ | ✅ | ✅ |
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

### Las 18 pruebas de la Fase 1

| # | Prueba | Archivo | Fase 0 | Antes (Fase 1) | Después |
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

**33 de 33 y 18 de 18 siguen en verde.** En particular:

- la conciliación con la lectura correcta deja agosto en saldo a favor (#20);
- las etiquetas legibles se siguen guardando (#15, #16);
- re-subir sin duplicar ni deshacer pagos (#7, #8, #9);
- los controles del parser (#56, #64, #71, #73, #74).

### Suites generales (antes = `02833b0`, después = *working tree*)

| Suite | Comando | Antes | Después |
|---|---|---|---|
| Backend · facturación | `cd packages/backend && bun run test:facturacion` | 33 ✅ · 22 ❌ (55) | **36 ✅ · 19 ❌** (55); las 19 son de las Fases 3 y 4 |
| Backend · unitarias | `bun run test:unit` | 389 ✅ | **410 ✅** (+21) |
| Backend · convex-test | `bun run test:seguridad` | 895 ✅ (40 archivos) | **922 ✅** (42 archivos, +27) |
| Web · facturación | `cd apps/web && bun run test:facturacion` | subida 6 ✅; carpeta de la Fase 0: 18 ✅ · 18 ❌ | subida 6 ✅ · confirmación 15 ✅ · ingestión 18 ✅ · pantalla de carga 7 ✅ · **carpeta de la Fase 0: 36 ✅ · 0 ❌** |
| Web · resto | `bun test pruebas/<archivo>` (8 archivos) | 137 ✅ | **137 ✅** (sin cambios) |
| Web · todo | `bun run test` *(nuevo)* | — | **219 ✅** (12 procesos) |
| Móvil | `cd apps/mobile && bun run test` | 19 ✅ | **21 ✅** (+2) |
| Tipos | `node ../../node_modules/typescript/bin/tsc --noEmit` | backend ✅ · web ✅ · móvil: 1 error | backend ✅ · web ✅ · móvil: **el mismo** error de HEAD (`packages/backend/convex/auth.ts(34,11)`) |

El *lint* no se corrió, por las mismas razones de la Fase 1: `next lint` no existe en Next 16, y `expo lint` instala ESLint y modifica `package.json`.

---

## 8. Pruebas que siguen fallando

Las 19 fallaban antes y fallan igual después, **con el mismo mensaje de fallo**: se comparó la primera línea del error en el JSON de vitest antes y después. Ninguno de estos hallazgos está resuelto, ni parcialmente.

### Fase 3 — modelo de pagos y estados (11)

| # | Prueba | Archivo | Fase 0 | Antes (Fase 1) | Después | Mismo fallo |
|---|---|---|---|---|---|---|
| 2 | `F02-pagada-a-vencida` — agosto pagado por la pasarela no pasa a 'vencida' porque septiembre arrastre los $300.000 | `estados.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 3 | `F02-pagada-a-abonada` — agosto pagado por la pasarela no pasa a 'abonada' porque septiembre arrastre $40.000 | `estados.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 4 | `F12-comprobante-sobrescrito` — un comprobante aprobado por la administración tampoco se borra por inferencia | `estados.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 5 | `F02-conciliar-boton` — el botón 'Conciliar' (facturas.reconciliar) tampoco degrada una factura pagada con evidencia | `estados.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 10 | `F11-bulkFacturas-duplica` — la migración no crea una segunda factura de agosto para la casa 101 si ya la subió la web | `importacion.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 11 | `F11-bulkFacturas-resetea-estado` — re-ejecutar la migración no devuelve a 'pendiente' una factura pagada | `importacion.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 12 | `F11-upsertFactura-resetea-estado` — la importación por script (upsertFactura) no devuelve a 'pendiente' una factura pagada | `importacion.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 17 | `F09-hueco-de-periodo` — agosto → [septiembre sin cargar] → octubre: el saldo de octubre no basta para juzgar agosto | `importacion.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 21 | `F13-pago-parcial-marcado-pagada` — $250.000 aprobados sobre $300.000 dejan un saldo de $50.000: agosto no puede quedar 'pagada' | `pagos.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 23 | `F02-conciliacion-sobrescribe-pago (Caso A)` — la contabilidad cortó antes de aplicar el abono y septiembre arrastra $300.000: agosto no puede quedar 'vencida' con $250.000 aprobados | `pagos.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 33 | `F06-descuento-vencido` — el 8 de octubre (fecha del pago QA real) se cobra $380.000, no $340.000 | `pagos.regresion.ts` | ❌ | ❌ | ❌ | sí |

### Fase 4 — cobros operativos, reportes y lectura (8)

| # | Prueba | Archivo | Fase 0 | Antes (Fase 1) | Después | Mismo fallo |
|---|---|---|---|---|---|---|
| 36 | `F20-listPorFactura-sin-control` — el vecino de la 202 no puede listar los pagos de la factura de la 101 | `pagos.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 40 | `F08-reportes-duplican-cobro` — tres reportes del mismo carro en septiembre son UN cobro de $7.000, no tres | `parqueadero.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 41 | `F08-estados-paralelos` — marcarlo 'cobrada' en Vigilancia no lo deja 'pendiente' en Cobros de parqueadero | `parqueadero.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 42 | `F08-refacturar` — un cargo ya facturado en octubre no se puede volver a facturar en noviembre | `parqueadero.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 44 | `F10-aporte-suma-arrastre` — agosto y septiembre con $7.000 de aporte cada uno suman $14.000, no $21.000 | `parqueadero.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 45 | `F10-aporte-concepto-equivocado` — el código 5 de Arboleda ('Parqueadero visitante') no es aporte voluntario | `parqueadero.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 54 | `F16-listMia-duplica` — un vínculo repetido a la misma casa no repite las facturas | `residente.regresion.ts` | ❌ | ❌ | ❌ | sí |
| 55 | `F16-listMia-vigencia` — un arrendatario cuyo contrato venció ya no ve las facturas de la casa | `residente.regresion.ts` | ❌ | ❌ | ❌ | sí |

---

## 9. Pruebas nuevas

Todas en las suites normales y todas verdes: **90 pruebas**.

| Archivo | Pruebas | Suite | Qué fija |
|---|---|---|---|
| `packages/backend/pruebas/lecturaFactura.prueba.ts` | 21 | `test:unit` | · Montos con signo en los dos formatos, y lo que no es monto no es 0. <br>· Normalización del período (CDC, Arboleda, "Fecha", `set*`) y rechazo de textos sin forma de período. <br>· Cuadre y tolerancia de $1; motivos válidos; estado de carga. <br>· Contrato de revisión en la cartera: no pagable, ni "al día" ni "mora", y el residente ve "en revisión"; confirmada, vuelve a decidir. <br>· El saldo anterior del documento manda |
| `packages/backend/pruebas/facturacion/ingestion.test.ts` | 19 | `test:seguridad` | **`bulkUpsert`:** <br>· rechaza período contradictorio y unidad ajena; <br>· marca lo que no cuadra y suma los motivos del parser; <br>· total 0 con saldo a favor entra como saldo a favor; <br>· re-subir la lectura correcta quita la marca. <br>**Vigente en revisión:** `puedePagar` en falso, `armarDatosTrn` la rechaza, cartera "en revisión", lista de Finanzas. <br>**Conciliación:** no juzga con un documento marcado; confirmada, usa el saldo anterior de Totales. <br>**`confirmarLectura`:** solo administración y contadora. <br>**`importaciones`:** registro y conteos, repetida, doble clic, plan, retomar la fallida, roles |
| `packages/backend/pruebas/facturacion/reproceso.test.ts` | 8 | `test:seguridad` | **`reprocesarLecturas`:** <br>· en dry-run no escribe y dice qué cambiaría (CDC 401 real: agosto pasa a saldo a favor y la casa sale de la mora); <br>· aplicado, escribe exactamente el plan, y otra pasada sale vacía; <br>· vigente en $0 sin período pasa a saldo a favor y gana su etiqueta. <br>**No toca:** facturas con pago aprobado o comprobante aprobado, ni por conciliación; un documento de otro período; facturas de otro conjunto. <br>**Agosto sin total:** queda en revisión y la casa no se declara en mora |
| `apps/web/pruebas/ingestionFacturas.test.mjs` | 18 | `test:facturacion` | Los 9 fixtures que cuadran entran sin marcas. Total no leído (nunca $0), continuación y hoja sin filas, marcados. Un documento ajeno no es factura. Agrupación de un PDF consolidado. Período de Arboleda septiembre y de la "Fecha" de CDC. Formato de enero. Huella |
| `apps/web/pruebas/confirmarFacturas.test.mjs` | 15 | `test:facturacion` (proceso aparte) | **Errores:** 401, 403 y 500 sin escribir; archivo distinto → 409; asignaciones inválidas → 400. <br>**S3:** solo al confirmar y solo lo que se inserta o actualiza, con llave de la importación e `If-None-Match`; "solo nuevas" no publica la omitida; dos importaciones no comparten llave; otro mes no se publica; el reintento no sobrescribe. <br>**Idempotencia:** confirmar dos veces no publica ni guarda. <br>**Guardado:** se guardan los números del servidor (total con signo, crédito, Totales); las facturas sin unidad quedan registradas; si guardar falla, la importación queda "fallida" con 500 |
| `apps/web/pruebas/cargaFacturas.test.mjs` | 7 | `test:facturacion` (proceso aparte) | Pantalla real: período desde los documentos, resumen del lote y lectura por factura; bloqueo por períodos distintos, por período elegido distinto y por período ilegible; confirmar manda el mismo archivo, la huella y las unidades; resultado del backend, repetida y error con reintento |
| `apps/web/pruebas/subidaFacturas.test.mjs` | 6 (1 ajustada) | `test:facturacion` | Ver §6: la vista previa ya no publica |
| `apps/mobile/pruebas/resumenFacturas.prueba.ts` | +2 (21) | `test` (móvil) | Vigente con total no leído: "Factura en revisión", ni "al día" ni nada por pagar. `estadoVisible` muestra "en revisión" hasta que se confirme |

**Fixtures nuevos** (`apps/web/pruebas/facturacion/fixtures/`): `cdc-total-no-leido.pdf`, `cdc-consolidado-con-continuacion.pdf`, `arboleda-septiembre.pdf` y `cdc-sin-fila-de-cuota.pdf`.

- Se generaron con `anonimizar.mjs`, con las dos verificaciones de la Fase 0: **0 fugas** (ningún fragmento reemplazado aparece en el fixture) y **la misma lectura** del original y del anonimizado, salvo casa, nombre y consecutivo.
- Se volvieron a verificar después de la corrección del formato de enero.
- Entradas nuevas en el README, sin tocar las existentes.
- No hay otros códigos de crédito que cubrir: `CI` y `NCC` ya tenían fixture.

**Ejecución regular de la web** (convención de la Fase 0, §2). La carpeta `pruebas/facturacion/` ya pasa entera. La web no tenía un script general, así que se agregó `bun run test`, que corre todas las suites de la web. Cada archivo que simula módulos (`mock.module`) corre en su propio proceso, porque los dobles se comparten dentro de un proceso de bun. El contenido de las pruebas de la Fase 0 no se tocó.

---

## 10. Regresión masiva del parser (PASO 11)

**Método:**

- **Corpus:** los 2.792 PDF del PASO 3.
- **Tres lecturas de cada documento:**
  - el parser **viejo**, copiado tal cual de `route.ts` en `02833b0`;
  - el **nuevo**;
  - el **documento**, leído con expresiones propias e independientes de los dos parsers: Totales, "Pague sin descuento", "TOTAL A PAGAR" y la fecha del período.
- **Salida:** solo ids y montos.

### 10.1 Metas

| Medida | Esperado | Parser viejo | **Parser nuevo** |
|---|---|---|---|
| Totales negativos leídos como 0 | 0 | **61** (CDC 44 · Arboleda 17) | **0** (los 61 se leen con su signo) |
| Saldo anterior de CDC distinto de Totales | 0, o marcados | **317**, sin marca | **0** en el saldo que usa la conciliación (`saldoAnteriorDocumento`). En **48** la suma de las líneas difiere de Totales (hojas de continuación con filas incompletas): **las 48 marcadas** |
| Facturas que no cuadran y no están marcadas | 0 | **404** | **0** (48 no cuadran; todas marcadas) |
| Totales no leídos guardados sin marca | 0 | **16**, guardados en $0 | **0** (16 marcadas `total_no_leido`, con la suma de lo leído) |
| Etiqueta del período de Arboleda, septiembre | 172 de 172 correctas, o marcadas | 0 de 172 (`Arboleda Campestre Aptos"`) | **172 de 172** (`01-septiembre-2026`) |
| Documentos que antes se leían bien y ahora cambian | 0; explicar cada excepción | — | **167 de 2.218**, **todos por la misma razón** (abajo) |
| Documentos que no son cuentas de cobro | — | 3 leídos como factura (total $0) | 3 rechazados |
| Período ilegible | — | 226, sin marca | 35, **todos marcados** (hojas de continuación sin fila `*` ni "Fecha") |

**La única excepción: el código 6 de Arboleda.**

- "Antes se leía bien" significa: total = documento, Σ líneas = total, saldo anterior = Totales (en CDC) y período legible e igual al del documento. Son 2.218 documentos.
- De esos, cambian **167**, todos de Arboleda, agosto de 2026, y todos en lo mismo: el concepto de la línea 6 pasa de **"Honorarios abogado" a "Cuota extra camaras"**.
- El parser viejo forzaba una etiqueta fija; el documento dice "CUOTA EXTRA CAMARAS". **Los montos no cambian**, y ningún código depende de esa etiqueta (verificado por búsqueda en el repositorio).

### 10.2 Contra la auditoría y contra sí mismo

- **Reproduce la auditoría §14.4 exactamente.** Sobre los 1.215 PDF de CDC del historial, el parser viejo da **32** totales negativos leídos como 0, **252** saldos anteriores distintos de Totales y **33** PDF sin líneas: las cifras de la auditoría. Con el nuevo: 0 negativos mal leídos; las 48 diferencias de líneas contra Totales y los 33 sin líneas quedan todos marcados.
- **Invariante por línea** (total = saldo anterior + cargo del mes, ±$1), medido en las 13.347 líneas del corpus:
  - **Violaciones encontradas:** el parser nuevo violaba el invariante en 53 documentos de CDC de enero, por la fila que trae saldo anterior y cargos del mes. Se corrigió (§4) y hoy hay **0 violaciones en CDC**.
  - **18 de Arboleda, por diseño:** la línea 1 imprime un solo monto, el saldo a favor, que se guarda en `total` como siempre. Ver §14.
  - **`vrAdmon`:** con la corrección dejó de quedar en 0 en esos 44 documentos de enero.
- **Identidad del documento** (con el emparejador real de la pantalla, `lib/emparejar-unidad.ts`):
  - de 2.741 facturas con unidad legible, **2.724 coinciden** con su unidad y **0** son de otra;
  - 17 son ambiguas para el emparejador (un tramo de Arboleda de mayo), sin contradicción;
  - 51 no traen unidad legible: 48 hojas de continuación y 3 documentos que no son cuentas de cobro.

---

## 11. Re-procesamiento en modo informe (PASO 12)

**No se escribió nada.** Es una simulación sobre una exportación de solo lectura, con el **mismo planificador** que aplicaría `reprocesarLecturas` (`lib/reproceso.ts`). Lo que se revisa es lo que se escribiría.

### 11.1 Fuente y método

- **Datos:**
  - exportación de solo lectura del 2026-10-08 (`bunx convex data <tabla> --format jsonl` → scratchpad): 2.792 facturas, 379 unidades, 3 conjuntos, 2 pagos (ambos `fallida`, QA) y 0 comprobantes;
  - el texto de cada PDF ya cargado, que es el corpus del PASO 3.
- **Regla, por unidad y por toda su cadena:**
  1. Cada factura toma la lectura nueva de su propio PDF, con la semántica de `bulkUpsert` al actualizar.
  2. El estado de carga (`pendiente` / `saldo_a_favor`) se recalcula. Un estado que vino de la conciliación o de un pago se conserva.
  3. La cadena se re-concilia con `veredictoConciliacion`.
  4. **No se toca** una factura con pago aprobado o comprobante aprobado (hoy **0**), ni una cuyo documento diga otro período (hoy **0**).
- **Momento:** `ahora` = 2026-10-08 12:00 (Bogotá), el mismo de la Fase 1.
- **Exclusiones:** las unidades de prueba no cuentan en las cifras (§11.7). Quedan **377** unidades.
- **Tres escenarios**, porque un hallazgo de esta fase (§11.3) cambia el resultado:
  - **A**: con los PDF publicados hoy.
  - **B**: A + agosto de CDC **completado** con las hojas de continuación que siguen en S3.
  - **C**: B + las 48 hojas de continuación históricas (ene–jun) **confirmadas** por la administración (`confirmarLectura`).

### 11.2 Resultado global

| Estado que ve el residente (377 unidades) | Hoy | A | **B** | C |
|---|---|---|---|---|
| Al día | 11 | 12 | 12 | 12 |
| Pendiente | 283 | 285 | **289** | 289 |
| Vencida (en mora) | 83 | 64 | **76** | 76 |
| En revisión | 0 | 16 | **0** | 0 |

La cartera de la administración cambia igual que el estado del residente: en B, 7 unidades pasan de "en mora" a "pendiente" y 1 de "pendiente" a "al día". El **saldo vigente** cambia en **1** unidad, CDC 802 ($342.000 → $0, §11.4). En las demás, lo que se debe hoy no cambia: cambian el estado y el historial.

| Por factura (escenario B) | CDC (1.621) | Arboleda (1.168) |
|---|---|---|
| Total | 60 (43 negativos guardados en $0; 16 de agosto guardados en $0 porque solo se publicó la primera hoja; 1 deuda inflada, CDC 802) | 17 (negativos guardados en $0) |
| Saldo a favor | 44 | — |
| Total con descuento | 66 (49 negativos que antes no se leían; 16 de agosto completado; 1 que cambia de signo, CDC 802) | — |
| Cuota del mes (`vrAdmon`) | 58 (enero 44 · agosto 13 · septiembre 1) | — |
| Saldo anterior que usa la conciliación | 330: 257 pasan a negativo (la fila de crédito ahora entra) y 65 suben (las filas incompletas se quedaban cortas frente a Totales) | 0 |
| Saldo anterior del documento (campo nuevo) | 1.621 | — |
| Líneas | 335 (créditos, `SF`, formato de enero, agosto completo) | 351 (código 6; línea 1 con signo) |
| Estado | 51 | 16 |
| En revisión | 48 (las hojas de continuación históricas; en A, 64) | 0 |
| Etiqueta del período | 18 vacías que se llenan desde la "Fecha" (14 de agosto, 4 de septiembre) | 172 (septiembre) |

- **129 facturas** cambian de total, de estado o quedan en revisión: Anexo R7.
- Otras 223 cambian solo el saldo anterior y 387 solo líneas, sin cambiar total ni estado:
  - 333 son el concepto del código 6 de Arboleda;
  - 53 son los documentos de enero de CDC, que completan el cargo del mes.

### 11.3 Hallazgo: las hojas de continuación de agosto siguen en S3

- **El problema.** Las 16 facturas de agosto de CDC con total $0 tienen publicada solo la **primera hoja** (sin Totales ni "Pague sin descuento"): con lo publicado, su total no se puede leer.
- **El origen.**
  - La carga de agosto (2026-08-21) se hizo con el código anterior a `c89204a`. Ese código partía cada hoja de continuación como una "factura sin unidad".
  - Y la subía a `…/2026-08/unidad-page-N.pdf`, con N = página del PDF consolidado.
- **La búsqueda.** Un GET anónimo (solo lectura) de N = 1…400 encontró **36 hojas**, en **16 tramos** consecutivos: tantos como las 16 casas.
- **El emparejamiento**, por dos caminos independientes:
  1. **Por cuadre.** Se combinó cada primera hoja dudosa con cada tramo (16 × 16) y se quedaron las combinaciones que cuadran al peso: Σ líneas = total y Σ saldo anterior = Totales. 14 casas tienen **una sola** combinación que cuadra. Las otras 2 (504 y 508) tienen filas idénticas y cuadran con dos tramos.
  2. **Por orden.** El consolidado tiene 237 páginas: 201 primeras hojas ordenadas por número de casa, más las 36 de continuación. Cada tramo sigue exactamente a la hoja de su casa. Esto coincide en las 14 y resuelve 504 → páginas 103–105 y 508 → 110–112.
- **Resultado (escenario B).** Las 16 se leen completas y sin marcas:
  - **12 tienen mora real**: el saldo anterior de septiembre arrastra todo agosto;
  - **4 abonaron** agosto (CDC 111, 112, 220 y 504), así que quedan "Pendiente" con la misma regla de la Fase 1.

### 11.4 Lo que encontró el re-procesamiento, por prioridad

1. **Grupo D (21 de CDC, Anexo R1):**
   - **401, 410 y 607** salen de la mora en A y en B. Agosto era saldo a favor (−$262.000, −$97.330 y −$3.200) guardado en $0 y `vencida`. Son los casos de la auditoría §14.5, ahora confirmados con sus PDF. En 401 también se corrigen enero, abril y mayo (saldos a favor que estaban como `pagada`).
   - **503 y 910** siguen en mora, ahora con documentos que cuadran. En 503, septiembre trae una fila de crédito y su saldo anterior real es $30.000: el total de agosto, sin pagar. En 910, el saldo anterior de septiembre ($672.000) arrastra agosto entero. **Mora real según la contabilidad.**
   - **Las 16 restantes:** "En revisión" en A; en B, 12 en mora real y 4 "Pendiente" (§11.3).
2. **Fase 1 §9.5 (Anexo R2):**
   - **611:** todas sus facturas pasan a saldo a favor, incluido mayo (`vencida`).
   - **701:** marzo y abril pasan a `pagada`: el crédito se leía como deuda.
   - **716:** marzo y abril pasan a saldo a favor, pero **mayo sigue `vencida`**. No es el parser. La unidad no tiene junio, y la conciliación juzga mayo con agosto, cuyo saldo anterior incluye junio y julio. Es **F-09** (huecos de período, Fase 3) y no cambia el estado actual ("Pendiente").
   - **904 y 907:** la deuda oculta del historial **solo se corrige en el escenario C**. Las facturas de abril a junio que la revelan son hojas de continuación y quedan en revisión; al confirmarlas, marzo a junio pasan a `vencida`. Su estado actual ya era "Vencida" y no cambia.
3. **Las 13 "Al día" de la Fase 1 (Anexo R3):**
   - **10** son **saldo a favor leído como 0**: del −$2.500 de CDC 901 al −$1.162.248 de Arboleda T-I 901.
   - **1** es **cero real**: Arboleda T-III 303; el documento dice $0.
   - **0** son totales no leídos.
   - Las otras 2 son las unidades de prueba.
4. **Arboleda, septiembre (Anexo R4):**
   - las **172** etiquetas pasan a `01-septiembre-2026`;
   - las **5** que quedaron `pendiente` con saldo a favor pasan a **saldo a favor**. Las 5 están entre las 10 del punto 3.
5. **Todo lo demás (Anexos R5 y R5.1):**
   - **CDC 802** debe hoy, según Vekino, **$342.000**, y su documento de septiembre dice **saldo a favor de $103.400**: el parser viejo no leía el signo y tomó otra cifra. **Hoy esa factura es pagable.** Es la única unidad cuyo saldo vigente cambia.
   - En el historial: 33 facturas de CDC y 11 de Arboleda pasan de `pagada` a saldo a favor. CDC 717 (agosto) y 313 (mayo) pasan de `pagada` a `abonada`.

### 11.5 Escenario C: el historial que corrigen las hojas de continuación

- **Qué se simula.** La administración confirma las 48 hojas de continuación históricas (ene–jun de 2026) que quedan en revisión.
- **Qué cambia en el historial** (54 estados más que en B):
  - **28** pasan de `pagada` a `vencida`;
  - **18** de `abonada` a `vencida`;
  - **8** de `pagada` a `abonada`.
- **Qué significa.** Es la "deuda oculta" de la auditoría §14.4: meses `pagada` sin serlo, porque el saldo anterior que los juzgaba salía de filas incompletas.
- **Qué no cambia.** Ningún estado actual de unidad: lo deciden agosto y septiembre. Lo que cambia es el historial que ven el residente y la administración ("Vencida" en meses viejos).

### 11.6 Lo que la administración debe revisar antes de aplicar

- [ ] **Agosto de CDC.** Para las 16 casas, preferir que la contabilidad entregue el **PDF consolidado original de agosto** y volver a cargarlo con "actualizar":
  - publica PDF completos con llave nueva;
  - aplica el parser nuevo a las 201 facturas;
  - re-concilia.

  La alternativa es aplicar el escenario B con las hojas recuperadas de S3. Requiere autorización, y además publicar los PDF completos para que el `pdfUrl` deje de mostrar solo la primera hoja.
- [ ] **Grupo D.** Confirmar con la contabilidad las 12 moras reales (B), las 4 que abonaron agosto, y que 401, 410 y 607 tenían saldo a favor.
- [ ] **CDC 802.** Confirmar el saldo a favor de $103.400. **Hasta que se aplique, el residente puede pagar $342.000 que no debe.** Es el caso más urgente.
- [ ] **Las 10 "Al día" con saldo a favor.** Verificar los montos (Anexo R3).
- [ ] **Historial (escenario C).** Decidir si se confirman las 48 hojas de continuación. Cambian 54 estados históricos.
- [ ] **CDC 716, mayo.** Queda `vencida` por el hueco de junio y julio (F-09), no por el parser.
- [ ] **Unidades de prueba** (CDC 999, Arboleda 9999). Decidir si se borran sus facturas y documentos. Uno es un documento personal ajeno, servido públicamente (§12).
- [ ] **Arboleda, línea 1.** Confirmar si el "Saldo a favor" es saldo anterior (§14).

### 11.7 Unidades de prueba y evidencia de pago

- **CDC 999 y Arboleda 9999 son de prueba, según los datos:**
  - el número está fuera de la numeración del conjunto (CDC va de 101 a 924);
  - tienen 1 y 2 facturas, solo de marzo y abril;
  - sus 3 PDF **no son cuentas de cobro**: el parser nuevo los rechaza;
  - cada una tiene un solo vínculo.

  No cuentan en ninguna cifra para la administración (Anexo R6).
- **Facturas con evidencia de pago** (pago `aprobada` o comprobante `aprobado`): **0**. El planificador las dejaría intactas, números y estado, y lo prueba `reproceso.test.ts`.

### 11.8 Ruta de aplicación (preparada, no ejecutada)

`facturas.reprocesarLecturas` es una mutación **interna** (`internalMutation`): no se puede llamar desde un cliente.

1. **Leer.** Un script local lee con el parser nuevo el PDF publicado de cada factura (y, para agosto de CDC, el consolidado original) y arma las `lecturas`.
2. **Simular.** `bunx convex run facturas:reprocesarLecturas '{"condominioId": …, "lecturas": [...]}'` **sin** `dryRun`: no escribe y devuelve el plan. Comparar con este informe.
3. **Aplicar**, solo con autorización explícita: lo mismo con `"dryRun": false`.
   - Va **por lotes de pocas unidades**, unas 20, porque lee pagos y comprobantes de cada factura y Convex limita las lecturas por función.
   - Escribe exactamente el plan. Una segunda pasada sale vacía: es idempotente, y está probado.
4. **Revisar.** La administración revisa la lista "en revisión" de Finanzas.

**Antes de aplicar:**

- desplegar esta fase (§13);
- aclarar el deployment (§12);
- confirmar que siguen en 0 las facturas con evidencia de pago.

---

## 12. Deployment y S3 (PASO 1)

### Convex

| Pregunta | Respuesta |
|---|---|
| ¿Qué deployment resuelve cada comando? | `packages/backend/.env.local` define **a la vez** `CONVEX_DEPLOYMENT` y `CONVEX_DEPLOY_KEY`, y la CLI le da prioridad a la deploy key. Se leyó solo el tipo y el nombre que codifica la llave, no su parte secreta: **`dev:agreeable-bee-782`**. Por eso **todos** los comandos, también con `--prod`, van a ese deployment |
| ¿Por qué la Fase 1 vio "la misma base" con `--prod`? | Por eso mismo: `--prod` se ignoraba. **Fue un artefacto**, no la prueba de que dev y prod compartan base |
| ¿Cuál opera con los residentes? | **`agreeable-bee-782`**, un deployment de tipo *dev*. La web pública (la URL de Convex de su *bundle*) y el perfil de producción de la app móvil (`eas.json`) apuntan a él |
| ¿Existe además un deployment de producción? | **No se pudo verificar.** Sin la deploy key, la CLI exige iniciar sesión en Convex, y esta fase no lo hizo |
| Consecuencia | Un `convex dev` desde cualquier máquina con ese `.env.local` sube código **al deployment que usan los residentes**. Por eso esta fase no lo ejecutó |

### S3

| Pregunta | Respuesta |
|---|---|
| Bucket | `vekino` (us-east-1), según los `pdfUrl` |
| ¿Se puede leer? | Sí: los objetos son de **lectura pública** (GET anónimo). El **listado anónimo está bloqueado** |
| ¿Qué se usó? | Solo **GET anónimo** a URLs públicas: los 922 `pdfUrl` de julio a septiembre, y 400 sondeos de `…/2026-08/unidad-page-N.pdf` (36 existen; 364 responden 403). **No se usaron credenciales de AWS**: nada pudo escribir. Las que tiene la web son las que usan las rutas para publicar, así que presumiblemente pueden escribir; no se usaron |

**Riesgos de privacidad encontrados** (no se tocó nada; corregirlos requiere autorización):

1. **Llaves predecibles y lectura pública.** Con `…/{período}/unidad-{casa}.pdf` y `…/unidad-page-N.pdf`, cualquiera puede descargar el estado de cuenta de cualquier casa adivinando la URL. Las llaves nuevas (id de la importación + huella) no se adivinan por número de casa, pero el bucket sigue siendo público, y las llaves viejas siguen ahí.
2. **Documentos ajenos publicados.** Para las unidades de prueba hay 3 PDF que no son cuentas de cobro; uno es un documento personal de una persona real. Se sirven públicamente.
3. **Hojas "sin unidad" de agosto** (36): siguen publicadas.

**Recomendación:** bucket privado con URLs firmadas, retirar los documentos ajenos y revisar el alcance de las credenciales. Es trabajo aparte de esta fase y requiere autorización.

---

## 13. Orden de despliegue y compatibilidad

**Orden: 1) Convex (esquema y funciones) → 2) web → 3) móvil.**

| Combinación | Qué pasa |
|---|---|
| **Backend nuevo + web vieja** | Funciona y es más seguro que hoy. <br>· La ruta vieja sigue publicando en S3 al leer (hasta desplegar la web). <br>· Pero `bulkUpsert` ya **rechaza** períodos contradictorios y **marca** lo que no cuadra con los números del parser viejo; un negativo leído como 0 deja de cuadrar y queda en revisión. <br>· El estado de carga ya no depende de lo que mande el navegador |
| **Web nueva + backend viejo** | No usar. <br>· La vista previa funciona (`permisoSubida` existe desde la Fase 1). <br>· La confirmación falla en `iniciarImportacion`, que no existe, **antes** de publicar o escribir: responde 500 sin efectos. <br>· Finanzas consulta `listEnRevision`, que no existe: la consulta lanza un error y la página puede fallar |
| **Móvil nuevo + backend viejo** | Funciona: sin `lecturaDudosa`, nada se ve "en revisión" |
| **Móvil viejo + backend nuevo** | Funciona. Una factura en revisión se ve con su estado guardado ("Pendiente"), pero "Pagar" lo decide `pagos.puedePagar` en el servidor, que la rechaza |
| **Datos existentes** | No requieren migración: todos los campos nuevos son opcionales. Desplegar el backend **no cambia ningún dato**. `facturas.reconciliar` sobre los datos actuales, sin `saldoAnteriorDocumento` ni marcas, da los mismos estados que hoy. Los datos cambian solo al re-cargar PDF o al aplicar el re-procesamiento |

**Antes de desplegar**, aclarar §12: hoy "desplegar" el backend es escribir en el deployment que usan los residentes, que es de tipo *dev*.

---

## 14. Riesgos pendientes

| Hallazgo | Riesgo que sigue abierto | Fase |
|---|---|---|
| **F-02** | La conciliación sigue pisando un `pagada` con evidencia (pago o comprobante aprobado). El re-procesamiento ya no lo hace (lo protege el planificador), pero `bulkUpsert`, `confirmarLectura` y `reconciliar` sí | 3 |
| **F-09** | Huecos de período: la conciliación juzga a través de un mes faltante (CDC 716, mayo, §11.4) | 3 |
| **F-06, F-13, F-11, F-05** | Sin cambios: fecha del descuento, pago parcial `pagada`, migraciones que resetean estados, pagos externos | 3 |
| **F-08, F-10, F-16, F-20** | Sin cambios. El aporte voluntario (F-10) ganará exactitud con `actual`, que ahora se lee bien también en el formato de enero | 4 |
| **Heredado de la Fase 1** | Las versiones instaladas del móvil siguen mostrando "Pagar" en facturas históricas. Con `avalPortalUrl`, ese botón abre el portal del banco sin pasar por `armarDatosTrn`. **Igual con una factura en revisión**: la app vieja no la distingue, y el portal del banco no consulta a Vekino | — |
| **CDC 802** | Hasta aplicar el re-procesamiento, su vigente pide $342.000 y el documento dice saldo a favor de $103.400 | Ya |

**Riesgos propios de esta entrega:**

1. **Carga operativa de "en revisión".**
   - Aplicado el escenario A sin completar agosto, 16 casas se ven "en revisión" en la cartera. Su vigente (septiembre) sigue pagable, porque la dudosa es agosto.
   - Las 48 hojas históricas también quedan en la lista de Finanzas hasta que alguien las confirme. La acción es por factura.
2. **Tiempo de la confirmación.** Un PDF de unas 230 páginas se lee dos veces y publica unos 200 PDF (6 en paralelo) dentro de `maxDuration = 60` s. Si se corta, la importación queda "en curso" o "fallida" y se **retoma** sin duplicar nada (misma importación, mismas llaves, `If-None-Match`, `bulkUpsert` idempotente). No se midió en Vercel.
3. **Línea 1 de Arboleda.** El documento imprime un solo monto bajo SALDO ANTERIOR · ACTUAL · TOTAL, y se guarda en `total`, como siempre. En los 18 casos del corpus las demás líneas están en 0, así que la conciliación da lo mismo. **Pregunta para la administración:** ¿es saldo anterior? Si sí, moverlo es un cambio de una línea, que no se hizo porque es una regla de negocio.
4. **Sin reversión de importaciones** (§3).
5. **Pantalla de Finanzas.** El bloque "en revisión" y "Confirmar lectura" no tienen prueba de pantalla. Su backend sí (`listEnRevision`, `confirmarLectura`, en convex-test). La pantalla de carga sí tiene prueba.
6. **Mensajes en producción.** Como en la Fase 1, el backend usa `Error`. Los rechazos de la carga viajan como **valores devueltos** (motivos y rechazos), no como texto de error, así que no dependen de que Convex muestre el mensaje.
7. **Deployment y S3.** Ver §12: el deployment de los residentes es de tipo *dev*, y el bucket es público con llaves predecibles. Además, `AVAL_AMBIENTE` sigue en `qa` (Fase 1 §9.6).

---

## 15. Recomendación para la Fase 3

**Queda listo:**

- Una lectura confiable, con contrato de revisión, y una importación trazable e idempotente.
- Un planificador de re-procesamiento probado. Aplicarlo, con autorización y después de la revisión del §11.6, deja los datos coherentes con los documentos antes de cambiar el modelo de pagos.
- La regla de conciliación en una sola función pura (`veredictoConciliacion`), que la Fase 3 puede endurecer sin perseguir copias.

**Orden sugerido:**

1. **Antes de la Fase 3:**
   - aclarar el deployment;
   - desplegar esta fase;
   - resolver agosto de CDC (consolidado original);
   - aplicar el re-procesamiento con autorización, empezando por CDC 802 y el grupo D.
2. **F-02:** la conciliación no debe degradar una factura con evidencia de pago. El planificador ya lo hace (`conEvidencia`); llevar esa guarda a `conciliarCadenaUnidad` y a `reconciliar` (#2–#5, #23).
3. **F-09:** no juzgar a través de un período faltante (#17). Hay casos reales: CDC 716.
4. **F-13, F-06 y F-11:** pago parcial, fecha del descuento, migraciones que resetean (#21, #33, #10–#12).
5. **S3 privado** con URLs firmadas, y retirar los documentos ajenos.

**Criterio de salida de la Fase 3:** las 11 pruebas de su tabla en verde, y los 33 controles, las 18 de la Fase 1 y las 21 de la Fase 2 todavía en verde.

---

## 16. Anexo de comandos (todos de solo lectura)

| Paso | Comando | Efecto |
|---|---|---|
| Línea base y verificación final | Backend: `bun run test:facturacion`, `test:unit` y `test:seguridad`, y `vitest --reporter=json`. Web: `bun run test:facturacion`, `bun test pruebas/<archivo>`, `bun test pruebas/facturacion --reporter=junit` y `bun run test`. Móvil: `bun run test`. `tsc --noEmit` en los tres | — |
| Deployment | Lectura de los **nombres** de las variables de `packages/backend/.env.local` y del tipo y nombre que codifica la deploy key, sin su parte secreta. Lectura de `eas.json` y de la URL pública de Convex en la web | Lectura |
| Datos | `bunx convex data facturas\|unidades\|condominios\|pqrs\|pagos\|soportesPago\|usuarioUnidad --limit 8000 --format jsonl` → scratchpad | Lectura |
| Corpus del historial | `git archive a0cf84b^ migrate/.tmp-descuento` → scratchpad | — |
| Corpus de S3 | GET anónimo de los 922 `pdfUrl` de julio a septiembre, y de `…/2026-08/unidad-page-{1…400}.pdf` | Lectura |
| Parser viejo | `git show 02833b0:apps/web/app/api/facturas/upload/route.ts`, líneas 53–241, copiadas tal cual al scratchpad | — |
| Análisis | Scripts en el scratchpad (nunca en el repositorio): <br>· extracción por página con `pdf-layout.ts`; <br>· catálogo; <br>· regresión con tres lecturas; <br>· invariante por línea; <br>· identidad con `emparejarLote`; <br>· emparejamiento de las hojas de agosto por cuadre y por orden; <br>· informe de re-procesamiento con `lib/reproceso.ts` (escenarios A, B y C); <br>· cruce #1–#91. <br>Salidas: solo ids y montos | — |

No se ejecutó `convex dev` ni `convex deploy`, ni ninguna mutación, migración o script que escriba en Convex. No se escribió, borró ni sobrescribió ningún objeto de S3. No se hizo commit.

---

## Anexo R — Re-procesamiento, por grupo

Datos de la exportación de solo lectura del 2026-10-08, sin nombres de residentes, con `ahora` = 2026-10-08 12:00. Estados del residente:

- "Al día" / "Pendiente" / "Vencida" / "En revisión" (`resumenResidente`);
- cartera de la administración: `carteraDeUnidad`.

Montos negativos = saldo a favor.

### R1. Grupo D de la Fase 1 (21 de CDC): siguen "Vencida" con lectura sospechosa

A = con los PDF publicados hoy. B = con agosto completado por las hojas de continuación de S3 (§11.3). "Qué cambia" es el escenario B.

| # | Unidad | Residente hoy | Re-procesado (A) | Re-procesado (B) | Cartera hoy | Cartera (B) | Saldo vigente | Factura vigente | Qué cambia (B) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | CDC 111 | Vencida | En revisión | **Pendiente** | en mora (2026-08, 23 d) | pendiente | $15.640.150 | FAC-2026-09-0118 `js79yks2hsqarrvqf1sge94zns8e02dz` | abr: saldo ant. $1.911.300 → $14.840.550 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); may: saldo ant. $2.276.900 → $14.911.150 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); jun: saldo ant. $0 → $14.976.150 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $15.530.150 · vencida → **abonada** · saldo ant. $3.278.000 → $15.118.150 |
| 2 | CDC 112 | Vencida | En revisión | **Pendiente** | en mora (2026-08, 23 d) | pendiente | $15.776.100 | FAC-2026-09-0177 `js71vnwxa1xtnze3yfgszpec6x8e0ad3` | abr: saldo ant. $1.689.400 → $14.733.300 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); may: saldo ant. $2.110.200 → $14.854.100 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); jun: saldo ant. $0 → $15.214.100 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $16.286.100 · vencida → **abonada** · saldo ant. $3.325.550 → $15.930.100 |
| 3 | CDC 211 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $5.705.200 | FAC-2026-09-0117 `js73rdn6bprc0bqcv3tcdvk38n8e0ewt` | abr: saldo ant. $0 → $4.186.600 · en revisión (lineas_no_cuadran, pagina_de_continuacion, periodo_no_leido, saldo_anterior_no_cuadra); may: saldo ant. $0 → $3.567.200 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); jun: saldo ant. $0 → $3.969.200 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $5.298.200 · saldo ant. $4.549.200 → $4.884.200 |
| 4 | CDC 220 | Vencida | En revisión | **Pendiente** | en mora (2026-08, 23 d) | pendiente | $3.699.900 | FAC-2026-09-0068 `js742q6b9s1kwmvaxm8mq3mabn8e1hha` | abr: saldo ant. $334.000 → $5.828.900 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); may: saldo ant. $0 → $4.451.900 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); jun: saldo ant. $0 → $4.556.900 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $5.226.900 · vencida → **abonada** |
| 5 | CDC 401 | Vencida | Pendiente | **Pendiente** | en mora (2026-08, 23 d) | pendiente | $73.000 | FAC-2026-09-0181 `js7bmbk16by748atvfhdp3nsdh8e0gs4` | ene: total $0 → −$206.000 · pagada → **saldo a favor** · saldo ant. $0 → −$516.000; feb: saldo ant. $0 → −$246.000; abr: total $0 → −$173.000 · pagada → **saldo a favor** · saldo ant. $0 → −$540.000; may: total $0 → −$486.000 · pagada → **saldo a favor** · saldo ant. $0 → −$867.000; ago: total $0 → −$262.000 · vencida → **saldo a favor** · saldo ant. $0 → −$597.000; sep: saldo ant. $335.000 → −$262.000 |
| 6 | CDC 402 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $10.534.010 | FAC-2026-09-0061 `js7drneq81f3f2mgakqqs1k03x8e1kxw` | abr: saldo ant. $0 → $8.144.410 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); may: saldo ant. $0 → $8.769.010 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); jun: saldo ant. $0 → $9.026.010 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $10.133.010 · saldo ant. $4.620.000 → $9.784.010; sep: saldo ant. $10.132.450 → $10.133.010 |
| 7 | CDC 404 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $3.981.100 | FAC-2026-09-0039 `js7d6pbqx3z1y9nmmpavcvew558e1y43` | jun: saldo ant. $0 → $2.616.100 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $3.646.100 |
| 8 | CDC 405 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $4.279.800 | FAC-2026-09-0172 `js7ekh2d7y3hv1pgrk097b4ann8e0g9b` | may: saldo ant. $0 → $2.554.800 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); jun: saldo ant. $0 → $2.914.800 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $3.944.800 |
| 9 | CDC 410 | Vencida | Pendiente | **Pendiente** | en mora (2026-08, 23 d) | pendiente | $300.670 | FAC-2026-09-0168 `js7e60ay93bxq3t44m212755x58e01t1` | ago: total $0 → −$97.330 · vencida → **saldo a favor** · saldo ant. $0 → −$446.330; sep: saldo ant. $349.000 → −$97.330 |
| 10 | CDC 501 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $25.589.620 | FAC-2026-09-0040 `js71zttzt5h9f0rrwxd07xfbjd8e16dq` | abr: saldo ant. $0 → $23.269.120 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); may: saldo ant. $0 → $23.629.120 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); jun: saldo ant. $0 → $23.989.120 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $25.254.620 · saldo ant. $13.783.620 → $24.919.620 |
| 11 | CDC 503 | Vencida | Vencida | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $365.000 | FAC-2026-09-0038 `js751xdb0771vt4v251ysjzetd8e0fvk` | feb: total $0 → −$1.040.000 · pagada → **saldo a favor** · saldo ant. $0 → −$1.350.000; mar: total $0 → −$770.000 · pagada → **saldo a favor** · saldo ant. $0 → −$1.080.000; abr: total $0 → −$450.000 · pagada → **saldo a favor** · saldo ant. $0 → −$810.000; may: total $0 → −$130.000 · pagada → **saldo a favor** · saldo ant. $0 → −$490.000; jun: saldo ant. $0 → −$170.000; ago: saldo ant. $0 → −$305.000; sep: saldo ant. $335.000 → $30.000 |
| 12 | CDC 504 | Vencida | En revisión | **Pendiente** | en mora (2026-08, 23 d) | pendiente | $24.769.520 | FAC-2026-09-0042 `js721p2sjrsbnzrapj2cz7b1kn8e14m6` | abr: saldo ant. $0 → $23.354.520 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); may: saldo ant. $0 → $23.714.520 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); jun: saldo ant. $0 → $24.074.520 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $24.769.520 · vencida → **abonada** · saldo ant. $13.785.720 → $24.434.520 |
| 13 | CDC 508 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $25.659.720 | FAC-2026-09-0044 `js71h2z2fy451g4g8y7aq6wf4d8e03ep` | abr: saldo ant. $0 → $23.339.220 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); may: saldo ant. $0 → $23.699.220 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); jun: saldo ant. $0 → $24.059.220 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $25.324.720 · saldo ant. $13.785.720 → $24.989.720 |
| 14 | CDC 607 | Vencida | Pendiente | **Pendiente** | en mora (2026-08, 23 d) | pendiente | $331.800 | FAC-2026-09-0204 `js7bagwc3de1pd0x2p0jmrwd198e0dbg` | feb: saldo ant. $0 → −$29.900; abr: saldo ant. $0 → −$200; may: saldo ant. $0 → −$200; jun: saldo ant. $0 → −$200; ago: total $0 → −$3.200 · vencida → **saldo a favor** · saldo ant. $0 → −$345.200; sep: saldo ant. $342.000 → −$3.200 |
| 15 | CDC 608 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $8.182.000 | FAC-2026-09-0046 `js7cbpgzm34vzfk4xvt7arz4gn8e0fwv` | abr: saldo ant. $930.000 → $6.097.000 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); may: saldo ant. $1.290.000 → $6.457.000 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); jun: saldo ant. $1.650.000 → $6.817.000 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); ago: total $0 → $7.847.000 · saldo ant. $5.167.000 → $7.512.000 |
| 16 | CDC 613 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $25.598.278 | FAC-2026-09-0047 `js77v5p0pxynb4hgf3m6mb84c58e13he` | abr: saldo ant. $0 → $23.277.778 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); may: saldo ant. $0 → $23.637.778 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); jun: saldo ant. $0 → $23.997.778 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $25.263.278 · saldo ant. $13.786.978 → $24.928.278 |
| 17 | CDC 711 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $11.554.600 | FAC-2026-09-0088 `js7d3qgcy68fqprskdjn85wm8h8e10jb` | abr: saldo ant. $0 → $9.469.600 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); may: saldo ant. $360.000 → $9.829.600 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); jun: saldo ant. $720.000 → $10.189.600 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); ago: total $0 → $11.219.600 · saldo ant. $3.551.600 → $10.884.600 |
| 18 | CDC 813 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $25.812.120 | FAC-2026-09-0049 `js7e82c1hmpy6p3c523y416k7x8e12nb` | abr: saldo ant. $0 → $23.484.620 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); may: saldo ant. $0 → $23.844.620 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); jun: saldo ant. $0 → $24.204.620 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $25.470.120 · saldo ant. $13.999.120 → $25.135.120 |
| 19 | CDC 904 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $9.558.250 | FAC-2026-09-0184 `js771fqakk8s99n00d7db0nx398e1wjw` | abr: saldo ant. $0 → $7.394.750 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); may: saldo ant. $0 → $7.754.750 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); jun: saldo ant. $0 → $8.114.750 · en revisión (pagina_de_continuacion, periodo_no_leido, sin_lineas); ago: total $0 → $9.223.250 · saldo ant. $4.248.700 → $8.888.250 |
| 20 | CDC 907 | Vencida | En revisión | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $11.609.050 | FAC-2026-09-0196 `js784mr3hqv9hcpc6tm84p242n8e15gn` | abr: saldo ant. $0 → $9.377.050 · en revisión (lineas_no_cuadran, pagina_de_continuacion, periodo_no_leido, saldo_anterior_no_cuadra); may: saldo ant. $46.000 → $9.737.050 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); jun: saldo ant. $406.000 → $10.097.050 · en revisión (lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra); ago: total $0 → $11.218.050 · saldo ant. $3.764.000 → $10.792.050 |
| 21 | CDC 910 | Vencida | Vencida | **Vencida** | en mora (2026-08, 23 d) | en mora (2026-08, 23 d) | $1.028.000 | FAC-2026-09-0057 `js752tjbz4vje3bej0h43f1xss8e19py` | ene: saldo ant. $0 → −$148.400; abr: saldo ant. $0 → −$271.000; ago: saldo ant. $349.000 → $309.000; sep: saldo ant. $712.000 → $672.000 |

### R2. Casos de la Fase 1 §9.5

716, 611 y 701: estados históricos erróneos. 904 y 907: deuda oculta en el historial. "Qué cambia" es el escenario C (B + las páginas de continuación históricas confirmadas): los estados históricos solo se corrigen cuando la administración confirma esas lecturas.

| # | Unidad | Residente hoy → B → C | Cartera hoy → C | Qué cambia (C) |
|---|---|---|---|---|
| 1 | CDC 716 | Pendiente → Pendiente → Pendiente | pendiente → pendiente | mar: total $0 → −$1.040.000 · pagada → **saldo a favor** · saldo ant. $0 → −$1.350.000; abr: total $0 → −$720.000 · pagada → **saldo a favor** · saldo ant. $0 → −$1.080.000; may: total $0 → −$400.000 · saldo ant. $0 → −$760.000; ago: saldo ant. $413.500 → $293.500 |
| 2 | CDC 611 | Al día → Al día → Al día | al dia → al dia | ene: total $0 → −$1.700.700 · pagada → **saldo a favor** · saldo ant. $0 → −$2.010.700; feb: total $0 → −$1.430.700 · pagada → **saldo a favor** · saldo ant. $0 → −$1.740.700; mar: total $0 → −$1.155.100 · pagada → **saldo a favor** · saldo ant. $0 → −$1.470.700; abr: total $0 → −$835.100 · pagada → **saldo a favor** · saldo ant. $0 → −$1.195.100; may: total $0 → −$835.100 · vencida → **saldo a favor** · saldo ant. $0 → −$1.195.100; ago: total $0 → −$117.100 · pagada → **saldo a favor** · saldo ant. $335.000 → −$515.100; sep: total $0 → −$150.100 · pendiente → **saldo a favor** · saldo ant. $0 → −$597.100 |
| 3 | CDC 701 | Pendiente → Pendiente → Pendiente | pendiente → pendiente | ene: saldo ant. $0 → −$5.800; mar: abonada → **pagada** · saldo ant. $0 → −$270.000; abr: vencida → **pagada** · saldo ant. $5.600 → −$264.400; may: saldo ant. $184.000 → −$86.000 |
| 4 | CDC 904 | Vencida → Vencida → Vencida | en mora (2026-08, 23 d) → en mora (2026-08, 23 d) | mar: pagada → **vencida**; abr: pagada → **vencida** · saldo ant. $0 → $7.394.750; may: pagada → **vencida** · saldo ant. $0 → $7.754.750; jun: abonada → **vencida** · saldo ant. $0 → $8.114.750; ago: total $0 → $9.223.250 · saldo ant. $4.248.700 → $8.888.250 |
| 5 | CDC 907 | Vencida → Vencida → Vencida | en mora (2026-08, 23 d) → en mora (2026-08, 23 d) | mar: pagada → **vencida**; abr: abonada → **vencida** · saldo ant. $0 → $9.377.050; may: abonada → **vencida** · saldo ant. $46.000 → $9.737.050; jun: abonada → **vencida** · saldo ant. $406.000 → $10.097.050; ago: total $0 → $11.218.050 · saldo ant. $3.764.000 → $10.792.050 |

### R3. Las 13 "Al día" de la Fase 1 (vigente en $0)

Cada cero, contra el documento. Las dos de prueba (CDC 999, Arboleda 9999) se listan aparte (R6).

| # | Unidad | Vigente | Total guardado | El documento dice | Clasificación | Re-procesado (B) |
|---|---|---|---|---|---|---|
| 1 | Arboleda T-II 902 | FAC-2026-09-0105 `js7316tymssvwcdq9zr7fj0br98egkzw` | $0 | −$376.000 | saldo a favor leído como 0 (−$376.000) | Al día · saldo a favor |
| 2 | Arboleda T-II 302 | FAC-2026-09-0100 `js76ecqge1qm1andv8t578djgh8egmy4` | $0 | −$53.176 | saldo a favor leído como 0 (−$53.176) | Al día · saldo a favor |
| 3 | Arboleda T-III 702 | FAC-2026-09-0085 `js74ggbcym5pp94tzxyb9hahzh8egyvy` | $0 | −$942.000 | saldo a favor leído como 0 (−$942.000) | Al día · saldo a favor |
| 4 | Arboleda T-I 901 | FAC-2026-09-0068 `js73bg1a31tms8kp8by3q69j6s8eh9jd` | $0 | −$1.162.248 | saldo a favor leído como 0 (−$1.162.248) | Al día · saldo a favor |
| 5 | Arboleda T-III 303 | FAC-2026-09-0051 `js75sdjvhsn3d0ee2c4rb85n1x8eg2w4` | $0 | $0 | cero real (el documento dice $0) | Al día · pendiente |
| 6 | Arboleda T-II 604 | FAC-2026-09-0001 `js7b3qc0k3sy8mzbc5s7ccarcs8eg3rz` | $0 | −$13.000 | saldo a favor leído como 0 (−$13.000) | Al día · saldo a favor |
| 7 | CDC 901 | FAC-2026-09-0197 `js7a1xj80g4wencs7eestzt55h8e06ar` | $0 | −$2.500 | saldo a favor leído como 0 (−$2.500) | Al día · saldo a favor |
| 8 | CDC 611 | FAC-2026-09-0121 `js73js4mmybjtfhe937kdwyqe18e18yy` | $0 | −$150.100 | saldo a favor leído como 0 (−$150.100) | Al día · saldo a favor |
| 9 | CDC 818 | FAC-2026-09-0033 `js7cbr02zqq0v7pg6nhgeb980s8e06zc` | $0 | −$27.000 | saldo a favor leído como 0 (−$27.000) | Al día · saldo a favor |
| 10 | CDC 816 | FAC-2026-09-0021 `js7am68c1k1xkta3tqdxp73hzn8e1k4f` | $0 | −$105.000 | saldo a favor leído como 0 (−$105.000) | Al día · saldo a favor |
| 11 | CDC 815 | FAC-2026-09-0020 `js7ee7rn7vn6eb922vnzdqpyrd8e10rr` | $0 | −$105.350 | saldo a favor leído como 0 (−$105.350) | Al día · saldo a favor |

### R4. Arboleda, septiembre de 2026

- Facturas: 172. Etiqueta de período corregida: 172 (todas pasan de `Arboleda Campestre Aptos"` a `01-septiembre-2026`).

### R4.1 Las que quedaron `pendiente` con saldo a favor

| # | Unidad | Factura | Total guardado | El documento dice | Estado: hoy → re-procesado | Residente: hoy → B |
|---|---|---|---|---|---|---|
| 1 | Arboleda T-II 902 | FAC-2026-09-0105 `js7316tymssvwcdq9zr7fj0br98egkzw` | $0 | −$376.000 | pendiente → **saldo a favor** | Al día → Al día |
| 2 | Arboleda T-II 302 | FAC-2026-09-0100 `js76ecqge1qm1andv8t578djgh8egmy4` | $0 | −$53.176 | pendiente → **saldo a favor** | Al día → Al día |
| 3 | Arboleda T-III 702 | FAC-2026-09-0085 `js74ggbcym5pp94tzxyb9hahzh8egyvy` | $0 | −$942.000 | pendiente → **saldo a favor** | Al día → Al día |
| 4 | Arboleda T-I 901 | FAC-2026-09-0068 `js73bg1a31tms8kp8by3q69j6s8eh9jd` | $0 | −$1.162.248 | pendiente → **saldo a favor** | Al día → Al día |
| 5 | Arboleda T-II 604 | FAC-2026-09-0001 `js7b3qc0k3sy8mzbc5s7ccarcs8eg3rz` | $0 | −$13.000 | pendiente → **saldo a favor** | Al día → Al día |

### R5. Otras unidades cuyo estado cambia (escenario B)

| # | Unidad | Residente: hoy → B | Cartera: hoy → B | Saldo vigente: hoy → B | Qué cambia (B) |
|---|---|---|---|---|---|
| 1 | CDC 802 | Pendiente → **Al día** | pendiente → al dia | $342.000 → $0 | feb: saldo ant. $0 → −$235.000; abr: saldo ant. $0 → −$234.400; may: saldo ant. $0 → −$214.400; jun: saldo ant. $0 → −$124.400; ago: saldo ant. $0 → −$136.400; sep: total $342.000 → −$103.400 · pendiente → **saldo a favor** · saldo ant. $0 → −$103.400 |

### R5.1 Cambios de estado de facturas, por escenario (sin unidades de prueba)

| Cambio | A | B | C |
|---|---|---|---|
| Arboleda: pagada → saldo a favor | 11 | 11 | 11 |
| Arboleda: pendiente → saldo a favor | 5 | 5 | 5 |
| CDC: abonada → pagada | 1 | 1 | 1 |
| CDC: abonada → vencida | 0 | 0 | 18 |
| CDC: pagada → abonada | 2 | 2 | 10 |
| CDC: pagada → saldo a favor | 33 | 33 | 33 |
| CDC: pagada → vencida | 0 | 0 | 28 |
| CDC: pendiente → saldo a favor | 6 | 6 | 6 |
| CDC: vencida → abonada | 0 | 4 | 4 |
| CDC: vencida → pagada | 1 | 1 | 1 |
| CDC: vencida → saldo a favor | 4 | 4 | 4 |

### R6. Unidades de prueba (no cuentan en las cifras para la administración)

| # | Unidad | Facturas | Residente: hoy → A | Qué cambia (A) |
|---|---|---|---|---|
| 1 | CDC 999 | 1 | Al día → Al día | — |
| 2 | Arboleda 9999 | 2 | Al día → Al día | — |

### R7. Por factura: cambian el total, el estado o quedan en revisión (escenario B, 129)

Las demás facturas que cambian lo hacen solo en líneas o en el saldo anterior, sin cambiar total ni estado (resumen en §11.2).

| # | Conjunto | Unidad | Factura | Período | Total: hoy → B | Estado: hoy → B | Saldo anterior: hoy → B | Marca |
|---|---|---|---|---|---|---|---|---|
| 1 | Arboleda | T-I 104 | FAC-2026-07-0067 `js70w0byzwvv4bfmwzk1vyyd0d8bwfe2` | 2026-07 | $0 → **−$243.363** | pagada → **saldo a favor** | $0 | — |
| 2 | Arboleda | T-I 104 | FAC-2026-08-0067 `js773kqd4mqwy3pcrcw95e14gn8cc4dd` | 2026-08 | $0 → **−$69.363** | pagada → **saldo a favor** | $0 | — |
| 3 | Arboleda | T-I 202 | FAC-2026-03-0061 `js7571nhnckvctqnvdewkzs2gs8avyg3` | 2026-03 | $0 → **−$40.096** | pagada → **saldo a favor** | $0 | — |
| 4 | Arboleda | T-I 901 | FAC-2026-03-0065 `js7fghzemj3cymcpbv6s915n558at3wb` | 2026-03 | $0 → **−$421.248** | pagada → **saldo a favor** | $0 | — |
| 5 | Arboleda | T-I 901 | FAC-2026-04-0066 `js715r290k507f4yjpvfd88csn8at0gt` | 2026-04 | $0 → **−$13.248** | pagada → **saldo a favor** | $0 | — |
| 6 | Arboleda | T-I 901 | FAC-2026-07-0068 `js7d55508qjadmrep3nas04ggd8bx0fa` | 2026-07 | $0 → **−$74.248** | pagada → **saldo a favor** | $0 | — |
| 7 | Arboleda | T-I 901 | FAC-2026-08-0068 `js7eb4v2k6xycy585gebj5ka198cde8t` | 2026-08 | $0 → **−$1.468.248** | pagada → **saldo a favor** | $0 | — |
| 8 | Arboleda | T-I 901 | FAC-2026-09-0068 `js73bg1a31tms8kp8by3q69j6s8eh9jd` | 2026-09 | $0 → **−$1.162.248** | pendiente → **saldo a favor** | $0 | — |
| 9 | Arboleda | T-II 302 | FAC-2026-09-0100 `js76ecqge1qm1andv8t578djgh8egmy4` | 2026-09 | $0 → **−$53.176** | pendiente → **saldo a favor** | $0 | — |
| 10 | Arboleda | T-II 604 | FAC-2026-08-0001 `js7brswthg3t24rcfeh8fhxexh8cc3x9` | 2026-08 | $0 → **−$5.000** | pagada → **saldo a favor** | $0 | — |
| 11 | Arboleda | T-II 604 | FAC-2026-09-0001 `js7b3qc0k3sy8mzbc5s7ccarcs8eg3rz` | 2026-09 | $0 → **−$13.000** | pendiente → **saldo a favor** | $0 | — |
| 12 | Arboleda | T-II 902 | FAC-2026-08-0105 `js7f03g6edfs3q8pt0fzg69pex8cc08q` | 2026-08 | $0 → **−$282.000** | pagada → **saldo a favor** | $0 | — |
| 13 | Arboleda | T-II 902 | FAC-2026-09-0105 `js7316tymssvwcdq9zr7fj0br98egkzw` | 2026-09 | $0 → **−$376.000** | pendiente → **saldo a favor** | $0 | — |
| 14 | Arboleda | T-III 604 | FAC-2026-03-0169 `js79s28vv4fcf74znp7g9p3xmh8atmvj` | 2026-03 | $0 → **−$373.000** | pagada → **saldo a favor** | $0 | — |
| 15 | Arboleda | T-III 604 | FAC-2026-04-0105 `js745eaf6esy935zc40p6xd4z18at5k8` | 2026-04 | $0 → **−$249.000** | vencida | $0 | — |
| 16 | Arboleda | T-III 702 | FAC-2026-08-0085 `js7ajhyvmayy04tgbbct5x0awn8cc7sx` | 2026-08 | $0 → **−$1.256.000** | pagada → **saldo a favor** | $0 | — |
| 17 | Arboleda | T-III 702 | FAC-2026-09-0085 `js74ggbcym5pp94tzxyb9hahzh8egyvy` | 2026-09 | $0 → **−$942.000** | pendiente → **saldo a favor** | $0 | — |
| 18 | CDC | 103 | FAC-2026-08-0003 `js77m6sy337vte9y1xdc33vf018cw61f` | 2026-08 | $0 → **−$21.000** | pagada → **saldo a favor** | $0 → −$21.000 | — |
| 19 | CDC | 111 | FAC-2026-04-0011 `js773crj6t7n9m1pnspqtre8td8avjkv` | 2026-04 | $15.206.150 | abonada | $1.911.300 → $14.840.550 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 20 | CDC | 111 | FAC-2026-05-0010 `js78fye9q4rh0xq1bbhbny4sx18avtj0` | 2026-05 | $15.271.150 | pagada | $2.276.900 → $14.911.150 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 21 | CDC | 111 | FAC-2026-06-0011 `js78yhjdxq1d4ax36dvkeqq6p98ataby` | 2026-06 | $15.364.150 | abonada | $0 → $14.976.150 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 22 | CDC | 111 | FAC-2026-08-0011 `js76pf5zcz82p5bs41bmvv05zn8cw2mb` | 2026-08 | $0 → **$15.530.150** | vencida → **abonada** | $3.278.000 → $15.118.150 | — |
| 23 | CDC | 112 | FAC-2026-04-0012 `js72wg5jbgrnyatmwfcsqsre7h8avx1a` | 2026-04 | $15.154.100 | abonada | $1.689.400 → $14.733.300 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 24 | CDC | 112 | FAC-2026-05-0011 `js7bw774kwe7fpc8p70m07286x8atzv5` | 2026-05 | $15.214.100 | pagada | $2.110.200 → $14.854.100 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 25 | CDC | 112 | FAC-2026-06-0012 `js7bk05dq753c3y6jnwryt3db98at8b3` | 2026-06 | $15.583.100 | abonada | $0 → $15.214.100 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 26 | CDC | 112 | FAC-2026-08-0012 `js7c3cj5e0jv8asrbqkeapxcfn8cw4nr` | 2026-08 | $0 → **$16.286.100** | vencida → **abonada** | $3.325.550 → $15.930.100 | — |
| 27 | CDC | 211 | FAC-2026-04-0024 `js753nm326jat5eazy5n6kv13d8atx6a` | 2026-04 | $4.567.200 | pagada | $0 → $4.186.600 | en revisión: lineas_no_cuadran, pagina_de_continuacion, periodo_no_leido, saldo_anterior_no_cuadra |
| 28 | CDC | 211 | FAC-2026-05-0023 `js722pxm2a3hevp4y366464cnn8atrny` | 2026-05 | $3.969.200 | pagada | $0 → $3.567.200 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 29 | CDC | 211 | FAC-2026-06-0024 `js7635de3r21wamc8wvybqn77x8av8nc` | 2026-06 | $4.432.200 | vencida | $0 → $3.969.200 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 30 | CDC | 211 | FAC-2026-08-0024 `js7d7bhgprbt5fefjbfccfvdv58cwtev` | 2026-08 | $0 → **$5.298.200** | vencida | $4.549.200 → $4.884.200 | — |
| 31 | CDC | 220 | FAC-2026-04-0033 `js711t2v616gpyrkytsagqskf58av997` | 2026-04 | $6.202.900 | pagada | $334.000 → $5.828.900 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 32 | CDC | 220 | FAC-2026-05-0032 `js7f42c4e4gep3ykp18ga9kv3d8av00d` | 2026-05 | $4.811.900 | pagada | $0 → $4.451.900 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 33 | CDC | 220 | FAC-2026-06-0033 `js74eazhyghnehw6mqt8tag34x8avyf0` | 2026-06 | $4.916.900 | abonada | $0 → $4.556.900 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 34 | CDC | 220 | FAC-2026-08-0033 `js78pjdk3fjxy2k2zt00e6c3mx8cx747` | 2026-08 | $0 → **$5.226.900** | vencida → **abonada** | $4.891.900 | — |
| 35 | CDC | 313 | FAC-2026-05-0051 `js7awmhqbn70av00c5j28zh93d8avqwe` | 2026-05 | $405.500 | pagada → **abonada** | $45.500 | — |
| 36 | CDC | 314 | FAC-2026-02-0198 `js7fmysr6jad3fy0dsp02fdej58avzdq` | 2026-02 | $0 → **−$23.500** | pagada → **saldo a favor** | $0 → −$339.100 | — |
| 37 | CDC | 314 | FAC-2026-03-0175 `js742m7vesq4eg69bw63ba9pex8av5ts` | 2026-03 | $0 → **−$47.900** | pagada → **saldo a favor** | $0 → −$363.500 | — |
| 38 | CDC | 314 | FAC-2026-04-0195 `js7bgwetczz8ane2pk8jtc9v818atgrp` | 2026-04 | $0 → **−$27.900** | pagada → **saldo a favor** | $0 → −$387.900 | — |
| 39 | CDC | 314 | FAC-2026-05-0196 `js7bd013xyq8h0rzx9e9ycabbx8avgfn` | 2026-05 | $0 → **−$7.900** | pagada → **saldo a favor** | $0 → −$367.900 | — |
| 40 | CDC | 401 | FAC-2026-01-0201 `js749asebms3928rtsc6wwmf3h8at6y5` | 2026-01 | $0 → **−$206.000** | pagada → **saldo a favor** | $0 → −$516.000 | — |
| 41 | CDC | 401 | FAC-2026-04-0196 `js78tkd2gkpbfm61nk8segye1h8athgc` | 2026-04 | $0 → **−$173.000** | pagada → **saldo a favor** | $0 → −$540.000 | — |
| 42 | CDC | 401 | FAC-2026-05-0197 `js77ja38ep73wbg1h0nfn6c5an8aty89` | 2026-05 | $0 → **−$486.000** | pagada → **saldo a favor** | $0 → −$867.000 | — |
| 43 | CDC | 401 | FAC-2026-08-0064 `js798nmpx0mt8j585renv5hewh8cwxys` | 2026-08 | $0 → **−$262.000** | vencida → **saldo a favor** | $0 → −$597.000 | — |
| 44 | CDC | 402 | FAC-2026-04-0064 `js7006km35d91vghez4kypepx58at27r` | 2026-04 | $8.762.010 | pagada | $0 → $8.144.410 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 45 | CDC | 402 | FAC-2026-05-0063 `js73cspyd8tygbsd114qm1vbnn8ata5q` | 2026-05 | $9.206.010 | pagada | $0 → $8.769.010 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 46 | CDC | 402 | FAC-2026-06-0064 `js7a7p3sjxzpzt73btyqnzc6118ath84` | 2026-06 | $9.435.010 | abonada | $0 → $9.026.010 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 47 | CDC | 402 | FAC-2026-08-0065 `js7a8c9sbdbnzewjh85ms8bmas8cxeqs` | 2026-08 | $0 → **$10.133.010** | vencida | $4.620.000 → $9.784.010 | — |
| 48 | CDC | 404 | FAC-2026-06-0066 `js7dvvv0dareafrkb0s3fwbh7h8avfa7` | 2026-06 | $2.976.100 | vencida | $0 → $2.616.100 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 49 | CDC | 404 | FAC-2026-08-0067 `js7amgn37fz25dy74d5zrkcksd8cwztd` | 2026-08 | $0 → **$3.646.100** | vencida | $3.311.100 | — |
| 50 | CDC | 405 | FAC-2026-05-0066 `js79x2c28zt3hm4dkgbgmw44598atd8d` | 2026-05 | $2.914.800 | pagada | $0 → $2.554.800 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 51 | CDC | 405 | FAC-2026-06-0067 `js77ppx9e7pvm7a8spykh56esd8avk1b` | 2026-06 | $3.274.800 | vencida | $0 → $2.914.800 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 52 | CDC | 405 | FAC-2026-08-0068 `js75vmspeh702057dh1b8g6b4h8cwrzx` | 2026-08 | $0 → **$3.944.800** | vencida | $3.609.800 | — |
| 53 | CDC | 410 | FAC-2026-08-0073 `js75dzje49hda6w5j8fzpwc5bx8cx7mk` | 2026-08 | $0 → **−$97.330** | vencida → **saldo a favor** | $0 → −$446.330 | — |
| 54 | CDC | 501 | FAC-2026-04-0083 `js7ajsrr0g2a9re694rj313jk58av1nc` | 2026-04 | $23.629.120 | pagada | $0 → $23.269.120 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 55 | CDC | 501 | FAC-2026-05-0082 `js7744nqhnrvsab5faeakn0ta98avrvk` | 2026-05 | $23.989.120 | pagada | $0 → $23.629.120 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 56 | CDC | 501 | FAC-2026-06-0083 `js7b4ahvjmamfk3ha1xh42kwed8avz16` | 2026-06 | $24.584.620 | abonada | $0 → $23.989.120 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 57 | CDC | 501 | FAC-2026-08-0083 `js7794s0p7bw3fyx49q6w5bwen8cw4nt` | 2026-08 | $0 → **$25.254.620** | vencida | $13.783.620 → $24.919.620 | — |
| 58 | CDC | 502 | FAC-2026-04-0084 `js7bc6hmwghxqwnzqtnf5k83298avd0p` | 2026-04 | $19.055.230 | pagada | $0 → $18.695.230 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 59 | CDC | 502 | FAC-2026-05-0083 `js71rfvj5bkgr7mxyej2q3yapd8atn01` | 2026-05 | $19.415.230 | pagada | $0 → $19.055.230 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 60 | CDC | 502 | FAC-2026-06-0084 `js7dmgqmgbs6k7xegzffbj2gk98at9x4` | 2026-06 | $20.010.730 | pagada | $0 → $19.415.230 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 61 | CDC | 503 | FAC-2026-02-0199 `js7c9q709pxaeaz37zkn9w2n5d8at1x8` | 2026-02 | $0 → **−$1.040.000** | pagada → **saldo a favor** | $0 → −$1.350.000 | — |
| 62 | CDC | 503 | FAC-2026-03-0182 `js7d2778mq1se62kn569azh1s98at4vt` | 2026-03 | $0 → **−$770.000** | pagada → **saldo a favor** | $0 → −$1.080.000 | — |
| 63 | CDC | 503 | FAC-2026-04-0197 `js7b3crnd6tb8t2jw32stk1nv98av0gw` | 2026-04 | $0 → **−$450.000** | pagada → **saldo a favor** | $0 → −$810.000 | — |
| 64 | CDC | 503 | FAC-2026-05-0198 `js717vbdfe392zet9tpdqj7e598avv62` | 2026-05 | $0 → **−$130.000** | pagada → **saldo a favor** | $0 → −$490.000 | — |
| 65 | CDC | 504 | FAC-2026-04-0085 `js78dn6yz00npmxbx0t43atgys8avebg` | 2026-04 | $23.714.520 | pagada | $0 → $23.354.520 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 66 | CDC | 504 | FAC-2026-05-0084 `js7a8p06prp1ck8dw9vat2fbq58avsyp` | 2026-05 | $24.074.520 | pagada | $0 → $23.714.520 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 67 | CDC | 504 | FAC-2026-06-0086 `js72pvdysgkxxnm09rb7yc2yxx8avfjd` | 2026-06 | $24.434.520 | abonada | $0 → $24.074.520 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 68 | CDC | 504 | FAC-2026-08-0085 `js75h85jg1ebteka32cm60n3v18cwpjg` | 2026-08 | $0 → **$24.769.520** | vencida → **abonada** | $13.785.720 → $24.434.520 | — |
| 69 | CDC | 508 | FAC-2026-04-0089 `js74rx7ra69106bd6agrgrnnvd8atqrd` | 2026-04 | $23.699.220 | pagada | $0 → $23.339.220 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 70 | CDC | 508 | FAC-2026-05-0088 `js75b484spjc6we6zaq8tj1xj98av0pt` | 2026-05 | $24.059.220 | pagada | $0 → $23.699.220 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 71 | CDC | 508 | FAC-2026-06-0090 `js70a4cmpz2dk7ztbh32dwf4ed8av248` | 2026-06 | $24.654.720 | abonada | $0 → $24.059.220 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 72 | CDC | 508 | FAC-2026-08-0089 `js7fwc7hvqhxhewfq8r7z8qp2n8cw6ev` | 2026-08 | $0 → **$25.324.720** | vencida | $13.785.720 → $24.989.720 | — |
| 73 | CDC | 607 | FAC-2026-08-0108 `js72s65624jx68vzgxwcataw198cxagw` | 2026-08 | $0 → **−$3.200** | vencida → **saldo a favor** | $0 → −$345.200 | — |
| 74 | CDC | 608 | FAC-2026-04-0109 `js77f9acehr1re1wmtkh8001nh8avjsf` | 2026-04 | $6.457.000 | abonada | $930.000 → $6.097.000 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 75 | CDC | 608 | FAC-2026-05-0108 `js76w13jk4enerq51s67c71x8n8av1xn` | 2026-05 | $6.817.000 | abonada | $1.290.000 → $6.457.000 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 76 | CDC | 608 | FAC-2026-06-0110 `js758bwa9mx4vd0mpg4xgska4h8at4t1` | 2026-06 | $7.177.000 | abonada | $1.650.000 → $6.817.000 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 77 | CDC | 608 | FAC-2026-08-0109 `js7ckvjjp0d22be8x88bdb89n58cxyg7` | 2026-08 | $0 → **$7.847.000** | vencida | $5.167.000 → $7.512.000 | — |
| 78 | CDC | 611 | FAC-2026-01-0200 `js70ee8arhs2wrp10ws2vv564n8avkw4` | 2026-01 | $0 → **−$1.700.700** | pagada → **saldo a favor** | $0 → −$2.010.700 | — |
| 79 | CDC | 611 | FAC-2026-02-0200 `js76b92bv4jnz5ge1vn6fkbpq98av4m4` | 2026-02 | $0 → **−$1.430.700** | pagada → **saldo a favor** | $0 → −$1.740.700 | — |
| 80 | CDC | 611 | FAC-2026-03-0188 `js750ra7dn6zb91hhcc2egchyh8avvdm` | 2026-03 | $0 → **−$1.155.100** | pagada → **saldo a favor** | $0 → −$1.470.700 | — |
| 81 | CDC | 611 | FAC-2026-04-0198 `js73s3psk45tye8b3d748875v18av9dg` | 2026-04 | $0 → **−$835.100** | pagada → **saldo a favor** | $0 → −$1.195.100 | — |
| 82 | CDC | 611 | FAC-2026-05-0199 `js7ccfs553vwb5j3nsw23j2wdd8av7kz` | 2026-05 | $0 → **−$835.100** | vencida → **saldo a favor** | $0 → −$1.195.100 | — |
| 83 | CDC | 611 | FAC-2026-08-0112 `js78vhzz2003nrzcrmj4c4pby98cwv1f` | 2026-08 | $0 → **−$117.100** | pagada → **saldo a favor** | $335.000 → −$515.100 | — |
| 84 | CDC | 611 | FAC-2026-09-0121 `js73js4mmybjtfhe937kdwyqe18e18yy` | 2026-09 | $0 → **−$150.100** | pendiente → **saldo a favor** | $0 → −$597.100 | — |
| 85 | CDC | 613 | FAC-2026-04-0113 `js77v2ha1t7dtbfh46kms0wrj18att2h` | 2026-04 | $23.637.778 | pagada | $0 → $23.277.778 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 86 | CDC | 613 | FAC-2026-05-0112 `js7ey31s3ensnje9ppaaazjq898at36z` | 2026-05 | $23.997.778 | pagada | $0 → $23.637.778 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 87 | CDC | 613 | FAC-2026-06-0114 `js78gvyr2pqmygbkva5nj8gv3x8av49x` | 2026-06 | $24.593.278 | abonada | $0 → $23.997.778 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 88 | CDC | 613 | FAC-2026-08-0114 `js7410ngw56zsg6hyzw9ncvyxh8cxnbk` | 2026-08 | $0 → **$25.263.278** | vencida | $13.786.978 → $24.928.278 | — |
| 89 | CDC | 615 | FAC-2026-04-0199 `js7cb7zm1jae95kwrhm4w2rjah8avepq` | 2026-04 | $0 → **−$155.000** | pagada → **saldo a favor** | $0 → −$515.000 | — |
| 90 | CDC | 625 | FAC-2026-02-0201 `js7773feq0kbja82brazpz06n18ata8y` | 2026-02 | $0 → **−$8.900** | pagada → **saldo a favor** | $0 → −$425.300 | — |
| 91 | CDC | 625 | FAC-2026-03-0191 `js7505mccj3y035kefftrtmxd58avjsy` | 2026-03 | $0 → **−$13.700** | pagada → **saldo a favor** | $0 → −$418.900 | — |
| 92 | CDC | 701 | FAC-2026-03-0192 `js70ghnhmt014cgmj0xscfe7258avn2c` | 2026-03 | $45.600 | abonada → **pagada** | $0 → −$270.000 | — |
| 93 | CDC | 701 | FAC-2026-04-0202 `js7atjkvcdbeqerkkbw9am0dad8av76v` | 2026-04 | $95.600 | vencida → **pagada** | $5.600 → −$264.400 | — |
| 94 | CDC | 711 | FAC-2026-04-0133 `js7dpnacbgmkv5ag1nste1zcds8av327` | 2026-04 | $9.829.600 | abonada | $0 → $9.469.600 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 95 | CDC | 711 | FAC-2026-05-0135 `js7b0gj2tz2hf1fjkcavjqpwxx8avm9d` | 2026-05 | $10.189.600 | abonada | $360.000 → $9.829.600 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 96 | CDC | 711 | FAC-2026-06-0138 `js779nmnsy0rs6yfpskd68njm18attcx` | 2026-06 | $10.549.600 | abonada | $720.000 → $10.189.600 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 97 | CDC | 711 | FAC-2026-08-0137 `js71y1gzjk8wtxta5akdr299vs8cxxfg` | 2026-08 | $0 → **$11.219.600** | vencida | $3.551.600 → $10.884.600 | — |
| 98 | CDC | 716 | FAC-2026-03-0194 `js7b3b73h34php358zbx0kypr18avtkt` | 2026-03 | $0 → **−$1.040.000** | pagada → **saldo a favor** | $0 → −$1.350.000 | — |
| 99 | CDC | 716 | FAC-2026-04-0203 `js79rk0fj78b7xqz5xpx6vef4x8avcx5` | 2026-04 | $0 → **−$720.000** | pagada → **saldo a favor** | $0 → −$1.080.000 | — |
| 100 | CDC | 716 | FAC-2026-05-0201 `js7cc4yt1c6a9x8dbehwfx7n8h8atgzx` | 2026-05 | $0 → **−$400.000** | vencida | $0 → −$760.000 | — |
| 101 | CDC | 717 | FAC-2026-08-0143 `js702k20bckmq3rqph8ws0fx698cx0zb` | 2026-08 | $456.950 | pagada → **abonada** | $121.950 | — |
| 102 | CDC | 802 | FAC-2026-09-0048 `js7emmx2036pr957y87xz07apn8e1xmm` | 2026-09 | $342.000 → **−$103.400** | pendiente → **saldo a favor** | $0 → −$103.400 | — |
| 103 | CDC | 813 | FAC-2026-04-0160 `js7fev6wvswmpkdd2x7m6n2r818atmac` | 2026-04 | $23.844.620 | pagada | $0 → $23.484.620 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 104 | CDC | 813 | FAC-2026-05-0162 `js750v3t3bzjzdsdtb2kp2cm2s8avj11` | 2026-05 | $24.204.620 | pagada | $0 → $23.844.620 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 105 | CDC | 813 | FAC-2026-06-0164 `js795sa006q0zj2qa1rgz7ascx8av8k6` | 2026-06 | $24.800.120 | abonada | $0 → $24.204.620 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 106 | CDC | 813 | FAC-2026-08-0165 `js7ctv9b0xftg6qtemv05qe5ah8cwb0s` | 2026-08 | $0 → **$25.470.120** | vencida | $13.999.120 → $25.135.120 | — |
| 107 | CDC | 815 | FAC-2026-09-0020 `js7ee7rn7vn6eb922vnzdqpyrd8e10rr` | 2026-09 | $0 → **−$105.350** | pendiente → **saldo a favor** | $0 → −$105.350 | — |
| 108 | CDC | 816 | FAC-2026-09-0021 `js7am68c1k1xkta3tqdxp73hzn8e1k4f` | 2026-09 | $0 → **−$105.000** | pendiente → **saldo a favor** | $0 → −$105.000 | — |
| 109 | CDC | 818 | FAC-2026-02-0202 `js7bbs7mendm4ag4qbdkmpkfmn8avtvm` | 2026-02 | $0 → **−$104.700** | pagada → **saldo a favor** | $0 → −$423.100 | — |
| 110 | CDC | 818 | FAC-2026-03-0197 `js7ec1qys2a54zd92ac2hkj4s98atk9j` | 2026-03 | $0 → **−$90.700** | pagada → **saldo a favor** | $0 → −$414.700 | — |
| 111 | CDC | 818 | FAC-2026-04-0204 `js70dbqrq1zchdsf6sxqqasrdx8avvt1` | 2026-04 | $0 → **−$40.700** | pagada → **saldo a favor** | $0 → −$400.700 | — |
| 112 | CDC | 818 | FAC-2026-09-0033 `js7cbr02zqq0v7pg6nhgeb980s8e06zc` | 2026-09 | $0 → **−$27.000** | pendiente → **saldo a favor** | $0 → −$27.000 | — |
| 113 | CDC | 901 | FAC-2026-02-0203 `js7b1h0tt1j64pq7mfy3t36tkn8av9fd` | 2026-02 | $0 → **−$113.500** | pagada → **saldo a favor** | $0 → −$434.700 | — |
| 114 | CDC | 901 | FAC-2026-03-0199 `js7eva3xyg8d47h54f8cb3q6k98avmnt` | 2026-03 | $0 → **−$138.500** | pagada → **saldo a favor** | $0 → −$448.500 | — |
| 115 | CDC | 901 | FAC-2026-04-0205 `js7ebjcz98n2p3jah634d1s6p58avp3d` | 2026-04 | $0 → **−$113.500** | pagada → **saldo a favor** | $0 → −$473.500 | — |
| 116 | CDC | 901 | FAC-2026-08-0178 `js7dgvwx6vqeym275hzhn02n0x8cwcf7` | 2026-08 | $0 → **−$2.500** | pagada → **saldo a favor** | $0 → −$337.500 | — |
| 117 | CDC | 901 | FAC-2026-09-0197 `js7a1xj80g4wencs7eestzt55h8e06ar` | 2026-09 | $0 → **−$2.500** | pendiente → **saldo a favor** | $0 → −$337.500 | — |
| 118 | CDC | 904 | FAC-2026-04-0174 `js713q5jvcm8v496r9wzdxtwch8avbtq` | 2026-04 | $7.754.750 | pagada | $0 → $7.394.750 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 119 | CDC | 904 | FAC-2026-05-0176 `js72mvys4x9b3d9j6bp89gfatx8av22p` | 2026-05 | $8.114.750 | pagada | $0 → $7.754.750 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 120 | CDC | 904 | FAC-2026-06-0179 `js7160z5e9czn9tq7f2nrccman8at5et` | 2026-06 | $8.474.750 | abonada | $0 → $8.114.750 | en revisión: pagina_de_continuacion, periodo_no_leido, sin_lineas |
| 121 | CDC | 904 | FAC-2026-08-0181 `js70gcy9w44981qms00fesrk518cxqkd` | 2026-08 | $0 → **$9.223.250** | vencida | $4.248.700 → $8.888.250 | — |
| 122 | CDC | 907 | FAC-2026-04-0177 `js72c3895b9x4ex1qr4a2spgex8avq1w` | 2026-04 | $9.737.050 | abonada | $0 → $9.377.050 | en revisión: lineas_no_cuadran, pagina_de_continuacion, periodo_no_leido, saldo_anterior_no_cuadra |
| 123 | CDC | 907 | FAC-2026-05-0179 `js7bvb1tz59mga7pmehqybm6k98atja1` | 2026-05 | $10.097.050 | abonada | $46.000 → $9.737.050 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 124 | CDC | 907 | FAC-2026-06-0182 `js7btg382q5151s9xvgv2d03th8atwmp` | 2026-06 | $10.457.050 | abonada | $406.000 → $10.097.050 | en revisión: lineas_no_cuadran, pagina_de_continuacion, saldo_anterior_no_cuadra |
| 125 | CDC | 907 | FAC-2026-08-0184 `js78bbxavwk298wk9x5pqmh7s98cw1tg` | 2026-08 | $0 → **$11.218.050** | vencida | $3.764.000 → $10.792.050 | — |
| 126 | CDC | 909 | FAC-2026-01-0202 `js73dwrk5jjgh93xcnsq2k4hcs8av8xg` | 2026-01 | $0 → **−$280.200** | pagada → **saldo a favor** | $0 → −$595.500 | — |
| 127 | CDC | 909 | FAC-2026-02-0204 `js73cwr4crmrm5s17cj6xephzd8atcnj` | 2026-02 | $0 → **−$360.200** | pagada → **saldo a favor** | $0 → −$670.200 | — |
| 128 | CDC | 909 | FAC-2026-03-0203 `js72cb90cpsxjqa37y919dj8ss8av5h5` | 2026-03 | $0 → **−$90.200** | pagada → **saldo a favor** | $0 → −$400.200 | — |
| 129 | CDC | 911 | FAC-2026-01-0199 `js731dt8pz3cnzks7h94dsxwzx8ath2g` | 2026-01 | $0 → **−$200.000** | pagada → **saldo a favor** | $0 → −$510.000 | — |
