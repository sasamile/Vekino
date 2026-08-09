import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Image,
  TextInput,
  Alert,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useMutation, useAction, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { getDocumentPicker } from "@/lib/document-picker";
import { openDocument } from "@/lib/open-document";
import { useCondominio } from "@/context/condominio-context";
import { NoCondominioScreen } from "@/components/ui/no-condominio";
import { SoftHomeHeader } from "@/components/ui/soft-home-header";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  ScreenBackground,
  GlassCard,
  GlassBadge,
  GlassButton,
  GlassSection,
  GlassPressable,
} from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { fmtFechaCorta, initials } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI, softShadow } from "@/lib/soft-ui";

const PRIORIDAD_TONE: Record<string, "red" | "yellow" | "neutral"> = {
  urgente: "red",
  importante: "yellow",
  normal: "neutral",
};
const PRIORIDAD_LABEL: Record<string, string> = {
  urgente: "Urgente",
  importante: "Importante",
  normal: "Normal",
};
const AUDIENCIA_LABEL: Record<string, string> = {
  todos: "Todos",
  propietario: "Propietarios",
  arrendatario: "Arrendatarios",
  residente: "Residentes",
  junta_directiva: "Junta directiva",
};

type Audiencia =
  | "todos"
  | "propietario"
  | "arrendatario"
  | "residente"
  | "junta_directiva";
type Prioridad = "normal" | "importante" | "urgente";

type ComunicadoRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.comunicados.listByCondominio>>
>[number];

type PendingFile = {
  key: string;
  uri: string;
  mimeType: string;
  nombre: string;
};

const MAX_ARCHIVOS = 5;

export default function ComunicadosScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <Authenticated>
          <ComunicadosContent />
        </Authenticated>
      </ScreenBackground>
    </View>
  );
}

function ComunicadosContent() {
  const me = useQuery(api.users.me);
  const { condominioId, condominioName, isSuperadmin, canManage, theme } =
    useCondominio();
  const comunicados = useQuery(
    api.comunicados.listByCondominio,
    condominioId ? { condominioId } : "skip",
  );
  const [selected, setSelected] = useState<ComunicadoRow | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  if (isSuperadmin && !condominioId) return <NoCondominioScreen />;

  const fijados = (comunicados ?? []).filter((c) => c.fijado);
  const normales = (comunicados ?? []).filter((c) => !c.fijado);

  const hora = new Date().getHours();
  const saludo =
    hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";

  return (
    <View style={{ flex: 1 }}>
      <SoftHomeHeader
        saludo={saludo}
        displayName={me?.name ?? "Residente"}
        avatarUrl={me?.image}
        badgeLabel={condominioName ?? "Avisos"}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {canManage ? (
          <View style={styles.toolbar}>
            <Tap
              style={[styles.nuevaBtn, { backgroundColor: theme.accent }]}
              onPress={() => setShowForm(true)}
            >
              <Ionicons name="add" size={18} color={SoftUI.white} />
              <Text style={styles.nuevaBtnText}>Nuevo</Text>
            </Tap>
          </View>
        ) : null}

        {comunicados === undefined ? (
          <ActivityIndicator
            color={theme.accent}
            style={{ marginTop: SoftUI.space.xxl }}
          />
        ) : (comunicados ?? []).length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Ionicons
              name="megaphone-outline"
              size={32}
              color={SoftUI.textSecondary}
            />
            <Text style={styles.emptyText}>Sin comunicados publicados</Text>
          </GlassCard>
        ) : (
          <View style={{ gap: SoftUI.space.xl }}>
            {fijados.length > 0 && (
              <GlassSection title="Fijados">
                <View style={{ gap: SoftUI.space.md }}>
                  {fijados.map((c) => (
                    <ComunicadoCard
                      key={c._id}
                      c={c}
                      onPress={() => setSelected(c)}
                      onImagePress={setLightbox}
                    />
                  ))}
                </View>
              </GlassSection>
            )}

            {normales.length > 0 && (
              <GlassSection
                title={`${normales.length} comunicado${normales.length === 1 ? "" : "s"}`}
              >
                <View style={{ gap: SoftUI.space.md }}>
                  {normales.map((c) => (
                    <ComunicadoCard
                      key={c._id}
                      c={c}
                      onPress={() => setSelected(c)}
                      onImagePress={setLightbox}
                    />
                  ))}
                </View>
              </GlassSection>
            )}
          </View>
        )}
      </ScrollView>

      <BottomSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        maxHeight="85%"
      >
        {selected && (
          <ScrollView
            contentContainerStyle={{
              padding: SoftUI.padH,
              paddingBottom: SoftUI.space.xxl,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: SoftUI.space.sm,
                marginBottom: SoftUI.space.md,
              }}
            >
              {selected.fijado && <GlassBadge label="Fijado" tone="orange" />}
              {selected.prioridad !== "normal" && (
                <GlassBadge
                  label={PRIORIDAD_LABEL[selected.prioridad]}
                  tone={PRIORIDAD_TONE[selected.prioridad]}
                />
              )}
              <GlassBadge
                label={
                  AUDIENCIA_LABEL[selected.audiencia] ?? selected.audiencia
                }
                tone="blue"
              />
            </View>
            <Text style={styles.detailTitle}>{selected.titulo}</Text>
            <Text style={styles.detailBody}>{selected.cuerpo}</Text>
            {(selected.archivosItems ?? []).length > 0 && (
              <View style={{ gap: SoftUI.space.md, marginBottom: SoftUI.space.lg }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: SoftUI.space.md }}>
                    {(selected.archivosItems ?? [])
                      .filter((a) => a.mimeType.startsWith("image/"))
                      .map((a, i) => (
                        <Pressable
                          key={`img-${i}`}
                          // Cerramos el detalle antes de abrir el visor: dos
                          // Modales apilados en iOS se quedan sin responder.
                          onPress={() => {
                            setSelected(null);
                            setLightbox(a.url);
                          }}
                        >
                          <Image
                            source={{ uri: a.url }}
                            style={{
                              width: 160,
                              height: 120,
                              borderRadius: SoftUI.radius.cardSm,
                            }}
                            resizeMode="cover"
                          />
                        </Pressable>
                      ))}
                  </View>
                </ScrollView>
                {(selected.archivosItems ?? [])
                  .filter((a) => !a.mimeType.startsWith("image/"))
                  .map((a, i) => (
                    <Tap
                      key={`doc-${i}`}
                      style={styles.attachRow}
                      onPress={() => openDocument(a.url, { accent: theme.accent })}
                    >
                      <View style={styles.attachIcon}>
                        <Ionicons
                          name={
                            a.mimeType.includes("pdf")
                              ? "document-text"
                              : "attach"
                          }
                          size={18}
                          color={SoftUI.blue}
                        />
                      </View>
                      <Text style={styles.attachName} numberOfLines={1}>
                        {a.nombre || "Archivo"}
                      </Text>
                      <Ionicons
                        name="open-outline"
                        size={16}
                        color={SoftUI.textSecondary}
                      />
                    </Tap>
                  ))}
              </View>
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SoftUI.space.sm,
              }}
            >
              <View style={styles.authorAvatar}>
                <Text style={styles.authorInitials}>
                  {initials(selected.autorNombre)}
                </Text>
              </View>
              <Text style={styles.metaText}>
                {selected.autorNombre} · {fmtFechaCorta(selected.createdAt)}
              </Text>
            </View>
          </ScrollView>
        )}
      </BottomSheet>

      {condominioId && (
        <CrearAvisoSheet
          visible={showForm}
          onClose={() => setShowForm(false)}
          condominioId={condominioId}
        />
      )}

      {/* Montado solo cuando hay imagen: un Modal siempre presente encima del
          Modal del BottomSheet dejaba la pantalla sin responder a los toques. */}
      {lightbox ? (
        <Lightbox uri={lightbox} onClose={() => setLightbox(null)} />
      ) : null}
    </View>
  );
}

function CrearAvisoSheet({
  visible,
  onClose,
  condominioId,
}: {
  visible: boolean;
  onClose: () => void;
  condominioId: Id<"condominios">;
}) {
  const { theme } = useCondominio();
  const create = useMutation(api.comunicados.create);
  const generateUploadUrl = useAction(api.files.generateUploadUrl);
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [audiencia, setAudiencia] = useState<Audiencia>("todos");
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [fijado, setFijado] = useState(false);
  const [archivos, setArchivos] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitulo("");
    setCuerpo("");
    setAudiencia("todos");
    setPrioridad("normal");
    setFijado(false);
    setArchivos([]);
    setError(null);
  }

  function removeArchivo(key: string) {
    setArchivos((prev) => prev.filter((a) => a.key !== key));
  }

  async function pickImage() {
    if (archivos.length >= MAX_ARCHIVOS) {
      setError(`Máximo ${MAX_ARCHIVOS} archivos.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permiso necesario",
        "Activa el acceso a fotos para adjuntar imágenes.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_ARCHIVOS - archivos.length,
    });
    if (result.canceled || !result.assets?.length) return;

    const next: PendingFile[] = result.assets.map((asset, i) => ({
      key: `img-${Date.now()}-${i}`,
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/jpeg",
      nombre: asset.fileName ?? `imagen-${i + 1}.jpg`,
    }));
    setArchivos((prev) => [...prev, ...next].slice(0, MAX_ARCHIVOS));
    setError(null);
  }

  async function pickPdf() {
    if (archivos.length >= MAX_ARCHIVOS) {
      setError(`Máximo ${MAX_ARCHIVOS} archivos.`);
      return;
    }
    const DocumentPicker = await getDocumentPicker();
    if (!DocumentPicker) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf"],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;

    const next: PendingFile[] = result.assets.map((asset, i) => ({
      key: `pdf-${Date.now()}-${i}`,
      uri: asset.uri,
      mimeType: asset.mimeType ?? "application/pdf",
      nombre: asset.name ?? `documento-${i + 1}.pdf`,
    }));
    setArchivos((prev) => [...prev, ...next].slice(0, MAX_ARCHIVOS));
    setError(null);
  }

  async function uploadOne(file: PendingFile): Promise<{
    url: string;
    s3Key: string;
    mimeType: string;
    nombre: string;
  }> {
    const { uploadUrl, publicUrl, key } = await generateUploadUrl({
      folder: `condominios/comunicados/${condominioId}`,
      contentType: file.mimeType,
      fileName: file.nombre,
    });
    const blobRes = await fetch(file.uri);
    const blob = await blobRes.blob();
    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.mimeType },
      body: blob,
    });
    if (!upload.ok) throw new Error(`No se pudo subir "${file.nombre}".`);
    return {
      url: publicUrl,
      s3Key: key,
      mimeType: file.mimeType,
      nombre: file.nombre,
    };
  }

  async function submit() {
    if (!titulo.trim() || !cuerpo.trim()) {
      setError("Completa el título y el mensaje.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const uploaded = [];
      for (const file of archivos) {
        uploaded.push(await uploadOne(file));
      }
      await create({
        condominioId,
        titulo: titulo.trim(),
        cuerpo: cuerpo.trim(),
        audiencia,
        prioridad,
        fijado,
        archivos: uploaded,
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al publicar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="92%">
      <ScrollView
        contentContainerStyle={{
          padding: SoftUI.padH,
          paddingBottom: SoftUI.space.xxl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sheetTitle}>Nuevo aviso</Text>

        <Text style={styles.label}>Título</Text>
        <TextInput
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Corte de agua programado"
          placeholderTextColor={SoftUI.textDisabled}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: SoftUI.space.base }]}>
          Mensaje
        </Text>
        <TextInput
          value={cuerpo}
          onChangeText={setCuerpo}
          placeholder="Escribe el comunicado…"
          placeholderTextColor={SoftUI.textDisabled}
          multiline
          style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
        />

        <Text style={[styles.label, { marginTop: SoftUI.space.base }]}>
          Adjuntos
        </Text>
        <Text style={styles.hintMuted}>
          Imagen o PDF (máx. {MAX_ARCHIVOS})
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: SoftUI.space.sm,
            marginBottom: SoftUI.space.md,
          }}
        >
          <Tap style={styles.attachBtn} onPress={pickImage} disabled={saving}>
            <Ionicons name="image-outline" size={18} color={SoftUI.blue} />
            <Text style={styles.attachBtnText}>Foto</Text>
          </Tap>
          <Tap style={styles.attachBtn} onPress={pickPdf} disabled={saving}>
            <Ionicons
              name="document-text-outline"
              size={18}
              color={SoftUI.blue}
            />
            <Text style={styles.attachBtnText}>PDF</Text>
          </Tap>
        </View>

        {archivos.length > 0 ? (
          <View style={{ gap: SoftUI.space.sm, marginBottom: SoftUI.space.sm }}>
            {archivos.map((a) => {
              const isImage = a.mimeType.startsWith("image/");
              return (
                <View key={a.key} style={styles.attachRow}>
                  {isImage ? (
                    <Image source={{ uri: a.uri }} style={styles.thumb} />
                  ) : (
                    <View style={styles.attachIcon}>
                      <Ionicons
                        name="document-text"
                        size={18}
                        color={SoftUI.blue}
                      />
                    </View>
                  )}
                  <Text style={styles.attachName} numberOfLines={1}>
                    {a.nombre}
                  </Text>
                  <Tap onPress={() => removeArchivo(a.key)} haptic={false}>
                    <Ionicons
                      name="close-circle"
                      size={22}
                      color={SoftUI.textSecondary}
                    />
                  </Tap>
                </View>
              );
            })}
          </View>
        ) : null}

        <Text style={[styles.label, { marginTop: SoftUI.space.base }]}>
          Audiencia
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: SoftUI.space.sm,
          }}
        >
          {(Object.keys(AUDIENCIA_LABEL) as Audiencia[]).map((a) => {
            const active = audiencia === a;
            return (
              <Pressable
                key={a}
                onPress={() => setAudiencia(a)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {AUDIENCIA_LABEL[a]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { marginTop: SoftUI.space.base }]}>
          Prioridad
        </Text>
        <View style={{ flexDirection: "row", gap: SoftUI.space.sm }}>
          {(["normal", "importante", "urgente"] as Prioridad[]).map((p) => {
            const active = prioridad === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPrioridad(p)}
                style={[
                  styles.chip,
                  { flex: 1, alignItems: "center" },
                  active && styles.chipActive,
                ]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {PRIORIDAD_LABEL[p]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => setFijado((f) => !f)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: SoftUI.space.md,
            marginTop: SoftUI.space.base,
          }}
        >
          <View
            style={[
              styles.checkbox,
              fijado && {
                backgroundColor: theme.accent,
                borderColor: theme.accent,
              },
            ]}
          >
            {fijado && (
              <Ionicons name="checkmark" size={16} color={SoftUI.white} />
            )}
          </View>
          <Text style={styles.checkboxLabel}>Fijar en la parte superior</Text>
        </Pressable>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View
          style={{
            flexDirection: "row",
            gap: SoftUI.space.md,
            marginTop: SoftUI.space.lg,
          }}
        >
          <GlassButton
            label="Cancelar"
            variant="secondary"
            onPress={onClose}
            style={{ flex: 1 }}
          />
          <GlassButton
            label={saving ? "Publicando…" : "Publicar"}
            variant="primary"
            loading={saving}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

/**
 * Visor a pantalla completa. Antes era una hoja inferior con alto fijo de
 * 360 px, así que las imágenes verticales salían recortadas.
 *
 * Es una capa superpuesta y no un `Modal` a propósito: montar un Modal aquí
 * (aun cerrado) dejaba toda la lista sin responder a los toques, porque el
 * detalle ya usa un Modal por debajo (BottomSheet).
 */
function Lightbox({
  uri,
  onClose,
}: {
  uri: string | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: "rgba(0,0,0,0.94)", zIndex: 50 },
      ]}
    >
      <View style={{ flex: 1 }}>
        {/* El zoom nativo del ScrollView (pellizcar y arrastrar) evita tener
            que montar GestureHandlerRootView en la raíz solo para esto. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
          maximumZoomScale={6}
          minimumZoomScale={1}
          bouncesZoom
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {uri ? (
            <CachedImage
              source={{ uri }}
              style={{ width, height: height * 0.82 }}
              contentFit="contain"
              transition={150}
              cachePolicy="memory-disk"
            />
          ) : null}
        </ScrollView>

        <Text
          style={{
            position: "absolute",
            bottom: 44,
            alignSelf: "center",
            color: "rgba(255,255,255,0.55)",
            fontSize: SoftUI.type.chip.size,
            fontFamily: AuthUI.font.regular,
          }}
        >
          Pellizca para acercar
        </Text>

        {/* Cerrar solo con la X: un "tocar para cerrar" en toda la pantalla
            se dispararía al terminar de hacer zoom. */}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={{
            position: "absolute",
            top: 60,
            right: SoftUI.padH,
            width: 40,
            height: 40,
            borderRadius: 20,
            // Oscuro y opaco: al hacer zoom sobre un flyer blanco, un botón
            // translúcido claro desaparecía y no se podía cerrar el visor.
            backgroundColor: "rgba(0,0,0,0.6)",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: "rgba(255,255,255,0.35)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function ComunicadoCard({
  c,
  onPress,
  onImagePress,
}: {
  c: ComunicadoRow;
  onPress: () => void;
  onImagePress: (url: string) => void;
}) {
  const { theme } = useCondominio();
  const primerImagen = (c.archivosItems ?? []).find((a) =>
    a.mimeType.startsWith("image/"),
  );
  const pdfCount = (c.archivosItems ?? []).filter((a) =>
    a.mimeType.includes("pdf"),
  ).length;
  const hasUrgent = c.prioridad === "urgente";

  return (
    <GlassPressable onPress={onPress}>
      <GlassCard
        style={{
          padding: SoftUI.space.base,
          borderLeftWidth:
            hasUrgent || c.prioridad === "importante" ? 3 : 0,
          borderLeftColor: hasUrgent
            ? SoftUI.danger
            : c.prioridad === "importante"
              ? SoftUI.warning
              : "transparent",
        }}
      >
        <View style={{ flexDirection: "row", gap: SoftUI.space.md }}>
          <View
            style={[
              styles.cardIcon,
              hasUrgent && { backgroundColor: SoftUI.dangerSoft },
              c.prioridad === "importante" && {
                backgroundColor: SoftUI.warningSoft,
              },
            ]}
          >
            <Ionicons
              name={c.fijado ? "pin" : "megaphone-outline"}
              size={20}
              color={
                hasUrgent
                  ? SoftUI.danger
                  : c.prioridad === "importante"
                    ? "#B8860B"
                    : theme.accent
              }
            />
          </View>
          <View style={{ flex: 1, gap: SoftUI.space.xs, minWidth: 0 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SoftUI.space.sm,
              }}
            >
              {/* flexShrink deja que el título ocupe el espacio libre; sin él
                  la etiqueta se lo comía y quedaba en "Delegast…". */}
              <Text
                style={[styles.cardTitle, { flexShrink: 1 }]}
                numberOfLines={2}
              >
                {c.titulo}
              </Text>
              {c.prioridad !== "normal" && (
                <GlassBadge
                  label={PRIORIDAD_LABEL[c.prioridad]}
                  tone={PRIORIDAD_TONE[c.prioridad]}
                />
              )}
            </View>
            <Text style={styles.cardBody} numberOfLines={2}>
              {c.cuerpo}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SoftUI.space.sm,
              }}
            >
              <View style={styles.miniAvatar}>
                <Text style={styles.miniInitials}>
                  {initials(c.autorNombre)}
                </Text>
              </View>
              {/* Una sola línea: los nombres largos se cortan en vez de
                  partir la fila y desalinear la fecha. */}
              <Text style={[styles.metaText, { flexShrink: 1 }]} numberOfLines={1}>
                {c.autorNombre}
              </Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText} numberOfLines={1}>
                {fmtFechaCorta(c.createdAt)}
              </Text>
              {pdfCount > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3,
                    marginLeft: SoftUI.space.xs,
                  }}
                >
                  <Ionicons
                    name="document-attach-outline"
                    size={12}
                    color={SoftUI.textSecondary}
                  />
                  <Text style={styles.metaText}>{pdfCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {primerImagen ? (
            <Pressable onPress={() => onImagePress(primerImagen.url)}>
              <CachedImage
                source={{ uri: primerImagen.url }}
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: SoftUI.radius.icon,
                }}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
              />
            </Pressable>
          ) : null}
        </View>
      </GlassCard>
    </GlassPressable>
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
    justifyContent: "flex-end",
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
    marginTop: SoftUI.space.sm,
  },
  emptyText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.regular,
    textAlign: "center",
  },
  detailTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.section.size,
    lineHeight: SoftUI.type.section.line,
    fontFamily: AuthUI.font.bold,
    marginBottom: SoftUI.space.md,
  },
  detailBody: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.body.size,
    lineHeight: SoftUI.type.body.line,
    fontFamily: AuthUI.font.regular,
    marginBottom: SoftUI.space.lg,
  },
  authorAvatar: {
    width: 28,
    height: 28,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.infoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  authorInitials: {
    color: SoftUI.blue,
    fontSize: 10,
    fontFamily: AuthUI.font.bold,
  },
  metaText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size - 1,
    fontFamily: AuthUI.font.regular,
  },
  metaDot: {
    color: SoftUI.textDisabled,
    fontSize: SoftUI.type.chip.size - 1,
    fontFamily: AuthUI.font.regular,
  },
  sheetTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.section.size,
    fontFamily: AuthUI.font.bold,
    marginBottom: SoftUI.space.base,
  },
  label: {
    color: SoftUI.text,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.semibold,
    marginBottom: SoftUI.space.sm,
  },
  hintMuted: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
    marginBottom: SoftUI.space.md,
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
  attachBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SoftUI.space.sm,
    paddingVertical: SoftUI.space.md,
    borderRadius: SoftUI.radius.button,
    backgroundColor: SoftUI.card,
    ...softShadow,
  },
  attachBtnText: {
    color: SoftUI.text,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.semibold,
  },
  attachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.md,
    paddingVertical: SoftUI.space.md,
    paddingHorizontal: SoftUI.space.md,
    borderRadius: SoftUI.radius.cardSm,
    backgroundColor: SoftUI.card,
    ...softShadow,
  },
  attachIcon: {
    width: SoftUI.iconBtn - 8,
    height: SoftUI.iconBtn - 8,
    borderRadius: SoftUI.radius.icon,
    backgroundColor: SoftUI.infoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    width: SoftUI.iconBtn - 8,
    height: SoftUI.iconBtn - 8,
    borderRadius: SoftUI.radius.icon,
    backgroundColor: SoftUI.bgSecondary,
  },
  attachName: {
    flex: 1,
    color: SoftUI.text,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.medium,
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
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: SoftUI.radius.icon - 8,
    borderWidth: 1.5,
    borderColor: SoftUI.divider,
    backgroundColor: SoftUI.card,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxLabel: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size - 1,
    fontFamily: AuthUI.font.medium,
  },
  errorBox: {
    backgroundColor: SoftUI.dangerSoft,
    borderRadius: SoftUI.radius.cardSm,
    padding: SoftUI.space.md,
    marginTop: SoftUI.space.base,
  },
  errorText: {
    color: SoftUI.danger,
    fontSize: SoftUI.type.caption.size,
    fontFamily: AuthUI.font.medium,
  },
  cardIcon: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.infoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.semibold,
    flex: 1,
  },
  cardBody: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size,
    lineHeight: SoftUI.type.caption.line,
    fontFamily: AuthUI.font.regular,
  },
  miniAvatar: {
    width: 20,
    height: 20,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.bgSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  miniInitials: {
    color: SoftUI.textSecondary,
    fontSize: 8,
    fontFamily: AuthUI.font.bold,
  },
});
