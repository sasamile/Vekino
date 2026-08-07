"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  FlaskConical,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Send,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useNuevoQuery } from "@/hooks/use-nuevo-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Tipos (espejo de api.automatizaciones.*)                                    */
/* -------------------------------------------------------------------------- */

type Canal = "correo" | "whatsapp" | "ambos";
type EstadoEnvio =
  | "programado"
  | "enviando"
  | "completado"
  | "cancelado"
  | "fallido";
type EstadoDestinatario = "enviado" | "fallido" | "sin_contacto";

type AutomatizacionRow = {
  _id: Id<"enviosProgramados">;
  condominioId: Id<"condominios">;
  condominioNombre: string;
  tipo: "apoderados_asamblea";
  asambleaId: Id<"asambleas"> | null;
  asambleaTitulo: string | null;
  canal: Canal;
  programadoPara: number;
  estado: EstadoEnvio;
  total: number;
  enviados: number;
  fallidos: number;
  sinContacto: number;
  error: string | null;
  creadoPorNombre: string;
  createdAt: number;
};

type AsambleaOpcion = {
  asambleaId: Id<"asambleas">;
  titulo: string;
  fecha: string;
  hora: string;
  apoderados: number;
  apoderadosConContacto: number;
};

type CondoConAsambleas = {
  condominioId: Id<"condominios">;
  condominioNombre: string;
  asambleas: AsambleaOpcion[];
};

type DetalleRow = {
  _id: string;
  nombre: string;
  destino: string | null;
  canal: string;
  estado: EstadoDestinatario;
  motivo?: string;
  createdAt: number;
};

/** Resultado de `api.automatizaciones.enviarPrueba`: texto legible por canal. */
type PruebaResultado = { correo: string | null; whatsapp: string | null };

/* -------------------------------------------------------------------------- */
/* Metadatos de presentación                                                   */
/* -------------------------------------------------------------------------- */

const ESTADO_META: Record<
  EstadoEnvio,
  { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }
> = {
  programado: { label: "Programado", tone: "info" },
  enviando: { label: "Enviando", tone: "warning" },
  completado: { label: "Completado", tone: "success" },
  cancelado: { label: "Cancelado", tone: "neutral" },
  fallido: { label: "Fallido", tone: "destructive" },
};

const CANAL_META: Record<Canal, { label: string; icon: LucideIcon }> = {
  correo: { label: "Correo", icon: Mail },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  ambos: { label: "Correo y WhatsApp", icon: Send },
};

const NOTA_WHATSAPP = "Requiere que Meta haya aprobado la plantilla.";

const CANAL_OPCIONES: {
  value: Canal;
  label: string;
  icon: LucideIcon;
  descripcion: string;
  nota?: string;
}[] = [
  {
    value: "correo",
    label: "Correo",
    icon: Mail,
    descripcion: "Se envía al correo registrado de cada apoderado.",
  },
  {
    value: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    descripcion: "Se envía al teléfono registrado de cada apoderado.",
    nota: NOTA_WHATSAPP,
  },
  {
    value: "ambos",
    label: "Ambos",
    icon: Send,
    descripcion: "Correo y WhatsApp a quien tenga los dos datos.",
    nota: NOTA_WHATSAPP,
  },
];

/** Versiones del texto que se puede probar antes del envío real. */
const PRUEBA_VERSIONES: { label: string; comoPropietario: boolean }[] = [
  { label: "Como apoderado", comoPropietario: false },
  { label: "Como propietario", comoPropietario: true },
];

const DETALLE_META: Record<
  EstadoDestinatario,
  { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }
> = {
  enviado: { label: "Enviado", tone: "success" },
  fallido: { label: "Falló", tone: "destructive" },
  sin_contacto: { label: "Sin contacto", tone: "warning" },
};

const FILTROS: { value: EstadoEnvio | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "programado", label: "Programados" },
  { value: "enviando", label: "Enviando" },
  { value: "completado", label: "Completados" },
  { value: "cancelado", label: "Cancelados" },
  { value: "fallido", label: "Fallidos" },
];

/* -------------------------------------------------------------------------- */
/* Utilidades de fecha                                                         */
/* -------------------------------------------------------------------------- */

/** «7 ago 2026, 6:00 p. m.» */
function fmtProgramado(ts: number) {
  return new Date(ts).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtCorta(ts: number) {
  return new Date(ts).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** `YYYY-MM-DDTHH:mm` en hora local, para <input type="datetime-local">. */
function aDatetimeLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

/* -------------------------------------------------------------------------- */
/* Página                                                                      */
/* -------------------------------------------------------------------------- */

export default function AutomatizacionesPage() {
  const me = useQuery(api.users.me);
  const isPlatform =
    me?.platformRole === "superadmin" || me?.platformRole === "admin";

  const envios = useQuery(
    api.automatizaciones.listar,
    isPlatform ? {} : "skip",
  ) as AutomatizacionRow[] | undefined;

  const [filtro, setFiltro] = useState<EstadoEnvio | "todos">("todos");
  const [showProgramar, setShowProgramar] = useState(false);
  const [detalleDe, setDetalleDe] = useState<AutomatizacionRow | null>(null);
  const [confirmarEnvio, setConfirmarEnvio] =
    useState<AutomatizacionRow | null>(null);

  useNuevoQuery(() => setShowProgramar(true));

  const ordenados = useMemo(
    () => [...(envios ?? [])].sort((a, b) => b.programadoPara - a.programadoPara),
    [envios],
  );

  const conteos = useMemo(() => {
    const acc: Record<string, number> = { todos: ordenados.length };
    for (const e of ordenados) acc[e.estado] = (acc[e.estado] ?? 0) + 1;
    return acc;
  }, [ordenados]);

  const visibles = useMemo(
    () =>
      filtro === "todos"
        ? ordenados
        : ordenados.filter((e) => e.estado === filtro),
    [ordenados, filtro],
  );

  if (me === undefined) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </PageContainer>
    );
  }

  if (!isPlatform) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">
          No tienes acceso a esta sección.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Automatizaciones"
          description="Programa envíos a los apoderados de una asamblea con fecha y hora exactas."
          action={
            <Button variant="brand" onClick={() => setShowProgramar(true)}>
              <Plus className="h-3.75 w-3.75" aria-hidden />
              Programar envío
            </Button>
          }
        />

        <div className="inline-flex flex-wrap items-center gap-1 self-start rounded-full bg-muted p-1">
          {FILTROS.map((f) => {
            const n = conteos[f.value] ?? 0;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFiltro(f.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  filtro === f.value
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                {n > 0 && (
                  <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-foreground/8 px-1 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {envios === undefined ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : visibles.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={
              filtro === "todos"
                ? "Sin envíos programados"
                : "Nada con este estado"
            }
            description={
              filtro === "todos"
                ? "Programa el primer envío a los apoderados de una asamblea y aparecerá aquí."
                : "Cambia el filtro para ver los demás envíos."
            }
            action={
              filtro === "todos" ? (
                <Button variant="brand" onClick={() => setShowProgramar(true)}>
                  <Plus className="h-3.75 w-3.75" aria-hidden />
                  Programar envío
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2.5">
            {visibles.map((e) => (
              <EnvioCard
                key={e._id}
                envio={e}
                onVerDetalle={() => setDetalleDe(e)}
                onEnviarAhora={() => setConfirmarEnvio(e)}
              />
            ))}
          </div>
        )}
      </div>

      {showProgramar && (
        <ProgramarDialog onClose={() => setShowProgramar(false)} />
      )}
      {detalleDe && (
        <DetalleModal envio={detalleDe} onClose={() => setDetalleDe(null)} />
      )}
      {confirmarEnvio && (
        <EnviarAhoraModal
          envio={confirmarEnvio}
          onClose={() => setConfirmarEnvio(null)}
        />
      )}
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* Tarjeta de envío                                                            */
/* -------------------------------------------------------------------------- */

function EnvioCard({
  envio,
  onVerDetalle,
  onEnviarAhora,
}: {
  envio: AutomatizacionRow;
  onVerDetalle: () => void;
  onEnviarAhora: () => void;
}) {
  const cancelar = useMutation(api.automatizaciones.cancelar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estado = ESTADO_META[envio.estado];
  const canal = CANAL_META[envio.canal];
  const CanalIcon = canal.icon;

  const procesados = envio.enviados + envio.fallidos + envio.sinContacto;
  const yaCorrio =
    procesados > 0 ||
    envio.estado === "enviando" ||
    envio.estado === "completado" ||
    envio.estado === "fallido";
  const esProgramado = envio.estado === "programado";

  async function onCancelar() {
    setBusy(true);
    setError(null);
    try {
      await cancelar({ id: envio._id });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cancelar el envío.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {envio.condominioNombre}
            </span>
            <Badge tone={estado.tone}>
              {envio.estado === "enviando" && (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              )}
              {estado.label}
            </Badge>
            <Badge tone="neutral">
              <CanalIcon className="h-3 w-3" aria-hidden />
              {canal.label}
            </Badge>
          </div>

          <p className="text-sm text-foreground/90">
            {envio.asambleaTitulo ?? "Asamblea sin título"}
            <span className="text-muted-foreground">
              {" "}
              · Enlace de apoderados
            </span>
          </p>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {esProgramado ? "Se envía el " : "Programado para el "}
              <span className="font-medium text-foreground">
                {fmtProgramado(envio.programadoPara)}
              </span>
            </span>
          </p>

          {yaCorrio ? (
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Enviados" value={envio.enviados} />
              <Metric label="Fallidos" value={envio.fallidos} />
              <Metric label="Sin contacto" value={envio.sinContacto} />
            </div>
          ) : envio.total > 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {envio.total} destinatario{envio.total === 1 ? "" : "s"}
            </p>
          ) : null}

          {envio.error && (
            <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-red-600 dark:text-red-400">
                {envio.error}
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Creado por {envio.creadoPorNombre} · {fmtCorta(envio.createdAt)}
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          <Button size="sm" variant="secondary" onClick={onVerDetalle}>
            Ver detalle
          </Button>
          {esProgramado && (
            <>
              <Button size="sm" onClick={onEnviarAhora} disabled={busy}>
                <Send className="h-4 w-4" aria-hidden />
                Enviar ahora
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void onCancelar()}
                disabled={busy}
                className="text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <X className="h-4 w-4" aria-hidden />
                )}
                Cancelar
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Diálogo: programar envío                                                    */
/* -------------------------------------------------------------------------- */

function ProgramarDialog({ onClose }: { onClose: () => void }) {
  const condos = useQuery(api.automatizaciones.condominiosConAsambleas, {}) as
    | CondoConAsambleas[]
    | undefined;
  const programar = useMutation(api.automatizaciones.programar);
  const enviarPrueba = useAction(api.automatizaciones.enviarPrueba);

  // Los `<select>` manejan strings; el API exige ids tipados de Convex, así
  // que el estado se declara ya con la marca y arranca vacío.
  const [condominioId, setCondominioId] = useState<Id<"condominios"> | "">("");
  const [asambleaId, setAsambleaId] = useState<Id<"asambleas"> | "">("");
  const [canal, setCanal] = useState<Canal>("correo");
  const [cuando, setCuando] = useState(() =>
    aDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Envío de prueba: estado propio, aparte del envío real.
  const [pruebaEmail, setPruebaEmail] = useState("");
  const [pruebaTelefono, setPruebaTelefono] = useState("");
  const [pruebaNombre, setPruebaNombre] = useState("");
  const [pruebaComoPropietario, setPruebaComoPropietario] = useState(false);
  const [pruebaBusy, setPruebaBusy] = useState(false);
  const [pruebaError, setPruebaError] = useState<string | null>(null);
  const [pruebaResultado, setPruebaResultado] = useState<PruebaResultado | null>(
    null,
  );

  const condo = condos?.find((c) => c.condominioId === condominioId) ?? null;
  const asamblea =
    condo?.asambleas.find((a) => a.asambleaId === asambleaId) ?? null;
  const sinContacto = asamblea
    ? asamblea.apoderados - asamblea.apoderadosConContacto
    : 0;

  const cargando = condos === undefined;
  const sinCondominios = condos != null && condos.length === 0;
  const listo = Boolean(condominioId && asambleaId) && !busy;

  async function enviar(programadoPara: number) {
    if (!condominioId || !asambleaId) {
      setError("Selecciona un condominio y una asamblea.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await programar({
        condominioId,
        tipo: "apoderados_asamblea",
        asambleaId,
        canal,
        programadoPara,
      });
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo programar el envío.",
      );
      setBusy(false);
    }
  }

  function onProgramar() {
    const ts = new Date(cuando).getTime();
    if (!cuando || Number.isNaN(ts)) {
      setError("Elige una fecha y una hora válidas.");
      return;
    }
    if (ts <= Date.now()) {
      setError(
        "La fecha y hora deben ser futuras. Usa «Enviar ahora» si quieres mandarlo de inmediato.",
      );
      return;
    }
    void enviar(ts);
  }

  async function onEnviarPrueba() {
    if (!condominioId || !asambleaId) {
      setPruebaError("Selecciona un condominio y una asamblea.");
      return;
    }
    const email = pruebaEmail.trim();
    const telefono = pruebaTelefono.trim();
    if (!email && !telefono) {
      setPruebaError("Escribe un correo o un celular para la prueba.");
      return;
    }
    setPruebaBusy(true);
    setPruebaError(null);
    setPruebaResultado(null);
    try {
      const res = (await enviarPrueba({
        condominioId,
        asambleaId,
        canal,
        email: email || undefined,
        telefono: telefono || undefined,
        comoPropietario: pruebaComoPropietario,
        nombre: pruebaNombre.trim() || undefined,
      })) as PruebaResultado;
      setPruebaResultado(res);
    } catch (e) {
      setPruebaError(
        e instanceof Error ? e.message : "No se pudo mandar la prueba.",
      );
    } finally {
      setPruebaBusy(false);
    }
  }

  const pruebaLista = Boolean(condominioId && asambleaId) && !pruebaBusy;

  return (
    <Modal
      open
      onClose={onClose}
      title="Programar envío"
      description="Manda el enlace de la asamblea a los apoderados registrados."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void enviar(Date.now())}
            disabled={!listo}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <Send className="h-4 w-4" aria-hidden />
            Enviar ahora
          </Button>
          <Button size="sm" onClick={onProgramar} disabled={!listo}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <CalendarClock className="h-4 w-4" aria-hidden />
            Programar
          </Button>
        </>
      }
    >
      {cargando ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : sinCondominios ? (
        <p className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
          Ningún condominio tiene asambleas con apoderados registrados todavía.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="auto-condominio"
              className="block text-xs font-medium text-foreground"
            >
              Condominio
            </label>
            <Select
              id="auto-condominio"
              value={condominioId}
              disabled={busy}
              onChange={(e) => {
                setCondominioId(e.target.value as Id<"condominios"> | "");
                setAsambleaId("");
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

          <div className="space-y-1.5">
            <label
              htmlFor="auto-asamblea"
              className="block text-xs font-medium text-foreground"
            >
              Asamblea
            </label>
            <Select
              id="auto-asamblea"
              value={asambleaId}
              disabled={busy || !condo}
              onChange={(e) => {
                setAsambleaId(e.target.value as Id<"asambleas"> | "");
                setError(null);
              }}
            >
              <option value="">
                {condo
                  ? "Selecciona una asamblea…"
                  : "Primero elige el condominio"}
              </option>
              {(condo?.asambleas ?? []).map((a) => (
                <option key={a.asambleaId} value={a.asambleaId}>
                  {a.titulo} · {a.fecha} {a.hora} · {a.apoderados} apoderado
                  {a.apoderados === 1 ? "" : "s"} ({a.apoderadosConContacto} con
                  contacto)
                </option>
              ))}
            </Select>
            {condo && condo.asambleas.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Este condominio no tiene asambleas con apoderados registrados.
              </p>
            )}
          </div>

          {asamblea && (
            <div className="rounded-xl border border-border bg-muted/40 px-3.5 py-3">
              <p className="text-sm font-medium text-foreground">
                {asamblea.titulo}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {asamblea.fecha} · {asamblea.hora}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  <span className="font-medium tabular-nums text-foreground">
                    {asamblea.apoderados}
                  </span>{" "}
                  apoderado{asamblea.apoderados === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  <span className="font-medium tabular-nums text-foreground">
                    {asamblea.apoderadosConContacto}
                  </span>{" "}
                  con contacto registrado
                </span>
              </div>
            </div>
          )}

          {asamblea && sinContacto > 0 && (
            <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                {sinContacto} apoderado{sinContacto === 1 ? "" : "s"} no tiene
                {sinContacto === 1 ? "" : "n"} correo ni teléfono registrado; a
                esos habrá que compartirles el enlace a mano.
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Canal</p>
            <div className="space-y-2">
              {CANAL_OPCIONES.map((opt) => {
                const Icon = opt.icon;
                const checked = canal === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
                      checked
                        ? "border-brand bg-brand/5"
                        : "border-border hover:bg-accent",
                      busy && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name="canal-automatizacion"
                      checked={checked}
                      disabled={busy}
                      onChange={() => setCanal(opt.value)}
                      className="mt-0.5 h-4 w-4 shrink-0 border-border accent-[var(--color-brand)]"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {opt.descripcion}
                      </span>
                      {opt.nota && (
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                          {opt.nota}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="auto-cuando"
              className="block text-xs font-medium text-foreground"
            >
              Fecha y hora del envío
            </label>
            <input
              id="auto-cuando"
              type="datetime-local"
              value={cuando}
              min={aDatetimeLocal(new Date())}
              disabled={busy}
              onChange={(e) => {
                setCuando(e.target.value);
                setError(null);
              }}
              className={cn(
                "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground",
                "transition-colors duration-150 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
            <p className="text-[11px] text-muted-foreground">
              Se usa la hora de este equipo. Con «Enviar ahora» el envío arranca
              de inmediato.
            </p>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Envío de prueba (no cuenta como envío real)                       */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/40 px-3.5 py-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                Probar antes de enviar
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Se manda una sola copia con los datos reales de la asamblea
                seleccionada, por el canal elegido arriba. No le llega a nadie
                del condominio ni cuenta como envío real.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="auto-prueba-email"
                  className="block text-xs font-medium text-foreground"
                >
                  Correo de prueba
                </label>
                <Input
                  id="auto-prueba-email"
                  type="email"
                  value={pruebaEmail}
                  placeholder="tucorreo@ejemplo.com"
                  disabled={busy || pruebaBusy}
                  onChange={(e) => {
                    setPruebaEmail(e.target.value);
                    setPruebaError(null);
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="auto-prueba-telefono"
                  className="block text-xs font-medium text-foreground"
                >
                  Celular de prueba
                </label>
                <Input
                  id="auto-prueba-telefono"
                  type="tel"
                  value={pruebaTelefono}
                  placeholder="+573001234567"
                  disabled={busy || pruebaBusy}
                  onChange={(e) => {
                    setPruebaTelefono(e.target.value);
                    setPruebaError(null);
                  }}
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Basta con uno de los dos; si escribes ambos y el canal es «Ambos»,
              la prueba sale por correo y por WhatsApp.
            </p>

            <div className="space-y-1.5">
              <label
                htmlFor="auto-prueba-nombre"
                className="block text-xs font-medium text-foreground"
              >
                Nombre de prueba{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </label>
              <Input
                id="auto-prueba-nombre"
                type="text"
                value={pruebaNombre}
                placeholder="Nombre de prueba"
                disabled={busy || pruebaBusy}
                onChange={(e) => setPruebaNombre(e.target.value)}
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground">
                Versión del mensaje
              </p>
              <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-card p-1">
                {PRUEBA_VERSIONES.map((v) => {
                  const activo = pruebaComoPropietario === v.comoPropietario;
                  return (
                    <button
                      key={v.label}
                      type="button"
                      disabled={busy || pruebaBusy}
                      onClick={() => {
                        setPruebaComoPropietario(v.comoPropietario);
                        setPruebaError(null);
                      }}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                        activo
                          ? "bg-brand/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                        (busy || pruebaBusy) && "cursor-not-allowed opacity-60",
                      )}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {pruebaComoPropietario
                  ? "El propietario recibe el texto de «compártele el enlace a tu apoderado»."
                  : "El apoderado recibe el enlace para entrar directo a la asamblea. La versión de propietario dice «compártele el enlace a tu apoderado»."}
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => void onEnviarPrueba()}
              disabled={!pruebaLista || busy}
            >
              {pruebaBusy ? (
                <Spinner />
              ) : (
                <FlaskConical className="h-4 w-4" aria-hidden />
              )}
              Enviar prueba
            </Button>

            {pruebaResultado &&
              (pruebaResultado.correo || pruebaResultado.whatsapp) && (
                <div className="space-y-1">
                  {pruebaResultado.correo && (
                    <LineaPrueba
                      label="Correo"
                      texto={pruebaResultado.correo}
                    />
                  )}
                  {pruebaResultado.whatsapp && (
                    <LineaPrueba
                      label="WhatsApp"
                      texto={pruebaResultado.whatsapp}
                    />
                  )}
                </div>
              )}

            {pruebaError && (
              <p className="text-sm text-destructive">{pruebaError}</p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

/** Una línea del resultado de la prueba: verde si salió, ámbar si falló. */
function LineaPrueba({ label, texto }: { label: string; texto: string }) {
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

/* -------------------------------------------------------------------------- */
/* Modal: confirmar «Enviar ahora» sobre un envío ya programado                */
/* -------------------------------------------------------------------------- */

function EnviarAhoraModal({
  envio,
  onClose,
}: {
  envio: AutomatizacionRow;
  onClose: () => void;
}) {
  const enviarAhora = useMutation(api.automatizaciones.enviarAhora);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setBusy(true);
    setError(null);
    try {
      await enviarAhora({ id: envio._id });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Enviar ahora"
      description={envio.condominioNombre}
      className="max-w-md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void confirmar()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <Send className="h-4 w-4" aria-hidden />
            Enviar ahora
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          El envío dejará de estar programado para el{" "}
          <span className="font-medium text-foreground">
            {fmtProgramado(envio.programadoPara)}
          </span>{" "}
          y saldrá de inmediato por{" "}
          <span className="font-medium text-foreground">
            {CANAL_META[envio.canal].label.toLowerCase()}
          </span>
          .
        </p>
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-foreground">
          Los mensajes ya enviados no se pueden deshacer.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal: detalle de destinatarios                                             */
/* -------------------------------------------------------------------------- */

function DetalleModal({
  envio,
  onClose,
}: {
  envio: AutomatizacionRow;
  onClose: () => void;
}) {
  const detalle = useQuery(api.automatizaciones.detalle, { id: envio._id }) as
    | DetalleRow[]
    | undefined;

  return (
    <Modal
      open
      onClose={onClose}
      title="Detalle del envío"
      description={[
        envio.condominioNombre,
        envio.asambleaTitulo,
        fmtProgramado(envio.programadoPara),
      ]
        .filter(Boolean)
        .join(" · ")}
      className="max-w-xl"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {detalle === undefined ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : detalle.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Todavía sin destinatarios"
          description="Cuando el envío se ejecute verás aquí a quién le llegó y a quién no."
        />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border">
          {detalle.map((d, i) => {
            const meta = DETALLE_META[d.estado] ?? DETALLE_META.fallido;
            const canalLabel =
              CANAL_META[d.canal as Canal]?.label ?? d.canal;
            return (
              <li
                key={d._id}
                className={cn(
                  "flex items-start gap-3 px-3.5 py-2.5",
                  i > 0 && "border-t border-border/60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {d.nombre || "—"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.destino ?? "Sin contacto registrado"} · {canalLabel} ·{" "}
                    {fmtCorta(d.createdAt)}
                  </p>
                  {d.motivo && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {d.motivo}
                    </p>
                  )}
                </div>
                <Badge tone={meta.tone} className="shrink-0">
                  {meta.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
