import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { C } from "@/lib/theme";

/**
 * CTA con profundidad (gradiente + highlight).
 * View + onTouchEnd — no Pressable (NativeWind lo rompía).
 */
export function AuthPrimaryButton({
  label,
  onPress,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <View
      style={[styles.wrap, { opacity: loading ? 0.75 : 1 }]}
      onTouchEnd={() => {
        if (loading) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <LinearGradient
        colors={[C.navy, "#063163", "#042046"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.shine} pointerEvents="none" />
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.label}>{label}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 54,
    minHeight: 54,
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: C.navy,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  shine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 26,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
