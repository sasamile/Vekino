import * as React from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "neutral"
  | "primary"
  | "brand"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "violet";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary dark:bg-primary/20",
  brand: "bg-brand/10 text-brand",
  success: "bg-brand/10 text-brand",
  warning: "bg-[#B1D459]/15 text-[#6b8a28] dark:text-[#c9e07a]",
  destructive: "bg-red-500/10 text-red-600 dark:text-red-400",
  info: "bg-brand/10 text-brand",
  violet: "bg-muted text-muted-foreground",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
