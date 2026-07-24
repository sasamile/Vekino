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
import { ScreenBackground, GlassBadge, GlassCard } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { useCondominio } from "@/context/condominio-context";
import { initials } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI } from "@/lib/soft-ui";
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
  const deleteMyAccount = useAction(api.users.deleteMyAccount);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function runDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteMyAccount({});
      await authClient.signOut().catch(() => {});
      router.replace("/(auth)/login" as never);
    } catch (e) {
      setDeleting(false);
      Alert.alert(
        "No se pudo eliminar",
        e instanceof Error
          ? e.message
          : "Ocurrió un error al eliminar tu cuenta. Intenta de nuevo.",
      );
    }
  }

  function deleteAccount() {
    // Doble confirmación: Apple exige que el borrado sea intencional pero real.
    Alert.alert(
      "Eliminar cuenta",
      "Tu cuenta se eliminará de forma permanente y no podrás volver a iniciar " +
        "sesión. Se borrarán tus datos personales (nombre, correo, teléfono, " +
        "documento y foto). La administración conserva el historial de cobros de " +
        "tu inmueble por obligación contable. Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar cuenta",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "¿Confirmar eliminación?",
              "Tu cuenta se eliminará de forma permanente y no podrás iniciar sesión de nuevo.",
              [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Sí, eliminar",
                  style: "destructive",
                  onPress: () => void runDelete(),
                },
              ],
            );
          },
        },
      ],
    );
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
    const options: {
      text: string;
      style?: "cancel" | "destructive";
      onPress?: () => void;
    }[] = [{ text: "Elegir foto", onPress: () => void pickAvatar() }];
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
        <ActivityIndicator color={SoftUI.blue} size="large" />
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
        <GlassCard style={styles.profileCard}>
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
              <ActivityIndicator color={SoftUI.blue} />
            ) : me.image ? (
              <Image
                source={{ uri: me.image }}
                style={styles.avatarImg}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarInitials}>{initials(me.name)}</Text>
            )}
          </View>
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={14} color={SoftUI.white} />
          </View>
          <Text style={styles.avatarHint}>Toca para cambiar foto</Text>
        </View>

        <Text style={styles.name}>
          {[firstName, lastName].filter(Boolean).join(" ")}
        </Text>
        <Text style={styles.email}>{me.email}</Text>
        {me.telefono ? <Text style={styles.phone}>{me.telefono}</Text> : null}
        {me.isSuperadmin ? (
          <View style={{ marginTop: SoftUI.space.md }}>
            <GlassBadge label="Superadmin" tone="orange" />
          </View>
        ) : null}
      </GlassCard>

      {me.memberships.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Mis condominios</Text>
          <View style={styles.listGap}>
            {me.memberships.map((m) => {
              const accent = m.condominioPrimaryColor || SoftUI.blue;
              const active = m.condominioId === condominioId;
              return (
                <Tap
                  key={m.membershipId}
                  onPress={() => {
                    if (!m.condominioId || !m.condominioName) return;
                    selectCondominio(
                      m.condominioId as Id<"condominios">,
                      m.condominioName,
                    );
                  }}
                >
                  <GlassCard style={styles.condoRow}>
                    {m.condominioLogo ? (
                      <Image
                        source={{ uri: m.condominioLogo }}
                        style={styles.condoLogo}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.condoLogoFallback,
                          { backgroundColor: SoftUI.infoSoft },
                        ]}
                      >
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
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={SoftUI.blue}
                      />
                    ) : (
                      <Ionicons
                        name="ellipse-outline"
                        size={20}
                        color={SoftUI.textDisabled}
                      />
                    )}
                  </GlassCard>
                </Tap>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Información</Text>
        <GlassCard style={styles.infoCard}>
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
                <Ionicons name={item.icon} size={18} color={SoftUI.blue} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.infoLabel}>{item.label}</Text>
                <Text style={styles.infoSub}>{item.subtitle}</Text>
              </View>
              <View style={styles.chevron}>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={SoftUI.blue}
                />
              </View>
            </Tap>
          ))}
        </GlassCard>
      </View>

        <Text style={styles.version}>Vekino v1.0 · Powered by Zyntek</Text>

        <View
          style={styles.signOut}
          onTouchEnd={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            signOut();
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={SoftUI.danger} />
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </View>

        <View
          style={styles.deleteAccount}
          onTouchEnd={() => {
            if (deleting) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            deleteAccount();
          }}
        >
          {deleting ? (
            <ActivityIndicator color={SoftUI.textSecondary} size="small" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={16} color={SoftUI.textSecondary} />
              <Text style={styles.deleteAccountText}>Eliminar cuenta</Text>
            </>
          )}
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
    paddingBottom: 150,
    paddingHorizontal: SoftUI.padH,
    paddingTop: SoftUI.space.md,
  },
  profileCard: {
    paddingVertical: SoftUI.space.xl,
    paddingHorizontal: SoftUI.space.lg,
    alignItems: "center",
    marginBottom: SoftUI.space.xl,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.infoSoft,
    borderWidth: 2,
    borderColor: SoftUI.white,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarInitials: {
    color: SoftUI.blue,
    fontSize: 28,
    fontFamily: AuthUI.font.semibold,
  },
  cameraBadge: {
    marginTop: -12,
    backgroundColor: SoftUI.blue,
    width: 28,
    height: 28,
    borderRadius: SoftUI.radius.chip,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: SoftUI.white,
  },
  avatarHint: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
    marginTop: SoftUI.space.sm,
  },
  name: {
    color: SoftUI.text,
    fontSize: SoftUI.type.section.size,
    fontFamily: AuthUI.font.bold,
    marginTop: SoftUI.space.md,
    textAlign: "center",
  },
  email: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.regular,
    marginTop: SoftUI.space.xs,
  },
  phone: {
    color: SoftUI.textDisabled,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  section: {
    marginBottom: SoftUI.space.xl,
  },
  sectionLabel: {
    color: SoftUI.text,
    fontSize: SoftUI.type.section.size - 2,
    fontFamily: AuthUI.font.semibold,
    marginBottom: SoftUI.space.md,
  },
  listGap: {
    gap: SoftUI.space.md,
  },
  condoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SoftUI.space.base,
    gap: SoftUI.space.md,
  },
  condoLogo: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.icon,
    backgroundColor: SoftUI.bgSecondary,
  },
  condoLogoFallback: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  condoInitials: {
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.bold,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  condoName: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.semibold,
  },
  condoSub: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: SoftUI.space.sm,
    gap: SoftUI.space.sm,
  },
  infoCard: {
    paddingVertical: SoftUI.space.xs,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SoftUI.space.base,
    paddingVertical: SoftUI.space.md,
    width: "100%",
    gap: SoftUI.space.md,
  },
  infoBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SoftUI.divider,
  },
  infoIcon: {
    width: SoftUI.iconBtn - 8,
    height: SoftUI.iconBtn - 8,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.infoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size - 1,
    fontFamily: AuthUI.font.semibold,
  },
  infoSub: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
  },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.infoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  version: {
    color: SoftUI.textDisabled,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
    textAlign: "center",
    marginBottom: SoftUI.space.base,
  },
  signOut: {
    height: SoftUI.buttonH,
    borderRadius: SoftUI.radius.button,
    backgroundColor: SoftUI.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: SoftUI.space.sm,
  },
  signOutText: {
    color: SoftUI.danger,
    fontSize: SoftUI.type.body.size + 1,
    fontFamily: AuthUI.font.semibold,
  },
  deleteAccount: {
    height: 46,
    marginTop: SoftUI.space.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: SoftUI.space.sm,
  },
  deleteAccountText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.medium,
  },
});
