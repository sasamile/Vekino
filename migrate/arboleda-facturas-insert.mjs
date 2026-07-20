#!/usr/bin/env node
/**
 * Script: Inserta facturas extraídas en Convex.
 *
 * Recibe JSON del script anterior (via stdin o archivo) y los inserta en Convex.
 *
 * Ejecutar:
 *   node arboleda-facturas.mjs > facturas.json
 *   CONVEX_DEPLOYMENT='...' node arboleda-facturas-insert.mjs < facturas.json
 */

import fs from "fs";
import { ConvexHttpClient } from "convex/browser";

const convex = new ConvexHttpClient(process.env.CONVEX_DEPLOYMENT);

// Leer JSON del stdin
let jsonData = "";
process.stdin.on("data", (chunk) => {
  jsonData += chunk;
});

process.stdin.on("end", async () => {
  try {
    const facturas = JSON.parse(jsonData);
    console.log(`📥 Insertando ${facturas.length} facturas...`);

    // Necesitamos mapear unidades y memberships de Convex
    // Para este test, asumimos que ya están migradas

    // TODO: obtener IDs de Convex
    const condominioId = "PLACEHOLDER_ARBOLEDA_ID"; // TODO
    const unitMap = new Map(); // TODO: cargar desde Convex

    let insertadas = 0;
    let errores = 0;

    for (const f of facturas) {
      try {
        process.stdout.write(`  ${f.numeroFactura}...`);

        const unidadId = unitMap.get(f.unidadLegacyId);
        if (!unidadId) {
          throw new Error(`unidad ${f.unidadLegacyId} no mapeada`);
        }

        const [year, month, day] = f.fechaEmision.split("-");
        const emDate = new Date(`${year}-${month}-${day}`);
        const vencDate = new Date(year, parseInt(month) - 1 + 1, 15);

        await convex.mutation("facturas:upsertFactura", {
          condominioId,
          unidadId,
          numeroFactura: f.numeroFactura,
          numeroInterno: f.numeroInterno,
          periodo: f.periodo,
          periodoLabel: f.periodoLabel,
          residenteNombre: f.resideName,
          apto: f.apto,
          vrAdmon: f.vrAdmon || 0,
          lineas: f.lineas,
          saldoAFavor: f.saldoAFavor,
          totalAPagar: f.totalAPagar,
          fechaEmision: emDate.getTime(),
          fechaVencimiento: vencDate.getTime(),
          estado: "pendiente",
          pdfUrl: f.pdfUrl,
          legacyId: f.legacyId,
        });

        console.log(" ✓");
        insertadas++;
      } catch (e) {
        console.log(` ✗ ${e.message}`);
        errores++;
      }
    }

    console.log(`\n✅ ${insertadas} insertadas, ${errores} errores`);
    process.exit(errores > 0 ? 1 : 0);
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  }
});
