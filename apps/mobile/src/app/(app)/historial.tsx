import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass";
import { fmtFechaCorta } from "@/lib/utils";
import { C } from "@/lib/theme";

const MODULO_ICON: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  comunicado: "megaphone-outline", novedad: "shield-checkmark-outline", reserva: "calendar-outline",
  pqrs: "chatbox-ellipses-outline", factura: "wallet-outline", asamblea: "hammer-outline", documento: "document-text-outline",
};

export default function HistorialScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const { condominioId } = useCondominio();
  const data = useQuery(api.historial.feed, condominioId ? { condominioId, limit: 60 } : "skip");

  return (
    <Section title="Historial">
      {data === undefined ? (
        <ActivityIndicator color={C.textSoft} style={{ marginTop: 30 }} />
      ) : data.length === 0 ? (
        <GlassCard style={{ padding: 40, alignItems: "center", gap: 10 }}>
          <Ionicons name="time-outline" size={32} color={C.textMuted} />
          <Text style={{ color: C.textMuted, fontSize: 14 }}>Sin actividad reciente</Text>
        </GlassCard>
      ) : (
        <View style={{ gap: 0 }}>
          {data.map((e, i) => (
            <View key={e.id} style={{ flexDirection: "row", gap: 12 }}>
              {/* Rail */}
              <View style={{ alignItems: "center", width: 40 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={MODULO_ICON[e.modulo] ?? "ellipse-outline"} size={16} color={C.textSoft} />
                </View>
                {i < data.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: C.border, marginVertical: 4 }} />}
              </View>
              {/* Card */}
              <View style={{ flex: 1, paddingBottom: 12 }}>
                <GlassCard style={{ padding: 14 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{e.titulo}</Text>
                  {e.detalle ? <Text style={{ color: C.textSoft, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{e.detalle}</Text> : null}
                  <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 6 }}>
                    {e.autor ? `${e.autor} · ` : ""}{fmtFechaCorta(e.ts)}
                  </Text>
                </GlassCard>
              </View>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}
