import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { useCondominio } from "@/context/condominio-context";
import { Section } from "@/components/ui/section";
import { GlassCard } from "@/components/ui/glass";
import { MiniBarChart } from "@/components/ui/mini-bar-chart";
import { cop } from "@/lib/utils";
import { C, cardShadow } from "@/lib/theme";

export default function ReportesScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const { condominioId } = useCondominio();
  const serie = useQuery(api.facturas.serie, condominioId ? { condominioId } : "skip");
  const detail = useQuery(api.condominios.detail, condominioId ? { condominioId } : "skip");

  const ultimo = (serie ?? [])[(serie ?? []).length - 1];
  const recaudoData = (serie ?? []).map((s) => ({ periodo: s.periodo, value: s.sumaPagado }));
  const carteraData = (serie ?? []).map((s) => ({ periodo: s.periodo, value: s.sumaTotalAPagar }));

  const totalRecaudo = (serie ?? []).reduce((s, r) => s + r.sumaPagado, 0);
  const unidadCount = detail?.unidadCount ?? 0;
  const pctOcup =
    unidadCount > 0 ? Math.round(((detail?.occupiedCount ?? 0) / unidadCount) * 100) : 0;

  return (
    <Section title="Reportes">
      {serie === undefined ? (
        <ActivityIndicator color={C.textSoft} style={{ marginTop: 30 }} />
      ) : (
        <>
          {/* KPIs */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <Kpi label="Recaudo total" value={cop(totalRecaudo)} icon="cash-outline" wide />
            <Kpi label="Cartera último período" value={ultimo ? cop(ultimo.sumaTotalAPagar) : "—"} icon="wallet-outline" wide />
            <Kpi label="Residentes" value={String(detail?.memberCount ?? 0)} icon="people-outline" />
            <Kpi label="Unidades" value={String(unidadCount)} icon="business-outline" />
            <Kpi label="% Ocupación" value={`${pctOcup}%`} icon="home-outline" />
          </View>

          {/* Recaudo */}
          <GlassCard style={{ padding: 18, marginBottom: 16 }}>
            <Text style={{ color: C.textSoft, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: 12 }}>RECAUDO POR PERÍODO</Text>
            <MiniBarChart data={recaudoData} />
          </GlassCard>

          {/* Cartera */}
          <GlassCard style={{ padding: 18, marginBottom: 16 }}>
            <Text style={{ color: C.textSoft, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: 12 }}>CARTERA FACTURADA POR PERÍODO</Text>
            <MiniBarChart data={carteraData} color={C.navy} />
          </GlassCard>
        </>
      )}
    </Section>
  );
}

function Kpi({ label, value, icon, wide }: { label: string; value: string; icon: React.ComponentProps<typeof Ionicons>["name"]; wide?: boolean }) {
  return (
    <View style={{ width: wide ? "48%" : "31%", backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.borderSoft, padding: 14, gap: 6, ...cardShadow }}>
      <Ionicons name={icon} size={18} color={C.textSoft} />
      <Text style={{ color: C.text, fontSize: wide ? 18 : 20, fontWeight: "700", letterSpacing: -0.5 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: C.textMuted, fontSize: 11 }} numberOfLines={2}>{label}</Text>
    </View>
  );
}
