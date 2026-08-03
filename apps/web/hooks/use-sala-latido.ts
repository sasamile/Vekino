"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

/**
 * Mantiene viva la conexión del residente SOLO mientras está dentro de `/sala`.
 *
 * - **Presencia** (personas en la pestaña, estilo Meet): late siempre si la
 *   asamblea está en curso — también la mesa sin unidades.
 * - **Sesiones por unidad** (permanencia / quórum): solo si ya registró
 *   asistencia (`debeLatir`).
 *
 * No usar en la ficha de la asamblea (`IndicadorSala`): ahí solo se consulta
 * el estado.
 */
export function useSalaLatido(asambleaId: Id<"asambleas"> | null) {
  const sala = useQuery(
    api.asambleaSala.miSala,
    asambleaId ? { asambleaId } : "skip",
  );
  const latido = useMutation(api.asambleaSala.latido);
  const salir = useMutation(api.asambleaSala.salirDeSala);
  const latidoPresencia = useMutation(api.asambleaSala.latidoPresencia);
  const salirPresencia = useMutation(api.asambleaSala.salirPresencia);

  const debeLatir = !!sala?.debeLatir;
  const debeLatirPresencia = !!sala?.debeLatirPresencia;
  const intervaloMs = sala?.latidoMs ?? 30_000;

  const latidoRef = useRef(latido);
  const salirRef = useRef(salir);
  const latidoPresenciaRef = useRef(latidoPresencia);
  const salirPresenciaRef = useRef(salirPresencia);
  latidoRef.current = latido;
  salirRef.current = salir;
  latidoPresenciaRef.current = latidoPresencia;
  salirPresenciaRef.current = salirPresencia;

  useEffect(() => {
    if (!asambleaId || (!debeLatir && !debeLatirPresencia)) return;

    let vivo = true;
    const enviar = () => {
      if (!vivo) return;
      if (debeLatirPresencia) {
        void latidoPresenciaRef.current({ asambleaId }).catch(() => {});
      }
      if (debeLatir) {
        void latidoRef.current({ asambleaId }).catch(() => {});
      }
    };

    enviar();
    const id = setInterval(enviar, intervaloMs);

    const onVisibilidad = () => {
      if (document.visibilityState === "visible") enviar();
    };
    const onSalida = () => {
      if (debeLatir) void salirRef.current({ asambleaId }).catch(() => {});
      if (debeLatirPresencia) {
        void salirPresenciaRef.current({ asambleaId }).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", onVisibilidad);
    window.addEventListener("pagehide", onSalida);

    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilidad);
      window.removeEventListener("pagehide", onSalida);
      onSalida();
    };
  }, [asambleaId, debeLatir, debeLatirPresencia, intervaloMs]);

  return {
    cargando: sala === undefined,
    registrado: !!sala?.registrado,
    esMesa: !!sala?.esMesa,
    enCurso: !!sala?.enCurso,
    conectado: (sala?.unidadesConectadas ?? 0) > 0 || !!sala?.esMesa,
    unidades: sala?.unidades ?? 0,
    unidadesConectadas: sala?.unidadesConectadas ?? 0,
    exigeConexionParaVotar: !!sala?.exigeConexionParaVotar,
  };
}
