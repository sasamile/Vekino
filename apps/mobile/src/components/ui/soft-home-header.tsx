import { View, Text, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import { UserAvatar } from "@/components/ui/user-avatar";
import { WavingHand } from "@/components/ui/waving-hand";
import { SoftUI } from "@/lib/soft-ui";
import { AuthUI } from "@/lib/auth-ui";
import { formatDisplayName } from "@/lib/utils";

const AVATAR = 48;

/**
 * Encabezado Soft UI + liquid glass.
 * Avatar circular · Hola, Nombre · chip condo · campana.
 */
export function SoftHomeHeader({
  saludo,
  displayName,
  avatarUrl,
  badgeLabel,
  showNotifDot = false,
}: {
  saludo: string;
  displayName: string;
  avatarUrl?: string | null;
  badgeLabel?: string | null;
  showNotifDot?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useQuery(api.users.me);
  const pretty = formatDisplayName(displayName);
  const first =
    pretty.trim().split(/\s+/).filter(Boolean)[0] ?? pretty;
  // Preferir prop; si falta, imagen de sesión (evita header sin foto).
  const photo = avatarUrl || me?.image || null;
  const nameForAvatar = pretty || me?.name || "U";

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 10) }]}>
      {/* Fondo glass — detrás del contenido */}
      <View style={styles.glassBg} pointerEvents="none">
        {Platform.OS === "ios" ? (
          <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.androidFill]} />
        )}
        <View style={styles.wash} />
      </View>

      {/* Contenido por encima del blur */}
      <View style={styles.row}>
        <View
          style={styles.avatarHit}
          onTouchEnd={() => router.push("/(app)/(tabs)/perfil" as never)}
        >
          <View style={styles.avatarRing}>
            <UserAvatar name={nameForAvatar} image={photo} size={AVATAR} />
          </View>
        </View>

        <View style={styles.textCol}>
          <View style={styles.greetRow}>
            <Text style={styles.hello} numberOfLines={1}>
              {saludoShort(saludo)},{" "}
              <Text style={styles.name}>{first}</Text>
            </Text>
            <WavingHand size={18} />
          </View>
          {badgeLabel ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText} numberOfLines={1}>
                {badgeLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={styles.bellBtn}
          onTouchEnd={() => router.push("/(app)/notificaciones" as never)}
        >
          <Ionicons name="notifications-outline" size={22} color={SoftUI.text} />
          {showNotifDot ? <View style={styles.dot} /> : null}
        </View>
      </View>
    </View>
  );
}

function saludoShort(saludo: string) {
  const s = saludo.toLowerCase();
  if (s.includes("día") || s.includes("tarde") || s.includes("noche")) return "Hola";
  return saludo;
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 40,
    paddingBottom: SoftUI.space.md,
    paddingHorizontal: SoftUI.padH,
  },
  glassBg: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    borderBottomLeftRadius: SoftUI.radius.cardSm,
    borderBottomRightRadius: SoftUI.radius.cardSm,
  },
  androidFill: {
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.42)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(231,232,236,0.9)",
  },
  row: {
    position: "relative",
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.md,
    minHeight: AVATAR,
  },
  avatarHit: {
    width: AVATAR,
    height: AVATAR,
    flexShrink: 0,
  },
  avatarRing: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: "hidden",
    backgroundColor: SoftUI.bgSecondary,
    borderWidth: 2,
    borderColor: SoftUI.white,
  },
  textCol: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  greetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.xs,
  },
  hello: {
    flexShrink: 1,
    color: SoftUI.text,
    fontSize: SoftUI.type.cardTitle.size,
    lineHeight: SoftUI.type.cardTitle.line,
    fontFamily: AuthUI.font.semibold,
  },
  name: {
    fontFamily: AuthUI.font.bold,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: SoftUI.blue,
    borderRadius: SoftUI.radius.chip,
    paddingHorizontal: SoftUI.space.md,
    paddingVertical: 4,
    maxWidth: "100%",
    opacity: 0.6,
  },
  badgeText: {
    color: SoftUI.white,
    fontSize: SoftUI.type.chip.size - 1,
    fontFamily: AuthUI.font.semibold,
  },
  bellBtn: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    flexShrink: 0,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SoftUI.divider,
  },
  dot: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.danger,
    borderWidth: 1.5,
    borderColor: SoftUI.white,
  },
});
