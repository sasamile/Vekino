import { internal } from "../_generated/api";

type SchedulerCtx = {
  scheduler: {
    // Convex MutationCtx.scheduler — tipado laxo para evitar acoplar a codegen.
    runAfter: (delayMs: number, fn: any, args: any) => Promise<unknown>;
  };
};

/** Extrae el object key de una URL pública de nuestro bucket S3. */
export function s3KeyFromPublicUrl(
  url: string | null | undefined,
): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname;
    const path = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    if (!path) return null;

    const bucket = process.env.AWS_S3_BUCKET_NAME?.trim();
    if (bucket) {
      if (
        host === `${bucket}.s3.amazonaws.com` ||
        host.startsWith(`${bucket}.s3.`)
      ) {
        return path;
      }
      // path-style: s3.region.amazonaws.com/bucket/key
      if (
        (host.startsWith("s3.") || host === "s3.amazonaws.com") &&
        path.startsWith(`${bucket}/`)
      ) {
        return path.slice(bucket.length + 1) || null;
      }
      return null;
    }

    if (host.includes(".amazonaws.com")) return path;
  } catch {
    /* ignore */
  }
  return null;
}

/** Programa borrado async de objetos S3 (no bloquea la mutación). */
export async function scheduleDeleteS3Keys(
  ctx: SchedulerCtx,
  keys: Array<string | null | undefined>,
) {
  const unique = [
    ...new Set(
      keys
        .map((k) => k?.trim())
        .filter((k): k is string => Boolean(k)),
    ),
  ];
  await Promise.all(
    unique.map((key) =>
      ctx.scheduler.runAfter(0, internal.files.deleteObjectInternal, { key }),
    ),
  );
}
