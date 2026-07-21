import { useEffect } from "react";
import { Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

/** Emoji 👋 con animación de saludo (se mece cada pocos segundos). */
export function WavingHand({ size = 26 }: { size?: number }) {
  const rot = useSharedValue(0);

  useEffect(() => {
    rot.value = withRepeat(
      withDelay(
        1200,
        withSequence(
          withTiming(18, { duration: 140, easing: Easing.out(Easing.quad) }),
          withTiming(-12, { duration: 140 }),
          withTiming(16, { duration: 140 }),
          withTiming(-8, { duration: 140 }),
          withTiming(0, { duration: 140 }),
        ),
      ),
      -1,
      false,
    );
  }, [rot]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <Text style={{ fontSize: size }}>👋</Text>
    </Animated.View>
  );
}
