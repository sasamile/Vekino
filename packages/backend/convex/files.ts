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

/**
 * URL firmada (PUT) para subir directo al bucket S3.
 * El cliente debe hacer PUT con el Content-Type indicado.
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
    const folder = args.folder.replace(/^\/+|\/+$/g, "") || "uploads";
    const rawName = args.fileName?.trim() || "file";
    const safe = sanitizeFileName(rawName);
    const key = `${folder}/${Date.now()}-${randomUUID().slice(0, 8)}-${safe}`;

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
