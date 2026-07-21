import { View, Text, Pressable, StyleSheet, ActivityIndicator, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { C } from "@/lib/theme";

/**
 * Liquid glass: BlurView + highlight border + fill translúcido.
 * Solo para superficies auth / CTAs — no mezclar con UI de producto densa.
 */

export function GlassSurface({
  children,
  style,
  intensity = 48,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
}) {
  return (
    <View style={[styles.surfaceOuter, style]}>
      <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.surfaceSheen} pointerEvents="none" />
      <View style={styles.surfaceInner}>{children}</View>
    </View>
  );
}

export function GlassPrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btnOuter,
        { opacity: disabled || loading ? 0.65 : pressed ? 0.92 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.btnFill} />
      <View style={styles.btnHighlight} pointerEvents="none" />
      <View style={styles.btnContent}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnLabel}>{label}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surfaceOuter: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    backgroundColor: "rgba(255,255,255,0.28)",
    shadowColor: "#042046",
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  surfaceSheen: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  surfaceInner: {
    padding: 24,
    gap: 20,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  btnOuter: {
    height: 52,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    shadowColor: C.brand,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  btnFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(242,106,58,0.88)",
  },
  btnHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "48%",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  btnContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  btnLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
});
