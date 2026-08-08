"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  FlaskConical,
  Link2,
  MessageCircle,
  MessageSquareText,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

/** Una plantilla aprobada en Meta, tal como la devuelve el action. */
export type PlantillaOpcion = {
  nombre: string;
  idioma: string;
  categoria: string;
  cuerpo: string;
  variables: number;
  botonUrlDinamica: boolean;
};

/** Resultado de `api.automatizaciones.enviarPrueba`: texto legible por canal. */
export type PruebaResultado = { correo: string | null; whatsapp: string | null };

type CondominioOpcion = {
  condominioId: Id<"condominios">;
  condominioNombre: string;
};

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

/** `poder_apoderado_v2` → «Poder apoderado v2». */
export function nombrePlantillaLegible(nombre: string) {
  const limpio = nombre.replace(/_/g, " ").trim();
  if (!limpio) return nombre;
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

function textoVariables(n: number) {
  if (n === 0) return "Sin variables";
  return `${n} variable${n === 1 ? "" : "s"}`;
}

/* -------------------------------------------------------------------------- */
/* Carga de plantillas                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Pide a YCloud las plantillas aprobadas. Es un action (consulta la API de
 * Meta en vivo), así que se dispara una sola vez al montar.
 *
 * @param activo `false` mientras no se sepa si la persona puede verlas, para
 * no disparar una llamada que el backend va a rechazar.
 */
export function usePlantillasWhatsapp(activo: boolean) {
  const listarPlantillas = useAction(api.automatizaciones.plantillasDisponibles);
  const [plantillas, setPlantillas] = useState<PlantillaOpcion[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    listarPlantillas({})
      .then((res) => {
        if (!vivo) return;
        setPlantillas(res as PlantillaOpcion[]);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(
          e instanceof Error
            ? e.message
            : "No se pudieron cargar las plantillas de WhatsApp.",
        );
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
    // Se pide una sola vez, cuando la persona ya puede verlas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  return { plantillas, cargando, error };
}

/* -------------------------------------------------------------------------- */
/* Vista previa del cuerpo (burbuja estilo WhatsApp)                           */
/* -------------------------------------------------------------------------- */

/**
 * Muestra el texto real de la plantilla. Cada `{{n}}` se pinta como una ficha
 * ámbar para que se vea dónde entran los datos; si en `valores` viene algo
 * para esa posición, se muestra ese texto ya reemplazado.
 */
export function PreviewPlantilla({
  cuerpo,
  valores,
  className,
}: {
  cuerpo: string;
  valores?: string[];
  className?: string;
}) {
  const partes = cuerpo.split(/(\{\{\d+\}\})/g);
  return (
    <div
      className={cn(
        "rounded-xl rounded-tl-sm border border-emerald-600/20 bg-emerald-500/10 px-3.5 py-3",
        className,
      )}
    >
      <span className="block whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
        {cuerpo.trim() ? (
          partes.map((parte, i) => {
            const marca = /^\{\{(\d+)\}\}$/.exec(parte);
            if (!marca) return <span key={i}>{parte}</span>;
            const valor = valores?.[Number(marca[1]) - 1] ?? "";
            return valor.trim() ? (
              <span key={i} className="font-medium">
                {valor}
              </span>
            ) : (
              <span
                key={i}
                className="rounded-md bg-amber-500/20 px-1 py-0.5 font-mono text-[11px] font-medium text-amber-700 dark:text-amber-400"
              >
                {parte}
              </span>
            );
          })
        ) : (
          <span className="text-muted-foreground">
            Esta plantilla no tiene texto en el cuerpo.
          </span>
        )}
      </span>
    </div>
  );
}

/** Ficha ámbar: «Enlace dinámico». */
function ChipEnlaceDinamico() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
      <Link2 className="h-3 w-3" aria-hidden />
      Enlace dinámico
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Galería de plantillas                                                       */
/* -------------------------------------------------------------------------- */

export function PlantillasGaleria({
  plantillas,
  cargando,
  error,
  onProbar,
  onProgramar,
}: {
  plantillas: PlantillaOpcion[] | null;
  cargando: boolean;
  error: string | null;
  onProbar: (plantilla: PlantillaOpcion) => void;
  onProgramar: (plantilla: PlantillaOpcion) => void;
}) {
  return (
    <section className="space-y-3 border-t border-border pt-6">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <MessageSquareText
            className="h-4.5 w-4.5 text-muted-foreground"
            aria-hidden
          />
          Plantillas de WhatsApp
        </h2>
        <p className="text-sm text-muted-foreground">
          Estas son las plantillas aprobadas por Meta. Puedes probar cualquiera
          antes de enviarla.
        </p>
      </div>

      {cargando ? (
        <div className="space-y-2.5">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="flex gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-red-600 dark:text-red-400">
            {error} Vuelve a cargar la página para reintentar.
          </p>
        </div>
      ) : !plantillas || plantillas.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="Sin plantillas aprobadas"
          description="Cuando Meta apruebe una plantilla aparecerá aquí sola, con su texto y un botón para probarla."
        />
      ) : (
        <div className="space-y-2.5">
          {plantillas.map((p) => (
            <PlantillaCard
              key={`${p.nombre}-${p.idioma}`}
              plantilla={p}
              onProbar={() => onProbar(p)}
              onProgramar={() => onProgramar(p)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PlantillaCard({
  plantilla,
  onProbar,
  onProgramar,
}: {
  plantilla: PlantillaOpcion;
  onProbar: () => void;
  onProgramar: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400">
          <MessageSquareText className="h-4.5 w-4.5" aria-hidden />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {nombrePlantillaLegible(plantilla.nombre)}
            </span>
            <Badge tone="success">
              <MessageCircle className="h-3 w-3" aria-hidden />
              WhatsApp
            </Badge>
            <Badge tone="neutral">{plantilla.categoria}</Badge>
          </div>

          <PreviewPlantilla cuerpo={plantilla.cuerpo} />

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span>{textoVariables(plantilla.variables)}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">{plantilla.nombre}</span>
            {plantilla.botonUrlDinamica && <ChipEnlaceDinamico />}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          <Button size="sm" variant="secondary" onClick={onProbar}>
            <FlaskConical className="h-4 w-4" aria-hidden />
            Probar
          </Button>
          <Button size="sm" variant="brand" onClick={onProgramar}>
            <CalendarClock className="h-4 w-4" aria-hidden />
            Programar
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal: probar una plantilla (nombre + celular)                              */
/* -------------------------------------------------------------------------- */

/**
 * Prueba de un clic: se escribe un nombre y un celular y sale una copia de la
 * plantilla por WhatsApp. No se mandan `parametros`: el backend rellena solo
 * los valores de muestra cuando no se pasan.
 */
export function ProbarPlantillaModal({
  plantilla,
  onClose,
}: {
  plantilla: PlantillaOpcion;
  onClose: () => void;
}) {
  const condos = useQuery(api.automatizaciones.condominiosConAsambleas, {}) as
    | CondominioOpcion[]
    | undefined;
  const enviarPrueba = useAction(api.automatizaciones.enviarPrueba);

  const [condominioId, setCondominioId] = useState<Id<"condominios"> | "">("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<PruebaResultado | null>(null);

  // Con un solo condominio no hace falta preguntarlo: se usa ese.
  const unico = condos?.length === 1 ? condos[0] : undefined;
  const varios = (condos?.length ?? 0) > 1;
  const elegido: Id<"condominios"> | "" =
    condominioId || unico?.condominioId || "";

  const listo = Boolean(elegido) && telefono.trim().length > 0 && !busy;

  async function onEnviar() {
    if (!elegido) {
      setError("Elige el condominio desde el que sale la prueba.");
      return;
    }
    const tel = telefono.trim();
    if (!tel) {
      setError("Escribe el celular al que quieres que llegue la prueba.");
      return;
    }
    setBusy(true);
    setError(null);
    setResultado(null);
    try {
      const res = (await enviarPrueba({
        condominioId: elegido,
        tipo: "plantilla_whatsapp",
        plantilla: plantilla.nombre,
        canal: "whatsapp",
        telefono: tel,
        nombre: nombre.trim() || undefined,
      })) as PruebaResultado;
      setResultado(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo mandar la prueba.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Probar plantilla"
      description={nombrePlantillaLegible(plantilla.nombre)}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
          <Button size="sm" onClick={() => void onEnviar()} disabled={!listo}>
            {busy ? (
              <Spinner />
            ) : (
              <FlaskConical className="h-4 w-4" aria-hidden />
            )}
            Enviar prueba
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PreviewPlantilla cuerpo={plantilla.cuerpo} />

        {condos != null && condos.length === 0 && (
          <p className="rounded-lg bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            No hay condominios activos, así que todavía no se puede mandar la
            prueba.
          </p>
        )}

        {varios && (
          <div className="space-y-1.5">
            <label
              htmlFor="probar-condominio"
              className="block text-xs font-medium text-foreground"
            >
              Condominio
            </label>
            <Select
              id="probar-condominio"
              value={condominioId}
              disabled={busy}
              onChange={(e) => {
                setCondominioId(e.target.value as Id<"condominios"> | "");
                setError(null);
              }}
            >
              <option value="">Selecciona un condominio…</option>
              {(condos ?? []).map((c) => (
                <option key={c.condominioId} value={c.condominioId}>
                  {c.condominioNombre}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="probar-nombre"
            className="block text-xs font-medium text-foreground"
          >
            Nombre
          </label>
          <Input
            id="probar-nombre"
            type="text"
            value={nombre}
            placeholder="Nombre de prueba"
            disabled={busy}
            onChange={(e) => {
              setNombre(e.target.value);
              setError(null);
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="probar-telefono"
            className="block text-xs font-medium text-foreground"
          >
            Celular
          </label>
          <Input
            id="probar-telefono"
            type="tel"
            value={telefono}
            placeholder="+573001234567"
            disabled={busy}
            onChange={(e) => {
              setTelefono(e.target.value);
              setError(null);
            }}
          />
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Llega una sola copia por WhatsApp al celular que escribas. Las
          variables se llenan con datos de ejemplo. No le llega a nadie del
          condominio ni cuenta como envío real.
        </p>

        {resultado?.whatsapp && (
          <LineaPrueba label="WhatsApp" texto={resultado.whatsapp} />
        )}
        {resultado?.correo && (
          <LineaPrueba label="Correo" texto={resultado.correo} />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

/** Una línea del resultado de la prueba: verde si salió, ámbar si falló. */
export function LineaPrueba({
  label,
  texto,
}: {
  label: string;
  texto: string;
}) {
  const ok = texto.startsWith("Enviado");
  const fallo = texto.startsWith("Falló");
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs leading-relaxed",
        ok
          ? "text-emerald-700 dark:text-emerald-400"
          : fallo
            ? "text-amber-700 dark:text-amber-400"
            : "text-muted-foreground",
      )}
    >
      {ok ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : fallo ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : null}
      <span>
        <span className="font-medium">{label}:</span> {texto}
      </span>
    </p>
  );
}
