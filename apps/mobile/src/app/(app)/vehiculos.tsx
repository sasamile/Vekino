import { useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { SoftHomeHeader } from "@/components/ui/soft-home-header";
import {
  ScreenBackground,
  GlassCard,
  GlassSection,
  GlassButton,
  GlassInput,
  GlassPressable,
} from "@/components/ui/glass";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI } from "@/lib/soft-ui";

const TIPO_ICON: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  carro: "car-outline",
  moto: "bicycle-outline",
  bicicleta: "bicycle-outline",
  otro: "ellipse-outline",
};

type Tipo = "carro" | "moto" | "bicicleta" | "otro";
const TIPOS: { value: Tipo; label: string }[] = [
  { value: "carro", label: "Carro" },
  { value: "moto", label: "Moto" },
  { value: "bicicleta", label: "Bicicleta" },
  { value: "otro", label: "Otro" },
];

/** Vehículo tal como lo devuelve `listMios` (lo único editable por el dueño). */
type VehiculoMio = {
  _id: Id<"vehiculos">;
  placa: string;
  tipo: string;
  marca?: string;
  color?: string;
  unidadNumero: string;
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
  const { condominioId, condominioName, canManage, theme } = useCondominio();
  const me = useQuery(api.users.me);

  // Admin: todos. Propietario/residente: solo los de sus unidades (como el portal web).
  const data = useQuery(
    canManage ? api.vehiculos.listByCondominio : api.vehiculos.listMios,
    condominioId ? { condominioId } : "skip",
  );
  const home = useQuery(
    api.portal.home,
    condominioId && !canManage ? { condominioId } : "skip",
  );

  const [editando, setEditando] = useState<VehiculoMio | null>(null);
  const [creando, setCreando] = useState(false);

  const misUnidades = home && home.allowed ? home.unidades : [];
  // Solo el dueño edita desde la app; la administración gestiona en el portal web.
  const puedeEditar = !canManage && misUnidades.length > 0;

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
          <ActivityIndicator color={theme.accent} style={{ marginTop: 30 }} />
        ) : data.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Ionicons name="car-outline" size={32} color={SoftUI.textSecondary} />
            <Text style={styles.emptyText}>
              {canManage
                ? "Sin vehículos registrados"
                : "No tienes vehículos vinculados a tu unidad"}
            </Text>
            {puedeEditar ? (
              <GlassButton
                label="Agregar vehículo"
                size="sm"
                icon={<Ionicons name="add" size={16} color={SoftUI.white} />}
                onPress={() => setCreando(true)}
              />
            ) : null}
          </GlassCard>
        ) : (
          <GlassSection
            title={
              data.length === 1
                ? `1 vehículo${canManage ? "" : " tuyo"}`
                : `${data.length} vehículos${canManage ? "" : " tuyos"}`
            }
            action={
              puedeEditar ? (
                <GlassButton
                  label="Agregar"
                  size="sm"
                  variant="secondary"
                  icon={<Ionicons name="add" size={16} color={theme.accent} />}
                  onPress={() => setCreando(true)}
                  // GlassButton es 100% de ancho por defecto y desborda el header.
                  style={{ width: "auto" }}
                />
              ) : undefined
            }
          >
            <View style={{ gap: SoftUI.space.md }}>
              {data.map((v) => {
                const card = (
                  <GlassCard style={styles.card}>
                    <View style={styles.row}>
                      <View
                        style={[
                          styles.iconWrap,
                          { backgroundColor: theme.accentSoft },
                        ]}
                      >
                        <Ionicons
                          name={TIPO_ICON[v.tipo] ?? "car-outline"}
                          size={22}
                          color={theme.accent}
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
                      {puedeEditar ? (
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={SoftUI.textDisabled}
                        />
                      ) : null}
                    </View>
                  </GlassCard>
                );

                return puedeEditar ? (
                  <GlassPressable
                    key={v._id}
                    onPress={() => setEditando(v as VehiculoMio)}
                  >
                    {card}
                  </GlassPressable>
                ) : (
                  <View key={v._id}>{card}</View>
                );
              })}
            </View>
          </GlassSection>
        )}
      </ScrollView>

      {condominioId ? (
        <VehiculoForm
          key={editando?._id ?? (creando ? "nuevo" : "cerrado")}
          visible={creando || editando !== null}
          vehiculo={editando}
          condominioId={condominioId}
          unidades={misUnidades}
          onClose={() => {
            setCreando(false);
            setEditando(null);
          }}
        />
      ) : null}
    </View>
  );
}

/* ── Formulario de alta / edición ─────────────────────────────── */
function VehiculoForm({
  visible,
  vehiculo,
  condominioId,
  unidades,
  onClose,
}: {
  visible: boolean;
  vehiculo: VehiculoMio | null;
  condominioId: Id<"condominios">;
  unidades: { _id: string; numero: string }[];
  onClose: () => void;
}) {
  const { theme } = useCondominio();
  const crear = useMutation(api.vehiculos.createMio);
  const actualizar = useMutation(api.vehiculos.updateMio);
  const eliminar = useMutation(api.vehiculos.removeMio);

  const esEdicion = vehiculo !== null;
  // El padre pasa `key` distinta por vehículo: al cambiar de objetivo el form
  // se remonta y estos initializers vuelven a correr con los datos correctos.
  const [placa, setPlaca] = useState(vehiculo?.placa ?? "");
  const [tipo, setTipo] = useState<Tipo>((vehiculo?.tipo as Tipo) ?? "carro");
  const [marca, setMarca] = useState(vehiculo?.marca ?? "");
  const [color, setColor] = useState(vehiculo?.color ?? "");
  const [unidadId, setUnidadId] = useState<string>(unidades[0]?._id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!placa.trim()) {
      setError("La placa es obligatoria.");
      return;
    }
    if (!esEdicion && !unidadId) {
      setError("Selecciona la unidad.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (esEdicion) {
        await actualizar({
          id: vehiculo._id,
          placa: placa.trim(),
          tipo,
          marca: marca.trim(),
          color: color.trim(),
        });
      } else {
        await crear({
          condominioId,
          unidadId: unidadId as Id<"unidades">,
          placa: placa.trim(),
          tipo,
          marca: marca.trim() || undefined,
          color: color.trim() || undefined,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  function confirmarEliminar() {
    if (!vehiculo) return;
    Alert.alert(
      "Eliminar vehículo",
      `¿Quitar ${vehiculo.placa} de tu unidad?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await eliminar({ id: vehiculo._id });
              onClose();
            } catch (e) {
              Alert.alert(
                "No se pudo eliminar",
                e instanceof Error ? e.message : "Inténtalo de nuevo.",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="88%">
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.formScroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.formTitle}>
          {esEdicion ? "Editar vehículo" : "Nuevo vehículo"}
        </Text>

        <GlassInput
          label="Placa"
          value={placa}
          onChangeText={(t) => setPlaca(t.toUpperCase())}
          placeholder="ABC-123"
          autoCapitalize="characters"
          // Sin autocorrección: iOS convierte el guion en apóstrofe tipográfico.
          autoCorrect={false}
          spellCheck={false}
          maxLength={10}
        />

        <View style={{ gap: 6 }}>
          <Text style={styles.formLabel}>Tipo</Text>
          <View style={styles.chipRow}>
            {TIPOS.map((t) => {
              const activo = tipo === t.value;
              return (
                <GlassPressable key={t.value} onPress={() => setTipo(t.value)}>
                  <View
                    style={[
                      styles.chip,
                      activo && { backgroundColor: theme.accent },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        activo && { color: SoftUI.white },
                      ]}
                    >
                      {t.label}
                    </Text>
                  </View>
                </GlassPressable>
              );
            })}
          </View>
        </View>

        {!esEdicion && unidades.length > 1 ? (
          <View style={{ gap: 6 }}>
            <Text style={styles.formLabel}>Unidad</Text>
            <View style={styles.chipRow}>
              {unidades.map((u) => {
                const activo = unidadId === u._id;
                return (
                  <GlassPressable key={u._id} onPress={() => setUnidadId(u._id)}>
                    <View
                      style={[
                        styles.chip,
                        activo && { backgroundColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          activo && { color: SoftUI.white },
                        ]}
                      >
                        {u.numero}
                      </Text>
                    </View>
                  </GlassPressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <GlassInput
          label="Marca (opcional)"
          value={marca}
          onChangeText={setMarca}
          placeholder="Mazda, Renault…"
        />
        <GlassInput
          label="Color (opcional)"
          value={color}
          onChangeText={setColor}
          placeholder="Blanco, gris…"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={{ gap: SoftUI.space.sm, marginTop: SoftUI.space.sm }}>
          <GlassButton
            label={esEdicion ? "Guardar cambios" : "Agregar vehículo"}
            loading={busy}
            onPress={busy ? undefined : submit}
          />
          {esEdicion ? (
            <GlassButton
              label="Eliminar vehículo"
              variant="ghost"
              disabled={busy}
              onPress={confirmarEliminar}
            />
          ) : null}
          <GlassButton label="Cancelar" variant="secondary" onPress={onClose} />
        </View>
      </ScrollView>
    </BottomSheet>
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
  formScroll: {
    paddingHorizontal: SoftUI.padH,
    paddingTop: SoftUI.space.xs,
    paddingBottom: SoftUI.space.base,
    gap: SoftUI.space.md,
  },
  formTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.hero.size - 4,
    fontFamily: AuthUI.font.bold,
    marginBottom: SoftUI.space.xs,
  },
  formLabel: {
    color: SoftUI.text,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SoftUI.space.sm,
  },
  chip: {
    paddingHorizontal: SoftUI.space.base,
    paddingVertical: SoftUI.space.sm,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.bgSecondary,
  },
  chipText: {
    color: SoftUI.text,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.semibold,
  },
  errorText: {
    color: SoftUI.danger,
    fontSize: 13,
    fontFamily: AuthUI.font.regular,
  },
});
