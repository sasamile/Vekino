import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Switch,
  Alert,
  ScrollView,
  Share,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { GlassCard, GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";

type Punto = {
  titulo: string;
  descripcion?: string;
  votacionId?: Id<"votaciones">;
  hecho?: boolean;
};

type FiltroTabla = "todos" | "presentes" | "ausentes" | "votaron" | "pendientes";

const OPCIONES_DEFAULT = ["A favor", "En contra", "Abstención"];

function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const uncaught = raw.match(/Uncaught Error:\s*(.+?)(?:\n|$)/i);
  const plain = raw.match(/Error:\s*(.+?)(?:\n|\[|$)/i);
  let msg = (uncaught?.[1] ?? plain?.[1] ?? raw).trim();
  msg = msg
    .replace(/\[CONVEX[^\]]*\]/gi, "")
    .replace(/\[Request ID:[^\]]*\]/gi, "")
    .replace(/\s+at\s+handler[\s\S]*/i, "")
    .replace(/\s+/g, " ")
    .trim();
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

function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  const { theme } = useCondominio();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <Tap key={o.key} onPress={() => onChange(o.key)}>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: active ? theme.accent : AuthUI.border,
                backgroundColor: active ? theme.tabActiveBg : AuthUI.white,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: AuthUI.font.semibold,
                  color: active ? theme.accent : C.textMuted,
                }}
              >
                {o.label}
              </Text>
            </View>
          </Tap>
        );
      })}
    </ScrollView>
  );
}

/* ───────── Orden del día (admin) ───────── */

export function AdminOrdenTab({
  asambleaId,
  puntos,
}: {
  asambleaId: Id<"asambleas">;
  puntos: Punto[];
}) {
  const { theme } = useCondominio();
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const eliminar = useMutation(api.asambleas.eliminarPunto);
  const mover = useMutation(api.asambleas.moverPunto);
  const toggleHecho = useMutation(api.asambleas.togglePuntoHecho);
  const [sheet, setSheet] = useState<{ index: number | null } | null>(null);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);

  const votMap = useMemo(
    () => new Map((votaciones ?? []).map((v) => [v._id as string, v])),
    [votaciones],
  );
  const hechos = puntos.filter((p) => p.hecho).length;

  function confirmEliminar(index: number, tieneVotacion: boolean) {
    Alert.alert(
      "Eliminar punto",
      tieneVotacion
        ? "¿Eliminar este punto y su votación vinculada?"
        : "¿Eliminar este punto del orden del día?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => {
            setBusyIndex(index);
            eliminar({ asambleaId, index })
              .catch((e) => Alert.alert("Error", friendlyError(e)))
              .finally(() => setBusyIndex(null));
          },
        },
      ],
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: C.text, fontSize: 17, fontFamily: AuthUI.font.semibold }}>
          Orden del día
        </Text>
        <Text style={{ color: C.textMuted, fontSize: 11 }}>
          {puntos.length > 0 ? `${hechos}/${puntos.length} hechos` : "Editable"}
        </Text>
      </View>

      {puntos.length === 0 ? (
        <GlassCard style={{ padding: 20 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            Aún no hay puntos. Agrega el primero.
          </Text>
        </GlassCard>
      ) : (
        puntos.map((p, i) => {
          const vt = p.votacionId ? votMap.get(p.votacionId as string) : null;
          const hecho = !!p.hecho;
          return (
            <GlassCard
              key={`${p.titulo}-${i}`}
              style={{
                padding: 14,
                borderColor: hecho ? "#86EFAC" : AuthUI.border,
                backgroundColor: hecho ? "#F0FDF4" : AuthUI.white,
              }}
            >
              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Tap
                  onPress={() => {
                    setBusyIndex(i);
                    toggleHecho({ asambleaId, index: i })
                      .catch((e) => Alert.alert("Error", friendlyError(e)))
                      .finally(() => setBusyIndex(null));
                  }}
                  disabled={busyIndex === i}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: hecho ? C.success : AuthUI.border,
                      backgroundColor: hecho ? C.success : AuthUI.white,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {busyIndex === i ? (
                      <ActivityIndicator size="small" color={hecho ? "#fff" : C.textMuted} />
                    ) : hecho ? (
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    ) : (
                      <Text style={{ color: C.textMuted, fontFamily: AuthUI.font.bold, fontSize: 12 }}>
                        {i + 1}
                      </Text>
                    )}
                  </View>
                </Tap>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <Text
                      style={{
                        color: hecho ? C.textMuted : C.text,
                        fontFamily: AuthUI.font.semibold,
                        fontSize: 14,
                        flexShrink: 1,
                        textDecorationLine: hecho ? "line-through" : "none",
                      }}
                    >
                      {p.titulo}
                    </Text>
                    {hecho ? <GlassBadge label="Hecho" tone="green" /> : null}
                    {p.votacionId ? (
                      <GlassBadge
                        label={
                          vt?.estado === "abierta" ? "Votación abierta" : "Votación cerrada"
                        }
                        tone={vt?.estado === "abierta" ? "green" : "blue"}
                      />
                    ) : null}
                  </View>
                  {p.descripcion ? (
                    <Text style={{ color: C.textMuted, fontSize: 12 }}>{p.descripcion}</Text>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <Tap
                      onPress={() => {
                        setBusyIndex(i);
                        mover({ asambleaId, index: i, dir: -1 })
                          .catch((e) => Alert.alert("Error", friendlyError(e)))
                          .finally(() => setBusyIndex(null));
                      }}
                      disabled={i === 0 || busyIndex === i}
                    >
                      <View style={[styles.iconBtn, i === 0 && { opacity: 0.3 }]}>
                        <Ionicons name="chevron-up" size={18} color={C.textMuted} />
                      </View>
                    </Tap>
                    <Tap
                      onPress={() => {
                        setBusyIndex(i);
                        mover({ asambleaId, index: i, dir: 1 })
                          .catch((e) => Alert.alert("Error", friendlyError(e)))
                          .finally(() => setBusyIndex(null));
                      }}
                      disabled={i === puntos.length - 1 || busyIndex === i}
                    >
                      <View
                        style={[styles.iconBtn, i === puntos.length - 1 && { opacity: 0.3 }]}
                      >
                        <Ionicons name="chevron-down" size={18} color={C.textMuted} />
                      </View>
                    </Tap>
                    <Tap onPress={() => setSheet({ index: i })}>
                      <View style={styles.iconBtn}>
                        <Ionicons name="create-outline" size={18} color={C.textMuted} />
                      </View>
                    </Tap>
                    <Tap onPress={() => confirmEliminar(i, !!p.votacionId)}>
                      <View style={styles.iconBtn}>
                        {busyIndex === i ? (
                          <ActivityIndicator size="small" color={C.danger} />
                        ) : (
                          <Ionicons name="trash-outline" size={18} color={C.danger} />
                        )}
                      </View>
                    </Tap>
                  </View>
                </View>
              </View>
            </GlassCard>
          );
        })
      )}

      <Tap onPress={() => setSheet({ index: null })}>
        <View
          style={{
            height: 44,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: AuthUI.border,
            backgroundColor: AuthUI.white,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Ionicons name="add" size={18} color={C.text} />
          <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
            Agregar punto
          </Text>
        </View>
      </Tap>

      <BottomSheet visible={sheet !== null} onClose={() => setSheet(null)} maxHeight="85%">
        {sheet ? (
          <PuntoFormSheet
            asambleaId={asambleaId}
            punto={sheet.index != null ? (puntos[sheet.index] ?? null) : null}
            index={sheet.index}
            tieneVotacion={sheet.index != null ? !!puntos[sheet.index]?.votacionId : false}
            onClose={() => setSheet(null)}
          />
        ) : null}
      </BottomSheet>
    </View>
  );
}

function PuntoFormSheet({
  asambleaId,
  punto,
  index,
  tieneVotacion,
  onClose,
}: {
  asambleaId: Id<"asambleas">;
  punto: Punto | null;
  index: number | null;
  tieneVotacion: boolean;
  onClose: () => void;
}) {
  const { theme } = useCondominio();
  const agregar = useMutation(api.asambleas.agregarPunto);
  const editar = useMutation(api.asambleas.editarPunto);
  const toggleVot = useMutation(api.asambleas.toggleVotacionPunto);
  const esEdicion = index != null;
  const [titulo, setTitulo] = useState(punto?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(punto?.descripcion ?? "");
  const [conVotacion, setConVotacion] = useState(esEdicion ? tieneVotacion : false);
  const [opciones, setOpciones] = useState<string[]>([...OPCIONES_DEFAULT]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!titulo.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (esEdicion) {
        await editar({
          asambleaId,
          index,
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || undefined,
        });
        if (conVotacion !== tieneVotacion) {
          await toggleVot({
            asambleaId,
            index,
            opciones: opciones.map((o) => o.trim()).filter(Boolean),
          });
        }
      } else {
        await agregar({
          asambleaId,
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || undefined,
          habilitarVotacion: conVotacion,
          opciones: opciones.map((o) => o.trim()).filter(Boolean),
        });
      }
      onClose();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  const showOpciones = conVotacion && (!esEdicion || !tieneVotacion);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}
    >
      <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 17 }}>
        {esEdicion ? "Editar punto" : "Nuevo punto"}
      </Text>

      <View style={{ gap: 6 }}>
        <Text style={{ color: C.text, fontSize: 13, fontFamily: AuthUI.font.semibold }}>
          Título
        </Text>
        <TextInput
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Ej: Aprobación del presupuesto 2026"
          placeholderTextColor={AuthUI.placeholder}
          style={styles.input}
          autoFocus
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ color: C.text, fontSize: 13, fontFamily: AuthUI.font.semibold }}>
          Descripción <Text style={{ color: C.textMuted, fontFamily: AuthUI.font.regular }}>(opcional)</Text>
        </Text>
        <TextInput
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Detalle del punto"
          placeholderTextColor={AuthUI.placeholder}
          style={[styles.input, { minHeight: 72, textAlignVertical: "top", paddingTop: 12 }]}
          multiline
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 4,
        }}
      >
        <Text style={{ color: C.text, fontSize: 14, fontFamily: AuthUI.font.medium, flex: 1 }}>
          Con votación
        </Text>
        <Switch
          value={conVotacion}
          onValueChange={setConVotacion}
          trackColor={{ false: AuthUI.border, true: theme.accent }}
          thumbColor="#fff"
        />
      </View>

      {showOpciones ? (
        <View
          style={{
            gap: 10,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: AuthUI.border,
            backgroundColor: "rgba(14,14,15,0.03)",
          }}
        >
          <Text style={{ color: C.textMuted, fontSize: 12, fontFamily: AuthUI.font.semibold }}>
            Opciones de la votación
          </Text>
          {opciones.map((op, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                value={op}
                onChangeText={(t) =>
                  setOpciones((prev) => prev.map((x, idx) => (idx === i ? t : x)))
                }
                placeholder={`Opción ${i + 1}`}
                placeholderTextColor={AuthUI.placeholder}
                style={[styles.input, { flex: 1 }]}
              />
              {opciones.length > 2 ? (
                <Tap onPress={() => setOpciones((prev) => prev.filter((_, idx) => idx !== i))}>
                  <View style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color={C.danger} />
                  </View>
                </Tap>
              ) : null}
            </View>
          ))}
          <Tap onPress={() => setOpciones((prev) => [...prev, ""])}>
            <Text style={{ color: theme.accent, fontSize: 13, fontFamily: AuthUI.font.semibold }}>
              + Agregar opción
            </Text>
          </Tap>
        </View>
      ) : null}

      {error ? <Text style={{ color: C.danger, fontSize: 12 }}>{error}</Text> : null}

      <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
        <Tap onPress={onClose} style={{ flex: 1 }}>
          <View style={styles.secondaryBtn}>
            <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold }}>Cancelar</Text>
          </View>
        </Tap>
        <Tap onPress={guardar} disabled={busy} style={{ flex: 1 }}>
          <View style={[styles.primaryBtn, { opacity: busy ? 0.6 : 1 }]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold }}>
                {esEdicion ? "Guardar" : "Crear punto"}
              </Text>
            )}
          </View>
        </Tap>
      </View>
    </ScrollView>
  );
}

/* ───────── Votación en vivo (admin) ───────── */

export function AdminVotacionTab({
  asambleaId,
  estadoAsamblea,
}: {
  asambleaId: Id<"asambleas">;
  estadoAsamblea?: "programada" | "en_curso" | "finalizada" | "cancelada";
}) {
  const { theme } = useCondominio();
  const asamblea = useQuery(api.asambleas.get, { id: asambleaId });
  const estado = estadoAsamblea ?? asamblea?.estado;
  const enCurso = estado === "en_curso";
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const createVotacion = useMutation(api.asambleas.createVotacion);
  const cerrarHuerfanas = useMutation(api.asambleas.cerrarVotacionesSiInactiva);
  const toggle = useMutation(api.asambleas.toggleVotacion);
  const remove = useMutation(api.asambleas.removeVotacion);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pregunta, setPregunta] = useState("");
  const [opciones, setOpciones] = useState<string[]>([...OPCIONES_DEFAULT]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!estado || enCurso) return;
    void cerrarHuerfanas({ asambleaId }).catch(() => {});
  }, [asambleaId, estado, enCurso, cerrarHuerfanas]);

  const abiertas = useMemo(
    () => (votaciones ?? []).filter((v) => v.estado === "abierta"),
    [votaciones],
  );
  const cerradas = useMemo(
    () => (votaciones ?? []).filter((v) => v.estado === "cerrada"),
    [votaciones],
  );

  async function crear() {
    const ops = opciones.map((o) => o.trim()).filter(Boolean);
    if (!pregunta.trim() || ops.length < 2) {
      setError("Escribe la pregunta y al menos 2 opciones.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createVotacion({ asambleaId, pregunta: pregunta.trim(), opciones: ops });
      setPregunta("");
      setOpciones([...OPCIONES_DEFAULT]);
      setSheetOpen(false);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: C.text, fontSize: 17, fontFamily: AuthUI.font.semibold }}>
          Votación en vivo
        </Text>
        <Tap onPress={() => setSheetOpen(true)}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: AuthUI.border,
              backgroundColor: AuthUI.white,
            }}
          >
            <Ionicons name="add" size={16} color={C.text} />
            <Text style={{ color: C.text, fontSize: 12, fontFamily: AuthUI.font.semibold }}>
              Nueva pregunta
            </Text>
          </View>
        </Tap>
      </View>

      {!enCurso ? (
        <GlassCard style={{ padding: 14 }}>
          <Text style={{ color: C.textMuted, fontSize: 13 }}>
            La asamblea está {estado === "programada" ? "programada" : "inactiva"}. Puedes preparar
            preguntas (quedan cerradas). Solo se abren al público cuando pulses{" "}
            <Text style={{ fontFamily: AuthUI.font.semibold, color: C.text }}>Iniciar asamblea</Text>.
          </Text>
        </GlassCard>
      ) : null}

      {votaciones === undefined ? (
        <ActivityIndicator color={C.textSoft} />
      ) : abiertas.length === 0 ? (
        <GlassCard style={{ padding: 20 }}>
          <Text style={{ color: C.text, fontSize: 15, fontFamily: AuthUI.font.semibold, textAlign: "center" }}>
            No hay votación activa
          </Text>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center", marginTop: 6 }}>
            Abre una pregunta preparada o crea una nueva.
          </Text>
        </GlassCard>
      ) : (
        abiertas.map((vt) => (
          <VotacionAbiertaBoard
            key={vt._id}
            asambleaId={asambleaId}
            votacionId={vt._id}
            pregunta={vt.pregunta}
            enCurso={enCurso}
          />
        ))
      )}

      {cerradas.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: C.textMuted, fontSize: 12, fontFamily: AuthUI.font.semibold }}>
            Preguntas preparadas / cerradas
          </Text>
          {cerradas.map((vt) => (
            <GlassCard key={vt._id} style={{ padding: 14, gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ color: C.text, fontSize: 14, flex: 1 }}>{vt.pregunta}</Text>
                <GlassBadge label="Cerrada" tone="neutral" />
              </View>
              <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
                <Tap
                  onPress={() =>
                    toggle({ id: vt._id }).catch((e) => Alert.alert("Error", friendlyError(e)))
                  }
                  disabled={!enCurso}
                >
                  <View style={[styles.iconBtn, !enCurso ? { opacity: 0.35 } : null]}>
                    <Ionicons name="lock-open-outline" size={18} color={C.textMuted} />
                  </View>
                </Tap>
                <Tap
                  onPress={() => {
                    Alert.alert("Eliminar votación", "¿Eliminar esta votación?", [
                      { text: "Cancelar", style: "cancel" },
                      {
                        text: "Eliminar",
                        style: "destructive",
                        onPress: () =>
                          remove({ id: vt._id }).catch((e) =>
                            Alert.alert("Error", friendlyError(e)),
                          ),
                      },
                    ]);
                  }}
                >
                  <View style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color={C.danger} />
                  </View>
                </Tap>
              </View>
            </GlassCard>
          ))}
        </View>
      ) : null}

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} maxHeight="85%">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12 }}
        >
          <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 17 }}>
            Nueva pregunta
          </Text>
          <TextInput
            value={pregunta}
            onChangeText={setPregunta}
            placeholder="¿Se aprueba…?"
            placeholderTextColor={AuthUI.placeholder}
            style={styles.input}
            autoFocus
          />
          <Text style={{ color: C.textMuted, fontSize: 12, fontFamily: AuthUI.font.semibold }}>
            Opciones
          </Text>
          {opciones.map((op, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                value={op}
                onChangeText={(t) =>
                  setOpciones((prev) => prev.map((x, idx) => (idx === i ? t : x)))
                }
                placeholder={`Opción ${i + 1}`}
                placeholderTextColor={AuthUI.placeholder}
                style={[styles.input, { flex: 1 }]}
              />
              {opciones.length > 2 ? (
                <Tap onPress={() => setOpciones((prev) => prev.filter((_, idx) => idx !== i))}>
                  <View style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color={C.danger} />
                  </View>
                </Tap>
              ) : null}
            </View>
          ))}
          <Tap onPress={() => setOpciones((prev) => [...prev, ""])}>
            <Text style={{ color: theme.accent, fontSize: 13, fontFamily: AuthUI.font.semibold }}>
              + Agregar opción
            </Text>
          </Tap>
          {error ? <Text style={{ color: C.danger, fontSize: 12 }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
            <Tap onPress={() => setSheetOpen(false)} style={{ flex: 1 }}>
              <View style={styles.secondaryBtn}>
                <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold }}>Cancelar</Text>
              </View>
            </Tap>
            <Tap onPress={crear} disabled={busy} style={{ flex: 1 }}>
              <View style={[styles.primaryBtn, { opacity: busy ? 0.6 : 1 }]}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold }}>Crear</Text>
                )}
              </View>
            </Tap>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

function UnidadChip({ numero, voto }: { numero: string; voto: boolean }) {
  return (
    <View
      style={{
        minWidth: 44,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: voto ? "#86EFAC" : AuthUI.border,
        backgroundColor: voto ? "#DCFCE7" : AuthUI.white,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: voto ? "#166534" : C.textMuted,
          fontFamily: AuthUI.font.semibold,
          fontSize: 13,
          fontVariant: ["tabular-nums"],
        }}
      >
        {numero}
      </Text>
    </View>
  );
}

/** Tablero secreto: barras + chips de unidad (sin revelar opción). */
function VotacionAbiertaBoard({
  asambleaId,
  votacionId,
  pregunta,
  enCurso,
}: {
  asambleaId: Id<"asambleas">;
  votacionId: Id<"votaciones">;
  pregunta: string;
  enCurso: boolean;
}) {
  const { theme } = useCondominio();
  const res = useQuery(api.asambleas.resultadosVotacion, { votacionId });
  const det = useQuery(api.asambleas.asistentesDetallado, { asambleaId });
  const toggle = useMutation(api.asambleas.toggleVotacion);
  const [busy, setBusy] = useState(false);

  const presentes = useMemo(
    () => (det?.filas ?? []).filter((f) => f.presente),
    [det?.filas],
  );
  const votaron = useMemo(
    () =>
      (det?.filas ?? [])
        .filter((f) => f.votos[votacionId as string] != null)
        .map((f) => f.unidadNumero)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [det?.filas, votacionId],
  );
  const pendientes = useMemo(
    () =>
      presentes
        .filter((f) => f.votos[votacionId as string] == null)
        .map((f) => f.unidadNumero)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [presentes, votacionId],
  );

  const totalCoef = res ? res.opciones.reduce((s, o) => s + o.coeficiente, 0) : 0;
  const totalVotos = res?.totalVotos ?? votaron.length;
  const maxCoef = Math.max(1, ...(res?.opciones.map((o) => o.coeficiente) ?? [1]));

  return (
    <GlassCard style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <GlassBadge label="Abierta" tone="green" />
            <Text style={{ color: C.textMuted, fontSize: 11 }}>
              {totalVotos} unidad{totalVotos === 1 ? "" : "es"} votaron
              {pendientes.length > 0 ? ` · ${pendientes.length} pend.` : ""}
            </Text>
          </View>
          <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 16 }}>
            {pregunta}
          </Text>
        </View>
        {enCurso ? (
          <Tap
            onPress={() => {
              setBusy(true);
              toggle({ id: votacionId })
                .catch((e) => Alert.alert("Error", friendlyError(e)))
                .finally(() => setBusy(false));
            }}
            disabled={busy}
          >
            <View style={styles.iconBtn}>
              {busy ? (
                <ActivityIndicator size="small" color={C.textMuted} />
              ) : (
                <Ionicons name="lock-closed-outline" size={18} color={C.textMuted} />
              )}
            </View>
          </Tap>
        ) : null}
      </View>

      {res ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: C.textMuted, fontSize: 11, fontFamily: AuthUI.font.semibold }}>
            Progreso
          </Text>
          {res.opciones.map((op, i) => {
            const pct = totalCoef > 0 ? Math.round((op.coeficiente / totalCoef) * 100) : 0;
            return (
              <View key={i} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{op.texto}</Text>
                  <Text style={{ color: C.textMuted, fontSize: 11, fontVariant: ["tabular-nums"] }}>
                    {op.votos} und · {pct}%
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      backgroundColor: theme.accent,
                      borderRadius: 999,
                    }}
                  />
                </View>
              </View>
            );
          })}
          <Text style={{ color: C.textMuted, fontSize: 11, fontFamily: AuthUI.font.semibold, marginTop: 4 }}>
            Gráfica
          </Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", height: 110, gap: 8 }}>
            {res.opciones.map((op, i) => {
              const barH = Math.max(8, Math.round((op.coeficiente / maxCoef) * 72));
              const pct = totalCoef > 0 ? Math.round((op.coeficiente / totalCoef) * 100) : 0;
              return (
                <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                  <Text style={{ color: C.text, fontSize: 10, fontFamily: AuthUI.font.semibold }}>{pct}%</Text>
                  <View
                    style={{
                      width: 28,
                      height: barH,
                      backgroundColor: theme.accent,
                      borderTopLeftRadius: 6,
                      borderTopRightRadius: 6,
                      opacity: 0.85,
                    }}
                  />
                  <Text numberOfLines={2} style={{ color: C.textMuted, fontSize: 9, textAlign: "center" }}>
                    {op.texto}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <ActivityIndicator color={C.textSoft} size="small" />
      )}

      <View style={{ gap: 10 }}>
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#86EFAC",
            backgroundColor: "#F0FDF4",
            padding: 12,
            gap: 8,
          }}
        >
          <Text style={{ color: C.text, fontSize: 13, fontFamily: AuthUI.font.semibold }}>
            Ya votaron ({votaron.length})
          </Text>
          {votaron.length === 0 ? (
            <Text style={{ color: C.textMuted, fontSize: 12 }}>Nadie ha votado aún.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {votaron.map((n) => (
                <UnidadChip key={n} numero={n} voto />
              ))}
            </View>
          )}
        </View>
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: AuthUI.border,
            backgroundColor: AuthUI.white,
            padding: 12,
            gap: 8,
          }}
        >
          <Text style={{ color: C.text, fontSize: 13, fontFamily: AuthUI.font.semibold }}>
            Pendientes ({pendientes.length})
          </Text>
          {pendientes.length === 0 ? (
            <Text style={{ color: C.textMuted, fontSize: 12 }}>Todas las presentes ya votaron.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {pendientes.map((n) => (
                <UnidadChip key={n} numero={n} voto={false} />
              ))}
            </View>
          )}
        </View>
      </View>
    </GlassCard>
  );
}

/** Admin: por pregunta, qué unidad votó qué (no público). */
export function AdminDetalleVotosTab({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const { theme } = useCondominio();
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const det = useQuery(api.asambleas.asistentesDetallado, { asambleaId });
  const [sel, setSel] = useState<Id<"votaciones"> | null>(null);

  useEffect(() => {
    if (!sel && votaciones && votaciones.length > 0) setSel(votaciones[0]!._id);
  }, [votaciones, sel]);

  const vt = (votaciones ?? []).find((v) => v._id === sel);
  const filas = useMemo(() => {
    if (!vt || !det) return [];
    return det.filas
      .filter((f) => f.votos[vt._id as string] != null)
      .map((f) => {
        const idx = f.votos[vt._id as string] as number;
        return {
          unidad: f.unidadNumero,
          opcion: vt.opciones[idx]?.texto ?? `Opción ${idx + 1}`,
          quien: f.asistente ?? f.propietario ?? "—",
        };
      })
      .sort((a, b) => a.unidad.localeCompare(b.unidad, undefined, { numeric: true }));
  }, [vt, det]);

  if (votaciones === undefined) return <ActivityIndicator color={C.textSoft} />;
  if (votaciones.length === 0) {
    return (
      <GlassCard style={{ padding: 20 }}>
        <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
          Aún no hay votaciones.
        </Text>
      </GlassCard>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: C.text, fontSize: 17, fontFamily: AuthUI.font.semibold }}>
        Detalle de votos
      </Text>
      <Text style={{ color: C.textMuted, fontSize: 12 }}>
        Solo administración. No proyectar en pantalla pública.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {votaciones.map((v, i) => {
          const active = sel === v._id;
          return (
            <Tap key={v._id} onPress={() => setSel(v._id)}>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: active ? theme.accent : AuthUI.white,
                  borderWidth: 1,
                  borderColor: active ? theme.accent : AuthUI.border,
                }}
              >
                <Text
                  style={{
                    color: active ? "#fff" : C.textMuted,
                    fontSize: 12,
                    fontFamily: AuthUI.font.semibold,
                  }}
                >
                  P{i + 1}: {v.pregunta.length > 22 ? `${v.pregunta.slice(0, 22)}…` : v.pregunta}
                </Text>
              </View>
            </Tap>
          );
        })}
      </ScrollView>
      {filas.length === 0 ? (
        <GlassCard style={{ padding: 16 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            Nadie ha votado en esta pregunta.
          </Text>
        </GlassCard>
      ) : (
        filas.map((r) => (
          <GlassCard key={r.unidad} style={{ padding: 14, gap: 4 }}>
            <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 15 }}>
              Unidad {r.unidad}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 12 }}>{formatPersona(r.quien)}</Text>
            <Text style={{ color: C.text, fontSize: 13 }}>{r.opcion}</Text>
          </GlassCard>
        ))
      )}
    </View>
  );
}

/* ───────── Tabla de asistencia (admin) ───────── */

export function AdminTablaTab({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const { theme } = useCondominio();
  const det = useQuery(api.asambleas.asistentesDetallado, { asambleaId });
  const [filtro, setFiltro] = useState<FiltroTabla>("todos");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const filas = det?.filas ?? [];

  const conteos = useMemo(() => {
    const presentes = filas.filter((f) => f.presente).length;
    const votaron = filas.filter((f) => Object.keys(f.votos).length > 0).length;
    return {
      todos: filas.length,
      presentes,
      ausentes: filas.length - presentes,
      votaron,
      pendientes: presentes - votaron,
    };
  }, [filas]);

  const visibles = useMemo(
    () =>
      filas.filter((f) => {
        const voto = Object.keys(f.votos).length > 0;
        if (filtro === "presentes") return f.presente;
        if (filtro === "ausentes") return !f.presente;
        if (filtro === "votaron") return voto;
        if (filtro === "pendientes") return f.presente && !voto;
        return true;
      }),
    [filas, filtro],
  );

  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = visibles.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filtro]);

  function asistenciaBadge(f: (typeof filas)[number]) {
    if (f.presente) {
      return (
        <GlassBadge label={f.porPoder ? "Por poder" : "Presente"} tone={f.porPoder ? "blue" : "green"} />
      );
    }
    if (f.tienePoder) {
      return <GlassBadge label="Poder" tone="neutral" />;
    }
    return <GlassBadge label="Ausente" tone="red" />;
  }

  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: C.text, fontSize: 17, fontFamily: AuthUI.font.semibold }}>
        Registro detallado
      </Text>
      <Text style={{ color: C.textMuted, fontSize: 12 }}>
        El contenido del voto está en la pestaña Detalle votos.
      </Text>

      <FilterChips
        value={filtro}
        onChange={setFiltro}
        options={[
          { key: "todos", label: `Todos (${conteos.todos})` },
          { key: "presentes", label: `Presentes (${conteos.presentes})` },
          { key: "votaron", label: `Votaron (${conteos.votaron})` },
          { key: "pendientes", label: `Pendientes (${conteos.pendientes})` },
          { key: "ausentes", label: `Ausentes (${conteos.ausentes})` },
        ]}
      />

      {det === undefined ? (
        <ActivityIndicator color={C.textSoft} />
      ) : visibles.length === 0 ? (
        <GlassCard style={{ padding: 20 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            Sin unidades para este filtro.
          </Text>
        </GlassCard>
      ) : (
        <>
          {pageRows.map((f) => (
            <GlassCard key={f.unidadId} style={{ padding: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 15 }}>
                    Unidad {f.unidadNumero}
                  </Text>
                  <Text style={{ color: C.textMuted, fontSize: 13 }}>
                    {formatPersona(f.propietario)}
                  </Text>
                </View>
                {asistenciaBadge(f)}
              </View>
              {f.representa ? (
                <Text style={{ color: C.textMuted, fontSize: 12 }}>
                  Apoderado: {formatPersona(f.representa)}
                </Text>
              ) : null}
              {(f.tambienRepresenta?.length ?? 0) > 0 ? (
                <Text style={{ color: theme.accent, fontSize: 12 }}>
                  También representa: {(f.tambienRepresenta ?? []).join(", ")}
                </Text>
              ) : null}
              {f.asistente && f.asistente !== f.propietario ? (
                <Text style={{ color: C.textMuted, fontSize: 12 }}>
                  Asistente: {formatPersona(f.asistente)}
                </Text>
              ) : null}
              {f.presente ? (
                <Text style={{ color: C.textMuted, fontSize: 12 }}>
                  {Object.keys(f.votos).length > 0 ? "Ya votó en alguna pregunta" : "Sin votos aún"}
                </Text>
              ) : null}
            </GlassCard>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <Text style={{ color: C.textMuted, fontSize: 12 }}>
              {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, visibles.length)} de{" "}
              {visibles.length}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Tap onPress={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1}>
                <View style={[styles.secondaryBtn, { paddingHorizontal: 12, opacity: pageSafe <= 1 ? 0.4 : 1 }]}>
                  <Text style={{ color: C.text, fontSize: 12, fontFamily: AuthUI.font.semibold }}>Ant.</Text>
                </View>
              </Tap>
              <Tap
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
              >
                <View
                  style={[
                    styles.secondaryBtn,
                    { paddingHorizontal: 12, opacity: pageSafe >= totalPages ? 0.4 : 1 },
                  ]}
                >
                  <Text style={{ color: C.text, fontSize: 12, fontFamily: AuthUI.font.semibold }}>Sig.</Text>
                </View>
              </Tap>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

/* ───────── Poderes (admin) ───────── */

export function AdminPoderesTab({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const poderes = useQuery(api.asambleas.listPoderes, { asambleaId });
  const paquete = useQuery(api.asambleas.paqueteAuditoria, { asambleaId });
  const responder = useMutation(api.asambleas.responderPoder);
  const revocar = useMutation(api.asambleas.revocarPoder);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  async function validar(poderId: Id<"poderesAsamblea">) {
    setBusyId(poderId);
    try {
      await responder({ poderId, aceptar: true });
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function revocarPoder(poderId: Id<"poderesAsamblea">) {
    Alert.alert("Revocar poder", "¿Revocar este poder otorgado?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Revocar",
        style: "destructive",
        onPress: () => {
          setBusyId(poderId);
          revocar({ poderId })
            .catch((e) => Alert.alert("Error", friendlyError(e)))
            .finally(() => setBusyId(null));
        },
      },
    ]);
  }

  async function compartirListado() {
    if (!paquete || paquete.poderes.length === 0) {
      Alert.alert("Sin datos", "No hay poderes para exportar.");
      return;
    }
    setExportBusy(true);
    try {
      const lines = [
        `Poderes — ${paquete.asamblea.titulo}`,
        `Condominio: ${paquete.condominioNombre}`,
        `Fecha: ${paquete.asamblea.fecha} ${paquete.asamblea.hora}`,
        "",
        "Unidad | Otorgante | Apoderado | Tipo | Validado | Código | Documento",
        ...paquete.poderes.map(
          (p) =>
            `${p.unidadNumero} | ${p.otorganteNombre} | ${p.representanteNombre} | ${p.representanteTipo} | ${p.validado ? "Sí" : "No"} | ${p.codigoAcceso} | ${p.apoderadoDocumento ?? "—"}`,
        ),
      ];
      await Share.share({
        title: `Poderes ${paquete.asamblea.titulo}`,
        message: lines.join("\n"),
      });
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setExportBusy(false);
    }
  }

  async function compartirActa() {
    if (!paquete) {
      Alert.alert("Espera", "Aún se cargan los datos de auditoría.");
      return;
    }
    setExportBusy(true);
    try {
      const resLines = paquete.resultados
        .filter(
          (r) =>
            r.estado === "abierta" ||
            r.abiertaAlgunaVez ||
            r.opciones.some((o) => o.votos > 0),
        )
        .map((r, i) => {
          const totalCoef = r.opciones.reduce((s, o) => s + o.coeficiente, 0);
          const ganadora = [...r.opciones].sort((a, b) => b.coeficiente - a.coeficiente)[0];
          const opts = r.opciones
            .map((o) => {
              const pct = totalCoef > 0 ? Math.round((o.coeficiente / totalCoef) * 100) : 0;
              return `  - ${o.texto}: ${o.votos} und · coef ${o.coeficiente} (${pct}%)`;
            })
            .join("\n");
          return `${i + 1}. ${r.pregunta}\nEstado: ${r.estado}${ganadora ? ` · Líder: ${ganadora.texto}` : ""}\n${opts}`;
        });

      const lines = [
        `Acta de auditoría — ${paquete.asamblea.titulo}`,
        paquete.condominioNombre,
        `${paquete.asamblea.tipo} · ${paquete.asamblea.modalidad} · ${paquete.asamblea.fecha} ${paquete.asamblea.hora}`,
        "",
        `PODERES (${paquete.poderes.length})`,
        ...paquete.poderes.map(
          (p) =>
            `· U.${p.unidadNumero}: ${p.otorganteNombre} → ${p.representanteNombre} (${p.validado ? "validado" : "pendiente"})`,
        ),
        "",
        `RESULTADOS (${resLines.length})`,
        ...(resLines.length > 0 ? resLines : ["Sin votaciones con resultados."]),
        "",
        `Generado: ${new Date(paquete.generadoEn).toLocaleString("es-CO")}`,
      ];
      await Share.share({
        title: `Acta ${paquete.asamblea.titulo}`,
        message: lines.join("\n"),
      });
    } catch (e) {
      Alert.alert("Error", friendlyError(e));
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: C.text, fontSize: 17, fontFamily: AuthUI.font.semibold }}>
        Poderes
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Tap
          onPress={compartirListado}
          disabled={exportBusy || !paquete || (poderes?.length ?? 0) === 0}
        >
          <View style={[styles.secondaryBtn, { paddingHorizontal: 12 }]}>
            {exportBusy ? (
              <ActivityIndicator size="small" color={C.textMuted} />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="share-outline" size={16} color={C.text} />
                <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 12 }}>
                  Compartir listado
                </Text>
              </View>
            )}
          </View>
        </Tap>
        <Tap onPress={compartirActa} disabled={exportBusy || !paquete}>
          <View style={[styles.secondaryBtn, { paddingHorizontal: 12 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="document-text-outline" size={16} color={C.text} />
              <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 12 }}>
                Compartir acta
              </Text>
            </View>
          </View>
        </Tap>
      </View>

      <Text style={{ color: C.textMuted, fontSize: 12 }}>
        Para auditoría: comparte el listado o el acta (poderes + resultados). En la web admin también
        puedes descargar CSV, ZIP de documentos y PDF.
      </Text>

      {poderes === undefined ? (
        <ActivityIndicator color={C.textSoft} />
      ) : poderes.length === 0 ? (
        <GlassCard style={{ padding: 20 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            No hay poderes otorgados en esta asamblea.
          </Text>
        </GlassCard>
      ) : (
        poderes.map((p) => (
          <GlassCard key={p._id} style={{ padding: 16, gap: 10 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 14 }}>
                Unidad {p.unidadNumero}
              </Text>
              <Text style={{ color: C.text, fontSize: 13 }}>
                {formatPersona(p.otorganteNombre)} → {formatPersona(p.representanteNombre)}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 }}>
                <GlassBadge
                  label={p.validado ? "Validado" : "Pendiente"}
                  tone={p.validado ? "green" : "yellow"}
                />
                <GlassBadge
                  label={
                    p.representanteTipo === "propietario"
                      ? "Apoderado: propietario"
                      : "Apoderado: externo"
                  }
                  tone={p.representanteTipo === "propietario" ? "blue" : "neutral"}
                />
                {p.codigoAcceso ? (
                  <Text style={{ color: C.textMuted, fontSize: 12 }}>
                    Código{" "}
                    <Text style={{ fontFamily: AuthUI.font.bold, color: C.text }}>
                      {p.codigoAcceso}
                    </Text>
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {p.documentoUrl ? (
                <Tap
                  onPress={() => {
                    Linking.openURL(p.documentoUrl!).catch(() =>
                      Alert.alert("Error", "No se pudo abrir el documento."),
                    );
                  }}
                >
                  <View style={styles.secondaryBtn}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="document-outline" size={16} color={C.text} />
                      <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
                        Ver doc.
                      </Text>
                    </View>
                  </View>
                </Tap>
              ) : null}
              {!p.validado ? (
                <Tap
                  onPress={() => validar(p._id)}
                  disabled={busyId === p._id}
                  style={{ flex: 1 }}
                >
                  <View
                    style={[
                      styles.primaryBtn,
                      { opacity: busyId === p._id ? 0.6 : 1 },
                    ]}
                  >
                    {busyId === p._id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name="checkmark" size={16} color="#fff" />
                        <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
                          Validar
                        </Text>
                      </View>
                    )}
                  </View>
                </Tap>
              ) : null}
              <Tap
                onPress={() => revocarPoder(p._id)}
                disabled={busyId === p._id}
                style={{ flex: p.validado && !p.documentoUrl ? 1 : undefined }}
              >
                <View style={[styles.secondaryBtn, p.validado && !p.documentoUrl && { flex: 1 }]}>
                  {busyId === p._id ? (
                    <ActivityIndicator color={C.textMuted} />
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="close-circle-outline" size={16} color={C.danger} />
                      <Text style={{ color: C.danger, fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
                        Revocar
                      </Text>
                    </View>
                  )}
                </View>
              </Tap>
            </View>
          </GlassCard>
        ))
      )}
    </View>
  );
}

/* ───────── Representantes (admin) ───────── */

export function AdminRepresentantesTab({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const poderes = useQuery(api.asambleas.listPoderes, { asambleaId });

  const reps = useMemo(() => {
    const map = new Map<string, { nombre: string; unidades: string[] }>();
    for (const p of poderes ?? []) {
      if (!p.validado) continue;
      const key = (p.representanteUserId ?? p.representanteNombre) as string;
      const entry = map.get(key) ?? { nombre: p.representanteNombre, unidades: [] };
      entry.unidades.push(p.unidadNumero);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [poderes]);

  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: C.text, fontSize: 17, fontFamily: AuthUI.font.semibold }}>
        Representantes
      </Text>

      {poderes === undefined ? (
        <ActivityIndicator color={C.textSoft} />
      ) : reps.length === 0 ? (
        <GlassCard style={{ padding: 20 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            Nadie representa unidades por poder validado todavía.
          </Text>
        </GlassCard>
      ) : (
        reps.map((r, i) => (
          <GlassCard key={`${r.nombre}-${i}`} style={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 15, flex: 1 }}>
                {formatPersona(r.nombre)}
              </Text>
              <GlassBadge
                label={`${r.unidades.length} unidad${r.unidades.length === 1 ? "" : "es"}`}
                tone="blue"
              />
            </View>
            <Text style={{ color: C.textMuted, fontSize: 13 }}>
              Representa: {r.unidades.join(", ")}
            </Text>
          </GlassCard>
        ))
      )}
    </View>
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
  primaryBtn: {
    height: 44,
    borderRadius: 11,
    backgroundColor: AuthUI.text,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryBtn: {
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: AuthUI.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
