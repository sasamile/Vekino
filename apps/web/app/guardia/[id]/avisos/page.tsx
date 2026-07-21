"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Megaphone, Paperclip, Pin } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function fmtFecha(ts: number) {
  return new Date(ts).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

export default function GuardiaAvisosPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const avisos = useQuery(api.guardia.listAvisos, { condominioId });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
          <Megaphone className="h-5 w-5 text-brand" /> Avisos
        </h1>
        <p className="text-sm text-muted-foreground">Comunicados de la administración para seguridad</p>
      </div>

      {avisos === undefined ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : avisos.length === 0 ? (
        <EmptyState icon={Megaphone} title="Sin avisos" description="Los comunicados dirigidos a portería aparecerán aquí." />
      ) : (
        <div className="space-y-3">
          {[...avisos]
            .sort((a, b) => Number(b.fijado) - Number(a.fijado) || b.createdAt - a.createdAt)
            .map((c) => (
              <Card key={c._id} className={cn("p-5", c.prioridad === "urgente" && "border-red-300 dark:border-red-900")}>
                <div className="flex flex-wrap items-center gap-2">
                  {c.fijado && <Pin className="h-3.5 w-3.5 text-brand" />}
                  <h3 className="font-semibold text-foreground">{c.titulo}</h3>
                  {c.prioridad !== "normal" && (
                    <Badge tone={c.prioridad === "urgente" ? "destructive" : "warning"}>
                      {c.prioridad === "urgente" ? "Urgente" : "Importante"}
                    </Badge>
                  )}
                  {c.audiencia === "guardia" && <Badge tone="brand">Solo seguridad</Badge>}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-foreground">{c.cuerpo}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{c.autorNombre}</span>
                  <span>·</span>
                  <span>{fmtFecha(c.createdAt)}</span>
                  {c.archivos.filter((a) => a.url).map((a, i) => (
                    <a key={i} href={a.url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                      <Paperclip className="h-3 w-3" /> {a.nombre}
                    </a>
                  ))}
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
