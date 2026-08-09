import { View, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { useEffect } from "react";
import { ASPAS, PUNTO, MARCA_VIEWBOX, MARCA_COLOR } from "@/lib/marca-vekino";

/**
 * Animación de marca del arranque (variante "Revelado" del handoff).
 *
 * Toda la pieza es una función pura del tiempo: un reloj de 0→3.6 s en bucle
 * y cada propiedad se deriva de él, igual que en el prototipo. Las secciones
 * son Entrada (0–1.3 s), Pulso (1.3–2.3 s) y Cierre (2.3–3.6 s); termina y
 * empieza en opacidad 0, así el bucle no se nota.
 *
 * El punto entra primero y las aspas se revelan detrás con una ventana
 * circular que crece DESDE EL PUNTO. Ojo: en la marca real el punto está
 * descentrado, así que la ventana se centra en él y no en el lienzo (el
 * prototipo asumía un punto centrado).
 */

const TOTAL = 3.6;
const CIERRE = 2.3;
const PULSO = 1.3;

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

export function SplashMarca({ size = 220 }: { size?: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(
      withTiming(TOTAL, { duration: TOTAL * 1000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [t]);

  // Radio de la ventana circular, en píxeles.
  const radio = useDerivedValue(() =>
    tramo(t.value, 0.45, PULSO + 0.25, R_PUNTO, R_FINAL, easeOutExpo) * size,
  );

  const grupo = useAnimatedStyle(() => {
    const asentar = tramo(t.value, 0.45, PULSO + 0.4, 1.06, 1, easeInOutQuart);
    const crecer = tramo(t.value, CIERRE + 0.1, TOTAL, 1, 1.22, easeInOutQuart);
    const deriva = tramo(t.value, 0.45, CIERRE, 0, 6, easeInOutQuart);
    const giro = tramo(t.value, CIERRE - 0.1, TOTAL - 0.1, 0, 114, easeInOutQuart);
    return {
      opacity: tramo(t.value, CIERRE + 0.45, TOTAL - 0.05, 1, 0, easeInOutQuart),
      transform: [
        { rotate: `${deriva + giro}deg` },
        { scale: asentar * crecer },
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
export function SplashPantalla({ background = "#FCFBFD" }: { background?: string }) {
  return (
    <View style={[styles.full, { backgroundColor: background }]}>
      <SplashMarca />
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
