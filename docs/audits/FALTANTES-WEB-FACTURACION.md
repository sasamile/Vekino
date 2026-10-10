# Faltantes de la web de facturación — QA en Factory

La QA de facturación en el conjunto de prueba **Factory** (`j570ttbjpy06q0nnd6k15gnxbx8fxvcz`), sobre `0cf972d` (Fase 4), se detuvo por dos faltantes de la web. Cada hallazgo va en su propia sección.

---

## Hallazgo 2 — Carga de facturas en PDF para conjuntos sin `legacyId`

> **Estado:** cambios en el *working tree* sobre `49b9cb6`. Sin commit, sin despliegue, sin escrituras en Convex ni en S3. Ningún comando de Convex se ejecutó.

### 2.1 Resumen

**Qué pasaba.** Toda la carga de PDF dependía del `legacyId` del conjunto, que solo tienen los migrados (CDC y Arboleda):

- Finanzas mostraba "Subir facturas" solo si el conjunto tenía `legacyId`.
- Las dos rutas (`/api/facturas/upload` y `/api/facturas/confirmar`) exigían `condominioLegacyId`, validaban el permiso con él (`facturas.permisoSubida`) y armaban con él la llave de S3.
- `condominios.create` no asigna `legacyId` y `condominios.update` no lo acepta.

Resultado: ningún conjunto creado desde la plataforma podía cargar PDF, y no había forma de corregirlo desde la app.

**Qué se hizo.**

- **Backend:** una query nueva, `facturas.destinoCarga`, resuelve el conjunto por `condominioId` o por `condominioLegacyId` y devuelve, con el permiso, su `_id` y su carpeta de S3 (`legacyId || _id`). `permisoSubida` no cambia.
- **Rutas:** las dos usan esa misma resolución. La confirmación toma el conjunto y la carpeta del backend, no del formulario.
- **Finanzas:** "Subir facturas" aparece para cualquier conjunto, con la misma fuente de rol del área de administración (`adminHome.allowed`).

**Resultado.**

- La red de facturación sigue en verde: 55 en el backend y 36 en la web.
- Pruebas nuevas: 51 en el backend y 18 en la web.
- Las llaves de S3 de los conjuntos migrados no cambian: comparadas byte por byte contra el código anterior (§2.5).

### 2.2 Inventario de usos de `legacyId`

Las líneas son las de `49b9cb6`.

**En el flujo de carga** (todo lo que resolvía el conjunto o la carpeta por `legacyId`):

| Dónde | Qué hacía | Qué se hizo |
|---|---|---|
| `apps/web/app/condominio/[id]/finanzas/page.tsx:162-166` | Mostraba "Subir facturas" solo con `condominio.legacyId` y se lo pasaba al componente | Se muestra con `adminHome.allowed`, sin `legacyId`. El componente ya no lo recibe |
| `finanzas/page.tsx:185` | `legacyId` en las dependencias de las acciones de la barra | Quitado |
| `apps/web/components/upload-facturas.tsx:86-90, 130, 186` | Prop `condominioLegacyId`, enviada en la vista previa y en la confirmación | Envía `condominioId` en las dos |
| `apps/web/app/api/facturas/permiso.ts:22-26` | `rechazoDePermiso(condominioLegacyId)` → `permisoSubida` | `validarDestino(ids)` → `destinoCarga`. Devuelve el rechazo o el destino |
| `apps/web/app/api/facturas/upload/route.ts:25-30` | Exigía `condominioLegacyId` y validaba el permiso con él | Acepta `condominioId`, `condominioLegacyId` o los dos. Sin ninguno: 400 |
| `apps/web/app/api/facturas/confirmar/route.ts:121-133` | Exigía `condominioLegacyId` **y** `condominioId`. El permiso salía del primero y la escritura del segundo, **sin comprobar que fueran el mismo conjunto** | El conjunto y la carpeta salen del backend. Si llegan los dos, deben coincidir |
| `confirmar/route.ts:54-61, 184` | `llaveDe(condominioLegacyId, …)` | `llaveDe(carpeta, …)`, con la carpeta que devolvió el backend. El formato de la llave no cambia |
| `packages/backend/convex/facturas.ts:604-635` (`permisoSubida`) | Permiso por `legacyId` | **Sin cambios**: la web publicada lo sigue llamando. La web nueva usa `destinoCarga` |

**Pasos posteriores del flujo, verificados.** No resuelven el conjunto por `legacyId`:

| Dónde | Por qué no cambia |
|---|---|
| `facturas.iniciarImportacion`, `bulkUpsert` y `finalizarImportacion` | Van por `condominioId` e `importacionId`. Ahora reciben el `condominioId` que resolvió el backend, y cada una vuelve a exigir el rol |
| Tabla `importaciones` | Guarda `condominioId`, no `legacyId` |
| Parser (`api/facturas/parser.ts`, `lectura.ts`) | No usa `legacyId` |

**Fuera del flujo, sin cambios.** El cambio no rompe ninguno:

| Dónde | Para qué | Por qué se deja |
|---|---|---|
| `condominios.adminHome` (`condominios.ts:138`) devuelve `condominio.legacyId` | La web publicada lo lee para mostrar el botón | Debe seguir funcionando con el backend nuevo. La web nueva ya no lo lee |
| `schema.ts`: `legacyId` de `users`, `unidades`, `facturas` y `vehiculos`, con sus índices | El id de cada **registro** en el sistema anterior | No es el del conjunto |
| `migrations.ts` (`upsertCondominio`, `bulk*`) | Asigna los `legacyId` de la migración; idempotencia por `legacyId` del registro | Sin relación con la carga |
| `facturas.upsertFactura` (`:166, 185`), `facturaInputValidator.legacyId` (`:586`), `model/facturas.ts` | El `legacyId` de la **factura**, que desempata la migración | Sin relación con el conjunto |
| `condominios.create` / `update` | No asignan ni aceptan `legacyId` | Ver la alternativa (§2.6) |
| Móvil | Sin usos | — |
| Pruebas: `parserFacturas.test.mjs`, `contencion.test.ts` (no se pueden modificar), `cargaFacturas.test.mjs` | Llaman con `condominioLegacyId` | Siguen en verde sin cambios. `cargaFacturas` aún le pasa `condominioLegacyId` al componente, que ya no lo lee |
| `importacion.test.ts`, `modeloPagos.test.ts` | `legacyId` de facturas | Sin relación |

**Otras escrituras en la misma carpeta de S3.** No dependen de `legacyId`, pero comparten el prefijo `condominios/facturas/`:

- "Nueva factura" en la web (`components/create-factura-form.tsx:120`) y en el móvil (`apps/mobile/src/app/(app)/(tabs)/facturas.tsx:745`) **ya** suben a `condominios/facturas/{_id}/`, con la llave `{carpeta}/{timestamp}-{uuid8}-{nombre}` (`files.ts`, `buildObjectKey`).
- La importación usa `{carpeta}/{AAAA-MM}/{importacionId}/unidad-{casa}-{sha12}.pdf`.
- No pueden chocar:
  - tienen distinta profundidad;
  - el último segmento de una empieza con dígitos y el de la otra con `unidad-`;
  - la importación publica con `If-None-Match: *`.
- En un conjunto sin `legacyId`, los dos tipos de PDF quedan bajo el mismo `_id`, la carpeta que "Nueva factura" ya usaba.
- Sin cambio y ya documentado (`docs/auditoria-incidentes-vigilancia.md:163`): `files.generateUploadUrl` deja que cualquier sesión elija la carpeta.

### 2.3 Qué se cambió, por componente

| Componente | Archivo | Cambio |
|---|---|---|
| **Backend** | `packages/backend/convex/facturas.ts` | Solo se agrega código, nada se borra. Ver el detalle debajo de la tabla |
| **Rutas** | `apps/web/app/api/facturas/permiso.ts` | `idsDelConjunto(form)` lee `condominioId` y `condominioLegacyId`; una cadena vacía no cuenta. `validarDestino(ids)` llama a `destinoCarga` y traduce la respuesta: `sin_sesion` → 401, `sin_permiso` → 403, `no_coinciden` y `sin_conjunto` → 400, `carpeta_compartida` → 409, error → 500 (401 si es de autenticación). Reemplaza a `rechazoDePermiso` |
| | `upload/route.ts` | Pide `pdf` y al menos un identificador; valida con `validarDestino`. Sigue sin escribir nada |
| | `confirmar/route.ts` | Pide `pdf`, `periodo`, `hash` y al menos un identificador. `iniciarImportacion`, `bulkUpsert` y la llave de S3 usan el `condominioId` y la `carpeta` que devolvió el backend |
| **Finanzas** | `app/condominio/[id]/finanzas/page.tsx` | "Subir facturas" con `condominioData.allowed`, sin `legacyId`. Es la regla que ya abre el área de administración, así que la pantalla no duplica permisos |
| | `components/upload-facturas.tsx` | Sin la prop `condominioLegacyId`; manda `condominioId` |
| **Barra superior** | sin cambios | "Cargar facturas" (inicio del conjunto, barra por defecto y acceso rápido) ya llevaba a `…/finanzas`, que ahora tiene la carga para cualquier conjunto. Solo ve esa barra quien tiene `adminHome.allowed` (`condominio-shell.tsx`), que es la misma regla del botón |
| **Pruebas** | `apps/web/package.json` | `test:facturacion` agrega `cargaPorConjunto` y `finanzasCarga`, cada una en su proceso |

**Backend: lo que agrega `facturas.ts`.**

- **`carpetaDeFacturas(c)`** = `c.legacyId || c._id`. Un `legacyId` vacío cuenta como ausente: así la carpeta nunca es `''`.
- **`destinoCarga({ condominioId?, condominioLegacyId? })`**, una query. Responde `{ allowed: true, condominioId, carpeta }` o `{ allowed: false, motivo }`, sin lanzar errores. Así decide:
  1. **Sesión:** sin sesión, o con el usuario inactivo → `sin_sesion`.
  2. **Identificadores:** si no llega ninguno → `sin_conjunto`.
  3. **Resolución:** `condominioId` se normaliza con `ctx.db.normalizeId`. Un id mal formado, o de otra tabla, da `sin_permiso`, no un error de validación. `condominioLegacyId` busca **todos** los conjuntos con ese `legacyId`. Si no resuelve ninguno → `sin_permiso`.
  4. **Rol:** pide `CARGA_ROLES` (administración y contadora; la plataforma pasa por `requireCondominioRole`) en **cada** conjunto nombrado, antes de mirar si coinciden. Quien no tiene rol en los dos no se entera de nada más.
  5. **Coincidencia:** si llegan los dos identificadores y son de conjuntos distintos → `no_coinciden`.
  6. **Carpeta única:** si otro conjunto tiene la misma carpeta → `carpeta_compartida` (§2.4).

**La confirmación y "una llave de otro conjunto".**

- El cliente nunca manda la llave: la arma la ruta.
- Lo único del formulario que decidía la carpeta era `condominioLegacyId`. Hasta ahora podía apuntar a un conjunto distinto del `condominioId` con el que se escribía; por ejemplo, alguien que administra dos conjuntos publicaba los PDF de uno en la carpeta del otro.
- Ahora la confirmación y la vista previa resuelven igual (`validarDestino`), y esa mezcla se rechaza con 400, antes de S3 y antes de cualquier mutación.

### 2.4 ¿Puede un `_id` chocar con un `legacyId`?

**Se impide en tiempo de ejecución, sin importar el formato.**

- `destinoCarga` compara la carpeta del conjunto con la de **todos** los demás (`legacyId || _id`).
- Si alguna coincide, responde `carpeta_compartida` y la ruta devuelve 409 sin publicar nada.
- Cubre tres casos:
  - un `legacyId` igual al `_id` de otro conjunto;
  - dos conjuntos con el mismo `legacyId`;
  - cualquier otro choque futuro.
- Un choque así no se corrige desde la app: hay que corregir el dato.
- Lo prueba `cargaPorConjunto.test.ts`: en un choque `_id` contra `legacyId`, se rechazan los dos conjuntos; con un `legacyId` repetido, por las dos vías.

**Además, es improbable por formato.**

- Convex genera los `_id`. Llevan suma de verificación, y `normalizeId("condominios", …)` solo acepta un id válido de esa tabla. El de Factory tiene 32 caracteres `[0-9a-z]`.
- Los `legacyId` vienen del sistema anterior, por la migración (`migrations.upsertCondominio`).
- **No se verificó** el formato de los `legacyId` reales: leerlos exige consultar el deployment, y eso está fuera de las reglas de esta tarea. La comprobación en tiempo de ejecución no depende de ese dato.

### 2.5 Pruebas

#### Antes y después

"Antes" es `49b9cb6` con el árbol limpio; "Después", el *working tree*.

| Suite | Antes | Después |
|---|---|---|
| Backend · red (`bun run test:facturacion`) | 55 ✅ | **55 ✅** |
| Backend · convex-test (`vitest run`) | 1.036 ✅ (49 archivos) | **1.087 ✅** (50 archivos, +51) |
| Backend · unitarias (`test:unit`) | 458 ✅ | **458 ✅** |
| Web · `bun run test:facturacion` | 105 ✅: 6 · 15 · 4 · 12 · 18 · 7 · 43 | **123 ✅**: 6 · 15 · 4 · 12 · 18 · 7 · **11 · 7** · 43 |
| Web · red, dentro de lo anterior (`pruebas/facturacion`: `parserFacturas` y `resumenResidente`) | 36 ✅ (24 + 12) | **36 ✅** (24 + 12) |
| Web · todo (`bun run test`) | 242 ✅ | **260 ✅** (+18) |
| `tsc --noEmit`, backend | sin errores | **sin errores** |
| `tsc --noEmit`, web | sin errores | **sin errores** |

- El error conocido de `convex/auth.ts(34,11)` solo aparece al revisar los tipos del móvil, que no cambia.
- Los archivos de la Fase 0 no cambiaron: el `git diff` sobre la red (`estados`, `importacion`, `pagos`, `parqueadero` y `residente` `.test.ts`), `escenario.ts`, `contencion.test.ts`, `apps/web/pruebas/facturacion/` y los fixtures está vacío.

#### Pruebas nuevas

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `packages/backend/pruebas/facturacion/cargaPorConjunto.test.ts` | 51 | **Sin `legacyId`:** administración, contadora y plataforma sí, con la carpeta en el `_id`. Residente, junta, guarda, usuario sin vínculo y administración de otro conjunto, no. Sin sesión → `sin_sesion`. Id inválido o de otra tabla → `sin_permiso`. Sin identificador → `sin_conjunto`. <br>**Con `legacyId`:** lo mismo por `condominioId`, por `condominioLegacyId` y por los dos; la carpeta sigue siendo el `legacyId`. `permisoSubida` responde igual que antes, contadora incluida. <br>**Carpeta:** `legacyId` o `_id`; un `legacyId` vacío no cuenta; choque `_id` contra `legacyId`; `legacyId` repetido. <br>**Dos identificadores:** de conjuntos distintos se rechazan; sin rol en uno de los dos, `sin_permiso`. <br>**`adminHome`:** la fuente de rol de Finanzas abre el área a los mismos roles |
| `apps/web/pruebas/cargaPorConjunto.test.mjs` | 11 | Rutas reales, con S3 y Convex simulados. Pide la llave bajo el `_id` para Factory y la de hoy para el conjunto con `legacyId`. Comprueba que la web anterior y la nueva dan **la misma llave**, que la llamada solo con `condominioLegacyId` sigue funcionando, y que se rechazan: la llave de otro conjunto (400 sin escribir nada, también en la vista previa), la falta de rol en el otro conjunto (403), la falta de identificadores (400 claro, sin consultar a Convex) y la carpeta compartida (409) |
| `apps/web/pruebas/finanzasCarga.test.mjs` | 7 | Finanzas real con la barra superior. "Subir facturas" aparece a la administración, la contadora y la plataforma de un conjunto sin `legacyId`, y no aparece a los demás roles ni mientras carga. La vista previa manda `condominioId` y no `condominioLegacyId`. "Cargar facturas" del inicio lleva a Finanzas, que tiene la carga |

#### Las pruebas nuevas contra el código anterior

- **Backend:** la query no existía.
- **Rutas:** fallan 10 de 11. La que pasa es "la web anterior y la nueva dan la misma llave", que en el código anterior compara dos listas vacías; se reforzó para exigir que haya una llave.
- **Finanzas:** fallan 5 de 7. Las 2 que pasan son guardas de regresión, que deben pasar siempre: "no la ven los demás roles" y "mientras carga, tampoco".
- **Mutaciones en el backend:** cambiar `||` por `??` en la carpeta, o quitar la comprobación de coincidencia, hace fallar la prueba respectiva.

#### Byte por byte

Una sonda temporal, ya borrada, confirmó con el formulario de la web anterior (los dos identificadores) sobre el código anterior y sobre el nuevo:

- 4 PDF de los fixtures: `cdc-control`, `cdc-consolidado-con-continuacion`, `arboleda-saldo-a-favor` y `cdc-nota-credito`, con 5 facturas;
- las llaves de S3, los `pdfUrl` y el `condominioId` de cada mutación salieron **idénticos**. Ejemplo: `condominios/facturas/conjunto-de-prueba/2026-04/imp1/unidad-999-82542ac6e800.pdf`.

#### Cambios en pruebas existentes

Ninguno es de la Fase 0. Cambian los dobles; las aserciones sobre llaves y respuestas no cambian:

- `apps/web/pruebas/subidaFacturas.test.mjs`: la consulta esperada pasa de `facturas:permisoSubida` a `facturas:destinoCarga`, con los mismos argumentos (`{ condominioLegacyId: "conjunto-de-prueba" }`).
- `apps/web/pruebas/confirmarFacturas.test.mjs` y `confirmarFacturasFase3.test.mjs`: el Convex simulado responde como `destinoCarga`, con `{ allowed: true, condominioId: "condo-1", carpeta: "conjunto-de-prueba" }` en lugar de `{ allowed: true }`. Sus aserciones sobre la llave (`condominios/facturas/conjunto-de-prueba/…`) no cambiaron y siguen en verde.

### 2.6 Alternativa: asignar `legacyId` al crear conjuntos

**No se implementó.** Es una decisión del responsable.

**Pros:**

- No cambian las rutas ni la regla de la carpeta.
- La **web publicada hoy** cargaría PDF en ese conjunto sin desplegar la web; solo con el backend.

**Contras:**

- **Le cambia el significado al campo.** `legacyId` es "el id en el sistema anterior": lo usan la migración (`upsertCondominio`) y la lectura de los PDF históricos. Un conjunto nuevo con `legacyId` se ve como migrado.
- **Exige backfill** para Factory y para cualquier conjunto ya creado. Es una escritura de datos en el deployment de los residentes.
- **Sigue faltando la unicidad.** No hay índice por `condominios.legacyId`, y un valor inventado puede chocar con uno del sistema anterior.
- **Más pantalla y más mutaciones.** `condominios.update` tendría que aceptarlo y alguien tendría que asignarlo; el error humano vuelve a dejar un conjunto sin carga.
- **No corrige** que la confirmación aceptara dos identificadores de conjuntos distintos.

**Recomendación:** la solución implementada. No toca datos, sirve para cualquier conjunto presente o futuro y mantiene las llaves de los migrados.

### 2.7 Orden de despliegue y compatibilidad

**Orden: 1) backend (Convex) → 2) web. El móvil no cambia.**

| Combinación | Qué pasa |
|---|---|
| **Backend nuevo + web actual** | Funciona como hoy. El cambio del backend solo agrega una query: `permisoSubida` y `adminHome` (con `condominio.legacyId`) siguen iguales, y lo prueban `contencion.test.ts` y `cargaPorConjunto.test.ts`. Factory sigue sin carga hasta desplegar la web |
| **Web nueva + backend sin `destinoCarga`** | **No usar.** Finanzas muestra "Subir facturas" en todos los conjuntos, pero la vista previa y la confirmación responden 500 ("No fue posible validar tu sesión") antes de leer o escribir. No se publica nada |
| **Pestaña abierta con la web anterior durante el despliegue** | Sigue funcionando. Manda `condominioLegacyId` en la vista previa y los dos identificadores al confirmar, y las rutas nuevas lo aceptan, con la misma llave |
| **Móvil** | Sin cambios: no carga PDF de facturas por esta vía |
| **Datos** | Ninguna escritura, migración ni backfill |

**Antes de desplegar:**

- "Desplegar el backend" hoy es escribir en `agreeable-bee-782`, el deployment de los residentes (`packages/backend/.env.local` tiene su deploy key).
- Además, el backend se despliega entero: este cambio va encima de lo que la Fase 4 haya dejado sin desplegar. El plan consolidado está en `docs/audits/FASE-4-FACTURACION.md` §9.
- `permisoSubida` queda sin uso en la web nueva. Se puede retirar cuando no quede ninguna web anterior publicada, no antes.

### 2.8 Qué falta para retomar la QA de carga de PDF en Factory

1. **Decidir y desplegar:** el backend y después la web (§2.7), en el entorno donde corre la QA.
2. **Entrar** con la administración o la contadora de Factory (`factoryadmincondominio+contadora@gmail.com`). El inicio de sesión lo hace la persona.
3. **Cargar en orden** desde Finanzas → "Subir facturas" los PDF de `qa/factory/pdfs/`: `factory-2026-08.pdf`, `factory-2026-09.pdf` y `factory-2026-10.pdf`. Los de `pdfs/despues/` son para después de registrar los pagos.
   - Ya se leyeron en local con el lector real (`qa/factory/leer-pdf.ts`, solo lectura), y la vista previa debería mostrar exactamente esto:

     | PDF | Unidad | Total | Lectura |
     |---|---|---|---|
     | `factory-2026-08.pdf` | 103 | $335.000 | Cuadra |
     | | 105 | $335.000 | Cuadra |
     | `factory-2026-09.pdf` | 101 | $335.000 | Cuadra |
     | | 104 | $355.000 | **En revisión** (`lineas_no_cuadran`, `totales_no_cuadran`), a propósito |
     | | 105 | $670.000 | Cuadra |
     | `factory-2026-10.pdf` | 102 | $335.000 | Cuadra |

   - Según la QA anterior, Factory ya tiene las unidades 101 a 105 (casas A a E), así que el emparejamiento debería ser por número exacto. No se volvió a verificar: exige leer el deployment.
4. **Comprobar la llave en S3:** `condominios/facturas/j570ttbjpy06q0nnd6k15gnxbx8fxvcz/{período}/{importacionId}/unidad-{casa}-{sha12}.pdf`. El bucket `vekino` es de lectura pública; los PDF son sintéticos.
5. **Pendiente de la QA anterior:** vincular las arrendatarias a la 102 desde el portal del propietario B antes de probar sus casos.
