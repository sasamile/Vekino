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
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useMutation, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { getDocumentPicker } from "@/lib/document-picker";
import { useCondominio } from "@/context/condominio-context";
import { NoCondominioScreen } from "@/components/ui/no-condominio";
import { CondominioHeader } from "@/components/ui/condominio-header";
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
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";

const PRIORIDAD_TONE: Record<string, "red" | "yellow" | "neutral"> = {
  urgente: "red", importante: "yellow", normal: "neutral",
};
const PRIORIDAD_LABEL: Record<string, string> = {
  urgente: "Urgente", importante: "Importante", normal: "Normal",
};
const AUDIENCIA_LABEL: Record<string, string> = {
  todos: "Todos", propietario: "Propietarios", arrendatario: "Arrendatarios",
  residente: "Residentes", junta_directiva: "Junta directiva",
};

type Audiencia = "todos" | "propietario" | "arrendatario" | "residente" | "junta_directiva";
type Prioridad = "normal" | "importante" | "urgente";

type ComunicadoRow = NonNullable<ReturnType<typeof useQuery<typeof api.comunicados.listByCondominio>>>[number];

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
  const { condominioId, isSuperadmin, canManage } = useCondominio();
  const comunicados = useQuery(api.comunicados.listByCondominio, condominioId ? { condominioId } : "skip");
  const [selected, setSelected] = useState<ComunicadoRow | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  if (isSuperadmin && !condominioId) return <NoCondominioScreen />;

  const fijados = (comunicados ?? []).filter((c) => c.fijado);
  const normales = (comunicados ?? []).filter((c) => !c.fijado);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 130, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <CondominioHeader
          condominioId={condominioId}
          title="Avisos"
          right={
            canManage ? (
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
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Nuevo</Text>
              </View>
            ) : undefined
          }
        />

        {comunicados === undefined ? (
          <ActivityIndicator color={C.textSoft} style={{ marginTop: 40 }} />
        ) : (comunicados ?? []).length === 0 ? (
          <GlassCard style={{ padding: 48, alignItems: "center", gap: 12, marginTop: 20 }}>
            <Ionicons name="megaphone-outline" size={36} color={C.textMuted} />
            <Text style={{ color: C.textMuted, fontSize: 15, textAlign: "center" }}>
              Sin comunicados publicados
            </Text>
          </GlassCard>
        ) : (
          <View style={{ gap: 24 }}>
            {fijados.length > 0 && (
              <GlassSection title="Fijados">
                <View style={{ gap: 10 }}>
                  {fijados.map((c) => (
                    <ComunicadoCard key={c._id} c={c} onPress={() => setSelected(c)} onImagePress={setLightbox} />
                  ))}
                </View>
              </GlassSection>
            )}

            {normales.length > 0 && (
              <GlassSection title={`${normales.length} comunicado${normales.length === 1 ? "" : "s"}`}>
                <View style={{ gap: 10 }}>
                  {normales.map((c) => (
                    <ComunicadoCard key={c._id} c={c} onPress={() => setSelected(c)} onImagePress={setLightbox} />
                  ))}
                </View>
              </GlassSection>
            )}
          </View>
        )}
      </ScrollView>

      {/* Detalle */}
      <BottomSheet visible={selected !== null} onClose={() => setSelected(null)} maxHeight="85%">
        {selected && (
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {selected.fijado && <GlassBadge label="Fijado" tone="orange" />}
              {selected.prioridad !== "normal" && (
                <GlassBadge label={PRIORIDAD_LABEL[selected.prioridad]} tone={PRIORIDAD_TONE[selected.prioridad]} />
              )}
              <GlassBadge label={AUDIENCIA_LABEL[selected.audiencia] ?? selected.audiencia} tone="blue" />
            </View>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 10, letterSpacing: -0.4 }}>
              {selected.titulo}
            </Text>
            <Text style={{ color: C.textSoft, fontSize: 15, lineHeight: 22, marginBottom: 20 }}>
              {selected.cuerpo}
            </Text>
            {(selected.archivosItems ?? []).length > 0 && (
              <View style={{ gap: 10, marginBottom: 20 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    {(selected.archivosItems ?? [])
                      .filter((a) => a.mimeType.startsWith("image/"))
                      .map((a, i) => (
                        <Pressable key={`img-${i}`} onPress={() => setLightbox(a.url)}>
                          <Image
                            source={{ uri: a.url }}
                            style={{ width: 160, height: 120, borderRadius: 14 }}
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
                      style={styles_attachRow}
                      onPress={() => {
                        if (a.url) Linking.openURL(a.url);
                      }}
                    >
                      <View style={styles_attachIcon}>
                        <Ionicons
                          name={a.mimeType.includes("pdf") ? "document-text" : "attach"}
                          size={18}
                          color={AuthUI.text}
                        />
                      </View>
                      <Text style={styles_attachName} numberOfLines={1}>
                        {a.nombre || "Archivo"}
                      </Text>
                      <Ionicons name="open-outline" size={16} color={AuthUI.textMuted} />
                    </Tap>
                  ))}
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: C.textSoft, fontSize: 10, fontWeight: "700" }}>
                  {initials(selected.autorNombre)}
                </Text>
              </View>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>
                {selected.autorNombre} · {fmtFechaCorta(selected.createdAt)}
              </Text>
            </View>
          </ScrollView>
        )}
      </BottomSheet>

      {/* Crear aviso */}
      {condominioId && (
        <CrearAvisoSheet visible={showForm} onClose={() => setShowForm(false)} condominioId={condominioId} />
      )}

      {/* Lightbox */}
      <BottomSheet visible={lightbox !== null} onClose={() => setLightbox(null)} maxHeight="80%">
        {lightbox && (
          <View style={{ padding: 16, paddingBottom: 40 }}>
            <Image source={{ uri: lightbox }} style={{ width: "100%", height: 360, borderRadius: 16 }} resizeMode="contain" />
          </View>
        )}
      </BottomSheet>
    </SafeAreaView>
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
  const create = useMutation(api.comunicados.create);
  const generateUploadUrl = useMutation(api.comunicados.generateUploadUrl);
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
      Alert.alert("Permiso necesario", "Activa el acceso a fotos para adjuntar imágenes.");
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
    storageId: Id<"_storage">;
    mimeType: string;
    nombre: string;
  }> {
    const uploadUrl = await generateUploadUrl();
    const blobRes = await fetch(file.uri);
    const blob = await blobRes.blob();
    const upload = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.mimeType },
      body: blob,
    });
    if (!upload.ok) throw new Error(`No se pudo subir "${file.nombre}".`);
    const { storageId } = (await upload.json()) as { storageId: string };
    return {
      storageId: storageId as Id<"_storage">,
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
        contentContainerStyle={{ padding: 24, paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 20, letterSpacing: -0.4 }}>
          Nuevo aviso
        </Text>

        <Text style={styles_label}>Título</Text>
        <TextInput
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Corte de agua programado"
          placeholderTextColor={C.textMuted}
          style={inputStyle}
        />

        <Text style={[styles_label, { marginTop: 14 }]}>Mensaje</Text>
        <TextInput
          value={cuerpo}
          onChangeText={setCuerpo}
          placeholder="Escribe el comunicado…"
          placeholderTextColor={C.textMuted}
          multiline
          style={[inputStyle, { minHeight: 100, textAlignVertical: "top" }]}
        />

        <Text style={[styles_label, { marginTop: 14 }]}>Adjuntos</Text>
        <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 10 }}>
          Imagen o PDF (máx. {MAX_ARCHIVOS})
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
          <Tap style={styles_attachBtn} onPress={pickImage} disabled={saving}>
            <Ionicons name="image-outline" size={18} color={AuthUI.text} />
            <Text style={styles_attachBtnText}>Foto</Text>
          </Tap>
          <Tap style={styles_attachBtn} onPress={pickPdf} disabled={saving}>
            <Ionicons name="document-text-outline" size={18} color={AuthUI.text} />
            <Text style={styles_attachBtnText}>PDF</Text>
          </Tap>
        </View>

        {archivos.length > 0 ? (
          <View style={{ gap: 8, marginBottom: 8 }}>
            {archivos.map((a) => {
              const isImage = a.mimeType.startsWith("image/");
              return (
                <View key={a.key} style={styles_attachRow}>
                  {isImage ? (
                    <Image source={{ uri: a.uri }} style={styles_thumb} />
                  ) : (
                    <View style={styles_attachIcon}>
                      <Ionicons name="document-text" size={18} color={AuthUI.text} />
                    </View>
                  )}
                  <Text style={styles_attachName} numberOfLines={1}>
                    {a.nombre}
                  </Text>
                  <Tap onPress={() => removeArchivo(a.key)} haptic={false}>
                    <Ionicons name="close-circle" size={22} color={AuthUI.textMuted} />
                  </Tap>
                </View>
              );
            })}
          </View>
        ) : null}

        <Text style={[styles_label, { marginTop: 14 }]}>Audiencia</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(Object.keys(AUDIENCIA_LABEL) as Audiencia[]).map((a) => {
            const active = audiencia === a;
            return (
              <Pressable key={a} onPress={() => setAudiencia(a)} style={chip(active)}>
                <Text style={{ color: active ? "#fff" : C.textSoft, fontSize: 13, fontWeight: "600" }}>
                  {AUDIENCIA_LABEL[a]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles_label, { marginTop: 14 }]}>Prioridad</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["normal", "importante", "urgente"] as Prioridad[]).map((p) => {
            const active = prioridad === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPrioridad(p)}
                style={[chip(active), { flex: 1, alignItems: "center" }]}
              >
                <Text style={{ color: active ? "#fff" : C.textSoft, fontSize: 13, fontWeight: "600" }}>
                  {PRIORIDAD_LABEL[p]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => setFijado((f) => !f)}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              borderWidth: 1.5,
              borderColor: fijado ? "#0E0E0F" : C.border,
              backgroundColor: fijado ? "#0E0E0F" : C.card,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {fijado && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: "500" }}>
            Fijar en la parte superior
          </Text>
        </Pressable>

        {error && (
          <View style={{ backgroundColor: C.dangerSoft, borderRadius: 12, padding: 12, marginTop: 16 }}>
            <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
          <GlassButton label="Cancelar" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
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

function ComunicadoCard({
  c,
  onPress,
  onImagePress,
}: {
  c: ComunicadoRow;
  onPress: () => void;
  onImagePress: (url: string) => void;
}) {
  const primerImagen = (c.archivosItems ?? []).find((a) => a.mimeType.startsWith("image/"));
  const pdfCount = (c.archivosItems ?? []).filter((a) => a.mimeType.includes("pdf")).length;
  const hasUrgent = c.prioridad === "urgente";

  return (
    <GlassPressable onPress={onPress}>
      <GlassCard
        style={{
          padding: 16,
          borderLeftWidth: hasUrgent ? 3 : c.prioridad === "importante" ? 3 : 0,
          borderLeftColor: hasUrgent ? C.danger : c.prioridad === "importante" ? C.warning : "transparent",
        }}
      >
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {c.fijado && <Ionicons name="pin" size={12} color={C.brand} />}
              <Text style={{ color: C.text, fontSize: 15, fontWeight: "600", flex: 1 }} numberOfLines={1}>
                {c.titulo}
              </Text>
              {c.prioridad !== "normal" && (
                <GlassBadge label={PRIORIDAD_LABEL[c.prioridad]} tone={PRIORIDAD_TONE[c.prioridad]} />
              )}
            </View>
            <Text style={{ color: C.textSoft, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
              {c.cuerpo}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: C.textSoft, fontSize: 8, fontWeight: "700" }}>
                  {initials(c.autorNombre)}
                </Text>
              </View>
              <Text style={{ color: C.textMuted, fontSize: 11 }}>
                {c.autorNombre} · {fmtFechaCorta(c.createdAt)}
              </Text>
              {pdfCount > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 4 }}>
                  <Ionicons name="document-attach-outline" size={12} color={C.textMuted} />
                  <Text style={{ color: C.textMuted, fontSize: 11 }}>{pdfCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {primerImagen ? (
            <Pressable onPress={() => onImagePress(primerImagen.url)}>
              <Image source={{ uri: primerImagen.url }} style={{ width: 68, height: 68, borderRadius: 12 }} />
            </Pressable>
          ) : null}
        </View>
      </GlassCard>
    </GlassPressable>
  );
}

const styles_label = { color: C.text, fontSize: 13, fontWeight: "500" as const, marginBottom: 8 };
const inputStyle = {
  borderWidth: 1,
  borderColor: C.border,
  backgroundColor: C.card,
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: C.text,
};
const styles_attachBtn = {
  flex: 1,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: 8,
  paddingVertical: 12,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: C.border,
  backgroundColor: "#FFFFFF",
};
const styles_attachBtnText = {
  color: AuthUI.text,
  fontSize: 14,
  fontFamily: AuthUI.font.semibold,
};
const styles_attachRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 10,
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: C.border,
  backgroundColor: "#FFFFFF",
};
const styles_attachIcon = {
  width: 40,
  height: 40,
  borderRadius: 10,
  backgroundColor: "rgba(14,14,15,0.06)",
  alignItems: "center" as const,
  justifyContent: "center" as const,
};
const styles_thumb = {
  width: 40,
  height: 40,
  borderRadius: 10,
  backgroundColor: C.bgSubtle,
};
const styles_attachName = {
  flex: 1,
  color: AuthUI.text,
  fontSize: 13,
  fontFamily: AuthUI.font.medium,
};
function chip(active: boolean) {
  return {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: active ? C.text : C.border,
    backgroundColor: active ? C.text : C.card,
  };
}
