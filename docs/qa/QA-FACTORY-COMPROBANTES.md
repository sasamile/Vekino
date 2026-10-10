# QA en Factory — Facturación básica y comprobantes de pago

> **Fecha:** 2026-10-09 (ronda 2, después de los arreglos `eec271c` y `a2161e2`) · **Conjunto:** Factory (`j570ttbjpy06q0nnd6k15gnxbx8fxvcz`) · **Deployment:** `agreeable-bee-782` (producción, sin redesplegar) · **Front:** `apps/web` local.
> Notas de ejecución con el texto exacto de cada pantalla: [`qa/factory/notas-ejecucion.md`](../../qa/factory/notas-ejecucion.md).

---

## 1. Resumen

| Resultado | Casos |
|---|---|
| ✅ Pasaron | **20** |
| ❌ Fallaron | **4** |
| ⚠ Ambiguos | **3** |
| — No ejecutables | **10** (necesitan la carga por PDF, que está bloqueada) |
| **Total** | **37** |

**Lo que funciona:**
- **Comprobantes desde la web**, que es el arreglo nuevo:
  - envío con monto y fecha;
  - límites de archivo con mensajes claros, más el control del tipo real en el servidor;
  - uno solo pendiente por factura;
  - doble clic sin duplicar;
  - solo sobre la vigente.
- **Revisión por la administración y la contadora:**
  - estados pagada, abonada y con excedente;
  - descuento dentro y fuera del plazo;
  - no se puede aprobar sin monto o sin fecha;
  - un solo evento por aprobación;
  - el rechazo no cambia el estado;
  - "Conciliar" no degrada nada.

**Los defectos más graves:**
1. **La carga de facturas en PDF responde 401 con la sesión iniciada.** Las rutas de Next buscan la sesión en una cookie y la web la guarda en `localStorage`. Con la web nueva publicada, nadie podría cargar facturas.
2. **Un abono aprobado no se descuenta para el residente.** Después de aprobar $200.000 de $335.000, el inicio, "Mis facturas", la campana y la sugerencia del formulario siguen en $335.000. La misma función (`montoAPagarHoy`) es la que cobra la pasarela.
3. **La vigente en mora sale "Vencida" y "Pendiente" a la vez**, según la pantalla, y la administración la ve "Pendiente" con 0 vencidas.

---

## 2. Entorno

| | |
|---|---|
| Commit | `a2161e2` (incluye `eec271c`). Árbol limpio, sin `convex dev` corriendo |
| Red de facturación (solo lectura) | Backend `test:facturacion` **55/55** · web `test:facturacion` **170/170** (6 · 15 · 4 · 12 · 18 · 7 · 11 · 7 · 47 · 43) |
| Front | `next dev` 16.1.1 en `http://localhost:3000`, viewport 1280×800, `NEXT_PUBLIC_CONVEX_URL` → `agreeable-bee-782.convex.cloud` |
| Backend desplegado | Tiene `soportesPago.enviarMio`: el primer comprobante enviado desde la web respondió bien. `facturas.destinoCarga` no se pudo comprobar, porque la carga se cae antes, en el 401 |
| Dominios que cargó la página | `localhost:3000`; `agreeable-bee-782.convex.site` (autenticación); `agreeable-bee-782.convex.cloud` (WebSocket de Convex); `vekino.s3.us-east-1.amazonaws.com` (archivos de comprobantes); `127.0.0.1:8765` (servidor local de solo lectura con los archivos sintéticos, solo para adjuntarlos al selector) |
| Sesión | Better Auth `crossDomainClient`: la sesión vive en `localStorage` y en `localhost` no hay cookies. El servidor de autenticación solo acepta el origen `http://localhost:3000`; desde `*.localhost` lo bloquea por CORS. Por eso hubo una sesión a la vez, y la persona responsable hizo cada inicio de sesión |
| Alcance | **Todo en Factory.** La cuenta de administración no es staff y solo tiene Factory. Antes de cada escritura se verificó que la URL fuera de Factory. Nada desplegado, cero cambios en el código de la app y en las variables, cero commits, ningún pago ni mensaje |

---

## 3. Lo que se creó en Factory (inventario para limpiar o reusar)

### Unidades

Tipo casa, estado "Ocupada":

| Casa | Número | Id |
|---|---|---|
| A | 101 | `jd7f98nhfzrk2w8htfhdbe23th8fzwtg` |
| B | 102 | `jd73esm3hs8eg3rxfe7rzrfme58fy8f3` |
| C | 103 | `jd7bd5a4g883k3kftpw9j4zhd98fy6yx` |
| D | 104 | `jd77ckv3texq98k0k0d550zw2x8fzxpz` |
| E | 105 | `jd7204cept12nta1j9sgyyfm4h8fy80n` |

### Cuentas

Todas sin teléfono, creadas con "Nuevo residente". La persona responsable escribió las contraseñas; no están en este reporte.

| Cuenta | Correo | Rol | Vínculo |
|---|---|---|---|
| Propietaria A | `factoryadmincondominio+propietariaa@gmail.com` | Propietario | 101 |
| Propietario B | `factoryadmincondominio+propietariob@gmail.com` | Propietario | 102 |
| Arrendataria B vigente | `factoryadmincondominio+arrendatariab@gmail.com` | Propietario (membresía) | 102 arrendatario, 2026-04-01 → 2027-03-31 (agregada por el propietario B) |
| Arrendataria B vencida | `factoryadmincondominio+arrendatariabvencida@gmail.com` | Propietario (membresía) | 102 arrendatario, 2026-03-01 → 2026-09-01 |
| Vecino C | `factoryadmincondominio+vecinoc@gmail.com` | Propietario | 103 |
| Propietario D | `factoryadmincondominio+propietariod@gmail.com` | Propietario | 104 |
| Propietario E | `factoryadmincondominio+propietarioe@gmail.com` | Propietario | 105 |
| Contadora | `factoryadmincondominio+contadora@gmail.com` | Contadora | — |
| Junta directiva | `factoryadmincondominio+junta@gmail.com` | Junta directiva | — |

- El correo de la arrendataria B vigente quedó guardado con espacios ("arrendataria b factoryadmincondominio+…") porque "Nuevo residente" no valida el formato. Se corrigió con "Editar residente".
- El alias `Factory+…@gmail.com` del encargo llegaría a la bandeja de otra persona; se usó `factoryadmincondominio+…`.

### Facturas

**Manuales**, con "Crear factura": la carga por PDF está bloqueada (defecto 1).

| Casa | Período | Valor | Con desc. | Vence | Número | Estado final |
|---|---|---|---|---|---|---|
| C 103 | 2026-08 | 335.000 | 295.000 | 2026-08-31 | FAC-2026-08-103-600026 | **Abonada** (200.000 de 335.000) |
| E 105 | 2026-08 | 335.000 | 295.000 | 2026-08-31 | FAC-2026-08-105-630755 | **Pagada** por inferencia (defecto 5) |
| A 101 | 2026-09 | 335.000 | 295.000 | 2026-09-30 | FAC-2026-09-101-681194 | **Pagada** |
| D 104 | 2026-09 | 335.000 | 295.000 | 2026-09-30 | FAC-2026-09-104-700532 | **Pagada** (+65.000 de excedente) |
| E 105 | 2026-09 | 670.000 | 630.000 | 2026-09-30 | FAC-2026-09-105-713276 | **Abonada** (630.000 de 670.000) |
| B 102 | 2026-10 | 335.000 | 295.000 | 2026-10-31 | FAC-2026-10-102-723639 | **Pagada** (con descuento) |

### Comprobantes

Todos con origen "Web", archivos sintéticos (`qa/factory/comprobantes/`).

| Casa | Envió | Monto · fecha | Revisión |
|---|---|---|---|
| 102 | Arrendataria B | 295.000 · 2026-10-09 (PNG) | Aprobado por la administración → pagada |
| 101 | Propietaria A | 335.000 · 2026-10-09 (PDF, doble clic) | Aprobado con doble clic → pagada |
| 103 | Vecino C | 200.000 · 2026-10-09 (PNG) | Aprobado → abonada |
| 104 | Propietario D | 400.000 · 2026-10-09 (PNG) | Aprobado → pagada, excedente 65.000 |
| 105 | Propietario E | 630.000 · 2026-10-01 (PDF) | **Aprobado por la contadora** → abonada |
| 103 | Vecino C | 135.000 · 2026-10-09 (PNG) | **Rechazado** con motivo |

- **S3:** 6 archivos públicos en `condominios/soportes/j570ttbjpy06q0nnd6k15gnxbx8fxvcz/`. No se publicó ningún PDF de factura.
- **Discrepancias:** 0. No se pueden producir sin PDF con saldo anterior.

---

## 4. Casos

Referencias: F2 = `FASE-2-FACTURACION.md`, F3 = `FASE-3-FACTURACION.md`, F4 = `FASE-4-FACTURACION.md`.

### Base de facturación (PASO 5)

| ID | Pasos | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| 5.1a | Admin → Finanzas → "Subir facturas" → `factory-2026-08.pdf` | Vista previa sin publicar (F2 §3) | `POST /api/facturas/upload` → **401** "Inicia sesión para subir facturas." (2 intentos); alerta suprimida: "Error procesando PDF: Inicia sesión para subir facturas." | ❌ |
| 5.1b | Casa D con total que no cuadra | "En revisión" con motivo (F2 §5) | Necesita PDF. El PDF está listo y leído en local con `lineas_no_cuadran` y `totales_no_cuadran` | — |
| 5.2 | Re-confirmar el mismo PDF | "Repetida" (F3 §9) | Necesita PDF | — |
| 5.3 A | Residente y admin, 101 septiembre | Pendiente, sin descuento | Inicio: "Total pendiente: $ 335.000 · Sin descuento (venció el 15 de septiembre de 2026) · Precio completo hasta el 30 de septiembre de 2026 · En mora desde el 16 de octubre de 2026". Finanzas: Pendiente | ✅ |
| 5.3 B | 102 octubre (propietario y arrendataria) | Pendiente, con descuento hasta el 15 | "Total pendiente: $ 295.000 · Con descuento hasta el 15 de octubre de 2026 · Después $ 335.000"; Mis facturas: "… · En mora desde el 16 de noviembre de 2026". Finanzas: Pendiente | ✅ |
| 5.3 C | 103 agosto | Vencida en todas las superficies | Mis facturas: "Estado actual · **Vencida**" y la tarjeta "Vencida"; la fila, la fila del inicio y Finanzas (Vencidas 0): "**Pendiente**"; la campana: "Por pagar · $ 335.000" | ❌ |
| 5.3 D | 104 en revisión | En revisión, sin "Pagar" | Necesita PDF | — |
| 5.3 E | 105 agosto y septiembre | Agosto histórica, septiembre vigente | Septiembre vigente "Pendiente $ 670.000"; agosto histórica pero "**Pagada**" por inferencia ("Según la factura siguiente: pagada · saldo anterior $ 0") | ⚠ |
| 5.4 | Textos de plazos | Regla B (F4 §5.1) | Correctos en Mis facturas e inicio (tarjeta). La fila de "Facturas recientes" del inicio solo dice "Precio completo hasta…", sin "En mora desde…" | ✅ |
| 5.5 | Pasarela | Mensaje estable (F4 §5.3) | Factory no tiene portal del banco: "El pago en línea todavía no está habilitado: la pasarela está en modo de pruebas. Paga por los canales habituales del conjunto y, si quieres, envía el comprobante." (literal), sin "Pagar en línea" | ✅ |
| 5.6 | "Conciliar" en Factory | Sin degradar, sin eventos de más (F3 §4.3) | "Todo al día: 6 facturas de 5 unidades ya estaban conciliadas." | ✅ |

### A. Subir

| ID | Pasos | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| A1 | Propietaria A → Mis facturas → "Ya pagué, enviar comprobante" → 335.000, hoy, PDF | `pendiente_revision`, vinculado a la vigente, visible para la admin (F3 §6.3) | "Comprobante enviado. La administración lo revisará y te confirmará el pago."; admin: "Unidad 101 · Web · Factura FAC-2026-09-101-681194 · Dice que pagó: $ 335.000 el 9/10/2026" | ✅ |
| A2 | Propietario E, agosto (histórica) | Rechazo con mensaje estable (F3 §6.3) | La pantalla solo ofrece "Ya pagué" en septiembre: a la histórica no se llega desde la web. El mensaje del backend no se puede provocar por la web | ✅ |
| A3 | Vigente pagada / en revisión / en verificación | Documentar | Pagada (101, después de B1): sin "Ya pagué". En revisión y en verificación: necesitan PDF | ⚠ |
| A4 | Segundo comprobante con uno pendiente | Uno solo por factura (auditoría §3.7) | Con uno pendiente, "Ya pagué" desaparece del inicio y de Mis facturas (102, 103) | ✅ |
| A5 | Vecino C / arrendataria vencida sobre la 101 | Rechazo | El vecino solo ve las facturas de su casa. La vencida no ve facturas ("Aún no tienes facturas") ni "Ya pagué" | ✅ |
| A6 | Archivos | Límites y mensajes | `.txt` → "Formato no permitido. Envía una foto JPG, PNG o WebP, o un PDF."; vacío → "El archivo está vacío. Elige otra foto o el PDF del comprobante."; 10,8 MB → "El archivo pesa 10,4 MB y el máximo es 10 MB. Envía una foto más liviana o una captura de pantalla."; texto con extensión `.png` → el cliente lo acepta y el servidor responde "El comprobante debe ser una foto JPG, PNG o WebP, o un PDF." (sin crear nada); PDF y PNG válidos → aceptados | ✅ |
| A7 | Doble clic en "Enviar comprobante" | Un solo comprobante | Una sola entrada en "Mis comprobantes" y una sola en la pantalla de la admin | ✅ |

### B. Revisión

| ID | Pasos | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| B1 | Admin aprueba la 101 por 335.000 | `pagada`, evento `comprobante` con actor (F3 §4.3, §6.3) | Pagada. Historial: "9/10/2026, 11:09:51 p. m. · Comprobante · Factorio · pendiente → pagada — Comprobante aprobado: $ 335.000." | ✅ |
| B2 | Admin aprueba la 103 por 200.000 de 335.000 | `abonada`; el residente ve lo que falta | Abonada; la admin ve "Pagos registrados: $ 200.000 de $ 335.000". **El residente ve $ 335.000** en el inicio, Mis facturas, la campana y la sugerencia del formulario | ❌ |
| B3 | Admin aprueba la 104 por 400.000 de 335.000 | `pagada` y excedente en "Pagos por revisar" (F3 §6.1) | Pagada. "Pagos por revisar · Pagado de más · Unidad 104 · Septiembre 2026 · pagó $ 400.000 sobre $ 335.000: $ 65.000 de más" | ✅ |
| B4 | 102: 295.000 el 9/10, dentro del plazo | `pagada` | El diálogo dice "que ese día debía $ 295.000" → Pagada | ✅ |
| B5 | 105: 630.000 (total con descuento) el 1/10, fuera del plazo | `abonada` | El diálogo dice "que ese día debía $ 670.000" → Abonada | ✅ |
| B6 | Aprobar sin monto / sin fecha | No deja (F3 §6.3) | En los dos casos "Aprobar" queda deshabilitado | ✅ |
| B7 | Rechazar el 2.º de la 103 con motivo | Sin cambio de estado; el residente lo ve | La factura sigue Abonada y no hay evento en el historial. El residente ve "Rechazado · $ 135.000 · Motivo: … Puedes enviar uno nuevo." y vuelve a tener "Ya pagué" | ✅ |
| B8 | Roles | Contadora sí; junta, documentar; vecino y vencida no (F4 §4.4) | La contadora aprueba ("Aprobado por QA Contadora") y no entra a Residentes. La junta: la web la manda a `/mi`, pero el backend la deja aprobar. Vecino y vencida: no tienen menú de administración (no se probó la URL directa) | ⚠ |
| B9 | Doble clic en "Aprobar" | Una evidencia y un evento | Un solo aprobado y un solo evento en el historial | ✅ |

### C. Comprobante y recibo siguiente

| ID | Esperado | Obtenido | Resultado |
|---|---|---|---|
| C1–C5 | Discrepancias y su cierre (F3 §5) | Necesitan el recibo siguiente con saldo anterior, que solo trae la carga por PDF. La factura manual no tiene saldo anterior. Los PDF de estos casos están listos en `qa/factory/pdfs/despues/` | — (5 casos) |
| C6 | "Conciliar" después de aprobar no degrada | "Todo al día: 6 facturas de 5 unidades ya estaban conciliadas." Pagadas y abonadas intactas | ✅ |

### D. Lo que ve cada persona

| Caso | Superficies | Resultado |
|---|---|---|
| B1 (101) | Inicio "Estás al día" · Mis facturas "Al día", fila "Pagada" · comprobante "Aprobado · $ 335.000 · Tu pago quedó registrado." · campana "Factura de 01-septiembre-2026 · Pagada" · Finanzas "Pagada" · historial con un evento. Todo coincide (la etiqueta "Pagada" sale dos veces en la fila) | ✅ |
| B2 (103) | Admin: Abonada, "$ 200.000 de $ 335.000". Residente: "Total pendiente: $ 335.000", "Estado actual · Pendiente · $ 335.000", "Abono parcial · $ 335.000", campana "Por pagar · $ 335.000" | ❌ |
| C2, C3 | Necesitan PDF | — (2 casos) |

El contador de vencidas: el backend lo calcula (`portal.navBadges.facturasVencidas`, unidades en mora), pero la barra lateral del portal web lo anula a propósito (`portal-sidebar.tsx:110-113`). En la administración no hay contador.

---

## 5. Defectos

### 1. ALTA — La carga de PDF responde 401 aunque haya sesión

- **Reproducir:** iniciar sesión como administración en `http://localhost:3000` → Finanzas → "Subir facturas" → elegir cualquier PDF.
- **Esperado:** vista previa (F2 §3).
- **Pasó:** `POST /api/facturas/upload` → 401 "Inicia sesión para subir facturas."
- **Dónde:**
  - `apps/web/app/api/facturas/permiso.ts` (`rechazoSinSesion` → `isAuthenticated()` de `convexBetterAuthNextJs`, en `lib/auth-server.ts`) busca la sesión en las cookies de la petición.
  - `apps/web/lib/auth-client.ts` usa `crossDomainClient`: la sesión queda en `localStorage` (`better-auth_cookie`) y solo viaja en la cabecera `Better-Auth-Cookie` hacia `convex.site`. En `localhost` no hay cookies.
- **Por qué no lo vieron las pruebas:** simulan `@/lib/auth-server`.
- **Impacto:** hoy no se nota porque la web publicada es anterior a la Fase 2. Al publicar la web nueva, la carga quedaría rota para todos. `/api/incidentes/reporte` usa el mismo control. Sin verificar en producción, aunque la configuración de autenticación es la misma.
- **Arreglos posibles (no aplicados):**
  - que la web mande el token de Convex y la ruta lo valide;
  - o mover la lectura y la confirmación a acciones de Convex, como `enviarMio`.

### 2. ALTA — Un abono aprobado no se descuenta para el residente

- **Reproducir:** factura de $335.000 → el residente envía $200.000 → la administración lo aprueba → la factura queda Abonada.
- **Esperado:** el residente ve lo que falta, $135.000 (F3 §6.1).
- **Pasó:** siguen en $335.000:
  - el inicio ("Total pendiente");
  - "Mis facturas" (estado actual, tarjeta y fila);
  - la campana ("Por pagar");
  - la sugerencia del formulario "Ya pagué".
- **Dónde:** `montoAPagarHoy` (`packages/backend/convex/lib/cartera.ts:790`) solo elige entre el total y el total con descuento, sin restar `estadoPago.montoPagado`. Lo usan:
  - `apps/web/app/mi/[id]/page.tsx` (`Total pendiente`, ~l. 472);
  - `cuenta/page.tsx`;
  - `notificacionesFeed.ts:298`;
  - el formulario del comprobante;
  - **la pasarela (`pagos.armarDatosTrn`)**.
- **Riesgo:** con `AVAL_AMBIENTE=prod`, quien abonó pagaría otra vez el total.

### 3. MEDIA — La vigente en mora sale "Vencida" y "Pendiente" a la vez

- **Reproducir:** casa 103 con agosto sin pagar el 9 de octubre (mora desde el 16 de septiembre).
- **Esperado:** el mismo estado en todas partes.
- **Pasó:** "Vencida" en el resumen y la tarjeta de "Mis facturas", y "En mora desde…" en el inicio. "Pendiente" en la fila de la lista, la fila del inicio y Finanzas (Vencidas 0). La campana dice "Por pagar".
- **Dónde:** el resumen usa la cartera (`resumenResidente` / `carteraDeUnidad`) y las filas y Finanzas usan `facturas.estado`. Una vigente vencida sigue `pendiente` porque solo un veredicto pone `vencida`.

### 4. MEDIA — La arrendataria con el contrato vencido sigue viendo la casa

- **Reproducir:** arrendataria con vínculo de la 102 terminado el 1 de septiembre.
- **Esperado:** sin acceso a la casa.
- **Pasó:**
  - **bien:** no ve facturas;
  - **mensaje engañoso:** el inicio y "Mis facturas" dicen "Estás al día · No tienes facturas pendientes." y el encabezado "Casa 102 · Arrendatario";
  - **sigue viendo partes de la casa:** "Mi unidad" muestra la casa con Paquetes y Vehículos, y "Visitantes" ofrece "Autorizar visitante". No se ejecutó: puede avisar a portería.
- **Dónde:** `visitantes.ts:32` tiene su propio `misUnidadIds` sin filtro de vigencia; la página de unidad y el resumen no distinguen un vínculo vencido.

### 5. MEDIA — Una factura manual del mes siguiente marca la anterior como pagada

- **Reproducir:** crear agosto ($335.000) y septiembre ($670.000) a mano para la 105.
- **Esperado:** agosto sigue sin pagar.
- **Pasó:** "Conciliación · Factorio · pendiente → pagada — La factura siguiente dice que quedó pagada (saldo anterior $ 0)". Además entra al recaudo de la contabilidad ($335.000).
- **Dónde:** `createManual` no tiene saldo anterior, así que la conciliación (`veredictoConciliacion`) lee $0.

### 6. MEDIA — La fila de "Mis facturas" desborda con el mensaje de la pasarela

- **Reproducir:** residente de Factory (sin portal del banco), a 1280 px.
- **Pasó:** la fila tiene 1140 px de contenido en un contenedor de 954 px con `overflow: hidden`:
  - la columna de la factura queda en una palabra por línea;
  - el mensaje sale cortado ("…y, si quie");
  - al abrir y cancelar el formulario, la fila queda corrida 186 px.
- **Dónde:** `apps/web/app/mi/[id]/cuenta/page.tsx` (fila, `flex shrink-0`) y `components/portal/portal-pay-button.tsx:136`.

### 7. BAJA — "Nuevo residente" no valida el correo

- **Pasó:** se guardó "arrendataria b factoryadmincondominio+…@gmail.com" con espacios. "Editar residente" (`users.setMemberEmail`) sí lo rechaza.
- **Dónde:** `users.createCondoMember` y `residentes/page.tsx`.

### 8. BAJA — Textos y detalles

- **Rechazar comprobante:** el diálogo dice que el motivo "le servirá a la administración para recordar el motivo", pero el residente lo lee tal cual.
- **Comprobantes (administración):** dice "foto o PDF vía WhatsApp" y "Cuando un residente envíe un soporte de pago por WhatsApp…", aunque ahora también llegan de la web y la app.
- **Etiqueta repetida:** "Pagada" sale dos veces en la fila (101 y 105 agosto).
- **Campana:** no avisa del abono ni del rechazo.
- **Aprobar:** el diálogo no advierte cuando el monto supera lo adeudado.
- **Rol de la arrendataria:** la barra lateral dice "Propietario" (rol de la membresía); el encabezado dice "Arrendatario".
- **Junta sin casa:** ve "Estás al día".
- **Inicio:** la fila de "Facturas recientes" no dice "En mora desde…", y en una pagada muestra "Precio completo hasta…".
- **Monto del formulario:** el marcador del campo es un valor fijo (380.000).

---

## 6. Ambigüedades y decisiones de negocio

| Tema | Lo que pasa | Qué decidir |
|---|---|---|
| **B8 · junta directiva** | La web no la deja entrar a Comprobantes (la redirige al portal). El backend sí la deja listar, aprobar, rechazar y vincular (`soportesPago.ts:46`, `ADMIN_ROLES`) | Si no debe aprobar: quitarla de `ADMIN_ROLES` (una línea). Si sí: darle acceso en la web |
| **A3 · vigente pagada, en revisión o en verificación** | Pagada: la web no ofrece "Ya pagué". En revisión y en verificación no se pudieron probar | Si debe poder enviar sobre una vigente pagada (un pago de más, por ejemplo) |
| **Mora con la vigente abonada** | Tras el abono de $200.000, el resumen de la 103 pasó de "Vencida" a "Pendiente", con $135.000 aún vencidos desde el 16 de septiembre | Si un abono parcial a la vigente vencida la saca de mora (F3 §11 habla de una factura *posterior* abonada) |
| **Motivo del rechazo** | El residente lo ve | Si es interno (cambiar la pantalla del residente) o público (cambiar el texto del diálogo) |
| **Bucket de comprobantes** | Los archivos quedan públicos en `condominios/soportes/{conjunto}/`, igual que desde el móvil | Bucket privado con URL firmada (como incidentes) |
| **Factura manual** | No tiene saldo anterior y hace que la conciliación declare pagada la anterior (defecto 5) | Pedir el saldo anterior en la manual, o no juzgar con una manual |

---

## 7. Lo que quedó fuera y por qué

- **Carga por PDF, casa 104 en revisión, idempotencia y discrepancias (C1–C5, D de C2 y C3):** la carga responde 401 (defecto 1). Con autorización se siguió con facturas manuales. Los PDF sintéticos de todas las cadenas están listos y verificados con el parser real en `qa/factory/pdfs/`, y su lectura esperada está en `qa/factory/pdfs/especificacion.json`.
- **WhatsApp:** fuera de esta ronda; no se tocó el bot ni el webhook.
- **Pasarela:** no se intentó ningún pago. Solo se verificó el mensaje estable.
- **Móvil:** fuera de esta ronda.
- **Cartera en Reservas:** solo aparece por fila de reserva, y Factory no tiene zonas ni reservas.
- **"Autorizar visitante" con la arrendataria vencida:** observado, no ejecutado, porque puede avisar a portería.
- **Archivos de apoyo** en `qa/factory/`:
  - ya comprometidos en `49b9cb6`: `generar-pdf.mjs`, `leer-pdf.ts`, `pdfs/`;
  - nuevos de esta ronda, sin seguimiento en git: `generar-comprobantes.mjs`, `comprobantes/` y `notas-ejecucion.md`. `comprobantes/comprobante-grande-11mb.png` pesa 10,8 MB: conviene no subirlo y regenerarlo con el script.
