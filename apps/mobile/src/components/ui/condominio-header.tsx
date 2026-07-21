import { View, Text, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { initials } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { Tap } from "@/components/ui/tap";
import { useCondominio } from "@/context/condominio-context";

/** Encabezado: logo + nombre condo + título grande (opcional). */
export function CondominioHeader({
  condominioId,
  title,
  right,
  showBack,
}: {
  condominioId: Id<"condominios"> | undefined;
  /** Si se omite o va vacío, solo muestra logo + nombre del condominio. */
  title?: string;
  right?: React.ReactNode;
  /** Muestra chevron atrás (módulos abiertos desde Más / stack). */
  showBack?: boolean;
}) {
  const router = useRouter();
  const condo = useQuery(api.condominios.get, condominioId ? { condominioId } : "skip");
  const name = condo?.name ?? "";
  const canBack = showBack && router.canGoBack();
  const showTitle = Boolean(title?.trim());

  return (
    <View style={[styles.wrap, !showTitle && styles.wrapCompact]}>
      <View style={styles.left}>
        {canBack ? (
          <Tap style={styles.backRow} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={18} color={AuthUI.textSecondary} />
            <Text style={styles.backText}>Atrás</Text>
          </Tap>
        ) : null}
        <View style={[styles.brandRow, !showTitle && { marginBottom: 0 }]}>
          {condo?.logo ? (
            <Image source={{ uri: condo.logo }} style={styles.logo} resizeMode="cover" />
          ) : name ? (
            <View style={styles.logoFallback}>
              <Text style={styles.logoInitials}>{initials(name)}</Text>
            </View>
          ) : null}
          {name ? (
            <Text style={[styles.condoName, !showTitle && styles.condoNameHero]} numberOfLines={1}>
              {name}
            </Text>
          ) : null}
        </View>
        {showTitle ? <Text style={styles.title}>{title}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/**
 * Marca centrada para el home residente: logo grande + nombre.
 * Usa el accent del condominio para el anillo / glow suave.
 */
export function CondoBrandHero({
  condominioId,
}: {
  condominioId: Id<"condominios"> | undefined;
}) {
  const condo = useQuery(api.condominios.get, condominioId ? { condominioId } : "skip");
  const { theme } = useCondominio();
  const name = condo?.name ?? "";

  if (!condominioId) return null;

  return (
    <View style={hero.wrap}>
      <View
        style={[
          hero.ring,
          {
            borderColor: `${theme.accent}40`,
            shadowColor: theme.accent,
          },
        ]}
      >
        {condo?.logo ? (
          <Image source={{ uri: condo.logo }} style={hero.logo} resizeMode="cover" />
        ) : name ? (
          <View style={[hero.logoFallback, { backgroundColor: theme.tabActiveBg }]}>
            <Text style={[hero.logoInitials, { color: theme.accent }]}>{initials(name)}</Text>
          </View>
        ) : (
          <View style={[hero.logoFallback, { backgroundColor: theme.tabActiveBg }]} />
        )}
      </View>
      {name ? (
        <Text style={hero.name} numberOfLines={2}>
          {name}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  wrapCompact: {
    marginBottom: 14,
  },
  left: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    marginRight: 12,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: 10,
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingRight: 8,
  },
  backText: {
    color: AuthUI.textSecondary,
    fontSize: 15,
    fontFamily: AuthUI.font.medium,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  logo: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "#F4F4F5",
    marginRight: 8,
  },
  logoFallback: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "rgba(14,14,15,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  logoInitials: {
    color: AuthUI.text,
    fontSize: 9,
    fontFamily: AuthUI.font.bold,
  },
  condoName: {
    flexShrink: 1,
    color: AuthUI.textMuted,
    fontSize: 13,
    fontFamily: AuthUI.font.medium,
  },
  condoNameHero: {
    color: AuthUI.textSecondary,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
  },
  title: {
    color: AuthUI.text,
    fontSize: 28,
    lineHeight: 34,
    fontFamily: AuthUI.font.bold,
    marginTop: 2,
  },
});

const hero = StyleSheet.create({
  wrap: {
    alignItems: "center",
    marginTop: 6,
    marginBottom: 2,
    paddingTop: 4,
  },
  ring: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: AuthUI.white,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#F4F4F5",
  },
  logoFallback: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitials: {
    fontSize: 18,
    fontFamily: AuthUI.font.bold,
  },
  name: {
    marginTop: 12,
    color: AuthUI.text,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: AuthUI.font.semibold,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
