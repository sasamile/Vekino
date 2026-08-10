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

  /* ── El pulso ─────────────────────────────────────────────────────────
   *
   * Sin salida en la limpieza, a propósito. Antes esta función llamaba a
   * `salirDeSala`, y como una limpieza corre en CADA cambio de dependencias
   * —no solo al desmontar— cualquier variación de `latidoMs` o de `debeLatir`
   * expulsaba a la persona de la sala y la volvía a meter. */
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

    /* Al volver del bloqueo de pantalla se late enseguida en vez de esperar
     * al siguiente intervalo: si la sesión sigue abierta, este pulso no
     * despierta a nadie —vive en `salaLatidos`— y evita que el cron la cierre
     * por unos segundos de retraso. */
    const onVisibilidad = () => {
      if (document.visibilityState === "visible") enviar();
    };
    document.addEventListener("visibilitychange", onVisibilidad);

    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilidad);
    };
  }, [asambleaId, debeLatir, debeLatirPresencia, intervaloMs]);

  /* ── La salida ────────────────────────────────────────────────────────
   *
   * Solo al salirse de la sala de verdad. Ya NO se sale en `pagehide`.
   *
   * `pagehide` se dispara al bloquear el teléfono o cambiar de aplicación, y
   * eso no es irse: en una asamblea la gente apaga la pantalla y sigue
   * escuchando. Tratarlo como salida cerraba la sesión, bajaba el quórum,
   * escribía bitácora y borraba la presencia — y al desbloquear rehacía las
   * cuatro cosas. Cada una de esas escrituras reejecuta `salaEnVivo` en TODOS
   * los conectados, y esa consulta devuelve unos 40 KB. Con 173 personas
   * mirando el móvil cada tanto son miles de idas y venidas falsas: decenas
   * de gigabytes por una pantalla que se apaga.
   *
   * Quien de verdad se va deja de latir, y el cron `cerrarSesionesInactivas`
   * lo cierra a los 90 segundos fechando la salida en su último pulso — o
   * sea, la permanencia y el quórum salen igual de exactos, con una sola
   * escritura en vez de miles.
   */
  const salidaRef = useRef({ debeLatir, debeLatirPresencia });
  salidaRef.current = { debeLatir, debeLatirPresencia };

  useEffect(() => {
    if (!asambleaId) return;
    return () => {
      const { debeLatir: d, debeLatirPresencia: p } = salidaRef.current;
      if (d) void salirRef.current({ asambleaId }).catch(() => {});
      if (p) void salirPresenciaRef.current({ asambleaId }).catch(() => {});
    };
  }, [asambleaId]);

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
