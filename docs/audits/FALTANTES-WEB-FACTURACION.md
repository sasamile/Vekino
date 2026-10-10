# Faltantes de la web de facturación — QA en Factory

La QA de facturación en el conjunto de prueba **Factory** (`j570ttbjpy06q0nnd6k15gnxbx8fxvcz`), sobre `0cf972d` (Fase 4), se detuvo por dos faltantes de la web. Cada hallazgo va en su propia sección.

---

## Hallazgo 1 — El residente envía comprobantes de pago desde la web

> **Estado:** cambios en el *working tree* sobre `eec271c`. Sin commit, sin despliegue, sin escrituras en Convex ni en S3. Ningún comando de Convex se ejecutó.
>
> **Dos rondas.** La primera versión subía el archivo desde el navegador, igual que el móvil (`generateUploadUrl` + `PUT` + `crearMio`). La revisión encontró que dejaba cinco huecos, y en la segunda ronda la subida pasó al backend. Esta sección describe el estado final; los resultados de la primera versión quedan solo donde sirven de comparación.
>
> **Punto de partida:** el Hallazgo 2 ya estaba en `eec271c` cuando empezó la primera ronda (el encargo decía que estaba sin commit). De sus archivos, este hallazgo solo toca una línea de `apps/web/package.json`, autorizada en la segunda ronda, y agrega esta sección a este documento.

### 1.1 Resumen

**Qué pasaba.** En las páginas del residente no había forma de enviar un comprobante; solo desde el móvil o por WhatsApp. La QA de Factory se detuvo ahí.

**Qué se hizo.**

- **Un componente único**, `ComprobantePago`, en "Mis facturas" (en la fila de cada factura) y en el inicio (en la tarjeta de la deuda, junto a "Pagar ahora"):
  - el botón "Ya pagué, enviar comprobante" sale con `opcionesDePago.debe`, aunque la pasarela no acepte la unidad, y se oculta con un comprobante en revisión (`listMios`);
  - el formulario pide monto (formato colombiano), fecha (el día de Colombia, sin futuras), foto o PDF (con cámara en el celular) y una nota opcional;
  - "Mis comprobantes" por factura: estado, monto, fechas y motivo del rechazo.
- **Una acción nueva, `soportesPago.enviarMio`**, que recibe el archivo y los datos y hace todo en el servidor: valida con las reglas de `crearMio`, revisa el archivo por su contenido, sube con una llave del servidor, registra revalidando, y si el registro falla borra la llave que acaba de crear. El navegador ya no habla con el bucket.
- **`crearMio` (el móvil) valida la URL**: solo acepta archivos del bucket de Vekino bajo la carpeta de comprobantes del mismo conjunto.
- **Bordes de error en el portal del residente:** si falla una consulta, la página muestra un mensaje dentro del portal; si falla `opcionesDePago`, el comprobante se oculta y los botones de pago dejan una nota, sin tumbar la factura ni la página.
- **La suite web entra en `test:facturacion`.**

**Resultado.**

- La red sigue en verde: 55 en el backend y 36 en la web. `tsc` sin errores en los dos.
- Pruebas del hallazgo: 47 en la web y 37 en el backend (30 de la segunda ronda y 7 de la primera). Fallan con el código anterior y detectan los 23 defectos principales introducidos a propósito (§1.9).
- `crearMio` conserva su comportamiento para todo lo que hoy le manda el móvil: las pruebas existentes siguen en verde **sin modificarlas**, y la validación de URL se probó con las URL que produce el `generateUploadUrl` real (§1.6).
- **Antes de desplegar:** que `AWS_S3_BUCKET_NAME` esté definida en el deployment, porque sin ella la validación de URL no se activa (§1.6).

### 1.2 Lo verificado antes de tocar código

#### El flujo del móvil y de qué dato sale cada condición (primera ronda)

**El móvil, punto por punto** (`apps/mobile/src/app/(app)/(tabs)/facturas.tsx`). La web no copió sus defectos; se corrigen en un hallazgo aparte:

| Punto | Móvil | Web | ¿Defecto en el móvil? |
|---|---|---|---|
| Monto escrito → número | `Number(texto.replace(/[^\d]/g, ""))` (`:1147`): "150.000" → 150000 | `leerMontoCOP` (`lib/comprobante-pago.ts`): puntos de miles, `$`, "150,000" y centavos en cero. Lo ambiguo se rechaza con un mensaje | **Sí.** "150.000,00" → 15.000.000; "1.500.000,50" → 150.000.050; "150.5" → 1505. El teclado `number-pad` casi no deja escribir separadores, así que pasa sobre todo al pegar |
| Fecha → `fechaPago` | Texto "AAAA-MM-DD"; envía `Date.parse(\`${fecha}T12:00:00-05:00\`)`, el mediodía de Colombia | Igual, con "hoy" en UTC−5 fijo y un selector con `max` = hoy en Colombia | **Sí, dos.** Desde las 12:00 de Colombia, "mañana" cabe en la holgura de 24 h de `crearMio`. "2026-02-31" se corre al 3 de marzo (V8; en Hermes no se verificó) |
| Tipos | Galería o PDF; el `mimeType` lo dice el selector | JPG, PNG, WebP o PDF, **según los primeros bytes**, en el backend | En iOS la galería puede entregar HEIC, que la administración no ve (no verificado en un iPhone) |
| Si `crearMio` rechaza | El archivo queda en el bucket | El archivo no se sube; si el rechazo llega después de subir, se borra (§1.3) | Sí (archivos huérfanos) |

**De qué dato del backend sale cada condición** (la pantalla no calcula ninguna):

| Condición | Dato |
|---|---|
| Que la factura sea la vigente | `opcionesDePago.debe` (`motivoNoPagable` → `"historica"`) |
| "En revisión" | `opcionesDePago.debe` (`"en_revision"`) |
| "Pago en verificación" | `opcionesDePago.debe` (`"pago_en_verificacion"`) |
| Un comprobante pendiente | `listMios` (`estado === "pendiente_revision"` con el mismo `facturaId`). No está en `debe`: con uno en revisión la factura se sigue debiendo |
| Vínculo vigente con la unidad | `opcionesDePago.debe` (`armarDatosTrn`: membresía activa y `vigentes(links)`). Además `listMia` y `listMios` filtran por `misUnidadIds` |

La pantalla solo usa el período para no **preguntar** por las históricas (`vigente={false}`); si se equivocara, `debe` diría que no.

#### Lo que la segunda ronda necesitaba saber

**1. Cómo sube el bot de WhatsApp** (`whatsapp.ts`, `procesarComprobante`):

| Paso | Función |
|---|---|
| Descargar la foto o el documento de YCloud | `files.uploadFromUrl` (acción interna Node). Solo HTTPS, sin hosts privados; la clave de YCloud viaja solo a YCloud; hasta 25 MB |
| Subirlo a S3 | La misma `uploadFromUrl`: `PutObjectCommand` con la llave de `buildObjectKey`, en la carpeta `comprobantes/{condominioId}` |
| Registrar el comprobante | `soportesPago.crearDesdeBot`, una mutación **interna** propia. **No usa `crearMio`** |

La subida a S3 de `uploadFromUrl` y de `uploadBytes` se extrajo a una sola función, `subirAlBucket` (`files.ts`), y la nueva subida de comprobantes la usa (§1.3).

**2. Cómo recibe los bytes `uploadBytes`.** Con `v.bytes()`: un `ArrayBuffer`, que el cliente de Convex manda en JSON como `{"$bytes": "<base64>"}` (`convex/values`, `jsonToConvex`). El código limita a 15 MB "por los argumentos de las acciones", **pero es una acción Node**, y Convex documenta que **las acciones Node solo aceptan 5 MiB de argumentos** (ver el punto 3). Según ese límite documentado (no se probó contra un deployment), hoy un archivo de entre 5 y 15 MB que pase por `uploadBytes` falla, y la web cae al `PUT` desde el navegador (`lib/upload-s3.ts`). Lo mismo afecta a `incidenteArchivos.subir` (Node, hasta 15 MiB). Queda fuera de este hallazgo (§1.10).

**3. Los límites de Convex** (documentación oficial, `docs.convex.dev/production/state/limits` y `/functions/runtimes`):

| | Argumentos | Memoria |
|---|---|---|
| Acción del runtime de Convex (normal) | **16 MiB** | 64 MB |
| Acción Node | **5 MiB** | 512 MB |
| Acción HTTP | Sin límite de cuerpo de la petición | 64 MB (corre en el runtime de Convex) |

La documentación no dice si los 16 MiB se miden sobre el valor o sobre el JSON. Las dos cuentas caben: 10 MiB son 10 MiB como valor y 13,3 MiB en base64. A una acción Node no le caben ni en el mejor caso.

**4. El formato exacto de las URL públicas.** `files.ts`: `https://{AWS_S3_BUCKET_NAME}.s3.{AWS_REGION ?? "us-east-1"}.amazonaws.com/{llave}`, con la llave `{carpeta saneada}/{Date.now()}-{8 hex de un UUID}-{nombre saneado}`. El nombre saneado solo tiene `[A-Za-z0-9._-]`, hasta 120 caracteres, y puede quedar vacío.

| Quién | Carpeta | Desde |
|---|---|---|
| Móvil → `crearMio` | `condominios/soportes/{condominioId}` (el mismo `condominioId` que manda a `crearMio`) | `3123089` (9 de agosto), la versión que agregó el envío. Ninguna versión usó otra carpeta |
| Bot → `crearDesdeBot` | `comprobantes/{condominioId}` | — |

Entre `3123089` y hoy, `buildObjectKey` solo cambió cómo se sanea la carpeta (`sanitizeFolder`), y esa carpeta queda igual con cualquiera de las dos versiones. `publicUrlFor` no cambió.

**5. Un conflicto que decide un detalle del diseño.** `escenario.ts` (Fase 0, no se puede modificar) aprueba comprobantes llamando a `crearMio` con `https://archivos.test/comprobante.pdf`, y las pruebas existentes de `modeloPagos` usan `https://archivos.test/c.jpg`. Si `crearMio` rechazara toda URL que no sea del bucket, la red de la Fase 0 dejaría de estar en verde. Por eso la validación compara contra el bucket configurado y **no se activa sin `AWS_S3_BUCKET_NAME`** (§1.6).

**Ninguna condición para detenerse se cumplió:** la extracción no cambia lo que responde `crearMio`; una acción normal recibe 10 MB; y la validación acepta todo lo que el móvil puede mandar hoy (el bot no pasa por `crearMio`).

**Funciones del backend de las que depende la web:**

| Función | Tipo | Desde | Para qué |
|---|---|---|---|
| `soportesPago.enviarMio` | action | **Esta ronda** | Enviar el comprobante |
| `soportesPago.listMios` | query | Antes de la auditoría; `monto` y `fechaPago` desde la **Fase 3** | "Mis comprobantes" y ocultar el botón |
| `pagos.opcionesDePago` | query | **Fase 4** (`0cf972d`) | Mostrar el botón |
| `facturas.listMia`, `portal.home` | query | Ya las usaban estas páginas | — |

La web **ya no** llama a `files.generateUploadUrl` ni a `soportesPago.crearMio` para el comprobante.

### 1.3 El diseño final

**`soportesPago.enviarMio({ condominioId, facturaId, monto, fechaPago, nota?, nombreArchivo?, archivo: bytes })`**, una acción del runtime de Convex:

1. **Valida antes de subir nada.** El tipo sale de los primeros bytes (`tipoPorContenido`: JPEG `FF D8 FF`, PNG, WebP `RIFF…WEBP`, PDF `%PDF-`). Una consulta interna (`validarEnvioMio`) corre las reglas de `crearMio` en su orden, con el archivo en el lugar donde `crearMio` revisa la URL:
   1. sesión;
   2. unidades con vínculo vigente;
   3. el archivo: no vacío, hasta 10 MB, de un tipo permitido;
   4. monto mayor que 0 y fecha no futura;
   5. factura de una unidad suya;
   6. la vigente;
   7. ninguno en revisión.

   Si algo falla, el mensaje es el mismo que daría `crearMio` y no se sube nada.
2. **Sube a S3.** El archivo pasa a una acción interna Node, `files.subirComprobante`, que lo sube con `subirAlBucket`: la carpeta `condominios/soportes/{condominioId}` y la llave (`{timestamp}-{8 hex aleatorios}-{nombre}`) las decide el servidor, y el `ContentType` es el tipo detectado.
   - **El archivo cruza a Node por el almacenamiento interno de Convex** (`ctx.storage`), no como argumento: a una acción Node no le caben 10 MB. Ese objeto temporal es privado y se borra al terminar, salga bien o mal (`finally`).
3. **Registra** con una mutación interna, `registrarEnvioMio`, que **vuelve a correr las mismas reglas** (y valida la URL que armó el servidor). Entre el paso 1 y este pudo entrar otro comprobante, cargarse una factura nueva o vencerse el vínculo. Guarda `origen: "web"`, que el esquema ya admitía.
4. **Si el registro falla después de subir**, borra con `files.deleteObjectInternal` la llave que devolvió el paso 2 en esta misma llamada. No hay otra forma de que le llegue una llave.

**Las reglas no se duplican.** El cuerpo de `crearMio` se extrajo a `validarComprobanteMio(ctx, datos, validarArchivo)`, que usan `crearMio`, `validarEnvioMio` y `registrarEnvioMio`. El archivo y la URL viven en un módulo puro, `convex/lib/comprobantes.ts`, que también usa la web (`@vekino/backend/comprobantes`) para el límite y los tipos.

**Por qué una acción normal, y no una HTTP ni una Node:**

| Opción | Por qué sí o no |
|---|---|
| Acción Node que reciba los bytes | **No:** 5 MiB de argumentos |
| **Acción normal** que reciba los bytes y pase a Node por el almacenamiento interno | **Sí.** 10 MiB caben en los 16 MiB (13,3 MiB si se miden en base64), con unos 2,7 MiB de margen en el peor caso. El cliente la llama con `useAction`, con la sesión de siempre: no hay CORS, ni token que manejar, ni ruta nueva. Reusa el código Node de S3 tal cual |
| Acción HTTP | Sin límite de cuerpo, pero corre en el mismo runtime (tampoco puede usar el código Node de S3 sin el mismo salto), y obliga a manejar en el navegador el token de Convex, el CORS de `*.convex.site` y una ruta nueva en `http.ts`. Solo valdría la pena para archivos de más de unos 12 MB |
| Subir S3 desde el runtime de Convex, sin Node | El SDK de AWS no se probó en ese runtime, y no se puede probar sin desplegar |

**Memoria:** el runtime de Convex tiene 64 MB. En el peor caso conviven el texto base64 mientras se decodifica (13,3 MiB), el argumento (10 MiB) y el `Blob` del almacenamiento (10 MiB): unos 34 MiB.

**Qué se reutilizó:**

| De | Qué |
|---|---|
| El bot (`uploadFromUrl`) y `uploadBytes` | La subida a S3: cliente, llave (`buildObjectKey`), `PutObjectCommand` y URL pública, extraídas a `subirAlBucket`. Las dos funciones la usan ahora, con el mismo resultado (lo prueban dos pruebas nuevas) |
| `files.deleteObjectInternal` | El borrado de la llave propia |
| `crearMio` | Sus reglas, extraídas a `validarComprobanteMio` |
| Incidentes (`lib/incidenteEvidencias.ts`) | La idea de mirar los primeros bytes |
| `components/ui/error-boundary.tsx` | Los tres bordes de error |

### 1.4 Qué hueco cierra cada cambio

| Hueco | Cambio | Estado |
|---|---|---|
| 1. CORS sin verificar para el `PUT` desde la web | El navegador ya no habla con S3: manda el archivo a `enviarMio` con `useAction` | **Cerrado** para la web. El móvil no tiene CORS |
| 2. `crearMio` acepta cualquier URL | Valida bucket, conjunto y formato exacto de la llave (§1.6). `enviarMio` arma la URL en el servidor | **Cerrado** con `AWS_S3_BUCKET_NAME` definida (§1.6) |
| 3. El cliente elige la carpeta | En la web la decide el servidor | **Cerrado en la web.** En el móvil sigue (`generateUploadUrl` recibe la carpeta), fuera de alcance. Ahora `crearMio` rechaza un archivo de otra carpeta, así que esa elección ya no basta para registrar un comprobante |
| 4. Archivos huérfanos | Valida antes de subir; si el registro falla, borra su llave; el objeto temporal se borra siempre | **Reducido.** Queda el caso de la acción cortada entre subir y registrar (tiempo límite o caída), y el móvil igual que antes (§1.10) |
| 5. La suite web no corría en ningún script | `test:facturacion` la incluye en su propio proceso | **Cerrado**: 123 → 170 y 260 → 307 |
| Sin borde de error en el portal | Borde en el contenido del portal y en el comprobante y los botones de pago | **Cerrado** (§1.5) |
| La administración no distinguía la web del móvil | `origen: "web"` y la etiqueta "Web" en "Comprobantes" | **Cerrado** |

### 1.5 Qué se cambió, por componente

| Componente | Archivo | Cambio |
|---|---|---|
| **Módulo compartido** (nuevo) | `packages/backend/convex/lib/comprobantes.ts` | Límite (10 MB), tipos, `tipoPorContenido`, `exigirArchivoComprobante`, `carpetaComprobantes`, `bucketPublico`, `urlPublica`, `esUrlDeComprobante` y los mensajes estables. Exportado como `@vekino/backend/comprobantes` (`packages/backend/package.json`) |
| **Comprobantes** | `packages/backend/convex/soportesPago.ts` | `validarComprobanteMio` (extraída de `crearMio`) y `exigirUrlDeComprobante`. `crearMio` las usa. Nuevas: `validarEnvioMio` (consulta interna), `registrarEnvioMio` (mutación interna) y `enviarMio` (acción). `exigirVigente` acepta también una consulta |
| **Archivos** | `packages/backend/convex/files.ts` | `subirAlBucket` (extraída de `uploadBytes` y `uploadFromUrl`, que ahora la usan) y la acción interna `subirComprobante`. La URL pública sale de `urlPublica`, la misma que usa la validación |
| **Componente** | `apps/web/components/portal/comprobante-pago.tsx` | Una llamada a `enviarMio` con los bytes. Sin `generateUploadUrl`, `PUT`, `crearMio` ni progreso por etapas. Envuelto en un borde que lo oculta si falla una de sus consultas |
| **Reglas de formulario** | `apps/web/lib/comprobante-pago.ts` | Solo ayuda: `problemaDeArchivo` con el límite y los tipos del backend. Ya no define el límite ni los tipos ni elige el `mimeType` |
| **Botones de pago** | `apps/web/components/portal/portal-pay-button.tsx`, `PayButton` en `app/mi/[id]/cuenta/page.tsx` | Envueltos en un borde: si `opcionesDePago` falla, "No se pudo consultar el pago en línea. Intenta más tarde." |
| **Portal** | `apps/web/components/portal/portal-error-boundary.tsx` (nuevo), `app/mi/[id]/layout.tsx` | El contenido de todas las páginas de `mi/[id]` va dentro de un borde: si una consulta falla, "No se pudo cargar esta sección" con "Reintentar", y el menú del portal a la vista. Se reinicia al cambiar de página |
| **"Mis facturas" e inicio** | `app/mi/[id]/cuenta/page.tsx`, `app/mi/[id]/page.tsx` | El componente, como en la primera ronda |
| **Administración** | `app/condominio/[id]/comprobantes/page.tsx` | Etiqueta "Web" para `origen: "web"` (el tipo ya lo admitía) |
| **Scripts** | `apps/web/package.json` | `test:facturacion` agrega `bun test pruebas/comprobanteResidente.test.mjs`, en su propio proceso |
| **Pruebas** | `packages/backend/pruebas/facturacion/enviarComprobante.test.ts` (nueva), `apps/web/pruebas/comprobanteResidente.test.mjs` | §1.9 |

No se tocaron el móvil, los archivos de la Fase 0 ni los del Hallazgo 2 (salvo la línea de `package.json`).

### 1.6 La validación de URL en `crearMio` y el móvil publicado

**Qué acepta.** Exactamente `https://{AWS_S3_BUCKET_NAME}.s3.{AWS_REGION ?? "us-east-1"}.amazonaws.com/condominios/soportes/{condominioId}/{tramo}`, donde:

- el prefijo se arma con la misma función que arma la URL que devuelve `generateUploadUrl` (`urlPublica`), y con el mismo `condominioId` que recibe `crearMio`;
- `tramo` cumple `^\d{13}-[0-9a-f]{8}-[A-Za-z0-9._-]{0,120}$`: el formato de `buildObjectKey`, de un solo tramo.

Es una comparación de texto, sin normalizar la URL. Como el tramo no admite `/`, `?`, `#` ni `%`, no pasan `..` como tramo, dobles barras, consultas ni caracteres codificados. Un nombre como `pago..pdf` sí pasa: esos puntos son parte del nombre, no un tramo de la ruta.

**Mensaje estable:** "El archivo del comprobante no es válido: envíalo de nuevo desde la app." Va en el lugar donde `crearMio` siempre revisó la URL, después del vínculo y antes del monto. Una URL vacía sigue respondiendo "Falta el archivo del comprobante."

**⚠ Afecta al móvil publicado desde el momento en que se despliegue el backend.** El móvil no tiene OTA, así que la validación tiene que aceptar lo que mandan **todas** sus versiones instaladas. Lo comprobado:

1. **Historia del código del móvil:** desde `3123089` (9 de agosto, cuando apareció el envío), todas las versiones de `facturas.tsx` usan `folder: \`condominios/soportes/${condominioId}\`` y mandan a `crearMio` la `publicUrl` de `generateUploadUrl`, con el mismo `condominioId`. No hay otra carpeta en la historia.
2. **Historia del formato:** entre `3123089` y hoy, `buildObjectKey` y `publicUrlFor` no cambiaron el formato de esa URL. La única diferencia, `sanitizeFolder`, deja igual esa carpeta, porque los `_id` de Convex son `[0-9a-z]`.
3. **Prueba con el código real:** se llama al `generateUploadUrl` real (con S3 y el firmador simulados) y su `publicUrl` se manda a `crearMio`, con los nombres que dan los celulares: `IMG_0001.JPG`, `1000012345.jpg`, `Comprobante PSE (1).pdf`, `pago..pdf`, `ñandú – septiembre.jpeg`, `日本.jpg`, un nombre de solo espacios, uno de 300 caracteres y ninguno. Todas se aceptan.
4. **El bot no pasa por `crearMio`:** usa `crearDesdeBot`, sin esta validación. Una prueba confirma que sigue registrando con su carpeta `comprobantes/…`.
5. **Las variables:** la validación lee `AWS_S3_BUCKET_NAME` y `AWS_REGION` del deployment de Convex, las mismas con que `generateUploadUrl` arma la URL. Si son las mismas, coinciden por construcción.

**Lo que no se pudo comprobar:** el valor real de esas variables en `agreeable-bee-782` (leerlo exige la CLI de Convex). Si `AWS_S3_BUCKET_NAME` no estuviera definida, `generateUploadUrl` tampoco firmaría y el móvil no podría subir nada; y la validación quedaría **inactiva** (acepta, como antes).

**Por qué inactiva y no cerrada sin la variable:** las pruebas de la Fase 0 (`escenario.ts`) y las de `modeloPagos` llaman a `crearMio` con URL de mentira, y no se pueden modificar. Esa es la única condición para que no valide. Se prueban los dos casos: con la variable rechaza todo lo que no corresponde; sin ella acepta, como antes.

### 1.7 Diferencias con el móvil

| Tema | Móvil | Web |
|---|---|---|
| Subida | `generateUploadUrl` + `PUT` + `crearMio`; la carpeta la elige la app | Una llamada a `enviarMio`; carpeta, llave y URL las decide el servidor |
| Tipo del archivo | El que dice el selector | El de los primeros bytes |
| Tamaño | Sin límite | 10 MB |
| Si el registro falla | El archivo queda en el bucket | Se borra la llave de esa llamada |
| Monto | Quita lo que no es dígito | Formato colombiano; lo ambiguo se rechaza |
| Fecha | Texto libre; acepta "mañana" después del mediodía y fechas inexistentes | Selector sin fechas futuras; las inexistentes y las futuras se rechazan antes de enviar |
| Cámara | Solo galería o PDF | "Tomar foto" o "Elegir archivo" |
| Nota | No la manda | Opcional |
| Estado | Solo el último comprobante | Todos los de la factura, con monto, fechas y motivo |
| Errores | Texto entero del cliente de Convex | Solo la frase del backend |
| Origen | `"app"` | `"web"` |

**Sin diferencia:** la carpeta, la fecha al mediodía de Colombia, la sugerencia del monto (`montoAPagarHoy`) y la regla del botón (`debe` y ninguno pendiente).

### 1.8 Límites de archivo

**Los decide el backend** (`lib/comprobantes.ts`):

| Límite | Valor | Por qué |
|---|---|---|
| Tipos | JPEG, PNG, WebP o PDF, por los primeros bytes | La pantalla "Comprobantes" pinta con `<img>` lo que empiece por `image/` y con "Ver PDF" lo demás. HEIC no se ve en Chrome ni en Firefox; GIF, Word u otro documento se anunciarían como PDF |
| Tamaño | 10 MB (10.485.760 bytes; exactos se aceptan) | Una foto de celular pesa 2–6 MB y el PDF de un banco menos de 1 MB. Es el límite de los adjuntos de soporte de la web. Cabe como argumento de una acción normal con margen (§1.3) |
| Vacío | No | — |

Mensajes estables del backend: "El archivo del comprobante está vacío.", "El archivo del comprobante pesa más de 10 MB." y "El comprobante debe ser una foto JPG, PNG o WebP, o un PDF."

**La web solo ayuda:** antes de mandar 10 MB avisa con mensajes más concretos (por ejemplo, "Las fotos HEIC no se pueden revisar en la web. Usa «Tomar foto»…" o "El archivo pesa 14,3 MB…"), con el tipo que declara el navegador. Si un archivo dice ser otra cosa (un HEIC renombrado `.jpg`), la ayuda lo deja pasar y el backend lo rechaza por su contenido, con su mensaje.

**Limitación:** un PDF válido cuya cabecera no esté en el primer byte (la especificación la permite dentro del primer kilobyte) se rechaza. Los PDF de los bancos empiezan con `%PDF-`. Es la misma regla de la evidencia de incidentes.

### 1.9 Pruebas

#### Antes y después

"Antes" es el *working tree* de la primera ronda (sobre `eec271c`); "Después", el de esta.

| Suite | Antes | Después |
|---|---|---|
| Backend · red (`bun run test:facturacion`) | 55 ✅ | **55 ✅** |
| Backend · convex-test (`vitest run`) | 1.094 ✅ (51 archivos) | **1.124 ✅** (52 archivos, +30) |
| Backend · unitarias (`test:unit`) | 458 ✅ | **458 ✅** |
| Web · `bun run test:facturacion` | 123 ✅: 6 · 15 · 4 · 12 · 18 · 7 · 11 · 7 · 43 | **170 ✅**: 6 · 15 · 4 · 12 · 18 · 7 · 11 · 7 · **47** · 43 |
| Web · red, dentro de lo anterior (`parserFacturas` y `resumenResidente`) | 36 ✅ (24 + 12) | **36 (24 + 12) ✅** |
| Web · todo (`bun run test`) | 260 ✅ | **307 ✅** |
| Web · suite del comprobante, sola | 39 ✅ | **47 ✅** |
| `tsc --noEmit`, backend | sin errores | **sin errores** |
| `tsc --noEmit`, web | sin errores | **sin errores** |

- Los archivos de la Fase 0 no cambiaron (`git diff` vacío).
- Las pruebas existentes de `crearMio` (`modeloPagos`, `estados` con `escenario.ts`, `comprobanteWeb`) siguen en verde **sin modificarlas**.
- Las suites que montan "Mis facturas" y el inicio (`fase4Facturacion`, `fase3Residente`, `resumenResidente`) siguen en verde sin cambios.

#### Pruebas nuevas y ajustadas

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `packages/backend/pruebas/facturacion/enviarComprobante.test.ts` (nuevo) | 30 | Con S3 simulado (`vi.mock`, como `incidentesFase5`) y la red bloqueada.<br>**Tipo por contenido** (1).<br>**Envío correcto (3):** llave bajo la carpeta del conjunto, `ContentType` detectado (una foto llamada `.pdf` se guarda como JPEG), el comprobante con monto, fecha, factura, unidad, usuario, URL, nota y `origen: "web"`; el almacenamiento temporal queda vacío; justo 10 MB.<br>**Rechazos con cero llamadas a S3 (15):** sin sesión, sin vínculo, arrendataria vencida, vecino, histórica, uno pendiente, monto 0 y negativo, fecha futura; archivo vacío, de más de 10 MB, que dice ser PDF y no lo es, y HEIC. En los casos que `crearMio` también tiene, **se manda lo mismo a `crearMio` y se compara el mensaje**, y dos casos fijan el orden.<br>**Carreras (3):** otro comprobante entra mientras se sube → rechazo, y se borra solo esa llave; dos envíos a la vez → uno queda y el otro borra la suya, no la del que quedó; si S3 falla, no se registra ni se borra nada.<br>**URL en `crearMio` (5):** acepta el formato real de `generateUploadUrl` con nueve nombres; recorta espacios como antes; rechaza 17 variantes (otro conjunto, otro bucket, otra región, dominio externo o parecido, `http`, `..`, `//`, subcarpeta, `?`, `#`, `%2F`, la carpeta del bot, tramo vacío, `javascript:`); sin bucket configurado acepta; la URL vacía sigue con su mensaje.<br>**Bot y `uploadBytes` (2):** misma llave, mismo tipo y `crearDesdeBot` sin cambios.<br>**Fecha (1):** a las 23:00 de Colombia, el mediodía de hoy se acepta |
| `apps/web/pruebas/comprobanteResidente.test.mjs` | 47 (39 → 47) | Las 39 de la primera ronda, ajustadas solo en la simulación de la subida: el Convex simulado responde `enviarMio` en lugar de `generateUploadUrl`/`crearMio`, y `generateUploadUrl`, `crearMio`, `XMLHttpRequest` y `fetch` quedan como trampas que la prueba revisa (`sinCaminoViejo`).<br>**Nuevas (8):** tres rechazos del archivo por el backend (tipo por contenido, vacío, más de 10 MB) mostrados tal cual; y cinco de bordes: si `opcionesDePago` falla, el comprobante se oculta y la factura y la página siguen ("Mis facturas" e inicio), con la nota en los botones de pago; con portal del banco "Pagar" sigue; si `listMios` falla, igual; si la página entera falla, el portal muestra el mensaje con el menú a la vista, y "Reintentar" vuelve a pintar la página; y el aviso no se queda pegado al cambiar de página |

**Una prueba con una limitación de convex-test.** En "dos envíos a la vez" no se revisa el almacenamiento temporal. convex-test tiene **una** transacción global: el borrado que hace una acción mientras la mutación de la otra está abierta se deshace con el *rollback* de esa mutación, y queda un objeto. En Convex cada operación es independiente. La limpieza la prueban los casos de una sola llamada.

#### Las pruebas nuevas contra el código anterior

En una copia fuera del repo, borrada al terminar:

| Variante | Resultado |
|---|---|
| Backend de `eec271c` | **La suite no carga:** `lib/comprobantes` no existe |
| Backend de `eec271c` con solo el módulo nuevo `lib/comprobantes.ts` | **Fallan 23 de 30.** Pasan las 7 que deben pasar también antes: el tipo por contenido (puro), las que aceptan el formato real del móvil y los espacios, "sin bucket acepta", la URL vacía, y las dos del bot y `uploadBytes` |
| Web de la primera ronda (subida desde el navegador, sin bordes) | **Fallan 22 de 46:** todas las que envían (el componente pide la URL firmada, y la trampa la rechaza), las de rechazos y las de bordes. Pasan las de visibilidad, formato y límites, que no cambiaron de comportamiento. La prueba 47 se agregó después y se comprobó con el defecto E3 |

#### Defectos introducidos a propósito

Uno por vez en la copia, con la suite completa. **Se detectan los 23 principales:**

| # | Defecto | Pruebas que fallan |
|---|---|---|
| B1 | **Subir antes de validar** (sin el paso 1) | 15: los 14 rechazos sin S3 y la de dos envíos a la vez |
| B2 | **Confiar en el tipo que dice el cliente** (la extensión del nombre) | 3: la foto llamada `.pdf`, el falso PDF y el HEIC |
| B3 | **No revalidar en la mutación** | 2: las dos carreras |
| B4 | **Borrar una llave distinta a la creada** | 2: las dos carreras |
| B5 | **Aceptar URL de otro conjunto** | 1: la de las 17 variantes |
| B6 | No borrar la llave si el registro falla | 2 |
| B7 | No limpiar el almacenamiento temporal | 3 |
| B8 | `crearMio` sin validar la URL | 1 |
| B9 | Tramo de la llave sin restricción (acepta `?`, `#`, `%`, `/`) | 1 |
| B10 | Límite de tamaño con `>=` | 1 |
| B11 | Orden: el archivo antes del vínculo | 1 |
| B12 | `origen: "app"` para la web | 1 |
| B13 | `ContentType` fijo, no el detectado | 2 |
| B14 | Carpeta fija, no la del conjunto | 6 |
| B15 | Sin bucket configurado, rechazar todo (rompería la Fase 0) | 1 |
| W1 | Sin candado contra el doble envío | 2 |
| W2 | El componente sin su borde | 3 |
| W3 | El layout del portal sin borde | 1 |
| W4 | Los botones de pago sin borde | 1 |
| W5 | Mandar el tipo que dice el navegador | 2 |
| W6 | Mostrar el error crudo | 7 |
| W7 | Sin la ayuda de archivo antes de enviar | 5 |
| W8 | No soltar el candado tras un error | 1 |

**Lo que no se detecta**, probado aparte:

| # | Defecto | ¿Se detecta? |
|---|---|---|
| E1 | El registro no revalida la URL que armó el servidor | ❌ Defensa en profundidad: la URL la arma el servidor en la misma llamada y no puede llegar otra |
| E2 | El registro no revalida el archivo | ❌ Ídem: el tamaño y el tipo los calcula la acción sobre los mismos bytes |
| E3 | El borde del portal no se reinicia al cambiar de página | ✅ tras agregar la prueba "el aviso no se queda pegado" (antes ❌) |

**Lo que estas pruebas no ven:** el SDK real de S3, los límites reales de Convex (el tamaño de los argumentos en el cable), qué entrega la cámara de cada celular y el diseño a 375 px. El diseño se verificó a mano en la primera ronda; en esta, el formulario solo cambió una línea de texto ("Subiendo el comprobante…").

### 1.10 Decisiones pendientes

1. **El bucket privado.** Sigue siendo decisión del responsable. Este diseño **la facilita bastante en la web**:
   - la web ya no conoce la carpeta ni arma la URL: para usar un bucket privado basta cambiar `subirAlBucket` dentro de `subirComprobante` y guardar la llave en vez de la URL pública;
   - la lectura (miniatura de la administración, "Ver archivo") seguiría necesitando una función que entregue los bytes o una URL firmada, como `incidenteArchivos.acceder`.

   **Para el móvil no cambia nada:** sigue subiendo al bucket público con `generateUploadUrl`, y sin OTA solo cambia con un build de tienda que use `enviarMio`. El bot (`uploadFromUrl`) y los comprobantes ya guardados siguen como en la primera ronda (decisión 1 de entonces).
2. **La carpeta que elige el cliente en el móvil** (`generateUploadUrl`) y `deleteObject` sin autorización por llave: fuera de alcance. Con la validación de URL en `crearMio`, ya no basta para registrar un comprobante con un archivo de otra carpeta.
3. **La validación de URL sin `AWS_S3_BUCKET_NAME` queda inactiva** (§1.6). Si se prefiere que falle cerrada, hay que cambiar antes las URL de `escenario.ts` (Fase 0) y `modeloPagos`.
4. **Los huérfanos que quedan:**
   - **web:** una acción cortada entre subir y registrar (tiempo límite, caída del servidor) deja la llave en S3; si se corta antes del `finally`, también el objeto temporal del almacenamiento interno (privado). Una limpieza periódica los resolvería;
   - **móvil:** igual que antes.
5. **El límite real de las acciones Node (5 MiB)** contradice el de `files.uploadBytes` (15 MB) y el de `incidenteArchivos.subir` (15 MiB). Un archivo de entre 5 y 15 MB falla en las dos; en la web, `uploadToS3` cae al `PUT` desde el navegador y depende del CORS. No se tocó.
6. **Los tres defectos del móvil** (monto con centavos, "mañana" desde el mediodía, fechas inexistentes): un hallazgo aparte.
7. **Vigente:** la junta directiva puede aprobar y rechazar comprobantes (Fase 4, §4.4).

### 1.11 Orden de despliegue

**Orden:**

1. Confirmar en el panel de Convex que `AWS_S3_BUCKET_NAME` (y, si se usa, `AWS_REGION`) están definidas, para que la validación de URL de `crearMio` quede activa (§1.6).
2. **Desplegar el backend** (con la Fase 4 y el Hallazgo 2, que van en el mismo despliegue).
3. **Comprobar que la acción existe:** `soportesPago:enviarMio` debe aparecer en el panel de Convex, junto a `pagos:opcionesDePago`.
4. **Desplegar la web.**

El móvil no cambia.

| Combinación | Qué pasa |
|---|---|
| **Backend nuevo + móvil publicado** | `crearMio` valida la URL **desde ese momento**. Todo lo que manda cualquier versión del móvil pasa (§1.6). Un cliente que mandara otra URL recibiría "El archivo del comprobante no es válido: envíalo de nuevo desde la app." |
| **Backend nuevo + web publicada (anterior a la Fase 2)** | Sin cambios para ella: no envía comprobantes |
| **Web nueva + backend sin esta ronda** (sin `enviarMio`) | **No usar.** "Ya pagué" aparece, pero el envío falla con un error técnico de Convex (la función no existe). La página no se cae |
| **Web nueva + backend sin la Fase 4** (sin `opcionesDePago`) | **No usar.** El comprobante se oculta y los botones de pago muestran "No se pudo consultar el pago en línea"; la página sigue, pero nadie puede enviar |
| **Datos** | Ninguna escritura ni migración. Los comprobantes ya guardados no se validan otra vez |

**Antes, en la primera ronda, había que comprobar el CORS del bucket.** Ya no: la web no hace el `PUT`.

### 1.12 Qué cambia en la QA de Factory

Los pasos y las cuentas de la primera ronda siguen; cambia esto:

1. **El despliegue:** además de la Fase 4 y el Hallazgo 2, el backend debe tener `enviarMio` (paso 3 de §1.11). El CORS del bucket ya no hace falta.
2. **En la administración** (`contadora`), el comprobante enviado desde la web aparece con la etiqueta **"Web"**, no "App".
3. **Casos nuevos:**
   - **un archivo que dice ser otra cosa:** renombrar una foto HEIC a `.jpg` (o un `.txt` a `.pdf`) y enviarla → "El comprobante debe ser una foto JPG, PNG o WebP, o un PDF.", y nada nuevo en el bucket;
   - **el móvil sigue funcionando:** enviar un comprobante desde la app publicada con `propietarioB` (102) → llega a "Comprobantes" con la etiqueta "App". Es la prueba en vivo de que la validación de URL no rechaza al móvil.
4. **Si algo falla al cargar,** el portal muestra "No se pudo cargar esta sección" con "Reintentar", sin perder el menú.

Recordatorio de cuentas (`factoryadmincondominio+<cuenta>@gmail.com`; el inicio de sesión lo hace la persona):

| Caso | Cuenta |
|---|---|
| Con deuda | `propietariaA` (101, septiembre) |
| Con un comprobante pendiente | `propietariaA` después de enviar (o `propietarioB`) |
| Arrendataria con el contrato vencido | `arrendatariaBvencida` (102), después de vincularla |
| Vecino de otra casa | `vecinoC` (solo ve su 103) |
| En revisión / histórica | `propietarioD` (104) / `propietarioE` (105, agosto) |
| Revisión en la administración | `contadora` |

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
