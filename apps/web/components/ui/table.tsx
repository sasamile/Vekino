import * as React from "react";
import { cn } from "@/lib/utils";

/** Contenedor de tabla estilo invoice (referencia). */
export function TableCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-soft",
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px]", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("bg-brand/[0.07]", className)}
      {...props}
    />
  );
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-11 whitespace-nowrap px-4 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground first:pl-5 last:pr-5",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn(className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border/70 transition-colors duration-100 last:border-b-0",
        "even:bg-brand/[0.035]",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "px-4 py-3.5 align-middle first:pl-5 last:pr-5",
        className,
      )}
      {...props}
    />
  );
}

/** Celda primaria + meta secundaria (factura / cliente). */
export function CellStack({
  primary,
  secondary,
  className,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="truncate text-[13px] font-medium text-foreground">{primary}</p>
      {secondary != null && (
        <p className="mt-0.5 truncate text-[12px] font-normal text-muted-foreground">
          {secondary}
        </p>
      )}
    </div>
  );
}
