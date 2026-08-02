"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";

/**
 * Latido de sala para el apoderado (acceso por código, sin cuenta).
 * Misma lógica que `useSalaLatido`, pero autenticado con el código del poder.
 */
export function useSalaLatidoApoderado(codigo: string | null) {
  const sala = useQuery(
    api.asambleaSala.miSalaConCodigo,
    codigo ? { codigo } : "skip",
  );
  const latido = useMutation(api.asambleaSala.latidoConCodigo);
  const salir = useMutation(api.asambleaSala.salirDeSalaConCodigo);

  const debeLatir = !!sala?.debeLatir;
  const intervaloMs = sala?.latidoMs ?? 30_000;

  const latidoRef = useRef(latido);
  const salirRef = useRef(salir);
  const codigoRef = useRef(codigo);
  latidoRef.current = latido;
  salirRef.current = salir;
  codigoRef.current = codigo;

  useEffect(() => {
    if (!codigo || !debeLatir) return;

    let vivo = true;
    const enviar = () => {
      if (!vivo || !codigoRef.current) return;
      void latidoRef.current({ codigo: codigoRef.current }).catch(() => {});
    };

    enviar();
    const id = setInterval(enviar, intervaloMs);

    const onVisibilidad = () => {
      if (document.visibilityState === "visible") enviar();
    };
    const onSalida = () => {
      if (!codigoRef.current) return;
      void salirRef.current({ codigo: codigoRef.current }).catch(() => {});
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
  }, [codigo, debeLatir, intervaloMs]);

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
