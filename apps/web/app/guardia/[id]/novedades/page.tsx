"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  AlertTriangle, Plus, Loader2, Paperclip, FileText,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Prioridad = "baja" | "media" | "alta";

const PRIORIDAD_META: Record<Prioridad, { label: string; cls: string; dot: string }> = {
  baja:  { label: "Baja",  cls: "bg-slate-500/10 text-slate-600",  dot: "bg-slate-400" },
  media: { label: "Media", cls: "bg-amber-500/10 text-amber-600",  dot: "bg-amber-500" },
  alta:  { label: "Alta",  cls: "bg-red-500/10 text-red-600",      dot: "bg-red-500" },
};

function fmtFechaHora(ts: number) {
  return new Date(ts).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function GuardiaNovedadesPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const reportes = useQuery(api.guardia.listNovedadReportes, { condominioId });
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <AlertTriangle className="h-5 w-5 text-brand" /> Novedades
          </h1>
          <p className="text-sm text-muted-foreground">Reporta incidentes de seguridad a la administración</p>
        </div>
        <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Reportar novedad</Button>
      </div>

      {reportes === undefined ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : reportes.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="Sin novedades reportadas"
          description="Los incidentes que reportes quedan aquí y en la minuta digital."
          action={<Button size="sm" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Reportar</Button>}
        />
      ) : (
        <div className="space-y-3">
          {reportes.map((n) => {
            const meta = PRIORIDAD_META[n.prioridad];
            return (
              <Card key={n._id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{n.titulo}</p>
                      <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", meta.cls)}>
                        Prioridad {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-foreground">{n.descripcion}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{n.reportadoPorNombre}</span>
                      <span>·</span>
                      <span>{fmtFechaHora(n.createdAt)}</span>
                      {n.archivoUrl && (
                        <a href={n.archivoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                          <Paperclip className="h-3 w-3" /> {n.archivoNombre ?? "Adjunto"}
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

      {formOpen && <NovedadModal condominioId={condominioId} onClose={() => setFormOpen(false)} />}
    </div>
  );
}

function NovedadModal({ condominioId, onClose }: { condominioId: Id<"condominios">; onClose: () => void }) {
  const reportar = useMutation(api.guardia.reportarNovedad);
  const generarUrl = useMutation(api.guardia.generateUploadUrl);
  const [titulo, setTitulo] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [descripcion, setDescripcion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valido = titulo.trim().length > 0 && descripcion.trim().length > 0;

  async function confirmar() {
    if (!valido) return;
    setBusy(true); setError(null);
    try {
      let archivoStorageId: Id<"_storage"> | undefined;
      if (archivo) {
        if (archivo.size > 20 * 1024 * 1024) throw new Error("El adjunto no puede superar 20 MB.");
        const url = await generarUrl({});
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": archivo.type }, body: archivo });
        if (!res.ok) throw new Error("No se pudo subir el adjunto.");
        archivoStorageId = ((await res.json()) as { storageId: Id<"_storage"> }).storageId;
      }
      await reportar({
        condominioId, titulo, descripcion, prioridad,
        archivoStorageId, archivoNombre: archivo?.name,
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
