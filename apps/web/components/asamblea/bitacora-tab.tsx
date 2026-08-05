"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  AlertTriangle,
  Check,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ActaPanel } from "./acta-panel";

/**
 * Bitácora de la asamblea: lo que pasó y lo que se dijo, en una sola línea
 * de tiempo.
 *
 * Los eventos (entradas, palabra, votaciones) y las intervenciones habladas
 * viven en tablas distintas por volumen —decenas contra miles— y se mezclan
 * aquí, al pintar. Para quien lee la reunión es una sola cosa.
 */

type Props = {
  asambleaId: Id<"asambleas">;
  modalidad: string;
  estado: string;
};

function hora(ts: number) {
  return new Date(ts).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Etiqueta legible de cada evento. Espeja `etiquetaBitacora` del backend. */
const ETIQUETA: Record<string, string> = {
  entrada: "Entró",
  salida: "Salió",
  palabra_pedida: "Pidió la palabra",
  palabra_concedida: "Palabra concedida",
  palabra_retirada: "Palabra retirada",
  votacion_abierta: "Votación abierta",
  votacion_cerrada: "Votación cerrada",
  voto: "Votó",
  chat: "Chat",
  reaccion: "Reacción",
  grabacion_inicio: "Grabación iniciada",
  grabacion_fin: "Grabación finalizada",
  transcripcion_inicio: "Transcripción iniciada",
  transcripcion_fin: "Transcripción finalizada",
  presidente_asignado: "Presidente",
};

/** Los que marcan un hito de la reunión y merecen resaltarse. */
const DESTACADOS = new Set([
  "votacion_abierta",
  "votacion_cerrada",
  "transcripcion_inicio",
  "transcripcion_fin",
  "presidente_asignado",
]);

type Fila =
  | { clase: "evento"; ts: number; id: string; tipo: string; nombre: string; detalle: string | null }
  | {
      clase: "dicho";
      ts: number;
      id: Id<"salaIntervenciones">;
      nombre: string;
      unidadNumero: string | null;
      texto: string;
      dudosa: boolean;
      corregida: boolean;
      manual: boolean;
    };

export function BitacoraTab({ asambleaId, modalidad, estado }: Props) {
  const eventos = useQuery(api.salaBitacora.listar, { asambleaId });
  const dichos = useQuery(api.intervenciones.listar, { asambleaId, limite: 400 });
  const transcripcion = useQuery(api.intervenciones.estado, { asambleaId });
  const activar = useMutation(api.intervenciones.activar);

  const [alternando, setAlternando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soloDichos, setSoloDichos] = useState(false);

  const cargando = eventos === undefined || dichos === undefined;

  const filas = useMemo<Fila[]>(() => {
    const out: Fila[] = [];
    if (!soloDichos) {
      for (const e of eventos ?? []) {
        out.push({
          clase: "evento",
          ts: e.createdAt,
          id: e._id,
          tipo: e.tipo,
          nombre: e.nombre,
          detalle: e.detalle,
        });
      }
    }
    for (const d of dichos ?? []) {
      out.push({
        clase: "dicho",
        ts: d.inicioEn,
        id: d._id,
        nombre: d.nombre,
        unidadNumero: d.unidadNumero,
        texto: d.texto,
        dudosa: d.dudosa,
        corregida: d.corregida,
        manual: d.fuente === "manual",
      });
    }
    return out.sort((a, b) => a.ts - b.ts);
  }, [eventos, dichos, soloDichos]);

  const esVirtual = modalidad !== "presencial";
  const activa = transcripcion?.activa === true;

  async function alternar() {
    setError(null);
    setAlternando(true);
    try {
      await activar({ asambleaId, activa: !activa });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAlternando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Control de la transcripción ── */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              {activa ? (
                <Mic className="h-5 w-5 text-brand" />
              ) : (
                <MicOff className="h-5 w-5 text-muted-foreground" />
              )}
              Transcripción en vivo
              {activa && <Badge tone="success">Encendida</Badge>}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {esVirtual
                ? "Mientras esté encendida, lo que se hable en la sala se va escribiendo aquí con el nombre de quien habla y la hora."
                : "Solo aplica a asambleas virtuales o mixtas: en presencial hay un solo micrófono y no se puede saber quién habla."}
            </p>
          </div>

          {esVirtual && (
            <Button
              size="sm"
              variant={activa ? "outline" : "brand"}
              onClick={alternar}
              disabled={alternando || (estado !== "en_curso" && !activa)}
            >
              {alternando ? (
                <Spinner className="h-4 w-4" />
              ) : activa ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              {activa ? "Apagar" : "Encender"}
            </Button>
          )}
        </div>

        {/* El aviso no es decorativo: transcribir es tratamiento de datos
            personales y los asistentes tienen que saberlo. */}
        {esVirtual && (
          <div className="mt-4 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3.5">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p className="text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
              Antes de encenderla, avísale a la asamblea que la sesión se va a
              transcribir y déjalo dicho en el acta. Mientras esté encendida,
              todos los asistentes ven el aviso en la sala.
            </p>
          </div>
        )}

        {estado !== "en_curso" && !activa && esVirtual && (
          <p className="mt-3 text-sm text-muted-foreground">
            Se puede encender cuando la asamblea esté en curso.
          </p>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </Card>

      <ActaPanel asambleaId={asambleaId} />

      <AgregarNota asambleaId={asambleaId} />

      {/* ── Línea de tiempo ── */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h3 className="text-sm font-semibold text-foreground">
            Línea de tiempo
            {!cargando && (
              <span className="ml-2 font-normal text-muted-foreground">
                {filas.length}
              </span>
            )}
          </h3>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={soloDichos}
              onChange={(e) => setSoloDichos(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[var(--color-brand)]"
            />
            Solo lo hablado
          </label>
        </div>

        {cargando ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-5 w-5" />
          </div>
        ) : filas.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">
            Todavía no hay nada registrado.
          </p>
        ) : (
          <ListaBitacora filas={filas} />
        )}
      </Card>
    </div>
  );
}

/**
 * La lista, con autoscroll.
 *
 * Solo baja sola si quien mira ya estaba abajo: si está leyendo algo de hace
 * media hora, arrastrarlo al final cada vez que alguien habla haría la
 * bitácora inservible justo cuando más se necesita.
 */
function ListaBitacora({ filas }: { filas: Fila[] }) {
  const caja = useRef<HTMLDivElement>(null);
  const pegado = useRef(true);

  useEffect(() => {
    const el = caja.current;
    if (el && pegado.current) el.scrollTop = el.scrollHeight;
  }, [filas.length]);

  return (
    <div
      ref={caja}
      onScroll={(e) => {
        const el = e.currentTarget;
        pegado.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="max-h-[65vh] overflow-y-auto px-5 py-4"
    >
      <ul className="space-y-2.5">
        {filas.map((f) =>
          f.clase === "evento" ? (
            <EventoFila key={`e${f.id}`} fila={f} />
          ) : (
            <DichoFila key={`d${f.id}`} fila={f} />
          ),
        )}
      </ul>
    </div>
  );
}

function EventoFila({ fila }: { fila: Extract<Fila, { clase: "evento" }> }) {
  const destacado = DESTACADOS.has(fila.tipo);
  return (
    <li className="flex items-baseline gap-3 text-[13px]">
      <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
        {hora(fila.ts)}
      </span>
      <span
        className={cn(
          "min-w-0",
          destacado ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {ETIQUETA[fila.tipo] ?? fila.tipo}
        {fila.nombre && <span className="text-muted-foreground"> · {fila.nombre}</span>}
        {fila.detalle && (
          <span className="text-muted-foreground/80"> — {fila.detalle}</span>
        )}
      </span>
    </li>
  );
}

function DichoFila({ fila }: { fila: Extract<Fila, { clase: "dicho" }> }) {
  const corregir = useMutation(api.intervenciones.corregir);
  const eliminar = useMutation(api.intervenciones.eliminar);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(fila.texto);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const texto = borrador.trim();
    if (!texto || texto === fila.texto) {
      setEditando(false);
      return;
    }
    setGuardando(true);
    try {
      await corregir({ intervencionId: fila.id, texto });
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className="group rounded-lg border border-border/70 bg-muted/25 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
          {hora(fila.ts)}
        </span>
        <span className="text-[13px] font-semibold text-foreground">
          {fila.nombre}
        </span>
        {fila.unidadNumero && (
          <span className="text-xs text-muted-foreground">
            {fila.unidadNumero}
          </span>
        )}
        {fila.manual && <Badge tone="info">Escrita a mano</Badge>}
        {fila.dudosa && !fila.corregida && <Badge tone="warning">Dudosa</Badge>}
        {fila.corregida && <Badge tone="neutral">Corregida</Badge>}

        <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {!editando && (
            <>
              <button
                type="button"
                onClick={() => {
                  setBorrador(fila.texto);
                  setEditando(true);
                }}
                aria-label="Corregir"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void eliminar({ intervencionId: fila.id })}
                aria-label="Eliminar"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </span>
      </div>

      {editando ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            rows={3}
            autoFocus
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={guardar} disabled={guardando}>
              {guardando ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Guardar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditando(false)}
              disabled={guardando}
            >
              <X className="h-4 w-4" /> Cancelar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            El texto original se conserva para poder auditarlo.
          </p>
        </div>
      ) : (
        <p className="mt-1 text-sm leading-relaxed text-foreground">{fila.texto}</p>
      )}
    </li>
  );
}

/** La secretaría anota algo que el motor no captó (o que no se dijo en la sala). */
function AgregarNota({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const agregar = useMutation(api.intervenciones.agregarManual);
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  if (!abierto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Plus className="h-4 w-4" /> Anotar una intervención
      </Button>
    );
  }

  async function guardar() {
    if (!nombre.trim() || !texto.trim()) return;
    setGuardando(true);
    try {
      await agregar({ asambleaId, nombre: nombre.trim(), texto: texto.trim() });
      setTexto("");
      setAbierto(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <Input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Quién habló"
      />
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        placeholder="Qué dijo"
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={guardar} disabled={guardando}>
          {guardando ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          Agregar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}
