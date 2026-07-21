import { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass";
import { useCondominio } from "@/context/condominio-context";
import { initials } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { useAuthFonts } from "@/lib/use-auth-fonts";
import { C } from "@/lib/theme";
import { WavingHand } from "@/components/ui/waving-hand";

/** Panel maestro — pastel + Poppins + superficies glass suaves. */
export function SuperadminPanel({
  firstName,
  saludo,
}: {
  firstName: string;
  saludo: string;
  avatarUrl?: string | null;
}) {
  const fontsLoaded = useAuthFonts();
  const { selectCondominio } = useCondominio();
  const stats = useQuery(api.platform.stats);
  const condominios = useQuery(api.condominios.listAll, {});
  const [showCreate, setShowCreate] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!condominios) return undefined;
    const needle = q.trim().toLowerCase();
    if (!needle) return condominios;
    return condominios.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.city ?? "").toLowerCase().includes(needle) ||
        (c.subdomain ?? "").toLowerCase().includes(needle),
    );
  }, [condominios, q]);

  const loading = stats === undefined || condominios === undefined;

  if (!fontsLoaded) return <View style={{ flex: 1 }} />;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={styles.kicker}>{saludo},</Text>
              <Text style={styles.title}>{firstName}</Text>
              <WavingHand size={18} />
            </View>
            <Text style={styles.subtitle}>Panel de plataforma</Text>
          </View>
          <View
            style={styles.primaryBtn}
            onTouchEnd={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCreate(true);
            }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Nuevo</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Kpi
              label="Condominios"
              value={loading ? null : stats?.condominios.total}
              hint={loading ? "…" : `${stats?.condominios.activos ?? 0} activos`}
            />
          </View>
          <View style={styles.kpiCard}>
            <Kpi
              label="Usuarios"
              value={loading ? null : stats?.usuarios.total}
              hint={loading ? "…" : `${stats?.usuarios.superadmins ?? 0} superadmins`}
            />
          </View>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Condominios</Text>
          {!loading && (
            <Text style={styles.sectionMeta}>
              {filtered?.length ?? 0}
              {q.trim() ? ` de ${condominios?.length ?? 0}` : ""}
            </Text>
          )}
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={AuthUI.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por nombre o ciudad"
            placeholderTextColor={AuthUI.placeholder}
            autoCorrect={false}
            style={styles.searchInput}
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={AuthUI.textMuted} />
            </Pressable>
          )}
        </View>

        {loading ? (
          <View style={styles.listGap}>
            {[0, 1, 2].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </View>
        ) : filtered!.length === 0 ? (
          <View style={[styles.condoCard, styles.empty]}>
            <View style={styles.emptyIcon}>
              <Ionicons name="business-outline" size={22} color={AuthUI.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>
              {q.trim() ? "Sin resultados" : "Sin condominios"}
            </Text>
            <Text style={styles.emptyBody}>
              {q.trim()
                ? "Prueba con otro nombre o ciudad."
                : "Crea el primero para empezar a administrar."}
            </Text>
            {!q.trim() && (
              <View
                style={[styles.primaryBtn, { marginTop: 18, alignSelf: "center" }]}
                onTouchEnd={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowCreate(true);
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Crear condominio</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.listGap}>
            {filtered!.map((c) => {
              const accent = c.primaryColor || AuthUI.purple;
              return (
                <View
                  key={c._id}
                  style={styles.condoRow}
                  onTouchEnd={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    selectCondominio(c._id as Id<"condominios">, c.name);
                  }}
                >
                  {c.logo ? (
                    <Image source={{ uri: c.logo }} style={styles.logo} resizeMode="cover" />
                  ) : (
                    <View style={[styles.logoFallback, { backgroundColor: accent + "18" }]}>
                      <Text style={styles.logoInitials}>{initials(c.name)}</Text>
                    </View>
                  )}
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <View style={styles.metaRow}>
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: c.isActive ? C.success : AuthUI.textMuted },
                        ]}
                      />
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {[c.isActive ? "Activo" : "Inactivo", c.city].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.chevronWrap}>
                    <Ionicons name="chevron-forward" size={18} color={AuthUI.textMuted} />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <CreateCondominioModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </SafeAreaView>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  hint: string;
}) {
  return (
    <View>
      {value === null || value === undefined ? (
        <View style={styles.kpiSkeleton} />
      ) : (
        <Text style={styles.kpiValue}>{String(value)}</Text>
      )}
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiHint}>{hint}</Text>
    </View>
  );
}

function SkeletonRow() {
  return (
    <View style={styles.condoRow}>
      <View style={[styles.logoFallback, { backgroundColor: "rgba(14,14,15,0.06)" }]} />
      <View style={styles.rowBody}>
        <View style={{ height: 14, width: "55%", borderRadius: 6, backgroundColor: "rgba(14,14,15,0.06)", marginBottom: 8 }} />
        <View style={{ height: 11, width: "35%", borderRadius: 6, backgroundColor: "rgba(14,14,15,0.06)" }} />
      </View>
    </View>
  );
}

function CreateCondominioModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const create = useMutation(api.condominios.create);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [nit, setNit] = useState("");
  const [plan, setPlan] = useState<"basico" | "pro" | "enterprise">("basico");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await create({
        name: name.trim(),
        city: city.trim() || undefined,
        nit: nit.trim() || undefined,
        subscriptionPlan: plan,
      });
      setName("");
      setCity("");
      setNit("");
      setPlan("basico");
      setLoading(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
      setLoading(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="88%">
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sheetTitle}>Nuevo condominio</Text>
        <Field label="Nombre" value={name} onChange={setName} placeholder="Conjunto Arboleda" />
        <Field label="Ciudad" value={city} onChange={setCity} placeholder="Bogotá" />
        <Field
          label="NIT"
          value={nit}
          onChange={setNit}
          placeholder="900.123.456-7"
          keyboardType="numbers-and-punctuation"
        />

        <View style={{ marginBottom: 18 }}>
          <Text style={styles.fieldLabel}>Plan</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(
              [
                { value: "basico", label: "Básico" },
                { value: "pro", label: "Pro" },
                { value: "enterprise", label: "Enterprise" },
              ] as const
            ).map((p) => {
              const active = plan === p.value;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => setPlan(p.value)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: active ? "#0E0E0F" : AuthUI.border,
                    backgroundColor: active ? "#0E0E0F" : "#FFFFFF",
                  }}
                >
                  <Text
                    style={{
                      color: active ? "#fff" : AuthUI.textMuted,
                      fontSize: 13,
                      fontFamily: AuthUI.font.semibold,
                    }}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error && (
          <View
            style={{
              backgroundColor: C.dangerSoft,
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: C.danger, fontSize: 13, fontFamily: AuthUI.font.regular }}>
              {error}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 12 }}>
          <GlassButton label="Cancelar" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <GlassButton
            label="Crear"
            variant="primary"
            loading={loading}
            disabled={!name.trim()}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numbers-and-punctuation";
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={AuthUI.placeholder}
        keyboardType={keyboardType}
        style={styles.fieldInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 140,
    paddingHorizontal: AuthUI.padH - 7,
  },
  header: {
    marginTop: 12,
    marginBottom: 22,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  kicker: {
    color: AuthUI.textMuted,
    fontSize: 14,
    fontFamily: AuthUI.font.medium,
  },
  title: {
    color: AuthUI.text,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: AuthUI.font.bold,
    marginTop: 2,
  },
  subtitle: {
    color: AuthUI.textSecondary,
    fontSize: 15,
    fontFamily: AuthUI.font.regular,
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0E0E0F",
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 12,
    flexShrink: 0,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 22,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AuthUI.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  kpiValue: {
    color: AuthUI.text,
    fontSize: 32,
    fontFamily: AuthUI.font.bold,
    letterSpacing: -0.8,
  },
  kpiSkeleton: {
    height: 32,
    width: 48,
    borderRadius: 8,
    backgroundColor: "rgba(14,14,15,0.06)",
    marginBottom: 4,
  },
  kpiLabel: {
    color: AuthUI.text,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
    marginTop: 4,
  },
  kpiHint: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: AuthUI.text,
    fontSize: 18,
    fontFamily: AuthUI.font.semibold,
  },
  sectionMeta: {
    color: AuthUI.textMuted,
    fontSize: 13,
    fontFamily: AuthUI.font.medium,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 52,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AuthUI.border,
  },
  searchInput: {
    flex: 1,
    color: AuthUI.text,
    fontSize: 15,
    fontFamily: AuthUI.font.regular,
    paddingVertical: 14,
  },
  listGap: {
    gap: 10,
  },
  condoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8D6DC",
  },
  /** Fila horizontal fija — no usar Pressable (NativeWind la vuelve columna). */
  condoRow: {
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
  rowBody: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    marginLeft: 12,
    marginRight: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F4F4F5",
  },
  logoFallback: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitials: {
    fontSize: 13,
    fontFamily: AuthUI.font.bold,
    color: AuthUI.purple,
  },
  chevronWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    color: "#0E0E0F",
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
  },
  rowMeta: {
    color: "#747277",
    fontSize: 13,
    fontFamily: AuthUI.font.regular,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8D6DC",
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(14,14,15,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    color: AuthUI.text,
    fontSize: 16,
    fontFamily: AuthUI.font.semibold,
  },
  emptyBody: {
    color: AuthUI.textMuted,
    fontSize: 14,
    fontFamily: AuthUI.font.regular,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  sheetTitle: {
    color: AuthUI.text,
    fontSize: 22,
    fontFamily: AuthUI.font.bold,
    marginBottom: 20,
  },
  fieldLabel: {
    color: AuthUI.text,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
    marginBottom: 8,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: AuthUI.font.regular,
    color: AuthUI.text,
  },
});
