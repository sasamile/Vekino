"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/utils";

/** Gradientes suaves y distintos; el índice sale del nombre para que sea estable. */
const GRADIENTES = [
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-blue-500",
  "from-rose-400 to-orange-400",
  "from-amber-400 to-orange-500",
  "from-cyan-400 to-emerald-500",
  "from-fuchsia-400 to-rose-500",
  "from-lime-400 to-emerald-500",
  "from-indigo-400 to-sky-500",
  "from-orange-400 to-amber-300",
  "from-teal-400 to-cyan-500",
] as const;

function gradienteDeNombre(name: string) {
  const key = name.trim().toLowerCase() || "?";
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return GRADIENTES[h % GRADIENTES.length]!;
}

/** Avatar circular: foto si hay `image`, si no iniciales sobre gradiente. */
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
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-sm",
        gradienteDeNombre(name),
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
