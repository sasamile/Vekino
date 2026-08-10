import { View, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withDelay,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { useEffect } from "react";
import { ASPAS, PUNTO, MARCA_VIEWBOX, MARCA_COLOR } from "@/lib/marca-vekino";
import { segundosDesdeArranque } from "@/lib/arranque";

/**
 * Animación de marca del arranque (variante "Revelado" del handoff).
 *
 * Se reproduce la pieza completa, pero en dos actos y NO en bucle:
 *
 *  1. Entrada + Pulso — el punto entra y desde él se revelan las aspas.
 *     Al terminar la marca queda armada, respirando mientras la app carga.
 *  2. Cierre — gira 114°, crece y se desvanece. Solo se dispara cuando la app
 *     ya está lista (`saliendo`), así el giro ES la transición de salida y la
 *     pantalla nunca se queda vacía esperando.
 *
 * El punto entra primero y las aspas se revelan detrás con una ventana
 * circular que crece DESDE EL PUNTO. Ojo: en la marca real el punto está
 * descentrado, así que la ventana se centra en él y no en el lienzo (el
 * prototipo asumía un punto centrado).
 */

/** Cuándo queda armada la marca (fin del acto 1). */
const ARMADA = 1.9;
const PULSO = 1.3;
/** Duración del acto 2. */
export const SALIDA_MS = 1100;

/** Centro y radio del punto como fracción del lienzo. */
const CX = PUNTO.cx / MARCA_VIEWBOX;
const CY = PUNTO.cy / MARCA_VIEWBOX;
const R_PUNTO = PUNTO.r / MARCA_VIEWBOX;
/** Alcanza la esquina más lejana desde el punto: revelado completo. */
const R_FINAL = 0.8;

function easeOutExpo(p: number): number {
  "worklet";
  return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
}

function easeInOutQuart(p: number): number {
  "worklet";
  return p < 0.5
    ? 8 * p * p * p * p
    : 1 - Math.pow(-2 * p + 2, 4) / 2;
}

/** Valor de una propiedad en el instante t, con su easing. */
function tramo(
  t: number,
  start: number,
  end: number,
  from: number,
  to: number,
  ease: (p: number) => number,
): number {
  "worklet";
  if (t <= start) return from;
  if (t >= end) return to;
  return from + (to - from) * ease((t - start) / (end - start));
}

export function SplashMarca({
  size = 220,
  saliendo = false,
}: {
  size?: number;
  /** Dispara el acto 2: giro, crecida y desvanecido. */
  saliendo?: boolean;
}) {
  const t = useSharedValue(0);
  const respira = useSharedValue(0);
  const salida = useSharedValue(0);

  useEffect(() => {
    if (!saliendo) return;
    salida.value = withTiming(1, {
      duration: SALIDA_MS,
      easing: Easing.linear,
    });
  }, [saliendo, salida]);

  useEffect(() => {
    // Arrancamos en el punto que corresponde al tiempo ya transcurrido desde
    // que la app abrió, no en cero: al arrancar el splash se monta dos veces
    // (ruta raíz → dentro de la app) y si cada instancia empezara de nuevo se
    // vería cortarse y repetirse.
    const yaVan = segundosDesdeArranque();
    const falta = Math.max(0, ARMADA - yaVan);

    t.value = Math.min(yaVan, ARMADA);
    if (falta > 0) {
      t.value = withTiming(ARMADA, {
        duration: falta * 1000,
        easing: Easing.linear,
      });
    }

    // Respiración suave una vez armada: señala que sigue trabajando sin
    // volver a reproducir la animación entera.
    respira.value = withDelay(
      falta * 1000,
      withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(t);
      cancelAnimation(respira);
    };
  }, [t, respira]);

  // Radio de la ventana circular, en píxeles.
  const radio = useDerivedValue(() =>
    tramo(t.value, 0.45, PULSO + 0.25, R_PUNTO, R_FINAL, easeOutExpo) * size,
  );

  const grupo = useAnimatedStyle(() => {
    const asentar = tramo(t.value, 0.45, PULSO + 0.4, 1.06, 1, easeInOutQuart);
    const deriva = tramo(t.value, 0.45, ARMADA, 0, 6, easeInOutQuart);
    // La ventana ya arranca del tamaño del punto, así que sin este velo se
    // alcanzaba a ver un trozo de aspa recortado antes de que el punto entrara.
    const aparecer = tramo(t.value, 0.1, 0.45, 0, 1, easeOutExpo);

    // Acto 2, sobre el progreso normalizado de la salida (0→1). Las
    // proporciones son las del handoff: el giro ocupa todo el tramo, la
    // crecida entra enseguida y el desvanecido va sobre el final.
    const s = salida.value;
    const giro = tramo(s, 0, 1, 0, 114, easeInOutQuart);
    const crecer = tramo(s, 0.08, 1, 1, 1.22, easeInOutQuart);
    const irse = tramo(s, 0.35, 0.96, 1, 0, easeInOutQuart);

    // Giro y crecida alrededor del PUNTO, no del centro de la caja: en esta
    // marca el punto está descentrado y con el eje al centro la pieza se veía
    // irse de lado. Se hace con traslaciones y NO con `transformOrigin`:
    // esa propiedad, junto a un transform animado, deja la vista sin dibujar.
    const ox = (CX - 0.5) * size;
    const oy = (CY - 0.5) * size;

    return {
      opacity: aparecer * irse,
      transform: [
        { translateX: ox },
        { translateY: oy },
        { rotate: `${deriva + giro}deg` },
        { scale: asentar * crecer * (1 + 0.03 * respira.value) },
        { translateX: -ox },
        { translateY: -oy },
      ],
    };
  });

  // Ventana circular: cuadrado de lado 2r con borderRadius r, centrado en el punto.
  const ventana = useAnimatedStyle(() => ({
    position: "absolute",
    left: CX * size - radio.value,
    top: CY * size - radio.value,
    width: radio.value * 2,
    height: radio.value * 2,
    borderRadius: radio.value,
    overflow: "hidden",
  }));

  // Compensa el desplazamiento de la ventana para que las aspas no se muevan.
  const aspasDentro = useAnimatedStyle(() => ({
    position: "absolute",
    left: radio.value - CX * size,
    top: radio.value - CY * size,
    width: size,
    height: size,
  }));

  const punto = useAnimatedStyle(() => ({
    opacity: tramo(t.value, 0.1, 0.45, 0, 1, easeOutExpo),
    transform: [{ scale: tramo(t.value, 0.1, 0.75, 0.35, 1, easeOutExpo) }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, grupo]}>
      <Animated.View style={ventana}>
        <Animated.View style={aspasDentro}>
          <Svg width={size} height={size} viewBox={`0 0 ${MARCA_VIEWBOX} ${MARCA_VIEWBOX}`}>
            {ASPAS.map((d, i) => (
              <Path key={i} d={d} fill={MARCA_COLOR} />
            ))}
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* El punto va aparte: entra antes que las aspas y con su propia escala.
          Su origen de escala es su centro, no el del lienzo. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transformOrigin: `${CX * size}px ${CY * size}px`,
          },
          punto,
        ]}
        pointerEvents="none"
      >
        <Svg width={size} height={size} viewBox={`0 0 ${MARCA_VIEWBOX} ${MARCA_VIEWBOX}`}>
          <Circle cx={PUNTO.cx} cy={PUNTO.cy} r={PUNTO.r} fill={MARCA_COLOR} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/** Pantalla completa de carga con la marca animada. */
export function SplashPantalla({
  background = "#FCFBFD",
  saliendo = false,
}: {
  background?: string;
  saliendo?: boolean;
}) {
  return (
    <View style={[styles.full, { backgroundColor: background }]}>
      <SplashMarca saliendo={saliendo} />
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
