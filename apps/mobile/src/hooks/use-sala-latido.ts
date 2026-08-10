import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

/**
 * Mantiene viva la conexión del residente mientras está en la sala.
 *
 * Es el mismo contrato que `apps/web/hooks/use-sala-latido.ts`: presencia
 * (quiénes están) + sesiones por unidad (permanencia y quórum). Cambia el
 * idioma de los eventos — aquí no hay `visibilitychange`, hay `AppState`.
 *
 * Y hereda la lección que en la web costó gigabytes: **irse a segundo plano
 * NO es salirse.** En una asamblea la gente bloquea el teléfono y sigue
 * escuchando (en iOS el audio continúa). Aquí no se llama a `salirDeSala`
 * jamás por eventos del sistema: quien de verdad se va deja de latir, y el
 * cron lo cierra a los 90 segundos fechando la salida en su último pulso.
 * El quórum sale igual de exacto sin las miles de idas y venidas falsas.
 *
 * Al VOLVER a primer plano se late de inmediato: si el sistema congeló la
 * app más de 90 s el cron ya la cerró, y ese pulso reabre la sesión sin que
 * la persona note nada.
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

    const sub = AppState.addEventListener("change", (estado) => {
      if (estado === "active") enviar();
    });

    return () => {
      vivo = false;
      clearInterval(id);
      sub.remove();
    };
  }, [asambleaId, debeLatir, debeLatirPresencia, intervaloMs]);

  /* La salida, SOLO al desmontar la pantalla de la sala — o sea, cuando la
   * persona salió de verdad con el botón o navegando atrás. */
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
