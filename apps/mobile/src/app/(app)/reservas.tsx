import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { NoCondominioScreen } from "@/components/ui/no-condominio";
import { CondominioHeader } from "@/components/ui/condominio-header";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  ScreenBackground,
  GlassCard,
  GlassBadge,
  GlassButton,
  GlassSection,
  GlassInput,
} from "@/components/ui/glass";
import { C } from "@/lib/theme";

type Estado = "pendiente" | "aprobada" | "rechazada" | "cancelada";

const ESTADO_TONE: Record<Estado, "yellow" | "green" | "red" | "neutral"> = {
  pendiente: "yellow", aprobada: "green", rechazada: "red", cancelada: "neutral",
};
const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada", cancelada: "Cancelada",
};

const ESTADO_FILTERS = [
  { value: "", label: "Todas" },
  { value: "pendiente", label: "Pendiente" },
  { value: "aprobada", label: "Aprobada" },
  { value: "rechazada", label: "Rechazada" },
] as const;

type ReservaRow = NonNullable<ReturnType<typeof useQuery<typeof api.reservas.listByCondominio>>>[number];

export default function ReservasScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <Authenticated>
          <ReservasContent />
        </Authenticated>
      </ScreenBackground>
    </View>
  );
}

function ReservasContent() {
  const { condominioId, isSuperadmin } = useCondominio();
  const reservas = useQuery(api.reservas.listByCondominio, condominioId ? { condominioId } : "skip");
  const zonas = useQuery(api.reservas.listZonas, condominioId ? { condominioId } : "skip");
  const unidades = useQuery(api.unidades.listByCondominio, condominioId ? { condominioId } : "skip");
  const createReserva = useMutation(api.reservas.create);
  const [filtro, setFiltro] = useState<"" | Estado>("");
  const [showForm, setShowForm] = useState(false);
  const [zonaId, setZonaId] = useState<Id<"zonasComunes"> | "">("");
  const [unidadId, setUnidadId] = useState<Id<"unidades"> | "">("");
  const [fecha, setFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFin, setHoraFin] = useState("10:00");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (isSuperadmin && !condominioId) return <NoCondominioScreen />;

  const filtered = (reservas ?? []).filter((r) => !filtro || r.estado === filtro);
  const zonasActivas = (zonas ?? []).filter((z) => z.activa);

  function resetForm() {
    setZonaId(""); setUnidadId(""); setFecha(""); setHoraInicio("08:00"); setHoraFin("10:00");
    setObservaciones(""); setFormError(null);
  }

  async function submit() {
    if (!condominioId) return;
    if (!zonaId || !unidadId || !fecha || !horaInicio || !horaFin) {
      setFormError("Completa zona, unidad, fecha y horario.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createReserva({ condominioId, zonaId, unidadId, fecha, horaInicio, horaFin, observaciones: observaciones || undefined });
      setShowForm(false);
      resetForm();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 130, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <CondominioHeader
          condominioId={condominioId}
          title="Reservas"
          showBack
          right={
            zonasActivas.length > 0 ? (
              <GlassButton label="Nueva" variant="primary" size="sm" onPress={() => { resetForm(); setShowForm(true); }} />
            ) : undefined
          }
        />

        {/* Stats */}
        {reservas && reservas.length > 0 && (
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
            {(["pendiente", "aprobada"] as Estado[]).map((e) => {
              const count = (reservas ?? []).filter((r) => r.estado === e).length;
              return (
                <GlassCard key={e} style={{ flex: 1, padding: 16, gap: 4 }}>
                  <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: "500" }}>
                    {ESTADO_LABEL[e]}
                  </Text>
                  <Text style={{ color: C.text, fontSize: 24, fontWeight: "700" }}>{count}</Text>
                </GlassCard>
              );
            })}
          </View>
        )}

        {/* Filtros */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 20 }}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {ESTADO_FILTERS.map((f) => {
            const active = filtro === f.value;
            return (
              <Pressable key={f.value} onPress={() => setFiltro(f.value as "" | Estado)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={{ color: active ? "#fff" : C.textSoft, fontSize: 13, fontWeight: "600" }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Lista */}
        {reservas === undefined ? (
          <ActivityIndicator color={C.textSoft} style={{ marginTop: 40 }} />
        ) : zonasActivas.length === 0 && (reservas ?? []).length === 0 ? (
          <GlassCard style={{ padding: 40, alignItems: "center", gap: 12, marginTop: 20 }}>
            <Ionicons name="calendar-outline" size={36} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 15, textAlign: "center" }}>
              No hay zonas comunes configuradas.{"\n"}Contacta a tu administrador.
            </Text>
          </GlassCard>
        ) : filtered.length === 0 ? (
          <GlassCard style={{ padding: 40, alignItems: "center", gap: 12, marginTop: 20 }}>
            <Ionicons name="calendar-outline" size={36} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 15, textAlign: "center" }}>
              Sin reservas{filtro ? ` en estado "${ESTADO_LABEL[filtro as Estado]}"` : ""}.
            </Text>
            {!filtro && zonasActivas.length > 0 && (
              <GlassButton label="Crear primera reserva" variant="secondary" size="sm" onPress={() => { resetForm(); setShowForm(true); }} style={{ marginTop: 8 }} />
            )}
          </GlassCard>
        ) : (
          <GlassSection title={`${filtered.length} reserva${filtered.length === 1 ? "" : "s"}`}>
            <View style={{ gap: 10 }}>
              {filtered.map((r) => (
                <ReservaCard key={r._id} r={r} />
              ))}
            </View>
          </GlassSection>
        )}
      </ScrollView>

      {/* Nueva reserva (hoja suave) */}
      <BottomSheet visible={showForm} onClose={() => { setShowForm(false); resetForm(); }} maxHeight="90%">
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 20, letterSpacing: -0.4 }}>
            Nueva reserva
          </Text>

          {/* Zona picker */}
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.formLabel}>Zona común</Text>
            <View style={{ gap: 8, flexDirection: "row", flexWrap: "wrap" }}>
              {zonasActivas.map((z) => {
                const active = zonaId === z._id;
                return (
                  <Pressable key={z._id} onPress={() => setZonaId(z._id)} style={[styles.zonaChip, active && styles.zonaChipActive]}>
                    <Ionicons name={active ? "checkmark-circle" : "business-outline"} size={14} color={active ? C.text : C.textMuted} />
                    <Text style={{ color: active ? C.text : C.textSoft, fontSize: 13, fontWeight: "600" }}>{z.nombre}</Text>
                    {z.capacidad && <Text style={{ color: C.textMuted, fontSize: 11 }}>({z.capacidad}p)</Text>}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Unidad picker */}
          {unidades && unidades.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.formLabel}>Unidad</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {unidades.slice(0, 20).map((u) => {
                  const active = unidadId === u._id;
                  return (
                    <Pressable key={u._id} onPress={() => setUnidadId(u._id)} style={[styles.chip, active && styles.chipActive]}>
                      <Text style={{ color: active ? "#fff" : C.textSoft, fontSize: 13, fontWeight: "600" }}>{u.numero}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <GlassInput
            label="Fecha (YYYY-MM-DD)"
            value={fecha}
            onChangeText={setFecha}
            placeholder="2026-08-15"
            keyboardType="numbers-and-punctuation"
            style={{ marginBottom: 14 }}
            leftIcon={<Ionicons name="calendar-outline" size={18} color={C.textMuted} />}
          />

          <View style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <GlassInput label="Hora inicio" value={horaInicio} onChangeText={setHoraInicio} placeholder="08:00" keyboardType="numbers-and-punctuation" leftIcon={<Ionicons name="time-outline" size={18} color={C.textMuted} />} />
            </View>
            <View style={{ flex: 1 }}>
              <GlassInput label="Hora fin" value={horaFin} onChangeText={setHoraFin} placeholder="10:00" keyboardType="numbers-and-punctuation" leftIcon={<Ionicons name="time-outline" size={18} color={C.textMuted} />} />
            </View>
          </View>

          <View style={{ marginBottom: 20 }}>
            <Text style={styles.formLabel}>Observaciones (opcional)</Text>
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card }}>
              <TextInput
                value={observaciones}
                onChangeText={setObservaciones}
                placeholder="Evento especial, invitados..."
                placeholderTextColor={C.textMuted}
                multiline
                numberOfLines={3}
                style={{ color: C.text, fontSize: 15, padding: 14, minHeight: 80, textAlignVertical: "top" }}
              />
            </View>
          </View>

          {formError && (
            <View style={{ backgroundColor: C.dangerSoft, borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <Text style={{ color: C.danger, fontSize: 13 }}>{formError}</Text>
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 12 }}>
            <GlassButton label="Cancelar" variant="secondary" onPress={() => { setShowForm(false); resetForm(); }} style={{ flex: 1 }} />
            <GlassButton label="Solicitar" variant="primary" loading={saving} onPress={submit} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

function ReservaCard({ r }: { r: ReservaRow }) {
  const estado = r.estado as Estado;

  return (
    <GlassCard style={{ padding: 18 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>{r.zonaNombre}</Text>
          <Text style={{ color: C.textMuted, fontSize: 13 }}>Unidad {r.unidadNumero}</Text>
        </View>
        <GlassBadge label={ESTADO_LABEL[estado] ?? r.estado} tone={ESTADO_TONE[estado] ?? "neutral"} />
      </View>

      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="calendar-outline" size={13} color={C.textMuted} />
          <Text style={{ color: C.textSoft, fontSize: 12 }}>{fmtFechaCortaStr(r.fecha)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="time-outline" size={13} color={C.textMuted} />
          <Text style={{ color: C.textSoft, fontSize: 12 }}>{r.horaInicio} – {r.horaFin}</Text>
        </View>
      </View>

      {r.observaciones && (
        <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 8 }} numberOfLines={1}>{r.observaciones}</Text>
      )}

      <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="person-outline" size={10} color={C.textMuted} />
        </View>
        <Text style={{ color: C.textMuted, fontSize: 11 }}>{r.solicitanteNombre}</Text>
      </View>
    </GlassCard>
  );
}

function fmtFechaCortaStr(fecha: string): string {
  const parts = fecha.split("-");
  const y = Number(parts[0] ?? 2026);
  const m = Number(parts[1] ?? 1);
  const d = Number(parts[2] ?? 1);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  chipActive: {
    backgroundColor: C.text, borderColor: C.text,
  },
  zonaChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  zonaChipActive: {
    backgroundColor: C.bgSubtle, borderColor: C.text,
  },
  formLabel: {
    color: C.text, fontSize: 13, fontWeight: "500", marginBottom: 8,
  },
});
