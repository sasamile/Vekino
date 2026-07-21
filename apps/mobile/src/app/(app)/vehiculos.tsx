import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass";
import { C } from "@/lib/theme";

const TIPO_ICON: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  carro: "car-outline",
  moto: "bicycle-outline",
  bicicleta: "bicycle-outline",
  otro: "ellipse-outline",
};

export default function VehiculosScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const { condominioId, canManage } = useCondominio();

  // Admin: todos. Propietario/residente: solo los de sus unidades (como el portal web).
  const data = useQuery(
    canManage ? api.vehiculos.listByCondominio : api.vehiculos.listMios,
    condominioId ? { condominioId } : "skip",
  );

  return (
    <Section title={canManage ? "Vehículos" : "Mis vehículos"}>
      {data === undefined ? (
        <ActivityIndicator color={C.textSoft} style={{ marginTop: 30 }} />
      ) : data.length === 0 ? (
        <GlassCard style={{ padding: 40, alignItems: "center", gap: 10 }}>
          <Ionicons name="car-outline" size={32} color={C.textMuted} />
          <Text style={{ color: C.textMuted, fontSize: 14, textAlign: "center" }}>
            {canManage
              ? "Sin vehículos registrados"
              : "No tienes vehículos vinculados a tu unidad"}
          </Text>
        </GlassCard>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "500", marginBottom: 2 }}>
            {data.length} vehículo{data.length === 1 ? "" : "s"}
            {canManage ? "" : " tuyos"}
          </Text>
          {data.map((v) => (
            <GlassCard key={v._id} style={{ padding: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    backgroundColor: C.bgSubtle,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={TIPO_ICON[v.tipo] ?? "car-outline"}
                    size={20}
                    color={C.textSoft}
                  />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text
                    style={{
                      color: C.text,
                      fontSize: 16,
                      fontWeight: "700",
                      letterSpacing: 0.5,
                    }}
                  >
                    {v.placa}
                  </Text>
                  <Text style={{ color: C.textMuted, fontSize: 12 }}>
                    {[v.marca, v.color].filter(Boolean).join(" · ") || v.tipo}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={{ color: C.textSoft, fontSize: 12, fontWeight: "600" }}>
                    Unidad
                  </Text>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>
                    {v.unidadNumero}
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
