import { useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard, GlassBadge } from "@/components/ui/glass";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Tap } from "@/components/ui/tap";
import { fmtFechaCorta } from "@/lib/utils";
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";

type Tipo = "peticion" | "queja" | "reclamo" | "sugerencia" | "felicitacion";

const TIPO_LABEL: Record<Tipo, string> = {
  peticion: "Petición",
  queja: "Queja",
  reclamo: "Reclamo",
  sugerencia: "Sugerencia",
  felicitacion: "Felicitación",
};

const ESTADO_TONE: Record<string, "yellow" | "blue" | "green" | "neutral"> = {
  abierto: "yellow",
  en_gestion: "blue",
  resuelto: "green",
  cerrado: "neutral",
};
const ESTADO_LABEL: Record<string, string> = {
  abierto: "Abierto",
  en_gestion: "En gestión",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
};
const PRIORIDAD_TONE: Record<string, "red" | "yellow" | "neutral"> = {
  alta: "red",
  media: "yellow",
  baja: "neutral",
};

export default function PqrsScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const { condominioId, canManage } = useCondominio();
  const me = useQuery(api.users.me);
  const home = useQuery(
    api.portal.home,
    condominioId ? { condominioId } : "skip",
  );
  const todas = useQuery(
    api.pqrs.listByCondominio,
    condominioId ? { condominioId } : "skip",
  );
  const [showForm, setShowForm] = useState(false);

  const data =
    todas === undefined
      ? undefined
      : canManage
        ? todas
        : todas.filter((p) => p.solicitanteUserId === me?.id);

  const unidadNumero =
    home && home.allowed ? home.unidades[0]?.numero : undefined;

  return (
    <>
      <Section
        title="PQRS"
        right={
          condominioId ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#0E0E0F",
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 12,
              }}
              onTouchEnd={() => setShowForm(true)}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                Nueva
              </Text>
            </View>
          ) : undefined
        }
      >
        {data === undefined || me === undefined ? (
          <ActivityIndicator color={C.textSoft} style={{ marginTop: 30 }} />
        ) : data.length === 0 ? (
          <GlassCard style={{ padding: 40, alignItems: "center", gap: 12 }}>
            <Ionicons name="chatbox-ellipses-outline" size={32} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 14, textAlign: "center" }}>
              {canManage
                ? "Sin PQRS registrados"
                : "No has enviado solicitudes todavía"}
            </Text>
            <Tap
              style={styles.emptyCta}
              onPress={() => setShowForm(true)}
            >
              <Text style={styles.emptyCtaText}>Crear solicitud</Text>
            </Tap>
          </GlassCard>
        ) : (
          <View style={{ gap: 10 }}>
            {!canManage ? (
              <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 2 }}>
                Tus solicitudes
              </Text>
            ) : null}
            {data.map((p) => (
              <GlassCard key={p._id} style={{ padding: 16 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <Text
                    style={{
                      color: C.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      letterSpacing: 0.5,
                    }}
                  >
                    {p.radicado}
                  </Text>
                  <GlassBadge
                    label={ESTADO_LABEL[p.estado] ?? p.estado}
                    tone={ESTADO_TONE[p.estado] ?? "neutral"}
                  />
                </View>
                <Text
                  style={{ color: C.text, fontSize: 15, fontWeight: "700", marginBottom: 4 }}
                  numberOfLines={1}
                >
                  {p.asunto}
                </Text>
                <Text
                  style={{ color: C.textSoft, fontSize: 13, lineHeight: 18 }}
                  numberOfLines={2}
                >
                  {p.descripcion}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 10,
                    alignItems: "center",
                  }}
                >
                  <GlassBadge
                    label={TIPO_LABEL[p.tipo as Tipo] ?? p.tipo}
                    tone="neutral"
                  />
                  <GlassBadge
                    label={`Prioridad ${p.prioridad}`}
                    tone={PRIORIDAD_TONE[p.prioridad] ?? "neutral"}
                  />
                  <Text style={{ color: C.textMuted, fontSize: 11, marginLeft: "auto" }}>
                    {canManage
                      ? `${p.solicitanteNombre}${p.unidadNumero ? ` · ${p.unidadNumero}` : ""} · `
                      : ""}
                    {fmtFechaCorta(p.createdAt)}
                  </Text>
                </View>
                {p.respuesta ? (
                  <View
                    style={{
                      marginTop: 10,
                      backgroundColor: C.bgSubtle,
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: C.textSoft,
                        fontSize: 12,
                        fontWeight: "700",
                        marginBottom: 3,
                      }}
                    >
                      Respuesta
                    </Text>
                    <Text style={{ color: C.textSoft, fontSize: 13 }}>{p.respuesta}</Text>
                  </View>
                ) : null}
              </GlassCard>
            ))}
          </View>
        )}
      </Section>

      {condominioId ? (
        <CrearPqrsSheet
          visible={showForm}
          onClose={() => setShowForm(false)}
          condominioId={condominioId}
          unidadNumero={unidadNumero}
        />
      ) : null}
    </>
  );
}

function CrearPqrsSheet({
  visible,
  onClose,
  condominioId,
  unidadNumero,
}: {
  visible: boolean;
  onClose: () => void;
  condominioId: Id<"condominios">;
  unidadNumero?: string;
}) {
  const create = useMutation(api.pqrs.create);
  const [tipo, setTipo] = useState<Tipo>("peticion");
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTipo("peticion");
    setAsunto("");
    setDescripcion("");
    setError(null);
  }

  async function submit() {
    if (!asunto.trim() || !descripcion.trim()) {
      setError("Escribe un asunto y una descripción.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await create({
        condominioId,
        tipo,
        asunto: asunto.trim(),
        descripcion: descripcion.trim(),
        unidadNumero,
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="90%">
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            color: C.text,
            fontSize: 20,
            fontWeight: "700",
            marginBottom: 8,
            letterSpacing: -0.4,
          }}
        >
          Nueva solicitud
        </Text>
        <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 20 }}>
          Petición, queja, reclamo o sugerencia para la administración.
        </Text>

        <Text style={styles.label}>Tipo</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => {
            const active = tipo === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTipo(t)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: active ? C.text : C.border,
                  backgroundColor: active ? C.text : C.card,
                }}
              >
                <Text
                  style={{
                    color: active ? "#fff" : C.textSoft,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {TIPO_LABEL[t]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Asunto</Text>
        <TextInput
          value={asunto}
          onChangeText={setAsunto}
          placeholder="Ej: Daño en la luz del parqueadero"
          placeholderTextColor={C.textMuted}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 14 }]}>Descripción</Text>
        <TextInput
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Describe con detalle tu solicitud…"
          placeholderTextColor={C.textMuted}
          multiline
          style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
        />

        {unidadNumero ? (
          <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 10 }}>
            Se enviará asociada a la unidad {unidadNumero}
          </Text>
        ) : null}

        {error ? (
          <Text style={{ color: C.danger, fontSize: 13, marginTop: 10 }}>{error}</Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
          <Tap
            style={[styles.footerBtn, styles.footerCancel]}
            onPress={() => {
              reset();
              onClose();
            }}
            disabled={saving}
          >
            <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>Cancelar</Text>
          </Tap>
          <Tap
            style={[styles.footerBtn, styles.footerPrimary]}
            onPress={submit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Enviar</Text>
            )}
          </Tap>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = {
  label: {
    color: C.text,
    fontSize: 13,
    fontWeight: "500" as const,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: C.text,
  },
  emptyCta: {
    marginTop: 4,
    backgroundColor: "#0E0E0F",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  emptyCtaText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: AuthUI.font.semibold,
  },
  footerBtn: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 14,
    borderRadius: 14,
  },
  footerCancel: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#FFFFFF",
  },
  footerPrimary: {
    backgroundColor: "#0E0E0F",
  },
};
