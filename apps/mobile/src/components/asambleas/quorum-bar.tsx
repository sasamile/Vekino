import { View, Text } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { useCondominio } from "@/context/condominio-context";
import { GlassCard } from "@/components/ui/glass";
import { C } from "@/lib/theme";
import { AuthUI } from "@/lib/auth-ui";

/** Barra de quórum full-width (va arriba de las tabs). */
export function QuorumBar({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const { theme } = useCondominio();
  const quorum = useQuery(api.asambleas.quorum, { asambleaId });

  if (quorum === undefined) {
    return (
      <GlassCard style={{ padding: 14, marginBottom: 12 }}>
        <Text style={{ color: C.textMuted, fontSize: 12 }}>Cargando quórum…</Text>
      </GlassCard>
    );
  }
  if (quorum === null) return null;

  const ok = quorum.pct >= quorum.quorumRequerido;

  return (
    <GlassCard style={{ padding: 14, marginBottom: 12, alignSelf: "stretch" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ color: C.textMuted, fontSize: 12, fontFamily: AuthUI.font.medium }}>
          Quórum
        </Text>
        <Text style={{ color: C.text, fontFamily: AuthUI.font.semibold, fontSize: 14 }}>
          {quorum.pct.toFixed(2)}% / {quorum.quorumRequerido}%
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
            width: `${Math.min(100, quorum.pct)}%`,
            height: "100%",
            backgroundColor: ok ? C.success : theme.accent,
            borderRadius: 999,
          }}
        />
      </View>
      <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 8 }}>
        {quorum.unidadesPresentes} de {quorum.totalUnidades} unidades · {quorum.poderesActivos}{" "}
        poder(es)
      </Text>
    </GlassCard>
  );
}
