import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Genera el acta de la asamblea en PDF.
 *
 * ── Las dos capas ─────────────────────────────────────────────────────────
 * Todo lo que es número —quórum, coeficientes, votos, porcentajes— llega ya
 * calculado desde Convex (`api.acta.paquete`) y este archivo solo lo dibuja.
 * Nada se recalcula acá: una suma hecha en el navegador no se puede auditar
 * después, y el quórum es justo lo que se discute cuando impugnan un acta.
 *
 * El resumen en prosa de cada punto lo redacta un modelo y va marcado como
 * borrador allí donde aparece. Un modelo no escribe ni una cifra de este
 * documento.
 */

export type PaqueteActa = {
  condominioNombre: string;
  asamblea: {
    titulo: string;
    tipo: string;
    modalidad: string;
    estado: string;
    fecha: string;
    hora: string;
    lugar: string | null;
    iniciadaEn: number | null;
    finalizadaEn: number | null;
    presidenteNombre: string | null;
  };
  quorum: {
    requerido: number;
    alcanzado: number;
    unidadesPresentes: number;
    totalUnidades: number;
    coeficientePresente: number;
    coeficienteTotal: number;
    poderesValidados: number;
  };
  asistentes: {
    unidadNumero: string;
    userNombre: string;
    coeficiente: number | null;
    esPoder: boolean;
    createdAt: number;
  }[];
  ordenDia: {
    indice: number;
    titulo: string;
    descripcion: string | null;
    hecho: boolean;
    votacionId: string | null;
  }[];
  resultados: {
    votacionId: string;
    pregunta: string;
    estado: string;
    abiertaEn: number | null;
    cerradaEn: number | null;
    totalVotos: number;
    opciones: { texto: string; votos: number; coeficiente: number }[];
  }[];
  cronologia: { tipo: string; nombre: string; detalle: string | null; createdAt: number }[];
  resumen: {
    puntos: {
      puntoIndice: number;
      titulo: string;
      resumen: string;
      intervenciones: number;
      editado?: boolean;
    }[];
    modelo: string;
    generadoEn: number;
  } | null;
  hayTranscripcion: boolean;
  generadoEn: number;
};

const MARGEN = 50;
const ANCHO = 595;
const ALTO = 842;
const UTIL = ANCHO - MARGEN * 2;

const TINTA = rgb(0.1, 0.1, 0.12);
const SUAVE = rgb(0.4, 0.45, 0.5);
const TENUE = rgb(0.55, 0.6, 0.65);
const AZUL = rgb(0.05, 0.25, 0.45);
const LINEA = rgb(0.78, 0.82, 0.86);

/** Paleta de las barras. Se repite si hay más opciones que colores. */
const BARRAS = [
  rgb(0.13, 0.45, 0.78),
  rgb(0.18, 0.65, 0.52),
  rgb(0.85, 0.55, 0.15),
  rgb(0.65, 0.3, 0.62),
  rgb(0.75, 0.28, 0.32),
];

/**
 * Deja el texto en caracteres que la fuente estándar sabe dibujar.
 *
 * Las fuentes base del PDF usan WinAnsi: los acentos y la eñe entran, pero
 * comillas tipográficas, guiones largos raros o cualquier símbolo que traiga
 * el resumen redactado harían reventar `drawText` a mitad del documento. Es
 * preferible perder una comilla que no poder generar el acta.
 */
function sanear(s: string): string {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E¡-ÿ]/g, "");
}

function nombreArchivo(s: string) {
  return (
    sanear(s)
      .replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 60) || "acta"
  );
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

const fecha = (ts: number | null) =>
  ts ? new Date(ts).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—";
const horaCorta = (ts: number) =>
  new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

/** Lienzo con cursor: el resto del archivo solo le pide que dibuje. */
class Lienzo {
  doc: PDFDocument;
  pagina: PDFPage;
  y: number;
  normal: PDFFont;
  negrita: PDFFont;

  constructor(doc: PDFDocument, normal: PDFFont, negrita: PDFFont) {
    this.doc = doc;
    this.normal = normal;
    this.negrita = negrita;
    this.pagina = doc.addPage([ANCHO, ALTO]);
    this.y = ALTO - MARGEN;
  }

  /** Abre página nueva si no cabe lo que viene. */
  sitio(alto: number) {
    if (this.y - alto < MARGEN) {
      this.pagina = this.doc.addPage([ANCHO, ALTO]);
      this.y = ALTO - MARGEN;
    }
  }

  hueco(n = 10) {
    this.y -= n;
  }

  texto(
    s: string,
    opciones: { tam?: number; negrita?: boolean; color?: typeof TINTA; sangria?: number } = {},
  ) {
    const tam = opciones.tam ?? 10;
    const fuente = opciones.negrita ? this.negrita : this.normal;
    const color = opciones.color ?? TINTA;
    const x = MARGEN + (opciones.sangria ?? 0);
    const ancho = UTIL - (opciones.sangria ?? 0);

    for (const parrafo of sanear(s).split("\n")) {
      let linea = "";
      for (const palabra of parrafo.split(/\s+/)) {
        const prueba = linea ? `${linea} ${palabra}` : palabra;
        if (fuente.widthOfTextAtSize(prueba, tam) > ancho && linea) {
          this.sitio(tam + 4);
          this.pagina.drawText(linea, { x, y: this.y, size: tam, font: fuente, color });
          this.y -= tam + 4;
          linea = palabra;
        } else {
          linea = prueba;
        }
      }
      if (linea) {
        this.sitio(tam + 4);
        this.pagina.drawText(linea, { x, y: this.y, size: tam, font: fuente, color });
        this.y -= tam + 4;
      }
    }
  }

  seccion(titulo: string) {
    this.hueco(16);
    this.sitio(34);
    this.pagina.drawText(sanear(titulo), {
      x: MARGEN,
      y: this.y,
      size: 13,
      font: this.negrita,
      color: AZUL,
    });
    this.y -= 8;
    this.pagina.drawLine({
      start: { x: MARGEN, y: this.y },
      end: { x: ANCHO - MARGEN, y: this.y },
      thickness: 0.8,
      color: LINEA,
    });
    this.y -= 14;
  }

  /**
   * Barra horizontal con su etiqueta.
   *
   * La barra se dibuja del porcentaje que se le pasa; no lo calcula. Quien
   * la llama ya trae el número que salió de la base.
   */
  barra(etiqueta: string, pct: number, derecha: string, color: typeof TINTA) {
    const altoBarra = 13;
    this.sitio(altoBarra + 18);

    this.pagina.drawText(sanear(etiqueta), {
      x: MARGEN,
      y: this.y,
      size: 9,
      font: this.normal,
      color: TINTA,
    });
    const anchoDer = this.normal.widthOfTextAtSize(sanear(derecha), 9);
    this.pagina.drawText(sanear(derecha), {
      x: ANCHO - MARGEN - anchoDer,
      y: this.y,
      size: 9,
      font: this.negrita,
      color: SUAVE,
    });
    this.y -= altoBarra + 2;

    // Canal de fondo: sin él una barra del 3 % parece un error de impresión.
    this.pagina.drawRectangle({
      x: MARGEN,
      y: this.y,
      width: UTIL,
      height: altoBarra,
      color: rgb(0.93, 0.94, 0.96),
    });
    const ancho = Math.max(0, Math.min(100, pct)) / 100 * UTIL;
    if (ancho > 0) {
      this.pagina.drawRectangle({
        x: MARGEN,
        y: this.y,
        width: ancho,
        height: altoBarra,
        color,
      });
    }
    this.y -= 8;
  }

  /** Marca vertical: dónde estaba el mínimo exigido. */
  umbral(pct: number, etiqueta: string) {
    const x = MARGEN + (Math.max(0, Math.min(100, pct)) / 100) * UTIL;
    // Se dibuja sobre la barra recién puesta (13 de alto + 8 de hueco).
    this.pagina.drawLine({
      start: { x, y: this.y + 8 },
      end: { x, y: this.y + 8 + 13 },
      thickness: 1.5,
      color: rgb(0.75, 0.15, 0.2),
    });
    this.sitio(12);
    this.pagina.drawText(sanear(etiqueta), {
      x: Math.min(x + 3, ANCHO - MARGEN - 60),
      y: this.y,
      size: 7.5,
      font: this.normal,
      color: rgb(0.75, 0.15, 0.2),
    });
    this.y -= 11;
  }
}

/**
 * Arma el PDF y devuelve los bytes.
 *
 * Separado de la descarga a propósito: así se puede generar y verificar sin
 * un navegador —que es como se prueba— y queda disponible si algún día hay
 * que generarlo del lado del servidor.
 */
export async function construirActa(pkg: PaqueteActa): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const L = new Lienzo(doc, normal, negrita);

  const { asamblea: a, quorum: q } = pkg;

  // ── Encabezado ──
  L.texto(pkg.condominioNombre, { tam: 11, negrita: true, color: SUAVE });
  L.hueco(4);
  L.texto("Acta de asamblea", { tam: 18, negrita: true });
  L.hueco(2);
  L.texto(a.titulo, { tam: 13, negrita: true });
  L.hueco(6);
  L.texto(`Asamblea ${a.tipo} · modalidad ${a.modalidad} · ${a.estado}`, {
    tam: 9.5,
    color: SUAVE,
  });
  L.texto(`Citada para el ${a.fecha} a las ${a.hora}${a.lugar ? ` · ${a.lugar}` : ""}`, {
    tam: 9.5,
  });
  L.texto(`Inicio real: ${fecha(a.iniciadaEn)} · Cierre: ${fecha(a.finalizadaEn)}`, {
    tam: 9.5,
  });
  if (a.presidenteNombre) {
    L.texto(`Presidente de la asamblea: ${a.presidenteNombre}`, { tam: 9.5 });
  }

  // ── Quórum ──
  L.seccion("Quórum");
  const alcanzado = q.alcanzado >= q.requerido;
  L.texto(
    alcanzado
      ? `Se alcanzó el quórum: ${q.alcanzado}% de coeficiente, sobre el ${q.requerido}% requerido.`
      : `NO se alcanzó el quórum: ${q.alcanzado}% de coeficiente, frente al ${q.requerido}% requerido.`,
    { tam: 10.5, negrita: true, color: alcanzado ? rgb(0.1, 0.45, 0.3) : rgb(0.7, 0.15, 0.2) },
  );
  L.hueco(8);
  L.barra(
    "Coeficiente presente",
    q.alcanzado,
    `${q.alcanzado}%`,
    alcanzado ? rgb(0.18, 0.6, 0.45) : rgb(0.8, 0.4, 0.2),
  );
  L.umbral(q.requerido, `mínimo ${q.requerido}%`);
  L.hueco(4);
  L.texto(
    `${q.unidadesPresentes} de ${q.totalUnidades} unidades presentes · coeficiente ${q.coeficientePresente} de ${q.coeficienteTotal} · ${q.poderesValidados} poderes validados`,
    { tam: 9, color: SUAVE },
  );

  // ── Orden del día, con el resumen de cada punto ──
  L.seccion(
    `Orden del día (${pkg.ordenDia.filter((p) => p.hecho).length} de ${pkg.ordenDia.length} tratados)`,
  );
  if (pkg.ordenDia.length === 0) {
    L.texto("No se registró orden del día.", { color: TENUE });
  }
  for (const p of pkg.ordenDia) {
    L.hueco(6);
    L.texto(`${p.indice + 1}. ${p.titulo}${p.hecho ? "" : "  (no tratado)"}`, {
      tam: 11,
      negrita: true,
    });
    if (p.descripcion) L.texto(p.descripcion, { tam: 9, color: SUAVE, sangria: 12 });

    const r = pkg.resumen?.puntos.find((x) => x.puntoIndice === p.indice);
    if (r && r.resumen) {
      L.hueco(2);
      L.texto(r.resumen, { tam: 10, sangria: 12 });
      L.texto(
        r.editado
          ? "Resumen revisado por la secretaría."
          : `Resumen redactado automáticamente a partir de la transcripción — BORRADOR, debe revisarse.`,
        { tam: 7.5, color: TENUE, sangria: 12 },
      );
    } else if (pkg.hayTranscripcion) {
      L.texto("Sin intervenciones transcritas para este punto.", {
        tam: 9,
        color: TENUE,
        sangria: 12,
      });
    }
  }

  // ── Votaciones ──
  L.seccion(`Decisiones sometidas a votación (${pkg.resultados.length})`);
  if (pkg.resultados.length === 0) {
    L.texto("No se sometió ningún punto a votación.", { color: TENUE });
  }
  pkg.resultados.forEach((r, i) => {
    L.hueco(10);
    L.texto(`${i + 1}. ${r.pregunta}`, { tam: 11, negrita: true });

    const totalCoef = r.opciones.reduce((s, o) => s + o.coeficiente, 0);
    const ganadora = r.opciones.reduce(
      (mejor, o) => (o.coeficiente > mejor.coeficiente ? o : mejor),
      r.opciones[0] ?? { texto: "—", votos: 0, coeficiente: 0 },
    );
    const empate =
      r.opciones.filter((o) => o.coeficiente === ganadora.coeficiente).length > 1;

    L.texto(
      `Votación ${r.estado === "cerrada" ? "cerrada" : "abierta"} · ${r.totalVotos} unidades votaron · abierta ${fecha(r.abiertaEn)}${r.cerradaEn ? ` · cerrada ${fecha(r.cerradaEn)}` : ""}`,
      { tam: 8.5, color: SUAVE },
    );
    L.hueco(6);

    r.opciones.forEach((o, j) => {
      const pct = totalCoef > 0 ? (o.coeficiente / totalCoef) * 100 : 0;
      L.barra(
        o.texto,
        pct,
        `${pct.toFixed(1)}%  ·  ${o.votos} unid.  ·  coef. ${o.coeficiente}`,
        BARRAS[j % BARRAS.length]!,
      );
    });

    L.hueco(2);
    L.texto(
      totalCoef === 0
        ? "Sin votos registrados."
        : empate
          ? "Resultado: empate por coeficiente."
          : `Resultado: "${ganadora.texto}" con la mayor participación por coeficiente.`,
      { tam: 9.5, negrita: true },
    );
  });

  // ── Asistentes ──
  L.seccion(`Asistentes (${pkg.asistentes.length})`);
  if (pkg.asistentes.length === 0) {
    L.texto("No se registró asistencia.", { color: TENUE });
  } else {
    L.texto("Unidad · Nombre · Coeficiente · Registro", {
      tam: 8,
      negrita: true,
      color: SUAVE,
    });
    L.hueco(2);
    for (const s of pkg.asistentes) {
      L.texto(
        `${s.unidadNumero} · ${s.userNombre}${s.esPoder ? " (por poder)" : ""} · ${s.coeficiente ?? "—"} · ${horaCorta(s.createdAt)}`,
        { tam: 8.5 },
      );
    }
  }

  // ── Cronología ──
  if (pkg.cronologia.length > 0) {
    L.seccion("Cronología de la sesión");
    for (const e of pkg.cronologia) {
      L.texto(
        `${horaCorta(e.createdAt)}  ${ETIQUETA[e.tipo] ?? e.tipo}${e.nombre ? ` · ${e.nombre}` : ""}${e.detalle ? ` — ${e.detalle}` : ""}`,
        { tam: 8.5, color: SUAVE },
      );
    }
  }

  // ── Firmas ──
  L.seccion("Aprobación");
  L.texto(
    "Esta acta debe ser revisada, aprobada y firmada por el presidente y el secretario de la asamblea. El documento generado por el sistema es un borrador de apoyo y no sustituye esa aprobación.",
    { tam: 9, color: SUAVE },
  );
  L.hueco(34);
  L.sitio(50);
  const mitad = MARGEN + UTIL / 2;
  L.pagina.drawLine({
    start: { x: MARGEN, y: L.y },
    end: { x: MARGEN + UTIL / 2 - 20, y: L.y },
    thickness: 0.8,
    color: LINEA,
  });
  L.pagina.drawLine({
    start: { x: mitad + 20, y: L.y },
    end: { x: ANCHO - MARGEN, y: L.y },
    thickness: 0.8,
    color: LINEA,
  });
  L.y -= 12;
  L.pagina.drawText("Presidente de la asamblea", {
    x: MARGEN,
    y: L.y,
    size: 8.5,
    font: normal,
    color: SUAVE,
  });
  L.pagina.drawText("Secretario de la asamblea", {
    x: mitad + 20,
    y: L.y,
    size: 8.5,
    font: normal,
    color: SUAVE,
  });
  L.y -= 24;

  // ── Pie ──
  L.texto(
    `Documento generado por Vekino el ${fecha(pkg.generadoEn)}. Los datos de quórum, asistencia y votación se calculan directamente de los registros de la asamblea.${
      pkg.resumen
        ? ` Los resúmenes de cada punto fueron redactados automáticamente (${pkg.resumen.modelo}) a partir de la transcripción y requieren revisión.`
        : ""
    }`,
    { tam: 7.5, color: TENUE },
  );

  return await doc.save();
}

export async function descargarActaCompleta(pkg: PaqueteActa) {
  const bytes = await construirActa(pkg);
  descargar(
    new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
    `Acta_${nombreArchivo(pkg.asamblea.titulo)}.pdf`,
  );
}

/** Espeja `etiquetaBitacora` del backend. */
const ETIQUETA: Record<string, string> = {
  entrada: "Entró",
  salida: "Salió",
  palabra_pedida: "Pidió la palabra",
  palabra_concedida: "Palabra concedida",
  palabra_retirada: "Palabra retirada",
  votacion_abierta: "Votación abierta",
  votacion_cerrada: "Votación cerrada",
  voto: "Votó",
  chat: "Chat",
  reaccion: "Reacción",
  grabacion_inicio: "Grabación iniciada",
  grabacion_fin: "Grabación finalizada",
  transcripcion_inicio: "Transcripción iniciada",
  transcripcion_fin: "Transcripción finalizada",
  presidente_asignado: "Presidente asignado",
};
