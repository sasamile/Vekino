import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassCard } from "@/components/ui/glass";
import { useCondominio } from "@/context/condominio-context";
import { fmtFechaCorta } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI } from "@/lib/soft-ui";

type Tipo = "factura" | "comunicado" | "documento" | "visitante" | "asamblea";

const META: Record<
  Tipo,
  { icon: React.ComponentProps<typeof Ionicons>["name"]; bg: string; fg: string }
> = {
  factura: { icon: "receipt-outline", bg: SoftUI.infoSoft, fg: SoftUI.blue },
  comunicado: { icon: "megaphone-outline", bg: SoftUI.warningSoft, fg: "#B8860B" },
  documento: { icon: "document-text-outline", bg: SoftUI.bgSecondary, fg: SoftUI.textSecondary },
  visitante: { icon: "person-add-outline", bg: SoftUI.successSoft, fg: SoftUI.success },
  asamblea: { icon: "hammer-outline", bg: SoftUI.brandSoft, fg: SoftUI.brand },
};

/** Bandeja de novedades que abre la campana del encabezado. */
export function NotificacionesSheet({
  visible,
  onClose,
  condominioId,
  vistasAt,
}: {
  visible: boolean;
  onClose: () => void;
  condominioId?: Id<"condominios">;
  /** Marca de "visto" congelada al abrir, para saber cuáles llegaron nuevas. */
  vistasAt: number;
}) {
  const router = useRouter();
  const { theme } = useCondominio();
  const data = useQuery(
    api.notificacionesFeed.feed,
    condominioId && visible ? { condominioId } : "skip",
  );

  const items = data?.items ?? [];

  function abrir(ruta: string) {
    onClose();
    router.push(ruta as never);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="86%">
      <View style={styles.head}>
        <Text style={styles.title}>Novedades</Text>
        <Pressable
          onPress={() => abrir("/(app)/notificaciones")}
          hitSlop={10}
          style={styles.ajustes}
        >
          <Ionicons name="settings-outline" size={18} color={SoftUI.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {data === undefined ? (
          <Text style={styles.vacio}>Cargando…</Text>
        ) : items.length === 0 ? (
          <GlassCard style={styles.vacioCard}>
            <Ionicons
              name="notifications-off-outline"
              size={30}
              color={SoftUI.textSecondary}
            />
            <Text style={styles.vacioTitulo}>Todo al día</Text>
            <Text style={styles.vacio}>
              Aquí te avisamos cuando llegue una factura, un aviso, un documento
              o se autorice un visitante.
            </Text>
          </GlassCard>
        ) : (
          <View style={{ gap: SoftUI.space.sm }}>
            {items.map((n) => {
              const meta = META[n.tipo as Tipo] ?? META.documento;
              const sinLeer = n.createdAt > vistasAt;
              return (
                <Pressable key={n.id} onPress={() => abrir(n.ruta)}>
                  <GlassCard style={styles.card}>
                    <View style={[styles.icono, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon} size={20} color={meta.fg} />
                    </View>
                    <View style={styles.cuerpo}>
                      <Text style={styles.itemTitulo} numberOfLines={2}>
                        {n.titulo}
                      </Text>
                      {n.detalle ? (
                        <Text style={styles.itemDetalle} numberOfLines={1}>
                          {n.detalle}
                        </Text>
                      ) : null}
                      <Text style={styles.fecha}>{fmtFechaCorta(n.createdAt)}</Text>
                    </View>
                    {sinLeer ? (
                      <View style={[styles.punto, { backgroundColor: theme.accent }]} />
                    ) : null}
                  </GlassCard>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SoftUI.padH,
    paddingBottom: SoftUI.space.sm,
  },
  title: {
    color: SoftUI.text,
    fontSize: SoftUI.type.hero.size - 4,
    fontFamily: AuthUI.font.bold,
  },
  ajustes: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.bgSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: SoftUI.padH,
    paddingBottom: SoftUI.space.xxl,
  },
  card: {
    padding: SoftUI.space.base,
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.md,
  },
  icono: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  cuerpo: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  itemTitulo: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size - 1,
    fontFamily: AuthUI.font.semibold,
  },
  itemDetalle: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
  },
  fecha: {
    color: SoftUI.textDisabled,
    fontSize: SoftUI.type.chip.size - 1,
    fontFamily: AuthUI.font.regular,
  },
  punto: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  vacioCard: {
    padding: SoftUI.space.xxl,
    alignItems: "center",
    gap: SoftUI.space.sm,
  },
  vacioTitulo: {
    color: SoftUI.text,
    fontSize: SoftUI.type.caption.size + 2,
    fontFamily: AuthUI.font.semibold,
  },
  vacio: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    lineHeight: SoftUI.type.chip.size + 6,
    fontFamily: AuthUI.font.regular,
    textAlign: "center",
    maxWidth: 280,
  },
});
