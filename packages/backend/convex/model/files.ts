import type { Id } from "../_generated/dataModel";

type StorageCtx = {
  storage: {
    getUrl: (id: Id<"_storage">) => Promise<string | null>;
  };
};

/** Resuelve URL pública: prioriza S3 `url`, luego Convex storage legacy. */
export async function resolveMediaUrl(
  ctx: StorageCtx,
  ref: {
    url?: string | null;
    storageId?: Id<"_storage"> | string | null;
  } | null | undefined,
): Promise<string> {
  if (!ref) return "";
  if (ref.url?.startsWith("http")) return ref.url;
  const sid = ref.storageId;
  if (!sid) return "";
  if (typeof sid === "string" && sid.startsWith("http")) return sid;
  try {
    return (await ctx.storage.getUrl(sid as Id<"_storage">)) ?? "";
  } catch {
    return "";
  }
}

export async function resolveMediaUrlList(
  ctx: StorageCtx,
  values: Array<string | Id<"_storage">>,
): Promise<(string | null)[]> {
  return Promise.all(
    values.map(async (v) => {
      if (typeof v === "string" && v.startsWith("http")) return v;
      try {
        return await ctx.storage.getUrl(v as Id<"_storage">);
      } catch {
        return null;
      }
    }),
  );
}
