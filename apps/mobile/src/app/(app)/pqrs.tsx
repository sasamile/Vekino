import { useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Pressable,
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
} from "@/components/ui/glass";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Tap } from "@/components/ui/tap";
import { fmtFechaCorta } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI, softShadow } from "@/lib/soft-ui";

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
  const { condominioId, condominioName, canManage } = useCondominio();
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

  const hora = new Date().getHours();
  const saludo =
    hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";

  return (
    <View style={{ flex: 1 }}>
      <SoftHomeHeader
        saludo={saludo}
        displayName={me?.name ?? (canManage ? "Admin" : "Residente")}
        avatarUrl={me?.image}
        badgeLabel={condominioName ?? "PQRS"}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {condominioId ? (
          <View style={styles.toolbar}>
            <View style={{ flex: 1 }} />
            <Tap style={styles.nuevaBtn} onPress={() => setShowForm(true)}>
              <Ionicons name="add" size={18} color={SoftUI.white} />
              <Text style={styles.nuevaBtnText}>Nueva</Text>
            </Tap>
          </View>
        ) : null}

        {data === undefined || me === undefined ? (
          <ActivityIndicator color={SoftUI.blue} style={{ marginTop: 30 }} />
        ) : data.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Ionicons
              name="chatbox-ellipses-outline"
              size={32}
              color={SoftUI.textSecondary}
            />
            <Text style={styles.emptyText}>
              {canManage
                ? "Sin PQRS registrados"
                : "No has enviado solicitudes todavía"}
            </Text>
            <Tap style={styles.emptyCta} onPress={() => setShowForm(true)}>
              <Text style={styles.emptyCtaText}>Crear solicitud</Text>
            </Tap>
          </GlassCard>
        ) : (
          <GlassSection
            title={
              canManage
                ? `${data.length} solicitud${data.length === 1 ? "" : "es"}`
                : "Tus solicitudes"
            }
          >
            <View style={{ gap: SoftUI.space.md }}>
              {data.map((p) => (
                <GlassCard key={p._id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.radicado}>{p.radicado}</Text>
                    <GlassBadge
                      label={ESTADO_LABEL[p.estado] ?? p.estado}
                      tone={ESTADO_TONE[p.estado] ?? "neutral"}
                    />
                  </View>
                  <Text style={styles.asunto} numberOfLines={1}>
                    {p.asunto}
                  </Text>
                  <Text style={styles.desc} numberOfLines={2}>
                    {p.descripcion}
                  </Text>
                  <View style={styles.metaRow}>
                    <GlassBadge
                      label={TIPO_LABEL[p.tipo as Tipo] ?? p.tipo}
                      tone="neutral"
                    />
                    <GlassBadge
                      label={`Prioridad ${p.prioridad}`}
                      tone={PRIORIDAD_TONE[p.prioridad] ?? "neutral"}
                    />
                    <Text style={styles.metaDate}>
                      {canManage
                        ? `${p.solicitanteNombre}${p.unidadNumero ? ` · ${p.unidadNumero}` : ""} · `
                        : ""}
                      {fmtFechaCorta(p.createdAt)}
                    </Text>
                  </View>
                  {p.respuesta ? (
                    <View style={styles.respuestaBox}>
                      <Text style={styles.respuestaLabel}>Respuesta</Text>
                      <Text style={styles.respuestaText}>{p.respuesta}</Text>
                    </View>
                  ) : null}
                </GlassCard>
              ))}
            </View>
          </GlassSection>
        )}
      </ScrollView>

      {condominioId ? (
        <CrearPqrsSheet
          visible={showForm}
          onClose={() => setShowForm(false)}
          condominioId={condominioId}
          unidadNumero={unidadNumero}
        />
      ) : null}
    </View>
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
        contentContainerStyle={{
          padding: SoftUI.padH,
          paddingBottom: SoftUI.space.xxl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sheetTitle}>Nueva solicitud</Text>
        <Text style={styles.sheetSub}>
          Petición, queja, reclamo o sugerencia para la administración.
        </Text>

        <Text style={styles.label}>Tipo</Text>
        <View style={styles.chipWrap}>
          {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => {
            const active = tipo === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTipo(t)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
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
          placeholderTextColor={SoftUI.textDisabled}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: SoftUI.space.base }]}>
          Descripción
        </Text>
        <TextInput
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Describe con detalle tu solicitud…"
          placeholderTextColor={SoftUI.textDisabled}
          multiline
          style={[styles.input, styles.inputMulti]}
        />

        {unidadNumero ? (
          <Text style={styles.hint}>
            Se enviará asociada a la unidad {unidadNumero}
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
              <Text style={styles.footerPrimaryText}>Enviar</Text>
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
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SoftUI.space.base,
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
    borderRadius: SoftUI.radius.button,
  },
  emptyCtaText: {
    color: SoftUI.white,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.semibold,
  },
  card: {
    padding: SoftUI.space.base,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SoftUI.space.sm,
  },
  radicado: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size - 1,
    fontFamily: AuthUI.font.bold,
    letterSpacing: 0.5,
  },
  asunto: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.semibold,
    marginBottom: SoftUI.space.xs,
  },
  desc: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size,
    lineHeight: SoftUI.type.caption.line + 2,
    fontFamily: AuthUI.font.regular,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SoftUI.space.sm,
    marginTop: SoftUI.space.md,
    alignItems: "center",
  },
  metaDate: {
    color: SoftUI.textDisabled,
    fontSize: SoftUI.type.chip.size - 1,
    fontFamily: AuthUI.font.regular,
    marginLeft: "auto",
  },
  respuestaBox: {
    marginTop: SoftUI.space.md,
    backgroundColor: SoftUI.bgSecondary,
    borderRadius: SoftUI.radius.field,
    padding: SoftUI.space.md,
  },
  respuestaLabel: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.semibold,
    marginBottom: SoftUI.space.xs,
  },
  respuestaText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.regular,
  },
  sheetTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.section.size,
    fontFamily: AuthUI.font.bold,
    marginBottom: SoftUI.space.sm,
  },
  sheetSub: {
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
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SoftUI.space.sm,
    marginBottom: SoftUI.space.base,
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
  inputMulti: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  hint: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
    marginTop: SoftUI.space.md,
  },
  error: {
    color: SoftUI.danger,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.medium,
    marginTop: SoftUI.space.md,
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
