"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Footprints,
  BookOpenCheck,
  Users,
  ShieldAlert,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { EtiquetaRonda } from "@/components/guardia/etiqueta-ronda";
import { TablaRondas } from "@/components/vigilancia/tabla-rondas";
import { cn } from "@/lib/utils";

function fechaHora(ms: number): string {
  return new Date(ms).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * SUPERVISIÓN DE UN CONJUNTO.
 *
 * La misma pantalla para el supervisor y para el administrador de la compañía:
 * los dos miran la operación de un conjunto que su empresa cubre, y lo que
 * cambia entre ellos —cuáles— ya viene resuelto del servidor.
 *
 * El conjunto seleccionado es el contexto: viene en la URL y va en cada
 * consulta. Que venga del cliente no autoriza nada —el servidor comprueba en
 * cada llamada que quien pregunta tiene `porteria.ver` sobre ESE conjunto: el
 * supervisor solo la tiene donde hay una asignación vigente suya, y el
 * administrador solo donde su empresa tiene contrato en vigor—. Cambiar el id
 * a mano lleva a un conjunto que responde vacío o rechaza.
 *
 * No es la app de portería: `/guardia/:id` es donde el guarda abre turno y
 * cierra rondas, y sigue siendo suya. Aquí solo se mira.
 */
export default function SupervisionConjuntoPage({
  params,
}: {
  params: Promise<{ condominioId: string }>;
}) {
  const { condominioId: raw } = use(params);
  const condominioId = raw as Id<"condominios">;

  /* De `miEquipo` y no de una consulta por id: así la pantalla solo puede
   * hablar de conjuntos que el servidor ya reconoció como suyos, y el nombre
   * del conjunto no se pide por separado. */
  const equipo = useQuery(api.asignaciones.miEquipo);
  const conjunto = equipo?.find((c) => c.condominioId === condominioId);

  const [guardaId, setGuardaId] = useState<string>("");
  const [tab, setTab] = useState<"rondas" | "minuta">("rondas");

  const filtro = guardaId ? (guardaId as Id<"users">) : undefined;
  const rondas = useQuery(
    api.rondas.listar,
    conjunto ? { condominioId, guardiaUserId: filtro, limite: 50 } : "skip",
  );
  const minuta = useQuery(
    api.guardia.listMinuta,
    conjunto ? { condominioId, actorUserId: filtro, limit: 100 } : "skip",
  );

  if (equipo === undefined) {
    return (
      <PageContainer>
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </PageContainer>
    );
  }

  /* Un conjunto que no tiene a su cargo se ve igual que uno que no existe. */
  if (!conjunto) {
    return (
      <PageContainer>
        <EmptyState
          icon={ShieldAlert}
          title="Ese conjunto no está entre los tuyos"
          description="Solo alcanzas los conjuntos que tu compañía atiende hoy y que te corresponden. Si el contrato o tu asignación terminaron, el conjunto deja de estar aquí."
          action={
            <Link href="/vigilancia" className="text-sm text-brand hover:underline">
              Volver a mis conjuntos
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const guarda = conjunto.guardas.find((g) => g.userId === guardaId);

  return (
    <PageContainer>
      <div className="space-y-6">
        <Link
          href="/vigilancia"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Mis conjuntos
        </Link>

        <PageHeader
          title={conjunto.condominioNombre}
          description={`${conjunto.companiaNombre} · ${conjunto.guardas.length} guarda${conjunto.guardas.length === 1 ? "" : "s"} a tu cargo`}
        />

        <Card className="flex flex-wrap items-end gap-4">
          <label className="flex-1 min-w-[220px] space-y-1.5">
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
              <Users className="h-3.5 w-3.5 text-brand" aria-hidden />
              Guarda
            </span>
            <Select
              value={guardaId}
              onChange={(e) => setGuardaId(e.target.value)}
            >
              <option value="">Toda la portería</option>
              {conjunto.guardas.map((g) => (
                <option key={g.userId} value={g.userId}>
                  {g.nombre}
                </option>
              ))}
            </Select>
          </label>
          <p className="flex-1 min-w-[220px] pb-2 text-[11.5px] text-muted-foreground">
            {guarda
              ? `Rondas y minuta registradas por ${guarda.nombre} en este conjunto.`
              : "Toda la operación del conjunto, sin importar quién la registró."}
          </p>
        </Card>

        <div className="flex gap-1 border-b border-border">
          <Tab
            activo={tab === "rondas"}
            onClick={() => setTab("rondas")}
            icon={Footprints}
            label="Rondas"
            n={rondas?.length}
          />
          <Tab
            activo={tab === "minuta"}
            onClick={() => setTab("minuta")}
            icon={BookOpenCheck}
            label="Minuta"
            n={minuta?.length}
          />
        </div>

        {tab === "rondas" ? (
          <TablaRondas
            rondas={rondas}
            vacio={
              guarda
                ? `${guarda.nombre} todavía no tiene rondas en este conjunto.`
                : undefined
            }
          />
        ) : minuta === undefined ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : minuta.length === 0 ? (
          <EmptyState
            icon={BookOpenCheck}
            title="Minuta vacía"
            description={
              guarda
                ? `${guarda.nombre} no ha registrado eventos en este conjunto.`
                : "Todavía no hay eventos registrados en esta portería."
            }
          />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border/60">
              {minuta.map((e) => (
                <li key={e._id} className="flex gap-3 px-5 py-3">
                  <span className="w-28 shrink-0 text-[11.5px] text-muted-foreground">
                    {fechaHora(e.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] text-foreground">
                        {e.tipo}
                      </span>
                      <Badge tone="neutral">{e.modulo}</Badge>
                      <span className="text-[11.5px] text-muted-foreground">
                        {e.unidad}
                      </span>
                      {/* En qué recorrido ocurrió. Lo mismo que ya muestra la
                          minuta de portería, con la misma etiqueta y el mismo
                          dato de `listMinuta`: aquí faltaba, y sin eso el
                          supervisor no podía situar el evento en su ronda. */}
                      <EtiquetaRonda numero={e.rondaNumero} zona={e.rondaZona} />
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                      {e.resumen}
                    </span>
                  </span>
                  <span className="w-32 shrink-0 truncate text-right text-[11.5px] text-muted-foreground">
                    {e.actorNombre}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}

function Tab({
  activo,
  onClick,
  icon: Icon,
  label,
  n,
}: {
  activo: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  n?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors",
        activo
          ? "border-brand text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {n !== undefined && (
        <span className="text-[11.5px] text-muted-foreground">({n})</span>
      )}
    </button>
  );
}
