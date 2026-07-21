import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { useCondominio } from "@/context/condominio-context";
import { ScreenBackground, GlassCard, GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";
import { C } from "@/lib/theme";

type Categoria = "factura" | "acceso" | "app" | "otro";

const CATS: { key: Categoria; label: string }[] = [
  { key: "factura", label: "Factura / pagos" },
  { key: "acceso", label: "Acceso a la app" },
  { key: "app", label: "Problema técnico" },
  { key: "otro", label: "Otro" },
];

const ESTADO_TONE: Record<string, "yellow" | "blue" | "green" | "neutral"> = {
  abierto: "yellow",
  en_gestion: "blue",
  resuelto: "green",
  cerrado: "neutral",
};

const ESTADO_LABEL: Record<string, string> = {
  abierto: "Abierto",
  en_gestion: "En gestión",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
};

function fmt(ts: number) {
  return new Date(ts).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SoporteScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const router = useRouter();
  const { condominioId } = useCondominio();
  const tickets = useQuery(api.soporte.listMias);
  const crear = useMutation(api.soporte.crear);

  const [formOpen, setFormOpen] = useState(false);
  const [categoria, setCategoria] = useState<Categoria>("factura");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!asunto.trim() || !mensaje.trim()) {
      Alert.alert("Completa el formulario", "Asunto y mensaje son obligatorios.");
      return;
    }
    setBusy(true);
    try {
      await crear({
        condominioId: condominioId ?? undefined,
        categoria,
        asunto: asunto.trim(),
        mensaje: mensaje.trim(),
      });
      setFormOpen(false);
      setAsunto("");
      setMensaje("");
      setCategoria("factura");
      Alert.alert(
        "Solicitud enviada",
        "Tu mensaje llegó al administrador del condominio y al equipo Vekino.",
      );
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <View style={styles.header}>
            <Tap onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={AuthUI.text} />
            </Tap>
            <Text style={styles.title}>Soporte</Text>
            <Tap onPress={() => setFormOpen(true)} style={styles.backBtn}>
              <Ionicons name="add" size={24} color={AuthUI.text} />
            </Tap>
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.subtitle}>
              ¿Problema con una factura, el acceso u otra cosa? Escríbenos: lo
              ven el administrador y el equipo Vekino.
            </Text>

            <Tap onPress={() => setFormOpen(true)}>
              <GlassCard style={styles.cta}>
                <Ionicons name="help-buoy-outline" size={22} color={AuthUI.text} />
                <Text style={styles.ctaLabel}>Pedir ayuda</Text>
              </GlassCard>
            </Tap>

            <Text style={styles.section}>Mis solicitudes</Text>
            {tickets === undefined ? (
              <ActivityIndicator color={C.brand} />
            ) : tickets.length === 0 ? (
              <GlassCard style={styles.empty}>
                <Text style={styles.emptyText}>Aún no has pedido ayuda.</Text>
              </GlassCard>
            ) : (
              <View style={{ gap: 10 }}>
                {tickets.map((t) => (
                  <GlassCard key={t._id} style={styles.card}>
                    <View style={styles.row}>
                      <Text style={styles.cardTitle}>{t.asunto}</Text>
                      <GlassBadge
                        label={ESTADO_LABEL[t.estado] ?? t.estado}
                        tone={ESTADO_TONE[t.estado] ?? "neutral"}
                      />
                    </View>
                    <Text style={styles.body}>{t.mensaje}</Text>
                    {t.respuesta ? (
                      <View style={styles.reply}>
                        <Text style={styles.replyLabel}>Respuesta</Text>
                        <Text style={styles.body}>{t.respuesta}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.meta}>{fmt(t.createdAt)}</Text>
                  </GlassCard>
                ))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </ScreenBackground>

      <Modal visible={formOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={styles.modalHead}>
            <Tap onPress={() => !busy && setFormOpen(false)}>
              <Text style={styles.cancel}>Cancelar</Text>
            </Tap>
            <Text style={styles.modalTitle}>Pedir ayuda</Text>
            <Tap onPress={submit} disabled={busy}>
              <Text style={[styles.save, busy && { opacity: 0.5 }]}>
                {busy ? "…" : "Enviar"}
              </Text>
            </Tap>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Text style={styles.fieldLabel}>Categoría</Text>
            <View style={styles.chips}>
              {CATS.map((c) => (
                <Tap
                  key={c.key}
                  onPress={() => setCategoria(c.key)}
                  style={[styles.chip, categoria === c.key && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      categoria === c.key && styles.chipTextActive,
                    ]}
                  >
                    {c.label}
                  </Text>
                </Tap>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Asunto</Text>
            <TextInput
              style={styles.input}
              value={asunto}
              onChangeText={setAsunto}
              placeholder="Ej. No puedo pagar la factura"
              placeholderTextColor={AuthUI.textMuted}
            />
            <Text style={styles.fieldLabel}>Detalle</Text>
            <TextInput
              style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
              value={mensaje}
              onChangeText={setMensaje}
              multiline
              placeholder="Cuéntanos qué pasó…"
              placeholderTextColor={AuthUI.textMuted}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  title: { fontSize: 17, fontFamily: AuthUI.font.semibold, color: AuthUI.text },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  subtitle: {
    fontSize: 13,
    color: AuthUI.textMuted,
    lineHeight: 19,
    marginBottom: 14,
  },
  cta: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  ctaLabel: { fontSize: 15, fontFamily: AuthUI.font.semibold, color: AuthUI.text },
  section: {
    fontSize: 13,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  empty: { padding: 20, alignItems: "center" },
  emptyText: { color: AuthUI.textMuted, fontSize: 14 },
  card: { padding: 14, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
  body: { fontSize: 14, color: AuthUI.text, lineHeight: 20 },
  reply: {
    marginTop: 4,
    padding: 10,
    borderRadius: 10,
    backgroundColor: C.bgSubtle,
    gap: 4,
  },
  replyLabel: {
    fontSize: 11,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.textMuted,
    textTransform: "uppercase",
  },
  meta: { fontSize: 12, color: AuthUI.textMuted },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  modalTitle: { fontSize: 16, fontFamily: AuthUI.font.semibold, color: AuthUI.text },
  cancel: { color: AuthUI.textMuted, fontSize: 15 },
  save: { color: C.brand, fontSize: 15, fontFamily: AuthUI.font.semibold },
  fieldLabel: {
    fontSize: 12,
    fontFamily: AuthUI.font.medium,
    color: AuthUI.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: AuthUI.text,
    backgroundColor: "#fff",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.bgSubtle,
  },
  chipActive: { backgroundColor: C.brand },
  chipText: { fontSize: 13, color: AuthUI.text },
  chipTextActive: { color: "#fff" },
});
