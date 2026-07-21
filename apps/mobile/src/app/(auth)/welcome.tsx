import { useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  useWindowDimensions,
  StyleSheet,
  type ImageSourcePropType,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { PastelShell } from "@/components/ui/pastel-shell";
import { AuthUI, ONBOARDING_KEY, SPLASH_ONLY } from "@/lib/auth-ui";
import { useAuthFonts } from "@/lib/use-auth-fonts";
import { storageSet } from "@/lib/storage";

/**
 * Imágenes del carrusel: assets/splash/img1…img4
 * Cada una trae su tamaño de display (proporciones distintas).
 */
const SLIDES: {
  title: string;
  body: string;
  image: ImageSourcePropType;
  /** Tamaño en pantalla — ajusta por imagen si hace falta */
  imageW: number;
  imageH: number;
}[] = [
  {
    title: "Tu condominio, claro",
    body: "Consulta el estado de tu unidad, pagos y avisos en un solo lugar, sin complicaciones.",
    image: require("../../../assets/splash/img1.png"),
    imageW: 360,
    imageH: 480,
  },
  {
    title: "Pagos y facturas",
    body: "Revisa tu cartera, descarga facturas y mantén tus obligaciones al día con total transparencia.",
    image: require("../../../assets/splash/img2.png"),
    imageW: 360,
    imageH: 360,
  },
  {
    title: "Avisos y comunidad",
    body: "Recibe comunicados importantes y mantente informado de lo que ocurre en tu condominio.",
    image: require("../../../assets/splash/img3.png"),
    imageW: 370,
    imageH: 350,
  },
  {
    title: "Reservas fáciles",
    body: "Agenda zonas comunes en segundos y organiza tu día sin llamadas ni filas.",
    image: require("../../../assets/splash/img4.png"),
    imageW: 360,
    imageH: 360,
  },
];

async function markDone() {
  await storageSet(ONBOARDING_KEY, "1");
}

export default function WelcomeScreen() {
  const fontsLoaded = useAuthFonts();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  async function goLogin() {
    if (SPLASH_ONLY) return;
    await markDone();
    router.replace("/(auth)/login" as never);
  }

  function onNext() {
    if (index >= SLIDES.length - 1) {
      if (SPLASH_ONLY) {
        listRef.current?.scrollToIndex({ index: 0, animated: true });
        setIndex(0);
        return;
      }
      goLogin();
      return;
    }
    const next = index + 1;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(i);
  }

  if (!fontsLoaded) {
    return <PastelShell><View style={{ flex: 1 }} /></PastelShell>;
  }

  return (
    <PastelShell>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <FlatList
          ref={listRef}
          data={SLIDES}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item }) => (
            <View style={{ width, flex: 1, paddingHorizontal: 24 }}>
              <View style={styles.hero}>
                <Image
                  source={item.image}
                  style={{
                    width: item.imageW,
                    height: item.imageH,
                    zIndex: 1,
                  }}
                  resizeMode="contain"
                />
              </View>

              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          )}
        />

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === index ? styles.dotActive : styles.dotIdle,
                ]}
              />
            ))}
          </View>

          <View style={styles.navRow}>
            <Pressable onPress={goLogin} hitSlop={12}>
              <Text style={styles.skip}>Saltar</Text>
            </Pressable>
            {/* View + onTouchEnd: Pressable + NativeWind no pinta el fondo */}
            <View style={styles.next} onTouchEnd={onNext}>
              <Text style={styles.nextLabel}>
                {SPLASH_ONLY
                  ? "Siguiente"
                  : index >= SLIDES.length - 1
                    ? "Empezar"
                    : "Siguiente"}
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </PastelShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 8,
    height: 480,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: AuthUI.font.bold,
    fontSize: 30,
    lineHeight: 36,
    color: AuthUI.text,
    marginTop: 8,
  },
  body: {
    fontFamily: AuthUI.font.medium,
    fontSize: 16,
    lineHeight: 26,
    color: "#151517",
    marginTop: 14,
    maxWidth: 330,
  },
  footer: {
    paddingHorizontal: 30,
    paddingBottom: 12,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 28,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotIdle: {
    width: 6,
    backgroundColor: AuthUI.dotInactive,
  },
  dotActive: {
    width: 30,
    backgroundColor: AuthUI.dotActive,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  skip: {
    fontFamily: AuthUI.font.semibold,
    fontSize: 19,
    color: "#0E0E0F",
  },
  next: {
    minWidth: 128,
    height: 58,
    paddingHorizontal: 22,
    borderRadius: AuthUI.radiusBtn,
    backgroundColor: "#0E0E0F",
    alignItems: "center",
    justifyContent: "center",
  },
  nextLabel: {
    fontFamily: AuthUI.font.semibold,
    fontSize: 19,
    color: "#FFFFFF",
  },
});
