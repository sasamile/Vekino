"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";

/**
 * Latido de sala para el apoderado (acceso por código, sin cuenta).
 * Presencia (Meet) + sesiones de unidad si ya registró asistencia.
 *
 * Gemelo de `use-sala-latido.ts` (residente con cuenta). Lo que se cambie en
 * uno va en el otro: son el mismo pulso sobre las mismas dos tablas.
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
  latidoRef.current = latido;
  salirRef.current = salir;
  latidoPresenciaRef.current = latidoPresencia;
  salirPresenciaRef.current = salirPresencia;

  /* ── El pulso ─────────────────────────────────────────────────────────
   *
   * Sin salida en la limpieza, a propósito. Una limpieza corre en CADA
   * cambio de dependencias —no solo al desmontar—, así que cualquier
   * variación de `debeLatir` (registrar asistencia, por ejemplo) sacaba al
   * apoderado de la sala y lo volvía a meter. */
  useEffect(() => {
    if (!codigo || (!debeLatir && !debeLatirPresencia)) return;

    let vivo = true;
    const enviar = () => {
      if (!vivo) return;
      if (debeLatirPresencia) {
        void latidoPresenciaRef.current({ codigo }).catch(() => {});
      }
      if (debeLatir) {
        void latidoRef.current({ codigo }).catch(() => {});
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
  }, [codigo, debeLatir, debeLatirPresencia, intervaloMs]);

  /* ── La salida ────────────────────────────────────────────────────────
   *
   * Solo al salirse de la sala de verdad: desmontar `SalaApoderado` (el botón
   * rojo navega a `/apoderado`) o cambiar de código. Ya NO se sale en
   * `pagehide`.
   *
   * `pagehide` se dispara al bloquear el teléfono o cambiar de aplicación, y
   * eso no es irse: el apoderado apaga la pantalla y sigue escuchando.
   * Tratarlo como salida cerraba las sesiones de TODAS sus unidades
   * (`cerrarSesionesUnidad` → patch de `asambleaSesiones` + bitácora), borraba
   * la presencia (`borrarPresencia` → delete de `salaPresencias` + bitácora),
   * y al desbloquear `latidoConCodigo` rehacía las dos cosas con inserts. Las
   * dos tablas son justo las que lee `salaEnVivo`, suscrita por toda la
   * asamblea: cuatro escrituras por bloqueo de pantalla × 173 suscriptores.
   * Con un apoderado de dos unidades bloqueando el móvil diez veces son miles
   * de idas y venidas falsas — y de paso el quórum proyectado bajaba mientras
   * la persona seguía en la reunión.
   *
   * Quien de verdad se va deja de latir, y el cron `cerrarSesionesInactivas`
   * lo cierra a los 90 s fechando la salida en su último pulso
   * (`asambleaSala.ts:699`) — o sea, la permanencia y el quórum salen igual de
   * exactos, con una sola escritura en vez de miles.
   */
  const salidaRef = useRef({ debeLatir, debeLatirPresencia });
  salidaRef.current = { debeLatir, debeLatirPresencia };

  useEffect(() => {
    if (!codigo) return;
    /* El código de ESTE efecto, no el del render actual: si cambia, hay que
     * cerrar el anterior. */
    const codigoSalida = codigo;
    return () => {
      const { debeLatir: d, debeLatirPresencia: p } = salidaRef.current;
      if (d) void salirRef.current({ codigo: codigoSalida }).catch(() => {});
      if (p) {
        void salirPresenciaRef
          .current({ codigo: codigoSalida })
          .catch(() => {});
      }
    };
  }, [codigo]);

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
