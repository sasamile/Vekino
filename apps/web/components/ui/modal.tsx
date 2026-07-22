"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-100 overflow-y-auto overscroll-contain bg-foreground/35 backdrop-blur-sm dark:bg-foreground/45"
      onClick={onClose}
    >
      {/*
        items-start + padding vertical: los modales altos no se cortan arriba.
        En pantallas altas, my-auto centra cuando cabe.
      */}
      <div className="flex min-h-full items-start justify-center p-4 py-6 sm:p-6 sm:py-10">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            "animate-scale-in relative my-auto flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-floating",
            "max-h-[min(90dvh,calc(100dvh-3rem))]",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {(title || description) && (
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div className="min-w-0 space-y-0.5">
                {title && (
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-sm text-muted-foreground">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {children}
          </div>
          {footer && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
