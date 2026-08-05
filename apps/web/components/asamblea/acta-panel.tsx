"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  Check,
  FileText,
  Loader2,
  Pencil,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { descargarActaCompleta } from "@/lib/asamblea-acta";

/**
 * Panel del acta.
 *
 * Deja a la vista la separación que gobierna todo el acta: los números salen
 * de la base y se pueden volver a generar idénticos; el resumen en prosa lo
 * redacta un modelo y hay que revisarlo. Quien va a firmar tiene que ver esa
 * diferencia antes de firmar, no después.
 */
export function ActaPanel({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const paquete = useQuery(api.acta.paquete, { asambleaId });
  const generar = useAction(api.acta.generarResumen);

  const [redactando, setRedactando] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function redactar() {
    setError(null);
    setAviso(null);
    setRedactando(true);
    try {
      const r = await generar({ asambleaId });
      setAviso(
        r.sinTranscripcion > 0
          ? `Listo. ${r.puntos - r.sinTranscripcion} de ${r.puntos} puntos tienen resumen; el resto no tuvo intervenciones transcritas.`
          : `Listo: se redactaron los ${r.puntos} puntos.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRedactando(false);
    }
  }

  async function bajar() {
    if (!paquete) return;
    setError(null);
    setBajando(true);
    try {
      await descargarActaCompleta(paquete);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBajando(false);
    }
  }

  if (paquete === undefined) {
    return (
      <Card className="p-8">
        <Spinner className="mx-auto h-5 w-5" />
      </Card>
    );
  }
  if (paquete === null) return null;

  const q = paquete.quorum;
  const alcanzado = q.alcanzado >= q.requerido;

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <FileText className="h-5 w-5 text-brand" /> Acta de la asamblea
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Incluye el quórum, la lista de asistentes con su coeficiente, cada
            votación con su gráfica y porcentajes, la cronología y el resumen
            de cada punto del orden del día.
          </p>
        </div>
        <Button size="sm" onClick={bajar} disabled={bajando}>
          {bajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Descargar acta
        </Button>
      </div>

      {/* Resumen de los datos duros: lo mismo que va impreso. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Dato
          valor={`${q.alcanzado}%`}
          etiqueta={`Quórum · mínimo ${q.requerido}%`}
          tono={alcanzado ? "ok" : "mal"}
        />
        <Dato
          valor={`${q.unidadesPresentes}/${q.totalUnidades}`}
          etiqueta="Unidades presentes"
        />
        <Dato valor={String(paquete.resultados.length)} etiqueta="Votaciones" />
      </div>

      <div className="mt-4 flex gap-3 rounded-lg border border-border bg-muted/30 p-3.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Los números del acta —quórum, coeficientes, votos y porcentajes— se
          calculan de los registros de la asamblea, no los escribe el modelo.
          Se pueden volver a generar y dan idéntico.
        </p>
      </div>

      {/* ── Resumen redactado ── */}
      <div className="mt-6 border-t border-border pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-brand" /> Resumen de cada punto
              {paquete.resumen && <Badge tone="warning">Borrador</Badge>}
            </h3>
            <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
              {paquete.hayTranscripcion
                ? "Se redacta a partir de la transcripción. Revísalo y corrígelo antes de firmar."
                : "Todavía no hay transcripción de esta asamblea, así que no hay nada que resumir."}
            </p>
          </div>
          {paquete.hayTranscripcion && (
            <Button
              size="sm"
              variant="outline"
              onClick={redactar}
              disabled={redactando}
            >
              {redactando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {paquete.resumen ? "Volver a redactar" : "Redactar resumen"}
            </Button>
          )}
        </div>

        {redactando && (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Redactando punto por punto. En una asamblea larga puede tomar un
            par de minutos.
          </p>
        )}
        {aviso && <p className="mt-3 text-[13px] text-success">{aviso}</p>}
        {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}

        {paquete.resumen && (
          <ul className="mt-4 space-y-3">
            {paquete.resumen.puntos.map((p) => (
              <PuntoResumen
                key={p.puntoIndice}
                asambleaId={asambleaId}
                punto={p}
              />
            ))}
          </ul>
        )}

        {paquete.resumen && (
          <p className="mt-4 text-xs text-muted-foreground">
            Redactado con {paquete.resumen.modelo} el{" "}
            {new Date(paquete.resumen.generadoEn).toLocaleString("es-CO")}.
          </p>
        )}
      </div>
    </Card>
  );
}

function Dato({
  valor,
  etiqueta,
  tono,
}: {
  valor: string;
  etiqueta: string;
  tono?: "ok" | "mal";
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3.5">
      <p
        className={
          tono === "ok"
            ? "text-xl font-bold text-success"
            : tono === "mal"
              ? "text-xl font-bold text-destructive"
              : "text-xl font-bold text-foreground"
        }
      >
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

function PuntoResumen({
  asambleaId,
  punto,
}: {
  asambleaId: Id<"asambleas">;
  punto: {
    puntoIndice: number;
    titulo: string;
    resumen: string;
    intervenciones: number;
    editado?: boolean;
  };
}) {
  const editar = useMutation(api.acta.editarResumen);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(punto.resumen);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await editar({
        asambleaId,
        puntoIndice: punto.puntoIndice,
        resumen: borrador,
      });
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className="rounded-lg border border-border p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-foreground">
          {punto.puntoIndice + 1}. {punto.titulo}
        </span>
        {punto.editado && <Badge tone="success">Revisado</Badge>}
        {punto.intervenciones === 0 && (
          <Badge tone="neutral">Sin intervenciones</Badge>
        )}
        {!editando && punto.intervenciones > 0 && (
          <button
            type="button"
            onClick={() => {
              setBorrador(punto.resumen);
              setEditando(true);
            }}
            aria-label="Corregir resumen"
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {editando ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            rows={5}
            autoFocus
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={guardar} disabled={guardando}>
              {guardando ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Guardar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(false)}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
          </div>
        </div>
      ) : punto.resumen ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {punto.resumen}
        </p>
      ) : (
        <p className="mt-1.5 text-[13px] italic text-muted-foreground/70">
          No se transcribió nada para este punto.
        </p>
      )}
    </li>
  );
}
