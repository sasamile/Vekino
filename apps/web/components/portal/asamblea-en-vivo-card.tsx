"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Radio, ArrowRight } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { LiquidGlassCard } from "@/components/portal/liquid-glass-card";
import { Button } from "@/components/ui/button";

/**
 * Banner en el inicio del portal cuando hay asamblea virtual en curso.
 * Propietarios que no delegaron (o son apoderados) ven "Entrar a la sala".
 * Quien delegó todo ve un aviso sin empujarlos a la sala.
 */
export function AsambleaEnVivoCard({
  condominioId,
}: {
  condominioId: Id<"condominios">;
}) {
  const asambleas = useQuery(api.asambleas.listByCondominio, { condominioId });
  const enCurso =
    asambleas?.find(
      (a) => a.estado === "en_curso" && a.modalidad !== "presencial",
    ) ?? null;

  const mi = useQuery(
    api.asambleas.miParticipacion,
    enCurso ? { asambleaId: enCurso._id } : "skip",
  );

  if (!enCurso) return null;
  /* Esperamos participación para no mostrar el CTA a quien ya delegó todo. */
  if (mi === undefined) return null;

  const puedeEntrar = !(mi.delegoTodo && (mi.representa?.length ?? 0) === 0);
  const detalleHref = `/mi/${condominioId}/asambleas/${enCurso._id}`;
  const salaHref = `/sala/${condominioId}/${enCurso._id}`;

  if (!puedeEntrar) {
    return (
      <LiquidGlassCard className="border-border/80 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Radio className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Asamblea en vivo
            </p>
            <p className="mt-0.5 text-base font-semibold text-foreground">
              {enCurso.titulo}
            </p>
            <p className="mt-1 text-sm text-foreground/70">
              {mi.apoderadoNombre ? (
                <>
                  <span className="font-medium text-foreground">
                    {mi.apoderadoNombre}
                  </span>{" "}
                  vota por ti en esta asamblea. No necesitas entrar a la sala.
                </>
              ) : (
                <>
                  Delegaste tu poder: tu apoderado vota por ti. No necesitas
                  entrar a la sala.
                </>
              )}
            </p>
            <Link
              href={detalleHref}
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-foreground/70 hover:text-foreground"
            >
              Ver asamblea
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </LiquidGlassCard>
    );
  }

  return (
    <LiquidGlassCard className="border-emerald-500/30 bg-emerald-500/5 p-4 dark:bg-emerald-500/10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
            <Radio className="h-5 w-5 animate-pulse" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Asamblea en vivo · sala abierta
            </p>
            <p className="mt-0.5 text-base font-semibold text-foreground">
              {enCurso.titulo}
            </p>
            <p className="mt-1 text-sm text-foreground/70">
              {mi.delegoTodo
                ? "Entras como apoderado de otras unidades."
                : "Entra a la sala para registrarte y votar por tu unidad."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button variant="brand" size="default" asChild className="min-h-11 flex-1 sm:flex-none">
            <Link href={salaHref}>
              <Radio className="h-4 w-4" />
              Entrar a la sala
            </Link>
          </Button>
          <Button variant="outline" size="default" asChild className="min-h-11 flex-1 sm:flex-none">
            <Link href={detalleHref}>Ver detalle</Link>
          </Button>
        </div>
      </div>
    </LiquidGlassCard>
  );
}
