import { cn } from "@/lib/utils";

/* Marcos de dispositivo. Todo el contenido interior es DEMOSTRATIVO:
 * nombres, unidades y valores son ficticios (ver DEMO_DATA abajo). */

export const DEMO = {
  conjunto: "Reserva del Parque",
  torre: "Torre 2",
  unidad: "Apto. 504",
  residente: "Laura Martínez",
  visitante: "Daniel Rojas",
  zona: "Salón social",
  valor: "$185.000",
  fecha: "18 de agosto",
} as const;

/** Marco de navegador con barra de título y puntos de semáforo. */
export function BrowserMockup({
  children,
  url = "app.vekino.co",
  className,
}: {
  children: React.ReactNode;
  url?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[20px] bg-white ring-1 ring-ink/10",
        "shadow-[0_24px_70px_-20px_rgba(4,32,70,0.35)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-ink/8 bg-mist px-4 py-3">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto rounded-pill bg-white px-3 py-1 text-[11px] text-slate-ink ring-1 ring-ink/8">
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Marco de teléfono con notch y borde metálico. */
export function PhoneMockup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[38px] bg-ink p-2",
        "shadow-[0_30px_80px_-24px_rgba(4,32,70,0.55)] ring-1 ring-white/10",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[30px] bg-white">
        <span
          aria-hidden
          className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-pill bg-ink"
        />
        {children}
      </div>
    </div>
  );
}

/** Tarjeta flotante que representa una notificación de la plataforma. */
export function FloatingNotification({
  icon,
  title,
  detail,
  tone = "light",
  className,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  tone?: "light" | "flame";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-white/95 p-3 pr-5 backdrop-blur",
        "shadow-[0_16px_40px_-12px_rgba(4,32,70,0.3)] ring-1 ring-ink/8",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          tone === "flame"
            ? "bg-flame-tint text-flame"
            : "bg-mist text-ink",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-tight text-ink">
          {title}
        </span>
        <span className="block truncate text-[12px] leading-tight text-slate-ink">
          {detail}
        </span>
      </span>
    </div>
  );
}
