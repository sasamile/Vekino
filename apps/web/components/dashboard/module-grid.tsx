import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NAV_GROUPS } from "@/components/layout/nav-config";
import { Card } from "@/components/ui/card";

const DESCRIPTIONS: Record<string, string> = {
  Residentes: "Personas del condominio y sus roles",
  Unidades: "Inmuebles, ocupantes y estado",
  Vehículos: "Registro vehicular y parqueaderos",
  Control: "Guardia, minuta y accesos",
  Reservas: "Zonas comunes y agendamiento",
  Finanzas: "Cuentas de cobro y cartera",
  Comunicación: "Avisos y notificaciones",
  Documentos: "Actas, reglamentos y archivos",
  Reportes: "Indicadores y descargas",
};

export function ModuleGrid({ base }: { base: string }) {
  // Todos los módulos excepto el Dashboard
  const modules = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.segment !== "");

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {modules.map((m) => {
        const Icon = m.icon;
        return (
          <Link
            key={m.label}
            href={`${base}/${m.segment}`}
            className="group rounded-2xl border border-border bg-card p-5 transition-colors duration-150 hover:border-border/60 hover:bg-accent/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-brand/10 group-hover:text-brand">
                <Icon className="h-4 w-4" aria-hidden />
              </div>
              <ArrowUpRight
                className="h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground"
                aria-hidden
              />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">{m.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {DESCRIPTIONS[m.label]}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
