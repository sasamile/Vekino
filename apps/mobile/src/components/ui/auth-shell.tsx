import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { C } from "@/lib/theme";

/**
 * Auth profesional con profundidad:
 * atmósfera navy suave + card elevada. Sin pasteles.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={["#f0f3f8", "#e8eef6", "#f5f6f8"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      {children}
    </View>
  );
}

export const authStyles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 40,
  },
  brand: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(4,32,70,0.08)",
    shadowColor: C.navy,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  brandName: {
    color: C.navy,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.9,
  },
  tagline: {
    color: C.textMuted,
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(255,255,255,0.82)",
    shadowColor: C.navy,
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  cardInner: {
    padding: 26,
  },
  title: {
    color: C.navy,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: C.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 22,
  },
  label: {
    color: C.textSoft,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(4,32,70,0.1)",
    marginBottom: 16,
    shadowColor: C.navy,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  inputRowFocused: {
    borderColor: C.brand,
    backgroundColor: "#ffffff",
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    paddingVertical: 0,
    height: 50,
  },
  errorBox: {
    backgroundColor: C.dangerSoft,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    color: C.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  successBox: {
    backgroundColor: C.successSoft,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  successText: {
    color: C.success,
    fontSize: 13,
    lineHeight: 18,
  },
  linkAccent: {
    color: C.brand,
    fontSize: 13,
    fontWeight: "600",
  },
  linkMuted: {
    color: C.textMuted,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 18,
  },
  footer: {
    color: C.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 24,
    lineHeight: 18,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#eef2f7",
  },
  glowTop: {
    position: "absolute",
    top: -100,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(4,32,70,0.07)",
  },
  glowBottom: {
    position: "absolute",
    bottom: 60,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(242,106,58,0.08)",
  },
});
