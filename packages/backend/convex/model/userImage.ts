import type { Id } from "../_generated/dataModel";

type StorageCtx = {
  storage: {
    getUrl: (storageId: Id<"_storage">) => Promise<string | null>;
  };
};

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

/**
 * URL de avatar lista para el cliente.
 * Prioriza URL S3/http en `image`; Convex Storage solo como legado.
 */
export async function resolveUserImage(
  ctx: StorageCtx,
  user: {
    image?: string | null;
    imageStorageId?: Id<"_storage"> | null;
  } | null | undefined,
): Promise<string | null> {
  if (!user) return null;

  const raw = user.image?.trim() || null;

  // S3 / URL absoluta: fuente de verdad actual.
  if (raw && isHttpUrl(raw) && !storageIdFromConvexUrl(raw)) {
    return raw;
  }

  if (user.imageStorageId) {
    try {
      const fresh = await ctx.storage.getUrl(user.imageStorageId);
      if (fresh) return fresh;
    } catch {
      /* ignore */
    }
  }

  if (raw) {
    const fromUrl = storageIdFromConvexUrl(raw);
    if (fromUrl) {
      try {
        const fresh = await ctx.storage.getUrl(fromUrl);
        if (fresh) return fresh;
      } catch {
        /* ignore */
      }
    }

    // Storage id guardado por error en el campo `image`
    if (!raw.includes("://") && !raw.startsWith("/") && raw.length > 10) {
      try {
        const fresh = await ctx.storage.getUrl(raw as Id<"_storage">);
        if (fresh) return fresh;
      } catch {
        /* ignore */
      }
    }

    if (isHttpUrl(raw)) return raw;
  }

  return null;
}

function storageIdFromConvexUrl(url: string): Id<"_storage"> | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/storage\/([^/?#]+)/);
    if (match?.[1]) return match[1] as Id<"_storage">;
  } catch {
    /* ignore */
  }
  return null;
}
