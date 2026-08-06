"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, KeyRound, Loader2, X } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Modo = "solo_sin_clave" | "todos";
type EstadoEnvio = "enviado" | "fallido" | "omitido";

const CONFIRM_WORD = "CONFIRMAR";

const ESTADO_LABEL: Record<EstadoEnvio, string> = {
  enviado: "Enviado",
  fallido: "Falló",
  omitido: "Omitido",
};

const ESTADO_TONE: Record<EstadoEnvio, "success" | "destructive" | "warning"> =
  {
    enviado: "success",
    fallido: "destructive",
    omitido: "warning",
  };

function fechaLarga(ts: number) {
  return new Date(ts).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fechaCorta(ts: number) {
  return new Date(ts).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Envío masivo de credenciales de acceso a los residentes de un condominio
 * (plataforma). Genera una contraseña única por persona y la manda por correo.
 */
export function SendCredentialsDialog({
  condominioId,
  condominioName,
  onClose,
}: {
  condominioId: Id<"condominios">;
  condominioName: string;
  onClose: () => void;
}) {
  const resumen = useQuery(api.credenciales.resumen, { condominioId });
  const estadoEnvios = useQuery(api.credenciales.estadoEnvios, { condominioId });
  const iniciarEnvio = useMutation(api.credenciales.iniciarEnvio);
  const cancelarJob = useMutation(api.credenciales.cancelarJob);

  const [jobId, setJobId] = useState<Id<"envioCredencialesJobs"> | null>(null);
  const [modo, setModo] = useState<Modo>("solo_sin_clave");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si ya había un envío corriendo al abrir, seguimos ese job.
  const jobActivoId = estadoEnvios?.jobActivoId ?? null;
  useEffect(() => {
    if (jobId === null && jobActivoId) setJobId(jobActivoId);
  }, [jobId, jobActivoId]);

  const job = useQuery(api.credenciales.estadoJob, jobId ? { jobId } : "skip");
  const terminado = job != null && job.estado !== "en_curso";
  // Acotado a este envío: el historial global mezclaría tandas anteriores.
  const historial = useQuery(
    api.credenciales.historial,
    terminado && jobId ? { condominioId, jobId } : "skip",
  );

  const cargando = resumen === undefined;
  const sinDestinatarios = resumen != null && resumen.conEmail === 0;
  const confirmOk =
    modo !== "todos" || confirmText.trim().toUpperCase() === CONFIRM_WORD;

  async function start() {
    if (!confirmOk) return;
    setError(null);
    setBusy(true);
    try {
      const id = await iniciarEnvio({ condominioId, modo });
      setJobId(id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo iniciar el envío.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!jobId) return;
    setError(null);
    setCancelBusy(true);
    try {
      await cancelarJob({ jobId });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cancelar el envío.",
      );
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-labelledby="send-credentials-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-floating"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="send-credentials-title"
              className="text-base font-semibold text-foreground"
            >
              Enviar credenciales por correo
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {condominioName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {jobId ? (
            <ProgresoEnvio
              job={job}
              historial={historial}
              cancelBusy={cancelBusy}
              onCancel={cancel}
              error={error}
            />
          ) : cargando ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Miembros" value={resumen?.totalMiembros ?? 0} />
                <Metric label="Con correo" value={resumen?.conEmail ?? 0} />
                <Metric label="Sin correo" value={resumen?.sinEmail ?? 0} />
              </div>

              {estadoEnvios?.ultimoEnvioAt != null && (
                <p className="text-xs text-muted-foreground">
                  Último envío: {fechaLarga(estadoEnvios.ultimoEnvioAt)}
                </p>
              )}

              {resumen != null && resumen.sinEmail > 0 && (
                <div className="flex gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                    {resumen.sinEmail === 1
                      ? "1 miembro no tiene correo registrado y será omitido."
                      : `${resumen.sinEmail} miembros no tienen correo registrado y serán omitidos.`}{" "}
                    Regístrales el correo si necesitas que reciban sus datos de
                    acceso.
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  ¿A quién le envías?
                </p>
                <div className="space-y-2">
                  <ModoOption
                    checked={modo === "solo_sin_clave"}
                    onSelect={() => {
                      setModo("solo_sin_clave");
                      setConfirmText("");
                    }}
                    title="Solo quienes nunca han ingresado"
                    hint="Recomendado"
                    description="No toca la contraseña de quienes ya usan la plataforma."
                    disabled={busy}
                  />
                  <ModoOption
                    checked={modo === "todos"}
                    onSelect={() => setModo("todos")}
                    title="Todos (restablece la contraseña de todos)"
                    description="Invalida la contraseña actual de TODOS los residentes, incluidos los que ya ingresaron."
                    danger
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="flex gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  A cada persona se le genera una{" "}
                  <span className="font-medium text-foreground">
                    contraseña única
                  </span>{" "}
                  y se le envía por correo junto con el enlace de acceso. Nadie
                  más ve esa contraseña: si se pierde, hay que generarla de
                  nuevo.
                </p>
              </div>

              {modo === "todos" && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3">
                  <p className="text-xs leading-relaxed text-red-600 dark:text-red-400">
                    Esta acción cierra el acceso actual de{" "}
                    <span className="font-semibold">
                      {resumen?.conEmail ?? 0}
                    </span>{" "}
                    residentes hasta que abran su correo. Escribe{" "}
                    <span className="font-mono font-semibold">
                      {CONFIRM_WORD}
                    </span>{" "}
                    para habilitar el envío.
                  </p>
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={CONFIRM_WORD}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    className="mt-2.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>
              )}

              {sinDestinatarios && (
                <p className="text-sm text-muted-foreground">
                  No hay miembros con correo registrado en este condominio.
                </p>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={onClose}
                  disabled={busy}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="brand"
                  className="flex-1"
                  onClick={start}
                  disabled={busy || !confirmOk || sinDestinatarios}
                >
                  {busy
                    ? "Iniciando…"
                    : modo === "todos"
                      ? "Restablecer y enviar a todos"
                      : "Enviar credenciales"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgresoEnvio({
  job,
  historial,
  cancelBusy,
  onCancel,
  error,
}: {
  job:
    | {
        _id: Id<"envioCredencialesJobs">;
        estado: "en_curso" | "completado" | "cancelado";
        modo: string;
        total: number;
        procesados: number;
        enviados: number;
        fallidos: number;
        omitidos: number;
        iniciadoPorNombre: string;
        createdAt: number;
        updatedAt: number;
      }
    | null
    | undefined;
  historial:
    | Array<{
        _id: string;
        nombre: string;
        email: string;
        estado: EstadoEnvio;
        motivo?: string;
        createdAt: number;
      }>
    | undefined;
  cancelBusy: boolean;
  onCancel: () => void;
  error: string | null;
}) {
  if (job === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (job === null) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No se encontró el envío.
      </p>
    );
  }

  const enCurso = job.estado === "en_curso";
  const percent =
    job.total > 0
      ? Math.min(100, Math.round((job.procesados / job.total) * 100))
      : enCurso
        ? 0
        : 100;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {enCurso && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
            )}
            <p className="text-sm font-semibold text-foreground">
              {enCurso
                ? "Enviando credenciales…"
                : job.estado === "cancelado"
                  ? "Envío cancelado"
                  : "Envío completado"}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {job.modo === "todos"
              ? "Todos los residentes"
              : "Solo quienes nunca han ingresado"}{" "}
            · {job.iniciadoPorNombre} · {fechaLarga(job.createdAt)}
          </p>
        </div>
        <Badge
          tone={
            enCurso
              ? "info"
              : job.estado === "cancelado"
                ? "warning"
                : "success"
          }
        >
          {enCurso
            ? "En curso"
            : job.estado === "cancelado"
              ? "Cancelado"
              : "Completado"}
        </Badge>
      </div>

      <div className="space-y-1.5" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate tabular-nums">
            {job.procesados} de {job.total} procesados
          </span>
          <span className="shrink-0 font-medium tabular-nums text-foreground">
            {percent}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${Math.max(2, percent)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Enviados" value={job.enviados} />
        <Metric label="Fallidos" value={job.fallidos} />
        <Metric label="Omitidos" value={job.omitidos} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {enCurso ? (
        <>
          <p className="text-xs text-muted-foreground">
            Puedes cerrar esta ventana: el envío sigue en segundo plano.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={onCancel}
            disabled={cancelBusy}
          >
            {cancelBusy ? "Cancelando…" : "Cancelar envío"}
          </Button>
        </>
      ) : (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            Detalle del envío
          </p>
          {historial === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : historial.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Sin registros todavía.
              </p>
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border">
              {historial.map((h, i) => (
                <li
                  key={h._id}
                  className={
                    i > 0
                      ? "flex items-start gap-3 border-t border-border/60 px-3.5 py-2.5"
                      : "flex items-start gap-3 px-3.5 py-2.5"
                  }
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {h.nombre || h.email || "—"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {h.email || "Sin correo"} · {fechaCorta(h.createdAt)}
                    </p>
                    {h.estado !== "enviado" && h.motivo ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {h.motivo}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={ESTADO_TONE[h.estado]} className="shrink-0">
                    {ESTADO_LABEL[h.estado]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Se muestran los últimos 200 registros del condominio.
          </p>
        </div>
      )}
    </div>
  );
}

function ModoOption({
  checked,
  onSelect,
  title,
  hint,
  description,
  danger,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
  description: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
        checked
          ? danger
            ? "border-red-500/40 bg-red-500/5"
            : "border-brand bg-brand/5"
          : "border-border hover:bg-accent"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="radio"
        name="modo-envio-credenciales"
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 border-border accent-[var(--color-brand)]"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {hint ? <Badge tone="brand">{hint}</Badge> : null}
        </span>
        <span
          className={`mt-0.5 block text-xs leading-relaxed ${
            danger ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
          }`}
        >
          {description}
        </span>
      </span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
