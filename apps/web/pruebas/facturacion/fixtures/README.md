# Fixtures de cuentas de cobro (anonimizados)

PDFs que usa `pruebas/facturacion/parserFacturas.test.mjs` para medir el
parser real de `app/api/facturas/upload/route.ts`. Todos salen de **cuentas de
cobro reales** de Ciudad del Campo II (CDC) y Arboleda Campestre, anonimizadas
el 2026-10-08 para la Fase 0 de la auditoría de facturación
(`docs/audits/FASE-0-FACTURACION.md`).

## Qué se cambió y qué no

El PDF se reconstruye con pdf-lib colocando **cada fragmento de texto en sus
coordenadas originales** (x, y) y con su tamaño, que es lo único que usa el
extractor `app/api/facturas/pdf-layout.ts`. Se reemplazaron:

| Dato | Reemplazo |
|---|---|
| Nombre del residente | `RESIDENTE DE PRUEBA` |
| Casa / apto (en todas sus apariciones: casa, referencia de pago, total inmueble) | CDC `999`, Arboleda `9999` |
| Manzana | `MANZANA 9` |
| Teléfono del residente | `0000000` |
| "CUENTA DE COBRO Nro." / "N." | consecutivos ficticios `9000x` / `90,01x` |
| NIT, dirección, ciudad y teléfono del conjunto | `Nit: 900000000 - 0`, `DATO DE PRUEBA`, `0000000000` |
| Cuentas bancarias, código de recaudo, correo de facturación | ceros / `administracion@ejemplo.test` |

**No se tocó nada de lo que el parser lee**: conceptos, códigos (`001`, `CI`,
`NCC`…), meses, montos, filas "Totales", "Pague con/sin descuento", "TOTAL A
PAGAR", períodos ni la fecha de la cuenta. Los metadatos del PDF son neutros
(título "Fixture de prueba anonimizado", productor pdf-lib).

## Verificación hecha al generarlos

1. **Sin fugas**: ninguno de los valores reemplazados aparece en el texto de
   ningún fixture (comprobado fragmento a fragmento contra el original).
2. **Fidelidad**: el `POST` real de `/api/facturas/upload` devuelve
   exactamente el mismo resultado (formato, período, líneas, totales,
   descuento, saldo a favor) para el original y para el anonimizado, en los 9
   casos. Solo cambian casa, nombre y consecutivo.

## Inventario

Origen identificado por el `_id` de la factura en Convex (sin datos de la
persona). "git" = PDF del commit `a0cf84b^` (`migrate/.tmp-descuento/<_id>.pdf`);
"S3" = `pdfUrl` vigente de la factura, descargado en solo lectura.

| Fixture | Origen | Lo que dice el documento (Totales / Pague sin descuento) | Para qué sirve |
|---|---|---|---|
| `cdc-control.pdf` | git `js70av8n3dd62jz0h01wt199th8avgyc` (abril 2026) | saldo anterior 252.650 · mes 360.000 · total 612.650 · con descuento 572.650 | Control: filas del mes anterior + del mes, sin créditos. El parser acierta. |
| `cdc-anticipo-total-negativo.pdf` | git `js7cc4yt1c6a9x8dbehwfx7n8h8atgzx` (mayo 2026) | saldo anterior −760.000 (fila `CI ANTICIPO DE CLIENTE`) · mes 360.000 · total **−400.000** | F-04 casos A, B y E: total negativo y crédito. |
| `cdc-nota-credito.pdf` | git `js76kkp4dv27skajhvsa9dyd418atwbc` (mayo 2026) | filas de abril 184.000 + `NCC NOTA CREDITO CLIENTE` −270.000 → saldo anterior **−86.000** · mes 360.000 · total 274.000 | F-04 casos B, C y E: crédito y varias filas de meses anteriores. |
| `cdc-agosto-saldo-a-favor.pdf` | S3 `js798nmpx0mt8j585renv5hewh8cwxys` (agosto 2026) | saldo anterior −597.000 · mes 335.000 · total **−262.000** | F-04 caso A con el formato vigente. En producción quedó con total 0 y estado `vencida`. |
| `cdc-septiembre-saldo-anterior-negativo.pdf` | S3 `js7bmbk16by748atvfhdp3nsdh8e0gs4` (septiembre 2026) | saldo anterior **−262.000** · mes 335.000 · total 73.000 · con descuento 33.000 | F-04 "saldo anterior fantasma": hoy se lee +335.000. Es la factura vigente de esa casa. |
| `cdc-filas-incompletas.pdf` | git `js7btg382q5151s9xvgv2d03th8atwmp` (junio 2026) | saldo anterior 10.097.050 · mes 360.000 · total 10.457.050 | F-04 caso E. **Página de continuación**: el documento guardado no trae nombre ni casa ni las filas más antiguas (venía así de la migración). |
| `cdc-pagina-sin-filas.pdf` | git `js7160z5e9czn9tq7f2nrccman8at5et` (junio 2026) | saldo anterior 8.114.750 · mes 360.000 · total 8.474.750 | F-04 caso D. **Página de continuación** sin ninguna fila de conceptos. |
| `arboleda-control.pdf` | git `js71zect2nbcam2wazhvh3gmts8av6fv` (junio 2026) | Periodo `01-junio-2026` · TOTAL A PAGAR $15,760 | Control del formato Arboleda. |
| `arboleda-saldo-a-favor.pdf` | S3 `js7316tymssvwcdq9zr7fj0br98egkzw` (septiembre 2026) | Periodo `01-septiembre-2026` (una línea más abajo que en junio) · TOTAL A PAGAR **$(376,000)** | F-15: total entre paréntesis y período mal capturado. |

Los PDFs de CDC dicen además: *"PARA BENEFICIARSE DEL DESCUENTO POR PRONTO PAGO
DE $40.000 SOBRE LA CUOTA DE ADMINISTRACIÓN, DEBE PAGAR LA TOTALIDAD DEL ESTADO
DE CUENTA HASTA EL DIA 15 DEL PRESENTE MES"*. Es la base de la prueba F-06 del
backend (`packages/backend/pruebas/facturacion/pagos.regresion.ts`).

## Agregar un fixture

`anonimizar.mjs` es el generador usado. Necesita el PDF original (que **no** se
versiona) y una configuración JSON:

```json
[{ "nombre": "cdc-nuevo.pdf", "origen": "/ruta/al/original.pdf", "formato": "cdc", "nro": "90007", "casaNueva": "999" }]
```

```bash
node apps/web/pruebas/facturacion/fixtures/anonimizar.mjs . apps/web/pruebas/facturacion/fixtures config.json
```

Antes de versionarlo, repetir las dos verificaciones de arriba: que ningún dato
personal aparezca en el texto del fixture, y que el `POST` real devuelva lo
mismo para el original y para el anonimizado.
