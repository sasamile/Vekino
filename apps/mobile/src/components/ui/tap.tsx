import { useRef } from "react";
import {
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

const MOVE_THRESHOLD = 10;

/**
 * Tap seguro dentro de ScrollView.
 * Si el dedo se mueve (scroll), no dispara onPress —
 * evita abrir cards/modales al soltar tras scrollear.
 */
export function Tap({
  onPress,
  style,
  children,
  haptic = true,
  disabled,
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  haptic?: boolean;
  disabled?: boolean;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  function onTouchStart(e: GestureResponderEvent) {
    start.current = {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
    };
    moved.current = false;
  }

  function onTouchMove(e: GestureResponderEvent) {
    if (!start.current || moved.current) return;
    const dx = Math.abs(e.nativeEvent.pageX - start.current.x);
    const dy = Math.abs(e.nativeEvent.pageY - start.current.y);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      moved.current = true;
    }
  }

  function onTouchEnd() {
    if (disabled || moved.current || !start.current) {
      start.current = null;
      return;
    }
    start.current = null;
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  }

  return (
    <View
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        start.current = null;
        moved.current = true;
      }}
    >
      {children}
    </View>
  );
}
