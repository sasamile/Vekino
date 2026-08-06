/**
 * Correo de credenciales de acceso (onboarding a la nueva plataforma).
 *
 * Diferencias deliberadas frente al borrador original de la plantilla:
 *
 * 1. La contraseña es ÚNICA por persona, no compartida. Una clave igual para
 *    todo el conjunto significa que cualquiera que conozca el correo de un
 *    vecino entra a su cuenta y ve sus facturas, su unidad y sus pagos.
 * 2. Por lo mismo se eliminó la frase "la contraseña temporal es igual para
 *    todos los usuarios": anunciarlo convierte el problema en una invitación.
 * 3. Los logos van por URL https, no como data:base64. Gmail (entre otros)
 *    descarta las imágenes embebidas en data URI y el encabezado se vería roto.
 * 4. Se incluye versión de texto plano: mejora la entregabilidad y evita que
 *    el correo caiga en spam justo cuando se envía en lote.
 */

export type CredencialesEmailArgs = {
  nombre: string;
  email: string;
  password: string;
  loginUrl: string;
  condominioNombre: string;
  /** Logo del condominio (S3). Si falta, no se pinta. */
  condominioLogoUrl?: string;
  /** Logo de Vekino (env VEKINO_LOGO_URL). Si falta, se usa el wordmark en texto. */
  vekinoLogoUrl?: string;
};

export function asuntoCredenciales(): string {
  return "Tu clave de acceso a Vekino";
}

export function textoCredenciales(a: CredencialesEmailArgs): string {
  return [
    `Hola ${a.nombre}:`,
    "",
    `La nueva versión de Vekino ya está disponible para ${a.condominioNombre}.`,
    "Para ingresar, utiliza estos datos:",
    "",
    `Correo registrado: ${a.email}`,
    `Contraseña temporal: ${a.password}`,
    "",
    `Ingresa aquí: ${a.loginUrl}`,
    "",
    "Cómo cambiar la contraseña:",
    "1. Ingresa a Vekino con tu correo y la contraseña temporal.",
    "2. Ve a la opción Perfil o Cambiar contraseña.",
    "3. Escribe una nueva contraseña y guarda los cambios.",
    "",
    "Importante: esta contraseña es personal y fue generada solo para ti.",
    "No la compartas con nadie y cámbiala apenas ingreses.",
    "",
    "Si tienes inconvenientes para ingresar o el correo indicado no corresponde",
    "al que utilizas actualmente, comunícate con la Administración.",
    "",
    "Cordialmente,",
    `Administración ${a.condominioNombre}`,
    "Vekino · Gestión residencial en un solo lugar",
  ].join("\n");
}

export function htmlCredenciales(a: CredencialesEmailArgs): string {
  const nombre = escapeHtml(a.nombre);
  const email = escapeHtml(a.email);
  const password = escapeHtml(a.password);
  const condominio = escapeHtml(a.condominioNombre);
  const url = escapeAttr(a.loginUrl);
  const urlTexto = escapeHtml(a.loginUrl);

  const logoVekino = a.vekinoLogoUrl
    ? `<img src="${escapeAttr(a.vekinoLogoUrl)}" width="180" alt="Vekino"
           style="display:block;width:180px;max-width:100%;height:auto;border:0;">`
    : `<span style="font-size:24px;line-height:32px;font-weight:bold;color:#ff4f0a;letter-spacing:.5px;">Vekino</span>`;

  const logoCondominio = a.condominioLogoUrl
    ? `<img src="${escapeAttr(a.condominioLogoUrl)}" width="150" alt="${escapeAttr(a.condominioNombre)}"
           style="display:block;width:150px;max-width:100%;height:auto;border:0;margin-left:auto;">`
    : `<span style="font-size:15px;line-height:22px;font-weight:bold;color:#0b235a;">${condominio}</span>`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <title>${asuntoCredenciales()}</title>
</head>
<body style="margin:0;padding:0;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#14213d;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Tu correo registrado y tu contraseña temporal para ingresar a la nueva versión de Vekino.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f5f7;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
               style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(12,31,72,.08);">
          <tr>
            <td style="height:6px;background:#ff4f0a;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:24px 28px 18px;border-bottom:1px solid #e7eaf0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left" valign="middle" style="width:50%;">${logoVekino}</td>
                  <td align="right" valign="middle" style="width:50%;">${logoCondominio}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:34px 34px 12px;">
              <p style="margin:0 0 8px;color:#ff4f0a;font-size:13px;line-height:20px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;">
                Nueva versión de la plataforma
              </p>
              <h1 style="margin:0;color:#0b235a;font-size:30px;line-height:38px;font-weight:700;">
                Tu clave de acceso a Vekino
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 34px 8px;">
              <p style="margin:0 0 18px;font-size:17px;line-height:27px;color:#202b46;">
                Hola, <strong>${nombre}</strong>:
              </p>
              <p style="margin:0 0 18px;font-size:16px;line-height:26px;color:#3b4356;">
                La nueva versión de <strong style="color:#0b235a;">Vekino</strong> ya está disponible
                para <strong style="color:#0b235a;">${condominio}</strong>. Para ingresar, utiliza los siguientes datos:
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 34px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="width:100%;background:#fff7f2;border:1px solid #ffd8c6;border-radius:12px;">
                <tr>
                  <td style="padding:22px;">
                    <p style="margin:0 0 8px;font-size:13px;line-height:18px;color:#6f7788;text-transform:uppercase;letter-spacing:.5px;">
                      Correo registrado
                    </p>
                    <p style="margin:0 0 18px;font-size:17px;line-height:24px;color:#0b235a;font-weight:bold;word-break:break-word;">
                      ${email}
                    </p>
                    <p style="margin:0 0 8px;font-size:13px;line-height:18px;color:#6f7788;text-transform:uppercase;letter-spacing:.5px;">
                      Contraseña temporal
                    </p>
                    <p style="margin:0;font-size:22px;line-height:30px;color:#ff4f0a;font-weight:bold;letter-spacing:1px;word-break:break-word;font-family:'Courier New',Courier,monospace;">
                      ${password}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:4px 34px 30px;">
              <p style="margin:0 0 18px;font-size:16px;line-height:25px;color:#3b4356;">
                Ingresa a la plataforma desde el siguiente enlace:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" bgcolor="#ff4f0a" style="border-radius:9px;">
                    <a href="${url}" target="_blank"
                       style="display:inline-block;padding:15px 30px;color:#ffffff;text-decoration:none;font-size:16px;line-height:20px;font-weight:bold;border-radius:9px;">
                      Ingresar a Vekino
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0;font-size:12px;line-height:18px;color:#81889a;word-break:break-word;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <a href="${url}" target="_blank" style="color:#0b67c2;text-decoration:underline;">${urlTexto}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 34px;background:#f7f9fc;border-top:1px solid #e7eaf0;border-bottom:1px solid #e7eaf0;">
              <h2 style="margin:0 0 8px;color:#0b235a;font-size:21px;line-height:28px;">
                ¿Cómo cambiar la contraseña?
              </h2>
              <p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#4c5569;">
                Después de iniciar sesión con la contraseña temporal, cámbiala por una nueva que puedas recordar fácilmente.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="top" style="width:42px;padding-bottom:14px;">
                    <div style="width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:#ff4f0a;color:#fff;font-size:14px;font-weight:bold;">1</div>
                  </td>
                  <td valign="top" style="padding:3px 0 14px;font-size:15px;line-height:23px;color:#3b4356;">
                    Ingresa a Vekino con tu correo y la contraseña temporal.
                  </td>
                </tr>
                <tr>
                  <td valign="top" style="width:42px;padding-bottom:14px;">
                    <div style="width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:#ff4f0a;color:#fff;font-size:14px;font-weight:bold;">2</div>
                  </td>
                  <td valign="top" style="padding:3px 0 14px;font-size:15px;line-height:23px;color:#3b4356;">
                    Ve a la opción <strong>Perfil</strong> o <strong>Cambiar contraseña</strong>.
                  </td>
                </tr>
                <tr>
                  <td valign="top" style="width:42px;">
                    <div style="width:30px;height:30px;line-height:30px;text-align:center;border-radius:50%;background:#ff4f0a;color:#fff;font-size:14px;font-weight:bold;">3</div>
                  </td>
                  <td valign="top" style="padding:3px 0 0;font-size:15px;line-height:23px;color:#3b4356;">
                    Escribe una nueva contraseña y guarda los cambios.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 34px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="width:100%;border-left:4px solid #d6a900;background:#fffaf0;border-radius:8px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0;font-size:15px;line-height:23px;color:#4a432e;">
                      <strong style="color:#7a5d00;">Importante:</strong>
                      Esta contraseña es personal y fue generada únicamente para tu cuenta.
                      No la compartas con nadie y cámbiala apenas ingreses.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 34px 32px;">
              <p style="margin:0 0 20px;font-size:15px;line-height:25px;color:#3b4356;">
                Si tienes inconvenientes para ingresar o el correo indicado no corresponde al que utilizas actualmente,
                comunícate con la Administración.
              </p>
              <p style="margin:0;font-size:15px;line-height:24px;color:#3b4356;">
                Cordialmente,<br>
                <strong style="color:#0b235a;">Administración ${condominio}</strong><br>
                <strong style="color:#ff4f0a;">Vekino</strong> 🏡
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 28px;background:#0b235a;text-align:center;">
              <p style="margin:0 0 8px;color:#fff;font-size:15px;line-height:22px;font-weight:bold;">
                Vekino · Gestión residencial en un solo lugar
              </p>
              <p style="margin:0 0 10px;color:#dbe3f3;font-size:12px;line-height:19px;">
                Este es un mensaje informativo enviado por la Administración de ${condominio}.
              </p>
              <p style="margin:12px 0 0;color:#8fa0bf;font-size:11px;line-height:18px;">
                Por favor, no respondas directamente a este mensaje si fue enviado desde una cuenta automática.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Contraseña temporal única, legible por teléfono.
 *
 * Alfabeto sin caracteres ambiguos (0/O, 1/I/l) porque estas claves se dictan
 * y se copian a mano. 6 letras + 4 dígitos ≈ 39 bits: de sobra para una clave
 * de un solo uso que el residente cambia al entrar, y sin sesgo de módulo
 * (se descartan los bytes que caen fuera del rango uniforme).
 */
export function generarPasswordTemporal(): string {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digitos = "23456789";

  let bloque1 = "";
  for (let i = 0; i < 6; i++) bloque1 += elegir(letras);
  let bloque2 = "";
  for (let i = 0; i < 4; i++) bloque2 += elegir(digitos);

  // "Vekino-QXTMHR-4738": mayúsculas + dígitos + longitud, sin ser críptica.
  return `Vekino-${bloque1}-${bloque2}`;
}

/** Elección uniforme por rechazo: `byte % n` favorece a los primeros símbolos. */
function elegir(alfabeto: string): string {
  const n = alfabeto.length;
  const limite = 256 - (256 % n);
  const buf = new Uint8Array(1);
  // Con n ≤ 32 la probabilidad de repetir el sorteo es < 1/8; termina siempre.
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limite) return alfabeto[buf[0]! % n]!;
  }
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
