import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

type ToastType = "error" | "success" | "info";

interface ToastProps {
  message: string | null;
  type?: ToastType;
  /** Por defecto abajo para no chocar con Dynamic Island / notch. */
  position?: "top" | "bottom";
}

const ICON: Record<ToastType, React.ComponentProps<typeof Ionicons>["name"]> = {
  error: "alert-circle",
  success: "checkmark-circle",
  info: "information-circle",
};

const ACCENT: Record<ToastType, string> = {
  error: "#B42318",
  success: "#027A48",
  info: "#175CD3",
};

const SURFACE: Record<ToastType, string> = {
  error: "#FEF3F2",
  success: "#ECFDF3",
  info: "#EFF8FF",
};

const BORDER: Record<ToastType, string> = {
  error: "#FECDCA",
  success: "#A6F4C5",
  info: "#B2DDFF",
};

export function Toast({
  message,
  type = "error",
  position = "bottom",
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(position === "bottom" ? 80 : -80);
  const opacity = useSharedValue(0);
  const prevMessage = useRef<string | null>(null);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    opacity: opacity.value,
  }));

  useEffect(() => {
    const hidden = position === "bottom" ? 80 : -80;
    if (message && message !== prevMessage.current) {
      if (type === "error") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
          () => {},
        );
      } else if (type === "success") {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
      offset.value = withSpring(0, { damping: 18, stiffness: 280, mass: 0.9 });
      opacity.value = withTiming(1, { duration: 180 });
    } else if (!message && prevMessage.current) {
      offset.value = withSpring(hidden, { damping: 22, stiffness: 360 });
      opacity.value = withTiming(0, { duration: 220 });
    }
    prevMessage.current = message;
  }, [message, type, position]);

  if (!message) return null;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        position === "bottom"
          ? { bottom: Math.max(insets.bottom, 12) + 8 }
          : { top: Math.max(insets.top, 12) + 4 },
        {
          backgroundColor: SURFACE[type],
          borderColor: BORDER[type],
        },
        animStyle,
      ]}
      pointerEvents="none"
    >
      <View style={styles.row}>
        <Ionicons name={ICON[type]} size={20} color={ACCENT[type]} />
        <Text style={[styles.text, { color: ACCENT[type] }]} numberOfLines={3}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 1000,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#0E0E0F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.15,
    lineHeight: 19,
  },
});
