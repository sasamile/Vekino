import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Authenticated } from "convex/react";
import { ScreenBackground, GlassCard } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";
import { C } from "@/lib/theme";

export default function PrivacidadScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <View style={styles.header}>
            <Tap onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={AuthUI.text} />
            </Tap>
            <Text style={styles.title}>Privacidad</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.lead}>
              En Vekino cuidamos tus datos personales. Esto es lo que usamos y
              cómo los protegemos.
            </Text>

            <Section title="Qué datos guardamos">
              Nombre, correo, teléfono y documento (si los registraste); tu
              unidad y roles en el condominio; actividad operativa (facturas,
              reservas, visitantes, PQRS) necesaria para administrar el
              conjunto.
            </Section>

            <Section title="Quién puede verlos">
              La administración de tu condominio y, según el módulo, portería.
              El equipo Vekino solo accede cuando das soporte o para operar la
              plataforma de forma segura.
            </Section>

            <Section title="Tus derechos">
              Puedes editar tu perfil y avatar en esta app. Si quieres corregir
              o eliminar datos, usa Soporte: tu solicitud llega al administrador
              del condominio y al equipo Vekino.
            </Section>

            <Section title="Notificaciones y dispositivos">
              Si activas las notificaciones push, guardamos un token del
              dispositivo para enviarte avisos. Puedes desactivarlas en
              Notificaciones o en los ajustes del teléfono.
            </Section>

            <GlassCard style={styles.note}>
              <Ionicons name="lock-closed-outline" size={18} color={AuthUI.text} />
              <Text style={styles.noteText}>
                No vendemos tus datos. El tratamiento se limita a la operación
                del condominio y al soporte del servicio.
              </Text>
            </GlassCard>
          </ScrollView>
        </SafeAreaView>
      </ScreenBackground>
    </View>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  lead: {
    fontSize: 14,
    color: AuthUI.textMuted,
    lineHeight: 20,
    marginBottom: 18,
  },
  section: { marginBottom: 18, gap: 6 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
  sectionBody: {
    fontSize: 14,
    color: AuthUI.text,
    lineHeight: 21,
    fontFamily: AuthUI.font.regular,
  },
  note: {
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: AuthUI.textMuted,
    lineHeight: 19,
  },
});
