"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import {
  History, MessageSquare, ShieldCheck, CalendarCheck,
  MessageSquareWarning, Gavel, FileText, Users2,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Modulo = "comunicado" | "novedad" | "reserva" | "pqrs" | "asamblea" | "documento" | "consejo";

const MODULO_META: Record<Modulo, { label: string; icon: LucideIcon; dot: string }> = {
  comunicado: { label: "Comunicación", icon: MessageSquare,        dot: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  novedad:    { label: "Control",      icon: ShieldCheck,          dot: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  reserva:    { label: "Reservas",     icon: CalendarCheck,        dot: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  pqrs:       { label: "PQRS",         icon: MessageSquareWarning, dot: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  asamblea:   { label: "Asamblea",     icon: Gavel,                dot: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  documento:  { label: "Documentos",   icon: FileText,             dot: "bg-primary/10 text-primary" },
  consejo:    { label: "Consejo",      icon: Users2,               dot: "bg-brand/10 text-brand" },
};

const FILTERS: { value: "" | Modulo; label: string }[] = [
  { value: "", label: "Todo" },
  { value: "comunicado", label: "Comunicación" },
  { value: "novedad", label: "Control" },
  { value: "reserva", label: "Reservas" },
  { value: "pqrs", label: "PQRS" },
  { value: "asamblea", label: "Asamblea" },
  { value: "documento", label: "Documentos" },
  { value: "consejo", label: "Consejo" },
];

function fmtFechaHora(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Hoy · ${time}`;
  if (isYesterday) return `Ayer · ${time}`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) + " · " + time;
}

function fechaGrupo(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return "Hoy";
  if (isYesterday) return "Ayer";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

export default function HistorialPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const feed = useQuery(api.historial.feed, { condominioId, limit: 80 });

  const [filtro, setFiltro] = useState<"" | Modulo>("");

  const filtered = (feed ?? []).filter((e) => !filtro || e.modulo === filtro);

  // Agrupar por fecha
  const grupos: { label: string; eventos: typeof filtered }[] = [];
  for (const ev of filtered) {
    const label = fechaGrupo(ev.ts);
    const last = grupos[grupos.length - 1];
    if (last && last.label === label) last.eventos.push(ev);
    else grupos.push({ label, eventos: [ev] });
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Historial"
          description="Actividad reciente de todo el conjunto en una sola línea de tiempo"
        />

        {/* Filtros por módulo */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              onClick={() => setFiltro(f.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                filtro === f.value
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {feed === undefined ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={History}
            title={filtro ? "Sin actividad en este módulo" : "Sin actividad todavía"}
            description={filtro ? "Prueba con otro filtro o registra actividad en ese módulo." : "A medida que se registre actividad aparecerá aquí."}
          />
        ) : (
          <div className="space-y-6">
            {grupos.map((grupo) => (
              <div key={grupo.label}>
                <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 bg-background/80 py-1 backdrop-blur">
                  <span className="text-sm font-semibold capitalize text-foreground">{grupo.label}</span>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{grupo.eventos.length} evento{grupo.eventos.length === 1 ? "" : "s"}</span>
                </div>
                <div className="relative">
                  <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" aria-hidden />
                  <div className="space-y-2.5">
                    {grupo.eventos.map((ev) => {
                      const meta = MODULO_META[ev.modulo as Modulo] ?? MODULO_META.comunicado;
                      const Icon = meta.icon;
                      return (
                        <div key={ev.id} className="relative flex gap-3 pl-0">
                          <div className={cn("z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-background", meta.dot)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <Card className="flex-1 p-3.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="mb-0.5 flex items-center gap-2">
                                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{meta.label}</span>
                                </div>
                                <p className="text-sm font-medium text-foreground">{ev.titulo}</p>
                                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{ev.detalle}</p>
                                {ev.autor && (
                                  <p className="mt-1 text-xs text-muted-foreground">Por {ev.autor}</p>
                                )}
                              </div>
                              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{fmtFechaHora(ev.ts)}</span>
                            </div>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
