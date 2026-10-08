import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LECTURA DE LOS PDF CON EL PARSER DE LA FASE 2 (docs/audits/FASE-2-FACTURACION.md).
 *
 * Usa el mismo código que la vista previa y la confirmación (`leerPdf`, en
 * app/api/facturas/lectura.ts) sobre cuentas de cobro reales anonimizadas
 * (pruebas/facturacion/fixtures/README.md). Sin S3, sin sesión, sin dobles.
 *
 * Lo que se exige: cada factura cuadra con su propio documento o sale
 * marcada con el motivo; nunca un total no leído como $0 sin aviso.
 */

const { leerPdf } = await import("../app/api/facturas/lectura");
const { leerFacturas } = await import("../app/api/facturas/parser");

const FIXTURES = join(import.meta.dir, "facturacion", "fixtures");
const leer = async (archivo) => await leerPdf(new Uint8Array(readFileSync(join(FIXTURES, archivo))));
const suma = (lineas, campo) => lineas.reduce((s, l) => s + l[campo], 0);

describe("documentos que cuadran: entran sin marcas", () => {
  for (const archivo of [
    "cdc-control.pdf",
    "cdc-anticipo-total-negativo.pdf",
    "cdc-nota-credito.pdf",
    "cdc-agosto-saldo-a-favor.pdf",
    "cdc-septiembre-saldo-anterior-negativo.pdf",
    "arboleda-control.pdf",
    "arboleda-saldo-a-favor.pdf",
    "arboleda-septiembre.pdf",
    "cdc-sin-fila-de-cuota.pdf",
  ]) {
    test(`${archivo}: Σ líneas = total, saldo anterior = Totales, período legible`, async () => {
      const { facturas, errores } = await leer(archivo);
      expect(errores).toEqual([]);
      expect(facturas).toHaveLength(1);
      const f = facturas[0];
      expect(f.motivos).toEqual([]);
      expect(Math.abs(suma(f.lineas, "total") - f.totalAPagar)).toBeLessThanOrEqual(1);
      if (f.saldoAnteriorDocumento !== undefined) {
        expect(suma(f.lineas, "saldoAnterior")).toBe(f.saldoAnteriorDocumento);
      }
      expect(f.periodoDocumento).toMatch(/^\d{4}-\d{2}$/);
    });
  }
});

describe("lo que no se puede leer entero sale marcado, nunca como válido", () => {
  test("solo la primera hoja (sin Totales ni 'Pague sin descuento'): total no leído, nunca $0", async () => {
    const { facturas } = await leer("cdc-total-no-leido.pdf");
    const f = facturas[0];
    expect(f.motivos).toContain("total_no_leido");
    expect(f.totalAPagar).not.toBe(0);
    // En producción esta factura quedó con total 0 y estado "vencida".
    expect(f.totalAPagar).toBe(suma(f.lineas, "total"));
  });

  test("un PDF que empieza en una hoja de continuación se marca: falta la primera hoja", async () => {
    const { facturas } = await leer("cdc-filas-incompletas.pdf");
    expect(facturas[0].motivos).toEqual(
      expect.arrayContaining(["pagina_de_continuacion", "lineas_no_cuadran", "saldo_anterior_no_cuadra"]),
    );
  });

  test("una hoja sin filas de conceptos se marca y el período ilegible también", async () => {
    const { facturas } = await leer("cdc-pagina-sin-filas.pdf");
    expect(facturas[0].motivos).toEqual(
      expect.arrayContaining(["sin_lineas", "periodo_no_leido", "pagina_de_continuacion"]),
    );
  });

  test("un documento que no es una cuenta de cobro no se convierte en factura", () => {
    const { facturas, errores } = leerFacturas(["TALLER DE CÁLCULO INTEGRAL\nEjercicio 1"]);
    expect(facturas).toEqual([]);
    expect(errores).toHaveLength(1);
  });
});

describe("agrupación de páginas en un PDF consolidado", () => {
  test("la hoja de continuación pertenece a la factura anterior", async () => {
    const { facturas, totalPaginas } = await leer("cdc-consolidado-con-continuacion.pdf");
    expect(totalPaginas).toBe(3);
    expect(facturas.map((f) => [f.unitIdentifier, f.paginas])).toEqual([
      ["999", [1, 2]],
      ["998", [3]],
    ]);
    // La fila Totales de la casa 999 está en su segunda hoja: se lee igual.
    expect(facturas[0].saldoAnteriorDocumento).toBe(5_298_200);
    expect(facturas[0].totalAPagar).toBe(5_705_200);
    expect(facturas[0].motivos).toEqual([]);
    expect(facturas[1].totalAPagar).toBe(999_000);
  });
});

describe("período tomado del documento", () => {
  test("Arboleda, septiembre: la fecha dos renglones debajo de 'Periodo:'", async () => {
    const { facturas } = await leer("arboleda-septiembre.pdf");
    expect(facturas[0].periodoLabel).toBe("01-septiembre-2026");
    expect(facturas[0].periodoDocumento).toBe("2026-09");
  });

  test("Ciudad del Campo sin fila de la cuota: el período sale de la 'Fecha'", async () => {
    const { facturas } = await leer("cdc-sin-fila-de-cuota.pdf");
    expect(facturas[0].periodoDocumento).toBe("2026-09");
    expect(facturas[0].totalAPagar).toBe(-105_000);
    expect(facturas[0].saldoAFavor).toBe(105_000);
    expect(facturas[0].lineas.map((l) => l.codigoTexto)).toEqual(["CI"]);
  });
});

describe("formato de enero de 2026 en Ciudad del Campo", () => {
  /* La fila de la cuota trae el saldo anterior Y los cargos del mes en la
   * misma fila. Texto sintético con la forma del corpus (53 documentos). */
  const ENERO = [
    "DESARROLLO URBANO CIUDAD DEL CAMPO",
    "CUENTA DE COBRO Nro.   90001",
    "Casa 999  MANZANA 9        Fecha Enero. 01 / 2026",
    "*  001   ADMINISTRACION       177.100.00   Enero / 2026   286.000.00   40.000.00   463.100.00",
    "   008   INTERESES             23.000.00   Enero / 2026    24.000.00    47.000.00",
    "Totales   200.100.00   310.000.00   510.100.00",
    "Pague con descuento 1 - 15    $470.100.00",
    "Pague sin descuento 16 - 30   $510.100.00",
  ].join("\n");

  test("cada línea separa saldo anterior, cargo del mes y total; la cuota del mes no queda en 0", () => {
    const [f] = leerFacturas([ENERO]).facturas;
    expect(f.lineas.map((l) => [l.codigo, l.saldoAnterior, l.actual, l.total])).toEqual([
      [1, 177_100, 286_000, 463_100],
      [8, 23_000, 24_000, 47_000],
    ]);
    expect(f.vrAdmon).toBe(286_000);
    expect(f.totalAPagar).toBe(510_100);
    expect(f.saldoAnteriorDocumento).toBe(200_100);
    expect(f.motivos).toEqual([]);
  });
});

describe("huella del archivo", () => {
  test("el mismo PDF da la misma huella; otro, otra", async () => {
    const a = await leer("cdc-control.pdf");
    const b = await leer("cdc-control.pdf");
    const c = await leer("cdc-nota-credito.pdf");
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
  });
});
