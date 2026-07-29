import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Authenticated, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import { ScreenBackground, GlassCard, GlassSection } from "@/components/ui/glass";
import { SoftHomeHeader } from "@/components/ui/soft-home-header";
import { useCondominio } from "@/context/condominio-context";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI } from "@/lib/soft-ui";
import { NoCondominioScreen } from "@/components/ui/no-condominio";

type Ionicon = React.ComponentProps<typeof Ionicons>["name"];

type Modulo = {
  label: string;
  hint: string;
  icon: Ionicon;
  route: string;
  /** Solo administradores (no contadora) */
  adminOnly?: boolean;
  /** Contadora + admin */
  contadoraOk?: boolean;
  /** Junta directiva (y también admin si canManage) */
  juntaOnly?: boolean;
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
      { label: "Consejo", hint: "Junta / finanzas", icon: "people-circle-outline", route: "/(app)/consejo", juntaOnly: true, contadoraOk: true },
    ],
  },
  {
    title: "Operación",
    items: [
      { label: "Documentos", hint: "Archivos", icon: "document-text-outline", route: "/(app)/documentos", contadoraOk: true },
      { label: "Control", hint: "Accesos", icon: "shield-checkmark-outline", route: "/(app)/control", adminOnly: true },
    ],
  },
  {
    title: "Análisis",
    items: [
      { label: "Reportes", hint: "Indicadores", icon: "bar-chart-outline", route: "/(app)/reportes", adminOnly: true, contadoraOk: true },
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

function ModuloRow({ m, onPress }: { m: Modulo; onPress: () => void }) {
  const { theme } = useCondominio();
  return (
    <Tap onPress={onPress}>
      <GlassCard style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name={m.icon} size={22} color={theme.accent} />
        </View>
        <View style={styles.body}>
          <Text style={styles.label}>{m.label}</Text>
          <Text style={styles.hint}>{m.hint}</Text>
        </View>
        <View style={[styles.chevron, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name="chevron-forward" size={18} color={theme.accent} />
        </View>
      </GlassCard>
    </Tap>
  );
}

function MasContent() {
  const router = useRouter();
  const me = useQuery(api.users.me);
  const { condominioId, condominioName, canManage, isJunta, isGuardia, isContadora, isLoading } =
    useCondominio();

  if (isLoading) return <View style={{ flex: 1 }} />;
  if (!condominioId) return <NoCondominioScreen />;

  const hora = new Date().getHours();
  const saludo =
    hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";

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
      <View style={{ flex: 1 }}>
        <SoftHomeHeader
          saludo={saludo}
          displayName={me?.name ?? "Guardia"}
          avatarUrl={me?.image}
          badgeLabel={condominioName ?? "Más"}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <GlassSection title="Operación">
            <View style={styles.listGap}>
              {items.map((m) => (
                <ModuloRow
                  key={m.route}
                  m={m}
                  onPress={() => router.push(m.route as never)}
                />
              ))}
            </View>
          </GlassSection>

          <View style={{ marginTop: SoftUI.space.xl }}>
            <GlassSection title="Cuenta">
              <View style={styles.listGap}>
                <ModuloRow
                  m={{
                    label: "Soporte",
                    hint: "Pedir ayuda a admin y Vekino",
                    icon: "help-buoy-outline",
                    route: "/(app)/soporte",
                  }}
                  onPress={() => router.push("/(app)/soporte" as never)}
                />
              </View>
            </GlassSection>
          </View>
        </ScrollView>
      </View>
    );
  }

  const grupos = GRUPOS.map((g) => ({
    ...g,
    items: g.items.filter((m) => {
      if (isContadora) {
        // Misma superficie que web: reportes, documentos, consejo (+ día a día del portal).
        if (m.contadoraOk) return true;
        if (m.adminOnly || m.juntaOnly) return false;
        return true;
      }
      if (m.juntaOnly) return isJunta || canManage;
      if (m.adminOnly) return canManage;
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  return (
    <View style={{ flex: 1 }}>
      <SoftHomeHeader
        saludo={saludo}
        displayName={me?.name ?? "Residente"}
        avatarUrl={me?.image}
        badgeLabel={condominioName ?? "Más"}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {grupos.map((grupo, i) => (
          <View
            key={grupo.title}
            style={i > 0 ? { marginTop: SoftUI.space.xl } : undefined}
          >
            <GlassSection title={grupo.title}>
              <View style={styles.listGap}>
                {grupo.items.map((m) => (
                  <ModuloRow
                    key={m.route}
                    m={m}
                    onPress={() => router.push(m.route as never)}
                  />
                ))}
              </View>
            </GlassSection>
          </View>
        ))}
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
  listGap: {
    gap: SoftUI.space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: SoftUI.space.base,
    gap: SoftUI.space.md,
  },
  icon: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.semibold,
  },
  hint: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
  },
  chevron: {
    width: 36,
    height: 36,
    borderRadius: SoftUI.radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
});
