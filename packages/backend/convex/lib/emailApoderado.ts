/**
 * Correo con el enlace personal del apoderado para entrar a la asamblea.
 *
 * El enlace lleva su `codigoAcceso`: con él queda registrado y puede votar por
 * las unidades que representa, sin necesidad de tener cuenta en Vekino.
 */

export type ApoderadoEmailArgs = {
  nombre: string;
  condominioNombre: string;
  asambleaTitulo: string;
  fecha: string;
  hora: string;
  enlace: string;
  unidades: string[];
};

export function asuntoApoderado(condominio: string): string {
  return `Tu enlace para la asamblea de ${condominio}`;
}

export function textoApoderado(a: ApoderadoEmailArgs): string {
  return [
    `Hola ${a.nombre}:`,
    "",
    `Quedaste registrado como apoderado en la asamblea de ${a.condominioNombre}.`,
    "",
    `Asamblea: ${a.asambleaTitulo}`,
    `Fecha: ${a.fecha}`,
    `Hora: ${a.hora}`,
    a.unidades.length ? `Unidades que representas: ${a.unidades.join(", ")}` : "",
    "",
    "Ingresa con este enlace personal:",
    a.enlace,
    "",
    "Es personal e intransferible: con él quedas registrado y puedes votar por",
    "las unidades que representas. No lo compartas.",
    "",
    "Vekino · Gestión residencial",
  ]
    .filter(Boolean)
    .join("\n");
}

export function htmlApoderado(a: ApoderadoEmailArgs): string {
  const nombre = esc(a.nombre);
  const condominio = esc(a.condominioNombre);
  const titulo = esc(a.asambleaTitulo);
  const enlace = escAttr(a.enlace);
  const enlaceTexto = esc(a.enlace);

  const filaUnidades = a.unidades.length
    ? `<p style="margin:0 0 8px;font-size:13px;line-height:18px;color:#6f7788;text-transform:uppercase;letter-spacing:.5px;">Unidades que representas</p>
       <p style="margin:0;font-size:16px;line-height:24px;color:#0b235a;font-weight:bold;">${esc(a.unidades.join(", "))}</p>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${asuntoApoderado(a.condominioNombre)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#14213d;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Tu enlace personal para participar y votar en la asamblea.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f5f7;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
             style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(12,31,72,.08);">
        <tr><td style="height:6px;background:#ff4f0a;font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:32px 34px 10px;">
          <p style="margin:0 0 8px;color:#ff4f0a;font-size:13px;line-height:20px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;">Asamblea de copropietarios</p>
          <h1 style="margin:0;color:#0b235a;font-size:28px;line-height:36px;font-weight:700;">${titulo}</h1>
          <p style="margin:8px 0 0;font-size:16px;line-height:24px;color:#3b4356;">${condominio}</p>
        </td></tr>

        <tr><td style="padding:14px 34px 8px;">
          <p style="margin:0 0 18px;font-size:17px;line-height:27px;color:#202b46;">Hola, <strong>${nombre}</strong>:</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:26px;color:#3b4356;">
            Quedaste registrado como <strong>apoderado</strong> en esta asamblea. Aquí está tu enlace de ingreso.
          </p>
        </td></tr>

        <tr><td style="padding:8px 34px 22px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                 style="width:100%;background:#fff7f2;border:1px solid #ffd8c6;border-radius:12px;">
            <tr><td style="padding:22px;">
              <p style="margin:0 0 8px;font-size:13px;line-height:18px;color:#6f7788;text-transform:uppercase;letter-spacing:.5px;">Fecha y hora</p>
              <p style="margin:0 0 18px;font-size:18px;line-height:26px;color:#0b235a;font-weight:bold;">${esc(a.fecha)} · ${esc(a.hora)}</p>
              ${filaUnidades}
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding:0 34px 30px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr><td align="center" bgcolor="#ff4f0a" style="border-radius:9px;">
              <a href="${enlace}" target="_blank"
                 style="display:inline-block;padding:15px 34px;color:#ffffff;text-decoration:none;font-size:16px;line-height:20px;font-weight:bold;border-radius:9px;">
                Ingresar a la asamblea
              </a>
            </td></tr>
          </table>
          <p style="margin:14px 0 0;font-size:12px;line-height:18px;color:#81889a;word-break:break-all;">
            Si el botón no funciona, copia este enlace:<br>
            <a href="${enlace}" target="_blank" style="color:#0b67c2;text-decoration:underline;">${enlaceTexto}</a>
          </p>
        </td></tr>

        <tr><td style="padding:0 34px 30px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                 style="width:100%;border-left:4px solid #d6a900;background:#fffaf0;border-radius:8px;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0;font-size:15px;line-height:23px;color:#4a432e;">
                <strong style="color:#7a5d00;">Importante:</strong>
                Este enlace es personal e intransferible. Con él quedas registrado en la asamblea
                y puedes votar por las unidades que representas, así que no lo compartas.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:22px 28px;background:#0b235a;text-align:center;">
          <p style="margin:0 0 6px;color:#fff;font-size:15px;line-height:22px;font-weight:bold;">Vekino · Gestión residencial en un solo lugar</p>
          <p style="margin:0;color:#dbe3f3;font-size:12px;line-height:19px;">Mensaje enviado por la Administración de ${condominio}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escAttr(s: string) {
  return esc(s).replace(/'/g, "&#39;");
}
