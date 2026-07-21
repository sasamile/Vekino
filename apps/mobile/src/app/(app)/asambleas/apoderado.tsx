import { useState } from "react";
import { View, Text, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard, GlassBadge } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";

export default function ApoderadoCodigoScreen() {
  const { theme } = useCondominio();
  const [input, setInput] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const data = useQuery(api.asambleas.accederConCodigo, codigo ? { codigo } : "skip");

  return (
    <Section title="Código de apoderado">
      <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 16, marginTop: -4 }}>
        Ingresa el código que te compartió el propietario para votar por sus unidades.
      </Text>

      {!codigo || data === null ? (
        <GlassCard style={{ padding: 18, gap: 12 }}>
          {data === null ? (
            <Text
              style={{
                color: C.danger,
                fontSize: 13,
                backgroundColor: C.dangerSoft,
                padding: 10,
                borderRadius: 10,
              }}
            >
              Código inválido o sin poderes activos. Verifica con el propietario.
            </Text>
          ) : null}
          <Text style={{ color: C.textMuted, fontSize: 12, fontFamily: AuthUI.font.medium }}>
            Código de acceso
          </Text>
          <TextInput
            value={input}
            onChangeText={(t) => setInput(t.toUpperCase())}
            placeholder="XXXXXX"
            placeholderTextColor={AuthUI.placeholder}
            maxLength={8}
            autoCapitalize="characters"
            style={{
              height: 56,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: AuthUI.border,
              backgroundColor: AuthUI.white,
              textAlign: "center",
              fontSize: 24,
              letterSpacing: 6,
              fontFamily: AuthUI.font.bold,
              color: theme.accent,
            }}
          />
          <Tap
            onPress={() => setCodigo(input.trim())}
            disabled={input.trim().length < 4}
          >
            <View
              style={{
                height: 48,
                borderRadius: 11,
                backgroundColor: AuthUI.text,
                alignItems: "center",
                justifyContent: "center",
                opacity: input.trim().length < 4 ? 0.45 : 1,
              }}
            >
              <Text style={{ color: "#fff", fontFamily: AuthUI.font.semibold }}>Ingresar</Text>
            </View>
          </Tap>
        </GlassCard>
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
    </Section>
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
  const { theme } = useCondominio();
  const activa = data.asamblea.estado === "programada" || data.asamblea.estado === "en_curso";

  return (
    <View style={{ gap: 14 }}>
      <GlassCard style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>
              Apoderado
            </Text>
            <Text style={{ color: C.text, fontFamily: AuthUI.font.bold, fontSize: 17 }}>
              {data.apoderadoNombre}
            </Text>
          </View>
          <Tap onPress={onSalir}>
            <Text style={{ color: C.textMuted, fontSize: 13 }}>Salir</Text>
          </Tap>
        </View>
        <View
          style={{
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.tabActiveBg,
          }}
        >
          <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold }}>{data.asamblea.titulo}</Text>
          <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
            {data.asamblea.fecha} · {data.asamblea.hora}
            {data.asamblea.estado === "en_curso" ? " · En vivo" : ""}
          </Text>
        </View>
        <Text style={{ color: C.textMuted, fontSize: 12 }}>
          Unidades ({data.unidades.length})
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {data.unidades.map((u, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: theme.tabActiveBg,
              }}
            >
              <Ionicons name="home-outline" size={12} color={theme.accent} />
              <Text style={{ color: theme.accent, fontSize: 12, fontFamily: AuthUI.font.semibold }}>
                {u.unidadNumero}
              </Text>
            </View>
          ))}
        </View>
        {!data.validado ? (
          <Text style={{ color: C.warning, fontSize: 12 }}>
            Algún poder está pendiente de aceptación o validación.
          </Text>
        ) : null}
      </GlassCard>

      <Text style={{ color: C.text, fontSize: 15, fontFamily: AuthUI.font.semibold }}>
        Votaciones
      </Text>
      {data.votaciones.length === 0 ? (
        <GlassCard style={{ padding: 16 }}>
          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center" }}>
            Aún no hay votaciones.
          </Text>
        </GlassCard>
      ) : (
        data.votaciones.map((vt) => (
          <VotacionApoderado key={vt._id} codigo={codigo} vt={vt} habilitado={activa && data.validado} />
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
  const { theme } = useCondominio();
  const votar = useMutation(api.asambleas.votarConCodigo);
  const [busy, setBusy] = useState(false);
  const total = vt.opciones.reduce((s, o) => s + o.votos, 0);
  const abierta = vt.estado === "abierta";

  async function emitir(i: number) {
    if (!habilitado || !abierta || busy) return;
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
    <GlassCard style={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, flex: 1 }}>{vt.pregunta}</Text>
        <GlassBadge
          label={abierta ? "Abierta" : "Cerrada"}
          tone={abierta ? "green" : "neutral"}
        />
      </View>
      {vt.opciones.map((op, i) => {
        const pct = total > 0 ? Math.round((op.votos / total) * 100) : 0;
        const esMio = vt.miVoto === i;
        return (
          <View key={i} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              {abierta && habilitado ? (
                <Tap onPress={() => emitir(i)} disabled={busy}>
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: esMio ? theme.accent : AuthUI.border,
                      backgroundColor: esMio ? theme.accent : AuthUI.white,
                      marginRight: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: AuthUI.font.semibold,
                        color: esMio ? "#fff" : C.text,
                      }}
                    >
                      {esMio ? "Tu voto" : "Votar"}
                    </Text>
                  </View>
                </Tap>
              ) : null}
              <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{op.texto}</Text>
              <Text style={{ color: C.textMuted, fontSize: 12 }}>
                {op.votos} · {pct}%
              </Text>
            </View>
            <View
              style={{
                height: 8,
                borderRadius: 999,
                backgroundColor: "rgba(14,14,15,0.06)",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  backgroundColor: theme.accent,
                  opacity: esMio ? 1 : 0.55,
                }}
              />
            </View>
          </View>
        );
      })}
    </GlassCard>
  );
}
