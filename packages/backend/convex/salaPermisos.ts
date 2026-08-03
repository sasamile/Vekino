import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { configMedios, nombreSala, tokenAdmin } from "./lib/livekitJwt";

/**
 * Sincroniza con el servidor de medios quién puede hablar.
 *
 * Por qué existe: el permiso de publicar viaja dentro del token, y el token
 * dura seis horas. Cambiar una fila de `salaPalabra` no le dice NADA al
 * servidor de medios — así que, sin esto, conceder la palabra no la habilita
 * (el residente sigue con su token de solo escucha) y quitarla no la corta
 * (quien ya estaba al aire sigue transmitiendo con el token viejo).
 *
 * Se llama desde el scheduler al conceder y al retirar la palabra. Es
 * `internalAction` a propósito: nadie desde el navegador debe poder pedir
 * que le suban los permisos.
 */
export const sincronizarPalabra = internalAction({
  args: {
    asambleaId: v.id("asambleas"),
    userId: v.id("users"),
    puedePublicar: v.boolean(),
  },
  handler: async (_ctx, args) => {
    const cfg = configMedios();
    // Sin servidor de medios la sala va por malla, donde el corte ya lo hizo
    // la mutación borrando la fila del emisor.
    if (!cfg) return;

    const sala = nombreSala(args.asambleaId);
    const token = await tokenAdmin(cfg, sala);

    const r = await fetch(
      `${cfg.http}/twirp/livekit.RoomService/UpdateParticipant`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room: sala,
          identity: args.userId,
          permission: {
            can_subscribe: true,
            can_publish: args.puedePublicar,
            can_publish_data: true,
          },
        }),
      },
    );

    /* Que la persona no esté conectada es lo normal: se le concede la palabra
     * a alguien que aún no ha entrado, o se le retira a alguien que ya se fue.
     * Cuando entre, su token nuevo ya traerá el permiso correcto. */
    if (!r.ok) {
      const detalle = await r.text().catch(() => "");
      if (r.status === 404 || detalle.includes("not_found")) return;
      throw new Error(
        `No se pudo sincronizar la palabra en el servidor de medios (${r.status}): ${detalle}`,
      );
    }
  },
});
