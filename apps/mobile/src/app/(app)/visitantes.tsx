import { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Pressable,
  Image,
  Alert,
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
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";

type TipoDoc = "CC" | "CE" | "NIT" | "PASAPORTE" | "OTRO";
type TipoVis = "visitante" | "empresa" | "domicilio";

const TIPO_DOC: { value: TipoDoc; label: string }[] = [
  { value: "CC", label: "Cédula" },
  { value: "CE", label: "Cédula ext." },
  { value: "NIT", label: "NIT" },
  { value: "PASAPORTE", label: "Pasaporte" },
  { value: "OTRO", label: "Otro" },
];

const TIPO_VIS: { value: TipoVis; label: string }[] = [
  { value: "visitante", label: "Visitante" },
  { value: "empresa", label: "Empresa" },
  { value: "domicilio", label: "Domicilio" },
];

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "QR listo",
  esperando_aprobacion: "Portería pide acceso",
  activo: "Adentro",
  finalizado: "Finalizado",
  rechazado: "Rechazado",
};
const ESTADO_TONE: Record<string, "yellow" | "green" | "neutral" | "blue" | "red"> = {
  pendiente: "yellow",
  esperando_aprobacion: "blue",
  activo: "green",
  finalizado: "neutral",
  rechazado: "red",
};

function qrUrl(id: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(id)}`;
}

export default function VisitantesScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const { condominioId } = useCondominio();
  const home = useQuery(
    api.portal.home,
    condominioId ? { condominioId } : "skip",
  );
  const data = useQuery(
    api.visitantes.listMios,
    condominioId ? { condominioId } : "skip",
  );
  const [showForm, setShowForm] = useState(false);
  const [qrId, setQrId] = useState<Id<"visitantes"> | null>(null);

  const unidades = home && home.allowed ? home.unidades : [];

  return (
    <>
      <Section
        title="Visitantes"
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
                Autorizar
              </Text>
            </View>
          ) : undefined
        }
      >
        {data === undefined ? (
          <ActivityIndicator color={C.textSoft} style={{ marginTop: 30 }} />
        ) : data.length === 0 ? (
          <GlassCard style={{ padding: 40, alignItems: "center", gap: 12 }}>
            <Ionicons name="person-add-outline" size={32} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 14, textAlign: "center" }}>
              Sin visitantes autorizados
            </Text>
            <Tap style={styles.emptyCta} onPress={() => setShowForm(true)}>
              <Text style={styles.emptyCtaText}>Autorizar visitante</Text>
            </Tap>
          </GlassCard>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 2 }}>
              {data.length} autorización{data.length === 1 ? "" : "es"}
            </Text>
            {data.map((v) => {
              const esWalkIn = v.estado === "esperando_aprobacion";
              return (
              <GlassCard key={v._id} style={{ padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      backgroundColor: C.bgSubtle,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={esWalkIn ? "call-outline" : "person-outline"}
                      size={20}
                      color={C.textSoft}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text
                        style={{ color: C.text, fontSize: 15, fontWeight: "700", flex: 1 }}
                        numberOfLines={1}
                      >
                        {v.nombre}
                      </Text>
                      <GlassBadge
                        label={ESTADO_LABEL[v.estado] ?? v.estado}
                        tone={ESTADO_TONE[v.estado] ?? "neutral"}
                      />
                    </View>
                    <Text style={{ color: C.textMuted, fontSize: 12 }}>
                      {v.tipoDocumento} {v.documento}
                      {v.placa ? ` · ${v.placa}` : ""}
                    </Text>
                    <Text style={{ color: C.textMuted, fontSize: 11 }}>
                      {esWalkIn
                        ? "Portería pide que lo dejes entrar"
                        : `${v.unidadNumero ? `Unidad ${v.unidadNumero} · ` : ""}Válido solo el día de la visita`}
                    </Text>
                  </View>
                </View>
                {esWalkIn ? (
                  <WalkInButtons id={v._id} />
                ) : v.estado === "pendiente" ? (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <Tap style={styles.secondaryBtn} onPress={() => setQrId(v._id)}>
                      <Ionicons name="qr-code-outline" size={16} color={C.text} />
                      <Text style={styles.secondaryBtnText}>Ver QR</Text>
                    </Tap>
                  </View>
                ) : null}
              </GlassCard>
              );
            })}
          </View>
        )}
      </Section>

      {condominioId ? (
        <CrearVisitanteSheet
          visible={showForm}
          onClose={() => setShowForm(false)}
          condominioId={condominioId}
          unidades={unidades.map((u) => ({
            _id: u._id as Id<"unidades">,
            numero: u.numero,
            torre: u.torre,
          }))}
          onCreated={(id) => {
            setShowForm(false);
            setQrId(id);
          }}
        />
      ) : null}

      <BottomSheet visible={qrId !== null} onClose={() => setQrId(null)} maxHeight="70%">
        {qrId ? (
          <View style={{ padding: 24, paddingBottom: 40, alignItems: "center", gap: 14 }}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: "700" }}>
              Código QR
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
              Válido solo el día de la visita. Muéstralo en portería.
            </Text>
            <Image
              source={{ uri: qrUrl(qrId) }}
              style={{ width: 220, height: 220, borderRadius: 12, backgroundColor: "#fff" }}
            />
            <Tap style={styles.footerPrimaryFull} onPress={() => setQrId(null)}>
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Cerrar</Text>
            </Tap>
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

function WalkInButtons({ id }: { id: Id<"visitantes"> }) {
  const responder = useMutation(api.visitantes.responderWalkIn);
  const [busy, setBusy] = useState(false);

  async function go(aceptar: boolean) {
    setBusy(true);
    try {
      await responder({ id, aceptar });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo responder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
      <Tap
        style={[styles.secondaryBtn, { flex: 1 }]}
        onPress={() => go(false)}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color={C.textMuted} />
        ) : (
          <>
            <Ionicons name="close" size={16} color={C.danger} />
            <Text style={[styles.secondaryBtnText, { color: C.danger }]}>Rechazar</Text>
          </>
        )}
      </Tap>
      <Tap
        style={[styles.footerPrimaryFull, { flex: 1, marginTop: 0, height: 40 }]}
        onPress={() => go(true)}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Aceptar</Text>
        )}
      </Tap>
    </View>
  );
}

function CrearVisitanteSheet({
  visible,
  onClose,
  condominioId,
  unidades,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  condominioId: Id<"condominios">;
  unidades: { _id: Id<"unidades">; numero: string; torre: string | null }[];
  onCreated: (id: Id<"visitantes">) => void;
}) {
  const create = useMutation(api.visitantes.crearMio);
  const [unidadId, setUnidadId] = useState<Id<"unidades"> | null>(null);
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState<TipoDoc>("CC");
  const [tipo, setTipo] = useState<TipoVis>("visitante");
  const [placa, setPlaca] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (!unidadId && unidades[0]?._id) setUnidadId(unidades[0]._id);
  }, [visible, unidades, unidadId]);

  function reset() {
    setNombre("");
    setDocumento("");
    setTipoDocumento("CC");
    setTipo("visitante");
    setPlaca("");
    setError(null);
    setUnidadId(unidades[0]?._id ?? null);
  }

  async function submit() {
    if (!unidadId) {
      setError("No tienes una unidad vinculada.");
      return;
    }
    if (!nombre.trim() || !documento.trim()) {
      setError("Nombre y documento son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await create({
        condominioId,
        unidadId,
        nombre: nombre.trim(),
        documento: documento.trim(),
        tipoDocumento,
        tipo,
        placa: placa.trim() || undefined,
        // Hoy (Bogota) por defecto en el backend si no se envía fecha.
      });
      reset();
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="92%">
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
          Autorizar visitante
        </Text>
        <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 20 }}>
          El QR solo sirve el día de hoy. Si no llega, se elimina automáticamente.
        </Text>

        {unidades.length > 1 ? (
          <>
            <Text style={styles.label}>Unidad</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {unidades.map((u) => {
                const active = u._id === unidadId;
                const label = u.torre ? `${u.numero} ${u.torre}` : u.numero;
                return (
                  <Pressable
                    key={u._id}
                    onPress={() => setUnidadId(u._id)}
                    style={chip(active)}
                  >
                    <Text style={{ color: active ? "#fff" : C.textSoft, fontSize: 13, fontWeight: "600" }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>Nombre *</Text>
        <TextInput
          value={nombre}
          onChangeText={setNombre}
          placeholder="Nombre completo"
          placeholderTextColor={C.textMuted}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 14 }]}>Documento *</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {TIPO_DOC.map((t) => {
            const active = tipoDocumento === t.value;
            return (
              <Pressable key={t.value} onPress={() => setTipoDocumento(t.value)} style={chip(active)}>
                <Text style={{ color: active ? "#fff" : C.textSoft, fontSize: 12, fontWeight: "600" }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={documento}
          onChangeText={setDocumento}
          placeholder="Número de documento"
          placeholderTextColor={C.textMuted}
          keyboardType="default"
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 14 }]}>Tipo de visita</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {TIPO_VIS.map((t) => {
            const active = tipo === t.value;
            return (
              <Pressable key={t.value} onPress={() => setTipo(t.value)} style={chip(active)}>
                <Text style={{ color: active ? "#fff" : C.textSoft, fontSize: 13, fontWeight: "600" }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Placa (opcional)</Text>
        <TextInput
          value={placa}
          onChangeText={setPlaca}
          placeholder="ABC123"
          placeholderTextColor={C.textMuted}
          autoCapitalize="characters"
          style={styles.input}
        />

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
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Autorizar</Text>
            )}
          </Tap>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function chip(active: boolean) {
  return {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: active ? C.text : C.border,
    backgroundColor: active ? C.text : C.card,
  };
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
  secondaryBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "#fff",
  },
  secondaryBtnText: {
    color: C.text,
    fontSize: 13,
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
  footerPrimaryFull: {
    marginTop: 8,
    alignSelf: "stretch" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#0E0E0F",
  },
};
