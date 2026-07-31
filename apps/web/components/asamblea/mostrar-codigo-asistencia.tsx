"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { QRCodeSVG } from "qrcode.react";
import { Maximize2, RefreshCw, X } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  codigoActual,
  msRestantes,
  VENTANA_MS,
} from "@vekino/backend/codigoAsistencia";
import { cn } from "@/lib/utils";

/**
 * Modo presentación: el código que la administración proyecta en la reunión
 * virtual para que los propietarios registren su asistencia.
 *
 * El código se calcula AQUÍ, en el navegador, a partir de la semilla que solo
 * recibe el administrador. No se le pide al servidor cada segundo por una
 * razón concreta: una consulta de Convex se re-ejecuta cuando cambian los
 * datos, no con el paso del tiempo. Como el servidor valida con el mismo
 * algoritmo (`@vekino/backend/codigoAsistencia`), los dos lados siempre
 * coinciden.
 */
export function MostrarCodigoAsistencia({
  asambleaId,
  origen,
}: {
  asambleaId: Id<"asambleas">;
  /** Base para el enlace del QR. Normalmente `window.location.origin`. */
  origen?: string;
}) {
  const datos = useQuery(api.asambleas.semillaAsistencia, { asambleaId });
  const iniciar = useMutation(api.asambleas.iniciarCodigoAsistencia);
  const rotar = useMutation(api.asambleas.rotarCodigoAsistencia);

  const [ahora, setAhora] = useState(() => Date.now());
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reloj propio: es lo que hace avanzar el código y la cuenta atrás.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // La primera vez que se abre, crea la semilla.
  const sinSemilla = datos !== undefined && datos !== null && !datos.semilla;
  useEffect(() => {
    if (!sinSemilla) return;
    iniciar({ asambleaId }).catch((e) =>
      setError(e instanceof Error ? e.message : "No se pudo abrir el registro."),
    );
  }, [sinSemilla, iniciar, asambleaId]);

  // Salir de pantalla completa con Escape.
  useEffect(() => {
    if (!pantallaCompleta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPantallaCompleta(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pantallaCompleta]);

  if (datos === undefined) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }
  if (datos === null) {
    return (
      <p className="text-sm text-muted-foreground">
        No tienes permisos para mostrar el código de esta asamblea.
      </p>
    );
  }
  if (!datos.semilla) {
    return (
      <p className="text-sm text-muted-foreground">
        {error ?? "Abriendo el registro de asistencia…"}
      </p>
    );
  }

  const codigo = codigoActual(datos.semilla, ahora);
  const restanteMs = msRestantes(ahora);
  const segundos = Math.ceil(restanteMs / 1000);
  const pctRestante = (restanteMs / VENTANA_MS) * 100;

  const base = origen ?? (typeof window !== "undefined" ? window.location.origin : "");
  // El QR solo evita teclear: lleva al mismo formulario con el código puesto.
  const enlace = `${base}/asamblea/${asambleaId}?c=${codigo}`;

  const panel = (
    <div
      className={cn(
        "flex flex-col items-center gap-6 text-center",
        pantallaCompleta && "justify-center",
      )}
    >
      <div>
        <p
          className={cn(
            "font-semibold uppercase tracking-[0.2em] text-muted-foreground",
            pantallaCompleta ? "text-base" : "text-xs",
          )}
        >
          Código de asistencia
        </p>
        <p
          className={cn(
            "mt-2 font-bold tabular-nums tracking-[0.18em] text-foreground",
            // Tamaño pensado para leerse en una pantalla compartida.
            pantallaCompleta ? "text-[clamp(4rem,14vw,11rem)]" : "text-6xl",
          )}
        >
          {codigo}
        </p>
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-border">
        <QRCodeSVG
          value={enlace}
          size={pantallaCompleta ? 260 : 168}
          level="M"
          // Se regenera solo: `codigo` cambia cada minuto y va en el enlace.
          marginSize={0}
        />
      </div>

      {/* Cuenta atrás: deja claro que el código caduca */}
      <div className="w-full max-w-xs">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-200 ease-linear"
            style={{ width: `${pctRestante}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Cambia en {segundos} s
        </p>
      </div>

      <p
        className={cn(
          "max-w-md text-muted-foreground",
          pantallaCompleta ? "text-base" : "text-sm",
        )}
      >
        Los propietarios escriben este código —o escanean el QR— desde la app o
        el portal para registrar su asistencia.
      </p>
    </div>
  );

  if (pantallaCompleta) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background p-8">
        <button
          type="button"
          onClick={() => setPantallaCompleta(false)}
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Salir de pantalla completa"
        >
          <X className="h-6 w-6" />
        </button>
        <div className="flex flex-1 items-center justify-center">{panel}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {panel}

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => setPantallaCompleta(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Maximize2 className="h-4 w-4" /> Pantalla completa
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            rotar({ asambleaId }).catch((e) =>
              setError(
                e instanceof Error ? e.message : "No se pudo cambiar el código.",
              ),
            );
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Invalida todos los códigos anteriores"
        >
          <RefreshCw className="h-4 w-4" /> Cambiar código
        </button>
      </div>

      {error ? <p className="text-center text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
