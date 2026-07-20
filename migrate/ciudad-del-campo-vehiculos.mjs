// Migración de vehículos — ciudad_del_campo_ii → Convex
// Uso: SRC_DB='postgresql://…/ciudad_del_campo_ii?sslmode=verify-full' node migrate/ciudad-del-campo-vehiculos.mjs

import pg from "pg";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, "../packages/backend");
const LEGACY_DB = "ciudad_del_campo_ii";

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function runConvex(fn, payload) {
  const out = execFileSync("bunx", ["convex", "run", fn, JSON.stringify(payload)], {
    cwd: BACKEND,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
  });
  return out.trim();
}

async function main() {
  const url = process.env.SRC_DB;
  if (!url) throw new Error("Falta SRC_DB");

  const client = new pg.Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/i, ""),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const rows = (
    await client.query(
      `select id, placa, tipo, "unidadId" as unidad, propietario, activo from "vehiculo"`,
    )
  ).rows;
  await client.end();

  const payload = rows
    .filter((v) => v.activo !== false && v.placa && v.unidad)
    .map((v) => ({
      legacyId: v.id,
      unidadLegacyId: v.unidad,
      placa: v.placa,
      tipo: v.tipo ?? undefined,
      observaciones: v.propietario ? `Prop.: ${v.propietario}` : undefined,
    }));

  console.log(`→ ${rows.length} vehículos en origen · ${payload.length} a migrar`);

  let acc = 0;
  const totals = { upserted: 0, skipped: 0 };
  for (const c of chunk(payload, 100)) {
    const r = runConvex("migrations:bulkVehiculos", {
      legacyDatabaseName: LEGACY_DB,
      vehiculos: c,
    });
    try {
      const parsed = JSON.parse(r);
      totals.upserted += parsed.upserted ?? 0;
      totals.skipped += parsed.skipped ?? 0;
    } catch {
      /* noop */
    }
    acc += c.length;
    console.log(`   ${acc}/${payload.length}  ${r}`);
  }

  console.log(`✅ Vehículos: ${totals.upserted} migrados, ${totals.skipped} omitidos.`);
}

main().catch((e) => {
  console.error("✖", e.message);
  process.exit(1);
});
