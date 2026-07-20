// Migración — ciudad_del_campo_ii → Convex
// Uso: SRC_DB='postgres://...' node migrate/ciudad-del-campo.mjs

import pg from "pg";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, "../packages/backend");
const LEGACY_DB = "ciudad_del_campo_ii";

const CONDOMINIO = {
  legacyDatabaseName: LEGACY_DB,
  legacyId: "1a56ac61-2332-46f2-881c-a38acf516fde",
  name: "Ciudad del Campo II",
  subdomain: "ciudad-del-campo-ii",
  nit: "900951156-5",
  address: "Carrera 44#26 SUR",
  city: "Villavicencio",
  timezone: "America/Bogota",
  logo: "https://vekino.s3.us-east-1.amazonaws.com/condominios/logos/temp-1771267815097-1771267815098.webp",
  primaryColor: "#0654c1",
  subscriptionPlan: "basico",
  unitLimit: 205,
  isActive: true,
};

const ROLE_MAP = {
  ADMIN: "administrador",
  CONTADORA: "contadora",
  PROPIETARIO: "propietario",
  ARRENDATARIO: "arrendatario",
  RESIDENTE: "residente",
  GUARDIA_SEGURIDAD: "guardia",
  REPRESENTANTE_ASAMBLEA: "representante_asamblea",
  JUNTA_DIRECTIVA: "junta_directiva",
};
const TIPO_DOC = new Set(["CC", "CE", "NIT", "PASAPORTE", "TI", "PEP"]);
const TIPO_UNIDAD = {
  APARTAMENTO: "apartamento",
  CASA: "casa",
  LOCAL: "local",
  PARQUEADERO: "parqueadero",
  DEPOSITO: "deposito",
  OFICINA: "oficina",
};
const ESTADO_UNIDAD = {
  OCUPADA: "ocupada",
  DESOCUPADA: "desocupada",
  EN_MORA: "en_mora",
  INACTIVA: "inactiva",
};

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function runConvex(fn, payload) {
  const out = execFileSync(
    "bunx",
    ["convex", "run", fn, JSON.stringify(payload)],
    { cwd: BACKEND, encoding: "utf8", maxBuffer: 1024 * 1024 * 32 },
  );
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
  const q = async (sql) => (await client.query(sql)).rows;

  console.log("→ Leyendo origen…");
  const users = await q(
    `select id, name, email, "emailVerified", image, "firstName", "lastName",
     "tipoDocumento"::text as td, "numeroDocumento", telefono, active, role::text as role, "unidadId"
     from "user"`,
  );
  const unidades = await q(
    `select id, identificador, tipo::text as tipo, "coeficienteCopropiedad" as coef, estado::text as estado
     from "unidad"`,
  );
  const links = await q(`select "userId", "unidadId" from "usuario_unidad"`);
  await client.end();

  console.log(`   users=${users.length} unidades=${unidades.length} links=${links.length}`);

  const userRole = new Map();
  const userPrimaryUnidad = new Map();
  const seenEmails = new Set();
  let emailFixes = 0;

  const userPayload = users.map((u) => {
    const roles = new Set();
    const main = ROLE_MAP[u.role];
    if (main) roles.add(main);
    if (roles.size === 0) roles.add("residente");

    userRole.set(u.id, u.role);
    userPrimaryUnidad.set(u.id, u.unidadId);

    let email = (u.email ?? "").trim().toLowerCase();
    if (!email) {
      email = `${u.id}@sin-correo.cdc2.local`;
      emailFixes++;
    }
    if (seenEmails.has(email)) {
      email = `${u.id}.${email}`;
      emailFixes++;
    }
    seenEmails.add(email);

    const td = (u.td ?? "").toUpperCase();
    return {
      legacyId: u.id,
      email,
      name: u.name ?? email,
      emailVerified: !!u.emailVerified,
      image: u.image ?? undefined,
      firstName: u.firstName ?? undefined,
      lastName: u.lastName ?? undefined,
      tipoDocumento: TIPO_DOC.has(td) ? td : undefined,
      numeroDocumento: u.numeroDocumento ?? undefined,
      telefono: u.telefono ?? undefined,
      active: u.active ?? true,
      roles: [...roles],
    };
  });

  const unidadPayload = unidades.map((un) => {
    const ident = (un.identificador ?? "").trim();
    return {
      legacyId: un.id,
      tipo: TIPO_UNIDAD[un.tipo] ?? "casa",
      estado: ESTADO_UNIDAD[un.estado] ?? "desocupada",
      numero: ident || un.id,
      coeficiente: typeof un.coef === "number" ? un.coef : undefined,
    };
  });

  const linkPayload = links.map((l) => {
    const role = userRole.get(l.userId);
    const vinculo =
      role === "PROPIETARIO"
        ? "propietario"
        : role === "ARRENDATARIO"
          ? "arrendatario"
          : "residente";
    return {
      userLegacyId: l.userId,
      unidadLegacyId: l.unidadId,
      vinculo,
      esPrincipal: userPrimaryUnidad.get(l.userId) === l.unidadId,
    };
  });

  if (emailFixes) console.log(`   (${emailFixes} emails ajustados)`);

  // 1) Condominio
  console.log("→ Condominio…");
  console.log("   " + runConvex("migrations:upsertCondominio", CONDOMINIO));

  // 2) Usuarios + membresías
  console.log("→ Usuarios + membresías…");
  let uAcc = 0;
  for (const c of chunk(userPayload, 80)) {
    const r = runConvex("migrations:bulkUsers", { legacyDatabaseName: LEGACY_DB, users: c });
    uAcc += c.length;
    console.log(`   ${uAcc}/${userPayload.length}  ${r}`);
  }

  // 3) Unidades
  console.log("→ Unidades…");
  let unAcc = 0;
  for (const c of chunk(unidadPayload, 100)) {
    const r = runConvex("migrations:bulkUnidades", { legacyDatabaseName: LEGACY_DB, unidades: c });
    unAcc += c.length;
    console.log(`   ${unAcc}/${unidadPayload.length}  ${r}`);
  }

  // 4) usuario↔unidad
  console.log("→ usuario↔unidad…");
  let lAcc = 0;
  for (const c of chunk(linkPayload, 100)) {
    const r = runConvex("migrations:bulkUsuarioUnidad", { legacyDatabaseName: LEGACY_DB, links: c });
    lAcc += c.length;
    console.log(`   ${lAcc}/${linkPayload.length}  ${r}`);
  }

  console.log("✅ Ciudad del Campo II migrado a Convex.");
}

main().catch((e) => {
  console.error("✖", e.message);
  process.exit(1);
});
