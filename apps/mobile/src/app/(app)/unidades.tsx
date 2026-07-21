import { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePaginatedQuery, useMutation, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard, GlassBadge, GlassButton } from "@/components/ui/glass";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";

const TIPOS = [
  "apartamento",
  "casa",
  "local",
  "parqueadero",
  "deposito",
  "oficina",
  "otro",
] as const;
type Tipo = (typeof TIPOS)[number];

const ESTADOS = ["ocupada", "desocupada", "en_mora", "inactiva"] as const;
type Estado = (typeof ESTADOS)[number];

const TIPO_LABEL: Record<string, string> = {
  apartamento: "Apartamento",
  casa: "Casa",
  local: "Local",
  parqueadero: "Parqueadero",
  deposito: "Depósito",
  oficina: "Oficina",
  otro: "Otro",
};
const ESTADO_LABEL: Record<string, string> = {
  ocupada: "Ocupada",
  desocupada: "Desocupada",
  en_mora: "En mora",
  inactiva: "Inactiva",
};
const ESTADO_TONE: Record<string, "green" | "yellow" | "neutral" | "red"> = {
  ocupada: "green",
  desocupada: "neutral",
  en_mora: "yellow",
  inactiva: "neutral",
};

type UnidadRow = {
  _id: Id<"unidades">;
  numero: string;
  torre: string | null;
  tipo: string;
  estado: string;
  coeficiente: number | null;
  residentes: { name: string | null; email: string | null; vinculo: string }[];
};

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function UnidadesScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const { condominioId, canManage } = useCondominio();
  const [q, setQ] = useState("");
  const deferredQ = useDebounced(q, 280);
  const [editing, setEditing] = useState<UnidadRow | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.unidades.listPage,
    condominioId
      ? { condominioId, q: deferredQ.trim() || undefined }
      : "skip",
    { initialNumItems: 30 },
  );

  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";
  const hasQ = Boolean(deferredQ.trim());

  return (
    <Section title="Unidades">
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={AuthUI.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Buscar por torre o número…"
          placeholderTextColor={AuthUI.placeholder}
          style={styles.searchInput}
        />
        {q.length > 0 ? (
          <Text style={styles.clear} onPress={() => setQ("")}>
            Limpiar
          </Text>
        ) : null}
      </View>

      {status === "LoadingFirstPage" ? (
        <ActivityIndicator color={AuthUI.textMuted} style={{ marginTop: 30 }} />
      ) : results.length === 0 ? (
        <GlassCard style={{ padding: 40, alignItems: "center" }}>
          <Ionicons name="business-outline" size={32} color={AuthUI.textMuted} />
          <Text style={styles.empty}>
            {hasQ ? "Sin resultados" : "Sin unidades registradas"}
          </Text>
        </GlassCard>
      ) : (
        <View style={styles.list}>
          <Text style={styles.count}>
            {results.length}
            {status !== "Exhausted" && !hasQ ? "+" : ""} unidad
            {results.length === 1 ? "" : "es"}
          </Text>

          {results.map((u) => (
            <Tap
              key={u._id}
              disabled={!canManage}
              onPress={() => setEditing(u as UnidadRow)}
            >
              <GlassCard style={{ padding: 16 }}>
                <View style={styles.row}>
                  <View style={styles.icon}>
                    <Ionicons name="home-outline" size={20} color={AuthUI.text} />
                  </View>
                  <View style={styles.body}>
                    <Text style={styles.name}>
                      {u.torre ? `${u.torre} · ` : ""}
                      {u.numero}
                    </Text>
                    <Text style={styles.meta}>
                      {TIPO_LABEL[u.tipo] ?? u.tipo}
                      {u.coeficiente != null ? ` · Coef. ${u.coeficiente}%` : ""}
                    </Text>
                    {u.residentes.length > 0 ? (
                      <Text style={styles.residents} numberOfLines={1}>
                        {u.residentes.map((r) => r.name).filter(Boolean).join(", ") ||
                          "Sin residentes"}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.trailing}>
                    <GlassBadge
                      label={ESTADO_LABEL[u.estado] ?? u.estado}
                      tone={ESTADO_TONE[u.estado] ?? "neutral"}
                    />
                    {canManage ? (
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color={AuthUI.textMuted}
                        style={{ marginTop: 8 }}
                      />
                    ) : null}
                  </View>
                </View>
              </GlassCard>
            </Tap>
          ))}

          {(canLoadMore || loadingMore) && (
            <Tap
              style={styles.loadMore}
              disabled={!canLoadMore}
              onPress={() => loadMore(30)}
            >
              {loadingMore ? (
                <ActivityIndicator color={AuthUI.textMuted} />
              ) : (
                <Text style={styles.loadMoreText}>Cargar más</Text>
              )}
            </Tap>
          )}
        </View>
      )}

      <EditUnidadSheet unidad={editing} onClose={() => setEditing(null)} />
    </Section>
  );
}

function EditUnidadSheet({
  unidad,
  onClose,
}: {
  unidad: UnidadRow | null;
  onClose: () => void;
}) {
  const update = useMutation(api.unidades.update);
  const [numero, setNumero] = useState("");
  const [torre, setTorre] = useState("");
  const [tipo, setTipo] = useState<Tipo>("apartamento");
  const [estado, setEstado] = useState<Estado>("desocupada");
  const [coef, setCoef] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!unidad) return;
    setNumero(unidad.numero);
    setTorre(unidad.torre ?? "");
    setTipo((TIPOS.includes(unidad.tipo as Tipo) ? unidad.tipo : "apartamento") as Tipo);
    setEstado(
      (ESTADOS.includes(unidad.estado as Estado) ? unidad.estado : "desocupada") as Estado,
    );
    setCoef(unidad.coeficiente != null ? String(unidad.coeficiente) : "");
  }, [unidad]);

  async function save() {
    if (!unidad) return;
    setBusy(true);
    try {
      const coeficiente = coef.trim() === "" ? undefined : Number(coef.replace(",", "."));
      if (coeficiente !== undefined && Number.isNaN(coeficiente)) {
        throw new Error("Coeficiente inválido");
      }
      await update({
        unidadId: unidad._id,
        numero: numero.trim(),
        torre: torre.trim(),
        tipo,
        estado,
        coeficiente,
      });
      onClose();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={unidad !== null} onClose={onClose} maxHeight="88%">
      {unidad && (
        <ScrollView
          contentContainerStyle={styles.sheet}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sheetKicker}>Editar unidad</Text>
          <Text style={styles.sheetTitle}>
            {unidad.torre ? `${unidad.torre} · ` : ""}
            {unidad.numero}
          </Text>

          <Text style={styles.label}>Número</Text>
          <TextInput
            value={numero}
            onChangeText={setNumero}
            placeholder="Ej. 101"
            placeholderTextColor={AuthUI.placeholder}
            style={styles.input}
          />

          <Text style={styles.label}>Torre / bloque</Text>
          <TextInput
            value={torre}
            onChangeText={setTorre}
            placeholder="Opcional"
            placeholderTextColor={AuthUI.placeholder}
            style={styles.input}
          />

          <Text style={styles.label}>Coeficiente (%)</Text>
          <TextInput
            value={coef}
            onChangeText={setCoef}
            placeholder="Ej. 2.5"
            placeholderTextColor={AuthUI.placeholder}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text style={styles.label}>Tipo</Text>
          <View style={styles.chipRow}>
            {TIPOS.map((t) => {
              const on = tipo === t;
              return (
                <View
                  key={t}
                  style={[styles.chip, on && styles.chipOn]}
                  onTouchEnd={() => setTipo(t)}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {TIPO_LABEL[t]}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.label}>Estado</Text>
          <View style={styles.chipRow}>
            {ESTADOS.map((e) => {
              const on = estado === e;
              return (
                <View
                  key={e}
                  style={[styles.chip, on && styles.chipOn]}
                  onTouchEnd={() => setEstado(e)}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {ESTADO_LABEL[e]}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.sheetActions}>
            <GlassButton label="Cancelar" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <GlassButton
              label={busy ? "Guardando…" : "Guardar"}
              onPress={save}
              loading={busy}
              disabled={busy || !numero.trim()}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 16,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    color: AuthUI.text,
    fontSize: 15,
    fontFamily: AuthUI.font.regular,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  clear: {
    color: AuthUI.purple,
    fontSize: 13,
    fontFamily: AuthUI.font.semibold,
  },
  empty: {
    color: AuthUI.textMuted,
    fontSize: 14,
    fontFamily: AuthUI.font.regular,
    marginTop: 10,
  },
  list: {
    gap: 10,
  },
  count: {
    color: AuthUI.textMuted,
    fontSize: 13,
    fontFamily: AuthUI.font.medium,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(14,14,15,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  trailing: {
    alignItems: "flex-end",
  },
  name: {
    color: AuthUI.text,
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
  },
  meta: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  residents: {
    color: AuthUI.textSecondary,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    marginTop: 4,
  },
  loadMore: {
    marginTop: 8,
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: "#FFFFFF",
  },
  loadMoreText: {
    color: AuthUI.text,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
  },
  sheet: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  sheetKicker: {
    color: AuthUI.textMuted,
    fontSize: 13,
    fontFamily: AuthUI.font.medium,
  },
  sheetTitle: {
    color: AuthUI.text,
    fontSize: 18,
    fontFamily: AuthUI.font.semibold,
    marginTop: 4,
    marginBottom: 18,
  },
  label: {
    color: AuthUI.textSecondary,
    fontSize: 13,
    fontFamily: AuthUI.font.medium,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: AuthUI.text,
    fontSize: 15,
    fontFamily: AuthUI.font.regular,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipOn: {
    borderColor: AuthUI.text,
    backgroundColor: "rgba(14,14,15,0.06)",
  },
  chipText: {
    color: AuthUI.textMuted,
    fontSize: 13,
    fontFamily: AuthUI.font.medium,
  },
  chipTextOn: {
    color: AuthUI.text,
    fontFamily: AuthUI.font.semibold,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
});
