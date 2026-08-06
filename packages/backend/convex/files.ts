"use node";

import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api } from "./_generated/api";

function requireS3Env() {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Faltan variables AWS_S3_BUCKET_NAME / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY en Convex.",
    );
  }
  return { region, bucket, accessKeyId, secretAccessKey };
}

function s3Client() {
  const { region, accessKeyId, secretAccessKey } = requireS3Env();
  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function publicUrlFor(key: string) {
  const { region, bucket } = requireS3Env();
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

/** Key \u00fanico en el bucket: `{folder}/{timestamp}-{uuid corto}-{nombre saneado}`. */
function buildObjectKey(folderArg: string, fileNameArg?: string) {
  const folder = folderArg.replace(/^\/+|\/+$/g, "") || "uploads";
  const rawName = fileNameArg?.trim() || "file";
  const safe = sanitizeFileName(rawName);
  return `${folder}/${Date.now()}-${randomUUID().slice(0, 8)}-${safe}`;
}

/**
 * URL firmada (PUT) para subir directo al bucket S3.
 * El cliente debe hacer PUT con el Content-Type indicado.
 *
 * Nota: en algunos entornos el PUT desde el browser falla por CORS
 * (`Failed to fetch`). Preferí `uploadBytes` desde el cliente cuando eso pase.
 */
export const generateUploadUrl = action({
  args: {
    folder: v.string(),
    contentType: v.string(),
    fileName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ uploadUrl: string; key: string; publicUrl: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado.");

    const { bucket } = requireS3Env();
    const client = s3Client();
    const key = buildObjectKey(args.folder, args.fileName);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: args.contentType || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 });
    return {
      uploadUrl,
      key,
      publicUrl: publicUrlFor(key),
    };
  },
});

/**
 * Subida server-side (evita CORS del browser → S3).
 * Límite práctico ~15 MB (argumentos de action Convex).
 */
export const uploadBytes = action({
  args: {
    folder: v.string(),
    contentType: v.string(),
    fileName: v.optional(v.string()),
    bytes: v.bytes(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ key: string; publicUrl: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado.");

    const size = args.bytes.byteLength;
    if (size <= 0) throw new Error("Archivo vacío.");
    if (size > 15 * 1024 * 1024) {
      throw new Error("El archivo supera el límite de 15 MB.");
    }

    const { bucket } = requireS3Env();
    const client = s3Client();
    const key = buildObjectKey(args.folder, args.fileName);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: args.contentType || "application/octet-stream",
        Body: Buffer.from(args.bytes),
      }),
    );

    return { key, publicUrl: publicUrlFor(key) };
  },
});

async function deleteS3Key(key: string) {
  const trimmed = key.trim();
  if (!trimmed) return;
  const { bucket } = requireS3Env();
  const client = s3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: trimmed,
    }),
  );
}

/** Borra un objeto del bucket (si se conoce el key). */
export const deleteObject = action({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado.");
    await deleteS3Key(args.key);
    return { ok: true as const };
  },
});

/** Borrado interno (p. ej. al reemplazar avatar / adjuntos). */
export const deleteObjectInternal = internalAction({
  args: { key: v.string() },
  handler: async (_ctx, args) => {
    try {
      await deleteS3Key(args.key);
    } catch {
      // No fallar el flujo si el objeto ya no existe o hay un glitch de red.
    }
    return { ok: true as const };
  },
});

/** Compat: algunos callers solo necesitan confirmar sesión. */
export const ping = action({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean }> => {
    const me: unknown = await ctx.runQuery(api.users.me, {});
    return { ok: Boolean(me) };
  },
});

/**
 * Descarga un archivo desde una URL y lo sube al bucket S3.
 * Pensado para el bot de WhatsApp: la media de YCloud viene como URL temporal
 * (requiere el header X-API-Key y caduca en ~30 días), así que la persistimos
 * de una vez en S3. Sin ctx.auth: es una internalAction invocada por el bot.
 */
export const uploadFromUrl = internalAction({
  args: {
    url: v.string(),
    folder: v.string(),
    fileName: v.optional(v.string()),
    contentType: v.optional(v.string()),
    conApiKeyYCloud: v.optional(v.boolean()),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{ key: string; publicUrl: string }> => {
    const maxBytes = 25 * 1024 * 1024;

    // Anti-SSRF: la URL viene del payload del webhook (autenticado por
    // secreto, pero defensa en profundidad): solo HTTPS y nunca hosts
    // internos/IP privadas. Y el API key de YCloud solo viaja a YCloud.
    let destino: URL;
    try {
      destino = new URL(args.url);
    } catch {
      throw new Error("URL de descarga inválida.");
    }
    if (destino.protocol !== "https:") {
      throw new Error("Solo se permiten descargas por HTTPS.");
    }
    const host = destino.hostname.toLowerCase();
    const esIpPrivada =
      host === "localhost" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === "[::1]" ||
      host.endsWith(".internal");
    if (esIpPrivada) {
      throw new Error("Host de descarga no permitido.");
    }

    const headers: Record<string, string> = {};
    if (
      args.conApiKeyYCloud &&
      (host === "ycloud.com" || host.endsWith(".ycloud.com"))
    ) {
      headers["X-API-Key"] = process.env.YCLOUD_API_KEY ?? "";
    }

    const response = await fetch(args.url, { headers });
    if (!response.ok) {
      throw new Error(
        `No se pudo descargar el archivo (HTTP ${response.status}).`,
      );
    }

    // Límite defensivo: primero por header, luego por el buffer real.
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error("El archivo supera el límite de 25 MB.");
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength <= 0) throw new Error("Archivo vacío.");
    if (bytes.byteLength > maxBytes) {
      throw new Error("El archivo supera el límite de 25 MB.");
    }

    const contentType =
      args.contentType ||
      response.headers.get("content-type") ||
      "application/octet-stream";

    const { bucket } = requireS3Env();
    const client = s3Client();
    const key = buildObjectKey(args.folder, args.fileName);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        Body: bytes,
      }),
    );

    return { key, publicUrl: publicUrlFor(key) };
  },
});
