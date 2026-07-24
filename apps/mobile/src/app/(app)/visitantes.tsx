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
  StyleSheet,
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
  GlassBadge,
  GlassSection,
  GlassButton,
} from "@/components/ui/glass";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI, softShadow } from "@/lib/soft-ui";

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

const ESTADO_ICON: Record<
  string,
  { name: React.ComponentProps<typeof Ionicons>["name"]; bg: string; fg: string }
> = {
  pendiente: { name: "qr-code-outline", bg: SoftUI.warningSoft, fg: "#B8860B" },
  esperando_aprobacion: {
    name: "call-outline",
    bg: SoftUI.infoSoft,
    fg: SoftUI.blue,
  },
  activo: {
    name: "checkmark-circle-outline",
    bg: SoftUI.successSoft,
    fg: SoftUI.success,
  },
  finalizado: {
    name: "person-outline",
    bg: SoftUI.bgSecondary,
    fg: SoftUI.textSecondary,
  },
  rechazado: {
    name: "close-circle-outline",
    bg: SoftUI.dangerSoft,
    fg: SoftUI.danger,
  },
};

function qrUrl(id: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(id)}`;
}

export default function VisitantesScreen() {
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
  const me = useQuery(api.users.me);
  const { condominioId, condominioName } = useCondominio();
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

  const hora = new Date().getHours();
  const saludo =
    hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";

  return (
    <View style={{ flex: 1 }}>
      <SoftHomeHeader
        saludo={saludo}
        displayName={me?.name ?? "Residente"}
        avatarUrl={me?.image}
        badgeLabel={condominioName ?? "Visitantes"}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {condominioId ? (
          <View style={styles.actionRow}>
            <Tap style={styles.autorizarBtn} onPress={() => setShowForm(true)}>
              <Ionicons name="add" size={18} color={SoftUI.white} />
              <Text style={styles.autorizarBtnText}>Autorizar</Text>
            </Tap>
          </View>
        ) : null}

        <GlassSection
          title={
            data === undefined
              ? "Visitantes"
              : `${data.length} autorización${data.length === 1 ? "" : "es"}`
          }
        >
          {data === undefined ? (
            <ActivityIndicator color={SoftUI.blue} style={{ marginTop: SoftUI.space.xl }} />
          ) : data.length === 0 ? (
            <GlassCard style={styles.emptyCard}>
              <Ionicons name="person-add-outline" size={32} color={SoftUI.textSecondary} />
              <Text style={styles.emptyText}>Sin visitantes autorizados</Text>
              {condominioId ? (
                <Tap style={styles.emptyCta} onPress={() => setShowForm(true)}>
                  <Text style={styles.emptyCtaText}>Autorizar visitante</Text>
                </Tap>
              ) : null}
            </GlassCard>
          ) : (
            <View style={{ gap: SoftUI.space.md }}>
              {data.map((v) => {
                const esWalkIn = v.estado === "esperando_aprobacion";
                const iconMeta = ESTADO_ICON[v.estado] ?? ESTADO_ICON.finalizado;
                return (
                  <GlassCard key={v._id} style={styles.visitorCard}>
                    <View style={styles.visitorRow}>
                      <View style={[styles.visitorIcon, { backgroundColor: iconMeta.bg }]}>
                        <Ionicons name={iconMeta.name} size={22} color={iconMeta.fg} />
                      </View>
                      <View style={styles.visitorBody}>
                        <View style={styles.visitorTitleRow}>
                          <Text style={styles.visitorName} numberOfLines={1}>
                            {v.nombre}
                          </Text>
                          <GlassBadge
                            label={ESTADO_LABEL[v.estado] ?? v.estado}
                            tone={ESTADO_TONE[v.estado] ?? "neutral"}
                          />
                        </View>
                        <Text style={styles.visitorMeta}>
                          {v.tipoDocumento} {v.documento}
                          {v.placa ? ` · ${v.placa}` : ""}
                        </Text>
                        <Text style={styles.visitorHint}>
                          {esWalkIn
                            ? "Portería pide que lo dejes entrar"
                            : `${v.unidadNumero ? `Unidad ${v.unidadNumero} · ` : ""}Válido solo el día de la visita`}
                        </Text>
                      </View>
                    </View>
                    {esWalkIn ? (
                      <WalkInButtons id={v._id} />
                    ) : v.estado === "pendiente" ? (
                      <View style={styles.actionsRow}>
                        <Tap style={styles.secondaryBtn} onPress={() => setQrId(v._id)}>
                          <Ionicons name="qr-code-outline" size={16} color={SoftUI.blue} />
                          <Text style={styles.secondaryBtnText}>Ver QR</Text>
                        </Tap>
                      </View>
                    ) : null}
                  </GlassCard>
                );
              })}
            </View>
          )}
        </GlassSection>
      </ScrollView>

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
          <View style={styles.qrSheet}>
            <Text style={styles.sheetTitle}>Código QR</Text>
            <Text style={styles.qrHint}>
              Válido solo el día de la visita. Muéstralo en portería.
            </Text>
            <Image
              source={{ uri: qrUrl(qrId) }}
              style={styles.qrImage}
            />
            <GlassButton label="Cerrar" onPress={() => setQrId(null)} />
          </View>
        ) : null}
      </BottomSheet>
    </View>
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
    <View style={styles.actionsRow}>
      <Tap
        style={[styles.secondaryBtn, { flex: 1 }]}
        onPress={() => go(false)}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color={SoftUI.textSecondary} />
        ) : (
          <>
            <Ionicons name="close" size={16} color={SoftUI.danger} />
            <Text style={[styles.secondaryBtnText, { color: SoftUI.danger }]}>
              Rechazar
            </Text>
          </>
        )}
      </Tap>
      <Tap
        style={[styles.primaryBtnSm, { flex: 1 }]}
        onPress={() => go(true)}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color={SoftUI.white} />
        ) : (
          <Text style={styles.primaryBtnSmText}>Aceptar</Text>
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
        contentContainerStyle={styles.sheetScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sheetTitle}>Autorizar visitante</Text>
        <Text style={styles.sheetSubtitle}>
          El QR solo sirve el día de hoy. Si no llega, se elimina automáticamente.
        </Text>

        {unidades.length > 1 ? (
          <>
            <Text style={styles.label}>Unidad</Text>
            <View style={styles.chipRow}>
              {unidades.map((u) => {
                const active = u._id === unidadId;
                const label = u.torre ? `${u.numero} ${u.torre}` : u.numero;
                return (
                  <Pressable
                    key={u._id}
                    onPress={() => setUnidadId(u._id)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
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
          placeholderTextColor={SoftUI.textDisabled}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: SoftUI.space.base }]}>Documento *</Text>
        <View style={styles.chipRow}>
          {TIPO_DOC.map((t) => {
            const active = tipoDocumento === t.value;
            return (
              <Pressable
                key={t.value}
                onPress={() => setTipoDocumento(t.value)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
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
          placeholderTextColor={SoftUI.textDisabled}
          keyboardType="default"
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: SoftUI.space.base }]}>Tipo de visita</Text>
        <View style={[styles.chipRow, { marginBottom: SoftUI.space.base }]}>
          {TIPO_VIS.map((t) => {
            const active = tipo === t.value;
            return (
              <Pressable
                key={t.value}
                onPress={() => setTipo(t.value)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
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
          placeholderTextColor={SoftUI.textDisabled}
          autoCapitalize="characters"
          style={styles.input}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.footerRow}>
          <Tap
            style={[styles.footerBtn, styles.footerCancel]}
            onPress={() => {
              reset();
              onClose();
            }}
            disabled={saving}
          >
            <Text style={styles.footerCancelText}>Cancelar</Text>
          </Tap>
          <Tap
            style={[styles.footerBtn, styles.footerPrimary]}
            onPress={submit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={SoftUI.white} />
            ) : (
              <Text style={styles.footerPrimaryText}>Autorizar</Text>
            )}
          </Tap>
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
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: SoftUI.space.base,
  },
  autorizarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.xs,
    backgroundColor: SoftUI.blue,
    paddingHorizontal: SoftUI.space.base,
    paddingVertical: SoftUI.space.sm + 2,
    borderRadius: SoftUI.radius.chip,
    minHeight: SoftUI.touch,
  },
  autorizarBtnText: {
    color: SoftUI.white,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.semibold,
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
  emptyCta: {
    marginTop: SoftUI.space.xs,
    backgroundColor: SoftUI.blue,
    paddingHorizontal: SoftUI.space.base,
    paddingVertical: SoftUI.space.md,
    borderRadius: SoftUI.radius.chip,
  },
  emptyCtaText: {
    color: SoftUI.white,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.semibold,
  },
  visitorCard: {
    padding: SoftUI.space.base,
  },
  visitorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.md,
  },
  visitorIcon: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  visitorBody: {
    flex: 1,
    minWidth: 0,
    gap: SoftUI.space.xs,
  },
  visitorTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.sm,
  },
  visitorName: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.semibold,
    flex: 1,
  },
  visitorMeta: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
  },
  visitorHint: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size - 1,
    fontFamily: AuthUI.font.regular,
  },
  actionsRow: {
    flexDirection: "row",
    gap: SoftUI.space.sm,
    marginTop: SoftUI.space.md,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.xs,
    paddingHorizontal: SoftUI.space.md,
    paddingVertical: SoftUI.space.sm + 1,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SoftUI.divider,
    minHeight: SoftUI.touch - 4,
  },
  secondaryBtnText: {
    color: SoftUI.blue,
    fontSize: SoftUI.type.chip.size + 1,
    fontFamily: AuthUI.font.semibold,
  },
  primaryBtnSm: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SoftUI.space.md,
    paddingVertical: SoftUI.space.sm + 1,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.blue,
    minHeight: SoftUI.touch - 4,
  },
  primaryBtnSmText: {
    color: SoftUI.white,
    fontSize: SoftUI.type.chip.size + 1,
    fontFamily: AuthUI.font.bold,
  },
  qrSheet: {
    padding: SoftUI.padH,
    paddingBottom: SoftUI.space.section,
    alignItems: "center",
    gap: SoftUI.space.md,
  },
  qrHint: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.regular,
    textAlign: "center",
  },
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: SoftUI.radius.cardSm,
    backgroundColor: SoftUI.white,
  },
  sheetScroll: {
    padding: SoftUI.padH,
    paddingBottom: SoftUI.space.xxl,
  },
  sheetTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.section.size,
    fontFamily: AuthUI.font.bold,
    marginBottom: SoftUI.space.sm,
  },
  sheetSubtitle: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.regular,
    marginBottom: SoftUI.space.lg,
  },
  label: {
    color: SoftUI.text,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.semibold,
    marginBottom: SoftUI.space.sm,
  },
  input: {
    backgroundColor: SoftUI.field,
    borderRadius: SoftUI.radius.field,
    paddingHorizontal: SoftUI.space.base,
    paddingVertical: SoftUI.space.md,
    fontSize: SoftUI.type.body.size,
    color: SoftUI.text,
    fontFamily: AuthUI.font.regular,
    minHeight: SoftUI.fieldH,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SoftUI.space.sm,
    marginBottom: SoftUI.space.md,
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
  errorText: {
    color: SoftUI.danger,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.medium,
    marginTop: SoftUI.space.sm,
  },
  footerRow: {
    flexDirection: "row",
    gap: SoftUI.space.sm,
    marginTop: SoftUI.space.xl,
  },
  footerBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SoftUI.space.base,
    borderRadius: SoftUI.radius.button,
    minHeight: SoftUI.buttonH - 4,
  },
  footerCancel: {
    backgroundColor: SoftUI.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SoftUI.divider,
  },
  footerCancelText: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.semibold,
  },
  footerPrimary: {
    backgroundColor: SoftUI.blue,
  },
  footerPrimaryText: {
    color: SoftUI.white,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.bold,
  },
});
