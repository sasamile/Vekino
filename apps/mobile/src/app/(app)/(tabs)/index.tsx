import { useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  ScreenBackground,
  GlassCard,
  GlassBadge,
  GlassSection,
} from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { WavingHand } from "@/components/ui/waving-hand";
import { CondoBrandHero } from "@/components/ui/condominio-header";
import { cop, fmtPeriodo } from "@/lib/utils";
import { useCondominio } from "@/context/condominio-context";
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";
import { SuperadminPanel } from "@/components/platform/superadmin-panel";
import { AdminCondominioHome } from "@/components/condominio/admin-home";
import { GuardiaHome } from "@/components/guardia/guardia-home";

const ESTADO_TONE: Record<string, "yellow" | "green" | "red" | "neutral" | "blue"> = {
  pendiente: "yellow", pagada: "green", vencida: "red", abonada: "blue",
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente", pagada: "Pagada", vencida: "Vencida", abonada: "Abonada",
};
export default function HomeScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <Authenticated>
          <HomeContent />
        </Authenticated>
      </ScreenBackground>
    </View>
  );
}

function HomeContent() {
  const ensureProfile = useMutation(api.users.ensureProfile);
  const me = useQuery(api.users.me);
  const { condominioId, condominioName, isSuperadmin, canManage, isGuardia, isLoading, clearCondominio } = useCondominio();

  useEffect(() => {
    ensureProfile().catch(() => {});
  }, [ensureProfile]);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";
  const displayName = me ? greetingName(me) : "";

  if (!me || isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.brand} size="large" />
      </View>
    );
  }

  if (isSuperadmin && !condominioId) {
    return <SuperadminPanel firstName={displayName} saludo={saludo} />;
  }

  if (canManage && condominioId) {
    return (
      <AdminCondominioHome
        firstName={displayName}
        saludo={saludo}
        condominioId={condominioId}
        condominioName={condominioName}
        isSuperadmin={isSuperadmin}
        onClearCondominio={clearCondominio}
      />
    );
  }

  if (isGuardia && condominioId) {
    return (
      <GuardiaHome
        displayName={displayName}
        saludo={saludo}
        condominioId={condominioId}
      />
    );
  }

  return (
    <ResidentHome
      firstName={displayName}
      saludo={saludo}
      condominioId={condominioId}
    />
  );
}

/* ─────────── Saludo con avatar ─────────── */
/** Nombre + apellido para el saludo (evita quedar solo con el apellido). */
function greetingName(me: {
  firstName?: string | null;
  lastName?: string | null;
  name: string;
}) {
  const structured = [me.firstName, me.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  const full = (me.name ?? "").trim();
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  // Preferir nombre+apellido; si solo hay un campo corto, usar el nombre completo.
  const pick =
    words(structured) >= 2 ? structured : words(full) >= 2 ? full : structured || full;
  return formatDisplayName(pick);
}

function formatDisplayName(name: string) {
  const t = name.trim();
  if (!t) return t;
  // Si viene todo en mayúsculas, pasa a Title Case
  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t)) {
    return t
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return t;
}

function Saludo({
  saludo,
  firstName,
  badge,
}: {
  saludo: string;
  firstName: string;
  avatarUrl?: string | null;
  badge?: React.ReactNode;
}) {
  const displayName = formatDisplayName(firstName);
  return (
    <View style={{ marginTop: 2, marginBottom: 20, paddingTop: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <Text
          style={{
            color: AuthUI.textMuted,
            fontSize: 20,
            lineHeight: 26,
            fontFamily: AuthUI.font.medium,
          }}
        >
          {saludo}
        </Text>
        <Text
          style={{
            color: AuthUI.text,
            fontSize: 22,
            lineHeight: 26,
            fontFamily: AuthUI.font.semibold,
          }}
        >
          {displayName}
        </Text>
        <WavingHand size={22} />
      </View>
      {badge}
    </View>
  );
}

/* ─────────────── Home RESIDENTE ─────────────── */

function ResidentHome({
  firstName,
  saludo,
  condominioId,
}: {
  firstName: string;
  saludo: string;
  condominioId: Id<"condominios"> | undefined;
}) {
  const router = useRouter();
  const { theme } = useCondominio();
  const facturas = useQuery(api.facturas.listMia, condominioId ? { condominioId } : "skip");
  const comunicados = useQuery(
    api.comunicados.listRecent,
    condominioId ? { condominioId, limit: 3 } : "skip",
  );

  const pendientes = (facturas ?? []).filter((f) => f.estado === "pendiente");
  const totalAPagar = pendientes.reduce((s, f) => s + f.totalAPagar, 0);
  const linkColor = theme.accent;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 130, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {condominioId ? <CondoBrandHero condominioId={condominioId} /> : null}
        <Saludo saludo={saludo} firstName={firstName} />

        {condominioId && (
          <GlassCard
            style={{
              padding: 16,
              marginBottom: 24,
              borderLeftWidth: 3,
              borderLeftColor: theme.accent,
              backgroundColor: AuthUI.white,
              overflow: "hidden",
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -40,
                right: -30,
                width: 120,
                height: 120,
                borderRadius: 60,
                backgroundColor: theme.glowB,
                opacity: 0.35,
              }}
            />
            <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "500" }}>Total a pagar</Text>
            {facturas === undefined ? (
              <ActivityIndicator color={C.textSoft} style={{ alignSelf: "flex-start", marginVertical: 8 }} />
            ) : (
              <Text style={{ color: C.text, fontSize: 28, fontWeight: "600", letterSpacing: -0.8, marginTop: 4 }}>
                {cop(totalAPagar)}
              </Text>
            )}
            <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>
              {pendientes.length} factura{pendientes.length === 1 ? "" : "s"} pendiente
              {pendientes.length === 1 ? "" : "s"}
            </Text>
          </GlassCard>
        )}

        <GlassSection title="Acceso rápido">
          <View
            style={{
              flexDirection: "row",
              alignItems: "stretch",
              alignSelf: "stretch",
              width: "100%",
              gap: 6,
            }}
          >
            {[
              { icon: "wallet-outline" as const, label: "Facturas", route: "/(app)/(tabs)/facturas" },
              { icon: "megaphone-outline" as const, label: "Avisos", route: "/(app)/(tabs)/comunicados" },
              { icon: "calendar-outline" as const, label: "Reservas", route: "/(app)/reservas" },
              { icon: "person-add-outline" as const, label: "Visitas", route: "/(app)/visitantes" },
              { icon: "chatbox-ellipses-outline" as const, label: "PQRS", route: "/(app)/pqrs" },
            ].map((a) => (
              <View key={a.label} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
                <Tap
                  style={{ width: "100%" }}
                  onPress={() => router.push(a.route as never)}
                >
                  <View
                    style={{
                      width: "100%",
                      minHeight: 78,
                      paddingVertical: 12,
                      paddingHorizontal: 2,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      borderRadius: 16,
                      backgroundColor: "#FFFFFF",
                      borderWidth: 1,
                      borderColor: "rgba(216,214,220,0.9)",
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: theme.tabActiveBg,
                      }}
                    >
                      <Ionicons name={a.icon} size={17} color={theme.accent} />
                    </View>
                    <Text
                      style={{
                        color: C.textSoft,
                        fontSize: 10,
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                      numberOfLines={1}
                    >
                      {a.label}
                    </Text>
                  </View>
                </Tap>
              </View>
            ))}
          </View>
        </GlassSection>

        {/* Mis facturas */}
        {condominioId && (
          <View style={{ marginTop: 24 }}>
            <GlassSection
              title="Mis facturas"
              action={
                <Pressable onPress={() => router.push("/(app)/(tabs)/facturas" as never)}>
                  <Text style={{ color: linkColor, fontSize: 13, fontWeight: "600" }}>Ver todas</Text>
                </Pressable>
              }
            >
              {facturas === undefined ? (
                <ActivityIndicator color={C.textSoft} />
              ) : facturas.length === 0 ? (
                <GlassCard style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: C.textMuted, fontSize: 14 }}>Sin facturas registradas</Text>
                </GlassCard>
              ) : (
                <View style={{ gap: 10 }}>
                  {facturas.slice(0, 4).map((f) => (
                    <GlassCard key={f._id} style={{ padding: 16 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ gap: 3, flex: 1 }}>
                          <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>{fmtPeriodo(f.periodo)}</Text>
                          <Text style={{ color: C.textMuted, fontSize: 12 }}>
                            {formatDisplayName(f.residenteNombre)}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 6 }}>
                          <Text style={{ color: C.text, fontSize: 15, fontWeight: "700" }}>{cop(f.totalAPagar)}</Text>
                          <GlassBadge label={ESTADO_LABEL[f.estado] ?? f.estado} tone={ESTADO_TONE[f.estado] ?? "neutral"} />
                        </View>
                      </View>
                    </GlassCard>
                  ))}
                </View>
              )}
            </GlassSection>
          </View>
        )}

        {/* Últimos avisos */}
        {condominioId && (
          <View style={{ marginTop: 24 }}>
            <GlassSection
              title="Últimos avisos"
              action={
                <Pressable onPress={() => router.push("/(app)/(tabs)/comunicados" as never)}>
                  <Text style={{ color: linkColor, fontSize: 13, fontWeight: "600" }}>Ver todos</Text>
                </Pressable>
              }
            >
              {comunicados === undefined ? (
                <ActivityIndicator color={C.textSoft} />
              ) : (comunicados ?? []).length === 0 ? (
                <GlassCard style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ color: C.textMuted, fontSize: 14 }}>Sin comunicados</Text>
                </GlassCard>
              ) : (
                <View style={{ gap: 10 }}>
                  {(comunicados ?? []).slice(0, 3).map((c) => (
                    <GlassCard key={c._id} style={{ padding: 16 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        {c.fijado && <Ionicons name="pin" size={12} color={theme.accent} />}
                        <Text style={{ color: C.text, fontSize: 14, fontWeight: "600", flex: 1 }} numberOfLines={1}>{c.titulo}</Text>
                        {c.prioridad !== "normal" && (
                          <GlassBadge label={c.prioridad === "urgente" ? "Urgente" : "Importante"} tone={c.prioridad === "urgente" ? "red" : "yellow"} />
                        )}
                      </View>
                    </GlassCard>
                  ))}
                </View>
              )}
            </GlassSection>
          </View>
        )}

        {!condominioId && (
          <GlassCard style={{ padding: 28, alignItems: "center", gap: 12, marginTop: 20 }}>
            <Ionicons name="business-outline" size={36} color={C.textMuted} />
            <Text style={{ color: C.textSoft, fontSize: 15, textAlign: "center" }}>
              No estás vinculado a ningún condominio.{"\n"}Contacta a tu administrador.
            </Text>
          </GlassCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
