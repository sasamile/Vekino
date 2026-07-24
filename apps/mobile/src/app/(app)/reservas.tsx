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
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { NoCondominioScreen } from "@/components/ui/no-condominio";
import { SoftHomeHeader } from "@/components/ui/soft-home-header";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Tap } from "@/components/ui/tap";
import {
  ScreenBackground,
  GlassCard,
  GlassBadge,
  GlassButton,
  GlassSection,
  GlassInput,
} from "@/components/ui/glass";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI, softShadow } from "@/lib/soft-ui";

type Estado = "pendiente" | "aprobada" | "rechazada" | "cancelada";

const ESTADO_TONE: Record<Estado, "yellow" | "green" | "red" | "neutral"> = {
  pendiente: "yellow",
  aprobada: "green",
  rechazada: "red",
  cancelada: "neutral",
};

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

const ESTADO_FILTERS = [
  { value: "", label: "Todas" },
  { value: "pendiente", label: "Pendiente" },
  { value: "aprobada", label: "Aprobada" },
  { value: "rechazada", label: "Rechazada" },
] as const;

const ESTADO_ICON: Record<
  Estado,
  { name: React.ComponentProps<typeof Ionicons>["name"]; bg: string; fg: string }
> = {
  pendiente: { name: "time-outline", bg: SoftUI.warningSoft, fg: "#B8860B" },
  aprobada: {
    name: "checkmark-circle-outline",
    bg: SoftUI.successSoft,
    fg: SoftUI.success,
  },
  rechazada: {
    name: "close-circle-outline",
    bg: SoftUI.dangerSoft,
    fg: SoftUI.danger,
  },
  cancelada: {
    name: "ban-outline",
    bg: SoftUI.bgSecondary,
    fg: SoftUI.textSecondary,
  },
};

type ReservaRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.reservas.listByCondominio>>
>[number];

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
  const me = useQuery(api.users.me);
  const { condominioId, condominioName, isSuperadmin } = useCondominio();
  const reservas = useQuery(
    api.reservas.listByCondominio,
    condominioId ? { condominioId } : "skip",
  );
  const zonas = useQuery(
    api.reservas.listZonas,
    condominioId ? { condominioId } : "skip",
  );
  const unidades = useQuery(
    api.unidades.listByCondominio,
    condominioId ? { condominioId } : "skip",
  );
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
  const pendientes = (reservas ?? []).filter((r) => r.estado === "pendiente").length;
  const aprobadas = (reservas ?? []).filter((r) => r.estado === "aprobada").length;

  const hora = new Date().getHours();
  const saludo =
    hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";

  function resetForm() {
    setZonaId("");
    setUnidadId("");
    setFecha("");
    setHoraInicio("08:00");
    setHoraFin("10:00");
    setObservaciones("");
    setFormError(null);
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
      await createReserva({
        condominioId,
        zonaId,
        unidadId,
        fecha,
        horaInicio,
        horaFin,
        observaciones: observaciones || undefined,
      });
      setShowForm(false);
      resetForm();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <SoftHomeHeader
        saludo={saludo}
        displayName={me?.name ?? "Residente"}
        avatarUrl={me?.image}
        badgeLabel={condominioName ?? "Reservas"}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {zonasActivas.length > 0 ? (
          <View style={styles.topRow}>
            <View style={{ flex: 1 }} />
            <Tap
              style={styles.nuevaBtn}
              onPress={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              <Ionicons name="add" size={18} color={SoftUI.white} />
              <Text style={styles.nuevaBtnText}>Nueva</Text>
            </Tap>
          </View>
        ) : null}

        <GlassCard style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons name="calendar-outline" size={22} color={SoftUI.white} />
          </View>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text style={styles.summaryTitle} numberOfLines={1}>
              {reservas === undefined
                ? "…"
                : pendientes === 0
                  ? "Sin pendientes"
                  : pendientes === 1
                    ? "1 reserva pendiente"
                    : `${pendientes} reservas pendientes`}
            </Text>
            <Text style={styles.summarySub} numberOfLines={1}>
              {reservas === undefined
                ? "Cargando…"
                : `${aprobadas} aprobada${aprobadas === 1 ? "" : "s"} · ${(reservas ?? []).length} en total`}
            </Text>
          </View>
        </GlassCard>

        {reservas && reservas.length > 0 && (
          <View style={styles.kpiRow}>
            {(
              [
                { label: "Pendientes", value: pendientes, color: SoftUI.warning },
                { label: "Aprobadas", value: aprobadas, color: SoftUI.success },
              ] as const
            ).map((s) => (
              <GlassCard key={s.label} style={styles.kpiCard}>
                <Text style={[styles.kpiValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.kpiLabel}>{s.label}</Text>
              </GlassCard>
            ))}
          </View>
        )}

        <EstadoChips value={filtro} onChange={setFiltro} />

        {reservas === undefined ? (
          <ActivityIndicator color={SoftUI.blue} style={{ marginTop: SoftUI.space.xxl }} />
        ) : zonasActivas.length === 0 && (reservas ?? []).length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={32} color={SoftUI.textSecondary} />
            <Text style={styles.emptyText}>
              No hay zonas comunes configuradas.{"\n"}Contacta a tu administrador.
            </Text>
          </GlassCard>
        ) : filtered.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={32} color={SoftUI.textSecondary} />
            <Text style={styles.emptyText}>
              Sin reservas
              {filtro ? ` en estado "${ESTADO_LABEL[filtro as Estado]}"` : ""}.
            </Text>
            {!filtro && zonasActivas.length > 0 && (
              <GlassButton
                label="Crear primera reserva"
                variant="secondary"
                size="sm"
                onPress={() => {
                  resetForm();
                  setShowForm(true);
                }}
                style={{ marginTop: SoftUI.space.sm, width: "auto" }}
              />
            )}
          </GlassCard>
        ) : (
          <GlassSection
            title={`${filtered.length} reserva${filtered.length === 1 ? "" : "s"}`}
          >
            <View style={{ gap: SoftUI.space.md }}>
              {filtered.map((r) => (
                <ReservaCard key={r._id} r={r} />
              ))}
            </View>
          </GlassSection>
        )}
      </ScrollView>

      <BottomSheet
        visible={showForm}
        onClose={() => {
          setShowForm(false);
          resetForm();
        }}
        maxHeight="90%"
      >
        <ScrollView
          contentContainerStyle={{
            padding: SoftUI.padH,
            paddingBottom: SoftUI.space.xxl,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sheetTitle}>Nueva reserva</Text>

          <View style={{ marginBottom: SoftUI.space.base }}>
            <Text style={styles.formLabel}>Zona común</Text>
            <View
              style={{
                gap: SoftUI.space.sm,
                flexDirection: "row",
                flexWrap: "wrap",
              }}
            >
              {zonasActivas.map((z) => {
                const active = zonaId === z._id;
                return (
                  <Pressable
                    key={z._id}
                    onPress={() => setZonaId(z._id)}
                    style={[styles.zonaChip, active && styles.zonaChipActive]}
                  >
                    <Ionicons
                      name={active ? "checkmark-circle" : "business-outline"}
                      size={14}
                      color={active ? SoftUI.white : SoftUI.textSecondary}
                    />
                    <Text
                      style={[
                        styles.zonaChipText,
                        active && styles.zonaChipTextActive,
                      ]}
                    >
                      {z.nombre}
                    </Text>
                    {z.capacidad ? (
                      <Text
                        style={{
                          color: active ? "rgba(255,255,255,0.8)" : SoftUI.textDisabled,
                          fontSize: SoftUI.type.chip.size - 1,
                          fontFamily: AuthUI.font.regular,
                        }}
                      >
                        ({z.capacidad}p)
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {unidades && unidades.length > 0 && (
            <View style={{ marginBottom: SoftUI.space.base }}>
              <Text style={styles.formLabel}>Unidad</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: SoftUI.space.sm }}
              >
                {unidades.slice(0, 20).map((u) => {
                  const active = unidadId === u._id;
                  return (
                    <Pressable
                      key={u._id}
                      onPress={() => setUnidadId(u._id)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {u.numero}
                      </Text>
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
            style={{ marginBottom: SoftUI.space.base }}
            leftIcon={
              <Ionicons
                name="calendar-outline"
                size={18}
                color={SoftUI.textSecondary}
              />
            }
          />

          <View
            style={{
              flexDirection: "row",
              gap: SoftUI.space.md,
              marginBottom: SoftUI.space.base,
            }}
          >
            <View style={{ flex: 1 }}>
              <GlassInput
                label="Hora inicio"
                value={horaInicio}
                onChangeText={setHoraInicio}
                placeholder="08:00"
                keyboardType="numbers-and-punctuation"
                leftIcon={
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={SoftUI.textSecondary}
                  />
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <GlassInput
                label="Hora fin"
                value={horaFin}
                onChangeText={setHoraFin}
                placeholder="10:00"
                keyboardType="numbers-and-punctuation"
                leftIcon={
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={SoftUI.textSecondary}
                  />
                }
              />
            </View>
          </View>

          <View style={{ marginBottom: SoftUI.space.xl }}>
            <Text style={styles.formLabel}>Observaciones (opcional)</Text>
            <View style={styles.textareaBox}>
              <TextInput
                value={observaciones}
                onChangeText={setObservaciones}
                placeholder="Evento especial, invitados..."
                placeholderTextColor={SoftUI.textDisabled}
                multiline
                numberOfLines={3}
                style={styles.textarea}
              />
            </View>
          </View>

          {formError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: SoftUI.space.sm }}>
            <GlassButton
              label="Cancelar"
              variant="secondary"
              onPress={() => {
                setShowForm(false);
                resetForm();
              }}
              style={{ flex: 1 }}
            />
            <GlassButton
              label="Solicitar"
              variant="primary"
              loading={saving}
              onPress={submit}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

function EstadoChips({
  value,
  onChange,
}: {
  value: "" | Estado;
  onChange: (e: "" | Estado) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginBottom: SoftUI.space.base }}
      contentContainerStyle={{ gap: SoftUI.space.sm, paddingVertical: 2 }}
    >
      {ESTADO_FILTERS.map((f) => {
        const active = value === f.value;
        return (
          <Pressable
            key={f.value}
            onPress={() => onChange(f.value as "" | Estado)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ReservaCard({ r }: { r: ReservaRow }) {
  const estado = r.estado as Estado;
  const iconMeta = ESTADO_ICON[estado] ?? ESTADO_ICON.cancelada;

  return (
    <GlassCard style={styles.reservaCard}>
      <View style={[styles.reservaIcon, { backgroundColor: iconMeta.bg }]}>
        <Ionicons name={iconMeta.name} size={22} color={iconMeta.fg} />
      </View>
      <View style={styles.reservaBody}>
        <View style={styles.reservaTop}>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text style={styles.reservaTitle} numberOfLines={1}>
              {r.zonaNombre}
            </Text>
            <Text style={styles.reservaMeta} numberOfLines={1}>
              Unidad {r.unidadNumero}
            </Text>
          </View>
          <GlassBadge
            label={ESTADO_LABEL[estado] ?? r.estado}
            tone={ESTADO_TONE[estado] ?? "neutral"}
          />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={13} color={SoftUI.textSecondary} />
            <Text style={styles.metaText}>{fmtFechaCortaStr(r.fecha)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={13} color={SoftUI.textSecondary} />
            <Text style={styles.metaText}>
              {r.horaInicio} – {r.horaFin}
            </Text>
          </View>
        </View>

        {r.observaciones ? (
          <Text style={styles.obsText} numberOfLines={1}>
            {r.observaciones}
          </Text>
        ) : null}

        <View style={styles.personRow}>
          <View style={styles.personIcon}>
            <Ionicons name="person-outline" size={10} color={SoftUI.textSecondary} />
          </View>
          <Text style={styles.personText}>{r.solicitanteNombre}</Text>
        </View>
      </View>
    </GlassCard>
  );
}

function fmtFechaCortaStr(fecha: string): string {
  const parts = fecha.split("-");
  const y = Number(parts[0] ?? 2026);
  const m = Number(parts[1] ?? 1);
  const d = Number(parts[2] ?? 1);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 150,
    paddingHorizontal: SoftUI.padH,
    paddingTop: SoftUI.space.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.sm,
    marginBottom: SoftUI.space.base,
  },
  summaryCard: {
    padding: SoftUI.space.base,
    marginBottom: SoftUI.space.base,
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.md,
    minHeight: 82,
  },
  summaryIcon: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.cardTitle.size - 1,
    fontFamily: AuthUI.font.semibold,
  },
  summarySub: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.regular,
  },
  nuevaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.xs,
    backgroundColor: SoftUI.blue,
    paddingHorizontal: SoftUI.space.base,
    paddingVertical: SoftUI.space.sm + 2,
    borderRadius: SoftUI.radius.chip,
    minHeight: SoftUI.touch,
  },
  nuevaBtnText: {
    color: SoftUI.white,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.semibold,
  },
  kpiRow: {
    flexDirection: "row",
    gap: SoftUI.space.sm,
    marginBottom: SoftUI.space.base,
  },
  kpiCard: {
    flex: 1,
    paddingVertical: SoftUI.space.base,
    paddingHorizontal: SoftUI.space.sm,
    alignItems: "center",
    gap: SoftUI.space.xs,
  },
  kpiValue: {
    fontSize: SoftUI.type.section.size,
    fontFamily: AuthUI.font.bold,
  },
  kpiLabel: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size - 1,
    fontFamily: AuthUI.font.medium,
  },
  chip: {
    paddingHorizontal: SoftUI.space.base,
    paddingVertical: SoftUI.space.sm,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.card,
    ...softShadow,
  },
  chipActive: {
    backgroundColor: SoftUI.blue,
  },
  chipText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.semibold,
  },
  chipTextActive: {
    color: SoftUI.white,
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
  sheetTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.section.size,
    fontFamily: AuthUI.font.bold,
    marginBottom: SoftUI.space.base,
  },
  formLabel: {
    color: SoftUI.text,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.semibold,
    marginBottom: SoftUI.space.sm,
  },
  zonaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.sm,
    paddingHorizontal: SoftUI.space.base,
    paddingVertical: SoftUI.space.md,
    borderRadius: SoftUI.radius.cardSm,
    backgroundColor: SoftUI.card,
    ...softShadow,
  },
  zonaChipActive: {
    backgroundColor: SoftUI.blue,
  },
  zonaChipText: {
    color: SoftUI.text,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.semibold,
  },
  zonaChipTextActive: {
    color: SoftUI.white,
  },
  textareaBox: {
    borderRadius: SoftUI.radius.field,
    backgroundColor: SoftUI.field,
    minHeight: 80,
  },
  textarea: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.regular,
    padding: SoftUI.space.base,
    minHeight: 80,
    textAlignVertical: "top",
  },
  errorBox: {
    backgroundColor: SoftUI.dangerSoft,
    borderRadius: SoftUI.radius.cardSm,
    padding: SoftUI.space.md,
    marginBottom: SoftUI.space.base,
  },
  errorText: {
    color: SoftUI.danger,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.medium,
  },
  reservaCard: {
    padding: SoftUI.space.base,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SoftUI.space.md,
  },
  reservaIcon: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  reservaBody: {
    flex: 1,
    minWidth: 0,
    gap: SoftUI.space.sm,
  },
  reservaTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: SoftUI.space.md,
  },
  reservaTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.semibold,
  },
  reservaMeta: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
  },
  metaRow: {
    flexDirection: "row",
    gap: SoftUI.space.base,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.xs,
  },
  metaText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
  },
  obsText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.sm,
  },
  personIcon: {
    width: 18,
    height: 18,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.bgSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  personText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size - 1,
    fontFamily: AuthUI.font.regular,
  },
});
