"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { CalendarClock, Loader2, Plus, UserPlus, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

/**
 * Las personas de una casa, vistas y administradas por su propietario.
 *
 * Las tres figuras ven lo mismo dentro de la casa; lo que las distingue es
 * cuánto dura el vínculo y quién responde:
 *
 *   · propietario  — el dueño. Indefinido.
 *   · residente    — vive con él. Indefinido.
 *   · arrendatario — usa la casa por un período. Se le corta el acceso el
 *                    día que se vence, sin que nadie tenga que acordarse.
 */

const VINCULO: Record<string, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  propietario: { label: "Propietario", tone: "brand" },
  residente: { label: "Residente", tone: "info" },
  arrendatario: { label: "Arrendatario", tone: "warning" },
  apoderado: { label: "Apoderado", tone: "neutral" },
};

const fecha = (ts: number | null) =>
  ts ? new Date(ts).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : null;

/** "2026-08-21" → epoch local. Sin esto la fecha se corre un día por UTC. */
function aEpoch(iso: string): number | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d).getTime();
}

export function HogarUnidad({ unidadId }: { unidadId: Id<"unidades"> }) {
  const hogar = useQuery(api.hogar.miHogar, { unidadId });
  const [abierto, setAbierto] = useState(false);

  if (hogar === undefined) {
    return (
      <Card className="p-6">
        <Spinner className="mx-auto h-5 w-5" />
      </Card>
    );
  }
  if (hogar === null) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            Personas en la casa {hogar.unidadNumero}
          </h2>
          {hogar.soyPropietario && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Dales su propio usuario para que entren a la aplicación y vean
              lo mismo que tú.
            </p>
          )}
        </div>
        {hogar.soyPropietario && (
          <Button size="sm" onClick={() => setAbierto(true)}>
            <UserPlus className="h-4 w-4" /> Agregar
          </Button>
        )}
      </div>

      <Card className="divide-y divide-border p-0">
        {hogar.personas.map((p) => (
          <Persona key={p._id} p={p} puedeEditar={hogar.soyPropietario} />
        ))}
      </Card>

      {hogar.soyPropietario && (
        <p className="mt-2 text-xs text-muted-foreground">
          Quien agregues queda registrado, pero la administración es la que le
          entrega el acceso a la aplicación.
        </p>
      )}

      {abierto && (
        <AgregarModal unidadId={unidadId} onClose={() => setAbierto(false)} />
      )}
    </div>
  );
}

function Persona({
  p,
  puedeEditar,
}: {
  p: {
    _id: Id<"usuarioUnidad">;
    nombre: string;
    email: string | null;
    vinculo: string;
    vigenciaDesde: number | null;
    vigenciaHasta: number | null;
    vencido: boolean;
    esYo: boolean;
  };
  puedeEditar: boolean;
}) {
  const quitar = useMutation(api.hogar.quitarPersona);
  const [busy, setBusy] = useState(false);
  const meta = VINCULO[p.vinculo] ?? { label: p.vinculo, tone: "neutral" as const };

  return (
    <div className={`flex items-center gap-3 p-4 ${p.vencido ? "opacity-55" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{p.nombre}</p>
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {p.esYo && <span className="text-xs text-muted-foreground">(tú)</span>}
          {p.vencido && <Badge tone="destructive">Vencido</Badge>}
        </div>
        {p.email && <p className="text-sm text-muted-foreground">{p.email}</p>}
        {p.vigenciaHasta && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3 w-3" aria-hidden />
            {p.vencido ? "Terminó el" : "Hasta el"} {fecha(p.vigenciaHasta)}
          </p>
        )}
      </div>

      {puedeEditar && !p.esYo && p.vinculo !== "propietario" && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`¿Quitar a ${p.nombre} de la casa?`)) return;
            setBusy(true);
            try {
              await quitar({ vinculoId: p._id });
            } finally {
              setBusy(false);
            }
          }}
          aria-label={`Quitar a ${p.nombre}`}
          className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function AgregarModal({
  unidadId,
  onClose,
}: {
  unidadId: Id<"unidades">;
  onClose: () => void;
}) {
  const agregar = useMutation(api.hogar.agregarPersona);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [vinculo, setVinculo] = useState<"residente" | "arrendatario">("residente");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esArriendo = vinculo === "arrendatario";
  const valido =
    nombre.trim().length > 1 && email.includes("@") && (!esArriendo || !!hasta);

  async function guardar() {
    if (!valido) return;
    setBusy(true);
    setError(null);
    try {
      await agregar({
        unidadId,
        nombre,
        email,
        telefono: telefono.trim() || undefined,
        vinculo,
        vigenciaDesde: aEpoch(desde),
        vigenciaHasta: aEpoch(hasta),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Agregar a la casa"
      description="Tendrá su propio usuario y verá lo mismo que tú"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={guardar} disabled={!valido || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Agregar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Tipo *</label>
          <Select
            value={vinculo}
            onChange={(e) => setVinculo(e.target.value as "residente" | "arrendatario")}
          >
            <option value="residente">Residente — tu esposa, tus hijos, quien vive contigo</option>
            <option value="arrendatario">Arrendatario — le arriendas la casa</option>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {esArriendo
              ? "Entra a la aplicación como tú y ve lo mismo, pero deja de ver la casa el día que se vence el contrato."
              : "Entra a la aplicación con su propio correo y ve lo mismo que tú. Sin fecha de vencimiento."}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Nombre *</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Correo *</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@correo.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Teléfono</label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
        </div>

        {esArriendo && (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3.5">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">Desde</label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">Hasta *</label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <p className="col-span-2 text-[11px] text-amber-900 dark:text-amber-200">
              El último día cuenta completo. Después de esa fecha deja de ver la
              casa automáticamente; se puede extender cuando renueve.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
