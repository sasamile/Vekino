// Migración de credenciales — condominio_arboleda_campestre → Better Auth (Convex)
// Uso:  SRC_DB='postgres://...' node migrate/arboleda-auth.mjs
// Importa los hashes de contraseña existentes (scrypt de Better Auth) sin reset.

import pg from "pg";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, "../packages/backend");

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function runConvex(fn, payload) {
  return execFileSync("bunx", ["convex", "run", fn, JSON.stringify(payload)], {
    cwd: BACKEND,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
  }).trim();
}

async function main() {
  const url = process.env.SRC_DB;
  if (!url) throw new Error("Falta SRC_DB");
  const client = new pg.Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/i, ""),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows } = await client.query(`
    select u.email, u.name, u."emailVerified" as ev, a.password as pw
    from account a
    join "user" u on u.id = a."userId"
    where a."providerId" = 'credential' and a.password is not null and a.password <> ''
  `);
  await client.end();

  const accounts = rows
    .filter((r) => r.email)
    .map((r) => ({
      email: r.email.trim().toLowerCase(),
      name: r.name ?? r.email,
      emailVerified: !!r.ev,
      hash: r.pw,
    }));

  console.log(`→ ${accounts.length} credenciales a importar`);

  let created = 0;
  let skipped = 0;
  let errors = 0;
  let done = 0;
  for (const c of chunk(accounts, 40)) {
    const out = runConvex("authMigrate:importCredentials", { accounts: c });
    const r = JSON.parse(out);
    created += r.created;
    skipped += r.skipped;
    errors += r.errors;
    done += c.length;
    console.log(
      `   ${done}/${accounts.length}  +${r.created} =${r.skipped} !${r.errors}` +
        (r.errorEmails?.length ? `  err: ${r.errorEmails.join(", ")}` : ""),
    );
  }

  console.log(
    `✅ Credenciales: creadas=${created} omitidas=${skipped} errores=${errors}`,
  );
}

main().catch((e) => {
  console.error("✖", e.message);
  process.exit(1);
});
