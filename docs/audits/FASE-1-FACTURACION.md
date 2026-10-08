# Fase 1 — Contención inmediata de facturación

> **Fecha:** 2026-10-08 · **Base:** `0025351` (red de seguridad de la Fase 0) · **Estado:** cambios en el *working tree*, **sin commit**.
> Referencias: [`AUDITORIA_FACTURACION.md`](AUDITORIA_FACTURACION.md) (hallazgos F-xx y secciones §) y [`FASE-0-FACTURACION.md`](FASE-0-FACTURACION.md) (pruebas #1–#91).

---

## 1. Resumen ejecutivo

### Qué se corrigió

1. **Una sola definición de "factura vigente"** para toda la aplicación: `facturaVigente` en `packages/backend/convex/lib/cartera.ts`. Es la factura del **período más reciente** de la unidad. No depende del orden de carga, de `_creationTime`, del id ni del orden de los PDF. La usan el backend de pagos, el bot, el agente, la campana, la web y el móvil.
2. **`armarDatosTrn` solo acepta la vigente, y solo si deja saldo** (`motivoNoPagable`). Una factura histórica `pendiente`, `vencida` o `abonada` ya no puede abrir una transacción, venga de la web, del móvil, del bot o de cualquier llamador de la acción. El rechazo tiene un mensaje claro y estable.
3. **Web, móvil, bot y agente dejan de ofrecer facturas históricas.** "Pagar" aparece solo en la vigente. El bot elige por período y, si la vigente está pagada o con saldo a favor, responde "estás al día" sin retroceder a una anterior.
4. **El estado del residente sale de la misma regla que la cartera de la administración** (`resumenResidente` → `carteraDeUnidad`): "Al día", "Pendiente" o "Vencida" en el inicio y en "Mis facturas". `navBadges` cuenta la mora actual. La campana deja de anunciar "Por pagar" en las facturas históricas.
5. **`carteraDeUnidad` deja de marcar mora a quien pagó.** Una factura posterior con pago cubre la mora de las que absorbe (hallazgo D-1 de la Fase 0). Sin saldo no hay mora. El resultado no depende del orden de las facturas.
6. **`/api/facturas/upload` exige sesión (401) y el rol de administración o contadora en el conjunto (403).** Usa el mecanismo existente, `@/lib/auth-server`, igual que `/api/incidentes/reporte`.

### Qué NO se corrigió (queda para fases siguientes, a propósito)

F-02 (la conciliación pisa la evidencia de pago), F-04 y F-15 (parsers), F-05 (pagos externos), F-06 (fecha del descuento), el resto de F-07 (período tomado del documento, S3 después de confirmar, llaves versionadas), F-08, F-09, F-10, F-11, F-12 (aprobación de comprobantes), F-13, F-16 y F-20. **No se modificó ningún dato de producción.**

### Resultado

| | Resultado |
|---|---|
| Pruebas de la Fase 1 | **18 de 18** pasaron de ❌ a ✅ |
| Controles de la Fase 0 | **33 de 33** siguen ✅ |
| Pruebas de las Fases 2, 3 y 4 | **40 de 40** siguen ❌, sin cambios (ninguna se puso verde por accidente) |
| Suites generales | Todas verdes. Se agregaron 44 pruebas: 19 unitarias, 13 de convex-test, 6 web y 6 móvil |
| Verificación manual (solo lectura) | 182 casas veían "Vencida"; con la regla nueva son **83**. Las **62** de la auditoría quedan "Pendiente" (57) o "Al día" (5) |
| `AVAL_AMBIENTE` | **`qa`** en el deployment con los datos reales. No es `prod`: hay discrepancia (§9.6) |

---

## 2. Cambios por componente

| Componente | Archivo | Cambio |
|---|---|---|
| **Regla (backend, compartida)** | `packages/backend/convex/lib/cartera.ts` | Nuevas `facturaVigente`, `motivoNoPagable`, `MENSAJE_NO_PAGABLE` y `resumenResidente`. Corrección de la mora en `carteraDeUnidad` |
| | `packages/backend/package.json` | Exporta `@vekino/backend/cartera`, con el mismo patrón que `periodos` o `costoReserva`, para que web y móvil usen la misma función y no una copia |
| **Pagos** | `packages/backend/convex/pagos.ts` | `armarDatosTrn` rechaza lo que no sea la vigente con saldo. Nueva query `puedePagar` (sí/no): corre esa misma validación sin crear nada |
| **Bot y agente** | `packages/backend/convex/soportesPago.ts` | `facturaVigenteDeUnidad` elige por período (`facturaVigente`), no por orden de creación, y no retrocede si la vigente está pagada |
| | `packages/backend/convex/whatsapp.ts` | "Estado de cuenta": con la vigente saldada responde "estás al día". Un botón "Pagar" viejo del chat recibe un mensaje claro: "ya no está vigente, su saldo quedó en tu factura más reciente" |
| | `packages/backend/convex/whatsappAgente.ts` | `generar_link_pago` no genera enlace si la vigente está pagada, con saldo a favor o en $0 |
| **Portal y campana** | `packages/backend/convex/portal.ts` | `navBadges.facturasVencidas` = unidades en mora según `carteraDeUnidad` (antes: toda `vencida` del historial) |
| | `packages/backend/convex/notificacionesFeed.ts` | "Por pagar" solo en la vigente pagable. La histórica dice "Su saldo pasó a la factura siguiente" |
| **Web** | `apps/web/app/mi/[id]/cuenta/page.tsx` | Estado, botones "Pagar" y tarjeta "Factura pendiente" desde `resumenResidente`. Se borraron `esPendientePago`/`facturasPagables` y `tieneVencidas` |
| | `apps/web/app/mi/[id]/page.tsx` | Tarjeta de deuda (roja solo con mora actual), "Estás al día" y saldo a favor de la vigente, desde `resumenResidente` |
| | `apps/web/components/portal/portal-pay-button.tsx` | Traduce los nuevos rechazos del backend a texto para el residente |
| **Móvil** | `apps/mobile/src/lib/resumen-facturas.ts` *(nuevo)* | Traduce `resumenResidente` a la tarjeta de facturas, sin regla propia |
| | `apps/mobile/src/app/(app)/(tabs)/facturas.tsx` | Tarjeta resumen desde `tarjetaFacturas`. En el detalle, "Pagar" y "Ya pagué" solo si `pagos.puedePagar` responde que sí |
| | `apps/mobile/src/app/(app)/(tabs)/index.tsx` | Tarjeta de facturas del inicio desde `tarjetaFacturas` |
| **Seguridad de la subida** | `apps/web/app/api/facturas/upload/route.ts` | Sin sesión → 401 antes de leer el formulario. Con sesión, sin rol → 403. Si no se puede validar → 500 (no deja pasar) |
| | `packages/backend/convex/facturas.ts` | Nueva query `permisoSubida({ condominioLegacyId })`: mismos roles que `bulkUpsert`. Responde el motivo en vez de lanzar (§10, nota sobre mensajes) |
| **Pruebas** | `packages/backend/pruebas/facturaVigente.prueba.ts` *(nuevo)* | 19 pruebas de la regla, entre ellas la independencia del orden con todas las permutaciones |
| | `packages/backend/pruebas/facturacion/contencion.test.ts` *(nuevo)* | 13 pruebas (convex-test): `puedePagar`, `permisoSubida`, campana. Corren en la suite normal (`vitest run`) |
| | `apps/web/pruebas/subidaFacturas.test.mjs` *(nuevo)* | 6 pruebas de 401/403/500 de la subida. Proceso aparte (ver nota) |
| | `apps/mobile/pruebas/resumenFacturas.prueba.ts` *(nuevo)* | 6 pruebas de la tarjeta móvil con los casos reales de la Fase 0 |
| | `apps/web/package.json` | `test:facturacion` corre primero `subidaFacturas.test.mjs` y después la carpeta de la Fase 0 |

**Nota.** `bun test` comparte los dobles de módulos (`mock.module`) entre los archivos de un mismo proceso. La nueva prueba simula `@/lib/auth-server` de otra forma que `parserFacturas.test.mjs`, así que corre en su propio proceso, antes de la carpeta de la Fase 0. **Los archivos de la Fase 0 no se tocaron.**

---

## 3. Nueva definición de factura vigente

```
facturaVigente(cadena)             → la única factura del período más reciente de la unidad, o null
motivoNoPagable(cadena, factura)   → null (se puede pagar) | "pagada" | "historica" | "vigente_ambigua" | "sin_saldo"
resumenResidente(facturas, ahora)  → { estado, unidades: [{ cartera, vigente, pagable }], pagables }
```

**Dónde vive:** `packages/backend/convex/lib/cartera.ts`, junto a `carteraDeUnidad`. Es una función pura y sin dependencias. La web y el móvil la importan como `@vekino/backend/cartera`: la ejecutan, no la copian.

**Regla:**

- La vigente es la factura del período **más reciente** de la cadena de la unidad. Solo se compara `periodo`. Con todas las permutaciones de la entrada sale lo mismo (`facturaVigente.prueba.ts`).
  - Julio cargado después de septiembre no se vuelve vigente.
  - Septiembre cargado antes que julio sigue siendo la vigente.
- Una histórica no es vigente, esté `vencida`, `abonada` o `pendiente`.
- El estado no la decide. Si la vigente está pagada, la casa está al día y **no se retrocede** a una anterior sin pagar.
- **Dos facturas del período más reciente** (no debería pasar: es una por unidad y período, F-11): elegir una sería volver a depender del orden de carga. `facturaVigente` devuelve `null`, nada se ofrece para pagar y el residente ve "Tu factura está en revisión". **Hoy no hay ningún caso en producción** (verificado sobre las 379 unidades).

**Se puede pagar** (`motivoNoPagable === null`) solo la vigente, sin pagar (`pendiente`, `vencida` o `abonada`) y con total mayor que 0. Los mensajes de rechazo (`MENSAJE_NO_PAGABLE`) son estables, para que el bot y la web los reconozcan:

| Motivo | Mensaje |
|---|---|
| `pagada` | Esta factura ya está pagada. *(el mismo de antes: lo protege el control #32)* |
| `historica` | Esta factura ya no está vigente: su saldo quedó incluido en la factura más reciente de la unidad. |
| `vigente_ambigua` | Esta factura no se puede pagar en línea: la unidad tiene más de una factura del mismo período. Comunícate con la administración. |
| `sin_saldo` | Esta factura no tiene saldo por pagar. |

**Quién la usa:**

```
                       lib/cartera.ts  (facturaVigente · motivoNoPagable · carteraDeUnidad · resumenResidente)
                                │
   ┌───────────────┬────────────┼───────────────┬─────────────────┬───────────────────┐
   │               │            │               │                 │                   │
armarDatosTrn   puedePagar   facturaVigente   navBadges       campana (feed)    web y móvil
(web, móvil,    (detalle     DeUnidad         carteraPor      "Por pagar" solo  (resumenResidente:
 bot: rechaza)   del móvil)  (bot, agente)    Unidad (admin)   en la vigente)    estado y "Pagar")
```

---

## 4. Cambios de flujo

### Facturas históricas → no pagables · vigente → única pagable

Caso de la auditoría (R-1, Arboleda T-II 1004): agosto **$366.113 `vencida`**; septiembre **$656.804** = $366.113 de agosto + $290.691 del mes.

| | Antes | Ahora |
|---|---|---|
| **Septiembre `pendiente`** · agosto | Se ofrecía en el móvil (cualquier factura sin pagar) y el backend lo aceptaba | **No pagable** en ninguna superficie. El backend responde "ya no está vigente" |
| **Septiembre `pendiente`** · septiembre | Pagable | **Única pagable**: $656.804 |
| **Septiembre `pagada`** · agosto | "Pagar $366.113" en la web, el móvil y el bot; el backend lo aceptaba → **doble cobro** | **No pagable** (rechazo "ya no está vigente") |
| **Septiembre `pagada`** · septiembre | Rechazada ("ya está pagada") | Rechazada ("ya está pagada") |
| **Septiembre `pagada`** · estado | "Vencida · $366.113 · 1 factura por pagar" | **"Al día"** |

### Por superficie

| Superficie | Antes | Ahora |
|---|---|---|
| Backend (`armarDatosTrn`) | Rechazaba solo `pagada` | Rechaza todo lo que no sea la vigente con saldo, sin importar el estado |
| Web · "Mis facturas" | Una "pagable" por unidad: la más reciente **sin pagar** (con la vigente pagada, una vieja). Estado "Vencida" si había alguna `vencida` en el historial | "Pagar" solo en la vigente pagable. Estado de la cartera |
| Web · inicio | Tarjeta roja con cualquier `vencida` del historial; "Total pendiente" con la anterior | Roja solo con mora actual. "Estás al día" si la vigente está saldada |
| Móvil · resumen | Contaba y **sumaba** todas las `pendiente` (F-18); no veía la mora | `tarjetaFacturas`: la vigente de cada unidad; "Tienes un saldo vencido" con mora actual |
| Móvil · detalle | "Pagar" en cualquier `pendiente/vencida/abonada` (incluso históricas) | "Pagar" y "Ya pagué" solo si `pagos.puedePagar` (la validación del backend) responde que sí |
| Bot · "Estado de cuenta" | La primera sin pagar entre las 12 **creadas** más recientemente | La vigente por período. Si está saldada, "✅ Estás al día" |
| Bot · botón "Pagar" viejo | "No pude generar el enlace… intenta más tarde" | "Esa factura ya no está vigente: su saldo quedó incluido en tu factura más reciente…" |
| Agente IA | Pagaba la que diera `facturaVigenteDeUnidad` (podía ser vieja) | La vigente. Si está saldada, `{ yaPagada }` o `{ alDia }` y no genera enlace |
| Campana | "Por pagar · $X" en toda factura no pagada | "Por pagar" solo en la vigente pagable. Las históricas: "Su saldo pasó a la factura siguiente" |

---

## 5. Cartera y estado del residente

### Cómo se eliminó la falsa mora histórica

**Antes:** la web calculaba `tieneVencidas = facturas.some(f => f.estado === "vencida")` sobre **todo** el historial. Bastaba un abril `vencida`, ya absorbido y saldado por las facturas siguientes, para pintar "Vencida". Y al revés: una vigente que venció sin pagarse sigue `pendiente` en la base (ninguna factura posterior la ha juzgado), así que se veía "Pendiente" estando en mora (D-2).

**Ahora:** el estado sale de `carteraDeUnidad`, la misma regla de la administración, aplicada a cada unidad:

| Estado de cartera | Se muestra | Significado |
|---|---|---|
| `al_dia` / `sin_facturas` | **Al día** | La vigente está saldada (pagada, saldo a favor o $0) y no hay mora |
| `pendiente` | **Pendiente** | La vigente tiene saldo y no hay mora actual |
| `en_mora` | **Vencida** | El último período ya vencido no está cubierto y queda saldo |

Con varias unidades se muestra la que peor esté.

### Corrección de `carteraDeUnidad`

La mora la sigue decidiendo el **último período ya vencido**. Dos cambios:

1. **Lo cubre también una factura posterior con pago.** Esa factura (`pagada`, `abonada` o `saldo_a_favor`) absorbió el saldo. Agosto `vencida` + septiembre `pagada` = casa al día. Antes quedaba `en_mora` con saldo $0 hasta que venciera septiembre (D-1, #27).
2. **Sin saldo no hay mora.** Una vigente en $0 (por ejemplo, un saldo a favor que el parser leyó como 0, F-15) ya no deja a nadie "en mora" con $0.

Si hubiera dos facturas del último período, se reporta la que más debe, no la última cargada. Así el resultado no depende del orden. El código dice que es contención sobre los estados que pone la conciliación y que **la Fase 3 la reemplaza por el modelo de obligaciones y pagos**.

**Efecto sobre la cartera de la administración, con los datos reales del 8 de octubre:** cambian **2 unidades**, ambas `en_mora` con saldo $0 que pasan a `al_dia` (CDC 999 y Arboleda 9999: su vigente es de marzo y abril, en $0). Desde el 16 de octubre, cuando venza septiembre, serían **13**, esas 2 incluidas. Son las 13 con la vigente en $0 (grupos A y C de §9.2). Ninguna casa con saldo deja de verse en mora.

### `navBadges` y campana

- `navBadges.facturasVencidas` = unidades del residente en mora según `carteraDeUnidad`. La casa del PQRS pasa de 2 a **0** (#48); una casa con la vigente vencida sin pagar, de 0 a **1** (#49). La barra lateral web sigue sin pintar ese número (`portal-sidebar.tsx`): se corrigió el dato, no la decisión de mostrarlo.
- La campana usa `motivoNoPagable` por factura.

---

## 6. Pruebas

### Las 18 pruebas de la Fase 1

Resultado exacto, por test, de `bun run test:facturacion` en backend y web, cruzado contra la tabla de la Fase 0.

| # | Prueba | Archivo | Antes | Después |
|---|---|---|---|---|
| 24 | `F01-factura-historica-doble-pago (Caso C)` — tras cargar septiembre, el residente no puede iniciar otro pago de agosto (web ni WhatsApp) | `pagos.regresion.ts` | ❌ | ✅ |
| 26 | `F01-factura-historica-doble-pago (Caso B)` — cuando la vigente queda pagada, la absorbida no vuelve a ser pagable | `pagos.regresion.ts` | ❌ | ✅ |
| 27 | `F03-cartera-mora-tras-pago (Caso B)` — la cartera de la administración debe ver la casa al día después de pagar septiembre | `pagos.regresion.ts` | ❌ | ✅ |
| 28 | `F01-armarDatosTrn-no-vigente` — agosto (vencida) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts` | ❌ | ✅ |
| 29 | `F01-armarDatosTrn-no-vigente` — agosto (abonada) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts` | ❌ | ✅ |
| 30 | `F01-armarDatosTrn-no-vigente` — agosto (pendiente) quedó absorbido por septiembre: no basta con que no esté 'pagada' | `pagos.regresion.ts` | ❌ | ✅ |
| 48 | `F03-navBadges-historial` — el contador de vencidas no cuenta abril y junio, ya saldadas | `residente.regresion.ts` | ❌ | ✅ |
| 49 | `F03-navBadges-mora-actual` — si la factura vigente ya venció, el contador sí la cuenta | `residente.regresion.ts` | ❌ | ✅ |
| 51 | `F01-bot-ofrece-absorbida` — si la vigente ya está pagada, el bot no ofrece pagar la absorbida | `residente.regresion.ts` | ❌ | ✅ |
| 52 | `F12-bot-elige-por-orden-de-carga` — el bot elige la factura por período, no por la última que se subió | `residente.regresion.ts` | ❌ | ✅ |
| 77 | `F07-subida-sin-sesion` — sin sesión, /api/facturas/upload rechaza la petición y no escribe en S3 | `parserFacturas.test.mjs` | ❌ | ✅ |
| 80 | `F03-historial-como-mora` — la casa del PQRS (abril y junio vencidas pero ya saldadas, septiembre aún no vence) se ve 'Pendiente', no 'Vencida' | `resumenResidente.test.mjs` | ❌ | ✅ |
| 83 | `F03-mora-actual-oculta` — el 20 de octubre septiembre ya venció sin pagarse: la casa está en mora y debe verse 'Vencida' | `resumenResidente.test.mjs` | ❌ | ✅ |
| 84 | `F03-historial-como-mora (Caso B)` — con septiembre pagada, la casa se ve 'Al día' aunque agosto haya quedado vencida | `resumenResidente.test.mjs` | ❌ | ✅ |
| 85 | `F01-web-ofrece-absorbida (Casos B y C)` — con septiembre pagada, 'Mis facturas' no ofrece pagar agosto ($366.113 que ya iban en septiembre) | `resumenResidente.test.mjs` | ❌ | ✅ |
| 87 | `F03-historial-como-mora (inicio)` — la casa del PQRS no se pinta en rojo de 'vencida': solo debe septiembre, que aún no vence | `resumenResidente.test.mjs` | ❌ | ✅ |
| 89 | `F03-mora-actual-oculta (inicio)` — el 20 de octubre, con septiembre vencida sin pagar, la tarjeta sí debe estar en rojo | `resumenResidente.test.mjs` | ❌ | ✅ |
| 90 | `F01-inicio-ofrece-absorbida (Caso B)` — con septiembre pagada, el inicio dice 'Estás al día', no 'Total pendiente: $366.113' | `resumenResidente.test.mjs` | ❌ | ✅ |

**18 de 18 en verde.** Ninguna aserción se debilitó y no se modificó ningún archivo de la Fase 0 (`git diff` sobre `pruebas/facturacion/*.regresion.ts`, `escenario.ts`, `parserFacturas.test.mjs` y `resumenResidente.test.mjs`: vacío). No hizo falta cambiar ninguna expectativa: el criterio de la auditoría y de la Fase 0 se sostuvo.

### Pruebas nuevas (suites normales, todas verdes)

| Archivo | Pruebas | Qué fija |
|---|---|---|
| `packages/backend/pruebas/facturaVigente.prueba.ts` | 19 | Vigente por período en todas las permutaciones; históricas no pagables en cualquier estado; vigente pagada sin retroceso; empate → nada pagable; mora cubierta por una posterior; mora actual de la vigente; sin saldo no hay mora; cartera independiente del orden; resumen del residente igual a la cartera; varias unidades sin sumar historial |
| `packages/backend/pruebas/facturacion/contencion.test.ts` | 13 | `pagos.puedePagar` (vigente sí; absorbida, pagada, otra casa y sin sesión: no); `facturas.permisoSubida` (admin sí; residente, guarda, otro conjunto, sin sesión y conjunto inexistente: no, distinguiendo `sin_sesion` de `sin_permiso`); campana |
| `apps/web/pruebas/subidaFacturas.test.mjs` | 6 | Subida: sin sesión 401 sin consultar permisos; sin rol 403; persona no reconocida 401; token rechazado 401; fallo al validar 500; con permiso, el comportamiento de siempre. Ninguno de los rechazos escribe en S3 |
| `apps/mobile/pruebas/resumenFacturas.prueba.ts` | 6 | Tarjeta móvil: casa del PQRS, vigente pagada, mora el 20 de octubre, dos `pendiente` sin sumar (F-18), dos casas, sin facturas |

---

## 7. Controles

### Los 33 controles de la Fase 0

| # | Prueba | Archivo | Antes | Después |
|---|---|---|---|---|
| 1 | `F02-control` — un pago aprobado sin factura siguiente deja la factura 'pagada' | `estados.regresion.ts` | ✅ | ✅ |
| 6 | `F02-control` — un 'pagada' INFERIDO (sin evidencia) sí se corrige si se vuelve a subir el PDF siguiente corregido | `estados.regresion.ts` | ✅ | ✅ |
| 7 | `F11-control` — subir el lote A dos veces ('solo nuevas') no duplica ni cambia estados | `importacion.regresion.ts` | ✅ | ✅ |
| 8 | `F11-control` — re-subir agosto y septiembre con 'actualizar' no duplica y conserva lo que dedujo la conciliación | `importacion.regresion.ts` | ✅ | ✅ |
| 9 | `F11-control` — volver a subir agosto (con 'actualizar') no deshace un pago aprobado | `importacion.regresion.ts` | ✅ | ✅ |
| 15 | `F07-control` — si la etiqueta del documento ('Septiembre / 2026') coincide con el período, se guarda | `importacion.regresion.ts` | ✅ | ✅ |
| 16 | `F07-control` — si la etiqueta del documento ('01-septiembre-2026') coincide con el período, se guarda | `importacion.regresion.ts` | ✅ | ✅ |
| 18 | `F09-control` — con saldo anterior 0 en octubre, agosto no queda vencida ni abonada | `importacion.regresion.ts` | ✅ | ✅ |
| 20 | `F04-control` — con la lectura correcta (la de la fila Totales), la misma regla deja agosto en 'saldo_a_favor' | `importacion.regresion.ts` | ✅ | ✅ |
| 22 | `F02-control` — septiembre trae los $50.000: agosto queda abonada (no vencida) y el pago sigue aprobado y ligado | `pagos.regresion.ts` | ✅ | ✅ |
| 25 | `F01-control (Caso C)` — septiembre, la vigente, sí se puede pagar y por $350.000 | `pagos.regresion.ts` | ✅ | ✅ |
| 31 | `F01-control` — la vigente (septiembre) sí se acepta, por su total acumulado | `pagos.regresion.ts` | ✅ | ✅ |
| 32 | `F01-control` — una factura pagada se sigue rechazando | `pagos.regresion.ts` | ✅ | ✅ |
| 34 | `F06-control` — el 10 de septiembre (dentro del 1–15) se cobra con descuento: $340.000 | `pagos.regresion.ts` | ✅ | ✅ |
| 35 | `F06-control` — el 20 de octubre (después del vencimiento guardado) se cobra $380.000 | `pagos.regresion.ts` | ✅ | ✅ |
| 37 | `F20-control` — la dueña de la factura sí ve su pago | `pagos.regresion.ts` | ✅ | ✅ |
| 38 | `F08-control` — un reporte del carro es un cobro pendiente por la tarifa del carro | `parqueadero.regresion.ts` | ✅ | ✅ |
| 39 | `F08-control` — dos carros distintos de la misma casa en el mismo mes son dos cobros (la identidad es casa + vehículo + período) | `parqueadero.regresion.ts` | ✅ | ✅ |
| 43 | `F10-control` — un mes con $7.000 de aporte suma $7.000 | `parqueadero.regresion.ts` | ✅ | ✅ |
| 46 | `F03-control` — la carga reproduce los estados de producción: abril y junio 'vencida', mayo/julio/agosto 'pagada', septiembre 'pendiente' | `residente.regresion.ts` | ✅ | ✅ |
| 47 | `F03-control` — la cartera de la administración la ve 'pendiente', sin mora, debiendo solo septiembre ($289.000) | `residente.regresion.ts` | ✅ | ✅ |
| 50 | `F01-control` — con la vigente pendiente, el bot ofrece la vigente | `residente.regresion.ts` | ✅ | ✅ |
| 53 | `F16-control` — la propietaria ve sus dos facturas, una vez cada una | `residente.regresion.ts` | ✅ | ✅ |
| 56 | `F04-control` — cdc-control: total, descuento, saldo anterior (filas de marzo) y cargos del mes (filas de abril) coinciden con el documento | `parserFacturas.test.mjs` | ✅ | ✅ |
| 64 | `F04-control (Caso E)` — cdc-control.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ✅ | ✅ |
| 71 | `F04-control (Caso E)` — arboleda-control.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ✅ | ✅ |
| 73 | `F15-control` — arboleda-control: período '01-junio-2026' y total $15.760 | `parserFacturas.test.mjs` | ✅ | ✅ |
| 74 | `F15-control` — el saldo a favor de $376.000 se reconoce en saldoAFavor | `parserFacturas.test.mjs` | ✅ | ✅ |
| 81 | `F03-control` — septiembre sin pagar y sin vencer, sin historial vencido: 'Pendiente' | `resumenResidente.test.mjs` | ✅ | ✅ |
| 82 | `F03-control` — todo pagado: 'Al día' y ningún botón de pagar | `resumenResidente.test.mjs` | ✅ | ✅ |
| 86 | `F01-control` — con septiembre sin pagar, los únicos botones 'Pagar' son de septiembre (la vigente) | `resumenResidente.test.mjs` | ✅ | ✅ |
| 88 | `F03-control (inicio)` — septiembre sin pagar y sin vencer, sin historial vencido: tarjeta de pendiente, no roja | `resumenResidente.test.mjs` | ✅ | ✅ |
| 91 | `F03-control (inicio)` — todo pagado: 'Estás al día' | `resumenResidente.test.mjs` | ✅ | ✅ |

**33 de 33 siguen en verde.** En particular, los que pidió el PASO 14:

- la vigente se sigue pudiendo pagar, por su total acumulado (#25, #31);
- una factura pagada se sigue rechazando con "ya está pagada" (#32);
- el bot sigue ofreciendo la vigente (#50);
- sin historial vencido, "Pendiente" y "Al día" correctos (#81, #82, #88, #91);
- con la vigente pendiente, el único "Pagar" es el de la vigente (#86);
- la propietaria sigue viendo sus facturas (#53).

### Suites generales (antes = `0025351`, después = working tree)

| Suite | Comando | Antes | Después |
|---|---|---|---|
| Backend · facturación | `cd packages/backend && bun run test:facturacion` | 23 ✅ · 32 ❌ (55) | **33 ✅ · 22 ❌** (55); los 22 son de las Fases 2–4 |
| Backend · unitarias | `bun run test:unit` | 370 ✅ | **389 ✅** (+19 nuevas) |
| Backend · convex-test | `bun run test:seguridad` | 882 ✅ (39 archivos) | **895 ✅** (40 archivos, +13 nuevas) |
| Web · facturación | `cd apps/web && bun run test:facturacion` | 10 ✅ · 26 ❌ (36) | subida: **6 ✅**; Fase 0: **18 ✅ · 18 ❌** (36); los 18 son de la Fase 2 |
| Web · resto | `bun test pruebas/<archivo>` (8 archivos: errores crudos, navegación y operación de compañía, recordatorio de cierre, incidentes ×4) | 137 ✅ | **137 ✅** (sin cambios) |
| Móvil | `cd apps/mobile && bun run test` | 13 ✅ | **19 ✅** (+6 nuevas) |
| Tipos | `node ../../node_modules/typescript/bin/tsc --noEmit` | backend ✅ · web ✅ · móvil: 1 error | backend ✅ · web ✅ · móvil: **el mismo** error, que ya existía en HEAD (`packages/backend/convex/auth.ts(34,11)`) |

El *lint* no se corrió. `next lint` no existe en Next 16, y `expo lint` instala ESLint y modifica `package.json` y `bun.lock` como efecto secundario.

---

## 8. Pruebas que siguen fallando

**Ninguno de estos hallazgos está resuelto, ni parcialmente.** Todas fallaban antes y fallan igual después.

### Fase 2 — ingestión confiable (21)

| # | Prueba | Archivo | Antes | Después |
|---|---|---|---|---|
| 13 | `F07-periodo-contradice-documento` — un documento de 'Octubre / 2026' no queda guardado en silencio como 2026-09 | `importacion.regresion.ts` | ❌ | ❌ |
| 14 | `F07-periodo-contradice-documento` — un documento de '01-octubre-2026' no queda guardado en silencio como 2026-09 | `importacion.regresion.ts` | ❌ | ❌ |
| 19 | `F04-saldo-a-favor-leido-como-deuda` — con la lectura actual, agosto (a favor $262.000) no puede quedar 'vencida' | `importacion.regresion.ts` | ❌ | ❌ |
| 57 | `F04-cdc-total-negativo (Caso A)` — 'Pague sin descuento $-400.000' (anticipo) no se lee como $0 | `parserFacturas.test.mjs` | ❌ | ❌ |
| 58 | `F04-cdc-total-negativo (Caso A)` — agosto real de una casa con $262.000 a favor no se lee como $0 | `parserFacturas.test.mjs` | ❌ | ❌ |
| 59 | `F04-cdc-creditos (Caso B)` — la fila 'CI ANTICIPO DE CLIENTE' ($-760.000) no se ignora | `parserFacturas.test.mjs` | ❌ | ❌ |
| 60 | `F04-cdc-creditos (Caso B)` — la fila 'NCC NOTA CREDITO CLIENTE' ($-270.000) no se ignora: saldo anterior $-86.000, no $184.000 | `parserFacturas.test.mjs` | ❌ | ❌ |
| 61 | `F04-cdc-varias-filas (Caso C)` — con filas de abril, de mayo y un crédito, separa saldo anterior, cargos del mes y total | `parserFacturas.test.mjs` | ❌ | ❌ |
| 62 | `F04-saldo-anterior-fantasma` — septiembre vigente de una casa real: el saldo anterior es $-262.000 (a favor), no $+335.000 | `parserFacturas.test.mjs` | ❌ | ❌ |
| 63 | `F04-pdf-sin-lineas (Caso D)` — una página sin filas de conceptos no sale como factura válida sin advertencia | `parserFacturas.test.mjs` | ❌ | ❌ |
| 65 | `F04-cuadre (Caso E)` — cdc-anticipo-total-negativo.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ |
| 66 | `F04-cuadre (Caso E)` — cdc-nota-credito.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ |
| 67 | `F04-cuadre (Caso E)` — cdc-agosto-saldo-a-favor.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ |
| 68 | `F04-cuadre (Caso E)` — cdc-septiembre-saldo-anterior-negativo.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ |
| 69 | `F04-cuadre (Caso E)` — cdc-filas-incompletas.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ |
| 70 | `F04-cuadre (Caso E)` — cdc-pagina-sin-filas.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ |
| 72 | `F04-cuadre (Caso E)` — arboleda-saldo-a-favor.pdf: las líneas suman el total del documento, o la factura viene marcada | `parserFacturas.test.mjs` | ❌ | ❌ |
| 75 | `F15-arboleda-total-entre-parentesis` — 'TOTAL A PAGAR $(376,000)' se lee como $-376.000, no como $0 | `parserFacturas.test.mjs` | ❌ | ❌ |
| 76 | `F15-arboleda-periodo` — el período de septiembre es '01-septiembre-2026', no el texto de la línea siguiente | `parserFacturas.test.mjs` | ❌ | ❌ |
| 78 | `F07-s3-antes-de-confirmar` — leer un PDF para la vista previa no publica nada en S3 | `parserFacturas.test.mjs` | ❌ | ❌ |
| 79 | `F07-s3-sobrescribe` — dos lecturas del mismo período y la misma casa no reutilizan la misma llave de S3 | `parserFacturas.test.mjs` | ❌ | ❌ |

### Fase 3 — modelo de pagos y estados (11)

| # | Prueba | Archivo | Antes | Después |
|---|---|---|---|---|
| 2 | `F02-pagada-a-vencida` — agosto pagado por la pasarela no pasa a 'vencida' porque septiembre arrastre los $300.000 | `estados.regresion.ts` | ❌ | ❌ |
| 3 | `F02-pagada-a-abonada` — agosto pagado por la pasarela no pasa a 'abonada' porque septiembre arrastre $40.000 | `estados.regresion.ts` | ❌ | ❌ |
| 4 | `F12-comprobante-sobrescrito` — un comprobante aprobado por la administración tampoco se borra por inferencia | `estados.regresion.ts` | ❌ | ❌ |
| 5 | `F02-conciliar-boton` — el botón 'Conciliar' (facturas.reconciliar) tampoco degrada una factura pagada con evidencia | `estados.regresion.ts` | ❌ | ❌ |
| 10 | `F11-bulkFacturas-duplica` — la migración no crea una segunda factura de agosto para la casa 101 si ya la subió la web | `importacion.regresion.ts` | ❌ | ❌ |
| 11 | `F11-bulkFacturas-resetea-estado` — re-ejecutar la migración no devuelve a 'pendiente' una factura pagada | `importacion.regresion.ts` | ❌ | ❌ |
| 12 | `F11-upsertFactura-resetea-estado` — la importación por script (upsertFactura) no devuelve a 'pendiente' una factura pagada | `importacion.regresion.ts` | ❌ | ❌ |
| 17 | `F09-hueco-de-periodo` — agosto → [septiembre sin cargar] → octubre: el saldo de octubre no basta para juzgar agosto | `importacion.regresion.ts` | ❌ | ❌ |
| 21 | `F13-pago-parcial-marcado-pagada` — $250.000 aprobados sobre $300.000 dejan un saldo de $50.000: agosto no puede quedar 'pagada' | `pagos.regresion.ts` | ❌ | ❌ |
| 23 | `F02-conciliacion-sobrescribe-pago (Caso A)` — la contabilidad cortó antes de aplicar el abono y septiembre arrastra $300.000: agosto no puede quedar 'vencida' con $250.000 aprobados | `pagos.regresion.ts` | ❌ | ❌ |
| 33 | `F06-descuento-vencido` — el 8 de octubre (fecha del pago QA real) se cobra $380.000, no $340.000 | `pagos.regresion.ts` | ❌ | ❌ |

### Fase 4 — cobros operativos, reportes y lectura (8)

| # | Prueba | Archivo | Antes | Después |
|---|---|---|---|---|
| 36 | `F20-listPorFactura-sin-control` — el vecino de la 202 no puede listar los pagos de la factura de la 101 | `pagos.regresion.ts` | ❌ | ❌ |
| 40 | `F08-reportes-duplican-cobro` — tres reportes del mismo carro en septiembre son UN cobro de $7.000, no tres | `parqueadero.regresion.ts` | ❌ | ❌ |
| 41 | `F08-estados-paralelos` — marcarlo 'cobrada' en Vigilancia no lo deja 'pendiente' en Cobros de parqueadero | `parqueadero.regresion.ts` | ❌ | ❌ |
| 42 | `F08-refacturar` — un cargo ya facturado en octubre no se puede volver a facturar en noviembre | `parqueadero.regresion.ts` | ❌ | ❌ |
| 44 | `F10-aporte-suma-arrastre` — agosto y septiembre con $7.000 de aporte cada uno suman $14.000, no $21.000 | `parqueadero.regresion.ts` | ❌ | ❌ |
| 45 | `F10-aporte-concepto-equivocado` — el código 5 de Arboleda ('Parqueadero visitante') no es aporte voluntario | `parqueadero.regresion.ts` | ❌ | ❌ |
| 54 | `F16-listMia-duplica` — un vínculo repetido a la misma casa no repite las facturas | `residente.regresion.ts` | ❌ | ❌ |
| 55 | `F16-listMia-vigencia` — un arrendatario cuyo contrato venció ya no ve las facturas de la casa | `residente.regresion.ts` | ❌ | ❌ |

---

## 9. Verificación manual

### 9.1 Fuente y método

- **Datos:** exportación de **solo lectura** (`bunx convex data <tabla> --format jsonl`), tomada el 2026-10-08 a las 12:00 (Bogotá) del deployment configurado en `packages/backend`: 2.792 facturas, 379 unidades, 3 conjuntos, 1 PQRS, 2 pagos y 0 comprobantes. Se comprobó que es la **misma base** que responde con `--prod`: mismos conteos y misma huella de `_id`/`_creationTime`, calculada sin imprimir contenido. Queda solo en el scratchpad de la sesión.
- **Regla:** las funciones **reales** del repositorio (`lib/cartera.ts` del working tree), aplicadas a cada unidad con `ahora` = 2026-10-08 12:00. La lógica "de antes" es la de la web en HEAD (`tieneVencidas` sobre el historial).
- **No se modificó ningún dato** ni se ejecutó ninguna mutación.
- **Datos nuevos desde la auditoría:** un segundo pago QA `fallida` por $340.000, sobre la misma factura de CDC 409 (2026-10-08 15:03 UTC). Sigue habiendo 0 pagos aprobados y 0 comprobantes.

### 9.2 Las 62 unidades de la auditoría (y las demás que cambian)

| Grupo | Unidades | Hasta hoy (web) | Con la Fase 1 | Motivo |
|---|---|---|---|---|
| **A. Las 62 de la auditoría** (penúltima `pagada`, vigente sin vencer) | **62** (Arboleda 32, CDC 30) | "Vencida" | **"Pendiente" (57)** · **"Al día" (5)** | Las `vencida` son meses absorbidos y saldados después. Las 5 "Al día" (Arboleda 4, CDC 1) tienen la vigente en $0 |
| **B.** Penúltima `abonada` | 37 (Arboleda 24, CDC 13) | "Vencida" | "Pendiente" | Abonaron el último período vencido. Debe la vigente, sin mora (la misma regla de la administración) |
| **C.** Vigente en $0 | 8 (Arboleda 3, CDC 5) | "Pendiente" con "$0 por pagar" | "Al día" | Sin saldo vigente (posible F-15/F-04: saldo a favor leído como 0) |
| **Total que cambia** | **107** | | | **Solo cambia la presentación**: la cartera de la administración ya decía lo mismo para las 107 |

Distribución con la regla nueva (379 unidades): **83 "Vencida"** (antes 182), **283 "Pendiente"** (antes 197), **13 "Al día"** (antes 0). Ninguna unidad tiene hoy dos facturas del período vigente.

El doble cobro de F-01 era **latente**:

- En la web nunca se ofreció una histórica, porque todas las vigentes están sin pagar.
- En el móvil, abrir una factura vieja sí mostraba "Pagar". Pero los dos conjuntos tienen `avalPortalUrl`, y ese botón abre el portal del banco, no la API.
- La API la usan el bot y el agente, que ofrecían la vigente.

Lo habría activado el primer pago aprobado por la API, o el primer comprobante aprobado.

El listado completo, unidad por unidad (conjunto, unidad, estado mostrado, estado por cartera, factura vigente, período, saldo y motivo), está en el **Anexo A**, tablas A, B y C.

### 9.3 Las 83 que siguen en "Vencida"

En todas, **agosto quedó `vencida`** (venció el 15 de septiembre) y septiembre arrastra ese saldo sin pagar. La cartera de la administración también las ve `en_mora`: la Fase 1 no las cambia porque, según los documentos cargados, la mora existe.

| Grupo | Unidades | Qué revisar |
|---|---|---|
| **D. Lectura sospechosa del PDF** | **21**, todas de CDC | 19 tienen agosto con total ≤ $0 marcado `vencida` (saldo a favor leído como 0, F-04) y 2 tienen un septiembre cuyas líneas no cuadran con el total. Incluyen los casos de la auditoría §14.5: **CDC 607, 401, 410 y 503**. Es probable que la mora sea falsa. **Pendiente de la Fase 2** (parser y re-procesamiento) y de revisión con la administración |
| **E. Datos coherentes** | **62** (Arboleda 44, CDC 18) | Mora real según los PDF. Confirmar con la administración que no hubo pagos externos aplicados después del corte contable (F-05). Ejemplo: R-1, Arboleda **T-II 1004**, agosto $366.113 vencido (23 días), única pagable septiembre por $656.804 |

### 9.4 PQRS `m179ddw0y8fxcx71y8rrprhqy18c2fr8` (radicado PQRS-2026-0001)

- **Unidad:** Arboleda **T-I 1004**. **Estado del PQRS:** `abierto`, sin gestión desde el 2026-08-08. No se tocó.
- **Hasta hoy la web le mostraba** "Vencida", la tarjeta roja y abril y junio como deuda.
- **Con la Fase 1 ve** "**Pendiente**": debe solo septiembre, **$289.000**, que vence el 15 de octubre. El "Pagar" va únicamente a septiembre (`FAC-2026-09-0158`). Agosto, julio y mayo siguen `pagada`; abril y junio quedan en el historial como `vencida`, porque es lo que dijo el PDF siguiente en su momento, pero ya no pintan mora.
- **Para responderle** (lo hace la administración):

  > Revisamos su estado de cuenta. Está al día con todo lo facturado hasta agosto. La cuota de septiembre ($289.000) vence el 15 de octubre. Los meses de abril y junio aparecen en el historial como vencidos porque en su momento el saldo pasó a la cuenta siguiente, pero ya fueron cubiertos y no generan deuda ni mora. Corregimos la plataforma para que deje de mostrarlo como vencido.

  Antes de enviarlo, la administración debe confirmar con la contabilidad el arrastre de julio ($289.000) que el residente reclamó (auditoría §14.3).

### 9.5 Casos de CDC pendientes para la Fase 2

| Caso | Situación hoy | Qué hace falta |
|---|---|---|
| CDC **607, 401, 410, 503** (septiembre vigente con saldo anterior "fantasma", auditoría §14.5) | Siguen "Vencida": agosto `vencida` con total 0 (607, 401, 410) o con $30.000 (503) | Parser con signo y saldo anterior desde "Totales" (Fase 2); re-procesar agosto y septiembre; revisarlos con la administración |
| Las **19** de CDC con agosto en total ≤ 0 y `vencida` (grupo D) | Mora probablemente falsa | Lo mismo |
| CDC **716** y **611** (mayo con total negativo guardado como 0 y `vencida`), CDC **701** (abril: crédito leído como deuda) | Ya no pintan mora: con la Fase 1 pasan de "Vencida" a "Pendiente" (716, 701) y "Al día" (611), porque agosto quedó `pagada`. El estado histórico erróneo sigue en la base | Corregirlo en el re-procesamiento de la Fase 2 |
| CDC **904 y 907** (deuda oculta en el historial: meses `pagada` sin serlo, auditoría §14.4) | Siguen "Vencida", en mora con $9.558.250 y $11.609.050. El saldo vigente es correcto (lo trae el PDF); lo erróneo son estados históricos | Fase 2 (cuadre contra "Totales") |

### 9.6 `AVAL_AMBIENTE`

| | |
|---|---|
| **Cómo se verificó** | `bunx convex env get AVAL_AMBIENTE` (deployment configurado) y `bunx convex env get AVAL_AMBIENTE --prod`. La salida se clasificó (`prod` / `qa` / no definida) sin imprimir el valor crudo. **No se listó ninguna otra variable** y no se imprimió ningún secreto ni token |
| **Resultado** | **`qa`** en los dos, que son la misma base (§9.1) |
| **¿Correcto?** | **No, si ese deployment ya cobra de verdad.** Se esperaba `AVAL_AMBIENTE=prod`. Puede ser intencional si la pasarela sigue en certificación: los dos pagos existentes son `qa`, `fallida` |
| **Impacto con `qa`** | (1) `faltantesParaProduccion` no revisa nada, así que no hay barrera contra credenciales de ejemplo. (2) TLS relajado (`insecureTls`). (3) Los pagos quedan etiquetados `qa`, y las herramientas que separan prueba de producción por ese campo (`pagosPruebas.revertir*`, F-14) tratarían un pago real como de prueba. (4) El bot ("Pagar en línea") y el agente siempre usan la API: hoy generan transacciones en modo QA. A qué endpoint van depende de `AVAL_ENDPOINT`, que no se inspeccionó |
| **Qué se hizo** | **Nada.** Cambiar la configuración productiva requiere autorización explícita |
| **Recomendación** | Antes de abrir la pasarela por API, definir `AVAL_AMBIENTE=prod` junto con las credenciales del convenio. Con `prod`, `faltantesParaProduccion` bloquea cualquier envío si falta algo. Hasta entonces, decidir si el bot debe seguir ofreciendo "Pagar en línea" en ese deployment |

### 9.7 Móvil y web: qué se verificó y qué no

- **Automático:** la lógica de la tarjeta móvil (`resumenFacturas.prueba.ts`), el backend de "Pagar" del detalle (`puedePagar`, en convex-test) y las páginas **reales** de la web, montadas con happy-dom (Fase 0, #80–#91). Tipos sin errores nuevos.
- **No se pudo hacer a mano en un dispositivo ni en el navegador:** el inicio de sesión va contra el deployment real con usuarios reales, y esta fase no crea cuentas ni usa credenciales de residentes. **Queda pendiente** una prueba manual con una cuenta de QA del residente:
  1. casa del PQRS: "Pendiente", un solo "Pagar" (septiembre), campana sin "Por pagar" en abril y junio;
  2. abrir una factura histórica en el móvil: sin "Pagar" ni "Ya pagué";
  3. un botón "Pagar" viejo del bot: mensaje de "ya no está vigente";
  4. subir PDFs en Finanzas con administración (funciona) y con un residente (403).

### 9.8 Para coordinar con la administración

- [ ] Revisar los grupos A–C (107 unidades) y confirmar que "Pendiente" o "Al día" es lo correcto. No requieren cambiar datos.
- [ ] Revisar el grupo D (21 de CDC) contra los PDF y la contabilidad: candidatos a corrección en la Fase 2.
- [ ] Revisar el grupo E (62): confirmar que no hay pagos externos sin aplicar (F-05).
- [ ] Responder el PQRS `m179ddw0…` (texto sugerido en §9.4).
- [ ] Decidir `AVAL_AMBIENTE` (§9.6).

---

## 10. Riesgos pendientes

| Hallazgo | Riesgo que sigue abierto | Fase |
|---|---|---|
| **F-02** | La conciliación sigue pisando un `pagada` con evidencia (pago aprobado o comprobante) al cargar el PDF siguiente. La Fase 1 **reduce** el daño: la factura degradada ya es histórica, así que no se puede volver a pagar ni pinta mora si la siguiente tiene pago. Pero el estado guardado sigue siendo falso y la vigente siguiente incluye el monto otra vez | 3 |
| **F-04** | El parser de CDC lee mal negativos, créditos y saldos a favor. 21 unidades siguen "Vencida" probablemente por eso (§9.3), y el desglose muestra saldos "fantasma" | 2 |
| **F-06** | El descuento se cobra hasta el 15 del mes siguiente (`armarDatosTrn` no se tocó en eso) | 3 |
| **F-07** (resto) | Período elegido a mano; S3 se escribe al leer el PDF, antes de confirmar; llaves que se pisan. **Solo se cerró el acceso sin sesión** | 2 |
| **F-08** | Parqueadero: un cobro por reporte, dos estados paralelos, re-facturación | 4 |
| **F-11** | Migraciones y `upsertFactura` pueden duplicar o resetear estados. Si duplican el período vigente, la Fase 1 bloquea el pago de esa unidad ("en revisión") en vez de adivinar | 3 |
| **F-13** | Un pago parcial aprobado deja `pagada` | 3 |
| **F-15** | Parser de Arboleda: total entre paréntesis y período mal leído | 2 |
| **F-16** | `listMia` no deduplica ni filtra vínculos vencidos (no se tocó) | 4 |
| **F-20** | `listPorFactura` y `verificarPago` sin control de pertenencia | 4 |
| F-05, F-09, F-12, F-14, F-17, F-19, F-21 | Sin cambios. Comprobantes: `crearMio` todavía acepta una factura histórica, aunque el móvil ya no ofrece "Ya pagué" en ellas y el bot vincula a la vigente | 2–4 |

**Riesgos propios de esta entrega:**

1. **Orden de despliegue: primero Convex, después la web, después el móvil.**
   - La web nueva necesita `facturas.permisoSubida`. Contra un backend viejo, la subida responde 500 y no deja pasar, pero no sube.
   - El móvil nuevo necesita `pagos.puedePagar`. Contra un backend viejo, la consulta falla y el detalle de la factura no abre.
   - Las versiones del móvil ya instaladas siguen con la lógica vieja (suman `pendiente` y muestran "Pagar" en históricas) hasta que se actualicen. El backend ya rechaza esos pagos.
2. **Mensajes de error en producción.** El backend usa `Error` (no `ConvexError`) en todo el proyecto. En producción, Convex puede ocultar al cliente el texto de esos errores. La web traduce los nuevos rechazos, pero en producción puede terminar mostrando el mensaje genérico. Por eso la subida decide 401/403 con un **valor devuelto** (`motivo`), no con el texto de un error. El bot corre dentro de Convex y recibe el texto completo (el mismo supuesto con el que ya funcionaba "ya está pagada").
3. **`listMia` trae hasta 50 facturas por residente.** El resumen de la web y del móvil se calcula sobre esas. Con muchas unidades y años de historial podría faltar la vigente de alguna. No ocurre con los datos actuales (máximo 8 facturas por unidad). Se corrige con F-16 (Fase 4).
4. **Las filas del historial conservan su estado.** Abril sigue rotulado "Vencida" en la lista: es el veredicto de la conciliación de ese mes. Ya no es deuda, no se ofrece para pagar y no pinta el estado actual. Rotularlas como historial ("su saldo pasó a la factura siguiente", como ya hace la campana) es una mejora de presentación pendiente.

---

## 11. Recomendación para la Fase 2

**Queda listo para empezar la ingestión confiable:**

- Una definición única de vigente y de pagable. Cuando la Fase 2 re-procese CDC, el estado del residente, los botones y la cartera se recalculan solos con los datos corregidos, sin tocar las pantallas.
- La subida de PDF ya exige sesión y rol, así que la Fase 2 puede rediseñar la ruta (vista previa sin S3, confirmación, llaves versionadas) sobre una puerta cerrada. `facturas.permisoSubida` sirve de punto de autorización para el paso de confirmación.
- Red de seguridad en verde para todo lo que la Fase 2 no debe romper: 33 controles + 18 de la Fase 1 + 44 pruebas nuevas en las suites normales.
- Una lista concreta de unidades afectadas por el parser (Anexo A, tabla D) para validar el re-procesamiento contra casos reales.

**Orden sugerido:**

1. Parser de CDC con signo y saldo anterior desde la fila "Totales"; validación de cuadre bloqueante (F-04, #57–#70). Parser de Arboleda: paréntesis y período (F-15, #72, #75, #76).
2. Período tomado del documento y comparado con el elegido; S3 solo después de confirmar, con llave versionada (F-07, #13, #14, #78, #79).
3. Re-procesamiento de CDC en **modo informe (dry-run)**: listar qué estados cambiarían, empezando por las 21 unidades del grupo D y los casos de §9.5. Revisarlo con la administración **antes** de escribir.
4. Decidir `AVAL_AMBIENTE` antes de cualquier apertura de la pasarela por API. Recordar que F-02, F-06 y F-13 (Fase 3) siguen abiertos y son los que importan cuando haya pagos aprobados.

**Criterio de salida de la Fase 2:** las 21 pruebas de la Fase 2 en verde, y los 33 controles más las 18 de la Fase 1 todavía en verde.

---

## Anexo A — Listado para la revisión con la administración

Datos de la exportación de solo lectura del 2026-10-08, sin nombres de residentes. "Estado mostrado hasta hoy" es lo que pinta la web en producción (código de HEAD). "Estado por cartera" es `carteraDeUnidad`, que ahora usan también la web y el móvil. "Saldo vigente" es lo que la unidad debe hoy según la cartera.

### A. Las 62 de la auditoría (penúltima pagada, vigente sin vencer)

| # | Conjunto | Unidad | Estado mostrado hasta hoy | Estado por cartera | Factura vigente | Período | Saldo vigente | Motivo |
|---|---|---|---|---|---|---|---|---|
| 1 | Arboleda | T-I 104 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0067 `js7c31kkmd3eg4t05qfsxzpy8d8ehgv7` | 2026-09 | $104.637 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 2 | Arboleda | T-I 203 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0007 `js7ex5zxpkkwaf3ernavx4btmh8egbre` | 2026-09 | $291.000 | vencidas históricas 2026-05, 2026-07; 2026-08 pagada la cubre |
| 3 | Arboleda | T-I 204 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0010 `js71wrt4rev5sp5geqc4rhk0a98ehkyp` | 2026-09 | $284.000 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 4 | Arboleda | T-I 401 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0079 `js7a8tpa55y267z5fdbb650pr98egc6k` | 2026-09 | $314.000 | vencidas históricas 2026-06; 2026-08 pagada la cubre |
| 5 | Arboleda | T-I 402 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0061 `js76zmb8pq56a0zfjanskxra5x8eh801` | 2026-09 | $306.000 | vencidas históricas 2026-05; 2026-08 pagada la cubre |
| 6 | Arboleda | T-I 403 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0107 `js78wfer6rsyvjvryxyxy4caks8ehs5g` | 2026-09 | $284.000 | vencidas históricas 2026-05; 2026-08 pagada la cubre |
| 7 | Arboleda | T-I 702 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0065 `js7av01w5y96mw5jcg3s5k9k498ehw9n` | 2026-09 | $310.500 | vencidas históricas 2026-03, 2026-06; 2026-08 pagada la cubre |
| 8 | Arboleda | T-I 803 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0133 `js7byb60ka4p6c6hpsk2zdb33d8ehk7r` | 2026-09 | $284.000 | vencidas históricas 2026-05; 2026-08 pagada la cubre |
| 9 | Arboleda | T-I 903 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0075 `js77emqtvs677dgncnz82m46018eh08m` | 2026-09 | $284.000 | vencidas históricas 2026-05, 2026-07; 2026-08 pagada la cubre |
| 10 | Arboleda | T-I 1004 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0158 `js7de2jn9ytgwhf1fc3kepwg458egktz` | 2026-09 | $289.000 | vencidas históricas 2026-04, 2026-06; 2026-08 pagada la cubre |
| 11 | Arboleda | T-I 1104 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0132 `js7b4favnf8f1x86hvtzak0hbs8ehzsh` | 2026-09 | $284.000 | vencidas históricas 2026-06; 2026-08 pagada la cubre |
| 12 | Arboleda | T-II 102 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0083 `js73rbbhn88kcbp61dcmwn6rfd8egd35` | 2026-09 | $292.000 | vencidas históricas 2026-03, 2026-04, 2026-05, 2026-07; 2026-08 pagada la cubre |
| 13 | Arboleda | T-II 104 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0011 `js7fg76v1cxmgevw1ey2hk15zd8egav2` | 2026-09 | $174.000 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 14 | Arboleda | T-II 302 | Vencida | al día → web: **Al día** | FAC-2026-09-0100 `js76ecqge1qm1andv8t578djgh8egmy4` | 2026-09 | $0 | vencidas históricas 2026-05; 2026-08 pagada la cubre; vigente en $0 |
| 15 | Arboleda | T-II 703 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0119 `js78ty67c4re56pfcm2mvc1res8ehpfn` | 2026-09 | $294.000 | vencidas históricas 2026-07; 2026-08 pagada la cubre |
| 16 | Arboleda | T-II 804 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0121 `js7dfjsa35bz0pfkz6fjkbge3h8egbct` | 2026-09 | $292.000 | vencidas históricas 2026-04, 2026-05; 2026-08 pagada la cubre |
| 17 | Arboleda | T-II 902 | Vencida | al día → web: **Al día** | FAC-2026-09-0105 `js7316tymssvwcdq9zr7fj0br98egkzw` | 2026-09 | $0 | vencidas históricas 2026-04; 2026-08 pagada la cubre; vigente en $0 |
| 18 | Arboleda | T-II 904 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0004 `js76acf65mdry8kg6q7pa9r47s8ehmsq` | 2026-09 | $292.000 | vencidas históricas 2026-05; 2026-08 pagada la cubre |
| 19 | Arboleda | T-III 101 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0029 `js76std4mfsgw7tzvw0vb9x6zn8eg5m2` | 2026-09 | $292.000 | vencidas históricas 2026-07; 2026-08 pagada la cubre |
| 20 | Arboleda | T-III 104 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0012 `js7ctq2d008eryhke01q94xp7x8ehaq0` | 2026-09 | $174.000 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 21 | Arboleda | T-III 201 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0093 `js7ebxc81nya0ce6czzpmyf9xh8ehf08` | 2026-09 | $306.000 | vencidas históricas 2026-03, 2026-05; 2026-08 pagada la cubre |
| 22 | Arboleda | T-III 301 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0122 `js73ah2tfjk0d9yfarzxb7cmd58eh4d0` | 2026-09 | $307.000 | vencidas históricas 2026-04, 2026-06, 2026-07; 2026-08 pagada la cubre |
| 23 | Arboleda | T-III 303 | Vencida | al día → web: **Al día** | FAC-2026-09-0051 `js75sdjvhsn3d0ee2c4rb85n1x8eg2w4` | 2026-09 | $0 | vencidas históricas 2026-04; 2026-08 pagada la cubre; vigente en $0 |
| 24 | Arboleda | T-III 304 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0076 `js77kxf6vmp6grny8s5jyyj0a98ehkdk` | 2026-09 | $189.622 | vencidas históricas 2026-03; 2026-08 pagada la cubre |
| 25 | Arboleda | T-III 402 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0165 `js759mre5rd4b2a80784sbba558eg30e` | 2026-09 | $306.000 | vencidas históricas 2026-07; 2026-08 pagada la cubre |
| 26 | Arboleda | T-III 601 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0156 `js78gw45e0s91sdxpcch127kq58egzdd` | 2026-09 | $306.000 | vencidas históricas 2026-04, 2026-07; 2026-08 pagada la cubre |
| 27 | Arboleda | T-III 604 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0103 `js7dveh3k8y2ybe119bp30scyh8egbh6` | 2026-09 | $242.400 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 28 | Arboleda | T-III 702 | Vencida | al día → web: **Al día** | FAC-2026-09-0085 `js74ggbcym5pp94tzxyb9hahzh8egyvy` | 2026-09 | $0 | vencidas históricas 2026-04; 2026-08 pagada la cubre; vigente en $0 |
| 29 | Arboleda | T-III 903 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0042 `js75g4x4p9zr52abc4brjdd6nx8egffn` | 2026-09 | $299.000 | vencidas históricas 2026-03, 2026-04, 2026-05, 2026-06, 2026-07; 2026-08 pagada la cubre |
| 30 | Arboleda | T-IV 401 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0015 `js713e1s9j9z81wpf8gptm53018eh2b1` | 2026-09 | $302.000 | vencidas históricas 2026-06; 2026-08 pagada la cubre |
| 31 | Arboleda | T-IV 404 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0106 `js78596qx8x7psczpebdh0ftas8ehbjx` | 2026-09 | $285.000 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 32 | Arboleda | T-IV 901 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0019 `js79cackgdynypcy77gdq1yw118eg8z8` | 2026-09 | $302.000 | vencidas históricas 2026-04, 2026-05, 2026-06; 2026-08 pagada la cubre |
| 33 | CDC | 102 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0083 `js757sjr0vv8dcgsjh2y32r0an8e1350` | 2026-09 | $164.850 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 34 | CDC | 108 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0110 `js79sftbn4ss9qmnt75b1zsdf98e13pe` | 2026-09 | $322.000 | vencidas históricas 2026-02; 2026-08 pagada la cubre |
| 35 | CDC | 205 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0058 `js75e2bnmd4nke2fcqc9exnzmd8e1rf1` | 2026-09 | $335.000 | vencidas históricas 2026-06; 2026-08 pagada la cubre |
| 36 | CDC | 210 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0030 `js763nwvzqb1zvk3a4y261b9gn8e1kd4` | 2026-09 | $335.000 | vencidas históricas 2026-01, 2026-03; 2026-08 pagada la cubre |
| 37 | CDC | 304 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0019 `js78tbeq6y7167s6ksq4n9jac98e0tks` | 2026-09 | $433.000 | vencidas históricas 2026-01; 2026-08 pagada la cubre |
| 38 | CDC | 305 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0189 `js70qmchd7q1cqg4ejgbkx5pnx8e0xjn` | 2026-09 | $335.000 | vencidas históricas 2026-05; 2026-08 pagada la cubre |
| 39 | CDC | 325 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0099 `js754ev44d552vvw6dthnk1prs8e0e20` | 2026-09 | $335.000 | vencidas históricas 2026-03; 2026-08 pagada la cubre |
| 40 | CDC | 408 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0104 `js7d6qwntzf7a5nhtr5p5zt0nx8e1zf1` | 2026-09 | $435.000 | vencidas históricas 2026-06; 2026-08 pagada la cubre |
| 41 | CDC | 411 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0051 `js75r3xqzvd54hwcbbm71axmm58e1s85` | 2026-09 | $335.000 | vencidas históricas 2026-05; 2026-08 pagada la cubre |
| 42 | CDC | 502 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0041 `js75zawk8x97vjvdptrea8kn0d8e1s1k` | 2026-09 | $335.000 | vencidas históricas 2026-01; 2026-06 pagada la cubre |
| 43 | CDC | 505 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0043 `js7fgv6fy98r87k7mq94zh218n8e18tm` | 2026-09 | $335.000 | vencidas históricas 2026-02; 2026-08 pagada la cubre |
| 44 | CDC | 511 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0053 `js70w4h0m1es1qbvyf5ykn8qxs8e1ekk` | 2026-09 | $356.000 | vencidas históricas 2026-02, 2026-04; 2026-08 pagada la cubre |
| 45 | CDC | 514 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0087 `js79knwec74tcc050a0rm2ct598e1wcn` | 2026-09 | $460.000 | vencidas históricas 2026-05; 2026-08 pagada la cubre |
| 46 | CDC | 520 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0116 `js745fz852t75zvvw0drsds6q58e1rhx` | 2026-09 | $335.000 | vencidas históricas 2026-01, 2026-04; 2026-08 pagada la cubre |
| 47 | CDC | 611 | Vencida | al día → web: **Al día** | FAC-2026-09-0121 `js73js4mmybjtfhe937kdwyqe18e18yy` | 2026-09 | $0 | vencidas históricas 2026-05; 2026-08 pagada la cubre; vigente en $0 |
| 48 | CDC | 701 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0185 `js7dt2es6x9wddeskpw6gp392n8e0h2e` | 2026-09 | $335.000 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 49 | CDC | 707 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0146 `js73q4m9qshvx5w2xqz5rap51h8e193e` | 2026-09 | $379.000 | vencidas históricas 2026-02, 2026-05; 2026-08 pagada la cubre |
| 50 | CDC | 708 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0103 `js7cbq3gh5fw65bbagx972f6y18e1m5a` | 2026-09 | $335.000 | vencidas históricas 2026-02; 2026-08 pagada la cubre |
| 51 | CDC | 709 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0137 `js78gwavyxv0h8zkmwvp1kybxs8e0ed1` | 2026-09 | $492.000 | vencidas históricas 2026-05; 2026-06 pagada la cubre |
| 52 | CDC | 712 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0131 `js70gnrk386y0a6vddxrmg73918e0tt3` | 2026-09 | $335.000 | vencidas históricas 2026-01, 2026-03, 2026-06; 2026-08 pagada la cubre |
| 53 | CDC | 716 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0130 `js7ax7j1xhnjkzb273e0p073x18e0tjb` | 2026-09 | $335.000 | vencidas históricas 2026-05; 2026-08 pagada la cubre |
| 54 | CDC | 723 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0171 `js78nx0ej3ynfkfwc7vtn67n5d8e01y3` | 2026-09 | $335.000 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 55 | CDC | 807 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0193 `js7et913wegwt8ms1sbbnp798h8e0xvn` | 2026-09 | $342.000 | vencidas históricas 2026-05; 2026-08 pagada la cubre |
| 56 | CDC | 809 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0091 `js7afz8y3hy96epj66jvq3rpxs8e0cde` | 2026-09 | $569.000 | vencidas históricas 2026-02, 2026-04; 2026-08 pagada la cubre |
| 57 | CDC | 810 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0132 `js70ja1vj52m2thz1c442cpb398e1ax5` | 2026-09 | $328.000 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 58 | CDC | 906 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0148 `js7dbv3src6mk4kx0hy4ce28158e1h9p` | 2026-09 | $335.000 | vencidas históricas 2026-01, 2026-02, 2026-04, 2026-05; 2026-08 pagada la cubre |
| 59 | CDC | 911 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0136 `js78brgps7rp17ff220y8spc5n8e02st` | 2026-09 | $342.000 | vencidas históricas 2026-05; 2026-08 pagada la cubre |
| 60 | CDC | 916 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0055 `js7fmjrxsj6ey4bejenzcpzr7h8e1zzj` | 2026-09 | $335.000 | vencidas históricas 2026-04; 2026-08 pagada la cubre |
| 61 | CDC | 921 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0036 `js7avvtz1kcn7rqdhhfxyavry18e0wvs` | 2026-09 | $338.000 | vencidas históricas 2026-02; 2026-08 pagada la cubre |
| 62 | CDC | 924 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0111 `js76jkegcvrnhzekrve0dnjvmx8e1693` | 2026-09 | $335.000 | vencidas históricas 2026-01; 2026-08 pagada la cubre |

### B. 37 más con la penúltima abonada

| # | Conjunto | Unidad | Estado mostrado hasta hoy | Estado por cartera | Factura vigente | Período | Saldo vigente | Motivo |
|---|---|---|---|---|---|---|---|---|
| 1 | Arboleda | T-I 604 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0091 `js7ff4efw3ypbbyfd02sbm3mr58egehq` | 2026-09 | $580.348 | vencidas históricas 2026-03, 2026-04, 2026-07; 2026-08 abonada: abonó el último período vencido |
| 2 | Arboleda | T-I 701 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0072 `js72g771w4r8k2exr17qr4h3pn8ehdks` | 2026-09 | $1.097.591 | vencidas históricas 2026-03, 2026-04, 2026-06, 2026-07; 2026-08 abonada: abonó el último período vencido |
| 3 | Arboleda | T-I 804 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0136 `js7dy0zhs45bx2sgjj68x06xrx8eg3ck` | 2026-09 | $314.889 | vencidas históricas 2026-07; 2026-08 abonada: abonó el último período vencido |
| 4 | Arboleda | T-I 1003 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0024 `js78hwhy2vq9a1kwzwqay7t9fx8ehch9` | 2026-09 | $568.000 | vencidas históricas 2026-03, 2026-06; 2026-08 abonada: abonó el último período vencido |
| 5 | Arboleda | T-II 201 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0170 `js75m2mxkfctzvbsge228df26h8eg76t` | 2026-09 | $625.305 | vencidas históricas 2026-03, 2026-04, 2026-07; 2026-08 abonada: abonó el último período vencido |
| 6 | Arboleda | T-II 401 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0172 `js73fyxqck60ep2bbx367be1xh8eggea` | 2026-09 | $627.610 | vencidas históricas 2026-04, 2026-06; 2026-08 abonada: abonó el último período vencido |
| 7 | Arboleda | T-II 501 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0097 `js7562fe85zs65kt4xp765zqkx8ehz5z` | 2026-09 | $1.026.160 | vencidas históricas 2026-06; 2026-08 abonada: abonó el último período vencido |
| 8 | Arboleda | T-II 704 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0115 `js7bpre9n3ga756d2e5g74n8dx8ehnz3` | 2026-09 | $517.989 | vencidas históricas 2026-07; 2026-08 abonada: abonó el último período vencido |
| 9 | Arboleda | T-II 1001 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0123 `js75fkzq87342trf2hn8sn4zgx8ehzvd` | 2026-09 | $645.323 | vencidas históricas 2026-06; 2026-08 abonada: abonó el último período vencido |
| 10 | Arboleda | T-II 1003 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0045 `js77xrap3jzmrpcpd0v5ew5kkn8eh700` | 2026-09 | $843.061 | vencidas históricas 2026-03, 2026-04, 2026-07; 2026-08 abonada: abonó el último período vencido |
| 11 | Arboleda | T-III 204 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0062 `js76x7ngty0g4510habf3t3fen8eggxc` | 2026-09 | $574.134 | vencidas históricas 2026-04; 2026-08 abonada: abonó el último período vencido |
| 12 | Arboleda | T-III 802 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0144 `js73e2mh3gwxnk9af94pjqkyh98eh9ps` | 2026-09 | $511.314 | vencidas históricas 2026-04, 2026-06, 2026-07; 2026-08 abonada: abonó el último período vencido |
| 13 | Arboleda | T-III 1101 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0039 `js703jc8gcm1tat2d0n5t091w58eh58f` | 2026-09 | $778.843 | vencidas históricas 2026-03; 2026-08 abonada: abonó el último período vencido |
| 14 | Arboleda | T-III 1103 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0159 `js7e879s4myd9w6kxd4yfyptbd8eh607` | 2026-09 | $315.837 | vencidas históricas 2026-04; 2026-08 abonada: abonó el último período vencido |
| 15 | Arboleda | T-III 1104 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0070 `js76geqe291rp943n2bkxva82d8ehy05` | 2026-09 | $619.175 | vencidas históricas 2026-03, 2026-07; 2026-08 abonada: abonó el último período vencido |
| 16 | Arboleda | T-IV 202 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0057 `js70er20xefr8bb3622epd0r4x8egwwn` | 2026-09 | $778.825 | vencidas históricas 2026-04; 2026-08 abonada: abonó el último período vencido |
| 17 | Arboleda | T-IV 602 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0154 `js778emcypesxt2ywraqpafjvh8egeak` | 2026-09 | $500.000 | vencidas históricas 2026-05; 2026-08 abonada: abonó el último período vencido |
| 18 | Arboleda | T-IV 603 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0146 `js7130vx901zpkwn2yn7gndhys8eh31t` | 2026-09 | $691.000 | vencidas históricas 2026-07; 2026-08 abonada: abonó el último período vencido |
| 19 | Arboleda | T-IV 903 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0099 `js788mnptpawqj1dmp3zzr65rd8egsdz` | 2026-09 | $530.500 | vencidas históricas 2026-07; 2026-08 abonada: abonó el último período vencido |
| 20 | Arboleda | T-IV 904 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0094 `js78ggb44b8zaj9rv5man6zp4s8egn6n` | 2026-09 | $695.000 | vencidas históricas 2026-05, 2026-07; 2026-08 abonada: abonó el último período vencido |
| 21 | Arboleda | T-IV 1001 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0163 `js7d4g0z6mgxgvqgfv4ds9ave98egvd0` | 2026-09 | $710.000 | vencidas históricas 2026-06; 2026-08 abonada: abonó el último período vencido |
| 22 | Arboleda | T-IV 1002 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0023 `js7752derw1yzzc0vae5g4s2pn8ehczx` | 2026-09 | $1.035.342 | vencidas históricas 2026-03, 2026-05, 2026-06, 2026-07; 2026-08 abonada: abonó el último período vencido |
| 23 | Arboleda | T-IV 1004 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0138 `js795c1dxk8qz0jd7a3f785epn8egk2h` | 2026-09 | $2.012.857 | vencidas históricas 2026-04; 2026-08 abonada: abonó el último período vencido |
| 24 | Arboleda | T-IV 1104 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0155 `js7bret0a39pj7d3m91xn3cyqd8egh5p` | 2026-09 | $1.528.155 | vencidas históricas 2026-03, 2026-06; 2026-08 abonada: abonó el último período vencido |
| 25 | CDC | 109 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0114 `js7cafbfd9mdxc3vj69z31gyf98e14z5` | 2026-09 | $762.000 | vencidas históricas 2026-02, 2026-03, 2026-04; 2026-08 abonada: abonó el último período vencido |
| 26 | CDC | 203 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0198 `js76g84qwm6524kkme27v5y3y18e1t5r` | 2026-09 | $724.000 | vencidas históricas 2026-02; 2026-08 abonada: abonó el último período vencido |
| 27 | CDC | 207 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0145 `js7b9d2tqnj12nrg1w8qvw3hss8e0ex7` | 2026-09 | $684.000 | vencidas históricas 2026-02, 2026-03; 2026-08 abonada: abonó el último período vencido |
| 28 | CDC | 212 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0156 `js7as5dzhqvjmm1yjdcxzf8yjd8e1293` | 2026-09 | $612.600 | vencidas históricas 2026-06; 2026-08 abonada: abonó el último período vencido |
| 29 | CDC | 214 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0144 `js790tv1p2qdnwktbjv29js60d8e0fjb` | 2026-09 | $977.000 | vencidas históricas 2026-02, 2026-06; 2026-08 abonada: abonó el último período vencido |
| 30 | CDC | 216 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0025 `js78wth7mvznzpckchbg3fsmcx8e1een` | 2026-09 | $1.451.450 | vencidas históricas 2026-05; 2026-08 abonada: abonó el último período vencido |
| 31 | CDC | 219 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0139 `js74v23tvm16x71bmq1w6xyyhx8e11pv` | 2026-09 | $343.100 | vencidas históricas 2026-03; 2026-08 abonada: abonó el último período vencido |
| 32 | CDC | 306 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0002 `js7eed92q7bcharaxpcwb30td18e1dsz` | 2026-09 | $504.000 | vencidas históricas 2026-06; 2026-08 abonada: abonó el último período vencido |
| 33 | CDC | 319 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0074 `js713rppk0jgcn5890s1nv92w18e07s5` | 2026-09 | $682.000 | vencidas históricas 2026-02, 2026-04; 2026-08 abonada: abonó el último período vencido |
| 34 | CDC | 409 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0162 `js79j0rwmd5y6mfn0ewatse0558e16bm` | 2026-09 | $380.000 | vencidas históricas 2026-04; 2026-08 abonada: abonó el último período vencido |
| 35 | CDC | 509 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0045 `js7bmd5acxhpadvkxrqptre6bd8e14fe` | 2026-09 | $670.000 | vencidas históricas 2026-02, 2026-04, 2026-06; 2026-08 abonada: abonó el último período vencido |
| 36 | CDC | 609 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0022 `js7fm3gahsq1h1damcwb9kscvx8e1mqt` | 2026-09 | $877.600 | vencidas históricas 2026-06; 2026-08 abonada: abonó el último período vencido |
| 37 | CDC | 702 | Vencida | pendiente → web: **Pendiente** | FAC-2026-09-0080 `js77kh5dgs9es9m4pafq72t9e18e1x3c` | 2026-09 | $1.277.000 | vencidas históricas 2026-02, 2026-04; 2026-08 abonada: abonó el último período vencido |

### C. 8 con la vigente en $0 (se mostraban "Pendiente" con $0 por pagar)

| # | Conjunto | Unidad | Estado mostrado hasta hoy | Estado por cartera | Factura vigente | Período | Saldo vigente | Motivo |
|---|---|---|---|---|---|---|---|---|
| 1 | Arboleda | 9999 | Pendiente | al día → web: **Al día** | FAC-2026-04-0173 `js7a8nz7k9s6ngegbzkgvasdh98atzym` | 2026-04 | $0 | vigente pendiente con total $0; 2026-03 pagada |
| 2 | Arboleda | T-I 901 | Pendiente | al día → web: **Al día** | FAC-2026-09-0068 `js73bg1a31tms8kp8by3q69j6s8eh9jd` | 2026-09 | $0 | vigente pendiente con total $0; 2026-08 pagada |
| 3 | Arboleda | T-II 604 | Pendiente | al día → web: **Al día** | FAC-2026-09-0001 `js7b3qc0k3sy8mzbc5s7ccarcs8eg3rz` | 2026-09 | $0 | vigente pendiente con total $0; 2026-08 pagada |
| 4 | CDC | 815 | Pendiente | al día → web: **Al día** | FAC-2026-09-0020 `js7ee7rn7vn6eb922vnzdqpyrd8e10rr` | 2026-09 | $0 | vigente pendiente con total $0; 2026-08 pagada |
| 5 | CDC | 816 | Pendiente | al día → web: **Al día** | FAC-2026-09-0021 `js7am68c1k1xkta3tqdxp73hzn8e1k4f` | 2026-09 | $0 | vigente pendiente con total $0; 2026-08 pagada |
| 6 | CDC | 818 | Pendiente | al día → web: **Al día** | FAC-2026-09-0033 `js7cbr02zqq0v7pg6nhgeb980s8e06zc` | 2026-09 | $0 | vigente pendiente con total $0; 2026-08 pagada |
| 7 | CDC | 901 | Pendiente | al día → web: **Al día** | FAC-2026-09-0197 `js7a1xj80g4wencs7eestzt55h8e06ar` | 2026-09 | $0 | vigente pendiente con total $0; 2026-08 pagada |
| 8 | CDC | 999 | Pendiente | al día → web: **Al día** | FAC-2026-03-0204 `js75h84aqtkztzeqxtfk5f9d8n8at1v6` | 2026-03 | $0 | vigente pendiente con total $0; sin penúltima |

### D. Siguen "Vencida" con lectura sospechosa del PDF (pendiente de Fase 2): 21

| # | Conjunto | Unidad | Estado mostrado hasta hoy | Estado por cartera | Factura vigente | Período | Saldo vigente | Motivo |
|---|---|---|---|---|---|---|---|---|
| 1 | CDC | 111 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0118 `js79yks2hsqarrvqf1sge94zns8e02dz` | 2026-09 | $15.640.150 | agosto con total $0 y "vencida" (F-04) |
| 2 | CDC | 112 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0177 `js71vnwxa1xtnze3yfgszpec6x8e0ad3` | 2026-09 | $15.776.100 | agosto con total $0 y "vencida" (F-04) |
| 3 | CDC | 211 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0117 `js73rdn6bprc0bqcv3tcdvk38n8e0ewt` | 2026-09 | $5.705.200 | agosto con total $0 y "vencida" (F-04) |
| 4 | CDC | 220 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0068 `js742q6b9s1kwmvaxm8mq3mabn8e1hha` | 2026-09 | $3.699.900 | agosto con total $0 y "vencida" (F-04) |
| 5 | CDC | 401 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0181 `js7bmbk16by748atvfhdp3nsdh8e0gs4` | 2026-09 | $73.000 | agosto con total $0 y "vencida" (F-04) |
| 6 | CDC | 402 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0061 `js7drneq81f3f2mgakqqs1k03x8e1kxw` | 2026-09 | $10.534.010 | agosto con total $0 y "vencida" (F-04) |
| 7 | CDC | 404 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0039 `js7d6pbqx3z1y9nmmpavcvew558e1y43` | 2026-09 | $3.981.100 | agosto con total $0 y "vencida" (F-04) |
| 8 | CDC | 405 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0172 `js7ekh2d7y3hv1pgrk097b4ann8e0g9b` | 2026-09 | $4.279.800 | agosto con total $0 y "vencida" (F-04) |
| 9 | CDC | 410 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0168 `js7e60ay93bxq3t44m212755x58e01t1` | 2026-09 | $300.670 | agosto con total $0 y "vencida" (F-04) |
| 10 | CDC | 501 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0040 `js71zttzt5h9f0rrwxd07xfbjd8e16dq` | 2026-09 | $25.589.620 | agosto con total $0 y "vencida" (F-04) |
| 11 | CDC | 503 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0038 `js751xdb0771vt4v251ysjzetd8e0fvk` | 2026-09 | $365.000 | las líneas de septiembre suman $670.000 y el total es $365.000 (F-04) |
| 12 | CDC | 504 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0042 `js721p2sjrsbnzrapj2cz7b1kn8e14m6` | 2026-09 | $24.769.520 | agosto con total $0 y "vencida" (F-04) |
| 13 | CDC | 508 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0044 `js71h2z2fy451g4g8y7aq6wf4d8e03ep` | 2026-09 | $25.659.720 | agosto con total $0 y "vencida" (F-04) |
| 14 | CDC | 607 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0204 `js7bagwc3de1pd0x2p0jmrwd198e0dbg` | 2026-09 | $331.800 | agosto con total $0 y "vencida" (F-04) |
| 15 | CDC | 608 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0046 `js7cbpgzm34vzfk4xvt7arz4gn8e0fwv` | 2026-09 | $8.182.000 | agosto con total $0 y "vencida" (F-04) |
| 16 | CDC | 613 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0047 `js77v5p0pxynb4hgf3m6mb84c58e13he` | 2026-09 | $25.598.278 | agosto con total $0 y "vencida" (F-04) |
| 17 | CDC | 711 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0088 `js7d3qgcy68fqprskdjn85wm8h8e10jb` | 2026-09 | $11.554.600 | agosto con total $0 y "vencida" (F-04) |
| 18 | CDC | 813 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0049 `js7e82c1hmpy6p3c523y416k7x8e12nb` | 2026-09 | $25.812.120 | agosto con total $0 y "vencida" (F-04) |
| 19 | CDC | 904 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0184 `js771fqakk8s99n00d7db0nx398e1wjw` | 2026-09 | $9.558.250 | agosto con total $0 y "vencida" (F-04) |
| 20 | CDC | 907 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0196 `js784mr3hqv9hcpc6tm84p242n8e15gn` | 2026-09 | $11.609.050 | agosto con total $0 y "vencida" (F-04) |
| 21 | CDC | 910 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0057 `js752tjbz4vje3bej0h43f1xss8e19py` | 2026-09 | $1.028.000 | las líneas de septiembre suman $1.068.000 y el total es $1.028.000 (F-04) |

### E. Siguen "Vencida" con datos coherentes (mora real según los PDF; confirmar pagos externos): 62

| # | Conjunto | Unidad | Estado mostrado hasta hoy | Estado por cartera | Factura vigente | Período | Saldo vigente | Motivo |
|---|---|---|---|---|---|---|---|---|
| 1 | Arboleda | T-I 101 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0035 `js73084zevg24tn16t2vr2a4cd8ehddp` | 2026-09 | $902.634 | agosto vencida ($595.933) arrastrada por septiembre (saldo ant. $595.933) |
| 2 | Arboleda | T-I 502 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0073 `js79fgtx0w3ahmw55tbv1t2fy98egzj6` | 2026-09 | $1.090.549 | agosto vencida ($774.504) arrastrada por septiembre (saldo ant. $774.504) |
| 3 | Arboleda | T-I 503 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0114 `js7dds188b6vpc001teqj191qd8ehzbc` | 2026-09 | $2.109.854 | agosto vencida ($1.791.544) arrastrada por septiembre (saldo ant. $1.791.544) |
| 4 | Arboleda | T-I 602 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0071 `js77sdabqhd29pxfnts85c1rjh8eheh2` | 2026-09 | $618.610 | agosto vencida ($306.000) arrastrada por septiembre (saldo ant. $306.000) |
| 5 | Arboleda | T-I 801 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0095 `js7dyqepz0zx60bjxsp17j8pkn8eh57m` | 2026-09 | $978.414 | agosto vencida ($653.195) arrastrada por septiembre (saldo ant. $653.195) |
| 6 | Arboleda | T-I 1002 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0031 `js72dm775hm2kxxb30dnykx12s8ehw04` | 2026-09 | $956.606 | agosto vencida ($637.387) arrastrada por septiembre (saldo ant. $637.387) |
| 7 | Arboleda | T-I 1101 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0120 `js7fz4adthv6a56hrydes5tvmd8egvz9` | 2026-09 | $3.298.851 | agosto vencida ($2.936.302) arrastrada por septiembre (saldo ant. $2.936.302) |
| 8 | Arboleda | T-I 1102 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0020 `js772396zxv7c4a216qv1f844h8egjrg` | 2026-09 | $1.085.444 | agosto vencida ($463.725) arrastrada por septiembre (saldo ant. $713.725) |
| 9 | Arboleda | T-II 101 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0043 `js7ady60nzkazvjpvsrnmvn5f18egdkh` | 2026-09 | $895.003 | agosto vencida ($590.389) arrastrada por septiembre (saldo ant. $590.389) |
| 10 | Arboleda | T-II 103 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0028 `js70vy1jb9kz3gm55z8c5ywt2x8ehed0` | 2026-09 | $1.240.683 | agosto vencida ($949.027) arrastrada por septiembre (saldo ant. $949.027) |
| 11 | Arboleda | T-II 301 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0108 `js7a26kztjmjk670wsv7dqfae98egzwa` | 2026-09 | $618.610 | agosto vencida ($306.000) arrastrada por septiembre (saldo ant. $306.000) |
| 12 | Arboleda | T-II 304 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0052 `js7chkc8ahf9fmg8t7e34d2bnx8egtef` | 2026-09 | $922.744 | agosto vencida ($626.238) arrastrada por septiembre (saldo ant. $626.238) |
| 13 | Arboleda | T-II 404 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0034 `js7806jn2jze8qw09rcrh2152n8egm96` | 2026-09 | $2.193.710 | agosto vencida ($1.879.038) arrastrada por septiembre (saldo ant. $1.879.038) |
| 14 | Arboleda | T-II 504 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0069 `js767tf38gj831db11ynn0mctx8ega3d` | 2026-09 | $1.172.880 | agosto vencida ($870.477) arrastrada por septiembre (saldo ant. $870.477) |
| 15 | Arboleda | T-II 801 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0153 `js7f4dhh7t6p2rskead38zq96n8eg4w7` | 2026-09 | $702.829 | agosto vencida ($390.500) arrastrada por septiembre (saldo ant. $390.500) |
| 16 | Arboleda | T-II 803 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0102 `js742mq65xrb0pe5vtmmknb8598egeet` | 2026-09 | $599.683 | agosto vencida ($297.549) arrastrada por septiembre (saldo ant. $297.549) |
| 17 | Arboleda | T-II 903 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0142 `js7ehsbv8efqf870avr2rsgdm98ehh2z` | 2026-09 | $367.109 | agosto vencida ($74.500) arrastrada por septiembre (saldo ant. $74.500) |
| 18 | Arboleda | T-II 1002 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0127 `js745smzz185k1y7pbz3n3x9cn8egpbt` | 2026-09 | $663.610 | agosto vencida ($351.000) arrastrada por septiembre (saldo ant. $351.000) |
| 19 | Arboleda | T-II 1004 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0113 `js72xejs9cbg9zc97021wxy6qs8eh7px` | 2026-09 | $656.804 | agosto vencida ($366.113) arrastrada por septiembre (saldo ant. $366.113) |
| 20 | Arboleda | T-II 1101 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0134 `js74k1h9zhvdg24nmfm2c0nmm18eg0h1` | 2026-09 | $2.058.991 | agosto vencida ($1.726.553) arrastrada por septiembre (saldo ant. $1.726.553) |
| 21 | Arboleda | T-II 1104 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0089 `js7fw7m6nvkf205stn4a498nzd8ehw0w` | 2026-09 | $594.906 | agosto vencida ($300.423) arrastrada por septiembre (saldo ant. $300.423) |
| 22 | Arboleda | T-III 103 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0044 `js79yg9yvz370tny4e9cfmedh58eg6j6` | 2026-09 | $2.238.422 | agosto vencida ($1.766.748) arrastrada por septiembre (saldo ant. $1.931.748) |
| 23 | Arboleda | T-III 302 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0087 `js77enj3sm4xnbxhq44drwcw4s8eg377` | 2026-09 | $2.472.285 | agosto vencida ($2.105.342) arrastrada por septiembre (saldo ant. $2.105.342) |
| 24 | Arboleda | T-III 401 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0003 `js77cesshsj9nt1h95vtrnktr18eh9z9` | 2026-09 | $618.610 | agosto vencida ($306.000) arrastrada por septiembre (saldo ant. $306.000) |
| 25 | Arboleda | T-III 501 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0046 `js7e4rp9ghbnnfss6kw57z2hed8eh58y` | 2026-09 | $618.610 | agosto vencida ($306.000) arrastrada por septiembre (saldo ant. $306.000) |
| 26 | Arboleda | T-III 701 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0082 `js787fm31h28ht2mhkwx2af6qx8eg60x` | 2026-09 | $618.610 | agosto vencida ($306.000) arrastrada por septiembre (saldo ant. $306.000) |
| 27 | Arboleda | T-III 801 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0086 `js7f6p76zr48tzzhff9zfkk2g98eghvd` | 2026-09 | $4.136.301 | agosto vencida ($3.741.194) arrastrada por septiembre (saldo ant. $3.741.194) |
| 28 | Arboleda | T-III 901 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0002 `js7bs6t1cbmp9afrqh2wt990kn8ehd6a` | 2026-09 | $627.610 | agosto vencida ($315.000) arrastrada por septiembre (saldo ant. $315.000) |
| 29 | Arboleda | T-III 904 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0021 `js717dh29y18d44afnb32sa6w18eg1v8` | 2026-09 | $2.117.142 | agosto vencida ($1.792.090) arrastrada por septiembre (saldo ant. $1.792.090) |
| 30 | Arboleda | T-III 1002 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0167 `js760zhh0jfmcfw5r7h4ky61fh8ehyav` | 2026-09 | $715.582 | agosto vencida ($357.000) arrastrada por septiembre (saldo ant. $357.000) |
| 31 | Arboleda | T-III 1003 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0056 `js7fx29d5a9e8y46wanehvnhts8egnyx` | 2026-09 | $1.706.010 | agosto vencida ($1.398.875) arrastrada por septiembre (saldo ant. $1.398.875) |
| 32 | Arboleda | T-IV 201 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0005 `js744e0ng7qxnqd1vk82kae1hs8egg5v` | 2026-09 | $1.364.016 | agosto vencida ($1.042.710) arrastrada por septiembre (saldo ant. $1.042.710) |
| 33 | Arboleda | T-IV 203 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0033 `js7d9qt3vpycc6jxwfcydj7chs8ehk5y` | 2026-09 | $1.807.017 | agosto vencida ($1.507.007) arrastrada por septiembre (saldo ant. $1.507.007) |
| 34 | Arboleda | T-IV 204 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0059 `js7c6gsncjqexw78nwy49ctfhn8ehvas` | 2026-09 | $1.145.619 | agosto vencida ($895.251) arrastrada por septiembre (saldo ant. $895.251) |
| 35 | Arboleda | T-IV 302 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0096 `js7b4wqp68fss8mmttzc8926x18eg0xw` | 2026-09 | $1.298.794 | agosto vencida ($986.470) arrastrada por septiembre (saldo ant. $986.470) |
| 36 | Arboleda | T-IV 402 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0169 `js70d2tvb55x68cj98r4236b2s8ehpgq` | 2026-09 | $2.495.897 | agosto vencida ($2.147.985) arrastrada por septiembre (saldo ant. $2.147.985) |
| 37 | Arboleda | T-IV 403 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0060 `js78v1rj32psq8c992r8jcjqm98egy4h` | 2026-09 | $1.130.294 | agosto vencida ($885.142) arrastrada por septiembre (saldo ant. $885.142) |
| 38 | Arboleda | T-IV 504 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0109 `js7192td7jjgwknwbnpnmyjqm58eh5w7` | 2026-09 | $1.006.699 | agosto vencida ($697.000) arrastrada por septiembre (saldo ant. $697.000) |
| 39 | Arboleda | T-IV 604 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0008 `js71hq5wd5zfyynydvsx2gaakh8eggye` | 2026-09 | $1.000.699 | agosto vencida ($707.500) arrastrada por septiembre (saldo ant. $707.500) |
| 40 | Arboleda | T-IV 703 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0118 `js76ax5s3tq6reyed3yjmhfjgn8egehh` | 2026-09 | $1.727.183 | agosto vencida ($1.420.521) arrastrada por septiembre (saldo ant. $1.420.521) |
| 41 | Arboleda | T-IV 801 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0016 `js722ncpmw2cv5jvfb92cmjtnn8egq45` | 2026-09 | $1.020.523 | agosto vencida ($712.000) arrastrada por septiembre (saldo ant. $712.000) |
| 42 | Arboleda | T-IV 803 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0038 `js76ws2jhwk044r6sndd59r7jx8egkkx` | 2026-09 | $3.123.894 | agosto vencida ($2.802.897) arrastrada por septiembre (saldo ant. $2.802.897) |
| 43 | Arboleda | T-IV 804 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0036 `js79a41qcjhrqb34kwtd2ce1wd8eg4tx` | 2026-09 | $707.000 | agosto vencida ($410.000) arrastrada por septiembre (saldo ant. $410.000) |
| 44 | Arboleda | T-IV 1103 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0058 `js79711jwgqh7126mtc065ampn8ehd33` | 2026-09 | $1.130.294 | agosto vencida ($885.142) arrastrada por septiembre (saldo ant. $885.142) |
| 45 | CDC | 104 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0143 `js7e77dkprd5q99pkaxhdqcae18e13tr` | 2026-09 | $1.728.000 | agosto vencida ($1.393.000) arrastrada por septiembre (saldo ant. $1.393.000) |
| 46 | CDC | 107 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0060 `js7etwbrgmp8nb4s4f5htge4zs8e0y5k` | 2026-09 | $670.000 | agosto vencida ($335.000) arrastrada por septiembre (saldo ant. $335.000) |
| 47 | CDC | 110 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0086 `js7dnvxqbq4apbm43xd4cyv5pn8e0tqb` | 2026-09 | $1.241.000 | agosto vencida ($906.000) arrastrada por septiembre (saldo ant. $906.000) |
| 48 | CDC | 201 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0180 `js74f0n2xy5gvhhzg91can9zeh8e176a` | 2026-09 | $2.691.000 | agosto vencida ($2.255.000) arrastrada por septiembre (saldo ant. $2.255.000) |
| 49 | CDC | 217 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0054 `js7cmj79ng16jv18pnaa91ww7d8e1haq` | 2026-09 | $1.402.000 | agosto vencida ($1.067.000) arrastrada por septiembre (saldo ant. $1.067.000) |
| 50 | CDC | 322 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0078 `js700p17bz40svgfh0166g828s8e0eed` | 2026-09 | $999.000 | agosto vencida ($461.000) arrastrada por septiembre (saldo ant. $461.000) |
| 51 | CDC | 323 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0062 `js713gr9y6shf29ca4etzrkfzs8e1ka6` | 2026-09 | $670.000 | agosto vencida ($335.000) arrastrada por septiembre (saldo ant. $335.000) |
| 52 | CDC | 507 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0052 `js7dxqykf3f3xrw6t3pn9nwq3h8e0f29` | 2026-09 | $1.171.000 | agosto vencida ($830.000) arrastrada por septiembre (saldo ant. $830.000) |
| 53 | CDC | 519 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0128 `js7ae6rpv4ebhsnv9513zjzn8n8e02b9` | 2026-09 | $670.000 | agosto vencida ($335.000) arrastrada por septiembre (saldo ant. $335.000) |
| 54 | CDC | 601 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0115 `js7fsqbs93zgqe45d6b0y5g3818e0q3k` | 2026-09 | $1.397.000 | agosto vencida ($552.000) arrastrada por septiembre (saldo ant. $552.000) |
| 55 | CDC | 624 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0140 `js79s00ta438v4bbwq1s3ch7g58e1fa3` | 2026-09 | $866.000 | agosto vencida ($447.000) arrastrada por septiembre (saldo ant. $447.000) |
| 56 | CDC | 626 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0084 `js73zrsdp88g50y4v3wp75n70d8e1rtf` | 2026-09 | $698.000 | agosto vencida ($335.000) arrastrada por septiembre (saldo ant. $335.000) |
| 57 | CDC | 703 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0119 `js76gmdc9nchw3w2hnysb69hm98e1pb0` | 2026-09 | $2.441.200 | agosto vencida ($2.099.200) arrastrada por septiembre (saldo ant. $2.099.200) |
| 58 | CDC | 710 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0071 `js73jyfaegknzjnmdsx978sy2d8e15ta` | 2026-09 | $1.679.000 | agosto vencida ($1.344.000) arrastrada por septiembre (saldo ant. $1.344.000) |
| 59 | CDC | 806 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0101 `js7372yp442hr49fyqv9wfcbq18e0ctc` | 2026-09 | $1.195.300 | agosto vencida ($746.800) arrastrada por septiembre (saldo ant. $746.800) |
| 60 | CDC | 820 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0141 `js7d5763w6nk3we3jq196ngwch8e0xnb` | 2026-09 | $1.308.500 | agosto vencida ($824.500) arrastrada por septiembre (saldo ant. $824.500) |
| 61 | CDC | 908 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0028 `js7aqn62rw27gdxq7fdmh6cj9x8e0qnh` | 2026-09 | $698.000 | agosto vencida ($363.000) arrastrada por septiembre (saldo ant. $363.000) |
| 62 | CDC | 912 | Vencida | en mora (2026-08, 23 d) → web: **Vencida** | FAC-2026-09-0090 `js72twtqvdc2tsc3sbp1vcv7458e0r9m` | 2026-09 | $1.416.000 | agosto vencida ($994.000) arrastrada por septiembre (saldo ant. $994.000) |

## Anexo B — Comandos de verificación (solo lectura)

| Paso | Comando | Efecto |
|---|---|---|
| Línea base de pruebas (antes de cambiar código) | `bun run test:unit`, `test:facturacion`, `test:seguridad` (backend); `bun run test:facturacion` y `bun test pruebas/<archivo>` (web); `bun run test` (móvil); `tsc --noEmit` en los tres | — |
| Datos | `bunx convex data facturas\|unidades\|condominios\|pqrs\|pagos\|soportesPago\|usuarioUnidad --limit 8000 --format jsonl` → scratchpad | Lectura |
| ¿Es la misma base que `--prod`? | `bunx convex data <tabla> --prod` contado con `grep -c`, y huella SHA-256 de `_id:_creationTime` de `pagos`, sin imprimir filas | Lectura |
| `AVAL_AMBIENTE` | `bunx convex env get AVAL_AMBIENTE` y `… --prod`, con la salida clasificada (`prod`/`qa`/no definida) | Lectura |
| Análisis | Scripts Node en el scratchpad que importan `lib/cartera.ts` del repositorio (la regla real) y la versión de HEAD (`git show HEAD:…`) para comparar | — |
| Cruce de pruebas | Reportes JSON (vitest) y JUnit (bun) antes y después, cruzados contra la tabla #1–#91 de la Fase 0 | — |

No se ejecutó `convex dev` ni `convex deploy`, ni ninguna mutación, migración o script que escriba. No se hizo commit.
