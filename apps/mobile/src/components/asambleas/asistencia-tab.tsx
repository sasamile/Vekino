import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  Image,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { GlassCard, GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";

function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(data)}`;
}

/** Extrae un mensaje corto en español; oculta el dump de Convex. */
function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const uncaught = raw.match(/Uncaught Error:\s*(.+?)(?:\n|$)/i);
  const plain = raw.match(/Error:\s*(.+?)(?:\n|\[|$)/i);
  let msg = (uncaught?.[1] ?? plain?.[1] ?? raw).trim();
  // Quita ruido de Convex / stacks
  msg = msg
    .replace(/\[CONVEX[^\]]*\]/gi, "")
    .replace(/\[Request ID:[^\]]*\]/gi, "")
    .replace(/Server Error/gi, "")
    .replace(/Called by client/gi, "")
    .replace(/\s+at\s+handler[\s\S]*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/unidades vinculadas/i.test(msg)) {
    return "No tienes unidades vinculadas. Solo puedes registrar a otros con QR o código.";
  }
  if (/asamblea ya no está activa/i.test(msg)) {
    return "La asamblea ya no está activa.";
  }
  if (/código no encontrado|código inválido/i.test(msg)) {
    return "Código no válido para esta asamblea.";
  }
  if (/qr inválido|otra asamblea/i.test(msg)) {
    return msg;
  }
  if (!msg || /CONVEX|Request ID|at handler/i.test(msg)) {
    return "No se pudo completar la acción. Intenta de nuevo.";
  }
  return msg.length > 120 ? `${msg.slice(0, 117)}…` : msg;
}

function formatPersona(name: string | null | undefined) {
  const t = (name ?? "").trim();
  if (!t) return "—";
  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t)) {
    return t
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return t;
}

type ModoAdmin = "codigo" | "buscar";

const ATTENDANCE_ROLES = [
  "administrador",
  "junta_directiva",
  "contadora",
  "representante_asamblea",
];

export function AsistenciaTab({
  asambleaId,
  mi,
}: {
  asambleaId: Id<"asambleas">;
  mi: {
    presente: boolean;
    unidades: string[];
    representa: string[];
    delegoTodo?: boolean;
    apoderadoNombre?: string | null;
  } | null | undefined;
}) {
  const { condominioId, canManage, isSuperadmin, theme } = useCondominio();
  const me = useQuery(api.users.me);
  const membership = me?.memberships?.find((m) => m.condominioId === condominioId);
  const canRegister =
    isSuperadmin ||
    canManage ||
    (membership?.roles ?? []).some((r) => ATTENDANCE_ROLES.includes(r));

  const det = useQuery(
    api.asambleas.asistentesDetallado,
    canRegister ? { asambleaId } : "skip",
  );
  const registrarSelf = useMutation(api.asambleas.registrarAsistencia);
  const [busySelf, setBusySelf] = useState(false);
  const [modo, setModo] = useState<ModoAdmin | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(true);

  const home = useQuery(
    api.portal.home,
    condominioId ? { condominioId } : "skip",
  );
  // Solo dueños/residentes con unidad vinculada. Admin sin casa → no QR ni “marcar”.
  const homeReady = home !== undefined;
  const tieneUnidades =
    homeReady &&
    home !== null &&
    home.allowed === true &&
    Array.isArray(home.unidades) &&
    home.unidades.length > 0;

  const presentes = (det?.filas ?? []).filter((f) => f.presente);
  const userId = me?.id as Id<"users"> | undefined;
  const qrPayload =
    userId && asambleaId && tieneUnidades && !mi?.delegoTodo
      ? JSON.stringify({ asambleaId, userId })
      : null;

  function notify(text: string, ok = true) {
    setMsg(text);
    setMsgOk(ok);
  }

  async function confirmarYo() {
    if (!tieneUnidades) {
      notify("No tienes unidades vinculadas. Solo puedes registrar a otros.", false);
      return;
    }
    setBusySelf(true);
    setMsg(null);
    try {
      await registrarSelf({ asambleaId });
      notify("Asistencia registrada.");
    } catch (e) {
      notify(friendlyError(e), false);
    } finally {
      setBusySelf(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      {/* Solo si el usuario tiene unidad propia vinculada */}
      {tieneUnidades ? (
        <GlassCard
          style={{
            padding: 18,
            gap: 8,
            alignItems: "center",
            borderLeftWidth: mi?.presente ? 3 : 0,
            borderLeftColor: mi?.presente ? C.success : "transparent",
          }}
        >
          {mi?.delegoTodo && !mi?.presente ? (
            <>
              <Ionicons name="person-add-outline" size={22} color={theme.accent} />
              <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 16 }}>
                Delegaste tu voto
              </Text>
              <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
                {mi.apoderadoNombre
                  ? `${formatPersona(mi.apoderadoNombre)} vota por ti. `
                  : "Tu apoderado vota por ti. "}
                Ya no necesitas QR de asistencia; el apoderado se registra con su código en el punto
                de control.
              </Text>
            </>
          ) : mi?.presente ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="checkmark-circle" size={22} color={C.success} />
                <Text
                  style={{
                    color: C.success,
                    fontFamily: AuthUI.font.semibold,
                    fontSize: 16,
                  }}
                >
                  Estás presente
                </Text>
              </View>
              {(mi.unidades?.length ?? 0) > 0 ? (
                <Text
                  style={{
                    color: C.textMuted,
                    fontSize: 13,
                    textAlign: "center",
                    fontFamily: AuthUI.font.medium,
                  }}
                >
                  Tu(s) casa(s): {mi.unidades.join(", ")}
                </Text>
              ) : null}
              {(mi.representa?.length ?? 0) > 0 ? (
                <Text
                  style={{
                    color: theme.accent,
                    fontSize: 13,
                    textAlign: "center",
                    fontFamily: AuthUI.font.medium,
                    marginTop: 2,
                  }}
                >
                  También votas por poder por: {mi.representa.join(", ")}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 15 }}>
                Tu asistencia
              </Text>
              <Tap onPress={confirmarYo} disabled={busySelf} style={{ alignSelf: "stretch" }}>
                <View
                  style={{
                    height: 44,
                    borderRadius: 11,
                    backgroundColor: AuthUI.text,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: busySelf ? 0.6 : 1,
                  }}
                >
                  {busySelf ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
                      Marcar mi asistencia
                    </Text>
                  )}
                </View>
              </Tap>
              {qrPayload ? (
                <>
                  <Text style={{ color: C.textMuted, fontSize: 12, textAlign: "center", marginTop: 4 }}>
                    Muestra este QR para que te registren
                  </Text>
                  <Image
                    source={{ uri: qrUrl(qrPayload) }}
                    style={{ width: 180, height: 180, borderRadius: 12, backgroundColor: "#fff" }}
                    resizeMode="contain"
                  />
                </>
              ) : null}
            </>
          )}
          {msg && !canRegister ? (
            <Text
              style={{
                color: msgOk ? C.success : C.danger,
                fontSize: 12,
                textAlign: "center",
              }}
            >
              {msg}
            </Text>
          ) : null}
        </GlassCard>
      ) : null}

      {canRegister && condominioId ? (
        <GlassCard style={{ padding: 14, gap: 12 }}>
          <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 15 }}>
            Registrar asistencia
          </Text>

          <Tap
            onPress={() => {
              setModo(null);
              setMsg(null);
              setScanOpen(true);
            }}
          >
            <View
              style={{
                height: 52,
                borderRadius: 12,
                backgroundColor: theme.accent,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <Ionicons name="qr-code-outline" size={22} color="#fff" />
              <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold, fontSize: 15 }}>
                Escanear QR
              </Text>
            </View>
          </Tap>

          <View style={{ flexDirection: "row", gap: 6 }}>
            {(
              [
                { key: "codigo" as const, label: "Código", icon: "key-outline" as const },
                { key: "buscar" as const, label: "Buscar", icon: "search-outline" as const },
              ] as const
            ).map((m) => (
              <Tap
                key={m.key}
                style={{ flex: 1 }}
                onPress={() => {
                  setModo(m.key);
                  setMsg(null);
                }}
              >
                <View
                  style={{
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: AuthUI.border,
                    backgroundColor: AuthUI.white,
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ionicons name={m.icon} size={16} color={C.textMuted} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: AuthUI.font.semibold,
                      color: C.textMuted,
                    }}
                  >
                    {m.label}
                  </Text>
                </View>
              </Tap>
            ))}
          </View>

          {msg ? (
            <Text
              style={{
                color: msgOk ? C.success : C.danger,
                fontSize: 13,
                fontFamily: AuthUI.font.medium,
              }}
            >
              {msg}
            </Text>
          ) : null}
        </GlassCard>
      ) : null}

      <BottomSheet visible={modo === "codigo"} onClose={() => setModo(null)} maxHeight="92%">
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
          <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 17 }}>
            Registrar por código
          </Text>
          <CodigoForm
            asambleaId={asambleaId}
            autoFocus
            onDone={(text) => {
              notify(text);
              setModo(null);
            }}
            onError={(text) => notify(text, false)}
          />
        </View>
      </BottomSheet>

      <BottomSheet visible={modo === "buscar"} onClose={() => setModo(null)} maxHeight="92%">
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
          <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 17 }}>
            Buscar propietario
          </Text>
          {condominioId ? (
            <BuscarForm
              asambleaId={asambleaId}
              condominioId={condominioId}
              autoFocus
              onDone={(text) => {
                notify(text);
                setModo(null);
              }}
              onError={(text) => notify(text, false)}
            />
          ) : null}
        </View>
      </BottomSheet>

      <ScanQrModal
        visible={scanOpen}
        asambleaId={asambleaId}
        onClose={() => setScanOpen(false)}
        onDone={(text) => {
          notify(text);
          setScanOpen(false);
        }}
        onError={(text) => notify(text, false)}
      />

      {canRegister ? (
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: C.text, fontSize: 17, fontFamily: AuthUI.font.semibold }}>
            Quiénes asistieron
          </Text>
          <Text style={{ color: C.textMuted, fontSize: 13 }}>
            {presentes.length} unidad{presentes.length === 1 ? "" : "es"}
          </Text>
        </View>

        {det === undefined ? (
          <ActivityIndicator color={C.textSoft} />
        ) : presentes.length === 0 ? (
          <GlassCard style={{ padding: 20 }}>
            <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
              Nadie registrado todavía.
            </Text>
          </GlassCard>
        ) : (
          presentes.map((f) => {
            const tambien = f.tambienRepresenta ?? [];
            return (
            <GlassCard key={f.unidadId} style={{ padding: 16, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 15 }}>
                    Unidad {f.unidadNumero}
                  </Text>
                  <Text style={{ color: C.textMuted, fontSize: 13 }}>
                    {formatPersona(f.asistente ?? f.propietario)}
                  </Text>
                  {!f.porPoder && tambien.length > 0 ? (
                    <Text style={{ color: theme.accent, fontSize: 12 }}>
                      También representa {tambien.length === 1 ? "la unidad" : "las unidades"}{" "}
                      {tambien.join(", ")}
                    </Text>
                  ) : null}
                  {f.porPoder ? (
                    <Text style={{ color: C.textMuted, fontSize: 12 }}>
                      Propietario: {formatPersona(f.propietario)} · Representada por poder
                    </Text>
                  ) : null}
                </View>
                <GlassBadge
                  label={f.porPoder ? "Por poder" : "Presente"}
                  tone={f.porPoder ? "blue" : "green"}
                />
              </View>
            </GlassCard>
            );
          })
        )}
      </View>
      ) : null}
    </View>
  );
}

function CodigoForm({
  asambleaId,
  onDone,
  onError,
  autoFocus,
}: {
  asambleaId: Id<"asambleas">;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
  autoFocus?: boolean;
}) {
  const registrar = useMutation(api.asambleas.registrarAsistenciaPorCodigo);
  const [codigo, setCodigo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [autoFocus]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await registrar({ asambleaId, codigo });
      onDone(`${r.nombre}: ${r.registradas} unidad(es) · ${r.unidades.join(", ")}`);
      setCodigo("");
    } catch (e) {
      const m = friendlyError(e);
      setError(m);
      onError(m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: C.textMuted, fontSize: 12 }}>
        Código del apoderado que te entrega el propietario.
      </Text>
      <TextInput
        ref={inputRef}
        value={codigo}
        onChangeText={(t) => setCodigo(t.toUpperCase())}
        placeholder="XXXXXX"
        placeholderTextColor={AuthUI.placeholder}
        autoCapitalize="characters"
        maxLength={8}
        style={[styles.input, styles.inputCodigo]}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {error ? <Text style={{ color: C.danger, fontSize: 12 }}>{error}</Text> : null}
      <Tap onPress={submit} disabled={busy || codigo.trim().length < 4}>
        <View
          style={[
            styles.primaryBtn,
            { opacity: busy || codigo.trim().length < 4 ? 0.5 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold }}>Registrar código</Text>
          )}
        </View>
      </Tap>
    </View>
  );
}

function BuscarForm({
  asambleaId,
  condominioId,
  onDone,
  onError,
  autoFocus,
}: {
  asambleaId: Id<"asambleas">;
  condominioId: Id<"condominios">;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
  autoFocus?: boolean;
}) {
  const [term, setTerm] = useState("");
  const results = useQuery(
    api.asambleas.buscarUsuarios,
    term.trim().length >= 2 ? { condominioId, search: term } : "skip",
  );
  const registrar = useMutation(api.asambleas.registrarAsistenciaAdmin);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [autoFocus]);

  async function reg(userId: Id<"users">, nombre: string) {
    setBusyId(userId);
    try {
      const r = await registrar({ asambleaId, userId });
      onDone(`${nombre}: ${r.registradas} unidad(es)`);
      setTerm("");
    } catch (e) {
      onError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        ref={inputRef}
        value={term}
        onChangeText={setTerm}
        placeholder="Nombre o correo…"
        placeholderTextColor={AuthUI.placeholder}
        style={styles.input}
      />
      {term.trim().length >= 2 ? (
        results === undefined ? (
          <ActivityIndicator color={C.textSoft} />
        ) : results.length === 0 ? (
          <Text style={{ color: C.textMuted, fontSize: 12 }}>Sin resultados</Text>
        ) : (
          results.map((u) => (
            <Tap key={u._id} onPress={() => reg(u._id, u.name)} disabled={busyId === u._id}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: AuthUI.border,
                  backgroundColor: AuthUI.white,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontFamily: AuthUI.font.medium, fontSize: 14 }}>
                    {u.name}
                  </Text>
                  {u.email ? (
                    <Text style={{ color: C.textMuted, fontSize: 11 }}>{u.email}</Text>
                  ) : null}
                </View>
                {busyId === u._id ? (
                  <ActivityIndicator color={C.textSoft} />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={20} color={C.success} />
                )}
              </View>
            </Tap>
          ))
        )
      ) : null}
    </View>
  );
}

function ScanQrModal({
  visible,
  asambleaId,
  onClose,
  onDone,
  onError,
}: {
  visible: boolean;
  asambleaId: Id<"asambleas">;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const registrarQr = useMutation(api.asambleas.registrarAsistenciaAdmin);
  const registrarCodigo = useMutation(api.asambleas.registrarAsistenciaPorCodigo);
  const lock = useRef(false);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleRaw = useCallback(
    async (raw: string) => {
      if (!scanning || lock.current) return;
      lock.current = true;
      setScanning(false);
      setError(null);
      try {
        const trimmed = raw.trim();
        if (trimmed.startsWith("{")) {
          const parsed = JSON.parse(trimmed) as { asambleaId?: string; userId?: string };
          if (!parsed.userId || !parsed.asambleaId) throw new Error("QR inválido.");
          if (parsed.asambleaId !== asambleaId) throw new Error("Este QR es de otra asamblea.");
          const r = await registrarQr({
            asambleaId,
            userId: parsed.userId as Id<"users">,
          });
          onDone(`${r.nombre}: ${r.registradas} unidad(es)`);
          return;
        }
        const codigo = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (codigo.length < 4) throw new Error("QR no reconocido.");
        const r = await registrarCodigo({ asambleaId, codigo });
        onDone(`${r.nombre}: ${r.registradas} unidad(es) · ${r.unidades.join(", ")}`);
      } catch (e) {
        const m = friendlyError(e);
        setError(m);
        onError(m);
        setTimeout(() => {
          lock.current = false;
          setScanning(true);
        }, 1600);
      }
    },
    [asambleaId, onDone, onError, registrarCodigo, registrarQr, scanning],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold, fontSize: 17 }}>
            Escanear QR
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        {!permission ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
        ) : !permission.granted ? (
          <View style={styles.modalCenter}>
            <Text style={{ color: "#fff", textAlign: "center", marginBottom: 16, fontSize: 14 }}>
              Necesitamos la cámara para escanear el QR de asistencia.
            </Text>
            <Tap onPress={requestPermission}>
              <View style={[styles.primaryBtn, { backgroundColor: "#fff" }]}>
                <Text style={{ color: AuthUI.text, fontFamily: AuthUI.font.semibold }}>
                  Permitir cámara
                </Text>
              </View>
            </Tap>
          </View>
        ) : cameraError ? (
          <View style={styles.modalCenter}>
            <Text style={{ color: "#fff", textAlign: "center", fontSize: 14, lineHeight: 20 }}>
              {cameraError}
              {"\n\n"}
              Rebuild la app nativa:{"\n"}
              bun run ios  /  bun run android
            </Text>
            <Tap onPress={onClose} style={{ marginTop: 20 }}>
              <View style={[styles.primaryBtn, { backgroundColor: "#fff" }]}>
                <Text style={{ color: AuthUI.text, fontFamily: AuthUI.font.semibold }}>Cerrar</Text>
              </View>
            </Tap>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={
                scanning
                  ? (r) => {
                      void handleRaw(r.data);
                    }
                  : undefined
              }
              onMountError={() =>
                setCameraError(
                  "La cámara nativa no está disponible en este build. Hay que recompilar la app con expo-camera.",
                )
              }
            />
            <View style={styles.scanFrameLarge} pointerEvents="none" />
            <Text style={styles.scanHint}>
              Apunta al QR del propietario o al código del apoderado
            </Text>
            {error ? <Text style={styles.scanError}>{error}</Text> : null}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(14,14,15,0.06)",
    overflow: "hidden",
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: AuthUI.white,
    paddingHorizontal: 14,
    color: AuthUI.text,
    fontFamily: AuthUI.font.regular,
    fontSize: 15,
    letterSpacing: 0,
  },
  inputCodigo: {
    textAlign: "center",
    letterSpacing: 4,
    fontFamily: AuthUI.font.bold,
    fontSize: 20,
  },
  primaryBtn: {
    height: 44,
    borderRadius: 11,
    backgroundColor: AuthUI.text,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: "#0E0E0F",
  },
  modalHeader: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  scanFrameLarge: {
    position: "absolute",
    top: "22%",
    left: "12%",
    right: "12%",
    bottom: "28%",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 20,
  },
  scanHint: {
    position: "absolute",
    bottom: 48,
    left: 24,
    right: 24,
    textAlign: "center",
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: AuthUI.font.medium,
  },
  scanError: {
    position: "absolute",
    bottom: 100,
    left: 24,
    right: 24,
    textAlign: "center",
    color: "#FCA5A5",
    fontSize: 13,
    fontFamily: AuthUI.font.medium,
  },
});
