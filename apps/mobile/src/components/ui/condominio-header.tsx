import { View, Text, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { initials } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI, softShadow } from "@/lib/soft-ui";
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
    marginTop: SoftUI.space.md,
    marginBottom: SoftUI.space.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  wrapCompact: {
    marginBottom: SoftUI.space.base,
  },
  left: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    marginRight: SoftUI.space.md,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: SoftUI.space.md,
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingRight: SoftUI.space.sm,
    minHeight: SoftUI.touch,
  },
  backText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.medium,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SoftUI.space.md,
  },
  logo: {
    width: SoftUI.space.xl,
    height: SoftUI.space.xl,
    borderRadius: SoftUI.radius.icon,
    backgroundColor: SoftUI.bgSecondary,
    marginRight: SoftUI.space.sm,
  },
  logoFallback: {
    width: SoftUI.space.xl,
    height: SoftUI.space.xl,
    borderRadius: SoftUI.radius.icon,
    backgroundColor: SoftUI.infoSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SoftUI.space.sm,
  },
  logoInitials: {
    color: SoftUI.blue,
    fontSize: 9,
    fontFamily: AuthUI.font.bold,
  },
  condoName: {
    flexShrink: 1,
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.medium,
  },
  condoNameHero: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.semibold,
  },
  title: {
    color: SoftUI.text,
    fontSize: SoftUI.type.hero.size,
    lineHeight: SoftUI.type.hero.line,
    fontFamily: AuthUI.font.bold,
    marginTop: 2,
  },
});

const hero = StyleSheet.create({
  wrap: {
    alignItems: "center",
    marginTop: SoftUI.space.sm,
    marginBottom: SoftUI.space.xs,
    paddingTop: SoftUI.space.xs,
  },
  ring: {
    width: SoftUI.avatar + 30,
    height: SoftUI.avatar + 30,
    borderRadius: SoftUI.radius.cardSm,
    backgroundColor: SoftUI.white,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  logo: {
    width: SoftUI.avatar + 12,
    height: SoftUI.avatar + 12,
    borderRadius: SoftUI.radius.icon + 2,
    backgroundColor: SoftUI.bgSecondary,
  },
  logoFallback: {
    width: SoftUI.avatar + 12,
    height: SoftUI.avatar + 12,
    borderRadius: SoftUI.radius.icon + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitials: {
    fontSize: SoftUI.type.cardTitle.size,
    fontFamily: AuthUI.font.bold,
  },
  name: {
    marginTop: SoftUI.space.md,
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size + 1,
    lineHeight: SoftUI.type.body.line,
    fontFamily: AuthUI.font.semibold,
    textAlign: "center",
    paddingHorizontal: SoftUI.space.xl,
  },
});
