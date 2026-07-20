"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  Gavel, Calendar, Clock, MapPin, Download, ListChecks, ArrowRight, Radio,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { fechaISO } from "@/components/portal/portal-ui";

const ESTADO_META: Record<string, { label: string; tone: "info" | "success" | "warning" | "neutral" | "destructive" }> = {
  programada: { label: "Programada", tone: "info" },
  en_curso: { label: "En curso", tone: "warning" },
  finalizada: { label: "Finalizada", tone: "success" },
  cancelada: { label: "Cancelada", tone: "destructive" },
};

export default function Asambleas() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;
  const asambleas = useQuery(api.asambleas.listByCondominio, { condominioId });

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Asambleas"
        description="Reuniones de propietarios, agenda y actas."
      />

      {asambleas === undefined ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-5 w-5" />
        </div>
      ) : asambleas.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="No hay asambleas programadas"
          description="Aquí verás las asambleas ordinarias y extraordinarias del conjunto."
        />
      ) : (
        <div className="space-y-4">
          {asambleas.map((a) => {
            const estado = ESTADO_META[a.estado];
            return (
              <Card key={a._id} className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <Gavel className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-foreground">{a.titulo}</h3>
                      {estado && <Badge tone={estado.tone}>{estado.label}</Badge>}
                      <Badge tone="neutral" className="capitalize">
                        {a.tipo}
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" /> {fechaISO(a.fecha)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-4 w-4" /> {a.hora}
                      </span>
                      <span className="inline-flex items-center gap-1.5 capitalize">
                        <MapPin className="h-4 w-4" /> {a.lugar || a.modalidad}
                      </span>
                    </div>

                    {a.descripcion && (
                      <p className="mt-3 text-sm text-foreground/90">{a.descripcion}</p>
                    )}

                    {a.agenda.length > 0 && (
                      <div className="mt-4">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <ListChecks className="h-4 w-4" /> Orden del día
                        </p>
                        <ol className="mt-1.5 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                          {a.agenda.map((punto, i) => (
                            <li key={i}>{punto}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {(a.estado === "programada" || a.estado === "en_curso") && (
                        <Link
                          href={`/mi/${condominioId}/asambleas/${a._id}`}
                          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90"
                        >
                          {a.estado === "en_curso" ? (
                            <>
                              <Radio className="h-4 w-4 animate-pulse" />
                              Entrar a la asamblea
                            </>
                          ) : (
                            <>
                              Ver asamblea
                              <ArrowRight className="h-4 w-4" />
                            </>
                          )}
                        </Link>
                      )}
                      {a.estado === "finalizada" && (
                        <Link
                          href={`/mi/${condominioId}/asambleas/${a._id}`}
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                        >
                          Ver resultados
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      )}
                      {a.actaUrl && (
                        <a
                          href={a.actaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                        >
                          <Download className="h-4 w-4" />
                          Ver acta
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
