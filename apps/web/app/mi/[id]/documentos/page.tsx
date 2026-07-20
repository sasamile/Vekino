"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { FileText, Download } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { fechaLarga } from "@/components/portal/portal-ui";

const CATEGORIA_LABEL: Record<string, string> = {
  reglamento: "Reglamento",
  acta: "Acta",
  contrato: "Contrato",
  comunicado: "Comunicado",
  financiero: "Financiero",
  otro: "Otro",
};

function formatoTamanio(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Documentos() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;
  const docs = useQuery(api.documentos.listByCondominio, { condominioId });

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Documentos"
        description="Reglamento, actas y documentos del conjunto."
      />

      {docs === undefined ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-5 w-5" />
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No hay documentos publicados"
          description="Aquí verás el reglamento, las actas y otros documentos que comparta la administración."
        />
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <Card key={d._id} className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-foreground">{d.nombre}</p>
                  <Badge tone="neutral">{CATEGORIA_LABEL[d.categoria] ?? d.categoria}</Badge>
                </div>
                {d.descripcion && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{d.descripcion}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fechaLarga(d.createdAt)} · {formatoTamanio(d.tamanio)}
                </p>
              </div>
              {d.url && (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Download className="h-4 w-4" />
                  Abrir
                </a>
              )}
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
