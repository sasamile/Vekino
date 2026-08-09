"use client";

import { useCallback, useMemo } from "react";
import type { Id } from "@vekino/backend/dataModel";
import { useSalaCloudflare } from "./use-sala-cloudflare";
import type { Calidad, EmisorRemoto, Medio, SalaVideo } from "./sala-tipos";

/**
 * El motor de Cloudflare, hablando el idioma de la sala.
 *
 * `useSalaCloudflare` piensa en pistas —que es como piensa un SFU— y el
 * escenario piensa en personas que encienden y apagan cosas. Este archivo es
 * la traducción entre los dos, y existe para que meter un motor nuevo NO
 * obligue a tocar el escenario: la sala real ya funciona, y reescribirla para
 * estrenar un repetidor de medios sería cambiar dos cosas a la vez.
 */
export function useSalaCloudflareVideo(
  asambleaId: Id<"asambleas">,
  activo: boolean,
  calidad: Calidad,
): SalaVideo {
  const sala = useSalaCloudflare(asambleaId, activo);

  /* Una pista de vídeo es una persona con cámara o una pantalla compartida;
   * quien solo habla no aparece aquí — su voz va por `audios`. Si el sonido
   * dependiera de que hubiera algo que pintar, en una asamblea, donde casi
   * nadie enciende la cámara, no se oiría a nadie. */
  const remotos: EmisorRemoto[] = useMemo(
    () =>
      sala.remotas
        .filter((r) => r.tipo !== "audio")
        .map((r) => ({
          clienteId: r.trackName,
          nombre: r.nombre || "Participante",
          medio: (r.tipo === "pantalla" ? "pantalla" : "camara") as Medio,
          camApagada: false,
          /* El SFU no dice si alguien está silenciado: si su pista de vídeo
           * está aquí, está emitiendo. El estado del micrófono se pinta desde
           * la lista de la sala, que sí lo sabe. */
          micApagado: false,
          stream: r.stream,
          estado: "activo" as const,
        })),
    [sala.remotas],
  );

  const audios = useMemo(
    () =>
      sala.remotas
        .filter((r) => r.tipo === "audio")
        .map((r) => ({ id: r.trackName, stream: r.stream })),
    [sala.remotas],
  );

  const encender = useCallback(
    async (medio: Medio) => {
      if (medio === "pantalla") await sala.compartirPantalla();
      else await sala.encenderCam();
    },
    [sala],
  );

  const apagar = useCallback(
    async (medio: Medio) => {
      if (medio === "pantalla") await sala.dejarDeCompartir();
      else await sala.apagarCam();
    },
    [sala],
  );

  const toggleMic = useCallback(async () => {
    if (sala.micOn) await sala.apagarMic();
    else await sala.encenderMic();
  }, [sala]);

  const toggleCam = useCallback(async () => {
    if (sala.camOn) await sala.apagarCam();
    else await sala.encenderCam();
  }, [sala]);

  const colgar = useCallback(async () => {
    await sala.apagarMic();
    await sala.apagarCam();
    if (sala.compartiendo) await sala.dejarDeCompartir();
  }, [sala]);

  return {
    locales: sala.locales,
    remotos,
    audios,
    audioBloqueado: sala.audioBloqueado,
    desbloquearAudio: sala.desbloquearAudio,
    /* `tope: 0` significa «sin tope», y el escenario esconde el contador. No
     * es dejadez: la gracia de un SFU es justamente que no hay un número a
     * partir del cual la sala se llena, así que avisar de algo que no va a
     * pasar solo asusta a quien preside. */
    espectadores: remotos.length + audios.length,
    tope: 0,
    calidad,
    encender,
    apagar,
    micOn: sala.micOn,
    camOn: sala.camOn,
    toggleMic,
    toggleCam,
    colgar,
    transmitiendo: sala.micOn || sala.camOn || sala.compartiendo,
  };
}
