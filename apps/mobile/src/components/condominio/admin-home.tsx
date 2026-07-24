import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { SoftHomeHeader } from "@/components/ui/soft-home-header";
import { MiniBarChart } from "@/components/ui/mini-bar-chart";
import { GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { cop, fmtPeriodo } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI, softShadow } from "@/lib/soft-ui";

/** Home admin condominio — Soft UI + liquid glass header. */
export function AdminCondominioHome({
  firstName,
  saludo,
  avatarUrl,
  condominioId,
  condominioName,
  isSuperadmin,
  onClearCondominio,
}: {
  firstName: string;
  saludo: string;
  avatarUrl?: string | null;
  condominioId: Id<"condominios">;
  condominioName: string | null;
  isSuperadmin: boolean;
  onClearCondominio: () => void;
}) {
  const router = useRouter();
  const periodos = useQuery(api.facturas.listPeriodos, { condominioId });
  const periodo = periodos?.[0] ?? "";
  const resumen = useQuery(
    api.facturas.resumenPeriodo,
    periodo ? { condominioId, periodo } : "skip",
  );
  const serie = useQuery(api.facturas.serie, { condominioId });
  const reservasPend = useQuery(api.reservas.countPendientes, { condominioId });
  const comunicados = useQuery(api.comunicados.listRecent, {
    condominioId,
    limit: 4,
  });

  const pctPagadas =
    resumen && resumen.total > 0 ? Math.round((resumen.pagadas / resumen.total) * 100) : 0;
  const chartData = (serie ?? []).map((s) => ({ periodo: s.periodo, value: s.sumaPagado }));
  const loadingResumen = !!periodo && resumen === undefined;

  return (
    <View style={{ flex: 1 }}>
      <SoftHomeHeader
        saludo={saludo}
        displayName={firstName}
        avatarUrl={avatarUrl}
        badgeLabel={condominioName ?? "Admin"}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {isSuperadmin && (
          <View
            style={styles.backLink}
            onTouchEnd={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClearCondominio();
            }}
          >
            <Ionicons name="chevron-back" size={16} color={AuthUI.textSecondary} />
            <Text style={styles.backText}>Panel maestro</Text>
          </View>
        )}

        <Text style={styles.pageTitle}>Resumen</Text>

        <View style={styles.kpiCard}>
          <View style={styles.kpiHalf}>
            <Text style={styles.kpiLabel}>Recaudo del período</Text>
            {loadingResumen ? (
              <View style={styles.kpiSkeleton} />
            ) : (
              <Text style={styles.kpiValue} numberOfLines={1}>
                {resumen ? cop(resumen.sumaPagado) : "—"}
              </Text>
            )}
            {periodo ? <Text style={styles.kpiHint}>{fmtPeriodo(periodo)}</Text> : null}
          </View>
          <View style={styles.kpiVLine} />
          <View style={styles.kpiHalf}>
            <Text style={styles.kpiLabel}>Cartera</Text>
            {loadingResumen ? (
              <View style={styles.kpiSkeleton} />
            ) : (
              <Text style={styles.kpiValue} numberOfLines={1}>
                {resumen ? cop(resumen.sumaTotalAPagar) : "—"}
              </Text>
            )}
            <Text style={styles.kpiHint}>Por cobrar</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <MetaChip label="Pagadas" value={`${pctPagadas}%`} />
          <MetaChip label="Pendientes" value={resumen ? String(resumen.pendientes) : "—"} />
          <MetaChip label="Reservas" value={reservasPend === undefined ? "…" : String(reservasPend)} accent={(reservasPend ?? 0) > 0} />
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Recaudo por período</Text>
          <View style={styles.surface}>
            {serie === undefined ? (
              <ActivityIndicator color={AuthUI.textMuted} style={{ marginVertical: 48 }} />
            ) : (
              <View style={{ padding: 16 }}>
                <MiniBarChart data={chartData} height={148} />
              </View>
            )}
          </View>
        </View>

        <View style={styles.block}>
          <View style={styles.blockHead}>
            <Text style={styles.blockTitle}>Últimos avisos</Text>
            <Text
              style={styles.link}
              onPress={() => router.push("/(app)/(tabs)/comunicados" as never)}
            >
              Ver todos
            </Text>
          </View>
          <View style={styles.listGap}>
            {comunicados === undefined ? (
              <View style={styles.surface}>
                <ActivityIndicator color={AuthUI.textMuted} style={{ marginVertical: 28 }} />
              </View>
            ) : (comunicados ?? []).length === 0 ? (
              <View style={[styles.surface, styles.empty]}>
                <Text style={styles.emptyText}>Sin comunicados todavía</Text>
              </View>
            ) : (
              (comunicados ?? []).map((c) => (
                <Tap
                  key={c._id}
                  style={styles.avisoRow}
                  onPress={() => router.push("/(app)/(tabs)/comunicados" as never)}
                >
                  <View style={styles.rowBody}>
                    <View style={styles.avisoTitleRow}>
                      {c.fijado ? (
                        <Ionicons name="pin" size={12} color={SoftUI.blue} style={{ marginRight: 6 }} />
                      ) : null}
                      <Text style={styles.avisoTitle} numberOfLines={1}>
                        {c.titulo}
                      </Text>
                    </View>
                    {c.prioridad !== "normal" ? (
                      <View style={{ marginTop: 6 }}>
                        <GlassBadge
                          label={c.prioridad === "urgente" ? "Urgente" : "Importante"}
                          tone={c.prioridad === "urgente" ? "red" : "yellow"}
                        />
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={AuthUI.textMuted} />
                </Tap>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function MetaChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.metaChip}>
      <Text style={[styles.metaValue, accent && { color: SoftUI.blue }]}>{value}</Text>
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 150,
    paddingHorizontal: SoftUI.padH,
  },
  backLink: {
    marginTop: 8,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: SoftUI.touch,
  },
  backText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.medium,
    marginLeft: 2,
  },
  greetingRow: {
    marginTop: SoftUI.space.xs,
    marginBottom: SoftUI.space.lg,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SoftUI.space.sm,
  },
  greeting: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.regular,
  },
  greetingName: {
    color: SoftUI.text,
    fontFamily: AuthUI.font.semibold,
  },
  pageTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.hero.size,
    lineHeight: SoftUI.type.hero.line,
    fontFamily: AuthUI.font.bold,
    marginBottom: SoftUI.space.base,
    marginTop: SoftUI.space.sm,
  },
  kpiCard: {
    flexDirection: "row",
    backgroundColor: SoftUI.card,
    borderRadius: SoftUI.radius.card,
    paddingVertical: SoftUI.space.lg,
    paddingHorizontal: SoftUI.space.base,
    marginBottom: SoftUI.space.md,
    ...softShadow,
  },
  kpiHalf: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  kpiVLine: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: SoftUI.divider,
    marginHorizontal: SoftUI.space.md,
  },
  kpiLabel: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.medium,
    marginBottom: SoftUI.space.sm,
  },
  kpiValue: {
    color: SoftUI.text,
    fontSize: SoftUI.type.section.size,
    fontFamily: AuthUI.font.bold,
  },
  kpiHint: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
    marginTop: SoftUI.space.xs,
  },
  kpiSkeleton: {
    height: 24,
    width: "70%",
    borderRadius: SoftUI.radius.icon,
    backgroundColor: SoftUI.bgSecondary,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: SoftUI.space.xxl,
    marginHorizontal: -4,
  },
  metaChip: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    backgroundColor: SoftUI.card,
    borderRadius: SoftUI.radius.cardSm,
    paddingVertical: SoftUI.space.md,
    paddingHorizontal: SoftUI.space.sm,
    alignItems: "center",
    marginHorizontal: 4,
    ...softShadow,
  },
  metaValue: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size + 1,
    fontFamily: AuthUI.font.semibold,
  },
  metaLabel: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size - 1,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  block: {
    marginBottom: SoftUI.space.xl,
  },
  blockHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SoftUI.space.md,
  },
  blockTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.section.size,
    lineHeight: SoftUI.type.section.line,
    fontFamily: AuthUI.font.semibold,
  },
  link: {
    color: SoftUI.blue,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.semibold,
  },
  surface: {
    backgroundColor: SoftUI.card,
    borderRadius: SoftUI.radius.card,
    overflow: "hidden",
    marginTop: SoftUI.space.md,
    ...softShadow,
  },
  listGap: {
    gap: SoftUI.space.md,
    marginTop: SoftUI.space.md,
  },
  rowBody: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    marginLeft: SoftUI.space.md,
    marginRight: SoftUI.space.sm,
  },
  avisoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SoftUI.card,
    borderRadius: SoftUI.radius.cardSm,
    paddingHorizontal: SoftUI.space.base,
    paddingVertical: SoftUI.space.base,
    width: "100%",
    ...softShadow,
  },
  avisoTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avisoTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.semibold,
    flexShrink: 1,
  },
  empty: {
    paddingVertical: SoftUI.space.xxl,
    alignItems: "center",
  },
  emptyText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.regular,
  },
});
