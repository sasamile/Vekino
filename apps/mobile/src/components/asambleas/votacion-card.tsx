import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";
import { GlassCard } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";

/**
 * La tarjeta de votar. Vive aparte porque se vota desde DOS sitios: la
 * pestaña "En vivo" de la ficha, y la sala de la asamblea. Antes solo existía
 * en la ficha, y votar desde el teléfono obligaba a colgar la llamada — con
 * `exigirConexionParaVotar`, colgar invalidaba el voto: un círculo sin salida.
 */
export function VotacionCard({
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
      {error ? (
        <Text style={{ color: C.danger, fontSize: 12, textAlign: "center" }}>
          {error}
        </Text>
      ) : null}
    </GlassCard>
  );
}

export function optionTone(texto: string) {
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
