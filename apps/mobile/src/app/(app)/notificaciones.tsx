import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { ScreenBackground, GlassCard, GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";
import { C } from "@/lib/theme";
import { ensurePushRegistration, getPushPermission } from "@/lib/push";

export default function NotificacionesScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const router = useRouter();
  const status = useQuery(api.notifications.myStatus);
  const registerToken = useMutation(api.notifications.registerToken);
  const disableToken = useMutation(api.notifications.disableToken);
  const [permission, setPermission] = useState<"granted" | "denied" | "undetermined" | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getPushPermission().then(setPermission).catch(() => setPermission("denied"));
    }, []),
  );

  const activo = permission === "granted" && (status?.enabled ?? false);

  async function activar() {
    setBusy(true);
    try {
      const result = await ensurePushRegistration();
      setPermission(result?.permission ?? "denied");
      if (result?.permission === "denied") {
        Alert.alert(
          "Permiso desactivado",
          "Activa las notificaciones en Ajustes del teléfono para recibir avisos.",
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Abrir ajustes", onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      if (result?.token) {
        await registerToken({ token: result.token, platform: result.platform });
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo activar.");
    } finally {
      setBusy(false);
    }
  }

  async function desactivar() {
    setBusy(true);
    try {
      await disableToken({});
      Alert.alert(
        "Desactivadas en Vekino",
        "Ya no enviaremos push a este usuario. También puedes desactivarlas en el sistema.",
      );
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo desactivar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <View style={styles.header}>
            <Tap onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={AuthUI.text} />
            </Tap>
            <Text style={styles.title}>Notificaciones</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            <GlassCard style={styles.statusCard}>
              <Ionicons
                name={activo ? "notifications" : "notifications-off-outline"}
                size={28}
                color={AuthUI.text}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.statusLabel}>Estado</Text>
                {permission === null || status === undefined ? (
                  <ActivityIndicator color={C.brand} />
                ) : (
                  <GlassBadge
                    label={activo ? "Activas" : "Inactivas"}
                    tone={activo ? "green" : "neutral"}
                  />
                )}
              </View>
            </GlassCard>

            <Text style={styles.hint}>
              Pedimos el permiso al abrir la app. Aquí puedes reactivarlo o
              desactivar el envío desde Vekino.
            </Text>

            {activo ? (
              <Tap onPress={desactivar} disabled={busy}>
                <GlassCard style={styles.action}>
                  <Text style={styles.actionDanger}>
                    {busy ? "…" : "Desactivar en Vekino"}
                  </Text>
                </GlassCard>
              </Tap>
            ) : (
              <Tap onPress={activar} disabled={busy}>
                <GlassCard style={{ ...styles.action, ...styles.actionPrimary }}>
                  <Text style={styles.actionPrimaryText}>
                    {busy ? "…" : "Activar notificaciones"}
                  </Text>
                </GlassCard>
              </Tap>
            )}

            {Platform.OS !== "web" ? (
              <Tap onPress={() => Linking.openSettings()}>
                <Text style={styles.settingsLink}>Abrir ajustes del sistema</Text>
              </Tap>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </ScreenBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  statusCard: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  statusLabel: {
    fontSize: 13,
    color: AuthUI.textMuted,
    fontFamily: AuthUI.font.medium,
  },
  hint: {
    fontSize: 13,
    color: AuthUI.textMuted,
    lineHeight: 19,
    marginBottom: 16,
  },
  action: {
    padding: 14,
    alignItems: "center",
  },
  actionPrimary: { backgroundColor: C.brand, borderColor: C.brand },
  actionPrimaryText: {
    color: "#fff",
    fontFamily: AuthUI.font.semibold,
    fontSize: 15,
  },
  actionDanger: {
    color: C.danger,
    fontFamily: AuthUI.font.semibold,
    fontSize: 15,
  },
  settingsLink: {
    marginTop: 18,
    textAlign: "center",
    color: C.brand,
    fontSize: 14,
    fontFamily: AuthUI.font.medium,
  },
});
