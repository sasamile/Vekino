import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sendBrevoEmail } from "./lib/brevo";

/**
 * Vinculación de un WhatsApp con su residente.
 *
 * Desde que Meta permite @usuarios, el webhook puede llegar SIN teléfono: solo
 * con el BSUID. Ahí no hay forma de saber quién escribe, así que se le pide
 * que se identifique y se comprueba con un código enviado a su correo
 * registrado — el mismo listón que un "olvidé mi contraseña". Una vez
 * confirmado, el BSUID queda atado a la persona y no se vuelve a preguntar.
 */

const VIGENCIA_CODIGO_MS = 10 * 60 * 1000;

/** Busca al residente por documento. Solo sirve si es único e inequívoco. */
export const buscarPorDocumento = internalQuery({
  args: { documento: v.string() },
  handler: async (ctx, args) => {
    const doc = args.documento.replace(/\D/g, "");
    if (doc.length < 5) return null;

    const candidatos = await ctx.db
      .query("users")
      .withIndex("by_numeroDocumento", (q) => q.eq("numeroDocumento", doc))
      .collect();
    const activos = candidatos.filter((u) => u.active);

    // Dos personas con el mismo documento es dato sucio: no se adivina.
    if (activos.length !== 1) return null;
    const user = activos[0]!;

    const membresias = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const habilitado: string[] = [];
    for (const m of membresias) {
      if (!m.isActive) continue;
      const condo = await ctx.db.get(m.condominioId);
      if (condo?.isActive && condo.activeModules.includes("whatsapp")) {
        habilitado.push(condo.name);
      }
    }
    if (habilitado.length === 0) return null;

    return {
      userId: user._id,
      nombre: user.name,
      email: user.email,
      condominios: habilitado,
    };
  },
});

/**
 * Genera un código de 6 dígitos, lo manda al correo del residente y lo deja
 * guardado en la conversación (con vencimiento) para contrastarlo después.
 */
export const enviarCodigo = internalAction({
  args: {
    conversacionId: v.id("waConversations"),
    documento: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: false; motivo: string }
    | { ok: true; nombre: string; emailOculto: string }
  > => {
    const encontrado: {
      userId: Id<"users">;
      nombre: string;
      email: string;
      condominios: string[];
    } | null = await ctx.runQuery(internal.whatsappVinculacion.buscarPorDocumento, {
      documento: args.documento,
    });

    if (!encontrado) {
      return {
        ok: false as const,
        motivo:
          "No encontré ese documento en la plataforma. Verifícalo o escríbele a tu administración.",
      };
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000));

    try {
      await sendBrevoEmail({
        to: [{ email: encontrado.email, name: encontrado.nombre }],
        subject: "Tu código para WhatsApp — Vekino",
        htmlContent: `<!doctype html><html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#14213d;">
<p>Hola ${escapar(encontrado.nombre)}:</p>
<p>Alguien pidió vincular un WhatsApp con tu cuenta de Vekino. Tu código es:</p>
<p style="font-size:30px;font-weight:bold;letter-spacing:5px;color:#ff4f0a;">${codigo}</p>
<p>Vence en 10 minutos. Escríbelo en el chat de WhatsApp para terminar.</p>
<p style="color:#6f7788;font-size:13px;">Si no fuiste tú, ignora este mensaje y avísale a tu administración: sin este código nadie puede vincular tu cuenta.</p>
</body></html>`,
        textContent: `Hola ${encontrado.nombre}:\n\nTu código para vincular WhatsApp con Vekino es: ${codigo}\nVence en 10 minutos.\n\nSi no fuiste tú, ignora este mensaje y avísale a tu administración.`,
      });
    } catch {
      return {
        ok: false as const,
        motivo:
          "No pude enviarte el código a tu correo. Escríbele a tu administración.",
      };
    }

    await ctx.runMutation(internal.whatsapp.setConversacion, {
      conversacionId: args.conversacionId,
      paso: "vincular:codigo",
      contexto: {
        vinculacion: {
          userId: encontrado.userId,
          codigo,
          expiraAt: Date.now() + VIGENCIA_CODIGO_MS,
          intentos: 0,
        },
      },
    });

    return {
      ok: true as const,
      nombre: encontrado.nombre,
      emailOculto: ocultarEmail(encontrado.email),
    };
  },
});

/** "carolpaulinmora@gmail.com" → "car••••••••@gmail.com" */
function ocultarEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!usuario || !dominio) return "tu correo registrado";
  const visible = usuario.slice(0, 3);
  return `${visible}${"•".repeat(Math.max(3, usuario.length - 3))}@${dominio}`;
}

function escapar(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
