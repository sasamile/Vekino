import { NextRequest, NextResponse } from "next/server";
import { MENSAJE_LECTURA } from "@vekino/backend/lecturaFactura";
import { leerPdf } from "../lectura";
import { idsDelConjunto, rechazoSinSesion, validarDestino } from "../permiso";

/**
 * VISTA PREVIA de un PDF de cuentas de cobro.
 *
 * Lee el PDF, lo parte en facturas y devuelve lo leído, con las dudas de cada
 * factura (`motivos`), el período que declara cada documento y la huella
 * (SHA-256) del archivo. No publica nada en S3 ni escribe en la base: eso lo
 * hace `/api/facturas/confirmar`, y solo con lo que la administración aceptó.
 *
 * Antes esta ruta subía cada PDF a S3 al leerlo, con una llave fija por
 * período y casa: la vista previa de un PDF equivocado pisaba los publicados
 * aunque se cancelara (auditoría de facturación, F-07).
 *
 * El conjunto llega como `condominioId` (o `condominioLegacyId`, de la web
 * anterior) y el permiso se valida igual que al confirmar (`validarDestino`).
 */
export async function POST(req: NextRequest) {
  try {
    const sinSesion = await rechazoSinSesion();
    if (sinSesion) return sinSesion;

    const form = await req.formData();
    const file = form.get("pdf") as File | null;
    const ids = idsDelConjunto(form);
    if (!file || !ids) {
      return NextResponse.json(
        { error: "Faltan campos: pdf, condominioId (o condominioLegacyId)" },
        { status: 400 },
      );
    }

    const { rechazo } = await validarDestino(ids);
    if (rechazo) return rechazo;

    const leido = await leerPdf(new Uint8Array(await file.arrayBuffer()));

    /* Una factura que no cuadra sale igual en `invoices` (con sus motivos),
     * para que se vea y se decida; y además se cuenta en `parseErrors`, que
     * es lo que la pantalla muestra como aviso. Nunca como válida sin aviso. */
    const conDudas = leido.facturas
      .filter((f) => f.motivos.length > 0)
      .map((f) => ({
        pages: f.paginas,
        unitIdentifier: f.unitIdentifier,
        error: f.motivos.map((m) => MENSAJE_LECTURA[m]).join(" "),
      }));
    const parseErrors = [
      ...leido.errores.map((e) => ({ pages: e.paginas, error: e.error })),
      ...conDudas,
    ];

    return NextResponse.json({
      archivo: file.name,
      hash: leido.hash,
      total: leido.facturas.length + leido.errores.length,
      processed: leido.facturas.length,
      errors: parseErrors.length,
      invoices: leido.facturas.map((f) => ({ ...f, pageCount: f.paginas.length })),
      parseErrors,
      /** Grupos de páginas que no se pudieron leer como factura. */
      noLeidas: leido.errores,
      periodosDocumento: [...new Set(leido.facturas.map((f) => f.periodoDocumento))],
    });
  } catch (e) {
    console.error("[facturas/upload]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo leer el PDF." },
      { status: 500 },
    );
  }
}
