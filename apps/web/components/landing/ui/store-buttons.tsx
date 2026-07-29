import { cn } from "@/lib/utils";

/* ⚠️ PLACEHOLDER: reemplazar por los enlaces oficiales cuando la app esté
 * publicada. Ver README de la landing. */
export const STORE_LINKS = {
  appStore: "#app-store-placeholder",
  playStore: "#play-store-placeholder",
} as const;

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M16.36 12.72c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3-.79-1.55.02-2.98.9-3.77 2.28-1.61 2.79-.41 6.92 1.15 9.19.77 1.11 1.68 2.35 2.87 2.31 1.15-.05 1.59-.74 2.98-.74 1.39 0 1.78.74 3 .72 1.24-.02 2.02-1.13 2.78-2.24.87-1.28 1.23-2.52 1.25-2.59-.03-.01-2.4-.92-2.42-3.65ZM14.1 5.96c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.68-1.09 1.77-.95 2.81 1.02.08 2.05-.52 2.68-1.28Z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <path fill="#34A853" d="M3.6 2.3 14.3 12 3.6 21.7a1.6 1.6 0 0 1-.6-1.3V3.6c0-.5.2-1 .6-1.3Z" />
      <path fill="#4285F4" d="M17.9 8.4 14.3 12 3.6 2.3c.4-.3 1-.4 1.5-.1l12.8 6.2Z" />
      <path fill="#EA4335" d="M17.9 15.6 5.1 21.8c-.5.3-1.1.2-1.5-.1L14.3 12l3.6 3.6Z" />
      <path fill="#FBBC04" d="M21.3 10.7c.6.3.9.8.9 1.3s-.3 1-.9 1.3l-3.4 2.3L14.3 12l3.6-3.6 3.4 2.3Z" />
    </svg>
  );
}

export function StoreButton({
  store,
  className,
}: {
  store: "appStore" | "playStore";
  className?: string;
}) {
  const isApple = store === "appStore";
  return (
    <a
      href={STORE_LINKS[store]}
      className={cn(
        "inline-flex h-14 items-center gap-3 rounded-2xl bg-white px-5 text-ink transition-transform",
        "ring-1 ring-ink/10 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        className,
      )}
      aria-label={
        isApple ? "Descargar en el App Store" : "Descargar en Google Play"
      }
    >
      {isApple ? <AppleGlyph /> : <PlayGlyph />}
      <span className="whitespace-nowrap text-left leading-tight">
        <span className="block text-[10px] text-slate-ink">
          {isApple ? "Descárgala en el" : "Disponible en"}
        </span>
        <span className="block text-[15px] font-semibold">
          {isApple ? "App Store" : "Google Play"}
        </span>
      </span>
    </a>
  );
}
