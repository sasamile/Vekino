import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useMutation, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { RTCView } from "react-native-webrtc";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { C } from "@/lib/theme";
import { useSalaCloudflare } from "@/hooks/use-sala-cloudflare";
import { useSalaLatido } from "@/hooks/use-sala-latido";

/**
 * La sala de la asamblea, desde el teléfono.
 *
 * Es una RUTA aparte y no una pestaña de la ficha a propósito: las pestañas
 * se desmontan al cambiar de una a otra, y desmontar esta pantalla es colgar
 * la llamada. Aquí la conexión vive lo que vive la pantalla.
 *
 * La v1 hace lo que un residente necesita en una asamblea: oír, ver lo que
 * la mesa comparte, pedir la palabra y hablar cuando se la conceden. No hay
 * chat ni compartir pantalla — eso sigue en la web, y ver la pantalla que
 * OTRO comparte sí funciona (es una pista de video como cualquiera).
 */
export default function SalaAsambleaScreen() {
  /* La asamblea dura horas y la gente deja el teléfono en la mesa: si la
   * pantalla se apaga sola, iOS sigue con el audio pero el video muere y
   * Android corta todo. Despierta mientras esta pantalla exista. */
  useKeepAwake();

  const { id } = useLocalSearchParams<{ id: string }>();
  const asambleaId = (id ?? "") as Id<"asambleas">;

  const asamblea = useQuery(api.asambleas.get, id ? { id: asambleaId } : "skip");
  const enCurso = asamblea?.estado === "en_curso";

  const latido = useSalaLatido(id ? asambleaId : null);
  const sala = useSalaCloudflare(asambleaId, !!id && enCurso);

  const palabras = useQuery(
    api.salaVideo.palabras,
    id && enCurso ? { asambleaId } : "skip",
  );
  const pedirPalabra = useMutation(api.salaVideo.pedirPalabra);
  const bajarMano = useMutation(api.salaVideo.bajarMano);
  const [pidiendo, setPidiendo] = useState(false);

  const miPalabra = useMemo(
    () => (palabras ?? []).find((p) => p.mia),
    [palabras],
  );
  const puedoHablar = latido.esMesa || miPalabra?.estado === "concedida";

  /* Video remoto: la pantalla compartida manda — es lo que se está
   * presentando. Si no hay, las cámaras. El audio suena solo. */
  const videos = sala.remotas.filter((r) => r.tipo !== "audio");
  const principal =
    videos.find((r) => r.tipo === "pantalla") ?? videos[0] ?? null;
  const audios = sala.remotas.filter((r) => r.tipo === "audio");

  if (!id) {
    return (
      <Centro>
        <Text style={{ color: C.textMuted }}>Asamblea no válida.</Text>
      </Centro>
    );
  }
  if (asamblea === undefined) {
    return (
      <Centro>
        <ActivityIndicator color={C.textSoft} />
      </Centro>
    );
  }
  if (!asamblea || !enCurso) {
    return (
      <Centro>
        <Ionicons name="moon-outline" size={28} color={C.textMuted} />
        <Text style={{ color: C.textMuted, marginTop: 10, textAlign: "center" }}>
          La sala no está abierta.{"\n"}Vuelve cuando la asamblea esté en curso.
        </Text>
        <Boton onPress={() => router.back()} texto="Volver" tono="neutro" />
      </Centro>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#101211" }} edges={["top", "bottom"]}>
      {/* ── Cabecera ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: "rgba(255,255,255,0.08)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "600" }}>
            {asamblea.titulo}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
            {sala.estado === "conectada"
              ? latido.conectado
                ? "En la sala"
                : "Conectando tu asistencia…"
              : sala.estado === "error"
                ? "Sin conexión al audio"
                : "Conectando…"}
          </Text>
        </View>
        <EstadoPunto estado={sala.estado} />
      </View>

      {/* ── Escenario ── */}
      <View style={{ flex: 1, paddingHorizontal: 10 }}>
        {principal ? (
          <View
            style={{
              flex: 1,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: "#000",
            }}
          >
            <RTCView
              streamURL={principal.stream.toURL()}
              style={{ flex: 1 }}
              objectFit={principal.tipo === "pantalla" ? "contain" : "cover"}
            />
            <Text
              style={{
                position: "absolute",
                left: 10,
                bottom: 8,
                color: "rgba(255,255,255,0.85)",
                fontSize: 12,
                backgroundColor: "rgba(0,0,0,0.45)",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
              }}
            >
              {principal.tipo === "pantalla"
                ? `Pantalla de ${principal.nombre || "la mesa"}`
                : principal.nombre || "Participante"}
            </Text>
          </View>
        ) : (
          <View
            style={{
              flex: 1,
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.04)",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons
              name="volume-high-outline"
              size={30}
              color="rgba(255,255,255,0.35)"
            />
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
              {audios.length > 0
                ? `Oyendo a ${audios.length} ${audios.length === 1 ? "persona" : "personas"}`
                : "Nadie está emitiendo todavía"}
            </Text>
          </View>
        )}

        {/* Los demás videos, en tira */}
        {videos.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginTop: 8 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {videos
              .filter((r) => r !== principal)
              .map((r) => (
                <View
                  key={r.trackName}
                  style={{
                    width: 128,
                    height: 82,
                    borderRadius: 12,
                    overflow: "hidden",
                    backgroundColor: "#000",
                  }}
                >
                  <RTCView
                    streamURL={r.stream.toURL()}
                    style={{ flex: 1 }}
                    objectFit="cover"
                  />
                </View>
              ))}
          </ScrollView>
        )}

        {/* Mi cámara */}
        {sala.localStream && (
          <View
            style={{
              position: "absolute",
              right: 18,
              top: 8,
              width: 96,
              height: 128,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "#000",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.2)",
            }}
          >
            <RTCView
              streamURL={sala.localStream.toURL()}
              style={{ flex: 1 }}
              objectFit="cover"
              mirror
              zOrder={1}
            />
          </View>
        )}

        {sala.error && (
          <Text
            style={{
              color: "#f0a0a0",
              fontSize: 12,
              marginTop: 8,
              paddingHorizontal: 4,
            }}
          >
            {sala.error}
          </Text>
        )}
      </View>

      {/* ── Controles ── */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
        }}
      >
        {puedoHablar ? (
          <>
            <Redondo
              activo={sala.micOn}
              onPress={() => void (sala.micOn ? sala.apagarMic() : sala.encenderMic())}
              icono={sala.micOn ? "mic" : "mic-off"}
            />
            <Redondo
              activo={sala.camOn}
              onPress={() => void (sala.camOn ? sala.apagarCam() : sala.encenderCam())}
              icono={sala.camOn ? "videocam" : "videocam-off"}
            />
          </>
        ) : (
          <Pressable
            disabled={pidiendo}
            onPress={() => {
              setPidiendo(true);
              void (miPalabra
                ? bajarMano({ asambleaId })
                : pedirPalabra({ asambleaId })
              ).finally(() => setPidiendo(false));
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 18,
              paddingVertical: 12,
              borderRadius: 24,
              backgroundColor: miPalabra
                ? "rgba(250,204,21,0.18)"
                : "rgba(255,255,255,0.1)",
            }}
          >
            <Ionicons
              name="hand-left-outline"
              size={18}
              color={miPalabra ? "#facc15" : "#fff"}
            />
            <Text style={{ color: miPalabra ? "#facc15" : "#fff", fontSize: 14 }}>
              {miPalabra
                ? miPalabra.estado === "concedida"
                  ? "Tienes la palabra"
                  : "Mano levantada · bajar"
                : "Pedir la palabra"}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => router.back()}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: "#dc2626",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="call" size={20} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: "#101211",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 6,
      }}
    >
      {children}
    </SafeAreaView>
  );
}

function EstadoPunto({ estado }: { estado: string }) {
  const color =
    estado === "conectada"
      ? "#34d399"
      : estado === "error"
        ? "#f87171"
        : "#fbbf24";
  return (
    <View
      style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }}
    />
  );
}

function Redondo({
  activo,
  onPress,
  icono,
}: {
  activo: boolean;
  onPress: () => void;
  icono: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: activo ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icono} size={20} color={activo ? "#101211" : "#fff"} />
    </Pressable>
  );
}

function Boton({
  onPress,
  texto,
  tono,
}: {
  onPress: () => void;
  texto: string;
  tono: "neutro";
}) {
  void tono;
  return (
    <Pressable
      onPress={onPress}
      style={{
        marginTop: 16,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.1)",
      }}
    >
      <Text style={{ color: "#fff" }}>{texto}</Text>
    </Pressable>
  );
}
