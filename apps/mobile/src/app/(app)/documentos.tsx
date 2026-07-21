import { View, Text, ActivityIndicator, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard, GlassBadge } from "@/components/ui/glass";
import { fmtFechaCorta } from "@/lib/utils";
import { C } from "@/lib/theme";

const CAT_LABEL: Record<string, string> = {
  reglamento: "Reglamento", acta: "Acta", contrato: "Contrato", comunicado: "Comunicado", financiero: "Financiero", otro: "Otro",
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentosScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const { condominioId } = useCondominio();
  const data = useQuery(api.documentos.listByCondominio, condominioId ? { condominioId } : "skip");

  return (
    <Section title="Documentos">
      {data === undefined ? (
        <ActivityIndicator color={C.textSoft} style={{ marginTop: 30 }} />
      ) : data.length === 0 ? (
        <GlassCard style={{ padding: 40, alignItems: "center", gap: 10 }}>
          <Ionicons name="document-text-outline" size={32} color={C.textMuted} />
          <Text style={{ color: C.textMuted, fontSize: 14 }}>Sin documentos publicados</Text>
        </GlassCard>
      ) : (
        <View style={{ gap: 10 }}>
          {data.map((d) => (
            <Pressable key={d._id} onPress={() => d.url && Linking.openURL(d.url)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <GlassCard style={{ padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="document-text" size={20} color={C.textSoft} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>{d.nombre}</Text>
                    <Text style={{ color: C.textMuted, fontSize: 12 }}>
                      {fmtSize(d.tamanio)} · {d.autorNombre} · {fmtFechaCorta(d.createdAt)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <GlassBadge label={CAT_LABEL[d.categoria] ?? d.categoria} tone="blue" />
                    <Ionicons name="download-outline" size={16} color={C.textMuted} />
                  </View>
                </View>
              </GlassCard>
            </Pressable>
          ))}
        </View>
      )}
    </Section>
  );
}
