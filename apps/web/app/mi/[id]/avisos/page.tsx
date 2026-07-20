"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Megaphone, Pin, Paperclip } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { fechaLarga } from "@/components/portal/portal-ui";

export default function Avisos() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;
  const avisos = useQuery(api.comunicados.listByCondominio, { condominioId });

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Avisos"
        description="Comunicados y noticias de la administración."
      />

      {avisos === undefined ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-5 w-5" />
        </div>
      ) : avisos.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No hay avisos por ahora"
          description="Aquí verás los comunicados que publique la administración."
        />
      ) : (
        <div className="space-y-4">
          {avisos.map((a) => (
            <Card
              key={a._id}
              className={cn(
                "p-6",
                a.fijado && "border-brand/30 bg-brand/[0.03]",
              )}
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{a.titulo}</h3>
                    {a.fijado && (
                      <Badge tone="brand" className="gap-1">
                        <Pin className="h-3 w-3" /> Fijado
                      </Badge>
                    )}
                    {a.prioridad === "urgente" && <Badge tone="destructive">Urgente</Badge>}
                    {a.prioridad === "importante" && <Badge tone="warning">Importante</Badge>}
                  </div>

                  <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">
                    {a.cuerpo}
                  </p>

                  {a.archivosItems.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {a.archivosItems.map((f) => (
                        <a
                          key={f.storageId}
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                        >
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          {f.nombre}
                        </a>
                      ))}
                    </div>
                  )}

                  <p className="mt-4 text-xs text-muted-foreground">
                    Publicado por {a.autorNombre} · {fechaLarga(a.createdAt)}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
