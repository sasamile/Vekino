import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { CondominioHeader } from "@/components/ui/condominio-header";
import { MiniBarChart } from "@/components/ui/mini-bar-chart";
import { GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { WavingHand } from "@/components/ui/waving-hand";
import { cop, fmtPeriodo } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";

/** Home admin condominio — mismo estilo pastel que el panel. */
export function AdminCondominioHome({
  firstName,
  saludo,
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
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
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

        <CondominioHeader condominioId={condominioId} title="Resumen" />

        <View style={styles.greetingRow}>
          <Text style={styles.greeting}>
            {saludo}, <Text style={styles.greetingName}>{firstName}</Text>
          </Text>
          <WavingHand size={18} />
        </View>

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
                        <Ionicons name="pin" size={12} color={AuthUI.purple} style={{ marginRight: 6 }} />
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
    </SafeAreaView>
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
      <Text style={[styles.metaValue, accent && { color: AuthUI.purple }]}>{value}</Text>
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 150,
    paddingHorizontal: AuthUI.padH - 7,
  },
  backLink: {
    marginTop: 8,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backText: {
    color: AuthUI.textSecondary,
    fontSize: 14,
    fontFamily: AuthUI.font.medium,
    marginLeft: 2,
  },
  greetingRow: {
    marginTop: 4,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  greeting: {
    color: AuthUI.textMuted,
    fontSize: 15,
    fontFamily: AuthUI.font.regular,
  },
  greetingName: {
    color: AuthUI.text,
    fontFamily: AuthUI.font.semibold,
  },
  kpiCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8D6DC",
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  kpiHalf: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  kpiVLine: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(14,14,15,0.1)",
    marginHorizontal: 14,
  },
  kpiLabel: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.medium,
    marginBottom: 6,
  },
  kpiValue: {
    color: AuthUI.text,
    fontSize: 20,
    fontFamily: AuthUI.font.bold,
  },
  kpiHint: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    marginTop: 4,
  },
  kpiSkeleton: {
    height: 24,
    width: "70%",
    borderRadius: 6,
    backgroundColor: "rgba(14,14,15,0.06)",
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 28,
  },
  metaChip: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D8D6DC",
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    marginHorizontal: 4,
  },
  metaValue: {
    color: AuthUI.text,
    fontSize: 16,
    fontFamily: AuthUI.font.semibold,
  },
  metaLabel: {
    color: AuthUI.textMuted,
    fontSize: 11,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  block: {
    marginBottom: 24,
  },
  blockHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  blockTitle: {
    color: AuthUI.text,
    fontSize: 18,
    fontFamily: AuthUI.font.semibold,
  },
  link: {
    color: AuthUI.purple,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
  },
  surface: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8D6DC",
    overflow: "hidden",
    marginTop: 12,
  },
  listGap: {
    gap: 10,
    marginTop: 12,
  },
  rowBody: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    marginLeft: 12,
    marginRight: 8,
  },
  avisoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8D6DC",
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: "100%",
  },
  avisoTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avisoTitle: {
    color: AuthUI.text,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
    flexShrink: 1,
  },
  empty: {
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyText: {
    color: AuthUI.textMuted,
    fontSize: 14,
    fontFamily: AuthUI.font.regular,
  },
});
