"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";

/** Latido de presencia para invitados (sin asistencia ni quórum). */
export function useSalaLatidoInvitado(sesionCodigo: string | null) {
  const sala = useQuery(
    api.asambleaInvitados.miSalaInvitado,
    sesionCodigo ? { sesionCodigo } : "skip",
  );
  const latidoPresencia = useMutation(
    api.asambleaInvitados.latidoPresenciaInvitado,
  );
  const salirPresencia = useMutation(
    api.asambleaInvitados.salirPresenciaInvitado,
  );

  const debeLatirPresencia = !!sala?.debeLatirPresencia;
  const intervaloMs = sala?.latidoMs ?? 30_000;

  const latidoRef = useRef(latidoPresencia);
  const salirRef = useRef(salirPresencia);
  const codigoRef = useRef(sesionCodigo);
  latidoRef.current = latidoPresencia;
  salirRef.current = salirPresencia;
  codigoRef.current = sesionCodigo;

  useEffect(() => {
    if (!sesionCodigo || !debeLatirPresencia) return;

    let vivo = true;
    const enviar = () => {
      if (!vivo || !codigoRef.current) return;
      void latidoRef.current({ sesionCodigo: codigoRef.current }).catch(() => {});
    };

    enviar();
    const id = setInterval(enviar, intervaloMs);

    const onVisibilidad = () => {
      if (document.visibilityState === "visible") enviar();
    };
    const onSalida = () => {
      if (!codigoRef.current) return;
      void salirRef.current({ sesionCodigo: codigoRef.current }).catch(() => {});
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
  }, [sesionCodigo, debeLatirPresencia, intervaloMs]);

  return {
    cargando: sala === undefined,
    enCurso: !!sala?.enCurso,
    conectado: !!sala?.debeLatirPresencia,
    tienePalabra: !!sala?.tienePalabra,
    estadoPalabra: sala?.estadoPalabra ?? null,
    cierraEn: sala?.cierraEn ?? null,
    nombre: sala?.nombre ?? null,
    asambleaId: sala?.asambleaId ?? null,
    personas: sala?.personas ?? [],
    personasEnSala: sala?.personasEnSala ?? 0,
  };
}
