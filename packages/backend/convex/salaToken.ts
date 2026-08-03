import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { configMedios, firmarJwt, nombreSala } from "./lib/livekitJwt";

/**
 * Token de acceso al servidor de medios.
 *
 * LiveKit no tiene usuarios: confía en un JWT firmado con el secreto del
 * servidor. Ese secreto vive SOLO en Convex (`LIVEKIT_API_SECRET`) y nunca
 * llega al navegador; el cliente pide un token y recibe uno acotado a SU
 * sala, SU identidad y SUS permisos.
 */

/**
 * Entrega el token de la sala al usuario actual.
 *
 * `canPublish` sale del MISMO estado que ya gobierna la sala: la mesa
 * siempre, el residente solo con la palabra concedida. Si se calculara en el
 * cliente, cualquiera se otorgaría el micrófono editando el JavaScript; aquí
 * el permiso viaja firmado y el servidor de medios lo hace cumplir.
 *
 * Dura 6 horas: una asamblea larga no debe cortarse por un token vencido.
 */
export const tokenSala = action({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args): Promise<{
    url: string;
    token: string;
    sala: string;
    puedePublicar: boolean;
  } | null> => {
    // Sin servidor configurado la sala sigue funcionando en P2P: devolver
    // null es "no hay SFU", no un error.
    const cfg = configMedios();
    if (!cfg) return null;

    const sala = await ctx.runQuery(api.asambleaSala.miSala, {
      asambleaId: args.asambleaId,
    });
    if (!sala) return null;
    if (!sala.enCurso) return null;

    const puedePublicar = sala.esMesa || sala.tienePalabra === true;
    const nombre = nombreSala(args.asambleaId);

    const ahora = Math.floor(Date.now() / 1000);
    const token = await firmarJwt(
      {
        iss: cfg.apiKey,
        sub: sala.identidad,
        name: sala.nombre,
        nbf: ahora - 10, // margen por relojes desincronizados
        exp: ahora + 6 * 60 * 60,
        video: {
          room: nombre,
          roomJoin: true,
          canSubscribe: true,
          canPublish: puedePublicar,
          canPublishData: true,
        },
      },
      cfg.apiSecret,
    );

    return {
      url: process.env.LIVEKIT_URL!,
      token,
      sala: nombre,
      puedePublicar,
    };
  },
});

/** Token LiveKit para un invitado (sesión sin cuenta). */
export const tokenSalaInvitado = action({
  args: {
    asambleaId: v.id("asambleas"),
    sesionCodigo: v.string(),
  },
  handler: async (ctx, args): Promise<{
    url: string;
    token: string;
    sala: string;
    puedePublicar: boolean;
  } | null> => {
    const cfg = configMedios();
    if (!cfg) return null;

    const sala = await ctx.runQuery(api.asambleaInvitados.miSalaInvitado, {
      sesionCodigo: args.sesionCodigo,
    });
    if (!sala) return null;
    if (!sala.enCurso) return null;
    if (sala.asambleaId !== args.asambleaId) return null;

    const puedePublicar = sala.tienePalabra === true;
    const nombre = nombreSala(args.asambleaId);
    const ahora = Math.floor(Date.now() / 1000);
    const token = await firmarJwt(
      {
        iss: cfg.apiKey,
        sub: sala.identidad,
        name: sala.nombre,
        nbf: ahora - 10,
        exp: ahora + 6 * 60 * 60,
        video: {
          room: nombre,
          roomJoin: true,
          canSubscribe: true,
          canPublish: puedePublicar,
          canPublishData: true,
        },
      },
      cfg.apiSecret,
    );

    return {
      url: process.env.LIVEKIT_URL!,
      token,
      sala: nombre,
      puedePublicar,
    };
  },
});
