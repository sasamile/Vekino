"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  FlaskConical,
  Link2,
  Loader2,
  Mail,
  Megaphone,
  MessageCircle,
  KeyRound,
  MessageSquareText,
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
import { useComunicadoQuery } from "@/hooks/use-comunicado-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  LineaPrueba,
  nombrePlantillaLegible,
  PlantillasGaleria,
  PreviewPlantilla,
  ProbarPlantillaModal,
  usePlantillasWhatsapp,
  type PlantillaOpcion,
  type PruebaResultado,
} from "@/components/dashboard/plantillas-whatsapp";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Tipos (espejo de api.automatizaciones.*)                                    */
/* -------------------------------------------------------------------------- */

type Canal = "correo" | "whatsapp" | "ambos";
/**
 * Qué se manda: un mensaje libre, el enlace de ingreso a una asamblea, o una
 * plantilla de WhatsApp ya aprobada por Meta.
 */
type TipoEnvio =
  | "mensaje_residentes"
  | "apoderados_asamblea"
  | "plantilla_whatsapp"
  | "credenciales_acceso"
  | "comunicado_difusion";
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
  tipo: TipoEnvio;
  asambleaId: Id<"asambleas"> | null;
  asambleaTitulo: string | null;
  asunto: string | null;
  mensaje: string | null;
  audiencia: string | null;
  plantilla: string | null;
  parametros: string[] | null;
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

const TIPO_META: Record<
  TipoEnvio,
  { label: string; icon: LucideIcon; descripcion: string }
> = {
  mensaje_residentes: {
    label: "Mensaje a residentes",
    icon: Megaphone,
    descripcion: "Un mensaje libre a los residentes del condominio.",
  },
  apoderados_asamblea: {
    label: "Enlace de asamblea",
    icon: Link2,
    descripcion:
      "El enlace de ingreso, al propietario, para que se lo comparta a su apoderado.",
  },
  plantilla_whatsapp: {
    label: "Plantilla de WhatsApp",
    icon: MessageSquareText,
    descripcion:
      "Elige una plantilla aprobada por Meta y envíala a los residentes.",
  },
  comunicado_difusion: {
    label: "Difundir un comunicado",
    icon: Megaphone,
    descripcion:
      "Manda un comunicado ya publicado: la plantilla por WhatsApp y el texto completo por correo.",
  },
  credenciales_acceso: {
    label: "Accesos a la plataforma",
    icon: KeyRound,
    descripcion:
      "Genera y envía por correo los datos de ingreso a quienes nunca han entrado.",
  },
};

/** Orden de las tarjetas del selector: primero el caso más común. */
const TIPO_OPCIONES: TipoEnvio[] = [
  "comunicado_difusion",
  "mensaje_residentes",
  "apoderados_asamblea",
  "plantilla_whatsapp",
  "credenciales_acceso",
];

/** Tope de caracteres del mensaje libre. */
const MENSAJE_MAX = 1000;

/**
 * Fichas que se pueden escribir dentro de una variable de plantilla; el
 * backend las reemplaza por los datos de cada destinatario.
 */
const FICHAS = ["{nombre}", "{condominio}", "{unidad}"] as const;

/** Valores que acepta `audiencia` en el backend (roles de membresía). */
const AUDIENCIA_OPCIONES: { value: string; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "propietario", label: "Propietarios" },
  { value: "arrendatario", label: "Arrendatarios" },
  { value: "residente", label: "Residentes" },
  { value: "junta_directiva", label: "Junta directiva" },
  { value: "guardia", label: "Guardias" },
];

function audienciaLabel(valor: string | null) {
  return (
    AUDIENCIA_OPCIONES.find((a) => a.value === (valor ?? "todos"))?.label ??
    valor ??
    "Todos"
  );
}

/** Primeras ~100 letras del mensaje, para la tarjeta del listado. */
function resumenMensaje(texto: string | null) {
  const limpio = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return "Mensaje sin texto";
  return limpio.length > 100 ? `${limpio.slice(0, 100)}…` : limpio;
}

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
    descripcion: "Se envía al correo registrado de cada destinatario.",
  },
  {
    value: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    descripcion: "Se envía al teléfono registrado de cada destinatario.",
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
  /** Plantilla con la que se abre el diálogo desde la galería. */
  const [plantillaInicial, setPlantillaInicial] = useState<string | undefined>();
  /** Comunicado con el que se abre desde el botón «Difundir» de la circular. */
  const [comunicadoInicial, setComunicadoInicial] = useState<
    { id: string; condominioId: string } | undefined
  >();
  const [probarPlantilla, setProbarPlantilla] = useState<PlantillaOpcion | null>(
    null,
  );
  const [detalleDe, setDetalleDe] = useState<AutomatizacionRow | null>(null);
  const [confirmarEnvio, setConfirmarEnvio] =
    useState<AutomatizacionRow | null>(null);

  // Las plantillas se piden una sola vez y se comparten entre la galería y el
  // diálogo de programación.
  const {
    plantillas,
    cargando: cargandoPlantillas,
    error: errorPlantillas,
  } = usePlantillasWhatsapp(isPlatform);

  function abrirProgramar(plantilla?: string) {
    setPlantillaInicial(plantilla);
    setShowProgramar(true);
  }

  function cerrarProgramar() {
    setShowProgramar(false);
    setPlantillaInicial(undefined);
    setComunicadoInicial(undefined);
  }

  useNuevoQuery(() => abrirProgramar());
  useComunicadoQuery((id, condominioId) => {
    setComunicadoInicial({ id, condominioId });
    setShowProgramar(true);
  });

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
          description="Programa mensajes a los residentes con fecha y hora exactas, y prueba las plantillas antes de enviarlas."
          action={
            <Button variant="brand" onClick={() => abrirProgramar()}>
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
                ? "Programa el primer envío a los residentes y aparecerá aquí."
                : "Cambia el filtro para ver los demás envíos."
            }
            action={
              filtro === "todos" ? (
                <Button variant="brand" onClick={() => abrirProgramar()}>
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

        <PlantillasGaleria
          plantillas={plantillas}
          cargando={cargandoPlantillas}
          error={errorPlantillas}
          onProbar={(p) => setProbarPlantilla(p)}
          onProgramar={(p) => abrirProgramar(p.nombre)}
        />
      </div>

      {showProgramar && (
        <ProgramarDialog
          onClose={cerrarProgramar}
          plantillas={plantillas}
          cargandoPlantillas={cargandoPlantillas}
          errorPlantillas={errorPlantillas}
          plantillaInicial={plantillaInicial}
          comunicadoInicial={comunicadoInicial}
        />
      )}
      {probarPlantilla && (
        <ProbarPlantillaModal
          plantilla={probarPlantilla}
          onClose={() => setProbarPlantilla(null)}
        />
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
  const tipo = TIPO_META[envio.tipo];
  const TipoIcon = tipo.icon;
  const esMensaje = envio.tipo === "mensaje_residentes";
  const esPlantilla = envio.tipo === "plantilla_whatsapp";

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
              <TipoIcon className="h-3 w-3" aria-hidden />
              {tipo.label}
            </Badge>
            <Badge tone="neutral">
              <CanalIcon className="h-3 w-3" aria-hidden />
              {canal.label}
            </Badge>
          </div>

          {esMensaje ? (
            <p className="text-sm text-foreground/90">
              {envio.asunto ? (
                <span className="font-medium">{envio.asunto} · </span>
              ) : null}
              {resumenMensaje(envio.mensaje)}
              <span className="text-muted-foreground">
                {" "}
                · Para {audienciaLabel(envio.audiencia).toLowerCase()}
              </span>
            </p>
          ) : esPlantilla ? (
            <p className="text-sm text-foreground/90">
              <span className="font-medium">
                {envio.plantilla
                  ? nombrePlantillaLegible(envio.plantilla)
                  : "Plantilla sin nombre"}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · Para {audienciaLabel(envio.audiencia).toLowerCase()}
              </span>
            </p>
          ) : (
            <p className="text-sm text-foreground/90">
              {envio.asambleaTitulo ?? "Asamblea sin título"}
              <span className="text-muted-foreground">
                {" "}
                · Enlace de apoderados
              </span>
            </p>
          )}

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

function ProgramarDialog({
  onClose,
  plantillas,
  cargandoPlantillas,
  errorPlantillas,
  plantillaInicial,
  comunicadoInicial,
}: {
  onClose: () => void;
  plantillas: PlantillaOpcion[] | null;
  cargandoPlantillas: boolean;
  errorPlantillas: string | null;
  /** Si viene, el diálogo abre ya en «Plantilla de WhatsApp» con esa elegida. */
  plantillaInicial?: string;
  /** Si viene, abre en «Difundir un comunicado» con ese ya seleccionado. */
  comunicadoInicial?: { id: string; condominioId: string };
}) {
  const condos = useQuery(api.automatizaciones.condominiosConAsambleas, {}) as
    | CondoConAsambleas[]
    | undefined;
  const programar = useMutation(api.automatizaciones.programar);
  const enviarPrueba = useAction(api.automatizaciones.enviarPrueba);

  // Los `<select>` manejan strings; el API exige ids tipados de Convex, así
  // que el estado se declara ya con la marca y arranca vacío.
  const [condominioId, setCondominioId] = useState<Id<"condominios"> | "">(
    (comunicadoInicial?.condominioId as Id<"condominios">) ?? "",
  );
  const [tipo, setTipo] = useState<TipoEnvio>(
    comunicadoInicial
      ? "comunicado_difusion"
      : plantillaInicial
        ? "plantilla_whatsapp"
        : "mensaje_residentes",
  );
  const [asambleaId, setAsambleaId] = useState<Id<"asambleas"> | "">("");
  const [audiencia, setAudiencia] = useState("todos");
  const [comunicadoId, setComunicadoId] = useState<Id<"comunicados"> | "">(
    (comunicadoInicial?.id as Id<"comunicados">) ?? "",
  );
  const [modoCredenciales, setModoCredenciales] = useState<
    "solo_sin_clave" | "nunca_ingreso" | "todos"
  >("nunca_ingreso");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [canal, setCanal] = useState<Canal>(
    plantillaInicial ? "whatsapp" : "correo",
  );
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

  // Plantilla elegida (las carga la página y llegan por props).
  const [plantillaNombre, setPlantillaNombre] = useState(plantillaInicial ?? "");
  const [parametros, setParametros] = useState<string[]>([]);
  // Último input de variable enfocado, para saber dónde insertar una ficha.
  const [focoParam, setFocoParam] = useState(0);
  const paramRefs = useRef<(HTMLInputElement | null)[]>([]);

  const esMensaje = tipo === "mensaje_residentes";
  const esAsamblea = tipo === "apoderados_asamblea";
  const esPlantilla = tipo === "plantilla_whatsapp";
  const esCredenciales = tipo === "credenciales_acceso";
  const esComunicado = tipo === "comunicado_difusion";

  const plantilla =
    plantillas?.find((p) => p.nombre === plantillaNombre) ?? null;
  const totalVariables = plantilla?.variables ?? 0;
  const variablesCompletas =
    plantilla != null &&
    Array.from({ length: totalVariables }).every(
      (_, i) => (parametros[i] ?? "").trim().length > 0,
    );

  function setParametro(i: number, valor: string) {
    setParametros((prev) => {
      const copia = [...prev];
      while (copia.length <= i) copia.push("");
      copia[i] = valor;
      return copia;
    });
    setError(null);
    setPruebaError(null);
  }

  /** Inserta `{nombre}` y compañía donde estaba el cursor del último input. */
  function insertarFicha(ficha: string) {
    const i = Math.min(focoParam, Math.max(totalVariables - 1, 0));
    const actual = parametros[i] ?? "";
    const el = paramRefs.current[i];
    const pos =
      el && el.selectionStart != null ? el.selectionStart : actual.length;
    setParametro(i, `${actual.slice(0, pos)}${ficha}${actual.slice(pos)}`);
    requestAnimationFrame(() => {
      const nodo = paramRefs.current[i];
      if (!nodo) return;
      nodo.focus();
      const cursor = pos + ficha.length;
      nodo.setSelectionRange(cursor, cursor);
    });
  }

  const comunicados = useQuery(
    api.automatizaciones.comunicadosDeCondominio,
    esComunicado && condominioId ? { condominioId } : "skip",
  );
  const comunicadoElegido =
    comunicados?.find((c) => c.comunicadoId === comunicadoId) ?? null;

  const condo = condos?.find((c) => c.condominioId === condominioId) ?? null;
  const asamblea =
    condo?.asambleas.find((a) => a.asambleaId === asambleaId) ?? null;
  const sinContacto = asamblea
    ? asamblea.apoderados - asamblea.apoderadosConContacto
    : 0;

  const cargando = condos === undefined;
  const sinCondominios = condos != null && condos.length === 0;
  const listo =
    Boolean(condominioId) &&
    (esMensaje
      ? mensaje.trim().length > 0
      : esPlantilla
        ? Boolean(plantillaNombre) && variablesCompletas
        : esCredenciales
          ? true // solo hace falta el condominio: el resto lo decide el motor
          : esComunicado
            ? Boolean(comunicadoId)
            : Boolean(asambleaId)) &&
    !busy;

  async function enviar(programadoPara: number) {
    if (!condominioId) {
      setError("Selecciona un condominio.");
      return;
    }
    if (esMensaje && !mensaje.trim()) {
      setError("Escribe el mensaje que quieres enviar.");
      return;
    }
    if (esComunicado && !comunicadoId) {
      setError("Elige el comunicado que quieres difundir.");
      return;
    }
    if (esAsamblea && !esCredenciales && !asambleaId) {
      setError("Selecciona una asamblea.");
      return;
    }
    if (esPlantilla) {
      if (!plantillaNombre) {
        setError("Elige la plantilla que quieres enviar.");
        return;
      }
      if (!variablesCompletas) {
        setError("Llena todas las variables de la plantilla.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await programar({
        condominioId,
        tipo,
        asambleaId: esAsamblea ? (asambleaId as Id<"asambleas">) : undefined,
        asunto: esMensaje ? asunto.trim() || undefined : undefined,
        mensaje: esMensaje ? mensaje.trim() : undefined,
        audiencia: esMensaje || esPlantilla ? audiencia : undefined,
        plantilla: esPlantilla ? plantillaNombre : undefined,
        parametros: esPlantilla
          ? Array.from({ length: totalVariables }, (_, i) => parametros[i] ?? "")
          : undefined,
        comunicadoId: esComunicado
          ? (comunicadoId as Id<"comunicados">)
          : undefined,
        modoCredenciales: esCredenciales ? modoCredenciales : undefined,
        // Las credenciales solo salen por correo: Meta rechaza toda plantilla
        // de WhatsApp que mencione contraseñas.
        canal: esCredenciales ? "correo" : esPlantilla ? "whatsapp" : canal,
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
    if (!condominioId) {
      setPruebaError("Selecciona un condominio.");
      return;
    }
    const email = pruebaEmail.trim();
    const telefono = pruebaTelefono.trim();

    // La prueba de una plantilla siempre sale por WhatsApp: no hay versión
    // por correo de una plantilla aprobada en Meta.
    if (esPlantilla) {
      if (!plantillaNombre) {
        setPruebaError("Elige la plantilla que quieres probar.");
        return;
      }
      if (!variablesCompletas) {
        setPruebaError("Llena todas las variables antes de probar.");
        return;
      }
      if (!telefono) {
        setPruebaError("Escribe un celular: esta prueba sale por WhatsApp.");
        return;
      }
      setPruebaBusy(true);
      setPruebaError(null);
      setPruebaResultado(null);
      try {
        const res = (await enviarPrueba({
          condominioId,
          tipo,
          plantilla: plantillaNombre,
          parametros: Array.from(
            { length: totalVariables },
            (_, i) => parametros[i] ?? "",
          ),
          canal: "whatsapp",
          telefono,
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
      return;
    }

    if (!asambleaId) {
      setPruebaError("Selecciona una asamblea.");
      return;
    }
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

  const pruebaLista = esPlantilla
    ? Boolean(condominioId && plantillaNombre && pruebaTelefono.trim()) &&
      variablesCompletas &&
      !pruebaBusy
    : esAsamblea && Boolean(condominioId && asambleaId) && !pruebaBusy;

  return (
    <Modal
      open
      onClose={onClose}
      title="Programar envío"
      description={
        esMensaje
          ? "Manda un mensaje de la administración a los residentes del condominio."
          : esPlantilla
            ? "Manda una plantilla aprobada de WhatsApp a los residentes del condominio."
            : "Manda el enlace de la asamblea a los apoderados registrados."
      }
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
          Ningún condominio tiene asambleas abiertas todavía, así que aún no hay
          a quién programarle un envío desde aquí.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">
              Tipo de envío
            </p>
            <div className="space-y-2">
              {TIPO_OPCIONES.map((valor) => {
                const meta = TIPO_META[valor];
                const Icon = meta.icon;
                const checked = tipo === valor;
                return (
                  <label
                    key={valor}
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
                      name="tipo-automatizacion"
                      checked={checked}
                      disabled={busy}
                      onChange={() => {
                        setTipo(valor);
                        // Una plantilla solo existe en WhatsApp.
                        if (valor === "plantilla_whatsapp") {
                          setCanal("whatsapp");
                        }
                        setError(null);
                        setPruebaError(null);
                        setPruebaResultado(null);
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 border-border accent-[var(--color-brand)]"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {meta.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {meta.descripcion}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="auto-condominio"
              className="block text-xs font-medium text-foreground"
            >
              Condominio
            </label>
            {/* TODO: `condominiosConAsambleas` solo devuelve condominios con
                asambleas abiertas. Para «Mensaje a residentes» convendría una
                query con todos los condominios activos; mientras tanto se usa
                la lista que ya existe. */}
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

          {(esMensaje || esPlantilla) && (
            <div className="space-y-1.5">
              <label
                htmlFor="auto-audiencia"
                className="block text-xs font-medium text-foreground"
              >
                Audiencia
              </label>
              <Select
                id="auto-audiencia"
                value={audiencia}
                disabled={busy}
                onChange={(e) => {
                  setAudiencia(e.target.value);
                  setError(null);
                }}
              >
                {AUDIENCIA_OPCIONES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Se manda a las personas activas del condominio con ese rol.
              </p>
            </div>
          )}

          {esPlantilla && (
            <PlantillaCampos
              plantillas={plantillas}
              cargando={cargandoPlantillas}
              errorCarga={errorPlantillas}
              seleccionada={plantilla}
              plantillaNombre={plantillaNombre}
              parametros={parametros}
              disabled={busy}
              paramRefs={paramRefs}
              onSeleccionar={(nombre) => {
                setPlantillaNombre(nombre);
                setParametros([]);
                setFocoParam(0);
                setError(null);
                setPruebaError(null);
                setPruebaResultado(null);
              }}
              onCambiarParametro={setParametro}
              onFocoParametro={setFocoParam}
              onInsertarFicha={insertarFicha}
            />
          )}

          {esMensaje && (
            <>
              <div className="space-y-1.5">
                <label
                  htmlFor="auto-asunto"
                  className="block text-xs font-medium text-foreground"
                >
                  Asunto del correo{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </label>
                <Input
                  id="auto-asunto"
                  type="text"
                  value={asunto}
                  placeholder="Mensaje de la administración"
                  disabled={busy}
                  onChange={(e) => {
                    setAsunto(e.target.value);
                    setError(null);
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="auto-mensaje"
                  className="block text-xs font-medium text-foreground"
                >
                  Mensaje
                </label>
                <Textarea
                  id="auto-mensaje"
                  rows={5}
                  value={mensaje}
                  maxLength={MENSAJE_MAX}
                  placeholder="Escribe aquí el mensaje que van a recibir los residentes…"
                  disabled={busy}
                  onChange={(e) => {
                    setMensaje(e.target.value.slice(0, MENSAJE_MAX));
                    setError(null);
                  }}
                />
                <p className="text-right text-[11px] tabular-nums text-muted-foreground">
                  {mensaje.length}/{MENSAJE_MAX}
                </p>
              </div>
            </>
          )}

          {esComunicado && (
            <div className="space-y-1.5">
              <label
                htmlFor="auto-comunicado"
                className="block text-xs font-medium text-foreground"
              >
                Comunicado
              </label>
              <Select
                id="auto-comunicado"
                value={comunicadoId}
                disabled={busy || !condominioId}
                onChange={(e) => {
                  setComunicadoId(e.target.value as Id<"comunicados"> | "");
                  setError(null);
                }}
              >
                <option value="">
                  {condominioId
                    ? "Selecciona un comunicado…"
                    : "Primero elige el condominio"}
                </option>
                {(comunicados ?? []).map((c) => (
                  <option key={c.comunicadoId} value={c.comunicadoId}>
                    {c.titulo}
                    {c.adjuntos > 0 ? ` · ${c.adjuntos} adjunto${c.adjuntos === 1 ? "" : "s"}` : ""}
                  </option>
                ))}
              </Select>
              {comunicadoElegido && (
                <div className="mt-2 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-foreground">
                    {comunicadoElegido.titulo}
                  </p>
                  <p className="mt-1 line-clamp-4 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
                    {comunicadoElegido.cuerpo}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    Por WhatsApp va el titular con el botón para leerlo; por
                    correo va el texto completo
                    {comunicadoElegido.adjuntos > 0
                      ? " y los adjuntos como enlaces"
                      : ""}
                    . Le llega a{" "}
                    <strong>
                      {comunicadoElegido.audiencia === "todos"
                        ? "todos"
                        : comunicadoElegido.audiencia}
                    </strong>
                    , que es a quien se publicó.
                  </p>
                </div>
              )}
              {condominioId && comunicados != null && comunicados.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Este condominio todavía no tiene comunicados publicados.
                </p>
              )}
            </div>
          )}

          {esCredenciales && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="auto-modo-cred"
                  className="block text-xs font-medium text-foreground"
                >
                  ¿A quién se le genera clave?
                </label>
                <Select
                  id="auto-modo-cred"
                  value={modoCredenciales}
                  disabled={busy}
                  onChange={(e) => {
                    setModoCredenciales(
                      e.target.value as
                        | "solo_sin_clave"
                        | "nunca_ingreso"
                        | "todos",
                    );
                    setError(null);
                  }}
                >
                  <option value="nunca_ingreso">
                    A quienes no han entrado nunca
                  </option>
                  <option value="solo_sin_clave">
                    A quienes no tienen contraseña propia
                  </option>
                  <option value="todos">
                    A todos (le cambia la clave a quien ya tenía la suya)
                  </option>
                </Select>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Va <strong>por correo</strong>: Meta rechaza toda plantilla de
                WhatsApp que mencione contraseñas. A cada persona se le genera
                una clave propia y un enlace de un solo uso que vence en 24
                horas. Si el correo falla, esa contraseña se revierte para no
                dejar a nadie por fuera.
              </p>
              {modoCredenciales === "nunca_ingreso" && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  «No han entrado nunca» se calcula con dos señales: que no se
                  les haya registrado un ingreso, y que sigan con la clave
                  temporal que les mandamos sin haberla cambiado. El registro de
                  ingresos empezó ahora, así que los primeros días puede incluir
                  a alguien que sí entró hace meses. A esa persona no se le
                  rompe nada: recibe una clave nueva que también le sirve.
                </p>
              )}
              {modoCredenciales === "todos" && (
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    Ojo: a quien ya se puso su propia contraseña se la vas a
                    invalidar. Normalmente quieres la primera opción.
                  </span>
                </p>
              )}
            </div>
          )}

          {esAsamblea && (
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
                    {a.apoderados === 1 ? "" : "s"} ({a.apoderadosConContacto}{" "}
                    con contacto)
                  </option>
                ))}
              </Select>
              {condo && condo.asambleas.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Este condominio no tiene asambleas con apoderados registrados.
                </p>
              )}
            </div>
          )}

          {esAsamblea && asamblea && (
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

          {esAsamblea && asamblea && sinContacto > 0 && (
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

          {/* Las credenciales solo salen por correo; no hay nada que elegir. */}
          <div className={esCredenciales ? "hidden" : undefined}>
            <p className="mb-2 text-xs font-medium text-foreground">Canal</p>
            <div className="space-y-2">
              {CANAL_OPCIONES.map((opt) => {
                const Icon = opt.icon;
                // Una plantilla solo se puede mandar por WhatsApp, así que los
                // otros canales quedan bloqueados para ese tipo.
                const bloqueado = esPlantilla && opt.value !== "whatsapp";
                const checked = esPlantilla
                  ? opt.value === "whatsapp"
                  : canal === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
                      bloqueado ? "cursor-not-allowed" : "cursor-pointer",
                      checked
                        ? "border-brand bg-brand/5"
                        : bloqueado
                          ? "border-border"
                          : "border-border hover:bg-accent",
                      (busy || bloqueado) && "opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name="canal-automatizacion"
                      checked={checked}
                      disabled={busy || bloqueado}
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
            {esPlantilla && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Las plantillas son de WhatsApp; no hay versión por correo.
              </p>
            )}
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
                {esPlantilla
                  ? "Se manda una sola copia de la plantilla, por WhatsApp, al celular que escribas aquí. Las fichas se llenan con datos de ejemplo. No le llega a nadie del condominio ni cuenta como envío real."
                  : "Se manda una sola copia con los datos reales de la asamblea seleccionada, por el canal elegido arriba. No le llega a nadie del condominio ni cuenta como envío real."}
              </p>
            </div>

            {/* TODO: `enviarPrueba` todavía exige una asamblea; cuando el
                backend acepte texto libre se habilita también para
                «Mensaje a residentes». */}
            {esMensaje && (
              <p className="flex gap-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden
                />
                <span>
                  La prueba por ahora solo está disponible para el enlace de
                  asamblea.
                </span>
              </p>
            )}

            <div className={cn("grid gap-3", !esPlantilla && "sm:grid-cols-2")}>
              {/* Una plantilla no tiene versión por correo, así que ese campo
                  se esconde y la prueba va siempre al celular. */}
              {!esPlantilla && (
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
              )}

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
              {esPlantilla
                ? "La prueba de una plantilla sale por WhatsApp, así que el celular es obligatorio."
                : "Basta con uno de los dos; si escribes ambos y el canal es «Ambos», la prueba sale por correo y por WhatsApp."}
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

            {/* La versión apoderado/propietario solo aplica al enlace de
                asamblea; el mensaje libre y las plantillas no tienen
                variantes. */}
            {esAsamblea && (
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
                          (busy || pruebaBusy) &&
                            "cursor-not-allowed opacity-60",
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
            )}

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

/* -------------------------------------------------------------------------- */
/* Campos de «Plantilla de WhatsApp»                                           */
/* -------------------------------------------------------------------------- */

function PlantillaCampos({
  plantillas,
  cargando,
  errorCarga,
  seleccionada,
  plantillaNombre,
  parametros,
  disabled,
  paramRefs,
  onSeleccionar,
  onCambiarParametro,
  onFocoParametro,
  onInsertarFicha,
}: {
  plantillas: PlantillaOpcion[] | null;
  cargando: boolean;
  errorCarga: string | null;
  seleccionada: PlantillaOpcion | null;
  plantillaNombre: string;
  parametros: string[];
  disabled: boolean;
  paramRefs: { current: (HTMLInputElement | null)[] };
  onSeleccionar: (nombre: string) => void;
  onCambiarParametro: (i: number, valor: string) => void;
  onFocoParametro: (i: number) => void;
  onInsertarFicha: (ficha: string) => void;
}) {
  // Con una plantilla ya elegida se muestra su tarjeta; «Cambiar» vuelve a
  // abrir la lista.
  const [eligiendo, setEligiendo] = useState(false);

  if (cargando) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div className="flex gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
          aria-hidden
        />
        <p className="text-xs leading-relaxed text-red-600 dark:text-red-400">
          {errorCarga} Cierra y vuelve a abrir esta ventana para reintentar.
        </p>
      </div>
    );
  }

  if (!plantillas || plantillas.length === 0) {
    return (
      <p className="rounded-lg bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
        No hay plantillas aprobadas por Meta todavía. Cuando aprueben una,
        aparecerá aquí sola.
      </p>
    );
  }

  const total = seleccionada?.variables ?? 0;
  const mostrarLista = !seleccionada || eligiendo;

  return (
    <div className="space-y-3">
      {mostrarLista ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">
              Elige la plantilla
            </p>
            {seleccionada && (
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setEligiendo(false)}
              >
                Volver
              </Button>
            )}
          </div>
          {plantillas.map((p) => {
            const activa = p.nombre === plantillaNombre;
            return (
              <button
                key={`${p.nombre}-${p.idioma}`}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onSeleccionar(p.nombre);
                  setEligiendo(false);
                }}
                className={cn(
                  "block w-full rounded-xl border px-3.5 py-3 text-left transition-colors",
                  activa
                    ? "border-brand bg-brand/5"
                    : "border-border hover:bg-accent",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {nombrePlantillaLegible(p.nombre)}
                  </span>
                  <Badge tone="neutral">{p.categoria}</Badge>
                </span>
                <PreviewPlantilla cuerpo={p.cuerpo} className="mt-2" />
                <span className="mt-1.5 block text-[11px] text-muted-foreground">
                  {p.variables === 0
                    ? "Sin variables"
                    : `${p.variables} variable${p.variables === 1 ? "" : "s"}`}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        seleccionada && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground">Plantilla</p>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setEligiendo(true)}
              >
                Cambiar
              </Button>
            </div>
            <div className="space-y-2 rounded-xl border border-border px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {nombrePlantillaLegible(seleccionada.nombre)}
                </span>
                <Badge tone="success">
                  <MessageCircle className="h-3 w-3" aria-hidden />
                  WhatsApp
                </Badge>
                <Badge tone="neutral">{seleccionada.categoria}</Badge>
              </div>
              {/* Burbuja estilo WhatsApp con las variables ya reemplazadas. */}
              <PreviewPlantilla
                cuerpo={seleccionada.cuerpo}
                valores={parametros}
              />
            </div>
          </div>
        )
      )}

      {seleccionada && !mostrarLista && (
        <>
          {seleccionada.botonUrlDinamica && (
            <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                Esta plantilla tiene un enlace dinámico en el botón que este
                envío no puede llenar. Úsala solo si el enlace no cambia por
                persona.
              </p>
            </div>
          )}

          {total > 0 ? (
            <div className="space-y-2">
              {Array.from({ length: total }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <label
                    htmlFor={`auto-plantilla-var-${i}`}
                    className="block text-xs font-medium text-foreground"
                  >
                    Variable {`{{${i + 1}}}`}
                  </label>
                  <Input
                    id={`auto-plantilla-var-${i}`}
                    ref={(nodo) => {
                      paramRefs.current[i] = nodo;
                    }}
                    type="text"
                    value={parametros[i] ?? ""}
                    placeholder={`Valor de {{${i + 1}}}`}
                    disabled={disabled}
                    onFocus={() => onFocoParametro(i)}
                    onChange={(e) => onCambiarParametro(i, e.target.value)}
                  />
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] leading-relaxed text-muted-foreground">
                  Puedes usar
                </span>
                {FICHAS.map((ficha) => (
                  <button
                    key={ficha}
                    type="button"
                    disabled={disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onInsertarFicha(ficha)}
                    className={cn(
                      "rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[11px] text-foreground transition-colors",
                      disabled
                        ? "cursor-not-allowed opacity-60"
                        : "hover:border-brand hover:bg-brand/5",
                    )}
                  >
                    {ficha}
                  </button>
                ))}
                <span className="text-[11px] leading-relaxed text-muted-foreground">
                  ; se reemplazan por los datos de cada persona.
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Esta plantilla no tiene variables: sale tal cual está arriba.
            </p>
          )}
        </>
      )}
    </div>
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
        envio.tipo === "mensaje_residentes"
          ? (envio.asunto ?? resumenMensaje(envio.mensaje))
          : envio.tipo === "plantilla_whatsapp"
            ? envio.plantilla && nombrePlantillaLegible(envio.plantilla)
            : envio.asambleaTitulo,
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
