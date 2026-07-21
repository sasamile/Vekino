import React from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
  type TextInputProps,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSegments } from "expo-router";
import { PastelShell } from "@/components/ui/pastel-shell";
import { AuthUI } from "@/lib/auth-ui";
import { C } from "@/lib/theme";
import { useCondominio } from "@/context/condominio-context";

/** Fondo de producto = mist + glow del condominio activo. */
export function ScreenBackground({ children }: { children: React.ReactNode }) {
  const { theme, condominioId } = useCondominio();
  const segments = useSegments();
  // Blurs inferiores solo con el tab bar visible
  const bottomGlows = segments.includes("(tabs)");

  return (
    <PastelShell
      tone="mist"
      bottomGlows={bottomGlows}
      glows={
        condominioId
          ? { left: theme.glowA, right: theme.glowB, top: theme.glowC }
          : undefined
      }
    >
      {children}
    </PastelShell>
  );
}

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  shine?: boolean;
}

/** Superficie suave tipo glass — sin BlurView anidado (rompe botones). */
export function GlassCard({ children, style }: GlassCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

interface GlassPressableProps {
  onPress?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  haptic?: boolean;
  disabled?: boolean;
}

export function GlassPressable({
  onPress,
  children,
  style,
  haptic = true,
  disabled = false,
}: GlassPressableProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [style, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

interface GlassButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const BUTTON_HEIGHT = { sm: 36, md: 44, lg: 52 };
const BUTTON_FONT = { sm: 13, md: 15, lg: 16 };

export function GlassButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  style,
}: GlassButtonProps) {
  const h = BUTTON_HEIGHT[size];
  const fs = BUTTON_FONT[size];
  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost";

  return (
    <View
      // View + onTouchEnd: Pressable + NativeWind a veces no pinta el fondo
      // (botón negro invisible → solo se ve “Cerrar”).
      onTouchEnd={() => {
        if (disabled || loading) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={[
        {
          height: h,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 16,
          opacity: disabled ? 0.5 : 1,
          backgroundColor: isPrimary ? "#0E0E0F" : isGhost ? "transparent" : "#FFFFFF",
          borderWidth: isPrimary || isGhost ? 0 : StyleSheet.hairlineWidth * 2,
          borderColor: "#D4D2D8",
          width: "100%",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#fff" : AuthUI.text} size="small" />
      ) : (
        <>
          {icon}
          <Text
            style={{
              color: isPrimary ? "#fff" : AuthUI.text,
              fontSize: fs,
              fontFamily: AuthUI.font.semibold,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </View>
  );
}

interface GlassBadgeProps {
  label: string;
  tone?: "orange" | "green" | "red" | "yellow" | "blue" | "neutral";
}

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  orange: { bg: C.brandSoft, text: C.brand },
  green: { bg: C.successSoft, text: C.success },
  red: { bg: C.dangerSoft, text: C.danger },
  yellow: { bg: C.warningSoft, text: C.warning },
  blue: { bg: C.infoSoft, text: C.info },
  neutral: { bg: "rgba(14,14,15,0.05)", text: AuthUI.textSecondary },
};

export function GlassBadge({ label, tone = "neutral" }: GlassBadgeProps) {
  const c = BADGE_COLORS[tone] ?? BADGE_COLORS.neutral;
  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: c.text, fontSize: 12, fontFamily: AuthUI.font.medium }}>{label}</Text>
    </View>
  );
}

interface GlassInputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export function GlassInput({ label, error, leftIcon, rightAction, style, ...props }: GlassInputProps) {
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text style={{ color: AuthUI.text, fontSize: 14, fontFamily: AuthUI.font.semibold }}>
          {label}
        </Text>
      )}
      <View style={[styles.inputContainer, error ? styles.inputError : null]}>
        {leftIcon && <View style={{ paddingLeft: 12, paddingRight: 4 }}>{leftIcon}</View>}
        <TextInput
          placeholderTextColor={AuthUI.placeholder}
          style={[
            {
              flex: 1,
              color: AuthUI.text,
              fontSize: 15,
              fontFamily: AuthUI.font.regular,
              paddingVertical: 12,
              paddingHorizontal: leftIcon ? 4 : 14,
            },
            style as TextStyle,
          ]}
          {...props}
        />
        {rightAction && <View style={{ paddingRight: 10 }}>{rightAction}</View>}
      </View>
      {error && (
        <Text style={{ color: C.danger, fontSize: 12, fontFamily: AuthUI.font.regular }}>{error}</Text>
      )}
    </View>
  );
}

export function GlassSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: AuthUI.text, fontSize: 17, fontFamily: AuthUI.font.semibold }}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(216,214,220,0.9)",
    overflow: "hidden",
  },
  inputContainer: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: "rgba(255,255,255,0.92)",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
  },
  inputError: {
    borderColor: C.danger,
  },
});
