import { cn } from "@/lib/utils";

export interface HBar {
  label: string;
  value: number;
  color?: string;
}

/** Barras horizontales con etiqueta + valor. Ideal para rankings. */
export function HBars({
  data,
  format = (n) => String(n),
  color = "hsl(213 80% 40%)",
  className,
}: {
  data: HBar[];
  format?: (n: number) => string;
  color?: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <div className={cn("space-y-3", className)}>
      {sorted.map((d) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={d.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{d.label}</span>
              <span className="font-medium tabular-nums text-foreground">
                {format(d.value)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: d.color ?? color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
