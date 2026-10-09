// Lee un PDF con el MISMO código de la vista previa de la web (leerPdf) y
// resume lo que entendió, sin escribir nada en ningún lado. Sirve para
// comprobar un PDF sintético antes de subirlo.
//
// Uso (desde apps/web, para que resuelva sus dependencias):
//   bun ../../qa/factory/leer-pdf.ts <pdf> [<pdf> ...]
import fs from "fs";
import { leerPdf } from "../../apps/web/app/api/facturas/lectura";

for (const archivo of process.argv.slice(2)) {
  const { hash, facturas, errores, totalPaginas } = await leerPdf(new Uint8Array(fs.readFileSync(archivo)));
  console.log(`\n# ${archivo} · ${totalPaginas} hoja(s) · sha256 ${hash.slice(0, 12)}`);
  for (const f of facturas) {
    const sumaLineas = f.lineas.reduce((s, l) => s + l.total, 0);
    console.log(
      JSON.stringify({
        casa: f.unitIdentifier,
        periodo: f.periodoDocumento,
        total: f.totalAPagar,
        conDescuento: f.totalConDescuento ?? null,
        diaDescuento: f.diaLimiteDescuento ?? null,
        saldoAnterior: f.saldoAnteriorDocumento ?? null,
        sumaLineas,
        lineas: f.lineas.map((l) => `${l.codigoTexto ?? l.codigo}:${l.saldoAnterior}+${l.actual}=${l.total}`),
        motivos: f.motivos,
        paginas: f.paginas,
      }),
    );
  }
  for (const e of errores) console.log("ERROR", JSON.stringify(e));
}
