import { View, Text, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { useCondominio } from "@/context/condominio-context";
import { SoftHomeHeader } from "@/components/ui/soft-home-header";
import {
  ScreenBackground,
  GlassCard,
  GlassSection,
} from "@/components/ui/glass";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI } from "@/lib/soft-ui";

const TIPO_ICON: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  carro: "car-outline",
  moto: "bicycle-outline",
  bicicleta: "bicycle-outline",
  otro: "ellipse-outline",
};

export default function VehiculosScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <Authenticated>
          <Inner />
        </Authenticated>
      </ScreenBackground>
    </View>
  );
}

function Inner() {
  const { condominioId, condominioName, canManage } = useCondominio();
  const me = useQuery(api.users.me);

  // Admin: todos. Propietario/residente: solo los de sus unidades (como el portal web).
  const data = useQuery(
    canManage ? api.vehiculos.listByCondominio : api.vehiculos.listMios,
    condominioId ? { condominioId } : "skip",
  );

  const hora = new Date().getHours();
  const saludo =
    hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";

  return (
    <View style={{ flex: 1 }}>
      <SoftHomeHeader
        saludo={saludo}
        displayName={me?.name ?? (canManage ? "Admin" : "Residente")}
        avatarUrl={me?.image}
        badgeLabel={condominioName ?? (canManage ? "Vehículos" : "Mis vehículos")}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {data === undefined ? (
          <ActivityIndicator color={SoftUI.blue} style={{ marginTop: 30 }} />
        ) : data.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Ionicons name="car-outline" size={32} color={SoftUI.textSecondary} />
            <Text style={styles.emptyText}>
              {canManage
                ? "Sin vehículos registrados"
                : "No tienes vehículos vinculados a tu unidad"}
            </Text>
          </GlassCard>
        ) : (
          <GlassSection
            title={`${data.length} vehículo${data.length === 1 ? "" : "s"}${canManage ? "" : " tuyos"}`}
          >
            <View style={{ gap: SoftUI.space.md }}>
              {data.map((v) => (
                <GlassCard key={v._id} style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.iconWrap}>
                      <Ionicons
                        name={TIPO_ICON[v.tipo] ?? "car-outline"}
                        size={22}
                        color={SoftUI.blue}
                      />
                    </View>
                    <View style={styles.body}>
                      <Text style={styles.placa}>{v.placa}</Text>
                      <Text style={styles.meta}>
                        {[v.marca, v.color].filter(Boolean).join(" · ") || v.tipo}
                      </Text>
                    </View>
                    <View style={styles.right}>
                      <Text style={styles.unidadLabel}>Unidad</Text>
                      <Text style={styles.unidadValue}>{v.unidadNumero}</Text>
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          </GlassSection>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 150,
    paddingHorizontal: SoftUI.padH,
    paddingTop: SoftUI.space.md,
  },
  emptyCard: {
    padding: SoftUI.space.xxl,
    alignItems: "center",
    gap: SoftUI.space.md,
  },
  emptyText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.regular,
    textAlign: "center",
  },
  card: {
    padding: SoftUI.space.base,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.md,
  },
  iconWrap: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.infoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  placa: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size + 1,
    fontFamily: AuthUI.font.bold,
    letterSpacing: 0.5,
  },
  meta: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
  },
  right: {
    alignItems: "flex-end",
    gap: 2,
  },
  unidadLabel: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.semibold,
  },
  unidadValue: {
    color: SoftUI.text,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.bold,
  },
});
