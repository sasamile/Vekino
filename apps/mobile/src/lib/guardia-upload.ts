import type { Id } from "@vekino/backend/dataModel";

/** Sube un archivo local a Convex Storage y devuelve el storageId. */
export async function uploadLocalFile(
  generateUploadUrl: () => Promise<string>,
  uri: string,
  mimeType: string,
): Promise<Id<"_storage">> {
  const uploadUrl = await generateUploadUrl();
  const blobRes = await fetch(uri);
  const blob = await blobRes.blob();
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: blob,
  });
  if (!upload.ok) throw new Error("No se pudo subir el archivo.");
  const { storageId } = (await upload.json()) as { storageId: string };
  return storageId as Id<"_storage">;
}
