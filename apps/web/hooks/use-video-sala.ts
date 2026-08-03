"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useSalaP2P } from "./use-sala-p2p";
import { useSalaLiveKit, type ConexionSala } from "./use-sala-livekit";
import type { Calidad, EmisorRemoto, Medio, SalaVideo } from "./sala-tipos";

export type { Calidad, EmisorRemoto, Medio, SalaVideo };

/**
 * Video de la sala. Dos motores, una sola interfaz.
 *
 *   servidor de medios  → quien habla sube UNA copia y el servidor reparte.
 *                         Es el camino de las asambleas de verdad: 250
 *                         personas no le caben a nadie en la subida de casa.
 *   malla punto a punto → respaldo cuando no hay servidor configurado.
 *                         Funciona bien hasta unas decenas y no cuesta nada.
 *
 * Cuál se usa lo decide el backend, no el navegador: `tokenSala` devuelve
 * `null` si no hay `LIVEKIT_URL` y ahí cae la malla. Así una instalación sin
 * servidor sigue teniendo video en vez de una pantalla en blanco.
 *
 * Los dos hooks se llaman SIEMPRE (son hooks), pero solo uno recibe
 * `activo: true`; el otro se queda inerte, sin queries ni conexiones.
 */
export function useVideoSala(
  asambleaId: Id<"asambleas">,
  activo: boolean,
  opts: { codigoPoder?: string; calidad?: Calidad } = {},
): SalaVideo & { motor: "sfu" | "malla" | "cargando" } {
  const pedirToken = useAction(api.salaToken.tokenSala);
  const [conexion, setConexion] = useState<ConexionSala | null>(null);
  const [resuelto, setResuelto] = useState(false);

  /* Se pide una vez por sala. El token dura seis horas: más que la asamblea
   * más larga, así que no hace falta renovarlo en pleno acto.
   *
   * Sin función de limpieza a propósito. Una limpieza corre en CADA cambio de
   * dependencias, no solo al desmontar, y si cancelara la petición en vuelo el
   * token llegaría a la basura: la sala se quedaba sin servidor de medios y
   * sin malla, con pinta de estar bien. La cancelación real se decide
   * comparando contra `pedido.current`, que solo cambia si cambia la sala.
   */
  const pedido = useRef<string | null>(null);
  useEffect(() => {
    if (!activo) {
      pedido.current = null;
      setConexion(null);
      setResuelto(false);
      return;
    }
    const clave = asambleaId as string;
    if (pedido.current === clave) return;
    pedido.current = clave;

    void (async () => {
      /* La sesión de Convex puede no haber llegado al backend cuando se monta
       * la sala. Un solo intento fallido dejaba la asamblea entera en malla
       * hasta recargar, así que se reintenta con espera creciente. */
      for (let intento = 0; intento < 5; intento++) {
        try {
          const r = await pedirToken({ asambleaId });
          if (pedido.current !== clave) return;
          setConexion(r);
          setResuelto(true);
          return;
        } catch {
          if (pedido.current !== clave) return;
          await new Promise((r) => setTimeout(r, 400 * (intento + 1)));
        }
      }
      // Sin token se sigue por la malla: es degradación, no falla.
      if (pedido.current !== clave) return;
      setConexion(null);
      setResuelto(true);
    })();
  }, [activo, asambleaId, pedirToken]);

  const usarSfu = resuelto && conexion !== null;
  const usarMalla = resuelto && conexion === null;

  const sfu = useSalaLiveKit(usarSfu ? conexion : null, usarSfu, {
    calidad: opts.calidad,
  });
  const malla = useSalaP2P(asambleaId, activo && usarMalla, opts);

  if (!resuelto) {
    return { ...VACIO, calidad: opts.calidad ?? "normal", motor: "cargando" };
  }
  return usarSfu ? { ...sfu, motor: "sfu" } : { ...malla, motor: "malla" };
}

/** Sala inerte mientras se resuelve qué motor toca: nada que pintar. */
const VACIO: SalaVideo = {
  locales: [],
  remotos: [],
  audios: [],
  audioBloqueado: false,
  desbloquearAudio: async () => {},
  espectadores: 0,
  tope: 0,
  calidad: "normal",
  encender: async () => {},
  apagar: async () => {},
  micOn: false,
  camOn: false,
  toggleMic: async () => {},
  toggleCam: async () => {},
  colgar: async () => {},
  transmitiendo: false,
};
