"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Footprints, Loader2, MapPin, Play } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Select } from "@/components/ui/input";
import { RondaActiva } from "@/components/guardia/ronda-activa";
import { HistorialRondas } from "@/components/guardia/historial-rondas";

/**
 * Rondas de vigilancia.
 *
 * El guarda solo ve dos cosas: la ronda que tiene abierta —si la tiene— y las
 * anteriores. Todo lo que registre mientras hay una en curso se le cuelga
 * solo, sin que tenga que indicarlo en ningún sitio.
 */
export default function RondasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const condominioId = id as Id<"condominios">;

  const activa = useQuery(api.rondas.activa, { condominioId });
  const zonas = useQuery(api.guardia.listRondaZonas, { condominioId });
  const iniciar = useMutation(api.rondas.iniciar);

  const [zonaId, setZonaId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function empezar() {
    setBusy(true);
    setError(null);
    try {
      await iniciar({
        condominioId,
        zonaId: zonaId ? (zonaId as Id<"guardiaRondaZonas">) : undefined,
      });
      setZonaId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar la ronda.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rondas"
        description="Cada recorrido queda con su hora de inicio, lo que ocurrió y cuánto duró"
      />

      {activa === undefined ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : activa ? (
        <RondaActiva
          rondaId={activa._id}
          numero={activa.numero}
          zona={activa.zona}
          fechaInicio={activa.fechaInicio}
          observaciones={observaciones}
          onObservaciones={setObservaciones}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <Footprints className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                No tienes ninguna ronda abierta
              </p>
              <p className="text-xs text-muted-foreground">
                La hora de inicio y tu nombre los pone el sistema
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <MapPin className="h-3.5 w-3.5" /> Zona de inicio (opcional)
              </label>
              <Select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
                <option value="">Recorrido general</option>
                {(zonas ?? []).map((z) => (
                  <option key={z._id} value={z._id}>
                    {z.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={empezar} disabled={busy} className="w-full">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Iniciar ronda
            </Button>
            {error && <p className="text-[13px] text-destructive">{error}</p>}
          </div>
        </div>
      )}

      <HistorialRondas condominioId={condominioId} />
    </div>
  );
}
