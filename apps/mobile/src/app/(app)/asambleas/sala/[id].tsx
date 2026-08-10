import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useMutation, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { C } from "@/lib/theme";
import { VotacionCard } from "@/components/asambleas/votacion-card";
import { useSalaCloudflare } from "@/hooks/use-sala-cloudflare";
import { useSalaLatido } from "@/hooks/use-sala-latido";
import { getWebRtc, webrtcDisponible } from "@/lib/webrtc-native";

const RTCView = getWebRtc()?.RTCView ?? null;

/**
 * La sala de la asamblea, desde el teléfono.
 *
 * Es una RUTA aparte y no una pestaña de la ficha a propósito: las pestañas
 * se desmontan al cambiar de una a otra, y desmontar esta pantalla es colgar
 * la llamada. Todo lo que la persona necesita mientras la asamblea corre
 * —oír, ver, pedir la palabra, VOTAR, registrar asistencia— tiene que vivir
 * aquí dentro, porque salir a buscarlo cuelga. Con `exigirConexionParaVotar`
 * era además un círculo sin salida: salir a votar invalidaba el voto.
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

  /* Qué motor le toca a este conjunto. Sin esta pregunta, el freno de
   * emergencia (devolver un condominio al motor viejo en plena asamblea)
   * partía la sala en dos: la web se iba al motor viejo y los teléfonos
   * seguían en Cloudflare, cada mitad oyendo solo a su mitad. */
  const motor = useQuery(
    api.salaCloudflare.motor,
    id ? { asambleaId } : "skip",
  );
  const usaCloudflare = motor === "cloudflare";

  const latido = useSalaLatido(id && usaCloudflare ? asambleaId : null);
  const sala = useSalaCloudflare(asambleaId, !!id && enCurso && usaCloudflare);

  const palabras = useQuery(
    api.salaVideo.palabras,
    id && enCurso && usaCloudflare ? { asambleaId } : "skip",
  );
  const pedirPalabra = useMutation(api.salaVideo.pedirPalabra);
  const bajarMano = useMutation(api.salaVideo.bajarMano);
  const [pidiendo, setPidiendo] = useState(false);

  /* Votación y asistencia, DENTRO de la sala. */
  const votaciones = useQuery(
    api.asambleas.listVotaciones,
    id && enCurso && usaCloudflare ? { asambleaId } : "skip",
  );
  const mi = useQuery(
    api.asambleas.miParticipacion,
    id && usaCloudflare ? { asambleaId } : "skip",
  );
  const entrarYRegistrar = useMutation(api.asambleas.entrarYRegistrar);
  const [verVotacion, setVerVotacion] = useState(false);
  const [verGente, setVerGente] = useState(false);

  /* El censo de la sala: quiénes están y si hay quórum. Es la misma consulta
   * que ya tiene suscrita la web, así que no añade abanico nuevo. */
  const censo = useQuery(
    api.asambleaSala.salaEnVivo,
    id && enCurso && usaCloudflare ? { asambleaId } : "skip",
  );

  const abiertas = useMemo(
    () => (votaciones ?? []).filter((v) => v.estado === "abierta"),
    [votaciones],
  );

  /* El registro de asistencia, solo (igual que la web): entrar a la sala de
   * una asamblea virtual ES asistir. Un intento; si falla queda el aviso. */
  const registroIntentado = useRef(false);
  useEffect(() => {
    if (registroIntentado.current) return;
    if (!enCurso || !usaCloudflare || asamblea?.modalidad === "presencial") return;
    if (mi == null || mi.presente) return;
    registroIntentado.current = true;
    void entrarYRegistrar({ asambleaId }).catch(() => {
      /* Sin unidades (mesa, invitado) no es un error de verdad. */
    });
  }, [enCurso, usaCloudflare, asamblea?.modalidad, mi, entrarYRegistrar, asambleaId]);

  /* Al abrirse una votación, la sala la ofrece sola — en la web el modal se
   * abre automáticamente; aquí un aviso pulsable es menos brusco sobre una
   * llamada, pero el efecto lo abre la primera vez para que nadie se quede
   * sin votar por no ver el botón. */
  const votacionOfrecida = useRef<string | null>(null);
  useEffect(() => {
    const primera = abiertas[0];
    if (!primera) return;
    if (votacionOfrecida.current === (primera._id as string)) return;
    votacionOfrecida.current = primera._id as string;
    setVerVotacion(true);
  }, [abiertas]);

  const miPalabra = useMemo(
    () => (palabras ?? []).find((p) => p.mia),
    [palabras],
  );
  const puedoHablar = latido.esMesa || miPalabra?.estado === "concedida";

  /* Si la mesa retira la palabra en pleno aire, el micrófono se corta AQUÍ:
   * el motor no corta en el servidor, y la UI ya cambió los botones — sin
   * esto la persona seguía sonando para todos sin forma de silenciarse. */
  useEffect(() => {
    if (puedoHablar) return;
    if (sala.micOn) void sala.apagarMic();
    if (sala.camOn) void sala.apagarCam();
  }, [puedoHablar, sala.micOn, sala.camOn, sala]);

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
  if (asamblea === undefined || motor === undefined) {
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
        <BotonVolver />
      </Centro>
    );
  }
  if (!usaCloudflare) {
    return (
      <Centro>
        <Ionicons name="desktop-outline" size={28} color={C.textMuted} />
        <Text style={{ color: C.textMuted, marginTop: 10, textAlign: "center" }}>
          Esta asamblea usa otro motor de video.{"\n"}Entra desde la web para
          participar.
        </Text>
        <BotonVolver />
      </Centro>
    );
  }

  if (!webrtcDisponible() || !RTCView) {
    return (
      <Centro>
        <Ionicons name="phone-portrait-outline" size={28} color={C.textMuted} />
        <Text style={{ color: C.textMuted, marginTop: 10, textAlign: "center" }}>
          La sala de video no funciona en Expo Go.{"\n"}
          Ábrela con el development build de Vekino{"\n"}
          (o entra desde la web).
        </Text>
        <BotonVolver />
      </Centro>
    );
  }

  const estadoTexto =
    sala.estado === "conectada"
      ? latido.conectado
        ? "En la sala"
        : latido.registrado
          ? "Reconectando tu asistencia…"
          : "Sin asistencia registrada"
      : sala.estado === "error"
        ? "Sin conexión al audio"
        : "Conectando…";

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#101211" }}
      edges={["top", "bottom"]}
    >
      {/* Sobre fondo oscuro el reloj y la batería tienen que ir en claro:
       * sin esto el status bar salía negro sobre negro. */}
      <StatusBar style="light" />
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
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/asambleas" as never);
          }}
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
            {estadoTexto}
          </Text>
        </View>
        <Pressable
          onPress={() => setVerGente(true)}
          hitSlop={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 15,
            backgroundColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Ionicons name="people-outline" size={15} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 12.5 }}>
            {censo?.personas?.length ?? 0}
          </Text>
        </Pressable>
        <EstadoPunto estado={sala.estado} />
      </View>

      {/* Quien no cuenta para el quórum tiene que saberlo, no adivinar. */}
      {sala.estado === "conectada" &&
        !latido.registrado &&
        !latido.esMesa &&
        mi != null &&
        !mi.presente && (
          <Text
            style={{
              marginHorizontal: 14,
              marginBottom: 6,
              color: "#fbbf24",
              fontSize: 12,
              lineHeight: 17,
            }}
          >
            Estás oyendo la asamblea pero tu asistencia no quedó registrada:
            no cuentas para el quórum ni puedes votar.
          </Text>
        )}

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
            <Zoomable>
              <RTCView
                streamURL={principal.stream.toURL()}
                style={{ flex: 1 }}
                objectFit={principal.tipo === "pantalla" ? "contain" : "cover"}
              />
            </Zoomable>
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
          <Mosaico
            personas={(censo?.personas ?? []).map((p) => ({
              nombre: p.nombre,
              imageUrl: p.imageUrl,
              esMesa: p.esMesa,
            }))}
            hablando={audios.length}
          />
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

        {/* Votación abierta: el aviso vive sobre el escenario y el modal se
            abre SIN salir de la sala — salir era perder la conexión que el
            propio voto exige. */}
        {abiertas.length > 0 && !verVotacion && (
          <Pressable
            onPress={() => setVerVotacion(true)}
            style={{
              position: "absolute",
              left: 18,
              right: 18,
              bottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: "#16A34A",
            }}
          >
            <Ionicons name="checkbox-outline" size={19} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "600", flex: 1 }}>
              Votación abierta — toca para votar
            </Text>
            <Ionicons name="chevron-up" size={17} color="#fff" />
          </Pressable>
        )}

        {sala.error && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginTop: 8,
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ color: "#f0a0a0", fontSize: 12, flex: 1 }}>
              {sala.error}
            </Text>
            <Pressable
              onPress={() => void sala.reconectar()}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12 }}>Reintentar</Text>
            </Pressable>
          </View>
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
              onPress={() =>
                void (sala.micOn ? sala.apagarMic() : sala.encenderMic())
              }
              icono={sala.micOn ? "mic" : "mic-off"}
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
            <Text
              style={{ color: miPalabra ? "#facc15" : "#fff", fontSize: 14 }}
            >
              {miPalabra
                ? miPalabra.estado === "concedida"
                  ? "Tienes la palabra"
                  : "Mano levantada · bajar"
                : "Pedir la palabra"}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/asambleas" as never);
          }}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: "#dc2626",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="call"
            size={20}
            color="#fff"
            style={{ transform: [{ rotate: "135deg" }] }}
          />
        </Pressable>
      </View>

      {/* ── Votación, sobre la llamada ── */}
      <Modal
        visible={verVotacion && abiertas.length > 0}
        transparent
        animationType="slide"
        onRequestClose={() => setVerVotacion(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
            onPress={() => setVerVotacion(false)}
          />
          <View
            style={{
              backgroundColor: C.bg,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 16,
              paddingBottom: 30,
              maxHeight: "75%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <Text style={{ color: C.text, fontWeight: "700", fontSize: 16 }}>
                Votación
              </Text>
              <Pressable onPress={() => setVerVotacion(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={C.textMuted} />
              </Pressable>
            </View>
            {mi != null && !mi.presente && (
              <Text style={{ color: C.danger, fontSize: 12.5, marginBottom: 10 }}>
                Tu asistencia no está registrada: los votos no se habilitan.
              </Text>
            )}
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {abiertas.map((vt) => (
                <VotacionCard
                  key={vt._id}
                  vt={vt}
                  miVoto={mi?.votos?.[vt._id as string] ?? null}
                  canVote={!!mi?.presente}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* ── Participantes y quórum ── */}
      <Modal
        visible={verGente}
        transparent
        animationType="slide"
        onRequestClose={() => setVerGente(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
            onPress={() => setVerGente(false)}
          />
          <View
            style={{
              backgroundColor: C.bg,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 16,
              paddingBottom: 30,
              maxHeight: "70%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <Text style={{ color: C.text, fontWeight: "700", fontSize: 16 }}>
                En la sala
              </Text>
              <Pressable onPress={() => setVerGente(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={C.textMuted} />
              </Pressable>
            </View>

            {censo ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    color: censo.hayQuorum ? C.success : C.danger,
                    fontWeight: "700",
                    fontSize: 20,
                  }}
                >
                  {censo.pctCoeficiente}%
                </Text>
                <Text style={{ color: C.textMuted, fontSize: 12.5 }}>
                  de coeficiente presente ·{" "}
                  {censo.hayQuorum
                    ? "hay quórum"
                    : `se necesita ${censo.quorumRequerido}%`}
                </Text>
              </View>
            ) : null}

            <ScrollView contentContainerStyle={{ gap: 2 }}>
              {(censo?.personas ?? []).map((p, i) => (
                <View
                  key={`${p.nombre}-${i}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 8,
                  }}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: "rgba(0,0,0,0.08)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: C.textMuted, fontSize: 12 }}>
                      {p.nombre.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ color: C.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
                    {p.nombre}
                  </Text>
                  {p.esMesa ? (
                    <Text style={{ color: C.textMuted, fontSize: 11 }}>Mesa</Text>
                  ) : p.esInvitado ? (
                    <Text style={{ color: C.textMuted, fontSize: 11 }}>Invitado</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Zoom de pellizco sobre lo que se presenta.
 *
 * En un teléfono los estados financieros compartidos desde un computador son
 * ilegibles sin esto: la pantalla de 27 pulgadas de la mesa cabe en 6. Dos
 * dedos acercan, arrastrar mueve, doble toque vuelve al tamaño normal.
 */
function Zoomable({ children }: { children: React.ReactNode }) {
  const escala = useSharedValue(1);
  const escalaBase = useSharedValue(1);
  const trasX = useSharedValue(0);
  const trasY = useSharedValue(0);
  const trasXBase = useSharedValue(0);
  const trasYBase = useSharedValue(0);

  const pellizco = Gesture.Pinch()
    .onUpdate((e) => {
      escala.value = Math.min(5, Math.max(1, escalaBase.value * e.scale));
    })
    .onEnd(() => {
      escalaBase.value = escala.value;
      if (escala.value <= 1.02) {
        escala.value = withTiming(1);
        escalaBase.value = 1;
        trasX.value = withTiming(0);
        trasY.value = withTiming(0);
        trasXBase.value = 0;
        trasYBase.value = 0;
      }
    });

  const arrastre = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (escala.value <= 1) return;
      trasX.value = trasXBase.value + e.translationX;
      trasY.value = trasYBase.value + e.translationY;
    })
    .onEnd(() => {
      trasXBase.value = trasX.value;
      trasYBase.value = trasY.value;
    });

  const dobleToque = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const volver = escala.value > 1;
      escala.value = withTiming(volver ? 1 : 2.5);
      escalaBase.value = volver ? 1 : 2.5;
      trasX.value = withTiming(0);
      trasY.value = withTiming(0);
      trasXBase.value = 0;
      trasYBase.value = 0;
    });

  const estilo = useAnimatedStyle(() => ({
    flex: 1,
    transform: [
      { translateX: trasX.value },
      { translateY: trasY.value },
      { scale: escala.value },
    ],
  }));

  return (
    <GestureDetector
      gesture={Gesture.Simultaneous(pellizco, arrastre, dobleToque)}
    >
      <Animated.View style={estilo}>{children}</Animated.View>
    </GestureDetector>
  );
}

/* Paleta del círculo de avatar, la misma que la web: el color se deriva del
 * nombre para que cada persona salga siempre del mismo color. */
const COLORES_AVATAR = [
  "#1a73e8",
  "#188038",
  "#c5221f",
  "#e37400",
  "#9334e6",
  "#00786a",
];
function colorDe(nombre: string) {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) | 0;
  return COLORES_AVATAR[Math.abs(h) % COLORES_AVATAR.length]!;
}

type PersonaTile = {
  nombre: string;
  imageUrl?: string | null;
  esMesa?: boolean;
};

/**
 * Las personas de la sala, en cuadrícula — como Meet.
 *
 * Antes aquí decía «Nadie está emitiendo todavía», que además de deprimente
 * era engañoso: en una asamblea casi nadie emite video, pero la sala está
 * llena de gente. Lo que hay que enseñar es quién está, no quién transmite.
 */
function Mosaico({
  personas,
  hablando,
}: {
  personas: PersonaTile[];
  /** Cuántas voces se están oyendo; solo para el pie del bloque. */
  hablando: number;
}) {
  /* Como Meet: no se dibujan doscientas fichas. Caben nueve y el resto se
   * cuenta — en una asamblea grande el mosaico completo no aporta nada. */
  const TOPE = 9;
  const visibles = personas.slice(0, TOPE);
  const resto = personas.length - visibles.length;
  const columnas = visibles.length <= 1 ? 1 : visibles.length <= 4 ? 2 : 3;

  if (personas.length === 0) {
    return (
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
        <ActivityIndicator color="rgba(255,255,255,0.4)" />
        <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
          Entrando a la sala…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {visibles.map((p, i) => (
          <View
            key={`${p.nombre}-${i}`}
            style={{
              width: `${100 / columnas}%`,
              flexGrow: 1,
              flexBasis: `${100 / columnas - 2}%`,
              minHeight: 110,
              borderRadius: 14,
              overflow: "hidden",
              backgroundColor: "#202124",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {p.imageUrl ? (
              <Image
                source={{ uri: p.imageUrl }}
                style={{
                  width: visibles.length <= 2 ? 88 : 54,
                  height: visibles.length <= 2 ? 88 : 54,
                  borderRadius: 44,
                }}
              />
            ) : (
              <View
                style={{
                  width: visibles.length <= 2 ? 88 : 54,
                  height: visibles.length <= 2 ? 88 : 54,
                  borderRadius: 44,
                  backgroundColor: colorDe(p.nombre || "?"),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: visibles.length <= 2 ? 34 : 21,
                    fontWeight: "600",
                  }}
                >
                  {(p.nombre || "?").trim().charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text
              numberOfLines={1}
              style={{
                position: "absolute",
                left: 8,
                bottom: 7,
                maxWidth: "88%",
                color: "rgba(255,255,255,0.95)",
                fontSize: 11,
                backgroundColor: "rgba(0,0,0,0.6)",
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: 7,
              }}
            >
              {p.nombre}
              {p.esMesa ? " · mesa" : ""}
            </Text>
          </View>
        ))}
      </View>

      {(resto > 0 || hablando > 0) && (
        <Text
          style={{
            color: "rgba(255,255,255,0.4)",
            fontSize: 11.5,
            textAlign: "center",
            paddingTop: 6,
          }}
        >
          {resto > 0 ? `y ${resto} más en la sala` : ""}
          {resto > 0 && hablando > 0 ? " · " : ""}
          {hablando > 0
            ? `oyendo a ${hallando(hablando)}`
            : ""}
        </Text>
      )}
    </View>
  );
}

function hallando(n: number) {
  return n === 1 ? "1 persona" : `${n} personas`;
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

function BotonVolver() {
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/asambleas" as never);
      }}
      style={{
        marginTop: 16,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.1)",
      }}
    >
      <Text style={{ color: "#fff" }}>Volver</Text>
    </Pressable>
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
        backgroundColor: activo
          ? "rgba(255,255,255,0.92)"
          : "rgba(255,255,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icono} size={20} color={activo ? "#101211" : "#fff"} />
    </Pressable>
  );
}
