import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenBackground } from "./glass";
import { C } from "@/lib/theme";

export function NoCondominioScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <SafeAreaView style={styles.root} edges={["top"]}>
          <View style={styles.center}>
            <View style={styles.iconWrap}>
              <Ionicons name="business-outline" size={40} color={C.textSoft} />
            </View>
            <Text style={styles.title}>Selecciona un condominio</Text>
            <Text style={styles.body}>
              Elige un condominio desde el Panel maestro para ver esta sección.
            </Text>
            <Pressable
              onPress={() => router.navigate("/(app)" as never)}
              style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="arrow-back" size={16} color="#fff" />
              <Text style={styles.btnLabel}>Ir al Panel maestro</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </ScreenBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 14,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: C.bgSubtle,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  body: {
    color: C.textSoft,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.navy,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 8,
  },
  btnLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
