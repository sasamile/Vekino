// Migración Fase 2 — condominio_arboleda_campestre → Convex (vekino)
// Uso:  SRC_DB='postgres://...' node migrate/arboleda.mjs
// Requiere estar logueado en Convex (el CLI usa creds admin para internalMutations).

import pg from "pg";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, "../packages/backend");
const LEGACY_DB = "condominio_arboleda_campestre";

// Datos maestros del condominio (de la tabla `condominio` de la BD maestra).
const CONDOMINIO = {
  legacyDatabaseName: LEGACY_DB,
  legacyId: "03579eba-bf70-48a3-85a5-20350e9316fb",
  name: "ARBOLEDA CAMPESTRE",
  subdomain: "arboleda",
  nit: "1006874417",
  address: "Cra 13 N° 75-20 Ofi. 206 Edificio ICALY",
  city: "Villavicencio",
  timezone: "America/Bogota",
  logo: "https://vekino.s3.us-east-1.amazonaws.com/condominios/logos/03579eba-bf70-48a3-85a5-20350e9316fb-1781832271200.webp",
  primaryColor: "#f65609",
  subscriptionPlan: "basico",
  unitLimit: 384,
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
    `select id, name, email, "emailVerified", image, "firstName", "lastName", "tipoDocumento"::text as td, "numeroDocumento", telefono, active, role::text as role, "unidadId" from "user"`,
  );
  const addRoles = await q(
    `select "userId", role::text as role from "user_additional_role"`,
  );
  const unidades = await q(
    `select id, identificador, tipo::text as tipo, "coeficienteCopropiedad" as coef, estado::text as estado from "unidad"`,
  );
  const links = await q(`select "userId", "unidadId" from "usuario_unidad"`);
  await client.end();

  console.log(
    `   users=${users.length} unidades=${unidades.length} usuario_unidad=${links.length} extraRoles=${addRoles.length}`,
  );

  // Roles adicionales por usuario
  const extraByUser = new Map();
  for (const r of addRoles) {
    const m = ROLE_MAP[r.role];
    if (!m) continue;
    if (!extraByUser.has(r.userId)) extraByUser.set(r.userId, new Set());
    extraByUser.get(r.userId).add(m);
  }

  // Mapa userLegacyId → { role principal (para vínculo), unidadId principal }
  const userRole = new Map();
  const userPrimaryUnidad = new Map();
  const seenEmails = new Set();
  let emailFixes = 0;

  const userPayload = users.map((u) => {
    const roles = new Set();
    const main = ROLE_MAP[u.role];
    if (main) roles.add(main);
    for (const r of extraByUser.get(u.id) ?? []) roles.add(r);
    if (roles.size === 0) roles.add("residente");

    userRole.set(u.id, u.role);
    userPrimaryUnidad.set(u.id, u.unidadId);

    let email = (u.email ?? "").trim().toLowerCase();
    if (!email) {
      email = `${u.id}@sin-correo.arboleda.local`;
      emailFixes++;
    }
    // Colisión de email dentro del lote → hacer único (no perder datos)
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
    let torre;
    let numero = ident;
    const parts = ident.split(/\s+/);
    if (parts.length > 1 && /^t/i.test(parts[0])) {
      torre = parts[0];
      numero = parts.slice(1).join(" ");
    }
    return {
      legacyId: un.id,
      tipo: TIPO_UNIDAD[un.tipo] ?? "otro",
      estado: ESTADO_UNIDAD[un.estado] ?? "desocupada",
      numero: numero || ident || un.id,
      torre,
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

  // 2) Usuarios + membresías (chunks de 80)
  console.log("→ Usuarios + membresías…");
  let uAcc = 0;
  for (const c of chunk(userPayload, 80)) {
    const r = runConvex("migrations:bulkUsers", {
      legacyDatabaseName: LEGACY_DB,
      users: c,
    });
    uAcc += c.length;
    console.log(`   ${uAcc}/${userPayload.length}  ${r}`);
  }

  // 3) Unidades (chunks de 100)
  console.log("→ Unidades…");
  let unAcc = 0;
  for (const c of chunk(unidadPayload, 100)) {
    const r = runConvex("migrations:bulkUnidades", {
      legacyDatabaseName: LEGACY_DB,
      unidades: c,
    });
    unAcc += c.length;
    console.log(`   ${unAcc}/${unidadPayload.length}  ${r}`);
  }

  // 4) usuario↔unidad (chunks de 100)
  console.log("→ usuario↔unidad…");
  let lAcc = 0;
  for (const c of chunk(linkPayload, 100)) {
    const r = runConvex("migrations:bulkUsuarioUnidad", {
      legacyDatabaseName: LEGACY_DB,
      links: c,
    });
    lAcc += c.length;
    console.log(`   ${lAcc}/${linkPayload.length}  ${r}`);
  }

  console.log("✅ Migración de Arboleda Campestre completada.");
}

main().catch((e) => {
  console.error("✖", e.message);
  process.exit(1);
});
