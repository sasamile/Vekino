import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TextInput,
  Share,
  Pressable,
  ScrollView,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard, GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";
import { AsistenciaTab } from "@/components/asambleas/asistencia-tab";
import { QuorumBar } from "@/components/asambleas/quorum-bar";
import {
  AdminOrdenTab,
  AdminVotacionTab,
  AdminTablaTab,
  AdminDetalleVotosTab,
  AdminPoderesTab,
  AdminRepresentantesTab,
} from "@/components/asambleas/admin-panels";

type TabKey =
  | "poderes"
  | "orden"
  | "votar"
  | "detalle"
  | "tabla"
  | "reps"
  | "asistencia"
  | "resultados";

const TABS_RESIDENTE: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "poderes", label: "Poderes", icon: "person-add-outline" },
  { key: "orden", label: "Orden", icon: "list-outline" },
  { key: "votar", label: "En vivo", icon: "radio-outline" },
  { key: "asistencia", label: "Asist.", icon: "people-outline" },
  { key: "resultados", label: "Result.", icon: "bar-chart-outline" },
];

const TABS_ADMIN: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "poderes", label: "Poderes", icon: "person-add-outline" },
  { key: "orden", label: "Orden", icon: "list-outline" },
  { key: "votar", label: "En vivo", icon: "radio-outline" },
  { key: "detalle", label: "Detalle", icon: "clipboard-outline" },
  { key: "tabla", label: "Tabla", icon: "grid-outline" },
  { key: "reps", label: "Reps", icon: "people-outline" },
  { key: "asistencia", label: "Asist.", icon: "qr-code-outline" },
  { key: "resultados", label: "Result.", icon: "bar-chart-outline" },
];

export default function AsambleaDetalleScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const asambleaId = id as Id<"asambleas">;
  const { condominioId, theme, canManage, isSuperadmin } = useCondominio();
  const me = useQuery(api.users.me);
  const a = useQuery(api.asambleas.get, asambleaId ? { id: asambleaId } : "skip");
  const mi = useQuery(api.asambleas.miParticipacion, asambleaId ? { asambleaId } : "skip");
  const setEstado = useMutation(api.asambleas.setEstado);
  const [tab, setTab] = useState<TabKey>("poderes");
  const [estadoBusy, setEstadoBusy] = useState(false);
  const seededTab = useRef(false);

  // Roles de gestión de asamblea (alineados con WRITE_ROLES del backend).
  const ASAMBLEA_ROLES = ["administrador", "junta_directiva", "representante_asamblea"];
  const condoForRoles = a?.condominioId ?? condominioId;
  const membershipRoles =
    me?.memberships?.find((m) => m.condominioId === condoForRoles)?.roles ?? [];
  const isAdmin =
    isSuperadmin ||
    canManage ||
    membershipRoles.some((r) => ASAMBLEA_ROLES.includes(r));
  const poderPublicoAbierto = a?.estado === "programada";
  const tabs = isAdmin
    ? TABS_ADMIN
    : poderPublicoAbierto
      ? TABS_RESIDENTE
      : TABS_RESIDENTE.filter((t) => t.key !== "poderes");
  const puntos =
    a?.ordenDia ?? a?.agenda?.map((t) => ({ titulo: t, descripcion: undefined, votacionId: undefined })) ?? [];

  useEffect(() => {
    if (!a || seededTab.current) return;
    seededTab.current = true;
    if (a.estado === "en_curso") setTab("votar");
    else if (a.estado === "finalizada") setTab("resultados");
  }, [a]);

  // Si la asamblea inicia y el residente estaba en Poderes, sacar de esa tab.
  useEffect(() => {
    if (!a || isAdmin) return;
    if (a.estado !== "programada" && tab === "poderes") {
      setTab(a.estado === "finalizada" ? "resultados" : "votar");
    }
  }, [a, isAdmin, tab]);

  async function cambiarEstado(estado: "en_curso" | "finalizada" | "cancelada") {
    if (!a) return;
    setEstadoBusy(true);
    try {
      await setEstado({ id: a._id, estado });
    } catch {
      /* noop */
    } finally {
      setEstadoBusy(false);
    }
  }

  if (!asambleaId) {
    return (
      <Section title="Asamblea">
        <Text style={{ color: C.textMuted }}>Asamblea no válida.</Text>
      </Section>
    );
  }

  if (a === undefined) {
    return (
      <Section title="Asamblea">
        <ActivityIndicator color={C.textSoft} style={{ marginTop: 30 }} />
      </Section>
    );
  }

  if (a === null) {
    return (
      <Section title="Asamblea">
        <GlassCard style={{ padding: 28, alignItems: "center" }}>
          <Text style={{ color: C.textMuted }}>Asamblea no encontrada.</Text>
        </GlassCard>
      </Section>
    );
  }

  return (
    <Section title={a.titulo}>
      <View style={{ marginTop: -8, marginBottom: 10, gap: 6 }}>
        <Text style={{ color: C.textMuted, fontSize: 13 }}>
          {a.fecha} · {a.hora} · {a.modalidad}
          {a.estado === "en_curso" ? " · En vivo" : ""}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <GlassBadge
            label={
              a.estado === "programada"
                ? "Programada"
                : a.estado === "en_curso"
                  ? "En curso"
                  : a.estado === "finalizada"
                    ? "Finalizada"
                    : "Cancelada"
            }
            tone={
              a.estado === "en_curso"
                ? "yellow"
                : a.estado === "finalizada"
                  ? "green"
                  : a.estado === "cancelada"
                    ? "red"
                    : "blue"
            }
          />
        </View>

        {isAdmin ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {a.estado === "programada" ? (
              <Tap onPress={() => cambiarEstado("en_curso")} disabled={estadoBusy}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 11,
                    backgroundColor: AuthUI.text,
                    opacity: estadoBusy ? 0.6 : 1,
                  }}
                >
                  <Ionicons name="play" size={14} color="#fff" />
                  <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
                    Iniciar asamblea
                  </Text>
                </View>
              </Tap>
            ) : null}
            {a.estado === "en_curso" ? (
              <Tap onPress={() => cambiarEstado("finalizada")} disabled={estadoBusy}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 11,
                    backgroundColor: C.success,
                    opacity: estadoBusy ? 0.6 : 1,
                  }}
                >
                  <Ionicons name="checkmark-circle" size={14} color="#fff" />
                  <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
                    Finalizar
                  </Text>
                </View>
              </Tap>
            ) : null}
            {a.estado === "programada" || a.estado === "en_curso" ? (
              <Tap onPress={() => cambiarEstado("cancelada")} disabled={estadoBusy}>
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 11,
                    borderWidth: 1,
                    borderColor: AuthUI.border,
                    backgroundColor: AuthUI.white,
                  }}
                >
                  <Text style={{ color: C.danger, fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
                    Cancelar
                  </Text>
                </View>
              </Tap>
            ) : null}
          </View>
        ) : null}
      </View>

      <QuorumBar asambleaId={asambleaId} />

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 4,
          padding: 4,
          marginBottom: 16,
          borderRadius: 14,
          backgroundColor: AuthUI.white,
          borderWidth: 1,
          borderColor: AuthUI.border,
        }}
      >
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <Tap key={t.key} onPress={() => setTab(t.key)} style={{ flexGrow: 1, flexBasis: 0, minWidth: 64 }}>
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  paddingVertical: 8,
                  paddingHorizontal: 6,
                  borderRadius: 10,
                  backgroundColor: active ? theme.tabActiveBg : "transparent",
                }}
              >
                <Ionicons name={t.icon} size={15} color={active ? theme.accent : C.textMuted} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 10,
                    fontFamily: AuthUI.font.semibold,
                    color: active ? theme.accent : C.textMuted,
                  }}
                >
                  {t.label}
                </Text>
              </View>
            </Tap>
          );
        })}
      </View>

      {tab === "poderes" ? (
        <View style={{ gap: 16 }}>
          {isAdmin ? <AdminPoderesTab asambleaId={asambleaId} /> : null}
          {condominioId && a.estado === "programada" ? (
            <PoderesTab asambleaId={asambleaId} condominioId={condominioId} mi={mi} />
          ) : null}
          {isAdmin && a.estado !== "programada" ? (
            <GlassCard style={{ padding: 14 }}>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>
                La asamblea ya no admite poderes del público. Solo administración puede validar o
                registrar poderes aquí.
              </Text>
            </GlassCard>
          ) : null}
        </View>
      ) : null}
      {tab === "orden" ? (
        isAdmin ? (
          <AdminOrdenTab asambleaId={asambleaId} puntos={puntos} />
        ) : (
          <OrdenTab a={a} />
        )
      ) : null}
      {tab === "votar" ? (
        isAdmin ? (
          <View style={{ gap: 20 }}>
            <AdminVotacionTab asambleaId={asambleaId} estadoAsamblea={a.estado} />
            <VotarTab a={a} asambleaId={asambleaId} mi={mi} />
          </View>
        ) : (
          <VotarTab a={a} asambleaId={asambleaId} mi={mi} />
        )
      ) : null}
      {tab === "detalle" && isAdmin ? <AdminDetalleVotosTab asambleaId={asambleaId} /> : null}
      {tab === "tabla" && isAdmin ? <AdminTablaTab asambleaId={asambleaId} /> : null}
      {tab === "reps" && isAdmin ? <AdminRepresentantesTab asambleaId={asambleaId} /> : null}
      {tab === "asistencia" ? <AsistenciaTab asambleaId={asambleaId} mi={mi} /> : null}
      {tab === "resultados" ? <ResultadosTab asambleaId={asambleaId} mi={mi} /> : null}
    </Section>
  );
}

/* ───────── PODERES ───────── */

function PoderesTab({
  asambleaId,
  condominioId,
  mi,
}: {
  asambleaId: Id<"asambleas">;
  condominioId: Id<"condominios">;
  mi: { representa: string[] } | null | undefined;
}) {
  const { theme } = useCondominio();
  const home = useQuery(api.portal.home, { condominioId });
  const otorgados = useQuery(api.asambleas.poderesOtorgados, { asambleaId });
  const recibidos = useQuery(api.asambleas.poderesRecibidos, { asambleaId });
  const otorgar = useMutation(api.asambleas.otorgarPoder);
  const revocar = useMutation(api.asambleas.revocarPoder);
  const responder = useMutation(api.asambleas.responderPoder);

  const unidades = home && home.allowed ? home.unidades : [];
  const [modo, setModo] = useState<"propietario" | "externo">("propietario");
  const [unidadId, setUnidadId] = useState<string>("");
  const [rep, setRep] = useState<{ _id: Id<"users">; name: string } | null>(null);
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<{
    codigo: string;
    nombre: string;
    esPropietario: boolean;
  } | null>(null);

  const delegadasIds = new Set((otorgados ?? []).map((p) => p.unidadId as string));
  const disponibles = unidades.filter((u) => !delegadasIds.has(u._id));

  const grupos = useMemo(() => {
    const map = new Map<
      string,
      {
        nombre: string;
        codigo: string;
        esProp: boolean;
        poderes: { _id: Id<"poderesAsamblea">; unidadNumero: string }[];
      }
    >();
    for (const p of otorgados ?? []) {
      const g = map.get(p.codigoAcceso) ?? {
        nombre: p.representanteNombre,
        codigo: p.codigoAcceso,
        esProp: !!p.representanteUserId,
        poderes: [],
      };
      g.poderes.push({ _id: p._id, unidadNumero: p.unidadNumero });
      map.set(p.codigoAcceso, g);
    }
    return [...map.values()];
  }, [otorgados]);

  const pendientes = (recibidos ?? []).filter((p) => !p.validado);
  const aceptados = (recibidos ?? []).filter((p) => p.validado);
  const representa = mi?.representa ?? [];

  async function darPoder() {
    if (!unidadId) return setError("Elige la unidad que vas a delegar.");
    if (modo === "propietario" && !rep) return setError("Selecciona el propietario.");
    if (modo === "externo" && !nombre.trim()) return setError("Escribe el nombre del apoderado.");
    setBusy(true);
    setError(null);
    try {
      const r = await otorgar({
        asambleaId,
        unidadId: unidadId as Id<"unidades">,
        ...(modo === "propietario"
          ? { representanteUserId: rep!._id }
          : {
              apoderadoNombre: nombre,
              apoderadoDocumento: documento.trim() || undefined,
            }),
      });
      setNuevo(r);
      setUnidadId("");
      setRep(null);
      setNombre("");
      setDocumento("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo otorgar.");
    } finally {
      setBusy(false);
    }
  }

  async function compartirCodigo(codigo: string, para: string) {
    await Share.share({
      message: `Código de apoderado para la asamblea (Vekino): ${codigo}\nPara: ${para}`,
    });
  }

  return (
    <View style={{ gap: 16 }}>
      {representa.length > 0 ? (
        <GlassCard
          style={{
            padding: 14,
            borderLeftWidth: 3,
            borderLeftColor: theme.accent,
          }}
        >
          <Text style={{ color: C.text, fontSize: 14, fontFamily: AuthUI.font.semibold }}>
            Ejerces poder por: {representa.join(", ")}
          </Text>
          <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>
            En Sala, tu voto cuenta por tus unidades y por estas también.
          </Text>
        </GlassCard>
      ) : null}

      {pendientes.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: C.text, fontSize: 15, fontFamily: AuthUI.font.semibold }}>
            Te otorgaron un poder
          </Text>
          {pendientes.map((p) => (
            <GlassCard key={p._id} style={{ padding: 14, gap: 10 }}>
              <Text style={{ color: C.text, fontSize: 14, fontFamily: AuthUI.font.semibold }}>
                {p.otorganteNombre}
              </Text>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>
                Quiere que votes por la unidad {p.unidadNumero}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Tap
                  style={{ flex: 1 }}
                  onPress={() => responder({ poderId: p._id, aceptar: true }).catch(() => {})}
                >
                  <View
                    style={{
                      paddingVertical: 11,
                      borderRadius: 11,
                      backgroundColor: AuthUI.text,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
                      Aceptar
                    </Text>
                  </View>
                </Tap>
                <Tap
                  style={{ flex: 1 }}
                  onPress={() => responder({ poderId: p._id, aceptar: false }).catch(() => {})}
                >
                  <View
                    style={{
                      paddingVertical: 11,
                      borderRadius: 11,
                      borderWidth: 1,
                      borderColor: AuthUI.border,
                      alignItems: "center",
                      backgroundColor: AuthUI.white,
                    }}
                  >
                    <Text style={{ color: C.danger, fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
                      Rechazar
                    </Text>
                  </View>
                </Tap>
              </View>
            </GlassCard>
          ))}
        </View>
      ) : null}

      {aceptados.length > 0 && pendientes.length === 0 && representa.length === 0 ? (
        <Text style={{ color: C.textMuted, fontSize: 13 }}>
          Poderes aceptados: {aceptados.map((p) => p.unidadNumero).join(", ")}
        </Text>
      ) : null}

      {nuevo ? (
        <GlassCard style={{ padding: 18, alignItems: "center", gap: 8 }}>
          <Ionicons name="checkmark-circle" size={28} color={C.success} />
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            {nuevo.esPropietario ? "Poder enviado a" : "Código para"}{" "}
            <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold }}>{nuevo.nombre}</Text>
          </Text>
          {nuevo.esPropietario ? (
            <Text style={{ color: C.textMuted, fontSize: 12, textAlign: "center" }}>
              Debe aceptarlo en su app. También puede usar este código:
            </Text>
          ) : (
            <Text style={{ color: C.textMuted, fontSize: 12, textAlign: "center" }}>
              Compártelo para que entre con el código o se lo dé al administrador.
            </Text>
          )}
          <Text
            style={{
              marginVertical: 6,
              fontSize: 28,
              letterSpacing: 6,
              fontFamily: AuthUI.font.bold,
              color: theme.accent,
            }}
          >
            {nuevo.codigo}
          </Text>
          <Tap onPress={() => compartirCodigo(nuevo.codigo, nuevo.nombre)}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 11,
                borderWidth: 1,
                borderColor: AuthUI.border,
                backgroundColor: AuthUI.white,
              }}
            >
              <Ionicons name="share-outline" size={16} color={C.text} />
              <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 13 }}>
                Compartir código
              </Text>
            </View>
          </Tap>
        </GlassCard>
      ) : null}

      {grupos.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: C.text, fontSize: 15, fontFamily: AuthUI.font.semibold }}>
            Poderes que otorgaste
          </Text>
          {grupos.map((g) => (
            <GlassCard key={g.codigo} style={{ padding: 14, gap: 8 }}>
              <View
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
              >
                <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, flex: 1 }}>
                  {g.nombre}
                  {g.esProp ? " · Vecino" : " · Externo"}
                </Text>
                <Tap onPress={() => compartirCodigo(g.codigo, g.nombre)}>
                  <Text
                    style={{
                      fontFamily: AuthUI.font.bold,
                      letterSpacing: 2,
                      color: theme.accent,
                      fontSize: 14,
                    }}
                  >
                    {g.codigo}
                  </Text>
                </Tap>
              </View>
              {g.poderes.map((p) => (
                <View
                  key={p._id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: C.textMuted, fontSize: 13 }}>Unidad {p.unidadNumero}</Text>
                  <Tap onPress={() => revocar({ poderId: p._id }).catch(() => {})}>
                    <Ionicons name="trash-outline" size={16} color={C.danger} />
                  </Tap>
                </View>
              ))}
            </GlassCard>
          ))}
        </View>
      ) : null}

      {disponibles.length > 0 ? (
        <GlassCard style={{ padding: 16, gap: 12 }}>
          <Text style={{ color: C.text, fontSize: 15, fontFamily: AuthUI.font.semibold }}>
            Delegar mi voto
          </Text>
          <Text style={{ color: C.textMuted, fontSize: 12, marginTop: -4 }}>
            Si no vas a delegar, pasa a la pestaña Sala.
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {(
              [
                { key: "propietario" as const, label: "Vecino" },
                { key: "externo" as const, label: "Externo" },
              ] as const
            ).map((m) => (
              <Tap key={m.key} style={{ flex: 1 }} onPress={() => setModo(m.key)}>
                <View
                  style={{
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: modo === m.key ? theme.accent : AuthUI.border,
                    backgroundColor: modo === m.key ? theme.tabActiveBg : AuthUI.white,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: AuthUI.font.semibold,
                      color: modo === m.key ? theme.accent : C.textMuted,
                    }}
                  >
                    {m.label}
                  </Text>
                </View>
              </Tap>
            ))}
          </View>

          <Text style={{ color: C.textMuted, fontSize: 12, fontFamily: AuthUI.font.medium }}>
            Unidad a delegar
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -2 }}>
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 2 }}>
              {disponibles.map((u) => {
                const on = unidadId === u._id;
                return (
                  <Tap key={u._id} onPress={() => setUnidadId(u._id)}>
                    <View
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: on ? theme.accent : AuthUI.border,
                        backgroundColor: on ? theme.tabActiveBg : AuthUI.white,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: AuthUI.font.semibold,
                          fontSize: 13,
                          color: on ? theme.accent : C.text,
                        }}
                      >
                        {u.numero}
                      </Text>
                    </View>
                  </Tap>
                );
              })}
            </View>
          </ScrollView>

          {modo === "propietario" ? (
            <UserSearch condominioId={condominioId} value={rep} onChange={setRep} />
          ) : (
            <View style={{ gap: 10 }}>
              <Field
                label="Nombre del apoderado"
                value={nombre}
                onChangeText={setNombre}
                placeholder="Nombre completo"
              />
              <Field
                label="Documento (opcional)"
                value={documento}
                onChangeText={setDocumento}
                placeholder="Cédula"
                keyboardType="number-pad"
              />
            </View>
          )}

          {error ? <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text> : null}

          <Tap onPress={darPoder} disabled={busy}>
            <View
              style={{
                height: 48,
                borderRadius: 11,
                backgroundColor: AuthUI.text,
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold, fontSize: 14 }}>
                  Otorgar poder
                </Text>
              )}
            </View>
          </Tap>
        </GlassCard>
      ) : unidades.length > 0 ? (
        <GlassCard style={{ padding: 16 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            Ya delegaste todas tus unidades. Continúa en Sala.
          </Text>
        </GlassCard>
      ) : (
        <GlassCard style={{ padding: 16 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            No tienes unidades vinculadas para delegar.
          </Text>
        </GlassCard>
      )}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: C.textMuted, fontSize: 12, fontFamily: AuthUI.font.medium }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={AuthUI.placeholder}
        keyboardType={keyboardType}
        style={{
          height: 48,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: AuthUI.border,
          backgroundColor: AuthUI.white,
          paddingHorizontal: 14,
          color: AuthUI.text,
          fontFamily: AuthUI.font.regular,
          fontSize: 15,
        }}
      />
    </View>
  );
}

function UserSearch({
  condominioId,
  value,
  onChange,
}: {
  condominioId: Id<"condominios">;
  value: { _id: Id<"users">; name: string } | null;
  onChange: (u: { _id: Id<"users">; name: string } | null) => void;
}) {
  const [term, setTerm] = useState("");
  const results = useQuery(
    api.asambleas.buscarUsuarios,
    term.trim().length >= 2 ? { condominioId, search: term } : "skip",
  );

  if (value) {
    return (
      <View
        style={{
          height: 48,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: AuthUI.border,
          backgroundColor: AuthUI.white,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: C.text, fontFamily: AuthUI.font.medium, flex: 1 }} numberOfLines={1}>
          {value.name}
        </Text>
        <Pressable onPress={() => onChange(null)} hitSlop={8}>
          <Ionicons name="close-circle" size={20} color={C.textMuted} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: C.textMuted, fontSize: 12, fontFamily: AuthUI.font.medium }}>
        Buscar vecino
      </Text>
      <TextInput
        value={term}
        onChangeText={setTerm}
        placeholder="Nombre o correo…"
        placeholderTextColor={AuthUI.placeholder}
        style={{
          height: 48,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: AuthUI.border,
          backgroundColor: AuthUI.white,
          paddingHorizontal: 14,
          color: AuthUI.text,
          fontFamily: AuthUI.font.regular,
          fontSize: 15,
        }}
      />
      {term.trim().length >= 2 ? (
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: AuthUI.border,
            backgroundColor: AuthUI.white,
            overflow: "hidden",
          }}
        >
          {results === undefined ? (
            <Text style={{ padding: 12, color: C.textMuted, fontSize: 13 }}>Buscando…</Text>
          ) : results.length === 0 ? (
            <Text style={{ padding: 12, color: C.textMuted, fontSize: 13 }}>Sin resultados</Text>
          ) : (
            results.map((u) => (
              <Pressable
                key={u._id}
                onPress={() => {
                  onChange({ _id: u._id, name: u.name });
                  setTerm("");
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(216,214,220,0.5)",
                }}
              >
                <Text style={{ color: C.text, fontFamily: AuthUI.font.medium, fontSize: 14 }}>
                  {u.name}
                </Text>
                {u.email ? (
                  <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>{u.email}</Text>
                ) : null}
              </Pressable>
            ))
          )}
        </View>
      ) : (
        <Text style={{ color: C.textMuted, fontSize: 11 }}>Escribe al menos 2 letras</Text>
      )}
    </View>
  );
}

/* ───────── SALA (orden + votar) ───────── */

/* ───────── ORDEN DEL DÍA ───────── */

function OrdenTab({
  a,
}: {
  a: {
    agenda: string[];
    ordenDia?: {
      titulo: string;
      descripcion?: string;
      votacionId?: Id<"votaciones">;
      hecho?: boolean;
    }[];
  };
}) {
  const { theme } = useCondominio();
  const puntos =
    a.ordenDia ??
    a.agenda.map((t) => ({
      titulo: t,
      descripcion: undefined,
      votacionId: undefined,
      hecho: undefined,
    }));
  const hechos = puntos.filter((p) => p.hecho).length;

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: C.textMuted, fontSize: 13 }}>
        Checklist de la asamblea. Los puntos con votación se habilitan en En vivo.
        {puntos.length > 0 ? ` · ${hechos}/${puntos.length} realizados` : ""}
      </Text>
      {puntos.length === 0 ? (
        <GlassCard style={{ padding: 16 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            Aún no hay puntos publicados.
          </Text>
        </GlassCard>
      ) : (
        puntos.map((p, i) => {
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
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    borderWidth: hecho ? 0 : 0,
                    backgroundColor: hecho ? C.success : theme.tabActiveBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {hecho ? (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  ) : (
                    <Text style={{ color: theme.accent, fontFamily: AuthUI.font.bold, fontSize: 12 }}>
                      {i + 1}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text
                      style={{
                        color: hecho ? C.textMuted : C.text,
                        fontFamily: AuthUI.font.semibold,
                        fontSize: 14,
                        flex: 1,
                        textDecorationLine: hecho ? "line-through" : "none",
                      }}
                    >
                      {p.titulo}
                    </Text>
                    {p.votacionId ? (
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          backgroundColor: theme.tabActiveBg,
                        }}
                      >
                        <Text style={{ color: theme.accent, fontSize: 10, fontFamily: AuthUI.font.semibold }}>
                          Votación
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {p.descripcion ? (
                    <Text style={{ color: C.textMuted, fontSize: 12 }}>{p.descripcion}</Text>
                  ) : null}
                </View>
              </View>
            </GlassCard>
          );
        })
      )}
    </View>
  );
}

/* ───────── VOTAR EN VIVO ───────── */

function VotarTab({
  a,
  asambleaId,
  mi,
}: {
  a: {
    estado: string;
    modalidad: string;
  };
  asambleaId: Id<"asambleas">;
  mi: {
    presente: boolean;
    unidades: string[];
    representa: string[];
    votos: Record<string, number>;
  } | null | undefined;
}) {
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const { theme } = useCondominio();

  const enCurso = a.estado === "en_curso";
  const presente = mi?.presente ?? false;
  const abiertas = enCurso
    ? (votaciones ?? []).filter((v) => v.estado === "abierta")
    : [];

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: C.text, fontSize: 15, fontFamily: AuthUI.font.semibold }}>
            Votaciones en vivo
          </Text>
          {abiertas.length > 0 ? (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: C.success,
              }}
            />
          ) : null}
        </View>

        {!enCurso ? (
          <VivoEmptyState
            icon="time-outline"
            accent={theme.accent}
            title="Asamblea aún no inicia"
            subtitle="Cuando el administrador la inicie podrás ver y responder las votaciones aquí."
          />
        ) : !presente ? (
          <VivoEmptyState
            icon="hand-left-outline"
            accent={theme.accent}
            title="Registra tu asistencia"
            subtitle="Ve a la pestaña Asist. para marcarte presente y poder votar."
          />
        ) : votaciones === undefined ? (
          <ActivityIndicator color={C.textSoft} />
        ) : abiertas.length === 0 ? (
          <VivoEmptyState
            icon={a.estado === "finalizada" ? "checkmark-done-outline" : "radio-outline"}
            accent={theme.accent}
            title={a.estado === "finalizada" ? "Asamblea finalizada" : "No hay votación activa"}
            subtitle={
              a.estado === "finalizada"
                ? "Revisa los resultados en la pestaña Result."
                : "Cuando abran una pregunta, aparecerá aquí para que votes."
            }
          />
        ) : (
          abiertas.map((vt) => (
            <VotacionCard
              key={vt._id}
              vt={vt}
              miVoto={mi?.votos?.[vt._id as string] ?? null}
              canVote={presente}
            />
          ))
        )}
      </View>
    </View>
  );
}

function VivoEmptyState({
  icon,
  accent,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  title: string;
  subtitle: string;
}) {
  return (
    <GlassCard
      style={{
        paddingVertical: 36,
        paddingHorizontal: 24,
        alignItems: "center",
        gap: 14,
        minHeight: 220,
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: `${accent}18`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={34} color={accent} />
      </View>
      <Text
        style={{
          color: C.text,
          fontFamily: AuthUI.font.semibold,
          fontSize: 16,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: C.textMuted,
          fontSize: 13,
          textAlign: "center",
          lineHeight: 19,
          maxWidth: 280,
        }}
      >
        {subtitle}
      </Text>
    </GlassCard>
  );
}

function VotacionCard({
  vt,
  miVoto,
  canVote,
}: {
  vt: {
    _id: Id<"votaciones">;
    pregunta: string;
    opciones: { texto: string; votos: number }[];
  };
  miVoto: number | null;
  canVote: boolean;
}) {
  const votar = useMutation(api.asambleas.votar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(i: number) {
    if (!canVote || busy) return;
    setBusy(true);
    setError(null);
    try {
      await votar({ votacionId: vt._id, opcionIndex: i });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo votar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard style={{ padding: 16, gap: 12 }}>
      <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 15 }}>
        {vt.pregunta}
      </Text>
      <View style={{ gap: 8 }}>
        {vt.opciones.map((op, i) => {
          const activo = miVoto === i;
          const tone = optionTone(op.texto);
          return (
            <Tap key={i} onPress={() => elegir(i)} disabled={!canVote || busy}>
              <View
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: activo ? tone.activeBorder : tone.border,
                  backgroundColor: activo ? tone.activeBg : tone.bg,
                  opacity: !canVote ? 0.55 : 1,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    fontFamily: AuthUI.font.semibold,
                    fontSize: 14,
                    color: activo ? "#fff" : tone.text,
                  }}
                >
                  {op.texto}
                </Text>
              </View>
            </Tap>
          );
        })}
      </View>
      {miVoto != null ? (
        <Text style={{ color: C.success, fontSize: 12, textAlign: "center" }}>
          Tu voto quedó registrado. Puedes cambiarlo mientras esté abierta.
        </Text>
      ) : null}
      {error ? <Text style={{ color: C.danger, fontSize: 12, textAlign: "center" }}>{error}</Text> : null}
    </GlassCard>
  );
}

function optionTone(texto: string) {
  const t = texto.toLowerCase();
  if (t.includes("favor") || t.includes("sí") || t === "si" || t.includes("aprob")) {
    return {
      border: "#86EFAC",
      bg: "#F0FDF4",
      text: "#166534",
      activeBorder: "#16A34A",
      activeBg: "#16A34A",
    };
  }
  if (t.includes("contra") || t === "no" || t.includes("rechaz")) {
    return {
      border: "#FCA5A5",
      bg: "#FEF2F2",
      text: "#991B1B",
      activeBorder: "#DC2626",
      activeBg: "#DC2626",
    };
  }
  return {
    border: AuthUI.border,
    bg: AuthUI.white,
    text: AuthUI.text,
    activeBorder: AuthUI.text,
    activeBg: AuthUI.text,
  };
}

/* ───────── RESULTADOS ───────── */

function ResultadosTab({
  asambleaId,
  mi,
}: {
  asambleaId: Id<"asambleas">;
  mi: { votos: Record<string, number> } | null | undefined;
}) {
  const { theme } = useCondominio();
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });

  const conResultados = useMemo(
    () =>
      (votaciones ?? []).filter(
        (vt) =>
          vt.estado === "abierta" ||
          vt.abiertaAlgunaVez === true ||
          vt.opciones.some((o) => o.votos > 0),
      ),
    [votaciones],
  );

  if (votaciones === undefined) {
    return <ActivityIndicator color={C.textSoft} style={{ marginTop: 20 }} />;
  }
  if (conResultados.length === 0) {
    return (
      <GlassCard style={{ padding: 20 }}>
        <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
          Aún no hay votaciones con resultados. Se muestran cuando se abre una pregunta.
        </Text>
      </GlassCard>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {conResultados.map((vt) => {
        const total = vt.opciones.reduce((s, o) => s + o.votos, 0);
        const miVoto = mi?.votos?.[vt._id as string] ?? null;
        const ganadora =
          vt.estado === "cerrada" && total > 0
            ? vt.opciones.reduce(
                (best, op, i) => (op.votos > (vt.opciones[best]?.votos ?? -1) ? i : best),
                0,
              )
            : null;
        const veredicto =
          ganadora == null
            ? null
            : veredictoLabel(vt.opciones[ganadora]?.texto ?? "", vt.opciones.map((o) => o.texto));

        return (
          <GlassCard key={vt._id} style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text
                style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 15, flex: 1 }}
              >
                {vt.pregunta}
              </Text>
              <GlassBadge
                label={vt.estado === "abierta" ? "Abierta" : "Cerrada"}
                tone={vt.estado === "abierta" ? "green" : "neutral"}
              />
            </View>

            {veredicto ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor:
                    veredicto.kind === "aprobada"
                      ? C.successSoft
                      : veredicto.kind === "rechazada"
                        ? C.dangerSoft
                        : theme.tabActiveBg,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: AuthUI.font.semibold,
                    color:
                      veredicto.kind === "aprobada"
                        ? C.success
                        : veredicto.kind === "rechazada"
                          ? C.danger
                          : theme.accent,
                  }}
                >
                  {veredicto.label}
                </Text>
              </View>
            ) : null}

            <View style={{ gap: 10 }}>
              {vt.opciones.map((op, i) => {
                const pct = total > 0 ? Math.round((op.votos / total) * 100) : 0;
                const esMio = miVoto === i;
                const barColor =
                  optionTone(op.texto).activeBg === AuthUI.text ? theme.accent : optionTone(op.texto).activeBg;
                return (
                  <View key={i} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>
                        {op.texto}
                        {esMio ? (
                          <Text style={{ color: theme.accent, fontFamily: AuthUI.font.semibold }}>
                            {" "}
                            · tu voto
                          </Text>
                        ) : null}
                      </Text>
                      <Text style={{ color: C.textMuted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                        {op.votos} · {pct}%
                      </Text>
                    </View>
                    <View
                      style={{
                        height: 10,
                        borderRadius: 999,
                        backgroundColor: "rgba(14,14,15,0.06)",
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          borderRadius: 999,
                          backgroundColor: barColor,
                          opacity: esMio ? 1 : 0.75,
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={{ color: C.textMuted, fontSize: 11 }}>
              {total} unidad{total === 1 ? "" : "es"} votaron
            </Text>
          </GlassCard>
        );
      })}
    </View>
  );
}

function veredictoLabel(
  ganadora: string,
  todas: string[],
): { kind: "aprobada" | "rechazada" | "gano"; label: string } {
  const textos = todas.map((t) => t.toLowerCase());
  const esSiNo =
    textos.some((t) => t.includes("favor") || t.includes("sí") || t === "si" || t.includes("aprob")) &&
    textos.some((t) => t.includes("contra") || t === "no" || t.includes("rechaz"));
  const g = ganadora.toLowerCase();
  if (esSiNo) {
    if (g.includes("favor") || g.includes("sí") || g === "si" || g.includes("aprob")) {
      return { kind: "aprobada", label: "Aprobada" };
    }
    return { kind: "rechazada", label: "No aprobada" };
  }
  return { kind: "gano", label: `Ganó: ${ganadora}` };
}
