"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Square } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { LineaDeTiempo } from "./linea-de-tiempo";

/** "1 h 03 m" contando desde el inicio, refrescado cada 30 s. */
function useTranscurrido(desde: number) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    /* Cada 30 s y no cada segundo: el guarda mira esto de reojo, y un
     * cronómetro al segundo solo gasta batería en el celular. */
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const min = Math.max(0, Math.floor((ahora - desde) / 60_000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${String(min % 60).padStart(2, "0")} m` : `${min} m`;
}

export function RondaActiva({
  rondaId,
  numero,
  zona,
  fechaInicio,
  observaciones,
  onObservaciones,
}: {
  rondaId: Id<"guardiaRondas">;
  numero: number | null;
  zona: string;
  fechaInicio: number;
  observaciones: string;
  onObservaciones: (v: string) => void;
}) {
  const detalle = useQuery(api.rondas.detalle, { rondaId });
  const finalizar = useMutation(api.rondas.finalizar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcurrido = useTranscurrido(fechaInicio);

  async function cerrar() {
    setBusy(true);
    setError(null);
    try {
      await finalizar({ rondaId, observaciones: observaciones.trim() || undefined });
      onObservaciones("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar la ronda.");
    } finally {
      setBusy(false);
    }
  }

  const hora = new Date(fechaInicio).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-4 rounded-2xl border-2 border-brand/40 bg-brand/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
            </span>
            <p className="text-sm font-semibold text-foreground">
              Ronda {numero ? `#${numero}` : ""} en curso
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {zona} · empezó a las {hora} · lleva {transcurrido}
          </p>
        </div>
        <div className="flex gap-3 text-center text-xs">
          {detalle && (
            <>
              <Contador n={detalle.totales.novedades} label="novedades" />
              <Contador n={detalle.totales.vehiculos} label="vehículos" />
              <Contador n={detalle.totales.eventos} label="eventos" />
            </>
          )}
        </div>
      </div>

      {detalle && detalle.lineaDeTiempo.length > 0 && (
        <LineaDeTiempo hitos={detalle.lineaDeTiempo} />
      )}

      <div className="space-y-2 border-t border-border/60 pt-4">
        <Textarea
          rows={2}
          value={observaciones}
          onChange={(e) => onObservaciones(e.target.value)}
          placeholder="Observaciones de cierre (opcional)"
        />
        <Button variant="outline" onClick={cerrar} disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
          Finalizar ronda
        </Button>
        {error && <p className="text-[13px] text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function Contador({ n, label }: { n: number; label: string }) {
  return (
    <div className="min-w-[64px] rounded-lg bg-card px-3 py-2">
      <p className="text-lg font-semibold leading-none text-foreground">{n}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
