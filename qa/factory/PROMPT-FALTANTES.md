# Faltantes de la web de facturación — comprobantes del residente y carga de PDF en conjuntos nuevos (Vekino)

## Contexto

La QA en el conjunto de prueba **Factory** (`j570ttbjpy06q0nnd6k15gnxbx8fxvcz`), sobre el commit `0cf972d` (Fase 4), se detuvo por dos faltantes que impiden probar la facturación en la web. Tu trabajo es **implementarlos**, con pruebas, sin desplegar.

**Antes de empezar, lee:**

- `docs/audits/FASE-2-FACTURACION.md`: §3, el flujo de carga (vista previa, confirmación e importaciones).
- `docs/audits/FASE-3-FACTURACION.md`: §6.3, comprobantes (monto, fecha, solo la vigente, mensajes estables).
- `docs/audits/FASE-4-FACTURACION.md`: §4.4, quién ve los pagos; §5.3, `opcionesDePago`: "Ya pagué" depende de `debe` y no de la pasarela.

---

## Hallazgo 1 — El residente no puede subir comprobantes de pago desde la web

**Qué pasa:** en las páginas del residente (`apps/web/app/mi/[id]/...`) no hay ningún punto de entrada para enviar un comprobante. En la web, los comprobantes solo existen del lado de la administración:

- la pantalla "Comprobantes": `apps/web/app/condominio/[id]/comprobantes/page.tsx` (listar, vincular, aprobar y rechazar);
- "Pagos por revisar" en Finanzas.

Hoy el residente solo puede enviarlo desde el móvil o por WhatsApp.

**Lo que ya existe y se debe reutilizar (no duplicar reglas):**

- **Backend:** `soportesPago.crearMio` (`packages/backend/convex/soportesPago.ts:151`). Recibe `condominioId`, `facturaId?`, `url`, `mimeType?`, `nota?`, `monto?` y `fechaPago?`. Ya valida:
  - vínculo **vigente** con la unidad (`misUnidadIds`);
  - **solo la factura vigente**, con el mensaje estable `MENSAJE_COMPROBANTE_HISTORICA`;
  - **uno solo pendiente por factura** ("Ya tienes un comprobante en revisión para esta factura.");
  - monto mayor que 0 y fecha no futura (con 24 h de holgura).
- `soportesPago.listMios` da los comprobantes del residente con su estado.
- `pagos.opcionesDePago({ facturaId })` responde `{ debe, pasarela, motivo }`.
- **Flujo de referencia en el móvil:** `apps/mobile/src/app/(app)/(tabs)/facturas.tsx`, aprox. líneas 1100–1640.
  - Pide "¿Cuánto pagaste? *" (sugiere el monto de hoy, `montoAPagarHoy`) y "¿Qué día pagaste? *".
  - Toma la imagen o el PDF y llama a `api.files.generateUploadUrl` con la carpeta `condominios/soportes/{condominioId}`.
  - Hace `PUT` a la URL firmada, luego `crearMio`.
  - Muestra el estado del comprobante enviado para esa factura.
- **Dónde va en la web:**
  - "Mis facturas": `apps/web/app/mi/[id]/cuenta/page.tsx`, que ya consulta `opcionesDePago` (aprox. línea 738).
  - El inicio: `apps/web/app/mi/[id]/page.tsx`.
  - El botón de pago está en `apps/web/components/portal/portal-pay-button.tsx`.

**Qué construir:**

1. **Un botón "Ya pagué, enviar comprobante" en la factura vigente.**
   - Aparece cuando `opcionesDePago.debe` es verdadero, aunque la pasarela no acepte la unidad: hoy está en QA y rechaza todas.
   - No aparece en una factura en revisión ni en "Pago en verificación". Sigue lo que diga el backend; no inventes reglas en la pantalla.
2. **Un formulario** con:
   - monto, obligatorio, con el monto de hoy como sugerencia;
   - fecha del pago, obligatoria, que no admita fechas futuras;
   - archivo, imagen o PDF;
   - nota opcional.

   Los errores del backend se muestran **tal cual** (los mensajes son estables).
3. **Protección contra doble clic:** un solo comprobante por envío.
4. **Límites de archivo explícitos:** tipos permitidos, tamaño máximo, archivo vacío y formato no permitido, con mensajes claros. El móvil no tiene un límite documentado: propón uno y déjalo escrito.
5. **"Mis comprobantes"** para cada factura: estado (pendiente de revisión, aprobado o rechazado, con su motivo) y monto, desde `listMios`.
6. **Accesos:** la arrendataria con el contrato vencido y el vecino de otra casa no ven el botón. El backend ya los rechaza; verifica que la pantalla no lo ofrezca.

**Decisión que debes plantear, no tomar sola:** `generateUploadUrl` sube al bucket `vekino`, que es **público**, igual que lo hace hoy el móvil. Un comprobante de pago trae datos financieros personales. Implementa con paridad con el móvil, pero en el reporte deja la opción de un bucket privado con URL firmada de lectura (ya existe para la evidencia de incidentes en `incidenteArchivos.ts`) como decisión del responsable.

---

## Hallazgo 2 — Un conjunto creado en la plataforma no puede subir PDF de facturas (no tiene `legacyId`)

**Qué pasa:**

- Finanzas solo muestra "Subir facturas" si el conjunto tiene `legacyId` (`apps/web/app/condominio/[id]/finanzas/page.tsx:162`). El botón "Cargar facturas" de la barra superior solo lleva otra vez a Finanzas.
- Las rutas `apps/web/app/api/facturas/upload/route.ts` y `confirmar/route.ts`:
  - exigen `condominioLegacyId`;
  - validan el permiso con `facturas.permisoSubida({ condominioLegacyId })` (`packages/backend/convex/facturas.ts:615`, vía `permiso.ts`);
  - arman la llave de S3 con él (`llaveDe(condominioLegacyId, …)`).
- `condominios.create`, que usa el superadmin (`packages/backend/convex/condominios.ts:235`), **no pone `legacyId`**, y `condominios.update` no lo acepta. Solo lo tienen los conjuntos migrados (CDC y Arboleda).

**Consecuencia:** ningún conjunto creado desde la plataforma (Factory, o cualquier cliente nuevo) puede cargar facturas en PDF, y nadie puede arreglarlo desde la app.

**Qué construir (recomendado):**

1. **El permiso por conjunto y no por `legacyId`.** Las dos rutas reciben `condominioId` y validan con `requireCondominioRole(..., ["administrador", "contadora"])` sobre ese id, con una query nueva o extendiendo `permisoSubida`.
   - **Compatibilidad obligatoria:** `condominioLegacyId` debe seguir funcionando. La prueba de la Fase 0 `apps/web/pruebas/facturacion/parserFacturas.test.mjs` y `packages/backend/pruebas/facturacion/contencion.test.ts` lo usan, y **los archivos de la Fase 0 no se pueden modificar**.
2. **La carpeta de S3:** `legacyId ?? _id`. Las llaves de los conjuntos migrados no cambian.
3. **Finanzas** muestra "Subir facturas" a la administración y a la contadora de **cualquier** conjunto.
4. **No hagas backfill** ni escrituras de datos. Si crees que conviene asignar `legacyId` al crear conjuntos, propónlo como alternativa; no lo hagas además.

---

## Reglas inamovibles

1. **No despliegues nada:** prohibido `convex dev`, `convex deploy`, `convex run`, `convex import`, `convex env set` y `convex data`.
   - `packages/backend/.env.local` tiene una `CONVEX_DEPLOY_KEY` de **`agreeable-bee-782`, que es el deployment que usan los residentes**. Cualquier comando de Convex, incluido `convex dev`, escribe ahí.
   - Antes de empezar, verifica que no haya ningún `convex dev` corriendo.
2. **Sin datos reales:** no escribas en Convex ni en S3, y no hagas llamadas a Aval ni a WhatsApp.
3. **La red de facturación sigue verde:** `bun run test:facturacion` en `packages/backend` (55) y en `apps/web` (36), las 91 de la Fase 0, antes y después.
   - Los archivos de la Fase 0 (`*.regresion.ts`, `escenario.ts`, `parserFacturas.test.mjs`, `resumenResidente.test.mjs` y los fixtures) **no cambian**.
4. **Pruebas nuevas para cada hallazgo.**
   - Web: `bun test` con happy-dom, como en `apps/web/pruebas/fase4Facturacion.test.mjs`, en procesos separados si mockean el mismo módulo.
   - Backend: convex-test, como en las suites existentes.
   - Cubre al menos: los botones según `opcionesDePago`, el envío con monto y fecha, los mensajes estables (histórica, uno pendiente, fecha futura), los límites de archivo, el doble clic, y la carga y la confirmación con un conjunto **sin** `legacyId` (y con uno que sí lo tiene).
5. **`tsc` sin errores nuevos** en backend y web. El error de `packages/backend/convex/auth.ts(34,11)` en el móvil ya existía.
6. **Sin commit** hasta que yo lo revise.

## Entregable

1. Los cambios en el working tree.
2. Un reporte en `docs/audits/FALTANTES-WEB-FACTURACION.md` con:
   - qué se cambió por componente;
   - las pruebas, antes y después;
   - la decisión pendiente del bucket de comprobantes;
   - el orden de despliegue: backend → web; el móvil no cambia.
3. Un resumen breve:
   - qué quedó hecho;
   - qué decisiones necesito tomar;
   - qué falta para retomar la QA en Factory. Las unidades 101–105 y las 9 cuentas de prueba ya existen, y los PDF sintéticos están listos en `qa/factory/pdfs/`.
