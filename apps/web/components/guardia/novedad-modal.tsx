"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { AlertTriangle, Clock, FileText, Home, Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useUploadToS3 } from "@/hooks/use-upload-s3";
import { SelectorUnidades, type UnidadElegida } from "./selector-unidades";

type Prioridad = "baja" | "media" | "alta";

/**
 * Reportar una novedad de seguridad.
 *
 * Vive aparte de la pagina de Novedades porque tambien se abre desde la ronda
 * en curso: el guarda que va caminando no deberia tener que salirse de la
 * ronda, ir a otra pantalla y volver. Estaba encerrado en la pagina, y por eso
 * la ronda no tenia como registrar nada.
 */
export function NovedadModal({ condominioId, onClose }: { condominioId: Id<"condominios">; onClose: () => void }) {
  const reportar = useMutation(api.guardia.reportarNovedad);
  const uploadFile = useUploadToS3();
  const [titulo, setTitulo] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [descripcion, setDescripcion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [unidades, setUnidades] = useState<UnidadElegida[]>([]);
  /* Arranca en la hora actual, que es lo correcto la mayoría de las veces.
     Se cambia cuando el guarda escribe algo que vio hace rato. */
  const [hora, setHora] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valido = titulo.trim().length > 0 && descripcion.trim().length > 0;

  async function confirmar() {
    if (!valido) return;
    setBusy(true); setError(null);
    try {
      let archivoUrl: string | undefined;
      if (archivo) {
        if (archivo.size > 15 * 1024 * 1024) throw new Error("El adjunto no puede superar 15 MB.");
        const uploaded = await uploadFile(
          archivo,
          `condominios/guardia/${condominioId}/novedades`,
        );
        archivoUrl = uploaded.url;
      }
      /* La hora se interpreta sobre el día de hoy. Si es mayor que ahora, se
         asume que fue ayer: a las 00:20 el guarda que reporta algo de las
         23:50 se refiere a la noche anterior, no a dentro de 23 horas. */
      let ocurrioEn: number | undefined;
      const [hh, mm] = hora.split(":").map(Number);
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        const d = new Date();
        d.setHours(hh!, mm!, 0, 0);
        if (d.getTime() > Date.now() + 60_000) d.setDate(d.getDate() - 1);
        ocurrioEn = d.getTime();
      }

      await reportar({
        condominioId, titulo, descripcion, prioridad,
        archivoUrl, archivoNombre: archivo?.name,
        unidadIds: unidades.map((u) => u._id),
        ocurrioEn,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reportar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose}
      title="Reportar novedad"
      description="Se notifica en la minuta digital para la administración"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} disabled={!valido || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />} Reportar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Título *</label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Puerta vehicular averiada" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Prioridad</label>
            <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Home className="h-3.5 w-3.5" /> Casa responsable (opcional)
            </label>
            <SelectorUnidades
              condominioId={condominioId}
              elegidas={unidades}
              onChange={setUnidades}
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Clock className="h-3.5 w-3.5" /> Hora del hecho
            </label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Cuándo pasó, no cuándo lo escribes.
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Descripción *</label>
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4} placeholder="Describe lo sucedido con el mayor detalle posible…" />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <FileText className="h-3.5 w-3.5" /> Adjunto (foto o documento, máx. 20 MB)
          </label>
          <Input type="file" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
