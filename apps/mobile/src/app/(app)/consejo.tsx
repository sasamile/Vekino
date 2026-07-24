import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard, GlassBadge } from "@/components/ui/glass";
import { initials } from "@/lib/utils";
import { C } from "@/lib/theme";

export default function ConsejoScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const { condominioId } = useCondominio();
  const miembros = useQuery(api.consejo.listMiembros, condominioId ? { condominioId } : "skip");
  const sesiones = useQuery(api.consejo.listSesiones, condominioId ? { condominioId } : "skip");

  return (
    <Section title="Consejo">
      {miembros === undefined ? (
        <ActivityIndicator color={C.textSoft} style={{ marginTop: 30 }} />
      ) : (
        <>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: "600", letterSpacing: -0.2, marginBottom: 10 }}>Miembros</Text>
          {miembros.length === 0 ? (
            <GlassCard style={{ padding: 32, alignItems: "center", gap: 10 }}>
              <Ionicons name="people-outline" size={30} color={C.textMuted} />
              <Text style={{ color: C.textMuted, fontSize: 14 }}>Sin miembros del consejo</Text>
            </GlassCard>
          ) : (
            <View style={{ gap: 10 }}>
              {miembros.map((m) => (
                <GlassCard key={m.membershipId} style={{ padding: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: C.textSoft, fontSize: 14, fontWeight: "700" }}>{initials(m.nombre)}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>{m.nombre}</Text>
                      {(m.unidades.length > 0 || m.email) && (
                        <Text style={{ color: C.textMuted, fontSize: 12 }}>
                          {[m.unidades.join(", ") || null, m.email].filter(Boolean).join(" · ")}
                        </Text>
                      )}
                    </View>
                    <GlassBadge label="Junta" tone="blue" />
                  </View>
                </GlassCard>
              ))}
            </View>
          )}

          <Text style={{ color: C.text, fontSize: 15, fontWeight: "600", letterSpacing: -0.2, marginTop: 24, marginBottom: 10 }}>Sesiones</Text>
          {(sesiones ?? []).length === 0 ? (
            <GlassCard style={{ padding: 24, alignItems: "center" }}>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>Sin sesiones registradas</Text>
            </GlassCard>
          ) : (
            <View style={{ gap: 10 }}>
              {(sesiones ?? []).map((s) => (
                <GlassCard key={s._id} style={{ padding: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name="calendar-outline" size={16} color={C.textSoft} />
                    <Text style={{ color: C.text, fontSize: 14, fontWeight: "600", flex: 1 }} numberOfLines={1}>{s.titulo ?? "Sesión"}</Text>
                    <Text style={{ color: C.textMuted, fontSize: 12 }}>{s.fecha}</Text>
                  </View>
                </GlassCard>
              ))}
            </View>
          )}
        </>
      )}
    </Section>
  );
}
