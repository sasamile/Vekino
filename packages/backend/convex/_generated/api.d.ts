/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as asambleas from "../asambleas.js";
import type * as auth from "../auth.js";
import type * as authMigrate from "../authMigrate.js";
import type * as avalHttp from "../avalHttp.js";
import type * as comunicados from "../comunicados.js";
import type * as condominios from "../condominios.js";
import type * as consejo from "../consejo.js";
import type * as dev from "../dev.js";
import type * as documentos from "../documentos.js";
import type * as facturas from "../facturas.js";
import type * as historial from "../historial.js";
import type * as http from "../http.js";
import type * as memberships from "../memberships.js";
import type * as migrations from "../migrations.js";
import type * as model_authz from "../model/authz.js";
import type * as model_roles from "../model/roles.js";
import type * as novedades from "../novedades.js";
import type * as pagos from "../pagos.js";
import type * as platform from "../platform.js";
import type * as portal from "../portal.js";
import type * as pqrs from "../pqrs.js";
import type * as reservas from "../reservas.js";
import type * as unidades from "../unidades.js";
import type * as users from "../users.js";
import type * as vehiculos from "../vehiculos.js";
import type * as visitantes from "../visitantes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  asambleas: typeof asambleas;
  auth: typeof auth;
  authMigrate: typeof authMigrate;
  avalHttp: typeof avalHttp;
  comunicados: typeof comunicados;
  condominios: typeof condominios;
  consejo: typeof consejo;
  dev: typeof dev;
  documentos: typeof documentos;
  facturas: typeof facturas;
  historial: typeof historial;
  http: typeof http;
  memberships: typeof memberships;
  migrations: typeof migrations;
  "model/authz": typeof model_authz;
  "model/roles": typeof model_roles;
  novedades: typeof novedades;
  pagos: typeof pagos;
  platform: typeof platform;
  portal: typeof portal;
  pqrs: typeof pqrs;
  reservas: typeof reservas;
  unidades: typeof unidades;
  users: typeof users;
  vehiculos: typeof vehiculos;
  visitantes: typeof visitantes;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
