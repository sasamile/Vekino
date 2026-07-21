import { useMemo, useState } from "react";
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
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Doc, Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { ScreenBackground, GlassCard, GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";
import { C } from "@/lib/theme";
import { uploadLocalFile } from "@/lib/guardia-upload";

type ReservaRow = Doc<"reservas"> & {
  deposito: Doc<"guardiaReservaDepositos"> | null;
};

export default function GuardiaReservasScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const router = useRouter();
  const { condominioId, isGuardia, canManage, isLoading } = useCondominio();
  const reservas = useQuery(
    api.guardia.listReservasControl,
    condominioId ? { condominioId } : "skip",
  );

  const validarIngreso = useMutation(api.guardia.validarIngresoReserva);
  const validarSalida = useMutation(api.guardia.validarSalidaReserva);
  const registrarDeposito = useMutation(api.guardia.registrarDepositoReserva);
  const resolverDeposito = useMutation(api.guardia.resolverDepositoReserva);
  const generateUploadUrl = useMutation(api.guardia.generateUploadUrl);

  const [filtro, setFiltro] = useState<"hoy" | "todas">("hoy");
  const [depositoReserva, setDepositoReserva] = useState<ReservaRow | null>(null);
  const [resolverDep, setResolverDep] = useState<ReservaRow | null>(null);
  const [monto, setMonto] = useState("");
  const [obs, setObs] = useState("");
  const [foto, setFoto] = useState<{ uri: string; mime: string } | null>(null);
  const [devuelto, setDevuelto] = useState(true);
  const [busy, setBusy] = useState(false);

  const hoy = new Date().toISOString().slice(0, 10);

  const list = useMemo(() => {
    const rows = (reservas ?? []) as ReservaRow[];
    if (filtro === "hoy") return rows.filter((r) => r.fecha === hoy);
    return rows;
  }, [reservas, filtro, hoy]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  }

  if (!condominioId || (!isGuardia && !canManage)) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 24 }} edges={["top"]}>
        <Text style={styles.denied}>Sin acceso</Text>
        <Tap onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: C.brand }}>Volver</Text>
        </Tap>
      </SafeAreaView>
    );
  }

  async function pickFoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permiso necesario", "Activa el acceso a fotos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    setFoto({ uri: a.uri, mime: a.mimeType ?? "image/jpeg" });
  }

  async function onIngreso(r: ReservaRow) {
    try {
      await validarIngreso({ reservaId: r._id });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo validar.");
    }
  }

  async function onSalida(r: ReservaRow) {
    try {
      await validarSalida({ reservaId: r._id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo validar.";
      if (msg.includes("depósito")) {
        setResolverDep(r);
        setObs("");
        setFoto(null);
        setDevuelto(true);
      } else {
        Alert.alert("Error", msg);
      }
    }
  }

  async function submitDeposito() {
    if (!depositoReserva) return;
    const montoNum = Number(monto.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      Alert.alert("Monto inválido", "Ingresa un monto mayor a 0.");
      return;
    }
    setBusy(true);
    try {
      let fotoStorageId: Id<"_storage"> | undefined;
      if (foto) {
        fotoStorageId = await uploadLocalFile(generateUploadUrl, foto.uri, foto.mime);
      }
      await registrarDeposito({
        reservaId: depositoReserva._id,
        monto: montoNum,
        observaciones: obs || undefined,
        fotoStorageId,
      });
      setDepositoReserva(null);
      setMonto("");
      setObs("");
      setFoto(null);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo registrar.");
    } finally {
      setBusy(false);
    }
  }

  async function submitResolver() {
    if (!resolverDep?.deposito) return;
    if (!devuelto && (!obs.trim() || !foto)) {
      Alert.alert(
        "Evidencia requerida",
        "Si no se devuelve el depósito, observaciones y foto son obligatorias.",
      );
      return;
    }
    setBusy(true);
    try {
      let fotoStorageId: Id<"_storage"> | undefined;
      if (foto) {
        fotoStorageId = await uploadLocalFile(generateUploadUrl, foto.uri, foto.mime);
      }
      await resolverDeposito({
        depositoId: resolverDep.deposito._id,
        devuelto,
        observaciones: obs || undefined,
        fotoStorageId,
      });
      setResolverDep(null);
      setObs("");
      setFoto(null);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo resolver.");
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
            <Text style={styles.title}>Reservas</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.tabs}>
            {(
              [
                ["hoy", "Hoy"],
                ["todas", "Todas"],
              ] as const
            ).map(([key, label]) => (
              <Tap
                key={key}
                onPress={() => setFiltro(key)}
                style={[styles.tab, filtro === key && styles.tabActive]}
              >
                <Text style={[styles.tabText, filtro === key && styles.tabTextActive]}>
                  {label}
                </Text>
              </Tap>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.subtitle}>
              Valida ingresos y salidas de zonas comunes
            </Text>

            {reservas === undefined ? (
              <ActivityIndicator color={C.brand} style={{ marginTop: 24 }} />
            ) : list.length === 0 ? (
              <GlassCard style={styles.empty}>
                <Ionicons name="calendar-outline" size={28} color={AuthUI.textMuted} />
                <Text style={styles.emptyTitle}>Sin reservas</Text>
                <Text style={styles.emptyHint}>
                  {filtro === "hoy"
                    ? "No hay reservas aprobadas para hoy."
                    : "No hay reservas aprobadas pendientes de control."}
                </Text>
              </GlassCard>
            ) : (
              <View style={{ gap: 10 }}>
                {list.map((r) => {
                  const ingreso = !!r.ingresoValidadoAt;
                  const salida = !!r.salidaValidadaAt;
                  const depPendiente = r.deposito?.estado === "registrado";
                  return (
                    <GlassCard key={r._id} style={styles.card}>
                      <Text style={styles.zona}>{r.zonaNombre}</Text>
                      <Text style={styles.meta}>
                        Unidad {r.unidadNumero} · {r.solicitanteNombre}
                      </Text>
                      <Text style={styles.meta}>
                        {r.fecha} · {r.horaInicio}–{r.horaFin}
                      </Text>
                      <View style={styles.badges}>
                        {ingreso ? (
                          <GlassBadge label="Ingreso OK" tone="green" />
                        ) : (
                          <GlassBadge label="Sin ingreso" tone="yellow" />
                        )}
                        {salida ? (
                          <GlassBadge label="Salida OK" tone="green" />
                        ) : ingreso ? (
                          <GlassBadge label="En uso" tone="blue" />
                        ) : null}
                        {depPendiente ? (
                          <GlassBadge label="Depósito pendiente" tone="orange" />
                        ) : null}
                      </View>

                      <View style={styles.actions}>
                        {!ingreso ? (
                          <>
                            <Tap
                              onPress={() => onIngreso(r)}
                              style={[styles.btn, styles.btnPrimary]}
                            >
                              <Text style={styles.btnPrimaryText}>Validar ingreso</Text>
                            </Tap>
                            <Tap
                              onPress={() => {
                                setDepositoReserva(r);
                                setMonto("");
                                setObs("");
                                setFoto(null);
                              }}
                              style={[styles.btn, styles.btnOutline]}
                            >
                              <Text style={styles.btnOutlineText}>Con depósito</Text>
                            </Tap>
                          </>
                        ) : !salida ? (
                          <Tap
                            onPress={() => onSalida(r)}
                            style={[styles.btn, styles.btnPrimary]}
                          >
                            <Text style={styles.btnPrimaryText}>
                              {depPendiente ? "Resolver depósito / salida" : "Validar salida"}
                            </Text>
                          </Tap>
                        ) : (
                          <Text style={styles.done}>Control completo</Text>
                        )}
                      </View>
                    </GlassCard>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </ScreenBackground>

      <Modal
        visible={!!depositoReserva}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={styles.modalHead}>
            <Tap onPress={() => !busy && setDepositoReserva(null)}>
              <Text style={styles.cancel}>Cancelar</Text>
            </Tap>
            <Text style={styles.modalTitle}>Depósito</Text>
            <Tap onPress={submitDeposito} disabled={busy}>
              <Text style={[styles.save, busy && { opacity: 0.5 }]}>
                {busy ? "…" : "Registrar"}
              </Text>
            </Tap>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Text style={styles.modalHint}>
              {depositoReserva?.zonaNombre} · Unidad {depositoReserva?.unidadNumero}
            </Text>
            <Field label="Monto *">
              <TextInput
                style={styles.input}
                value={monto}
                onChangeText={setMonto}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={AuthUI.textMuted}
              />
            </Field>
            <Field label="Observaciones">
              <TextInput
                style={styles.input}
                value={obs}
                onChangeText={setObs}
                placeholder="Opcional"
                placeholderTextColor={AuthUI.textMuted}
              />
            </Field>
            <Tap onPress={pickFoto}>
              <GlassCard style={styles.fotoBtn}>
                <Ionicons name="camera-outline" size={20} color={AuthUI.text} />
                <Text style={styles.fotoLabel}>
                  {foto ? "Foto lista" : "Foto (opcional)"}
                </Text>
              </GlassCard>
            </Tap>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!resolverDep} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={styles.modalHead}>
            <Tap onPress={() => !busy && setResolverDep(null)}>
              <Text style={styles.cancel}>Cancelar</Text>
            </Tap>
            <Text style={styles.modalTitle}>Resolver depósito</Text>
            <Tap onPress={submitResolver} disabled={busy}>
              <Text style={[styles.save, busy && { opacity: 0.5 }]}>
                {busy ? "…" : "Confirmar"}
              </Text>
            </Tap>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Text style={styles.modalHint}>
              ${resolverDep?.deposito?.monto?.toLocaleString("es-CO") ?? "—"} ·{" "}
              {resolverDep?.zonaNombre}
            </Text>
            <View style={styles.tabs}>
              <Tap
                onPress={() => setDevuelto(true)}
                style={[styles.tab, devuelto && styles.tabActive]}
              >
                <Text style={[styles.tabText, devuelto && styles.tabTextActive]}>
                  Devuelto
                </Text>
              </Tap>
              <Tap
                onPress={() => setDevuelto(false)}
                style={[styles.tab, !devuelto && styles.tabActive]}
              >
                <Text style={[styles.tabText, !devuelto && styles.tabTextActive]}>
                  No devuelto
                </Text>
              </Tap>
            </View>
            <Field label={devuelto ? "Observaciones" : "Observaciones *"}>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                value={obs}
                onChangeText={setObs}
                multiline
                placeholder="Detalle…"
                placeholderTextColor={AuthUI.textMuted}
              />
            </Field>
            <Tap onPress={pickFoto}>
              <GlassCard style={styles.fotoBtn}>
                <Ionicons name="camera-outline" size={20} color={AuthUI.text} />
                <Text style={styles.fotoLabel}>
                  {foto
                    ? "Evidencia lista"
                    : devuelto
                      ? "Foto (opcional)"
                      : "Foto de evidencia *"}
                </Text>
              </GlassCard>
            </Tap>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
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
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: C.bgSubtle,
    borderRadius: 12,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: "#fff" },
  tabText: { fontSize: 13, color: AuthUI.textMuted, fontFamily: AuthUI.font.medium },
  tabTextActive: { color: AuthUI.text },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  subtitle: { fontSize: 13, color: AuthUI.textMuted, marginBottom: 14 },
  empty: { padding: 28, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 15, fontFamily: AuthUI.font.semibold, color: AuthUI.text },
  emptyHint: { fontSize: 13, color: AuthUI.textMuted, textAlign: "center" },
  card: { padding: 14, gap: 4 },
  zona: { fontSize: 15, fontFamily: AuthUI.font.semibold, color: AuthUI.text },
  meta: { fontSize: 12, color: AuthUI.textMuted },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  btn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnPrimary: { backgroundColor: C.brand },
  btnPrimaryText: { color: "#fff", fontFamily: AuthUI.font.semibold, fontSize: 13 },
  btnOutline: { borderWidth: 1, borderColor: C.border, backgroundColor: "#fff" },
  btnOutlineText: { color: AuthUI.text, fontFamily: AuthUI.font.medium, fontSize: 13 },
  done: { fontSize: 13, color: AuthUI.textMuted, fontFamily: AuthUI.font.medium },
  denied: { fontSize: 16, fontFamily: AuthUI.font.semibold, color: AuthUI.text },
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
  modalHint: { fontSize: 14, color: AuthUI.textMuted },
  cancel: { color: AuthUI.textMuted, fontSize: 15 },
  save: { color: C.brand, fontSize: 15, fontFamily: AuthUI.font.semibold },
  fieldLabel: { fontSize: 12, fontFamily: AuthUI.font.medium, color: AuthUI.textMuted },
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
  fotoBtn: { padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  fotoLabel: { fontSize: 14, color: AuthUI.text },
});
