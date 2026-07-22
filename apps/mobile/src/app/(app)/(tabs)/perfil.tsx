import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useAction, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import * as ImagePicker from "expo-image-picker";
import { ScreenBackground, GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { useCondominio } from "@/context/condominio-context";
import { initials } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { AuthUI } from "@/lib/auth-ui";
import { C } from "@/lib/theme";
import type { Id } from "@vekino/backend/dataModel";
import { uploadLocalFile } from "@/lib/guardia-upload";

const ROL_LABEL: Record<string, string> = {
  administrador: "Administrador",
  junta_directiva: "Junta directiva",
  contadora: "Contadora",
  guardia: "Guardia",
  propietario: "Propietario",
  arrendatario: "Arrendatario",
  residente: "Residente",
};

const ROL_TONE: Record<string, "orange" | "blue" | "green" | "neutral"> = {
  administrador: "orange",
  junta_directiva: "blue",
  contadora: "green",
  guardia: "neutral",
  propietario: "blue",
  arrendatario: "neutral",
  residente: "neutral",
};

export default function PerfilScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <Authenticated>
          <PerfilContent />
        </Authenticated>
      </ScreenBackground>
    </View>
  );
}

function PerfilContent() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const pushStatus = useQuery(api.notifications.myStatus);
  const { condominioId, selectCondominio } = useCondominio();
  const generateUploadUrl = useAction(api.files.generateUploadUrl);
  const setMyAvatar = useMutation(api.users.setMyAvatar);
  const clearMyAvatar = useMutation(api.users.clearMyAvatar);
  const [uploading, setUploading] = useState(false);

  async function signOut() {
    Alert.alert("Cerrar sesión", "¿Seguro que quieres salir?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: async () => {
          await authClient.signOut();
          router.replace("/(auth)/login" as never);
        },
      },
    ]);
  }

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permiso necesario",
        "Activa el acceso a fotos para cambiar tu avatar.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const { url, key } = await uploadLocalFile(
        generateUploadUrl,
        asset.uri,
        asset.mimeType ?? "image/jpeg",
        "avatars",
        asset.fileName ?? "avatar.jpg",
      );
      await setMyAvatar({ url, s3Key: key });
    } catch (e) {
      Alert.alert(
        "No se pudo subir",
        e instanceof Error ? e.message : "Intenta de nuevo.",
      );
    } finally {
      setUploading(false);
    }
  }

  function onAvatarPress() {
    const options: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [
      { text: "Elegir foto", onPress: () => void pickAvatar() },
    ];
    if (me?.image) {
      options.push({
        text: "Quitar foto",
        style: "destructive",
        onPress: () => void clearMyAvatar({}),
      });
    }
    options.push({ text: "Cancelar", style: "cancel" });
    Alert.alert("Avatar", "¿Qué quieres hacer?", options);
  }

  if (!me) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={AuthUI.text} size="large" />
      </View>
    );
  }

  const firstName = me.firstName ?? me.name.split(" ")[0] ?? me.name;
  const lastName = me.lastName ?? me.name.split(" ").slice(1).join(" ") ?? "";

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Mi perfil</Text>

        <View style={styles.profileCard}>
          <View
            onTouchEnd={() => {
              if (uploading) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onAvatarPress();
            }}
            style={{ alignItems: "center" }}
          >
            <View style={styles.avatarRing}>
              {uploading ? (
                <ActivityIndicator color={AuthUI.textMuted} />
              ) : me.image ? (
                <Image source={{ uri: me.image }} style={styles.avatarImg} resizeMode="cover" />
              ) : (
                <Text style={styles.avatarInitials}>{initials(me.name)}</Text>
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
            <Text style={styles.avatarHint}>Toca para cambiar foto</Text>
          </View>

          <Text style={styles.name}>
            {[firstName, lastName].filter(Boolean).join(" ")}
          </Text>
          <Text style={styles.email}>{me.email}</Text>
          {me.telefono ? <Text style={styles.phone}>{me.telefono}</Text> : null}
          {me.isSuperadmin ? (
            <View style={{ marginTop: 12 }}>
              <GlassBadge label="Superadmin" tone="orange" />
            </View>
          ) : null}
        </View>

        {me.memberships.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Mis condominios</Text>
            <View style={styles.listGap}>
              {me.memberships.map((m) => {
                const accent = m.condominioPrimaryColor || AuthUI.purple;
                const active = m.condominioId === condominioId;
                return (
                  <Tap
                    key={m.membershipId}
                    style={styles.condoRow}
                    onPress={() => {
                      if (!m.condominioId || !m.condominioName) return;
                      selectCondominio(
                        m.condominioId as Id<"condominios">,
                        m.condominioName,
                      );
                    }}
                  >
                    {m.condominioLogo ? (
                      <Image
                        source={{ uri: m.condominioLogo }}
                        style={styles.condoLogo}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.condoLogoFallback, { backgroundColor: accent + "18" }]}>
                        <Text style={[styles.condoInitials, { color: accent }]}>
                          {initials(m.condominioName ?? "?")}
                        </Text>
                      </View>
                    )}
                    <View style={styles.rowBody}>
                      <Text style={styles.condoName} numberOfLines={1}>
                        {m.condominioName}
                      </Text>
                      {m.condominioSubdomain ? (
                        <Text style={styles.condoSub} numberOfLines={1}>
                          {m.condominioSubdomain}.vekino.app
                        </Text>
                      ) : null}
                      <View style={styles.badgeRow}>
                        {m.roles.map((r) => (
                          <GlassBadge
                            key={r}
                            label={ROL_LABEL[r] ?? r}
                            tone={ROL_TONE[r] ?? "neutral"}
                          />
                        ))}
                      </View>
                    </View>
                    {active ? (
                      <Ionicons name="checkmark-circle" size={20} color={AuthUI.purple} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={20} color={AuthUI.textMuted} />
                    )}
                  </Tap>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Información</Text>
          <View style={styles.infoCard}>
            {(
              [
                {
                  icon: "shield-checkmark-outline" as const,
                  label: "Privacidad",
                  subtitle: "Cómo usamos tus datos",
                  route: "/(app)/privacidad",
                },
                {
                  icon: "notifications-outline" as const,
                  label: "Notificaciones",
                  subtitle:
                    pushStatus === undefined
                      ? "Cargando…"
                      : pushStatus.enabled
                        ? "Activas"
                        : "Inactivas",
                  route: "/(app)/notificaciones",
                },
                {
                  icon: "help-circle-outline" as const,
                  label: "Soporte",
                  subtitle: "Pedir ayuda a admin y Vekino",
                  route: "/(app)/soporte",
                },
              ] as const
            ).map((item, i, arr) => (
              <Tap
                key={item.label}
                style={[styles.infoRow, i < arr.length - 1 && styles.infoBorder]}
                onPress={() => router.push(item.route as never)}
              >
                <View style={styles.infoIcon}>
                  <Ionicons name={item.icon} size={18} color={AuthUI.text} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.infoLabel}>{item.label}</Text>
                  <Text style={styles.infoSub}>{item.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={AuthUI.textMuted} />
              </Tap>
            ))}
          </View>
        </View>

        <Text style={styles.version}>Vekino v1.0 · Powered by Zyntek</Text>

        <View
          style={styles.signOut}
          onTouchEnd={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            signOut();
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={C.danger} />
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingBottom: 140,
    paddingHorizontal: AuthUI.padH - 7,
  },
  title: {
    marginTop: 12,
    marginBottom: 22,
    color: AuthUI.text,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: AuthUI.font.bold,
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D8D6DC",
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 22,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(14,14,15,0.05)",
    borderWidth: 1,
    borderColor: "#D8D6DC",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarInitials: {
    color: AuthUI.text,
    fontSize: 28,
    fontFamily: AuthUI.font.semibold,
  },
  cameraBadge: {
    marginTop: -12,
    backgroundColor: "#0E0E0F",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  avatarHint: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    marginTop: 8,
  },
  name: {
    color: AuthUI.text,
    fontSize: 22,
    fontFamily: AuthUI.font.bold,
    marginTop: 12,
    textAlign: "center",
  },
  email: {
    color: AuthUI.textSecondary,
    fontSize: 14,
    fontFamily: AuthUI.font.regular,
    marginTop: 4,
  },
  phone: {
    color: AuthUI.textMuted,
    fontSize: 13,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    color: AuthUI.text,
    fontSize: 17,
    fontFamily: AuthUI.font.semibold,
    marginBottom: 12,
  },
  listGap: {
    gap: 10,
  },
  condoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8D6DC",
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 14,
    width: "100%",
  },
  condoLogo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F4F4F5",
  },
  condoLogoFallback: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  condoInitials: {
    fontSize: 14,
    fontFamily: AuthUI.font.bold,
  },
  rowBody: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    marginLeft: 12,
    marginRight: 8,
  },
  condoName: {
    color: AuthUI.text,
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
  },
  condoSub: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    gap: 6,
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8D6DC",
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: "100%",
  },
  infoBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(14,14,15,0.08)",
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(14,14,15,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: {
    color: AuthUI.text,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
  },
  infoSub: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  version: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    textAlign: "center",
    marginBottom: 16,
  },
  signOut: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.dangerSoft,
    backgroundColor: C.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  signOutText: {
    color: C.danger,
    fontSize: 16,
    fontFamily: AuthUI.font.semibold,
    marginLeft: 8,
  },
});
