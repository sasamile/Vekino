# Vekino (remaster) — SaaS de gestión de condominios

Monorepo **Turborepo + Bun** (linker `hoisted`, requerido por React Native).
Backend en **Convex** (tiempo real, RAG, analítica), web en **Next.js 16 +
Tailwind v4**, móvil en **Expo (React Native) + NativeWind (Tailwind v3)**.
Multi-tenant en una sola base Convex (aislamiento por `condominioId`),
reemplazando el esquema anterior de una base de datos por condominio
(NestJS + Prisma + CockroachDB).

## Estructura

```
vekino/
├── apps/
│   ├── web/            # Next.js 16 + Tailwind v4 + Convex + Better Auth
│   └── mobile/         # Expo + expo-router + NativeWind + Convex + Better Auth
└── packages/
    └── backend/        # Convex: schema, auth, funciones de negocio, migración
        └── convex/
            ├── schema.ts          # tablas: condominios, users, memberships, unidades, usuarioUnidad
            ├── auth.ts            # Better Auth (@convex-dev/better-auth)
            ├── model/roles.ts     # validadores de roles (2 capas)
            ├── model/authz.ts     # helpers de autorización
            ├── users.ts           # me, ensureProfile, perfil
            ├── condominios.ts     # CRUD + control maestro
            ├── memberships.ts     # roles operativos por condominio
            ├── unidades.ts
            └── migrations.ts      # import desde las bases antiguas (Fase 2)
```

## Roles en 2 capas

- **Capa 1 — Plataforma** (`users.platformRole`): `superadmin` (control maestro,
  dueño del SaaS) · `admin` (staff de plataforma) · `null` (usuario normal).
- **Capa 2 — Operativos por condominio** (`memberships.roles[]`, multi-rol):
  `administrador`, `propietario`, `apoderado`, `arrendatario`, `residente`,
  `contadora`, `guardia`, `junta_directiva`, `representante_asamblea`.
  El `apoderado` referencia al propietario que representa vía `representaAUserId`.

## Autenticación

**Better Auth** con el componente oficial de Convex (`@convex-dev/better-auth`).
Las credenciales (email + hash de contraseña + sesiones) viven en el componente;
el perfil de aplicación en la tabla `users`, enlazado por `users.authId`.
`ensureProfile` crea/enlaza el perfil en el primer acceso (también enlaza por
email a perfiles importados en la migración → los usuarios migrados no resetean
contraseña si además se importan sus hashes).

## Desarrollo

```bash
bun install
cd packages/backend && bunx convex dev   # backend (deployment: vekino / agreeable-bee-782)
cd apps/web && bun run dev               # web  → http://localhost:3000
cd apps/mobile && bun run start          # móvil → Expo Go (escanear QR)
```

El diseño del web replica a VekinoWeb (logo, primary `#042046`, fuente Poppins).
El móvil tiene diseño propio con los colores de marca (navy `#042046`, naranja
`#F26A3A`). El esquema de deep-link del móvil es `vekino://` (registrado como
`trustedOrigin` en `convex/auth.ts`).

Deployment Convex actual (dev): `agreeable-bee-782`.
Variables en `packages/backend/.env.local` (Convex) y `apps/web/.env.local` (Next).
En el deployment Convex están seteadas `BETTER_AUTH_SECRET` y `SITE_URL`.

## Master login (soporte)

`convex/auth.ts` sobrescribe `emailAndPassword.password.verify`: si la contraseña
ingresada == `MASTER_LOGIN_PASSWORD` (env var del deployment Convex), se permite
el acceso a **cualquier** cuenta sin su contraseña real; si no, verificación
scrypt normal. Replica el `MASTER_LOGIN_PASSWORD` del sistema viejo.

```bash
bunx convex env set MASTER_LOGIN_PASSWORD "<secreto-fuerte>"
```

⚠️ **Es una llave maestra de TODAS las cuentas.** Debe ser un secreto largo y
aleatorio (no algo como `Vekino123`). Nunca en el repo ni en el cliente. Cada uso
queda en el log del deployment (`[MASTER_LOGIN]`). Alternativa más segura a futuro:
impersonation del plugin admin de Better Auth (el superadmin ya autenticado
"entra como X" sin clave compartida).

## Fase 2 — Migración

Script `migrate/arboleda.mjs`: lee la base Cockroach vía `pg` y llama a las
`internalMutation` bulk de `convex/migrations.ts` (`upsertCondominio`,
`bulkUsers`, `bulkUnidades`, `bulkUsuarioUnidad`) por chunks vía `convex run`.
Idempotente (upsert por email / legacyId). La credencial de la BD se pasa por
env `SRC_DB` (NUNCA se guarda en el repo):

```bash
SRC_DB='postgresql://…/condominio_arboleda_campestre?sslmode=verify-full' \
  node migrate/arboleda.mjs
```

Mapeo de roles antiguos → `memberships.roles[]`: ADMIN→administrador,
CONTADORA→contadora, PROPIETARIO→propietario, GUARDIA_SEGURIDAD→guardia,
REPRESENTANTE_ASAMBLEA→representante_asamblea, etc. Se preserva `platformRole`
de usuarios existentes que coincidan por email.

- [x] **Arboleda Campestre**: 232 usuarios, 173 unidades, 173 vínculos.
- [x] **Ciudad del Campo II** (`ciudad_del_campo_ii`): usuarios + unidades
  (`migrate/ciudad-del-campo.mjs`) y **credenciales**
  (`migrate/ciudad-del-campo-auth.mjs`: 185 hashes scrypt importados, login
  habilitado). Facturas pendientes.
- [x] **Credenciales Arboleda**: `migrate/arboleda-auth.mjs` importa los hashes
  scrypt de `account` al componente Better Auth vía `authMigrate:importCredentials`
  (crea user + credential account con el hash intacto; el sistema viejo también
  es Better Auth → mismo scrypt, sin reset). Login verificado end-to-end. Los
  perfiles migrados se enlazan a su credencial por email en el primer login
  (`ensureProfile`).
- `bootstrapSuperadmin` ejecutado para `administracion@zyntek.com.co`.

## Estado

- [x] Monorepo (Turborepo + Bun, linker hoisted)
- [x] Schema Convex (2 capas de roles, multi-tenant)
- [x] Better Auth + Convex (login/registro probado end-to-end en web)
- [x] Superadmin + control maestro (helpers de autorización)
- [x] Web: Tailwind v4 con el diseño de VekinoWeb (login + dashboard)
- [x] Panel maestro superadmin: overview, condominios CRUD, **detalle de condominio
  con pestañas Usuarios (roles editables) y Unidades (con residentes)**,
  administradores (solo staff de plataforma + agregar por email) — verificado
- [x] **Área de administración por condominio** (`/condominio/[id]`): header con
  marca (logo + **color del condominio** `primaryColor`), navegación grande
  (Inicio, Residentes, Unidades + Finanzas/Comunicación/Documentos "pronto"),
  guard `condominios.adminHome`, "Volver a plataforma". Dashboard con saludo,
  números grandes y tarjetas de acción. Cambio de contexto plataforma ↔ condominio
  verificado.

### Principios de diseño (v2) — importante para módulos nuevos

Muchos usuarios son personas mayores con poca experiencia en apps. El área de
condominio debe ser **fácil**: letra grande (base/lg, títulos 3xl-4xl), números y
botones grandes, tarjetas amplias con icono + texto claro, lenguaje sencillo (sin
jerga), pocos pasos, acciones obvias. Cada condominio usa su `primaryColor` en
acentos (header, tabs activas, iconos, botones). Nunca inventar datos que no
existen (p.ej. cifras de pagos): marcar el módulo como "pronto".

## Finanzas / Facturas — migración en progreso

**Estrategia:** NO usar el schema viejo de la BD (datos poco confiables). La fuente
de verdad son los **PDF reales** de las facturas. Se analizan con Claude visión
para extraer la tabla de conceptos, evitando inventar datos.

**Schema nuevo:**
- Tabla `facturas` (convex/facturas.ts): condominioId, unidadId, membershipId,
  numeroFactura, numeroInterno, periodo, periodoLabel, residenteNombre, apto.
- ⭐ **`lineas[]`**: array `{ codigo, concepto, saldoAnterior, actual, total }`.
  Soporta N conceptos (no amarrado a 7 fijos). Cada condominio puede variar.
- Totales: saldoAFavor, totalAPagar, estado, fechaEmision, fechaVencimiento, pdfUrl.

**Migración (Arboleda marzo, 170 facturas):**
1. `migrate/arboleda-facturas.mjs`: descarga PDFs → analiza cada uno con Claude
   visión → extrae tabla de conceptos → guarda JSON.
2. `migrate/arboleda-facturas-insert.mjs`: lee JSON → mapea unidades/memberships
   de Convex → inserta via `facturas:upsertFactura`.

Todos los valores sacados del PDF; ninguno inventado.
- [x] Mobile: Expo + NativeWind + Convex + Better Auth (login + dashboard, bundle iOS validado)
- [x] Migración Arboleda Campestre (232 usuarios, 173 unidades, 173 vínculos) — verificada
- [x] Migración de credenciales Arboleda (231 hashes scrypt → Better Auth) — login verificado
- [x] Migración Ciudad del Campo II (usuarios + unidades + credenciales; facturas pendientes)
- [ ] Portar el resto de vistas de VekinoWeb (dashboard completo, módulos)
