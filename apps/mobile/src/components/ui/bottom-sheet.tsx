import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  View,
  StyleSheet,
  useWindowDimensions,
  Keyboard,
  Platform,
  ScrollView,
  type DimensionValue,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "@/lib/theme";

/**
 * Hoja inferior. Sube con el teclado para que el input no quede tapado.
 * (KeyboardAvoidingView dentro de Modal suele fallar en iOS.)
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  maxHeight = "92%",
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: DimensionValue;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [render, setRender] = useState(visible);
  const [kbPad, setKbPad] = useState(0);
  const translateY = useSharedValue(height);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setRender(true);
      backdrop.value = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, { damping: 24, stiffness: 260, mass: 0.9 });
    } else {
      setKbPad(0);
      backdrop.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(
        height,
        { duration: 200, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setRender)(false);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, height]);

  useEffect(() => {
    if (!visible) return;
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvt, (e) => {
      const h = e.endCoordinates?.height ?? 0;
      // Padding extra para que el input quede por encima de la barra de predicción.
      setKbPad(Math.max(0, h - insets.bottom + 12));
    });
    const onHide = Keyboard.addListener(hideEvt, () => setKbPad(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [visible, insets.bottom]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!render) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(15,23,42,0.45)" }, backdropStyle]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            {
              backgroundColor: C.bg,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              overflow: "hidden",
              maxHeight,
              paddingBottom: kbPad > 0 ? kbPad : Math.max(insets.bottom, 8),
            },
            sheetStyle,
          ]}
        >
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.border }} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
