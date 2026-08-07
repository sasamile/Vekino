"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";

/**
 * Latido de sala para el apoderado (acceso por código, sin cuenta).
 * Presencia (Meet) + sesiones de unidad si ya registró asistencia.
 */
export function useSalaLatidoApoderado(codigo: string | null) {
  const sala = useQuery(
    api.asambleaSala.miSalaConCodigo,
    codigo ? { codigo } : "skip",
  );
  const latido = useMutation(api.asambleaSala.latidoConCodigo);
  const salir = useMutation(api.asambleaSala.salirDeSalaConCodigo);
  const latidoPresencia = useMutation(api.asambleaSala.latidoPresenciaConCodigo);
  const salirPresencia = useMutation(api.asambleaSala.salirPresenciaConCodigo);

  const debeLatir = !!sala?.debeLatir;
  const debeLatirPresencia = !!sala?.debeLatirPresencia;
  const intervaloMs = sala?.latidoMs ?? 30_000;

  const latidoRef = useRef(latido);
  const salirRef = useRef(salir);
  const latidoPresenciaRef = useRef(latidoPresencia);
  const salirPresenciaRef = useRef(salirPresencia);
  const codigoRef = useRef(codigo);
  latidoRef.current = latido;
  salirRef.current = salir;
  latidoPresenciaRef.current = latidoPresencia;
  salirPresenciaRef.current = salirPresencia;
  codigoRef.current = codigo;

  useEffect(() => {
    if (!codigo || (!debeLatir && !debeLatirPresencia)) return;

    let vivo = true;
    const enviar = () => {
      if (!vivo || !codigoRef.current) return;
      if (debeLatirPresencia) {
        void latidoPresenciaRef
          .current({ codigo: codigoRef.current })
          .catch(() => {});
      }
      if (debeLatir) {
        void latidoRef.current({ codigo: codigoRef.current }).catch(() => {});
      }
    };

    enviar();
    const id = setInterval(enviar, intervaloMs);

    const onVisibilidad = () => {
      if (document.visibilityState === "visible") enviar();
    };
    const onSalida = () => {
      if (!codigoRef.current) return;
      if (debeLatir) {
        void salirRef.current({ codigo: codigoRef.current }).catch(() => {});
      }
      if (debeLatirPresencia) {
        void salirPresenciaRef
          .current({ codigo: codigoRef.current })
          .catch(() => {});
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
  }, [codigo, debeLatir, debeLatirPresencia, intervaloMs]);

  return {
    cargando: sala === undefined,
    registrado: !!sala?.registrado,
    enCurso: !!sala?.enCurso,
    conectado: (sala?.unidadesConectadas ?? 0) > 0 || !!sala?.debeLatirPresencia,
    unidades: sala?.unidades ?? 0,
    unidadesConectadas: sala?.unidadesConectadas ?? 0,
    exigeConexionParaVotar: !!sala?.exigeConexionParaVotar,
    personas: sala?.personas ?? [],
    personasEnSala: sala?.personasEnSala ?? 0,
    tienePalabra: !!sala?.tienePalabra,
    estadoPalabra: sala?.estadoPalabra ?? null,
    cierraEn: sala?.cierraEn ?? null,
  };
}
