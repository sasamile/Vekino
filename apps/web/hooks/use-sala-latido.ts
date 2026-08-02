"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

/**
 * Mantiene viva la conexión del residente a la sala de la asamblea.
 *
 * El backend cierra por inactividad a los 90 s (3 latidos perdidos), así que
 * aquí late cada 30 s. Tres detalles que no son evidentes:
 *
 * 1. **Pestaña oculta**: `setInterval` se estrangula a ~1 vez por minuto en
 *    segundo plano. Por eso, además del intervalo, late al volver a la
 *    pestaña (`visibilitychange`) — si no, quien mira otra ventana un rato
 *    aparecería como desconectado justo cuando se abre una votación.
 *
 * 2. **Cerrar la pestaña**: `sendBeacon` no sirve aquí porque la mutación va
 *    firmada por el cliente de Convex. Se intenta `salirDeSala` en
 *    `pagehidden` y, si no alcanza a salir, el cron lo cierra solo. La
 *    permanencia se corta en el ÚLTIMO LATIDO real, no cuando el cron se
 *    entera, así que no se regalan minutos.
 *
 * 3. **Solo late si hay algo que latir**: sin asamblea en curso o sin
 *    asistencia registrada, no monta ningún intervalo.
 */
export function useSalaLatido(asambleaId: Id<"asambleas"> | null) {
  const sala = useQuery(
    api.asambleaSala.miSala,
    asambleaId ? { asambleaId } : "skip",
  );
  const latido = useMutation(api.asambleaSala.latido);
  const salir = useMutation(api.asambleaSala.salirDeSala);

  const debeLatir = !!sala?.debeLatir;
  const intervaloMs = sala?.latidoMs ?? 30_000;

  // Refs para no re-montar el efecto en cada render de Convex.
  const latidoRef = useRef(latido);
  const salirRef = useRef(salir);
  latidoRef.current = latido;
  salirRef.current = salir;

  useEffect(() => {
    if (!asambleaId || !debeLatir) return;

    let vivo = true;
    const enviar = () => {
      if (!vivo) return;
      // Un latido perdido no es un error que mostrarle a nadie: el siguiente
      // llega en 30 s y el corte tolera dos fallos seguidos.
      void latidoRef.current({ asambleaId }).catch(() => {});
    };

    enviar();
    const id = setInterval(enviar, intervaloMs);

    const onVisibilidad = () => {
      if (document.visibilityState === "visible") enviar();
    };
    const onSalida = () => {
      void salirRef.current({ asambleaId }).catch(() => {});
    };

    document.addEventListener("visibilitychange", onVisibilidad);
    window.addEventListener("pagehide", onSalida);

    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilidad);
      window.removeEventListener("pagehide", onSalida);
      /* Al desmontar (navegar a otra pantalla de la app) también se sale.
       * Si el residente vuelve, el propio `latido` reabre un tramo nuevo. */
      onSalida();
    };
  }, [asambleaId, debeLatir, intervaloMs]);

  return {
    cargando: sala === undefined,
    registrado: !!sala?.registrado,
    enCurso: !!sala?.enCurso,
    conectado: (sala?.unidadesConectadas ?? 0) > 0,
    unidades: sala?.unidades ?? 0,
    unidadesConectadas: sala?.unidadesConectadas ?? 0,
    exigeConexionParaVotar: !!sala?.exigeConexionParaVotar,
  };
}
