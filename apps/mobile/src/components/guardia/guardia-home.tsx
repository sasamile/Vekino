import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { CondominioHeader } from "@/components/ui/condominio-header";
import { GlassCard, GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { WavingHand } from "@/components/ui/waving-hand";
import { AuthUI } from "@/lib/auth-ui";
import { C } from "@/lib/theme";

type Ionicon = React.ComponentProps<typeof Ionicons>["name"];

/** YYYY-MM-DD en zona America/Bogota. */
function fechaHoyBogota() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function startOfTodayBogotaMs() {
  const hoy = fechaHoyBogota();
  // Medianoche Bogotá ≈ UTC-5 (sin DST). Suficiente para filtrar “de hoy”.
  return new Date(`${hoy}T05:00:00.000Z`).getTime();
}

/**
 * Home de portería: resumen del día (contadores + lo relevante).
 * Los módulos viven en la pestaña «Más».
 */
export function GuardiaHome({
  displayName,
  saludo,
  condominioId,
}: {
  displayName: string;
  saludo: string;
  avatarUrl?: string | null;
  condominioId: Id<"condominios">;
}) {
  const router = useRouter();
  const hoy = fechaHoyBogota();
  const hoyStart = startOfTodayBogotaMs();

  const access = useQuery(api.guardia.home, { condominioId });
  const visitantes = useQuery(api.guardia.listVisitantes, { condominioId });
  const turno = useQuery(api.guardia.turnoActivo, { condominioId });
  const paquetes = useQuery(api.guardia.listPaquetes, { condominioId });
  const reservasHoy = useQuery(api.guardia.listReservasDia, {
    condominioId,
    fecha: hoy,
  });
  const avisos = useQuery(api.guardia.listAvisos, { condominioId });
  const novedades = useQuery(api.guardia.listNovedadReportes, { condominioId });

  const adentro = (visitantes ?? []).filter((v) => v.estado === "activo").length;
  const porAprobar = (visitantes ?? []).filter(
    (v) => v.estado === "esperando_aprobacion",
  ).length;
  const paquetesPend = (paquetes ?? []).filter((p) => p.estado === "recibido").length;
  const reservasCount = reservasHoy?.length ?? 0;

  const avisoDestacado = [...(avisos ?? [])]
    .sort(
      (a, b) =>
        Number(b.fijado) - Number(a.fijado) ||
        (b.prioridad === "urgente" ? 1 : 0) - (a.prioridad === "urgente" ? 1 : 0) ||
        b.createdAt - a.createdAt,
    )
    .slice(0, 1)[0];

  const novedadesHoy = (novedades ?? [])
    .filter((n) => n.createdAt >= hoyStart)
    .slice(0, 2);
  const novedadReciente =
    novedadesHoy[0] ??
    (novedades ?? []).slice(0, 1)[0];

  if (access === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.brand} size="large" />
      </View>
    );
  }

  if (!access.allowed) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 24 }} edges={["top"]}>
        <Text style={styles.deniedTitle}>Sin acceso a portería</Text>
        <Text style={styles.deniedBody}>
          Tu usuario no tiene rol de guardia en este condominio.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <CondominioHeader condominioId={condominioId} title="Portería" />

        <View style={styles.greetingRow}>
          <Text style={styles.greeting}>
            {saludo}, <Text style={styles.greetingName}>{displayName}</Text>
          </Text>
          <WavingHand size={22} />
          <View style={{ flex: 1 }} />
          <GlassBadge
            label={turno ? "Turno abierto" : "Sin turno"}
            tone={turno ? "blue" : "neutral"}
          />
        </View>

        {!turno ? (
          <Tap onPress={() => router.push("/(app)/guardia/minuta" as never)}>
            <GlassCard style={styles.turnoCard}>
              <Ionicons name="play-circle-outline" size={28} color={AuthUI.text} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.actionLabel}>Iniciar turno</Text>
                <Text style={styles.actionHint}>
                  Checklist de dotación para abrir la jornada.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={AuthUI.textMuted} />
            </GlassCard>
          </Tap>
        ) : (
          <Tap onPress={() => router.push("/(app)/guardia/minuta" as never)}>
            <GlassCard style={styles.turnoOpenCard}>
              <View style={styles.liveDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionLabel}>
                  Turno de {turno.guardiaNombre}
                </Text>
                <Text style={styles.actionHint}>
                  {turno.rondasCount} ronda{turno.rondasCount === 1 ? "" : "s"} · Abrir minuta
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={AuthUI.textMuted} />
            </GlassCard>
          </Tap>
        )}

        <Text style={styles.sectionTitle}>Hoy en portería</Text>
        <View style={styles.kpiGrid}>
          <KpiTile
            icon="people-outline"
            label="Adentro"
            value={visitantes === undefined ? "…" : String(adentro)}
            hint={porAprobar > 0 ? `${porAprobar} por aprobar` : "Visitantes activos"}
            onPress={() =>
              router.push({
                pathname: "/(app)/guardia/visitantes",
                params: { tab: "actividad" },
              } as never)
            }
          />
          <KpiTile
            icon="cube-outline"
            label="Paquetería"
            value={paquetes === undefined ? "…" : String(paquetesPend)}
            hint="Por entregar"
            onPress={() => router.push("/(app)/guardia/paqueteria" as never)}
          />
          <KpiTile
            icon="calendar-outline"
            label="Reservas"
            value={reservasHoy === undefined ? "…" : String(reservasCount)}
            hint="Programadas hoy"
            onPress={() => router.push("/(app)/guardia/reservas" as never)}
          />
          <KpiTile
            icon="person-add-outline"
            label="Walk-in"
            value={visitantes === undefined ? "…" : String(porAprobar)}
            hint="Esperando aprobación"
            onPress={() =>
              router.push({
                pathname: "/(app)/guardia/visitantes",
                params: { tab: "actividad" },
              } as never)
            }
          />
        </View>

        <Text style={styles.sectionTitle}>Reservas de hoy</Text>
        {reservasHoy === undefined ? (
          <ActivityIndicator color={C.brand} style={{ marginVertical: 12 }} />
        ) : reservasHoy.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No hay reservas aprobadas para hoy.</Text>
          </GlassCard>
        ) : (
          <View style={{ gap: 8, marginBottom: 8 }}>
            {reservasHoy.slice(0, 4).map((r) => (
              <Tap
                key={r._id}
                onPress={() => router.push("/(app)/guardia/reservas" as never)}
              >
                <GlassCard style={styles.listCard}>
                  <View style={styles.listIcon}>
                    <Ionicons name="calendar-outline" size={18} color={AuthUI.text} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.listTitle}>{r.zonaNombre}</Text>
                    <Text style={styles.listMeta}>
                      {r.horaInicio}–{r.horaFin} · Un. {r.unidadNumero} ·{" "}
                      {r.solicitanteNombre}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={AuthUI.textMuted} />
                </GlassCard>
              </Tap>
            ))}
            {reservasHoy.length > 4 ? (
              <Tap onPress={() => router.push("/(app)/guardia/reservas" as never)}>
                <Text style={styles.seeAll}>
                  Ver las {reservasHoy.length} reservas →
                </Text>
              </Tap>
            ) : null}
          </View>
        )}

        <Text style={styles.sectionTitle}>Aviso</Text>
        {avisos === undefined ? (
          <ActivityIndicator color={C.brand} style={{ marginVertical: 12 }} />
        ) : !avisoDestacado ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>Sin avisos para seguridad.</Text>
          </GlassCard>
        ) : (
          <Tap onPress={() => router.push("/(app)/guardia/avisos" as never)}>
            <GlassCard style={styles.listCard}>
              <View style={styles.listIcon}>
                <Ionicons name="megaphone-outline" size={18} color={AuthUI.text} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.badgeRow}>
                  <Text style={styles.listTitle} numberOfLines={1}>
                    {avisoDestacado.titulo}
                  </Text>
                  {avisoDestacado.prioridad === "urgente" ? (
                    <GlassBadge label="Urgente" tone="red" />
                  ) : avisoDestacado.fijado ? (
                    <GlassBadge label="Fijado" tone="blue" />
                  ) : null}
                </View>
                <Text style={styles.listMeta} numberOfLines={2}>
                  {avisoDestacado.cuerpo}
                </Text>
              </View>
            </GlassCard>
          </Tap>
        )}

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Novedades</Text>
        {novedades === undefined ? (
          <ActivityIndicator color={C.brand} style={{ marginVertical: 12 }} />
        ) : !novedadReciente ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>Sin novedades reportadas.</Text>
          </GlassCard>
        ) : (
          <View style={{ gap: 8 }}>
            {(novedadesHoy.length > 0 ? novedadesHoy : [novedadReciente]).map((n) => (
              <Tap
                key={n._id}
                onPress={() => router.push("/(app)/guardia/novedades" as never)}
              >
                <GlassCard style={styles.listCard}>
                  <View style={styles.listIcon}>
                    <Ionicons name="warning-outline" size={18} color={AuthUI.text} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.listTitle} numberOfLines={1}>
                      {n.titulo}
                    </Text>
                    <Text style={styles.listMeta} numberOfLines={2}>
                      {n.descripcion}
                    </Text>
                  </View>
                  <GlassBadge
                    label={n.prioridad}
                    tone={
                      n.prioridad === "alta"
                        ? "red"
                        : n.prioridad === "media"
                          ? "yellow"
                          : "neutral"
                    }
                  />
                </GlassCard>
              </Tap>
            ))}
          </View>
        )}

        <Text style={styles.footerHint}>
          Los módulos de portería están en la pestaña Más.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiTile({
  icon,
  label,
  value,
  hint,
  onPress,
}: {
  icon: Ionicon;
  label: string;
  value: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Tap onPress={onPress} style={styles.kpiTap}>
      <GlassCard style={styles.kpiCard}>
        <Ionicons name={icon} size={18} color={AuthUI.textMuted} />
        <Text style={styles.kpiValue}>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
        <Text style={styles.kpiHint} numberOfLines={1}>
          {hint}
        </Text>
      </GlassCard>
    </Tap>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 130 },
  greetingRow: {
    marginTop: 8,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  greeting: {
    fontSize: 20,
    fontFamily: AuthUI.font.medium,
    color: AuthUI.textMuted,
  },
  greetingName: {
    fontSize: 20,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
  turnoCard: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
  },
  turnoOpenCard: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 10,
    marginTop: 4,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },
  kpiTap: { width: "47.5%" },
  kpiCard: {
    padding: 14,
    gap: 4,
    minHeight: 108,
  },
  kpiValue: {
    fontSize: 26,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
    marginTop: 4,
  },
  kpiLabel: {
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
  kpiHint: {
    fontSize: 11,
    color: AuthUI.textMuted,
    fontFamily: AuthUI.font.regular,
  },
  listCard: {
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.bgSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  listTitle: {
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
  listMeta: {
    fontSize: 12,
    color: AuthUI.textMuted,
    lineHeight: 16,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emptyCard: { padding: 16, marginBottom: 4 },
  emptyText: {
    fontSize: 13,
    color: AuthUI.textMuted,
    textAlign: "center",
  },
  seeAll: {
    fontSize: 13,
    color: C.brand,
    fontFamily: AuthUI.font.medium,
    textAlign: "right",
    marginTop: 2,
  },
  actionLabel: {
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
  actionHint: {
    fontSize: 12,
    color: AuthUI.textMuted,
    fontFamily: AuthUI.font.regular,
  },
  footerHint: {
    marginTop: 22,
    marginBottom: 8,
    textAlign: "center",
    fontSize: 12,
    color: AuthUI.textMuted,
  },
  deniedTitle: {
    fontSize: 18,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
    marginBottom: 8,
  },
  deniedBody: {
    fontSize: 14,
    color: AuthUI.textMuted,
  },
});
