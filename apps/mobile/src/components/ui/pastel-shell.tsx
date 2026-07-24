import { View, StyleSheet, useWindowDimensions, type ViewStyle } from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, { Defs, RadialGradient, Stop, Ellipse } from "react-native-svg";
import { SoftUI } from "@/lib/soft-ui";

type GlowColors = {
  left: string;
  right: string;
  top?: string;
};

/**
 * Fondo + glow ambiental difuminado (blur radial).
 * Burbujas inferiores solo cuando hay navbar (detrás del glass).
 */
export function PastelShell({
  children,
  tone = "white",
  glows,
  bottomGlows = true,
}: {
  children: React.ReactNode;
  tone?: "white" | "mist";
  glows?: GlowColors;
  /** false = ocultar burbujas inferiores (pantallas sin tab bar). */
  bottomGlows?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const navGlowH = 124;
  const navGlowW = Math.min(300, width * 0.68);
  const bg = tone === "mist" ? "#F5F6F8" : "#FFFFFF";

  const left = glows?.left ?? SoftUI.brandLight;
  const right = glows?.right ?? "#FFB08A";
  const top = glows?.top ?? SoftUI.brandSoft;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar style="dark" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} />

      <View pointerEvents="none" style={styles.glowLayer}>
        {bottomGlows ? (
          <>
            <SoftGlow
              id="nav-left"
              width={navGlowW}
              height={navGlowH}
              color={left}
              style={{ left: -navGlowW * 0.3, bottom: -navGlowH * 0.2 }}
            />
            <SoftGlow
              id="nav-right"
              width={navGlowW}
              height={navGlowH}
              color={right}
              style={{ right: -navGlowW * 0.3, bottom: -navGlowH * 0.16 }}
            />
          </>
        ) : null}
        <SoftGlow
          id="top"
          width={width * 0.45}
          height={96}
          color={top}
          opacity={0.55}
          style={{ right: -width * 0.1, top: height * 0.1 }}
        />
      </View>

      <View style={styles.content} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

/**
 * Glow con blur radial real (SVG).
 * Coordenadas numéricas + userSpaceOnUse evitan el crash de iOS
 * (painterName nil con porcentajes).
 */
function SoftGlow({
  id,
  width,
  height,
  color,
  style,
  opacity = 1,
}: {
  id: string;
  width: number;
  height: number;
  color: string;
  style: ViewStyle;
  opacity?: number;
}) {
  const gradId = `blur-${id}`;
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;

  return (
    <View
      pointerEvents="none"
      style={[{ position: "absolute", width, height, opacity }, style]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient
            id={gradId}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fx={cx}
            fy={cy}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset={0} stopColor={color} stopOpacity={0.9} />
            <Stop offset={0.35} stopColor={color} stopOpacity={0.55} />
            <Stop offset={0.62} stopColor={color} stopOpacity={0.22} />
            <Stop offset={0.82} stopColor={color} stopOpacity={0.07} />
            <Stop offset={1} stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${gradId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  glowLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  content: {
    flex: 1,
    zIndex: 1,
    position: "relative",
  },
});
