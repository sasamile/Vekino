import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Authenticated } from "convex/react";
import { ScreenBackground } from "@/components/ui/glass";
import { useCondominio } from "@/context/condominio-context";
import { CondominioHeader } from "@/components/ui/condominio-header";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";
import { NoCondominioScreen } from "@/components/ui/no-condominio";

type Ionicon = React.ComponentProps<typeof Ionicons>["name"];

type Modulo = {
  label: string;
  hint: string;
  icon: Ionicon;
  route: string;
  /** Solo administradores / junta / contadora */
  adminOnly?: boolean;
};

/**
 * En «Más» solo módulos que NO están en el tab bar
 * (Inicio, Facturas, Avisos, Más, Perfil).
 * Alineado con el portal web: Visitantes, Vehículos, PQRS, Reservas, etc.
 */
const GRUPOS: { title: string; items: Modulo[] }[] = [
  {
    title: "Tu día a día",
    items: [
      { label: "Reservas", hint: "Zonas comunes", icon: "calendar-outline", route: "/(app)/reservas" },
      { label: "Visitantes", hint: "Autorizar ingreso", icon: "person-add-outline", route: "/(app)/visitantes" },
      { label: "Vehículos", hint: "Parqueaderos", icon: "car-outline", route: "/(app)/vehiculos" },
      { label: "PQRS", hint: "Solicitudes", icon: "chatbox-ellipses-outline", route: "/(app)/pqrs" },
    ],
  },
  {
    title: "Comunidad",
    items: [
      { label: "Residentes", hint: "Usuarios del condo", icon: "people-outline", route: "/(app)/residentes", adminOnly: true },
      { label: "Unidades", hint: "Inmuebles", icon: "home-outline", route: "/(app)/unidades", adminOnly: true },
      { label: "Asambleas", hint: "Convocatorias", icon: "hammer-outline", route: "/(app)/asambleas" },
      { label: "Consejo", hint: "Junta directiva", icon: "people-circle-outline", route: "/(app)/consejo", adminOnly: true },
    ],
  },
  {
    title: "Operación",
    items: [
      { label: "Documentos", hint: "Archivos", icon: "document-text-outline", route: "/(app)/documentos" },
      { label: "Control", hint: "Accesos", icon: "shield-checkmark-outline", route: "/(app)/control", adminOnly: true },
    ],
  },
  {
    title: "Análisis",
    items: [
      { label: "Reportes", hint: "Indicadores", icon: "bar-chart-outline", route: "/(app)/reportes", adminOnly: true },
      { label: "Historial", hint: "Actividad", icon: "time-outline", route: "/(app)/historial", adminOnly: true },
    ],
  },
];

export default function MasScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <Authenticated>
          <MasContent />
        </Authenticated>
      </ScreenBackground>
    </View>
  );
}

function MasContent() {
  const router = useRouter();
  const { condominioId, canManage, isGuardia, isLoading } = useCondominio();

  if (isLoading) return <View style={{ flex: 1 }} />;
  if (!condominioId) return <NoCondominioScreen />;

  if (isGuardia) {
    const items: Modulo[] = [
      {
        label: "Minuta",
        hint: "Turno, rondas, anotaciones y bitácora",
        icon: "book-outline",
        route: "/(app)/guardia/minuta",
      },
      {
        label: "Visitantes",
        hint: "Escanear QR, walk-in y salidas",
        icon: "qr-code-outline",
        route: "/(app)/guardia/visitantes",
      },
      {
        label: "Paquetería",
        hint: "Recibir y entregar correspondencia",
        icon: "cube-outline",
        route: "/(app)/guardia/paqueteria",
      },
      {
        label: "Reservas",
        hint: "Validar ingresos y salidas de zonas",
        icon: "calendar-outline",
        route: "/(app)/guardia/reservas",
      },
      {
        label: "Novedades",
        hint: "Reportar incidentes a administración",
        icon: "warning-outline",
        route: "/(app)/guardia/novedades",
      },
      {
        label: "Avisos",
        hint: "Comunicados de la administración",
        icon: "megaphone-outline",
        route: "/(app)/guardia/avisos",
      },
    ];
    return (
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <CondominioHeader condominioId={condominioId} title="Más" />
          <Text style={styles.subtitle}>Módulos de portería</Text>
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Operación</Text>
            <View style={styles.listGap}>
              {items.map((m) => (
                <Tap
                  key={m.route}
                  style={styles.row}
                  onPress={() => router.push(m.route as never)}
                >
                  <View style={styles.icon}>
                    <Ionicons name={m.icon} size={18} color={AuthUI.text} />
                  </View>
                  <View style={styles.body}>
                    <Text style={styles.label}>{m.label}</Text>
                    <Text style={styles.hint}>{m.hint}</Text>
                  </View>
                  <View style={styles.chevron}>
                    <Ionicons name="chevron-forward" size={16} color={AuthUI.textMuted} />
                  </View>
                </Tap>
              ))}
            </View>
          </View>
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Cuenta</Text>
            <View style={styles.listGap}>
              <Tap
                style={styles.row}
                onPress={() => router.push("/(app)/soporte" as never)}
              >
                <View style={styles.icon}>
                  <Ionicons name="help-buoy-outline" size={18} color={AuthUI.text} />
                </View>
                <View style={styles.body}>
                  <Text style={styles.label}>Soporte</Text>
                  <Text style={styles.hint}>Pedir ayuda a admin y Vekino</Text>
                </View>
                <View style={styles.chevron}>
                  <Ionicons name="chevron-forward" size={16} color={AuthUI.textMuted} />
                </View>
              </Tap>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter((m) => canManage || !m.adminOnly),
  })).filter((g) => g.items.length > 0);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <CondominioHeader condominioId={condominioId} title="Más" />
        <Text style={styles.subtitle}>
          {canManage ? "Módulos adicionales" : "Tus módulos"}
        </Text>

        {grupos.map((grupo) => (
          <View key={grupo.title} style={styles.group}>
            <Text style={styles.groupTitle}>{grupo.title}</Text>
            <View style={styles.listGap}>
              {grupo.items.map((m) => (
                <Tap
                  key={m.route}
                  style={styles.row}
                  onPress={() => router.push(m.route as never)}
                >
                  <View style={styles.icon}>
                    <Ionicons name={m.icon} size={18} color={AuthUI.text} />
                  </View>
                  <View style={styles.body}>
                    <Text style={styles.label}>{m.label}</Text>
                    <Text style={styles.hint}>{m.hint}</Text>
                  </View>
                  <View style={styles.chevron}>
                    <Ionicons name="chevron-forward" size={16} color={AuthUI.textMuted} />
                  </View>
                </Tap>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 150,
    paddingHorizontal: AuthUI.padH - 7,
  },
  subtitle: {
    color: AuthUI.textSecondary,
    fontSize: 15,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
    marginBottom: 22,
  },
  group: {
    marginBottom: 26,
  },
  groupTitle: {
    color: AuthUI.text,
    fontSize: 17,
    fontFamily: AuthUI.font.semibold,
    marginBottom: 12,
  },
  listGap: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8D6DC",
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 14,
    width: "100%",
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(14,14,15,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    marginLeft: 12,
    marginRight: 8,
  },
  label: {
    color: AuthUI.text,
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
  },
  hint: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  chevron: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
