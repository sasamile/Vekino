import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PastelShell } from "@/components/ui/pastel-shell";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";
import { C } from "@/lib/theme";

const ACCENT = AuthUI.purple;

/**
 * Acceso de apoderado sin cuenta (desde login).
 * El código deja de funcionar cuando la asamblea finaliza/cancela.
 */
export default function CodigoAsambleaScreen() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const data = useQuery(api.asambleas.accederConCodigo, codigo ? { codigo } : "skip");

  return (
    <PastelShell>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
            <Tap onPress={() => router.back()}>
              <View style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color={AuthUI.text} />
              </View>
            </Tap>
            <Text style={styles.headerTitle}>Código de asamblea</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.subtitle}>
              Ingresa el código que te entregaron en recepción para votar por las unidades que
              representas.
            </Text>

            {!codigo || data === null ? (
              <View style={styles.card}>
                {data === null ? (
                  <Text style={styles.errorBox}>
                    Código inválido o la asamblea ya cerró. Verifica con la administración.
                  </Text>
                ) : null}
                <Text style={styles.label}>Código de acceso</Text>
                <TextInput
                  value={input}
                  onChangeText={(t) => setInput(t.toUpperCase())}
                  placeholder="XXXXXX"
                  placeholderTextColor={AuthUI.placeholder}
                  maxLength={8}
                  autoCapitalize="characters"
                  autoFocus
                  style={styles.codeInput}
                />
                <Tap
                  onPress={() => setCodigo(input.trim())}
                  disabled={input.trim().length < 4}
                >
                  <View
                    style={[
                      styles.primaryBtn,
                      { opacity: input.trim().length < 4 ? 0.45 : 1 },
                    ]}
                  >
                    <Text style={styles.primaryLabel}>Continuar</Text>
                  </View>
                </Tap>
              </View>
            ) : data === undefined ? (
              <ActivityIndicator color={C.textSoft} style={{ marginTop: 40 }} />
            ) : (
              <ApoderadoSala
                data={data}
                codigo={codigo}
                onSalir={() => {
                  setCodigo(null);
                  setInput("");
                }}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </PastelShell>
  );
}

function ApoderadoSala({
  data,
  codigo,
  onSalir,
}: {
  data: {
    apoderadoNombre: string;
    asamblea: {
      _id: Id<"asambleas">;
      titulo: string;
      estado: string;
      fecha: string;
      hora: string;
    };
    validado: boolean;
    unidades: { unidadNumero: string; coeficiente: number | null; validado: boolean }[];
    votaciones: {
      _id: Id<"votaciones">;
      pregunta: string;
      estado: "abierta" | "cerrada";
      opciones: { texto: string; votos: number }[];
      miVoto: number | null;
    }[];
  };
  codigo: string;
  onSalir: () => void;
}) {
  const activa = data.asamblea.estado === "programada" || data.asamblea.estado === "en_curso";
  const abiertas = data.votaciones.filter((v) => v.estado === "abierta");

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.smallLabel}>Apoderado</Text>
            <Text style={styles.name}>{data.apoderadoNombre}</Text>
          </View>
          <Tap onPress={onSalir}>
            <Text style={{ color: C.textMuted, fontSize: 13 }}>Salir</Text>
          </Tap>
        </View>
        <View style={styles.asambleaBox}>
          <Text style={{ color: AuthUI.text, fontFamily: AuthUI.font.semibold }}>
            {data.asamblea.titulo}
          </Text>
          <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
            {data.asamblea.fecha} · {data.asamblea.hora}
            {data.asamblea.estado === "en_curso" ? " · En vivo" : ""}
          </Text>
        </View>
        <Text style={styles.smallLabel}>Unidades ({data.unidades.length})</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {data.unidades.map((u, i) => (
            <View key={i} style={styles.chip}>
              <Ionicons name="home-outline" size={12} color={ACCENT} />
              <Text style={{ color: ACCENT, fontSize: 12, fontFamily: AuthUI.font.semibold }}>
                {u.unidadNumero}
              </Text>
            </View>
          ))}
        </View>
        {!data.validado ? (
          <Text style={{ color: C.warning, fontSize: 12 }}>
            Algún poder está pendiente de validación.
          </Text>
        ) : null}
      </View>

      <Text style={{ color: AuthUI.text, fontSize: 15, fontFamily: AuthUI.font.semibold }}>
        Asamblea · votaciones
      </Text>
      {!activa ? (
        <View style={styles.card}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            La asamblea aún no ha iniciado.
          </Text>
        </View>
      ) : abiertas.length === 0 ? (
        <View style={styles.card}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            No hay votación activa.
          </Text>
        </View>
      ) : (
        abiertas.map((vt) => (
          <VotacionApoderado
            key={vt._id}
            codigo={codigo}
            vt={vt}
            habilitado={data.validado}
          />
        ))
      )}
    </View>
  );
}

function VotacionApoderado({
  codigo,
  vt,
  habilitado,
}: {
  codigo: string;
  vt: {
    _id: Id<"votaciones">;
    pregunta: string;
    estado: "abierta" | "cerrada";
    opciones: { texto: string; votos: number }[];
    miVoto: number | null;
  };
  habilitado: boolean;
}) {
  const votar = useMutation(api.asambleas.votarConCodigo);
  const [busy, setBusy] = useState(false);

  async function emitir(i: number) {
    if (!habilitado || busy) return;
    setBusy(true);
    try {
      await votar({ codigo, votacionId: vt._id, opcionIndex: i });
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { gap: 10 }]}>
      <Text style={{ color: AuthUI.text, fontFamily: AuthUI.font.semibold }}>{vt.pregunta}</Text>
      {vt.opciones.map((op, i) => {
        const esMio = vt.miVoto === i;
        return (
          <Tap key={i} onPress={() => emitir(i)} disabled={!habilitado || busy}>
            <View
              style={{
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: esMio ? ACCENT : AuthUI.border,
                backgroundColor: esMio ? ACCENT : AuthUI.white,
                opacity: !habilitado ? 0.55 : 1,
              }}
            >
              <Text
                style={{
                  textAlign: "center",
                  fontFamily: AuthUI.font.semibold,
                  fontSize: 14,
                  color: esMio ? "#fff" : AuthUI.text,
                }}
              >
                {op.texto}
              </Text>
            </View>
          </Tap>
        );
      })}
      {vt.miVoto != null ? (
        <Text style={{ color: C.success, fontSize: 12, textAlign: "center" }}>
          Voto registrado. Puedes cambiarlo mientras la pregunta esté abierta.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: AuthUI.padH,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AuthUI.white,
    borderWidth: 1,
    borderColor: AuthUI.border,
  },
  headerTitle: {
    fontFamily: AuthUI.font.semibold,
    fontSize: 17,
    color: AuthUI.text,
  },
  scroll: {
    paddingHorizontal: AuthUI.padH,
    paddingBottom: 32,
    gap: 14,
  },
  subtitle: {
    fontFamily: AuthUI.font.regular,
    fontSize: 14,
    color: AuthUI.textMuted,
    lineHeight: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: AuthUI.white,
    padding: 18,
    gap: 12,
  },
  label: {
    fontFamily: AuthUI.font.semibold,
    fontSize: 13,
    color: AuthUI.textMuted,
  },
  smallLabel: {
    fontFamily: AuthUI.font.medium,
    fontSize: 11,
    color: AuthUI.textMuted,
    textTransform: "uppercase",
  },
  name: {
    fontFamily: AuthUI.font.bold,
    fontSize: 17,
    color: AuthUI.text,
  },
  codeInput: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: AuthUI.white,
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 6,
    fontFamily: AuthUI.font.bold,
    color: ACCENT,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 11,
    backgroundColor: AuthUI.text,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: {
    color: "#fff",
    fontFamily: AuthUI.font.semibold,
    fontSize: 16,
  },
  errorBox: {
    color: C.danger,
    fontSize: 13,
    backgroundColor: C.dangerSoft,
    padding: 10,
    borderRadius: 10,
  },
  asambleaBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(124, 58, 237, 0.08)",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(124, 58, 237, 0.08)",
  },
});
