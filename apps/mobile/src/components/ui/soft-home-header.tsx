import { useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import { NotificacionesSheet } from "@/components/ui/notificaciones-sheet";
import { UserAvatar } from "@/components/ui/user-avatar";
import { WavingHand } from "@/components/ui/waving-hand";
import { SoftUI } from "@/lib/soft-ui";
import { AuthUI } from "@/lib/auth-ui";
import { formatDisplayName } from "@/lib/utils";
import { useCondominio } from "@/context/condominio-context";

const AVATAR = 48;

/**
 * Rutas raíz de la barra inferior: ahí NO va flecha de volver.
 * Si se agrega una pestaña nueva en `(app)/(tabs)`, hay que sumarla aquí.
 */
const RUTAS_PESTANA = new Set([
  "/",
  "/facturas",
  "/comunicados",
  "/mas",
  "/perfil",
  "/administradores",
]);

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
  showBack,
}: {
  saludo: string;
  displayName: string;
  avatarUrl?: string | null;
  badgeLabel?: string | null;
  showNotifDot?: boolean;
  /**
   * Botón de volver. Si no se pasa, se decide por la ruta: en las pestañas no
   * va (son la raíz), y en los módulos sí, porque van apilados encima y ahí la
   * barra inferior no se ve — sin el botón la única salida sería el gesto de
   * deslizar desde el borde, que es invisible.
   */
  showBack?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Por ruta y NO con `canGoBack()`: esa función devuelve true en las pestañas
  // (por el replace del arranque) y ahí la flecha sobra, además de que al
  // tocarla saltaba "GO_BACK was not handled by any navigator".
  const pathname = usePathname();
  const puedeVolver = showBack ?? !RUTAS_PESTANA.has(pathname);
  const me = useQuery(api.users.me);
  const { theme, condominioId } = useCondominio();

  const [bandeja, setBandeja] = useState(false);
  const [vistasPrevias, setVistasPrevias] = useState(0);
  const feed = useQuery(
    api.notificacionesFeed.feed,
    condominioId ? { condominioId } : "skip",
  );
  const marcarVistas = useMutation(api.notificacionesFeed.marcarVistas);
  const sinLeer = feed?.sinLeer ?? 0;

  function abrirBandeja() {
    // Congelamos la marca ANTES de actualizarla: si no, al abrir se marcaría
    // todo como visto al instante y nunca verías cuáles llegaron nuevas.
    setVistasPrevias(feed?.vistasAt ?? 0);
    setBandeja(true);
    void marcarVistas({}).catch(() => {});
  }
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
        {/* El volver va ANTES del avatar, no en su lugar: antes lo reemplazaba
            y en los módulos se perdía la foto del usuario. */}
        {puedeVolver ? (
          <View
            style={styles.backBtn}
            onTouchEnd={() => {
              // `canGoBack()` a veces dice que sí y el navegador no tiene a
              // dónde volver (pantallas abiertas con replace): sin esta
              // salvaguarda saltaba "GO_BACK was not handled by any navigator".
              if (router.canGoBack()) router.back();
              else router.replace("/(app)/(tabs)" as never);
            }}
          >
            <Ionicons name="chevron-back" size={22} color={SoftUI.text} />
          </View>
        ) : null}

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
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.accent },
              ]}
            >
              <Text style={styles.badgeText} numberOfLines={1}>
                {badgeLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bellBtn} onTouchEnd={abrirBandeja}>
          <Ionicons name="notifications-outline" size={22} color={SoftUI.text} />
          {showNotifDot || sinLeer > 0 ? <View style={styles.dot} /> : null}
        </View>
      </View>

      <NotificacionesSheet
        visible={bandeja}
        onClose={() => setBandeja(false)}
        condominioId={condominioId}
        vistasAt={vistasPrevias}
      />
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
  backBtn: {
    // Más compacto que el avatar: comparten fila y el saludo necesita aire.
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: 19,
    backgroundColor: SoftUI.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SoftUI.divider,
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
    borderRadius: SoftUI.radius.chip,
    paddingHorizontal: SoftUI.space.md,
    paddingVertical: 4,
    maxWidth: "100%",
    opacity: 0.92,
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
