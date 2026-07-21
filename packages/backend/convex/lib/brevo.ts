/**
 * Envío de correos vía Brevo (Sendinblue).
 *
 * Variables en Convex (`bunx convex env set …`):
 *   BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, SITE_URL
 */

type BrevoRecipient = { email: string; name?: string | null };

export async function sendBrevoEmail(args: {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "[brevo] BREVO_API_KEY no está configurada en Convex. No se envió el correo.",
    );
    throw new Error(
      "El envío de correos no está configurado. Contacta al administrador.",
    );
  }

  const senderEmail =
    process.env.BREVO_SENDER_EMAIL?.trim() || "contacto@vekino.com";
  const senderName =
    process.env.BREVO_SENDER_NAME?.trim() || "Equipo de Vekino";

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: args.to.map((t) => ({
        email: t.email,
        ...(t.name ? { name: t.name } : {}),
      })),
      subject: args.subject,
      htmlContent: args.htmlContent,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[brevo] HTTP ${res.status}: ${detail}`);
    throw new Error("No se pudo enviar el correo. Inténtalo de nuevo.");
  }
}

/** Correo de recuperación de contraseña (web + app). */
export async function sendPasswordResetEmail(args: {
  to: BrevoRecipient;
  webUrl: string;
  appUrl: string;
}): Promise<void> {
  const name = args.to.name?.trim();
  const greeting = name ? `Hola ${escapeHtml(name)},` : "Hola,";
  const webUrl = escapeAttr(args.webUrl);
  const appUrl = escapeAttr(args.appUrl);
  const webUrlText = escapeHtml(args.webUrl);
  const year = new Date().getFullYear();

  const subject = "Restablece tu contraseña — Vekino";

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111111;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Solicitud para restablecer tu contraseña. El enlace expira en 1 hora.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5F5F5;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background:#FFFFFF;border:1px solid #E5E5E5;">

          <tr>
            <td style="padding:32px 36px 0;">
              <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#111111;">Vekino</p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 36px 0;">
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:#111111;">Restablece tu contraseña</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 36px 0;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">
                ${greeting}
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta.
                Si no realizaste esta solicitud, ignora este mensaje.
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#666666;">
                Este enlace expira en 1 hora.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 36px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="background-color:#111111;">
                    <a href="${webUrl}" target="_blank" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;">
                      Restablecer en la web
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 36px 0;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:#666666;">
                ¿Prefieres la app?
                <a href="${appUrl}" target="_blank" style="color:#111111;text-decoration:underline;">Abrir en la app</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 36px 0;">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#888888;">
                Si el botón no funciona, copia este enlace:
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;">
                <a href="${webUrl}" style="color:#555555;text-decoration:none;">${webUrlText}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 36px 28px;">
              <p style="margin:0;padding-top:20px;border-top:1px solid #EEEEEE;font-size:12px;line-height:1.5;color:#999999;">
                Correo automático de Vekino · No respondas a este mensaje<br />
                © ${year} Vekino
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await sendBrevoEmail({
    to: [args.to],
    subject,
    htmlContent,
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
