/**
 * Textos de entrega de accesos, en un solo sitio.
 *
 * Nacieron duplicados: uno fijo en el flujo de palabras clave y otro que el
 * agente redactaba libre a partir de una nota. El agente termino inventandose
 * los datos — le dijo a un residente que el enlace vencia en 30 minutos
 * cuando dura 24 horas — asi que ahora hay un solo texto y el agente lo copia
 * tal cual en vez de escribirlo el.
 *
 * Si cambia la vigencia del enlace (credenciales.ts, `crearAccesoRapido`),
 * hay que cambiarla aqui tambien: son el mismo hecho contado en dos sitios.
 */

export const HORAS_VIGENCIA_ENLACE = 24;

export function textoAccesoWhatsApp(d: {
  email: string;
  password: string;
  enlace: string;
}): string {
  return [
    "🔑 *Sus datos de acceso a Vekino*",
    "",
    "👉 Entre con un toque, sin copiar nada:",
    d.enlace,
    "",
    `_Ese enlace le sirve durante las próximas ${HORAS_VIGENCIA_ENLACE} horas: guárdelo._`,
    "",
    "O si prefiere escribirlos:",
    `Usuario: ${d.email}`,
    `Contraseña: ${d.password}`,
    "",
    "Es una clave temporal y personal: cámbiela apenas entre y no la comparta con nadie. 🙌",
    "",
    "_Si usted ya había logrado entrar por su cuenta, haga caso omiso de este mensaje: su contraseña anterior sigue funcionando._",
  ].join("\n");
}
