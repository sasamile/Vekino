/** Textos legales de Vekino (auth + perfil). */

export type LegalSection = { title: string; body: string };

export const PRIVACY_LEAD =
  "En Vekino cuidamos tus datos personales. Esto es lo que usamos y cómo los protegemos.";

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "Qué datos guardamos",
    body: "Nombre, correo, teléfono y documento (si los registraste); tu unidad y roles en el condominio; actividad operativa (facturas, reservas, visitantes, PQRS) necesaria para administrar el conjunto.",
  },
  {
    title: "Quién puede verlos",
    body: "La administración de tu condominio y, según el módulo, portería. El equipo Vekino solo accede cuando das soporte o para operar la plataforma de forma segura.",
  },
  {
    title: "Tus derechos",
    body: "Puedes editar tu perfil y avatar en esta app. Si quieres corregir o eliminar datos, usa Soporte: tu solicitud llega al administrador del condominio y al equipo Vekino.",
  },
  {
    title: "Notificaciones y dispositivos",
    body: "Si activas las notificaciones push, guardamos un token del dispositivo para enviarte avisos. Puedes desactivarlas en Notificaciones o en los ajustes del teléfono.",
  },
];

export const PRIVACY_NOTE =
  "No vendemos tus datos. El tratamiento se limita a la operación del condominio y al soporte del servicio.";

export const TERMS_LEAD =
  "Al usar Vekino aceptas estas condiciones. Resumen claro de cómo funciona el servicio.";

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "Qué es Vekino",
    body: "Vekino es una plataforma para la administración y la vida diaria del condominio: facturas, avisos, reservas, visitantes, PQRS y módulos relacionados según tu rol.",
  },
  {
    title: "Tu cuenta",
    body: "Eres responsable de mantener la confidencialidad de tu acceso. Usa solo tu cuenta personal. Si detectas uso indebido, avisa a la administración o a soporte Vekino.",
  },
  {
    title: "Uso aceptable",
    body: "No uses la app para actividades ilegales, spam, acoso o para intentar acceder a datos de otras unidades o usuarios sin autorización. El incumplimiento puede llevar a la suspensión del acceso.",
  },
  {
    title: "Contenido y condominio",
    body: "La información operativa (cuotas, avisos, reservas, etc.) la gestiona la administración del condominio. Vekino facilita la herramienta; las decisiones administrativas corresponden a cada conjunto.",
  },
  {
    title: "Disponibilidad",
    body: "Trabajamos para que el servicio esté disponible, pero puede haber mantenimientos o interrupciones. No garantizamos disponibilidad ininterrumpida.",
  },
  {
    title: "Cambios",
    body: "Podemos actualizar estos términos. Si hay cambios relevantes, te lo comunicaremos en la app o por los canales habituales. Seguir usando Vekino implica aceptar la versión vigente.",
  },
];

export const TERMS_NOTE =
  "Si tienes dudas sobre estos términos, escríbenos por Soporte o a través de la administración de tu condominio.";
