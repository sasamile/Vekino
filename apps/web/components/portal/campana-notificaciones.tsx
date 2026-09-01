"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  FileText,
  Gavel,
  Megaphone,
  Package,
  UserCheck,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Campana de notificaciones del portal web.
 *
 * La bandeja existía desde antes pero solo la leía la app móvil: quien entra
 * por el navegador no tenía dónde enterarse de que le llegó un paquete o de
 * que portería reportó su carro. Esta es esa mitad.
 *
 * Los datos son los mismos de la app; no hay una segunda fuente que se pueda
 * desincronizar.
 */

const ICONO: Record<string, LucideIcon> = {
  factura: Wallet,
  comunicado: Megaphone,
  documento: FileText,
  visitante: UserCheck,
  asamblea: Gavel,
  paquete: Package,
  novedad: AlertTriangle,
};

/**
 * A dónde lleva cada aviso en la WEB.
 *
 * El feed trae la ruta de la app móvil (`/(app)/…`), que aquí no sirve. Se
 * traduce por tipo en vez de guardar dos rutas en la base: la que manda es
 * la navegación de cada aplicación, no el dato.
 */
function rutaWeb(tipo: string, base: string): string | null {
  switch (tipo) {
    case "factura":
      return `${base}/cuenta`;
    case "comunicado":
      return `${base}/avisos`;
    case "documento":
      return `${base}/documentos`;
    case "visitante":
      return `${base}/visitantes`;
    case "asamblea":
      return `${base}/asambleas`;
    case "paquete":
    case "novedad":
      // Lo de la casa vive todo junto en "Mi unidad".
      return `${base}/unidad`;
    default:
      return null;
  }
}

function cuando(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(ts).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export function CampanaNotificaciones({
  condominioId,
  base,
}: {
  condominioId: Id<"condominios">;
  base: string;
}) {
  const feed = useQuery(api.notificacionesFeed.feed, { condominioId });
  const marcarVistas = useMutation(api.notificacionesFeed.marcarVistas);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const sinLeer = feed?.sinLeer ?? 0;

  // Cerrar al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  function alternar() {
    const abriendo = !abierto;
    setAbierto(abriendo);
    /* Se marca al ABRIR, no al cerrar: si el usuario cierra la pestaña sin
     * cerrar el panel, ya lo vio y el punto no debería seguir encendido. */
    if (abriendo && sinLeer > 0) void marcarVistas({}).catch(() => {});
  }

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-label={sinLeer > 0 ? `${sinLeer} avisos sin leer` : "Avisos"}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full transition-colors",
          abierto
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {sinLeer > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Avisos"
          className="absolute right-0 z-50 mt-2 w-[min(92vw,26rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-floating"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Avisos</p>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar"
              className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {feed === undefined ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Cargando…
              </p>
            ) : feed.items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-7 w-7 text-muted-foreground/40" aria-hidden />
                <p className="mt-2 text-sm text-muted-foreground">
                  No tienes avisos por ahora.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {feed.items.map((it) => {
                  const Icono = ICONO[it.tipo] ?? Bell;
                  const href = rutaWeb(it.tipo, base);
                  const nuevo = it.createdAt > feed.vistasAt;
                  const cuerpo = (
                    <div className="flex gap-3 px-4 py-3">
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          nuevo
                            ? "bg-brand/12 text-brand"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icono className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm",
                            nuevo ? "font-semibold text-foreground" : "text-foreground",
                          )}
                        >
                          {it.titulo}
                        </p>
                        {it.detalle && (
                          <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
                            {it.detalle}
                          </p>
                        )}
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/70">
                          <CalendarDays className="h-3 w-3" aria-hidden />
                          {cuando(it.createdAt)}
                        </p>
                      </div>
                      {nuevo && (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand"
                          aria-hidden
                        />
                      )}
                    </div>
                  );

                  return (
                    <li key={it.id}>
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => setAbierto(false)}
                          className="block transition-colors hover:bg-accent"
                        >
                          {cuerpo}
                        </Link>
                      ) : (
                        cuerpo
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
