"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { HorariosPorDiaEditor } from "./horarios-por-dia-editor";
import {
  defaultPorDiaLaboral,
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

export function CrearEspacioModal({
  condominioId,
  onClose,
}: {
  condominioId: Id<"condominios">;
  onClose: () => void;
}) {
  const createZona = useMutation(api.reservas.createZona);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoZona>("salon_social");
  const [unidadTiempo, setUnidadTiempo] = useState<UnidadTiempo>("hora");
  const [descripcion, setDescripcion] = useState("");
  const [capacidad, setCapacidad] = useState("1");
  const [precioPorHora, setPrecioPorHora] = useState("");
  const [precioPorDia, setPrecioPorDia] = useState("");
  const [requiereAprobacion, setRequiereAprobacion] = useState(true);
  const [porDia, setPorDia] =
    useState<Record<number, DiaHorarioEstado>>(defaultPorDiaLaboral);
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

    for (const h of horarios) {
      const [sh, sm] = h.horaInicio.split(":").map(Number);
      const [eh, em] = h.horaFin.split(":").map(Number);
      if ((eh ?? 0) * 60 + (em ?? 0) <= (sh ?? 0) * 60 + (sm ?? 0)) {
        setError(
          `En el día configurado: la hora de fin debe ser mayor que la de inicio.`,
        );
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
      await createZona({
        condominioId,
        nombre: nombre.trim(),
        tipo,
        unidadTiempo,
        capacidad: capacidadN,
        descripcion: descripcion.trim() || undefined,
        precioPorHora: horaN != null && !Number.isNaN(horaN) ? horaN : undefined,
        precioPorDia: diaN != null && !Number.isNaN(diaN) ? diaN : undefined,
        horariosPorDia: horarios,
        requiereAprobacion,
      });
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
      title="Crear nuevo espacio común"
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
            Crear espacio
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
