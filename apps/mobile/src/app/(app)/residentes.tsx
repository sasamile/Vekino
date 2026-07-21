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
import { initials } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";

const OPERATIONAL_ROLES = [
  "administrador",
  "propietario",
  "apoderado",
  "arrendatario",
  "residente",
  "contadora",
  "guardia",
  "junta_directiva",
  "representante_asamblea",
] as const;
type OpRole = (typeof OPERATIONAL_ROLES)[number];

const ROL_LABEL: Record<string, string> = {
  administrador: "Administrador",
  junta_directiva: "Junta",
  contadora: "Contadora",
  guardia: "Guardia",
  propietario: "Propietario",
  apoderado: "Apoderado",
  arrendatario: "Arrendatario",
  residente: "Residente",
  representante_asamblea: "Rep. asamblea",
};
const ROL_TONE: Record<string, "orange" | "blue" | "green" | "neutral"> = {
  administrador: "orange",
  junta_directiva: "blue",
  contadora: "green",
  guardia: "neutral",
  propietario: "blue",
  apoderado: "blue",
  arrendatario: "neutral",
  residente: "neutral",
  representante_asamblea: "blue",
};

type MemberRow = {
  membershipId: Id<"memberships">;
  userId: Id<"users">;
  name: string | null;
  email: string | null;
  telefono: string | null;
  roles: string[];
  isActive: boolean;
};

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function ResidentesScreen() {
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
  const [editing, setEditing] = useState<MemberRow | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.memberships.listPage,
    condominioId
      ? { condominioId, q: deferredQ.trim() || undefined }
      : "skip",
    { initialNumItems: 30 },
  );

  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";
  const hasQ = Boolean(deferredQ.trim());

  return (
    <Section title="Residentes">
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={AuthUI.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Buscar por nombre o correo…"
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
          <Ionicons name="people-outline" size={32} color={AuthUI.textMuted} />
          <Text style={styles.empty}>
            {hasQ ? "Sin resultados" : "Sin residentes registrados"}
          </Text>
        </GlassCard>
      ) : (
        <View style={styles.list}>
          <Text style={styles.count}>
            {results.length}
            {status !== "Exhausted" && !hasQ ? "+" : ""} persona
            {results.length === 1 ? "" : "s"}
          </Text>

          {results.map((m) => (
            <Tap
              key={m.membershipId}
              disabled={!canManage}
              onPress={() => setEditing(m as MemberRow)}
            >
              <GlassCard style={{ padding: 16 }}>
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(m.name ?? "?")}</Text>
                  </View>
                  <View style={styles.body}>
                    <Text style={styles.name} numberOfLines={1}>
                      {m.name ?? "Sin nombre"}
                    </Text>
                    {m.email ? (
                      <Text style={styles.email} numberOfLines={1}>
                        {m.email}
                      </Text>
                    ) : null}
                    <View style={styles.badges}>
                      {m.roles.map((r) => (
                        <GlassBadge
                          key={r}
                          label={ROL_LABEL[r] ?? r}
                          tone={ROL_TONE[r] ?? "neutral"}
                        />
                      ))}
                    </View>
                  </View>
                  {canManage ? (
                    <Ionicons name="create-outline" size={18} color={AuthUI.textMuted} />
                  ) : !m.isActive ? (
                    <GlassBadge label="Inactivo" tone="neutral" />
                  ) : null}
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

      {condominioId && (
        <EditResidenteSheet
          condominioId={condominioId}
          member={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Section>
  );
}

function EditResidenteSheet({
  condominioId,
  member,
  onClose,
}: {
  condominioId: Id<"condominios">;
  member: MemberRow | null;
  onClose: () => void;
}) {
  const updateMember = useMutation(api.memberships.updateMember);
  const [name, setName] = useState("");
  const [telefono, setTelefono] = useState("");
  const [roles, setRoles] = useState<Set<OpRole>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!member) return;
    setName(member.name ?? "");
    setTelefono(member.telefono ?? "");
    setRoles(new Set(member.roles.filter((r): r is OpRole => OPERATIONAL_ROLES.includes(r as OpRole))));
  }, [member]);

  function toggleRole(r: OpRole) {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  async function save() {
    if (!member) return;
    setBusy(true);
    try {
      await updateMember({
        condominioId,
        userId: member.userId,
        name: name.trim(),
        telefono: telefono.trim(),
        roles: [...roles],
      });
      onClose();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={member !== null} onClose={onClose} maxHeight="88%">
      {member && (
        <ScrollView
          contentContainerStyle={styles.sheet}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sheetKicker}>Editar residente</Text>
          <Text style={styles.sheetTitle}>{member.email ?? "Sin correo"}</Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre completo"
            placeholderTextColor={AuthUI.placeholder}
            style={styles.input}
          />

          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            value={telefono}
            onChangeText={setTelefono}
            placeholder="Opcional"
            placeholderTextColor={AuthUI.placeholder}
            keyboardType="phone-pad"
            style={styles.input}
          />

          <Text style={styles.label}>Roles</Text>
          <View style={styles.roleGrid}>
            {OPERATIONAL_ROLES.map((r) => {
              const on = roles.has(r);
              return (
                <View
                  key={r}
                  style={[styles.roleChip, on && styles.roleChipOn]}
                  onTouchEnd={() => toggleRole(r)}
                >
                  <Text style={[styles.roleChipText, on && styles.roleChipTextOn]}>
                    {ROL_LABEL[r] ?? r}
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
              disabled={busy || !name.trim()}
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(14,14,15,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: AuthUI.text,
    fontSize: 14,
    fontFamily: AuthUI.font.bold,
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  name: {
    color: AuthUI.text,
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
  },
  email: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
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
  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  roleChip: {
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  roleChipOn: {
    borderColor: AuthUI.text,
    backgroundColor: "rgba(14,14,15,0.06)",
  },
  roleChipText: {
    color: AuthUI.textMuted,
    fontSize: 13,
    fontFamily: AuthUI.font.medium,
  },
  roleChipTextOn: {
    color: AuthUI.text,
    fontFamily: AuthUI.font.semibold,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
  },
});
