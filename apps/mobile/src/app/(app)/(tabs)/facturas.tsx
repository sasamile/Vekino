import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TextInput,
  Linking,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useAction, Authenticated } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { getDocumentPicker } from "@/lib/document-picker";
import { useCondominio } from "@/context/condominio-context";
import { NoCondominioScreen } from "@/components/ui/no-condominio";
import { CondominioHeader } from "@/components/ui/condominio-header";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Tap } from "@/components/ui/tap";
import {
  ScreenBackground,
  GlassCard,
  GlassBadge,
  GlassButton,
  GlassSection,
  GlassPressable,
} from "@/components/ui/glass";
import { cop, fmtPeriodo } from "@/lib/utils";
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";

type Estado = "pendiente" | "pagada" | "vencida" | "abonada" | "saldo_a_favor";

const ESTADO_TONE: Record<Estado, "yellow" | "green" | "red" | "neutral" | "blue"> = {
  pendiente: "yellow",
  pagada:    "green",
  vencida:   "red",
  abonada:   "neutral",
  saldo_a_favor: "blue",
};

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: "Pendiente",
  pagada:    "Pagada",
  vencida:   "Vencida",
  abonada:   "Abonada",
  saldo_a_favor: "Saldo a favor",
};

type FacturaRow = {
  _id: Id<"facturas">;
  periodo: string;
  periodoLabel: string;
  residenteNombre: string;
  apto?: string;
  totalAPagar: number;
  totalConDescuento?: number;
  vrAdmon: number;
  estado: string;
  fechaEmision: number;
  fechaVencimiento: number;
  pdfUrl?: string | null;
  lineas: { codigo: number; concepto: string; saldoAnterior: number; actual: number; total: number }[];
};

export default function FacturasScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <Authenticated>
          <FacturasContent />
        </Authenticated>
      </ScreenBackground>
    </View>
  );
}

function FacturasContent() {
  const { condominioId, isSuperadmin, canManage } = useCondominio();

  if (isSuperadmin && !condominioId) return <NoCondominioScreen />;
  if (canManage && condominioId) {
    return <AdminFacturasView condominioId={condominioId} />;
  }
  return <ResidentFacturasView condominioId={condominioId} />;
}

/* ── Selector de período (select estilo web) ─────────────────── */
function PeriodoSelect({
  periodos,
  value,
  onChange,
}: {
  periodos: string[];
  value: string;
  onChange: (p: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="calendar-outline" size={16} color={C.textSoft} />
          <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>
            {value ? fmtPeriodo(value) : "Selecciona período"}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={C.textMuted} />
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} maxHeight="70%">
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: "700", marginBottom: 16 }}>Período</Text>
          {periodos.map((p) => {
            const active = p === value;
            return (
              <Pressable
                key={p}
                onPress={() => { onChange(p); setOpen(false); }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, paddingHorizontal: 12, borderRadius: 8, backgroundColor: active ? C.bgSubtle : "transparent", marginBottom: 2 }}
              >
                <Text style={{ color: C.text, fontSize: 15, fontWeight: active ? "600" : "400" }}>
                  {fmtPeriodo(p)}
                </Text>
                {active && <Ionicons name="checkmark" size={18} color={C.navy} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

/* ── Vista admin: todas las facturas del período ────────────── */
function AdminFacturasView({ condominioId }: { condominioId: Id<"condominios"> }) {
  const periodos = useQuery(api.facturas.listPeriodos, { condominioId });
  const [selectedPeriodo, setSelectedPeriodo] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const periodo = selectedPeriodo ?? periodos?.[0] ?? "";
  const resumen = useQuery(api.facturas.resumenPeriodo, periodo ? { condominioId, periodo } : "skip");
  const facturas = useQuery(api.facturas.listByPeriodo, periodo ? { condominioId, periodo } : "skip");

  const [estadoFiltro, setEstadoFiltro] = useState<"" | Estado>("");
  const [search, setSearch] = useState("");
  const [detalle, setDetalle] = useState<FacturaRow | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = ((facturas ?? []) as FacturaRow[])
    .filter((f) => !estadoFiltro || f.estado === estadoFiltro)
    .filter((f) => !q || f.residenteNombre.toLowerCase().includes(q) || (f.apto ?? "").toLowerCase().includes(q));

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 130, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <CondominioHeader
          condominioId={condominioId}
          title="Facturas"
          right={
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
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Nueva</Text>
            </View>
          }
        />

        {/* Período select */}
        {periodos && periodos.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <PeriodoSelect periodos={periodos} value={periodo} onChange={setSelectedPeriodo} />
          </View>
        )}

        {/* Stats neutros */}
        {resumen && (
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Pendientes", value: resumen.pendientes },
              { label: "Pagadas", value: resumen.pagadas },
              { label: "Vencidas", value: resumen.vencidas },
            ].map((s) => (
              <GlassCard key={s.label} style={{ flex: 1, padding: 14, alignItems: "center", gap: 4 }}>
                <Text style={{ color: C.text, fontSize: 22, fontWeight: "700" }}>{s.value}</Text>
                <Text style={{ color: C.textMuted, fontSize: 11 }}>{s.label}</Text>
              </GlassCard>
            ))}
          </View>
        )}

        {/* Total cartera */}
        {resumen && (
          <GlassCard style={{ padding: 20, marginBottom: 16 }}>
            <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "500" }}>
              Total cartera
            </Text>
            <Text style={{ color: C.text, fontSize: 28, fontWeight: "600", letterSpacing: -0.8, marginTop: 4 }}>
              {cop(resumen.sumaTotalAPagar)}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>
              {resumen.total} unidades facturadas
            </Text>
          </GlassCard>
        )}

        {/* Buscador */}
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.border, backgroundColor: C.card, borderRadius: 8, paddingHorizontal: 12, marginBottom: 14 }}>
          <Ionicons name="search" size={16} color={C.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre o apto…"
            placeholderTextColor={C.textMuted}
            style={{
              flex: 1,
              color: C.text,
              fontSize: 15,
              paddingVertical: 12,
              paddingHorizontal: 8,
              letterSpacing: 0,
              fontFamily: AuthUI.font.regular,
            }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={C.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Filtros estado */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 16 }}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {(["", "pendiente", "pagada", "vencida", "saldo_a_favor"] as const).map((e) => {
            const active = estadoFiltro === e;
            return (
              <Pressable key={e} onPress={() => setEstadoFiltro(e)} style={chipStyle(active)}>
                <Text style={{ color: active ? "#fff" : C.textSoft, fontSize: 13, fontWeight: "600" }}>
                  {e === "" ? "Todas" : ESTADO_LABEL[e]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Lista */}
        <GlassSection title={`${filtered.length} factura${filtered.length === 1 ? "" : "s"}`}>
          {facturas === undefined ? (
            <ActivityIndicator color={C.textSoft} style={{ marginTop: 20 }} />
          ) : filtered.length === 0 ? (
            <GlassCard style={{ padding: 32, alignItems: "center", gap: 10 }}>
              <Ionicons name="wallet-outline" size={32} color={C.textMuted} />
              <Text style={{ color: C.textMuted, fontSize: 14, textAlign: "center" }}>
                {q ? "Sin resultados para tu búsqueda" : "Sin facturas en esta categoría"}
              </Text>
            </GlassCard>
          ) : (
            <View style={{ gap: 10 }}>
              {filtered.map((f) => (
                <GlassPressable key={f._id} onPress={() => setDetalle(f)}>
                  <GlassCard style={{ padding: 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: C.bgSubtle, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Ionicons name="person-outline" size={17} color={C.textSoft} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: C.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
                          {f.residenteNombre}
                        </Text>
                        <Text style={{ color: C.textMuted, fontSize: 12 }}>
                          {f.apto ? `Apto ${f.apto}` : "Sin apto"}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 6 }}>
                        <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>
                          {cop(f.totalAPagar)}
                        </Text>
                        <GlassBadge
                          label={ESTADO_LABEL[f.estado as Estado] ?? f.estado}
                          tone={ESTADO_TONE[f.estado as Estado] ?? "neutral"}
                        />
                      </View>
                    </View>
                  </GlassCard>
                </GlassPressable>
              ))}
            </View>
          )}
        </GlassSection>
      </ScrollView>

      <FacturaDetalleModal
        detalle={detalle}
        condominioId={condominioId}
        onClose={() => setDetalle(null)}
      />
      <CrearFacturaSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        condominioId={condominioId}
        defaultPeriodo={periodo}
      />
    </SafeAreaView>
  );
}

/* ── Vista residente: mis propias facturas ──────────────────── */
function ResidentFacturasView({ condominioId }: { condominioId: Id<"condominios"> | undefined }) {
  const facturas = useQuery(api.facturas.listMia, condominioId ? { condominioId } : "skip");
  const [estadoFiltro, setEstadoFiltro] = useState<"" | Estado>("");
  const [detalle, setDetalle] = useState<FacturaRow | null>(null);

  const filtered = (facturas ?? []).filter((f) => !estadoFiltro || f.estado === estadoFiltro) as FacturaRow[];

  const pendientesTotal = (facturas ?? [])
    .filter((f) => f.estado === "pendiente")
    .reduce((s, f) => s + f.totalAPagar, 0);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 130, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <CondominioHeader condominioId={condominioId} title="Facturas" />

        <GlassCard style={{ padding: 16, marginBottom: 20 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "500" }}>Por pagar</Text>
          <Text style={{ color: C.text, fontSize: 28, fontWeight: "600", letterSpacing: -0.6, marginTop: 4 }}>
            {cop(pendientesTotal)}
          </Text>
          <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>
            {(facturas ?? []).filter((f) => f.estado === "pendiente").length} factura(s) activa(s)
          </Text>
        </GlassCard>

        {/* Filtros */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 20 }}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {(["", "pendiente", "pagada", "vencida", "saldo_a_favor"] as const).map((e) => {
            const active = estadoFiltro === e;
            return (
              <Pressable key={e} onPress={() => setEstadoFiltro(e)} style={chipStyle(active)}>
                <Text style={{ color: active ? "#fff" : C.textSoft, fontSize: 13, fontWeight: "600" }}>
                  {e === "" ? "Todas" : ESTADO_LABEL[e]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Lista */}
        <GlassSection title={`${filtered.length} factura${filtered.length === 1 ? "" : "s"}`}>
          {facturas === undefined ? (
            <ActivityIndicator color={C.textSoft} style={{ marginTop: 20 }} />
          ) : filtered.length === 0 ? (
            <GlassCard style={{ padding: 32, alignItems: "center", gap: 10 }}>
              <Ionicons name="wallet-outline" size={32} color={C.textMuted} />
              <Text style={{ color: C.textMuted, fontSize: 14, textAlign: "center" }}>
                Sin facturas en esta categoría
              </Text>
            </GlassCard>
          ) : (
            <View style={{ gap: 10 }}>
              {filtered.map((f) => (
                <GlassPressable key={f._id} onPress={() => setDetalle(f)}>
                  <GlassCard style={{ padding: 18 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>
                          {fmtPeriodo(f.periodo)}
                        </Text>
                        {f.apto && (
                          <Text style={{ color: C.textMuted, fontSize: 12 }}>Apto {f.apto}</Text>
                        )}
                        {f.totalConDescuento && f.estado === "pendiente" && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                            <Ionicons name="pricetag" size={12} color={C.success} />
                            <Text style={{ color: C.success, fontSize: 12, fontWeight: "600" }}>
                              Con descuento: {cop(f.totalConDescuento)} (del 1-15)
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 8 }}>
                        <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>{cop(f.totalAPagar)}</Text>
                        <GlassBadge
                          label={ESTADO_LABEL[f.estado as Estado] ?? f.estado}
                          tone={ESTADO_TONE[f.estado as Estado] ?? "neutral"}
                        />
                      </View>
                    </View>
                    <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="time-outline" size={12} color={C.textMuted} />
                      <Text style={{ color: C.textMuted, fontSize: 11 }}>
                        Vence {new Date(f.fechaVencimiento).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                      </Text>
                    </View>
                  </GlassCard>
                </GlassPressable>
              ))}
            </View>
          )}
        </GlassSection>
      </ScrollView>

      <FacturaDetalleModal
        detalle={detalle}
        condominioId={condominioId}
        onClose={() => setDetalle(null)}
      />
    </SafeAreaView>
  );
}

function currentPeriodo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function defaultVencimientoIso() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(15);
  return d.toISOString().slice(0, 10);
}

type PendingAdjunto = {
  uri: string;
  mimeType: string;
  nombre: string;
};

type UnidadOption = {
  _id: Id<"unidades">;
  numero: string;
  torre: string | null;
  residentes: { name: string | null }[];
};

function unidadLabel(u: UnidadOption) {
  const apto = u.torre ? `${u.numero} ${u.torre}` : u.numero;
  const nombre = u.residentes.find((r) => r.name)?.name;
  return nombre ? `${apto} · ${nombre}` : apto;
}

function CrearFacturaSheet({
  visible,
  onClose,
  condominioId,
  defaultPeriodo,
}: {
  visible: boolean;
  onClose: () => void;
  condominioId: Id<"condominios">;
  defaultPeriodo?: string;
}) {
  const createManual = useMutation(api.facturas.createManual);
  const generateUploadUrl = useAction(api.files.generateUploadUrl);
  const unidades = useQuery(
    api.unidades.listDetailed,
    visible ? { condominioId } : "skip",
  );

  const [unidadId, setUnidadId] = useState<Id<"unidades"> | null>(null);
  const [unidadPicker, setUnidadPicker] = useState(false);
  const [unidadSearch, setUnidadSearch] = useState("");
  const [periodo, setPeriodo] = useState(defaultPeriodo || currentPeriodo());
  const [fechaVencimiento, setFechaVencimiento] = useState(defaultVencimientoIso());
  const [valor, setValor] = useState("");
  const [saldoAFavor, setSaldoAFavor] = useState("0");
  const [totalConDescuento, setTotalConDescuento] = useState("");
  const [adjunto, setAdjunto] = useState<PendingAdjunto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPeriodo(defaultPeriodo || currentPeriodo());
    setFechaVencimiento(defaultVencimientoIso());
    setError(null);
  }, [visible, defaultPeriodo]);

  const selectedUnidad = (unidades ?? []).find((u) => u._id === unidadId) as
    | UnidadOption
    | undefined;

  const filteredUnidades = ((unidades ?? []) as UnidadOption[])
    .filter((u) => {
      const q = unidadSearch.trim().toLowerCase();
      if (!q) return true;
      const label = unidadLabel(u).toLowerCase();
      return label.includes(q) || u.numero.toLowerCase().includes(q);
    })
    .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }));

  function reset() {
    setUnidadId(null);
    setUnidadSearch("");
    setPeriodo(defaultPeriodo || currentPeriodo());
    setFechaVencimiento(defaultVencimientoIso());
    setValor("");
    setSaldoAFavor("0");
    setTotalConDescuento("");
    setAdjunto(null);
    setError(null);
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permiso necesario", "Activa el acceso a fotos para adjuntar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setAdjunto({
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/jpeg",
      nombre: asset.fileName ?? "factura.jpg",
    });
  }

  async function pickPdf() {
    const DocumentPicker = await getDocumentPicker();
    if (!DocumentPicker) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setAdjunto({
      uri: asset.uri,
      mimeType: asset.mimeType ?? "application/pdf",
      nombre: asset.name ?? "factura.pdf",
    });
  }

  async function submit() {
    if (!unidadId) {
      setError("Selecciona una unidad.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(periodo.trim())) {
      setError("El período debe ser YYYY-MM (ej. 2026-06).");
      return;
    }
    const valorNum = Number(valor.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(valorNum) || valorNum < 0) {
      setError("Ingresa un valor válido.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaVencimiento.trim())) {
      setError("Fecha de vencimiento: YYYY-MM-DD.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let pdfUrl: string | undefined;
      if (adjunto) {
        const { uploadUrl, publicUrl } = await generateUploadUrl({
          folder: `condominios/facturas/${condominioId}`,
          contentType: adjunto.mimeType,
          fileName: adjunto.nombre,
        });
        const blobRes = await fetch(adjunto.uri);
        const blob = await blobRes.blob();
        const upload = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": adjunto.mimeType },
          body: blob,
        });
        if (!upload.ok) throw new Error("No se pudo subir el archivo.");
        pdfUrl = publicUrl;
      }

      const saldo = Number(saldoAFavor.replace(/[^\d.]/g, "")) || 0;
      const descRaw = totalConDescuento.trim();
      const desc = descRaw
        ? Number(descRaw.replace(/[^\d.]/g, ""))
        : undefined;
      if (desc !== undefined && (!Number.isFinite(desc) || desc < 0)) {
        throw new Error("Valor con descuento inválido.");
      }

      const venc = new Date(`${fechaVencimiento.trim()}T23:59:59`).getTime();
      await createManual({
        condominioId,
        unidadId,
        periodo: periodo.trim(),
        fechaVencimiento: venc,
        valor: valorNum,
        saldoAFavor: saldo,
        totalConDescuento: desc,
        pdfUrl,
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear factura");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} maxHeight="92%">
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 36 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 20, letterSpacing: -0.4 }}>
            Nueva factura
          </Text>

          <Text style={styles_label}>Unidad *</Text>
          <Tap
            style={inputStyle}
            onPress={() => setUnidadPicker(true)}
            haptic={false}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text
                style={{
                  color: selectedUnidad ? C.text : C.textMuted,
                  fontSize: 15,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {selectedUnidad ? unidadLabel(selectedUnidad) : "Selecciona una unidad"}
              </Text>
              <Ionicons name="chevron-down" size={18} color={C.textMuted} />
            </View>
          </Tap>

          <Text style={[styles_label, { marginTop: 14 }]}>Período * (YYYY-MM)</Text>
          <TextInput
            value={periodo}
            onChangeText={setPeriodo}
            placeholder="2026-06"
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
            style={inputStyle}
          />

          <Text style={[styles_label, { marginTop: 14 }]}>Fecha vencimiento * (YYYY-MM-DD)</Text>
          <TextInput
            value={fechaVencimiento}
            onChangeText={setFechaVencimiento}
            placeholder="2026-07-15"
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
            style={inputStyle}
          />

          <Text style={[styles_label, { marginTop: 14 }]}>Valor (sin descuento) *</Text>
          <TextInput
            value={valor}
            onChangeText={setValor}
            placeholder="360000"
            placeholderTextColor={C.textMuted}
            keyboardType="numeric"
            style={inputStyle}
          />

          <Text style={[styles_label, { marginTop: 14 }]}>Saldo a favor (opcional)</Text>
          <TextInput
            value={saldoAFavor}
            onChangeText={setSaldoAFavor}
            placeholder="0"
            placeholderTextColor={C.textMuted}
            keyboardType="numeric"
            style={inputStyle}
          />

          <Text style={[styles_label, { marginTop: 14 }]}>Valor con descuento (opcional)</Text>
          <TextInput
            value={totalConDescuento}
            onChangeText={setTotalConDescuento}
            placeholder="Ej: 140000"
            placeholderTextColor={C.textMuted}
            keyboardType="numeric"
            style={inputStyle}
          />

          <Text style={[styles_label, { marginTop: 14 }]}>Adjunto (PDF o imagen)</Text>
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
          {adjunto ? (
            <View style={[styles_attachRow, { marginBottom: 8 }]}>
              {adjunto.mimeType.startsWith("image/") ? (
                <Image source={{ uri: adjunto.uri }} style={styles_thumb} />
              ) : (
                <View style={styles_attachIcon}>
                  <Ionicons name="document-text" size={18} color={AuthUI.text} />
                </View>
              )}
              <Text style={styles_attachName} numberOfLines={1}>
                {adjunto.nombre}
              </Text>
              <Tap onPress={() => setAdjunto(null)} haptic={false}>
                <Ionicons name="close-circle" size={22} color={AuthUI.textMuted} />
              </Tap>
            </View>
          ) : null}

          {error ? (
            <Text style={{ color: C.danger, fontSize: 13, marginTop: 8 }}>{error}</Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
            <Tap
              style={[styles_footerBtn, styles_footerCancel]}
              onPress={() => {
                reset();
                onClose();
              }}
              disabled={saving}
            >
              <Text style={{ color: C.text, fontSize: 15, fontWeight: "600" }}>Cancelar</Text>
            </Tap>
            <Tap
              style={[styles_footerBtn, styles_footerPrimary]}
              onPress={submit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Crear</Text>
              )}
            </Tap>
          </View>
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={unidadPicker} onClose={() => setUnidadPicker(false)} maxHeight="80%">
        <View style={{ padding: 20, paddingBottom: 8 }}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
            Seleccionar unidad
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: C.border,
              backgroundColor: C.card,
              borderRadius: 12,
              paddingHorizontal: 12,
              marginBottom: 12,
            }}
          >
            <Ionicons name="search" size={16} color={C.textMuted} />
            <TextInput
              value={unidadSearch}
              onChangeText={setUnidadSearch}
              placeholder="Buscar apto o nombre…"
              placeholderTextColor={C.textMuted}
              style={{
                flex: 1,
                color: C.text,
                fontSize: 15,
                paddingVertical: 12,
                paddingHorizontal: 8,
                letterSpacing: 0,
                fontFamily: AuthUI.font.regular,
              }}
            />
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          {unidades === undefined ? (
            <ActivityIndicator color={C.textSoft} />
          ) : filteredUnidades.length === 0 ? (
            <Text style={{ color: C.textMuted, textAlign: "center", marginTop: 20 }}>
              Sin unidades
            </Text>
          ) : (
            filteredUnidades.map((u) => {
              const active = u._id === unidadId;
              return (
                <Pressable
                  key={u._id}
                  onPress={() => {
                    setUnidadId(u._id);
                    setUnidadPicker(false);
                    setUnidadSearch("");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 13,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: active ? C.bgSubtle : "transparent",
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: active ? "600" : "400", flex: 1 }}>
                    {unidadLabel(u)}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={18} color={C.navy} /> : null}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </BottomSheet>
    </>
  );
}

/* ── Modal de detalle (hoja suave) ───────────────────────────── */
function FacturaDetalleModal({
  detalle,
  condominioId,
  onClose,
}: {
  detalle: FacturaRow | null;
  condominioId?: Id<"condominios">;
  onClose: () => void;
}) {
  const condo = useQuery(
    api.condominios.get,
    condominioId ? { condominioId } : "skip",
  );
  const crearPago = useAction(api.pagos.crearPagoFactura);
  const [pagando, setPagando] = useState(false);

  const puedePagar =
    detalle != null &&
    (detalle.estado === "pendiente" ||
      detalle.estado === "vencida" ||
      detalle.estado === "abonada");

  async function openUrl(url: string) {
    const can = await Linking.canOpenURL(url);
    if (!can) {
      Alert.alert("No se pudo abrir", "No hay una app para abrir este enlace.");
      return;
    }
    await Linking.openURL(url);
  }

  async function pagar() {
    if (!detalle) return;
    const avalPortalUrl =
      condo?.avalPortalUrl?.trim() ||
      avalPortalFallback(condo?.subdomain) ||
      null;
    if (avalPortalUrl) {
      try {
        await openUrl(avalPortalUrl);
      } catch {
        Alert.alert("Error", "No se pudo abrir la pasarela de pago.");
      }
      return;
    }

    setPagando(true);
    try {
      const { redirectUrl } = await crearPago({ facturaId: detalle._id });
      await openUrl(redirectUrl);
    } catch (e) {
      Alert.alert(
        "No se pudo pagar",
        e instanceof Error ? e.message : "Inténtalo de nuevo en unos minutos.",
      );
    } finally {
      setPagando(false);
    }
  }

  return (
    <BottomSheet visible={detalle !== null} onClose={onClose} maxHeight="88%">
      {detalle && (
        <ScrollView
          bounces={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <View style={{ gap: 3, flex: 1, paddingRight: 12 }}>
              <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: "500" }}>Factura</Text>
              <Text style={{ color: C.text, fontSize: 22, fontWeight: "700" }}>
                {fmtPeriodo(detalle.periodo)}
              </Text>
              {detalle.residenteNombre && (
                <Text style={{ color: C.textSoft, fontSize: 14 }}>{detalle.residenteNombre}</Text>
              )}
              {detalle.apto && (
                <Text style={{ color: C.textMuted, fontSize: 13 }}>Apto {detalle.apto}</Text>
              )}
            </View>
            <GlassBadge
              label={ESTADO_LABEL[detalle.estado as Estado] ?? detalle.estado}
              tone={ESTADO_TONE[detalle.estado as Estado] ?? "neutral"}
            />
          </View>

          <View style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, marginBottom: 12, marginTop: 8 }}>
            {detalle.lineas.map((l, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                  borderBottomWidth: i < detalle.lineas.length - 1 ? 1 : 0,
                  borderColor: C.borderSoft,
                }}
              >
                <Text style={{ color: C.textSoft, fontSize: 13, flex: 1, paddingRight: 12 }}>
                  {l.concepto}
                </Text>
                <Text style={{ color: C.text, fontSize: 13, fontWeight: "600" }}>{cop(l.total)}</Text>
              </View>
            ))}
          </View>

          <View style={{ backgroundColor: C.bgSubtle, borderRadius: 12, padding: 16, gap: 10, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: C.textSoft, fontSize: 14 }}>Sin descuento (16-30)</Text>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>{cop(detalle.totalAPagar)}</Text>
            </View>
            {detalle.totalConDescuento ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="pricetag" size={14} color={C.success} />
                  <Text style={{ color: C.success, fontSize: 14, fontWeight: "600" }}>Con descuento (1-15)</Text>
                </View>
                <Text style={{ color: C.success, fontSize: 14, fontWeight: "700" }}>{cop(detalle.totalConDescuento)}</Text>
              </View>
            ) : null}
          </View>

          <View style={{ gap: 10 }}>
            {puedePagar ? (
              <GlassButton
                label={pagando ? "Abriendo pasarela…" : "Pagar"}
                icon={
                  pagando ? undefined : (
                    <Ionicons name="card-outline" size={18} color="#fff" />
                  )
                }
                onPress={pagando ? undefined : pagar}
                disabled={pagando || condo === undefined}
              />
            ) : null}
            {detalle.pdfUrl ? (
              <GlassButton
                label="Ver PDF"
                variant={puedePagar ? "secondary" : "primary"}
                icon={
                  <Ionicons
                    name="document-text-outline"
                    size={18}
                    color={puedePagar ? C.text : "#fff"}
                  />
                }
                onPress={async () => {
                  try {
                    await openUrl(detalle.pdfUrl!);
                  } catch {
                    Alert.alert("Error", "No se pudo abrir el archivo. Intenta de nuevo.");
                  }
                }}
              />
            ) : (
              <GlassButton label="PDF no disponible" variant="secondary" disabled />
            )}
            <GlassButton label="Cerrar" variant="secondary" onPress={onClose} />
          </View>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function chipStyle(active: boolean) {
  return {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: active ? C.text : C.border,
    backgroundColor: active ? C.text : C.card,
  };
}

/** Fallback Aval Pay Center por convenio (mismo patrón que VekinoWeb). */
function avalPortalFallback(subdomain?: string | null): string | null {
  if (!subdomain) return null;
  const key = subdomain.toLowerCase();
  const map: Record<string, string> = {
    arboleda:
      "https://www.avalpaycenter.com/wps/portal/portal-de-pagos/web/pagos-aval/resultado-busqueda/realizar-pago?idConv=00014484&origen=buscar",
    "ciudad-del-campo-ii":
      "https://www.avalpaycenter.com/wps/portal/portal-de-pagos/web/pagos-aval/resultado-busqueda/realizar-pago?idConv=00003230&origen=buscar",
    "condominio-ciudad-del-campo-ii":
      "https://www.avalpaycenter.com/wps/portal/portal-de-pagos/web/pagos-aval/resultado-busqueda/realizar-pago?idConv=00003230&origen=buscar",
  };
  return map[key] ?? null;
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
const styles_footerBtn = {
  flex: 1,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  paddingVertical: 14,
  borderRadius: 14,
};
const styles_footerCancel = {
  borderWidth: 1,
  borderColor: C.border,
  backgroundColor: "#FFFFFF",
};
const styles_footerPrimary = {
  backgroundColor: "#0E0E0F",
};
