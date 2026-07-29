/**
 * Comprime / redimensiona una imagen en el browser (canvas).
 * Reduce mucho el peso antes de subir a S3 vía Convex.
 */

export type CompressImageOptions = {
  /** Lado máximo en px (ancho o alto). */
  maxEdge?: number;
  /** Calidad JPEG 0–1. */
  quality?: number;
  /** Tipo de salida. */
  mimeType?: "image/jpeg" | "image/webp";
};

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

/**
 * Devuelve un File JPEG/WebP más liviano. Si falla el canvas, devuelve el original.
 */
export async function compressImage(
  file: File,
  opts: CompressImageOptions = {},
): Promise<File> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.82;
  const mimeType = opts.mimeType ?? "image/jpeg";

  if (!file.type.startsWith("image/")) return file;
  // GIFs animados: no tocar
  if (file.type === "image/gif") return file;

  try {
    const img = await loadImage(file);
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return file;

    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    // Ya es chica y liviana: no hace falta recomprimir agresivamente
    if (scale === 1 && file.size < 400_000 && file.type === mimeType) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, tw, th);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, quality),
    );
    if (!blob || blob.size === 0) return file;

    // Si quedó más grande que el original, quédate con el original
    if (blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "imagen";
    const ext = mimeType === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${base}.${ext}`, {
      type: mimeType,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
