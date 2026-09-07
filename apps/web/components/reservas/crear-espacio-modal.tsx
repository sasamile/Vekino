"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { aMinutos } from "@vekino/backend/horarios";
import { HorariosPorDiaEditor } from "./horarios-por-dia-editor";
import {
  defaultPorDiaLaboral,
  horariosToPorDiaState,
  porDiaStateToHorarios,
  type DiaHorarioEstado,
} from "./horarios-por-dia-utils";

const TIPO_OPTIONS = [
  { value: "salon_social", label: "Salón Social" },
  { value: "zona_bbq", label: "Zona BBQ" },
  { value: "piscina", label: "Piscina" },
  { value: "gimnasio", label: "Gimnasio" },
  { value: "cancha_deportiva", label: "Cancha Deportiva" },
  { value: "sauna", label: "Sauna" },
  { value: "casa_eventos", label: "Casa de Eventos" },
  { value: "parqueadero", label: "Parqueadero" },
  { value: "otro", label: "Otro" },
] as const;

const UNIDAD_OPTIONS = [
  { value: "hora", label: "Por hora" },
  { value: "dia", label: "Por día" },
  { value: "mes", label: "Por mes" },
] as const;

type TipoZona = (typeof TIPO_OPTIONS)[number]["value"];
type UnidadTiempo = (typeof UNIDAD_OPTIONS)[number]["value"];

/** La zona que se está editando, si el modal se abrió para eso. */
export type ZonaEditable = {
  _id: Id<"zonasComunes">;
  nombre: string;
  tipo?: string;
  unidadTiempo?: string;
  capacidad?: number;
  descripcion?: string;
  precioPorHora?: number;
  precioPorDia?: number;
  requiereAprobacion?: boolean;
  depositoRequerido?: number;
  horariosPorDia?: { dia: number; horaInicio: string; horaFin: string }[];
};

/**
 * Crear o editar un espacio común.
 *
 * El mismo formulario para las dos cosas: separarlos habría dejado dos
 * pantallas que envejecen aparte, y hasta ahora un horario mal puesto solo se
 * podía arreglar borrando la zona —y con ella su historial de reservas— para
 * volverla a crear.
 */
export function CrearEspacioModal({
  condominioId,
  zona,
  onClose,
}: {
  condominioId: Id<"condominios">;
  zona?: ZonaEditable;
  onClose: () => void;
}) {
  const createZona = useMutation(api.reservas.createZona);
  const updateZona = useMutation(api.reservas.updateZona);
  const editando = zona != null;
  const [nombre, setNombre] = useState(zona?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoZona>(
    (zona?.tipo as TipoZona) ?? "salon_social",
  );
  const [unidadTiempo, setUnidadTiempo] = useState<UnidadTiempo>(
    (zona?.unidadTiempo as UnidadTiempo) ?? "hora",
  );
  const [descripcion, setDescripcion] = useState(zona?.descripcion ?? "");
  const [capacidad, setCapacidad] = useState(String(zona?.capacidad ?? 1));
  const [precioPorHora, setPrecioPorHora] = useState(
    zona?.precioPorHora != null ? String(zona.precioPorHora) : "",
  );
  const [precioPorDia, setPrecioPorDia] = useState(
    zona?.precioPorDia != null ? String(zona.precioPorDia) : "",
  );
  const [requiereAprobacion, setRequiereAprobacion] = useState(
    zona?.requiereAprobacion ?? true,
  );
  const [deposito, setDeposito] = useState(
    zona?.depositoRequerido != null ? String(zona.depositoRequerido) : "",
  );
  const [porDia, setPorDia] = useState<Record<number, DiaHorarioEstado>>(() =>
    /* Al editar se parte del horario que la zona ya tiene; si no, el
       formulario propondría lunes-viernes y borraría lo configurado en cuanto
       alguien entrara solo a corregir el precio. */
    zona?.horariosPorDia?.length
      ? horariosToPorDiaState(zona.horariosPorDia)
      : defaultPorDiaLaboral(),
  );
  const [horariosError, setHorariosError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    const capacidadN = Number(capacidad);
    if (!capacidadN || capacidadN < 1) {
      setError("La capacidad debe ser mayor a 0.");
      return;
    }

    const horarios = porDiaStateToHorarios(porDia);
    if (horarios.length === 0) {
      setHorariosError("Activa al menos un día con horario");
      setError("Configura al menos un día disponible.");
      return;
    }
    setHorariosError(undefined);

    /* Un salón que abre a las 09:00 y cierra a las 02:00 es normal, así que
     * no se exige que el fin sea mayor que el inicio: se entiende que cierra
     * al día siguiente. Solo se comprueba que las horas sean horas. */
    for (const h of horarios) {
      if (aMinutos(h.horaInicio) == null || aMinutos(h.horaFin) == null) {
        setError("Revisa las horas: deben tener el formato HH:MM.");
        return;
      }
    }

    const horaN = precioPorHora.trim() ? Number(precioPorHora) : undefined;
    const diaN = precioPorDia.trim() ? Number(precioPorDia) : undefined;
    if (
      (horaN == null || Number.isNaN(horaN)) &&
      (diaN == null || Number.isNaN(diaN))
    ) {
      setError("Indica al menos un precio (por hora y/o por día).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const campos = {
        nombre: nombre.trim(),
        tipo,
        unidadTiempo,
        capacidad: capacidadN,
        descripcion: descripcion.trim() || undefined,
        precioPorHora: horaN != null && !Number.isNaN(horaN) ? horaN : undefined,
        precioPorDia: diaN != null && !Number.isNaN(diaN) ? diaN : undefined,
        horariosPorDia: horarios,
        requiereAprobacion,
        depositoRequerido: deposito.trim() && !Number.isNaN(Number(deposito))
          ? Number(deposito)
          : undefined,
      };
      if (zona) await updateZona({ id: zona._id, ...campos });
      else await createZona({ condominioId, ...campos });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el espacio.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={editando ? `Editar ${zona.nombre}` : "Crear nuevo espacio común"}
      description="Define tipo de reserva (hora, día o mes) y horarios distintos por día de la semana (ej. Lun–Vie 8:00–22:00 y sábado 10:00–22:00)."
      className="max-w-2xl"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? "Guardar cambios" : "Crear espacio"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Nombre *
            </label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Piscina"
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Tipo *
            </label>
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoZona)}
              disabled={busy}
            >
              {TIPO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Modalidad de reserva *
          </label>
          <Select
            value={unidadTiempo}
            onChange={(e) => setUnidadTiempo(e.target.value as UnidadTiempo)}
            disabled={busy}
          >
            {UNIDAD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Por hora: el usuario reserva franjas. Por día: reserva jornadas
            completas según la ventana configurada ese día.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Descripción
          </label>
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción del espacio común"
            rows={3}
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5 sm:max-w-xs">
          <label className="block text-xs font-medium text-foreground">
            Capacidad (personas) *
          </label>
          <Input
            type="number"
            min={1}
            value={capacidad}
            onChange={(e) => setCapacidad(e.target.value)}
            placeholder="Ej: 50"
            disabled={busy}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Precio por hora (COP)
            </label>
            <Input
              type="number"
              min={0}
              step={1000}
              value={precioPorHora}
              onChange={(e) => setPrecioPorHora(e.target.value)}
              placeholder="Opcional — ej. 25000"
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Precio por día (COP)
            </label>
            <Input
              type="number"
              min={0}
              step={1000}
              value={precioPorDia}
              onChange={(e) => setPrecioPorDia(e.target.value)}
              placeholder="Opcional — ej. 150000"
              disabled={busy}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Depósito (COP)
          </label>
          <Input
            type="number"
            min={0}
            step={1000}
            value={deposito}
            onChange={(e) => setDeposito(e.target.value)}
            placeholder="Opcional — ej. 60000"
            disabled={busy}
          />
          <p className="text-[11px] text-muted-foreground">
            Lo que se deja al reservar y se devuelve si el espacio se entrega
            bien. La portería lo registra al recibirlo.
          </p>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Puedes definir solo uno o ambos. El cobro al reservar usa la tarifa que
          corresponda a la modalidad (por hora / por día / por mes) y hace
          fallback al otro precio si falta.
        </p>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Disponibilidad por día de la semana *
          </label>
          <HorariosPorDiaEditor
            value={porDia}
            onChange={setPorDia}
            disabled={busy}
            errorMessage={horariosError}
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={requiereAprobacion}
            onChange={(e) => setRequiereAprobacion(e.target.checked)}
            disabled={busy}
            className="size-4 rounded border-border accent-brand"
          />
          Requiere aprobación
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
