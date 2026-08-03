/**
 * Vocabulario compartido de la sala de asamblea.
 *
 * Vive aparte porque hay DOS implementaciones de video —malla P2P y
 * servidor de medios— y ambas hablan este mismo idioma. Si los tipos
 * vivieran en una de ellas, la otra tendría que importarla y quedaría un
 * ciclo entre módulos que solo existe por dónde se guardó una interfaz.
 */

/**
 * Perfiles de calidad.
 *
 *   normal : caras nítidas, pantalla a 1080p — pocas personas
 *   ahorro : la audiencia necesita OÍR y leer el documento; las caras
 *            viven en un mosaico de 208 px y no merecen el ancho de banda
 */
export type Calidad = "normal" | "ahorro";

/** Los dos orígenes de video que la sala sabe pintar. */
export type Medio = "camara" | "pantalla";

/** Una emisión ajena, tal como la dibuja el escenario. */
export type EmisorRemoto = {
  clienteId: string;
  nombre: string;
  medio: Medio;
  /** El emisor deshabilitó su video: pintar avatar, no un cuadro negro. */
  camApagada: boolean;
  micApagado: boolean;
  stream: MediaStream | null;
  estado: "conectando" | "activo" | "lleno" | "fallo";
};

/** Lo que `EscenarioVideo` necesita, venga de donde venga el video. */
export type SalaVideo = {
  locales: { medio: Medio; stream: MediaStream }[];
  remotos: EmisorRemoto[];
  espectadores: number;
  tope: number;
  calidad: Calidad;
  encender: (medio: Medio) => Promise<void>;
  apagar: (medio: Medio) => Promise<void>;
  micOn: boolean;
  camOn: boolean;
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
  colgar: () => Promise<void>;
  transmitiendo: boolean;
};
