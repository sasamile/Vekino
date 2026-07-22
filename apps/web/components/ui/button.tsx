import * as React from "react";
import { Slot } from "./slot";
import { cn } from "@/lib/utils";

type Variant =
  | "primary"
  | "brand"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";
type Size = "sm" | "default" | "lg" | "icon";

const variants: Record<Variant, string> = {
  // CTAs usan el color del condominio (--brand), no el negro de --primary.
  primary:
    "bg-brand text-brand-foreground hover:bg-brand/90 shadow-[0_4px_10px_hsl(var(--brand)/0.28)]",
  brand:
    "bg-brand text-brand-foreground hover:bg-brand/90 shadow-[0_4px_10px_hsl(var(--brand)/0.28)]",
  secondary:
    "bg-card text-foreground border border-border hover:bg-accent",
  outline:
    "border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[12.5px] gap-1.5",
  default: "h-10 px-4 text-[13.5px] gap-1.5",
  lg: "h-11 px-5 text-sm gap-2",
  icon: "h-[38px] w-[38px]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-full font-medium transition-all duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
