import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, Authenticated } from "convex/react";
import { api } from "@vekino/backend/api";
import { useCondominio } from "@/context/condominio-context";
import { SoftHomeHeader } from "@/components/ui/soft-home-header";
import {
  ScreenBackground,
  GlassCard,
  GlassBadge,
  GlassSection,
} from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { fmtFechaCorta } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI } from "@/lib/soft-ui";

const CAT_LABEL: Record<string, string> = {
  reglamento: "Reglamento",
  acta: "Acta",
  contrato: "Contrato",
  comunicado: "Comunicado",
  financiero: "Financiero",
  otro: "Otro",
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentosScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <Authenticated>
          <Inner />
        </Authenticated>
      </ScreenBackground>
    </View>
  );
}

function Inner() {
  const { condominioId, condominioName } = useCondominio();
  const me = useQuery(api.users.me);
  const data = useQuery(
    api.documentos.listByCondominio,
    condominioId ? { condominioId } : "skip",
  );

  const hora = new Date().getHours();
  const saludo =
    hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";

  return (
    <View style={{ flex: 1 }}>
      <SoftHomeHeader
        saludo={saludo}
        displayName={me?.name ?? "Residente"}
        avatarUrl={me?.image}
        badgeLabel={condominioName ?? "Documentos"}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {data === undefined ? (
          <ActivityIndicator color={SoftUI.blue} style={{ marginTop: 30 }} />
        ) : data.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Ionicons
              name="document-text-outline"
              size={32}
              color={SoftUI.textSecondary}
            />
            <Text style={styles.emptyText}>Sin documentos publicados</Text>
          </GlassCard>
        ) : (
          <GlassSection
            title={`${data.length} documento${data.length === 1 ? "" : "s"}`}
          >
            <View style={{ gap: SoftUI.space.md }}>
              {data.map((d) => (
                <Tap
                  key={d._id}
                  onPress={() => d.url && Linking.openURL(d.url)}
                  haptic={false}
                >
                  <GlassCard style={styles.card}>
                    <View style={styles.row}>
                      <View style={styles.iconWrap}>
                        <Ionicons
                          name="document-text"
                          size={22}
                          color={SoftUI.blue}
                        />
                      </View>
                      <View style={styles.body}>
                        <Text style={styles.title} numberOfLines={1}>
                          {d.nombre}
                        </Text>
                        <Text style={styles.meta}>
                          {fmtSize(d.tamanio)} · {d.autorNombre} ·{" "}
                          {fmtFechaCorta(d.createdAt)}
                        </Text>
                      </View>
                      <View style={styles.right}>
                        <GlassBadge
                          label={CAT_LABEL[d.categoria] ?? d.categoria}
                          tone="blue"
                        />
                        <View style={styles.downloadBtn}>
                          <Ionicons
                            name="download-outline"
                            size={16}
                            color={SoftUI.blue}
                          />
                        </View>
                      </View>
                    </View>
                  </GlassCard>
                </Tap>
              ))}
            </View>
          </GlassSection>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 150,
    paddingHorizontal: SoftUI.padH,
    paddingTop: SoftUI.space.md,
  },
  emptyCard: {
    padding: SoftUI.space.xxl,
    alignItems: "center",
    gap: SoftUI.space.md,
  },
  emptyText: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.caption.size + 1,
    fontFamily: AuthUI.font.regular,
    textAlign: "center",
  },
  card: {
    padding: SoftUI.space.base,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.md,
  },
  iconWrap: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.infoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  title: {
    color: SoftUI.text,
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.semibold,
  },
  meta: {
    color: SoftUI.textSecondary,
    fontSize: SoftUI.type.chip.size,
    fontFamily: AuthUI.font.regular,
  },
  right: {
    alignItems: "flex-end",
    gap: SoftUI.space.sm,
  },
  downloadBtn: {
    width: 32,
    height: 32,
    borderRadius: SoftUI.radius.chip,
    backgroundColor: SoftUI.infoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
