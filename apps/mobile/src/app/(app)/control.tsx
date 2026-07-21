import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard, GlassBadge } from "@/components/ui/glass";
import { fmtFechaCorta } from "@/lib/utils";
import { C } from "@/lib/theme";

const TIPO_ICON: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  visita: "walk-outline", paquete: "cube-outline", incidente: "warning-outline", mantenimiento: "construct-outline", otro: "ellipse-outline",
};
const TIPO_TONE: Record<string, "blue" | "green" | "red" | "yellow" | "neutral"> = {
  visita: "blue", paquete: "green", incidente: "red", mantenimiento: "yellow", otro: "neutral",
};
const TURNO_LABEL: Record<string, string> = { mañana: "Mañana", tarde: "Tarde", noche: "Noche" };

export default function ControlScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const { condominioId } = useCondominio();
  const data = useQuery(api.novedades.listByCondominio, condominioId ? { condominioId } : "skip");

  return (
    <Section title="Control">
      {data === undefined ? (
        <ActivityIndicator color={C.textSoft} style={{ marginTop: 30 }} />
      ) : data.length === 0 ? (
        <GlassCard style={{ padding: 40, alignItems: "center", gap: 10 }}>
          <Ionicons name="shield-checkmark-outline" size={32} color={C.textMuted} />
          <Text style={{ color: C.textMuted, fontSize: 14, textAlign: "center" }}>Sin novedades de portería</Text>
        </GlassCard>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "500", marginBottom: 2 }}>Novedades de portería</Text>
          {data.map((n) => (
            <GlassCard key={n._id} style={{ padding: 16 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={TIPO_ICON[n.tipo] ?? "ellipse-outline"} size={19} color={C.textSoft} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <GlassBadge label={n.tipo} tone={TIPO_TONE[n.tipo] ?? "neutral"} />
                    {n.unidadNumero && <Text style={{ color: C.textSoft, fontSize: 12, fontWeight: "600" }}>Unidad {n.unidadNumero}</Text>}
                  </View>
                  <Text style={{ color: C.text, fontSize: 14, lineHeight: 19 }}>{n.descripcion}</Text>
                  <Text style={{ color: C.textMuted, fontSize: 11 }}>
                    {n.autorNombre} · {TURNO_LABEL[n.turno] ?? n.turno} · {fmtFechaCorta(n.createdAt)}
                  </Text>
                </View>
              </View>
            </GlassCard>
          ))}
        </View>
      )}
    </Section>
  );
}
