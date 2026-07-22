import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "brand" | "success" | "warning" | "destructive";

const toneIcon: Record<Tone, string> = {
  neutral: "bg-muted text-foreground/70",
  primary: "bg-brand/10 text-brand",
  brand: "bg-brand/10 text-brand",
  success: "bg-[#B1D459]/20 text-[#6b8a28] dark:text-[#B1D459]",
  warning: "bg-[#B1D459]/20 text-[#6b8a28] dark:text-[#B1D459]",
  destructive: "bg-red-500/10 text-red-600 dark:text-red-400",
};

/**
 * KPI con icono en tile suave (sin arcoíris de colores).
 * El valor y el hint van en columna para que montos largos no se corten.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  badge,
  badgeTone = "positive",
  href,
  tone = "neutral",
  iconClassName,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  badge?: string;
  badgeTone?: "positive" | "negative" | "pending";
  href?: string;
  tone?: Tone;
  iconClassName?: string;
  className?: string;
}) {
  const badgeClass =
    badgeTone === "positive"
      ? "bg-brand/10 text-brand"
      : badgeTone === "negative"
        ? "bg-[#B1D459]/20 text-[#6b8a28] dark:text-[#B1D459]"
        : "bg-[#B1D459]/15 text-[#6b8a28] dark:text-[#c9e07a]";

  const chip = badge ?? hint;
  const valueStr = String(value);
  const longValue = valueStr.length >= 12;

  const inner = (
    <Card
      className={cn(
        "group relative flex min-h-19 items-start gap-3 overflow-hidden transition-colors",
        href && "hover:bg-accent/40",
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            "mt-0.5 grid h-10.5 w-10.5 shrink-0 place-items-center rounded-[11px]",
            toneIcon[tone],
            iconClassName,
          )}
        >
          <Icon className="h-4.5 w-4.5 stroke-[1.75]" aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 font-semibold tracking-tight tabular-nums text-foreground",
            longValue
              ? "text-[15px] leading-snug sm:text-base lg:text-lg"
              : "text-xl leading-tight sm:text-[22px]",
          )}
          title={valueStr}
        >
          {value}
        </p>
        {chip && (
          <p
            className={cn(
              "mt-1 max-w-full truncate text-[11px] font-medium",
              badge
                ? cn(
                    "inline-flex h-5.5 items-center rounded-full px-2 font-semibold",
                    badgeClass,
                  )
                : "text-muted-foreground",
            )}
            title={chip}
          >
            {chip}
          </p>
        )}
      </div>
      {href && (
        <ArrowUpRight
          className="absolute right-3 top-3 h-3.5 w-3.5 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground"
          aria-hidden
        />
      )}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block min-w-0">
        {inner}
      </Link>
    );
  }
  return inner;
}
