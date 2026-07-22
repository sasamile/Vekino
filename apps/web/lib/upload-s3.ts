import type { FunctionReturnType } from "convex/server";
import type { api } from "@vekino/backend/api";

type GenerateS3Upload = (args: {
  folder: string;
  contentType: string;
  fileName?: string;
}) => Promise<FunctionReturnType<typeof api.files.generateUploadUrl>>;

/**
 * Sube un File/Blob a S3 vía URL firmada (PUT).
 * Retorna la URL pública y el key.
 */
export async function uploadToS3(
  generateUploadUrl: GenerateS3Upload,
  file: Blob & { name?: string },
  folder: string,
): Promise<{ url: string; key: string }> {
  const contentType = file.type || "application/octet-stream";
  const { uploadUrl, publicUrl, key } = await generateUploadUrl({
    folder,
    contentType,
    fileName: file.name,
  });

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Error al subir a S3 (${res.status}).`);
  }
  return { url: publicUrl, key };
}
