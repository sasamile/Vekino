/**
 * Datos de identificación que aparecen en los documentos legales.
 *
 * ⚠️ COMPLETAR ANTES DE PUBLICAR. Los campos marcados con `«…»` son
 * marcadores de posición: no los inventamos porque un NIT o un domicilio
 * equivocados en una política de datos son un problema legal, no una errata.
 * Se muestran así de visibles a propósito, para que nadie publique el
 * documento creyendo que está completo.
 *
 * Los correos sí son los reales que ya usa la landing.
 */
export const DATOS_RESPONSABLE = {
  razonSocial: "«Razón social»",
  nit: "«NIT»",
  direccion: "«Dirección y ciudad»",
  correo: "hola@vekino.co",
  telefono: "«Teléfono»",
} as const;

/** Fecha de la última revisión de los documentos legales. */
export const ACTUALIZADO = "31 de julio de 2026";
