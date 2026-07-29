"use client";

import { useEffect, useState } from "react";
import { Vote, UserPlus, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "vekino_asamblea_tabs_tour_v1";

type Step = {
  key: "votar" | "poderes";
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    key: "votar",
    title: "Votar",
    body: "Aquí registras asistencia y emites tu voto por tus unidades (y por las que te hayan otorgado poder).",
  },
  {
    key: "poderes",
    title: "Poderes",
    body: "Si no puedes ir, delega una o varias unidades a otra persona. No es lo mismo que votar: solo autorizas a alguien a votar por ti.",
  },
];

/**
 * Mini-tour (2 pasos) para no confundir Votar vs Poderes.
 * Se muestra una vez por navegador; se puede saltar.
 */
export function AsambleaTabsTour({
  enabled,
  onGoToTab,
}: {
  enabled: boolean;
  onGoToTab: (tab: "votar" | "poderes") => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [enabled]);

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  function next() {
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
    const nextStep = step + 1;
    setStep(nextStep);
    onGoToTab(STEPS[nextStep]!.key);
  }

  useEffect(() => {
    if (!open) return;
    onGoToTab(STEPS[step]!.key);
    // solo al abrir / cambiar step vía next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const current = STEPS[step]!;
  const Icon = current.key === "votar" ? Vote : UserPlus;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
        onClick={finish}
        aria-hidden
      />
      <div
        role="dialog"
        aria-labelledby="asamblea-tour-title"
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <button
          type="button"
          onClick={finish}
          className="absolute top-3 right-3 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/15 text-brand">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Paso {step + 1} de {STEPS.length}
            </p>
            <h2
              id="asamblea-tour-title"
              className="text-base font-semibold text-foreground"
            >
              {current.title}
            </h2>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {current.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Saltar
          </button>
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  i === step ? "bg-brand" : "bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
          <Button type="button" size="sm" onClick={next}>
            {isLast ? "Entendido" : "Siguiente"}
            {!isLast ? <ChevronRight className="h-4 w-4" /> : null}
          </Button>
        </div>
      </div>
    </div>
  );
}
