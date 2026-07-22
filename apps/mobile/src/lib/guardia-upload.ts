/**
 * Sube un archivo local a S3 vía URL firmada (PUT).
 * `generateUploadUrl` debe ser la action `api.files.generateUploadUrl`.
 */
export async function uploadLocalFile(
  generateUploadUrl: (args: {
    folder: string;
    contentType: string;
    fileName?: string;
  }) => Promise<{ uploadUrl: string; key: string; publicUrl: string }>,
  uri: string,
  mimeType: string,
  folder: string,
  fileName?: string,
): Promise<{ url: string; key: string }> {
  const contentType = mimeType || "application/octet-stream";
  const { uploadUrl, publicUrl, key } = await generateUploadUrl({
    folder,
    contentType,
    fileName,
  });
  const blobRes = await fetch(uri);
  const blob = await blobRes.blob();
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!upload.ok) throw new Error(`No se pudo subir el archivo (${upload.status}).`);
  return { url: publicUrl, key };
}
