import { View, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard, GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";

const ESTADO_TONE: Record<string, "blue" | "green" | "yellow" | "neutral" | "red"> = {
  programada: "blue",
  en_curso: "yellow",
  finalizada: "green",
  cancelada: "red",
};
const ESTADO_LABEL: Record<string, string> = {
  programada: "Programada",
  en_curso: "En curso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export default function AsambleasScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const router = useRouter();
  const { condominioId, theme } = useCondominio();
  const data = useQuery(api.asambleas.listByCondominio, condominioId ? { condominioId } : "skip");

  return (
    <Section
      title="Asambleas"
      right={
        <Tap onPress={() => router.push("/(app)/asambleas/apoderado" as never)}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: theme.tabActiveBg,
            }}
          >
            <Ionicons name="key-outline" size={16} color={theme.accent} />
            <Text style={{ color: theme.accent, fontSize: 12, fontFamily: AuthUI.font.semibold }}>
              Código
            </Text>
          </View>
        </Tap>
      }
    >
      {data === undefined ? (
        <ActivityIndicator color={C.textSoft} style={{ marginTop: 30 }} />
      ) : data.length === 0 ? (
        <GlassCard style={{ padding: 40, alignItems: "center", gap: 10 }}>
          <Ionicons name="people-outline" size={32} color={C.textMuted} />
          <Text style={{ color: C.textMuted, fontSize: 14 }}>Sin asambleas registradas</Text>
        </GlassCard>
      ) : (
        <View style={{ gap: 10 }}>
          {data.map((a) => (
            <Tap key={a._id} onPress={() => router.push(`/(app)/asambleas/${a._id}` as never)}>
              <GlassCard style={{ padding: 16 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 10, gap: 3 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }} numberOfLines={2}>
                      {a.titulo}
                    </Text>
                    <Text
                      style={{ color: C.textMuted, fontSize: 12, textTransform: "capitalize" }}
                    >
                      {a.tipo} · {a.modalidad}
                    </Text>
                  </View>
                  <GlassBadge
                    label={ESTADO_LABEL[a.estado] ?? a.estado}
                    tone={ESTADO_TONE[a.estado] ?? "neutral"}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 16, marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="calendar-outline" size={13} color={C.textMuted} />
                    <Text style={{ color: C.textSoft, fontSize: 12 }}>
                      {a.fecha} · {a.hora}
                    </Text>
                  </View>
                  {a.lugar ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                      <Ionicons name="location-outline" size={13} color={C.textMuted} />
                      <Text style={{ color: C.textSoft, fontSize: 12 }} numberOfLines={1}>
                        {a.lugar}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 14 }}>
                    <Text style={{ color: C.textMuted, fontSize: 11 }}>
                      {a.votacionesCount} votación(es)
                    </Text>
                    {a.agenda.length > 0 ? (
                      <Text style={{ color: C.textMuted, fontSize: 11 }}>
                        {a.agenda.length} punto(s)
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                </View>
              </GlassCard>
            </Tap>
          ))}
        </View>
      )}
    </Section>
  );
}
