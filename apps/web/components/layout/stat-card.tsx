import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
  tone = "neutral",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: "neutral" | "primary" | "brand" | "success" | "warning" | "destructive";
  className?: string;
}) {
  const toneClasses: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    brand: "bg-brand/10 text-brand",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    destructive: "bg-red-500/10 text-red-600 dark:text-red-400",
  };

  const inner = (
    <Card
      className={cn(
        "group relative p-5 transition-colors duration-150",
        href && "hover:border-border/60 hover:bg-accent/30",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            toneClasses[tone],
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        {href && (
          <ArrowUpRight
            className="h-4 w-4 text-muted-foreground/40 transition-colors duration-150 group-hover:text-muted-foreground"
            aria-hidden
          />
        )}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
