"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/utils";

/** Avatar circular: foto si hay `image`, si no iniciales. */
export function UserAvatar({
  name,
  image,
  size = "md",
  className,
}: {
  name: string;
  image?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const dim = size === "sm" ? "h-8 w-8 text-[10px]" : "h-8 w-8 text-xs";
  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        onError={() => setBroken(true)}
        className={cn(dim, "shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        "flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
