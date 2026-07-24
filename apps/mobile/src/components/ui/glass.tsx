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
import { LinearGradient } from "expo-linear-gradient";
import { PastelShell } from "@/components/ui/pastel-shell";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI, softShadow, floatShadow } from "@/lib/soft-ui";
import { useCondominio } from "@/context/condominio-context";

/** Fondo de producto = mist Soft UI + glow del condominio activo. */
export function ScreenBackground({ children }: { children: React.ReactNode }) {
  const { theme, condominioId } = useCondominio();
  const segments = useSegments();
  const bottomGlows = (segments as string[]).includes("(tabs)");

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

/** Tarjeta Soft UI — blanca, radio amplio, sombra suave. */
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
      style={({ pressed }) => [
        style,
        {
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
      ]}
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

const BUTTON_HEIGHT = { sm: 40, md: SoftUI.buttonH - 4, lg: SoftUI.buttonH };
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

  const content = loading ? (
    <ActivityIndicator color={isPrimary ? "#fff" : SoftUI.blue} size="small" />
  ) : (
    <>
      {icon}
      <Text
        style={{
          color: isPrimary ? SoftUI.white : SoftUI.blue,
          fontSize: fs,
          fontFamily: AuthUI.font.semibold,
        }}
      >
        {label}
      </Text>
    </>
  );

  if (isPrimary) {
    return (
      <View
        onTouchEnd={() => {
          if (disabled || loading) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
        style={[
          {
            height: h,
            borderRadius: SoftUI.radius.button,
            overflow: "hidden",
            opacity: disabled ? 0.5 : 1,
            width: "100%",
          },
          style,
        ]}
      >
        <LinearGradient
          colors={[SoftUI.gradientStart, SoftUI.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
            paddingHorizontal: 16,
          }}
        >
          {content}
        </LinearGradient>
      </View>
    );
  }

  return (
    <View
      onTouchEnd={() => {
        if (disabled || loading) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={[
        {
          height: h,
          borderRadius: SoftUI.radius.button,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 16,
          opacity: disabled ? 0.5 : 1,
          backgroundColor: isGhost ? "transparent" : SoftUI.white,
          borderWidth: isGhost ? 0 : StyleSheet.hairlineWidth * 2,
          borderColor: SoftUI.divider,
          width: "100%",
        },
        style,
      ]}
    >
      {content}
    </View>
  );
}

interface GlassBadgeProps {
  label: string;
  tone?: "orange" | "green" | "red" | "yellow" | "blue" | "neutral";
}

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  orange: { bg: SoftUI.brandSoft, text: SoftUI.brand },
  green: { bg: SoftUI.successSoft, text: SoftUI.success },
  red: { bg: SoftUI.dangerSoft, text: SoftUI.danger },
  yellow: { bg: SoftUI.warningSoft, text: "#B8860B" },
  blue: { bg: SoftUI.infoSoft, text: SoftUI.blue },
  neutral: { bg: SoftUI.bgSecondary, text: SoftUI.textSecondary },
};

export function GlassBadge({ label, tone = "neutral" }: GlassBadgeProps) {
  const c = BADGE_COLORS[tone] ?? BADGE_COLORS.neutral;
  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderRadius: SoftUI.radius.chip,
        paddingHorizontal: 12,
        paddingVertical: 5,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          color: c.text,
          fontSize: SoftUI.type.chip.size,
          fontFamily: AuthUI.font.semibold,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

interface GlassInputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export function GlassInput({
  label,
  error,
  leftIcon,
  rightAction,
  style,
  ...props
}: GlassInputProps) {
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text
          style={{
            color: SoftUI.text,
            fontSize: 14,
            fontFamily: AuthUI.font.semibold,
          }}
        >
          {label}
        </Text>
      )}
      <View style={[styles.inputContainer, error ? styles.inputError : null]}>
        {leftIcon && (
          <View style={{ paddingLeft: 12, paddingRight: 4 }}>{leftIcon}</View>
        )}
        <TextInput
          placeholderTextColor={SoftUI.textDisabled}
          style={[
            {
              flex: 1,
              color: SoftUI.text,
              fontSize: 15,
              fontFamily: AuthUI.font.regular,
              paddingVertical: 14,
              paddingHorizontal: leftIcon ? 4 : 16,
            },
            style as TextStyle,
          ]}
          {...props}
        />
        {rightAction && <View style={{ paddingRight: 10 }}>{rightAction}</View>}
      </View>
      {error && (
        <Text
          style={{
            color: SoftUI.danger,
            fontSize: 12,
            fontFamily: AuthUI.font.regular,
          }}
        >
          {error}
        </Text>
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
    <View style={{ gap: 14 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            color: SoftUI.text,
            fontSize: SoftUI.type.section.size,
            lineHeight: SoftUI.type.section.line,
            fontFamily: AuthUI.font.semibold,
          }}
        >
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

/** CTA con gradiente azul Soft UI (tarjeta de acción principal). */
export function SoftGradientCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ borderRadius: SoftUI.radius.card, overflow: "hidden", ...floatShadow }, style]}>
      <LinearGradient
        colors={[SoftUI.gradientStart, SoftUI.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: SoftUI.space.lg, minHeight: 132 }}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: SoftUI.radius.card,
    backgroundColor: SoftUI.card,
    overflow: "hidden",
    ...softShadow,
  },
  inputContainer: {
    borderRadius: SoftUI.radius.field,
    borderWidth: 0,
    backgroundColor: SoftUI.field,
    flexDirection: "row",
    alignItems: "center",
    minHeight: SoftUI.fieldH,
  },
  inputError: {
    borderWidth: 1,
    borderColor: SoftUI.danger,
  },
});
