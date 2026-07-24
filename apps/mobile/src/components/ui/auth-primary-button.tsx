import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { SoftUI, softShadow } from "@/lib/soft-ui";
import { AuthUI } from "@/lib/auth-ui";

/**
 * CTA Soft UI (gradiente azul cielo).
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
        colors={[SoftUI.gradientStart, SoftUI.gradientEnd]}
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
    height: SoftUI.buttonH,
    minHeight: SoftUI.buttonH,
    borderRadius: SoftUI.radius.button,
    overflow: "hidden",
    ...softShadow,
  },
  shine: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.45)",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: SoftUI.white,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.semibold,
  },
});
