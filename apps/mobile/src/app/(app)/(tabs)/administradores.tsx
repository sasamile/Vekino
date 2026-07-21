import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
  StyleSheet,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useAction, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ScreenBackground, GlassButton } from "@/components/ui/glass";
import { initials } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { C } from "@/lib/theme";

type PlatformRole = "superadmin" | "admin" | null;
type AddMode = "menu" | "search" | "create" | null;

export default function AdministradoresScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <Authenticated>
          <AdministradoresContent />
        </Authenticated>
      </ScreenBackground>
    </View>
  );
}

function AdministradoresContent() {
  const { isSuperadmin } = useCondominio();
  const staff = useQuery(api.users.listPlatformStaff, isSuperadmin ? {} : "skip");
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [editing, setEditing] = useState<{
    _id: string;
    name: string;
    email: string;
    platformRole: PlatformRole;
  } | null>(null);

  if (!isSuperadmin) {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.centered}>
          <Text style={styles.mutedCenter}>No tienes acceso a esta sección.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Administradores</Text>
          <View style={styles.headerBottom}>
            <Text style={styles.subtitle}>Staff con acceso a la plataforma</Text>
            <View
              style={styles.addBtn}
              onTouchEnd={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAddMode("menu");
              }}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Agregar</Text>
            </View>
          </View>
        </View>

        {staff === undefined ? (
          <View style={styles.listGap}>
            {[0, 1].map((i) => (
              <View key={i} style={styles.staffRow}>
                <View style={[styles.avatar, { backgroundColor: "rgba(14,14,15,0.06)" }]} />
                <View style={styles.rowBody}>
                  <View style={styles.skelLineWide} />
                  <View style={styles.skelLineNarrow} />
                </View>
              </View>
            ))}
          </View>
        ) : staff.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="shield-outline" size={22} color={AuthUI.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>Sin administradores</Text>
            <Text style={styles.emptyBody}>Agrega el primero para gestionar la plataforma.</Text>
            <View
              style={[styles.addBtn, { marginTop: 16 }]}
              onTouchEnd={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAddMode("menu");
              }}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Agregar</Text>
            </View>
          </View>
        ) : (
          <View style={styles.listGap}>
            {staff.map((u) => (
              <View
                key={u._id}
                style={styles.staffRow}
                onTouchEnd={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEditing(u);
                }}
              >
                {u.image ? (
                  <Image source={{ uri: u.image }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(u.name)}</Text>
                  </View>
                )}
                <View style={styles.rowBody}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {u.name}
                  </Text>
                  <Text style={styles.rowEmail} numberOfLines={1}>
                    {u.email}
                  </Text>
                  <Text style={styles.roleText}>
                    {u.platformRole === "superadmin"
                      ? "Superadmin"
                      : u.platformRole === "admin"
                        ? "Admin plataforma"
                        : "Sin rol"}
                  </Text>
                </View>
                <View style={styles.chevronWrap}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={AuthUI.textMuted} />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={addMode === "menu"} onClose={() => setAddMode(null)} maxHeight="40%">
        <View style={styles.sheetPad}>
          <Text style={styles.sheetTitle}>Agregar administrador</Text>
          <Text style={styles.sheetSub}>Elige cómo quieres añadirlo</Text>

          <View
            style={styles.sheetOption}
            onTouchEnd={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAddMode("search");
            }}
          >
            <View style={styles.sheetOptionIcon}>
              <Ionicons name="search" size={20} color={AuthUI.text} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.sheetOptionTitle}>Buscar existente</Text>
              <Text style={styles.sheetOptionHint}>Promover un usuario por correo</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={AuthUI.textMuted} />
          </View>

          <View
            style={styles.sheetOption}
            onTouchEnd={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAddMode("create");
            }}
          >
            <View style={styles.sheetOptionIcon}>
              <Ionicons name="person-add-outline" size={20} color={AuthUI.text} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.sheetOptionTitle}>Crear nuevo</Text>
              <Text style={styles.sheetOptionHint}>Cuenta nueva con contraseña</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={AuthUI.textMuted} />
          </View>
        </View>
      </BottomSheet>

      <SearchAdminSheet visible={addMode === "search"} onClose={() => setAddMode(null)} />
      <CreateAdminSheet visible={addMode === "create"} onClose={() => setAddMode(null)} />
      <EditRoleSheet user={editing} onClose={() => setEditing(null)} />
    </SafeAreaView>
  );
}

function EditRoleSheet({
  user,
  onClose,
}: {
  user: {
    _id: string;
    name: string;
    email: string;
    platformRole: PlatformRole;
  } | null;
  onClose: () => void;
}) {
  const setPlatformRole = useMutation(api.memberships.setPlatformRole);
  const [busy, setBusy] = useState(false);

  async function change(role: PlatformRole) {
    if (!user || role === user.platformRole) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await setPlatformRole({
        userId: user._id as Id<"users">,
        platformRole: role ?? undefined,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={!!user} onClose={onClose} maxHeight="48%">
      <View style={styles.sheetPad}>
        <Text style={styles.sheetTitle} numberOfLines={1}>
          {user?.name ?? "Usuario"}
        </Text>
        <Text style={styles.sheetSub}>{user?.email}</Text>

        {busy ? (
          <ActivityIndicator color={C.textSoft} style={{ marginVertical: 24 }} />
        ) : (
          <View style={{ gap: 8, marginTop: 8 }}>
            {user?.platformRole !== "admin" && (
              <ActionRow
                label="Hacer admin plataforma"
                onPress={() => change("admin")}
              />
            )}
            {user?.platformRole !== "superadmin" && (
              <ActionRow
                label="Hacer superadmin"
                onPress={() => change("superadmin")}
              />
            )}
            <ActionRow
              label="Quitar acceso"
              danger
              onPress={() => change(null)}
            />
            <GlassButton label="Cancelar" variant="secondary" onPress={onClose} style={{ marginTop: 8 }} />
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

function ActionRow({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <View
      onTouchEnd={onPress}
      style={[styles.actionRow, danger && { backgroundColor: C.dangerSoft }]}
    >
      <Text style={[styles.actionRowText, danger && { color: C.danger }]}>{label}</Text>
    </View>
  );
}

function SearchAdminSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const found = useQuery(api.users.searchByEmail, query ? { email: query } : "skip");
  const setPlatformRole = useMutation(api.memberships.setPlatformRole);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [role, setRole] = useState<"admin" | "superadmin">("admin");

  function handleClose() {
    setEmail("");
    setQuery(null);
    setDone(false);
    setRole("admin");
    onClose();
  }

  async function promote() {
    if (!found) return;
    setBusy(true);
    try {
      await setPlatformRole({ userId: found._id as Id<"users">, platformRole: role });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} maxHeight="88%">
      <ScrollView
        contentContainerStyle={styles.sheetPad}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.sheetTitle}>Buscar usuario</Text>
        <Text style={styles.sheetSub}>Promueve un usuario existente por correo</Text>

        <Text style={styles.fieldLabel}>Correo</Text>
        <View style={styles.inputRow}>
          <Ionicons name="mail-outline" size={16} color={AuthUI.textMuted} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.com"
            placeholderTextColor={AuthUI.placeholder}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="search"
            onSubmitEditing={() => {
              setDone(false);
              setQuery(email.trim().toLowerCase());
            }}
            style={styles.input}
          />
        </View>

        <GlassButton
          label="Buscar"
          variant="primary"
          onPress={() => {
            setDone(false);
            setQuery(email.trim().toLowerCase());
          }}
          style={{ marginTop: 12 }}
        />

        {query && found === undefined && (
          <Text style={[styles.sheetSub, { marginTop: 16 }]}>Buscando…</Text>
        )}
        {query && found === null && (
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>No hay usuario con ese correo</Text>
            <Text style={styles.warnBody}>Usa “Crear nuevo” para dar de alta la cuenta.</Text>
          </View>
        )}
        {found && (
          <View style={styles.foundCard}>
            <Text style={styles.rowName}>{found.name}</Text>
            <Text style={styles.rowEmail}>{found.email}</Text>
            {done ? (
              <Text style={styles.successText}>Rol asignado correctamente</Text>
            ) : (
              <>
                <RolePicker value={role} onChange={setRole} />
                <GlassButton
                  label="Asignar rol"
                  variant="primary"
                  loading={busy}
                  onPress={promote}
                  style={{ marginTop: 12 }}
                />
              </>
            )}
          </View>
        )}

        <GlassButton label="Cerrar" variant="secondary" onPress={handleClose} style={{ marginTop: 16 }} />
      </ScrollView>
    </BottomSheet>
  );
}

function CreateAdminSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const createAdmin = useAction(api.users.createPlatformAdmin);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [role, setRole] = useState<"admin" | "superadmin">("admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("admin");
    setError(null);
    setDone(false);
    setShowPass(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function submit() {
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError("Completa nombre, correo y contraseña.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setBusy(true);
    try {
      await createAdmin({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        platformRole: role,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el usuario.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} maxHeight="92%">
      <ScrollView
        contentContainerStyle={[styles.sheetPad, { paddingBottom: 40 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.sheetTitle}>Crear administrador</Text>
        <Text style={styles.sheetSub}>Cuenta nueva con acceso a la plataforma</Text>

        {done ? (
          <View style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
            <Ionicons name="checkmark-circle" size={44} color={C.success} />
            <Text style={styles.emptyTitle}>Usuario creado</Text>
            <Text style={styles.emptyBody}>Ya puede iniciar sesión con su correo.</Text>
            <GlassButton label="Listo" variant="primary" onPress={handleClose} style={{ marginTop: 8, alignSelf: "stretch" }} />
          </View>
        ) : (
          <>
            <Text style={styles.fieldLabel}>Nombre</Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={16} color={AuthUI.textMuted} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Nombre completo"
                placeholderTextColor={AuthUI.placeholder}
                style={styles.input}
              />
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Correo</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={16} color={AuthUI.textMuted} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={AuthUI.placeholder}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Contraseña</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={16} color={AuthUI.textMuted} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={AuthUI.placeholder}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                style={styles.input}
              />
              <Pressable onPress={() => setShowPass((s) => !s)} hitSlop={8}>
                <Ionicons
                  name={showPass ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={AuthUI.textMuted}
                />
              </Pressable>
            </View>

            <RolePicker value={role} onChange={setRole} />

            {error && (
              <View style={[styles.warnBox, { marginTop: 14 }]}>
                <Text style={styles.warnTitle}>{error}</Text>
              </View>
            )}

            <GlassButton
              label="Crear cuenta"
              variant="primary"
              loading={busy}
              onPress={submit}
              style={{ marginTop: 18 }}
            />
            <GlassButton label="Cancelar" variant="secondary" onPress={handleClose} style={{ marginTop: 10 }} />
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function RolePicker({
  value,
  onChange,
}: {
  value: "admin" | "superadmin";
  onChange: (r: "admin" | "superadmin") => void;
}) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.fieldLabel}>Rol</Text>
      <View style={{ flexDirection: "row" }}>
        {(
          [
            { value: "admin" as const, label: "Admin" },
            { value: "superadmin" as const, label: "Superadmin" },
          ]
        ).map((o, i) => {
          const active = value === o.value;
          return (
            <View
              key={o.value}
              onTouchEnd={() => onChange(o.value)}
              style={[
                styles.roleChip,
                i === 0 && { marginRight: 8 },
                active && styles.roleChipActive,
              ]}
            >
              <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                {o.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 140,
    paddingHorizontal: AuthUI.padH - 7,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  mutedCenter: {
    color: AuthUI.textMuted,
    fontSize: 15,
    fontFamily: AuthUI.font.regular,
    textAlign: "center",
  },
  header: {
    marginTop: 12,
    marginBottom: 22,
  },
  headerBottom: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: AuthUI.text,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: AuthUI.font.bold,
  },
  subtitle: {
    flexGrow: 1,
    flexShrink: 1,
    color: AuthUI.textSecondary,
    fontSize: 15,
    fontFamily: AuthUI.font.regular,
    paddingRight: 12,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0E0E0F",
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 12,
    flexShrink: 0,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
    marginLeft: 4,
  },
  listGap: {
    gap: 10,
  },
  staffRow: {
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
  chevronWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(14,14,15,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F4F4F5",
  },
  avatarText: {
    color: AuthUI.text,
    fontSize: 14,
    fontFamily: AuthUI.font.bold,
  },
  rowName: {
    color: "#0E0E0F",
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
  },
  rowEmail: {
    color: "#747277",
    fontSize: 13,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  roleText: {
    color: AuthUI.purple,
    fontSize: 12,
    fontFamily: AuthUI.font.semibold,
    marginTop: 4,
  },
  skelLineWide: {
    height: 13,
    width: "55%",
    borderRadius: 6,
    backgroundColor: "rgba(14,14,15,0.06)",
    marginBottom: 8,
  },
  skelLineNarrow: {
    height: 11,
    width: "40%",
    borderRadius: 6,
    backgroundColor: "rgba(14,14,15,0.06)",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
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
  sheetPad: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 4,
  },
  sheetTitle: {
    color: AuthUI.text,
    fontSize: 22,
    fontFamily: AuthUI.font.bold,
  },
  sheetSub: {
    color: AuthUI.textMuted,
    fontSize: 14,
    fontFamily: AuthUI.font.regular,
    marginTop: 4,
    marginBottom: 18,
  },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D8D6DC",
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
    width: "100%",
  },
  sheetOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(14,14,15,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetOptionTitle: {
    color: AuthUI.text,
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
  },
  sheetOptionHint: {
    color: AuthUI.textMuted,
    fontSize: 12,
    fontFamily: AuthUI.font.regular,
    marginTop: 2,
  },
  actionRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(14,14,15,0.05)",
  },
  actionRowText: {
    color: AuthUI.text,
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
    textAlign: "center",
  },
  fieldLabel: {
    color: AuthUI.text,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    minHeight: 50,
  },
  input: {
    flex: 1,
    color: AuthUI.text,
    fontSize: 15,
    fontFamily: AuthUI.font.regular,
    paddingVertical: 12,
    marginLeft: 8,
  },
  foundCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D8D6DC",
    backgroundColor: "#FFFFFF",
  },
  warnBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.dangerSoft,
  },
  warnTitle: {
    color: C.danger,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
  },
  warnBody: {
    color: AuthUI.textSecondary,
    fontSize: 13,
    fontFamily: AuthUI.font.regular,
    marginTop: 4,
  },
  successText: {
    color: C.success,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
    marginTop: 12,
  },
  roleChip: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D8D6DC",
    backgroundColor: "#FFFFFF",
  },
  roleChipActive: {
    backgroundColor: "#0E0E0F",
    borderColor: "#0E0E0F",
  },
  roleChipText: {
    color: AuthUI.textMuted,
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
  },
  roleChipTextActive: {
    color: "#FFFFFF",
  },
});
