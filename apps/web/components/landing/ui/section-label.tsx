import { cn } from "@/lib/utils";

/** Etiqueta pequeña que antecede a los títulos de sección. */
export function SectionLabel({
  children,
  tone = "light",
  className,
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border px-4 py-1.5 text-xs font-medium tracking-wide",
        tone === "dark"
          ? "border-white/15 bg-white/5 text-white/70"
          : "border-ink/10 bg-flame-tint text-flame",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-flame"
      />
      {children}
    </span>
  );
}
