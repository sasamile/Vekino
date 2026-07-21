import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";

export type PoderAuditoria = {
  unidadNumero: string;
  coeficiente: number | null;
  otorganteNombre: string;
  representanteNombre: string;
  apoderadoDocumento: string | null;
  codigoAcceso: string;
  validado: boolean;
  representanteTipo: "propietario" | "externo";
  tieneDocumento: boolean;
  documentoUrl: string | null;
  createdAt: number;
};

export type ResultadoAuditoria = {
  pregunta: string;
  estado: string;
  abiertaAlgunaVez: boolean;
  totalVotos: number;
  opciones: { texto: string; votos: number; coeficiente: number }[];
};

export type PaqueteAuditoria = {
  condominioNombre: string;
  asamblea: {
    titulo: string;
    tipo: string;
    modalidad: string;
    estado: string;
    fecha: string;
    hora: string;
    lugar: string | null;
    quorumRequerido: number;
  };
  ordenDia: {
    titulo: string;
    descripcion: string | null;
    hecho: boolean;
    tieneVotacion: boolean;
  }[];
  poderes: PoderAuditoria[];
  resultados: ResultadoAuditoria[];
  generadoEn: number;
};

function safeName(s: string) {
  return s.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "archivo";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(c: string | number | boolean | null | undefined) {
  return `"${String(c ?? "").replace(/"/g, '""')}"`;
}

export function veredictoTexto(
  estado: string,
  opciones: { texto: string; coeficiente: number }[],
): string {
  if (estado !== "cerrada") return "En curso";
  const totalCoef = opciones.reduce((s, o) => s + o.coeficiente, 0);
  const ganadora = [...opciones].sort((a, b) => b.coeficiente - a.coeficiente)[0];
  if (!ganadora || totalCoef <= 0) return "Sin votos";
  const pctGana = (ganadora.coeficiente / totalCoef) * 100;

  const textos = opciones.map((o) => o.texto.toLowerCase());
  const esSiNo =
    textos.some((t) => t.includes("favor") || t.includes("sí") || t === "si" || t.includes("aprob")) &&
    textos.some((t) => t.includes("contra") || t === "no" || t.includes("rechaz"));

  const g = ganadora.texto.toLowerCase();
  if (esSiNo) {
    const aFavor =
      g.includes("favor") || g.includes("sí") || g === "si" || g.includes("aprob");
    if (aFavor && pctGana >= 51) return "Aprobada";
    return "No aprobada";
  }
  return `Ganó: ${ganadora.texto}`;
}

/** Listado CSV de poderes para auditoría. */
export function descargarPoderesCSV(pkg: PaqueteAuditoria) {
  const head = [
    "Unidad",
    "Coeficiente",
    "Otorgante",
    "Apoderado",
    "Documento apoderado",
    "Tipo apoderado",
    "Validado",
    "Codigo",
    "Tiene documento",
    "URL documento",
    "Fecha registro",
  ];
  const rows = pkg.poderes.map((p) => [
    p.unidadNumero,
    p.coeficiente ?? "",
    p.otorganteNombre,
    p.representanteNombre,
    p.apoderadoDocumento ?? "",
    p.representanteTipo,
    p.validado ? "Sí" : "No",
    p.codigoAcceso,
    p.tieneDocumento ? "Sí" : "No",
    p.documentoUrl ?? "",
    new Date(p.createdAt).toLocaleString("es-CO"),
  ]);
  const csv = [head, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `Poderes_${safeName(pkg.asamblea.titulo)}.csv`);
}

/** ZIP con los documentos adjuntos de cada poder. */
export async function descargarPoderesZIP(pkg: PaqueteAuditoria) {
  const conDoc = pkg.poderes.filter((p) => p.documentoUrl);
  if (conDoc.length === 0) {
    throw new Error("Ningún poder tiene documento adjunto para descargar.");
  }
  const zip = new JSZip();
  const folder = zip.folder("poderes")!;
  let ok = 0;
  for (const p of conDoc) {
    try {
      const res = await fetch(p.documentoUrl!);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const ct = res.headers.get("content-type") ?? "";
      const ext = ct.includes("pdf")
        ? "pdf"
        : ct.includes("png")
          ? "png"
          : ct.includes("jpeg") || ct.includes("jpg")
            ? "jpg"
            : "bin";
      const name = `Unidad_${safeName(p.unidadNumero)}_${safeName(p.representanteNombre)}.${ext}`;
      folder.file(name, buf);
      ok += 1;
    } catch {
      // continuar con los demás
    }
  }
  if (ok === 0) throw new Error("No se pudo descargar ningún documento.");
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `Documentos_poderes_${safeName(pkg.asamblea.titulo)}.zip`);
  return ok;
}

/** PDF resumen: asamblea + orden del día + poderes + resultados de votación. */
export async function descargarActaPDF(pkg: PaqueteAuditoria) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  const pageW = 595;
  const pageH = 842;
  const maxW = pageW - margin * 2;
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const ensure = (need: number) => {
    if (y - need < margin) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
  };

  const draw = (text: string, size: number, bold = false, color = rgb(0.1, 0.1, 0.12)) => {
    const f = bold ? fontBold : font;
    const words = text.split(/\s+/);
    let line = "";
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(trial, size) > maxW && line) {
        ensure(size + 4);
        page.drawText(line, { x: margin, y, size, font: f, color });
        y -= size + 4;
        line = w;
      } else {
        line = trial;
      }
    }
    if (line) {
      ensure(size + 4);
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= size + 4;
    }
  };

  const gap = (n = 10) => {
    y -= n;
  };

  const section = (title: string) => {
    gap(14);
    ensure(28);
    page.drawText(title, {
      x: margin,
      y,
      size: 13,
      font: fontBold,
      color: rgb(0.05, 0.25, 0.45),
    });
    y -= 8;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageW - margin, y },
      thickness: 0.8,
      color: rgb(0.75, 0.8, 0.85),
    });
    y -= 16;
  };

  // Encabezado
  draw(pkg.condominioNombre, 11, true, rgb(0.35, 0.4, 0.45));
  gap(4);
  draw("Acta de auditoría — Asamblea", 16, true);
  gap(2);
  draw(pkg.asamblea.titulo, 14, true);
  gap(6);
  draw(
    `${pkg.asamblea.tipo} · ${pkg.asamblea.modalidad} · ${pkg.asamblea.estado}`,
    10,
    false,
    rgb(0.35, 0.4, 0.45),
  );
  draw(
    `Fecha: ${pkg.asamblea.fecha} · ${pkg.asamblea.hora}${pkg.asamblea.lugar ? ` · ${pkg.asamblea.lugar}` : ""}`,
    10,
  );
  draw(`Quórum requerido: ${pkg.asamblea.quorumRequerido}%`, 10);
  draw(
    `Generado: ${new Date(pkg.generadoEn).toLocaleString("es-CO")}`,
    9,
    false,
    rgb(0.45, 0.5, 0.55),
  );

  // Orden del día
  if (pkg.ordenDia.length > 0) {
    section(`Orden del día (${pkg.ordenDia.filter((p) => p.hecho).length}/${pkg.ordenDia.length} realizados)`);
    pkg.ordenDia.forEach((p, i) => {
      draw(
        `${i + 1}. ${p.hecho ? "[Hecho] " : ""}${p.titulo}${p.tieneVotacion ? " (con votación)" : ""}`,
        10,
        p.hecho,
      );
      if (p.descripcion) draw(`    ${p.descripcion}`, 9, false, rgb(0.4, 0.45, 0.5));
    });
  }

  // Poderes
  section(`Poderes otorgados (${pkg.poderes.length})`);
  if (pkg.poderes.length === 0) {
    draw("No se registraron poderes en esta asamblea.", 10, false, rgb(0.45, 0.5, 0.55));
  } else {
    const validados = pkg.poderes.filter((p) => p.validado).length;
    draw(`${validados} validados · ${pkg.poderes.length - validados} pendientes`, 9, false, rgb(0.4, 0.45, 0.5));
    gap(4);
    for (const p of pkg.poderes) {
      draw(
        `Unidad ${p.unidadNumero}: ${p.otorganteNombre} → ${p.representanteNombre}`,
        10,
        true,
      );
      draw(
        `  ${p.validado ? "Validado" : "Pendiente"} · ${p.representanteTipo} · Cód. ${p.codigoAcceso}${
          p.apoderadoDocumento ? ` · Doc. ${p.apoderadoDocumento}` : ""
        }${p.coeficiente != null ? ` · Coef. ${p.coeficiente}` : ""}${
          p.tieneDocumento ? " · Con documento" : ""
        }`,
        9,
        false,
        rgb(0.35, 0.4, 0.45),
      );
      gap(2);
    }
  }

  // Resultados
  const conResultados = pkg.resultados.filter(
    (r) => r.estado === "abierta" || r.abiertaAlgunaVez || r.opciones.some((o) => o.votos > 0),
  );
  section(`Resultados de votación (${conResultados.length})`);
  if (conResultados.length === 0) {
    draw("Aún no hay votaciones con resultados.", 10, false, rgb(0.45, 0.5, 0.55));
  } else {
    conResultados.forEach((r, idx) => {
      const totalCoef = r.opciones.reduce((s, o) => s + o.coeficiente, 0);
      const veredicto = veredictoTexto(r.estado, r.opciones);
      gap(idx === 0 ? 0 : 8);
      draw(`${idx + 1}. ${r.pregunta}`, 11, true);
      draw(`Estado: ${r.estado} · Veredicto: ${veredicto} · ${r.totalVotos} votos`, 9, false, rgb(0.3, 0.35, 0.4));
      for (const op of r.opciones) {
        const pct = totalCoef > 0 ? Math.round((op.coeficiente / totalCoef) * 100) : 0;
        draw(
          `  · ${op.texto}: ${op.votos} unidades · coef. ${op.coeficiente} (${pct}%)`,
          9,
        );
      }
    });
  }

  gap(20);
  draw(
    "Documento generado automáticamente por Vekino para fines de auditoría de la asamblea.",
    8,
    false,
    rgb(0.5, 0.55, 0.6),
  );

  const bytes = await doc.save();
  downloadBlob(
    new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
    `Acta_auditoria_${safeName(pkg.asamblea.titulo)}.pdf`,
  );
}
