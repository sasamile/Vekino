import { PDFDocument } from "pdf-lib";

async function imageToJpegBytes(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo leer la imagen.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo convertir la foto."))),
      "image/jpeg",
      0.92,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Si el archivo es imagen (p. ej. foto del poder desde el celular), lo convierte
 * a un PDF de una página. Si ya es PDF, lo deja igual.
 */
export async function ensurePoderPdf(file: File): Promise<File> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return file;
  }
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    return file;
  }

  const isPng =
    file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  const isJpeg =
    file.type === "image/jpeg" ||
    file.type === "image/jpg" ||
    /\.jpe?g$/i.test(file.name);

  let bytes: Uint8Array;
  let embedAs: "png" | "jpg";
  if (isPng) {
    bytes = new Uint8Array(await file.arrayBuffer());
    embedAs = "png";
  } else if (isJpeg) {
    bytes = new Uint8Array(await file.arrayBuffer());
    embedAs = "jpg";
  } else {
    // HEIC / WebP / otros → JPEG vía canvas
    bytes = await imageToJpegBytes(file);
    embedAs = "jpg";
  }

  const pdf = await PDFDocument.create();
  const image =
    embedAs === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);

  const maxW = 595;
  const maxH = 842;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  const page = pdf.addPage([maxW, maxH]);
  page.drawImage(image, {
    x: (maxW - w) / 2,
    y: (maxH - h) / 2,
    width: w,
    height: h,
  });

  const pdfBytes = await pdf.save();
  const base = file.name.replace(/\.[^.]+$/, "").trim() || "poder";
  /* `pdf.save()` devuelve `Uint8Array<ArrayBufferLike>` y `BlobPart` exige
   * que el buffer sea un `ArrayBuffer` (no un `SharedArrayBuffer`). Copiar
   * garantiza el tipo correcto sin castear. */
  return new File([new Uint8Array(pdfBytes)], `${base}.pdf`, {
    type: "application/pdf",
  });
}
