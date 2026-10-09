import { v } from "convex/values";
import { query } from "./_generated/server";
import { decidirVersion } from "./lib/versionApp";

/**
 * ¿Esta version de la app movil debe actualizarse? (Fase 4)
 *
 * La app la consulta al abrir, con su version y su plataforma. Sin
 * `MOVIL_VERSION_MINIMA` en el deployment responde que no, a todos. No pide
 * sesion: tambien la pantalla de ingreso tiene que poder avisar. Ver
 * `lib/versionApp.ts`.
 */
export const versionMinima = query({
  args: {
    version: v.optional(v.string()),
    plataforma: v.optional(v.string()),
  },
  handler: async (_ctx, args) =>
    decidirVersion(process.env, args.version ?? null, args.plataforma ?? null),
});
