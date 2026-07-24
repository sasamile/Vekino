import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Authenticated } from "convex/react";
import { ScreenBackground, GlassCard } from "@/components/ui/glass";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI } from "@/lib/soft-ui";
import {
  PRIVACY_LEAD,
  PRIVACY_NOTE,
  PRIVACY_SECTIONS,
} from "@/lib/legal-content";

export default function PrivacidadScreen() {
  return (
    <Authenticated>
      <Inner />
    </Authenticated>
  );
}

function Inner() {
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <View style={styles.header}>
            <Tap onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={AuthUI.text} />
            </Tap>
            <Text style={styles.title}>Privacidad</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.lead}>{PRIVACY_LEAD}</Text>

            {PRIVACY_SECTIONS.map((s) => (
              <View key={s.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{s.title}</Text>
                <Text style={styles.sectionBody}>{s.body}</Text>
              </View>
            ))}

            <GlassCard style={styles.note}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={SoftUI.brand}
              />
              <Text style={styles.noteText}>{PRIVACY_NOTE}</Text>
            </GlassCard>
          </ScrollView>
        </SafeAreaView>
      </ScreenBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  lead: {
    fontSize: 14,
    color: AuthUI.textMuted,
    lineHeight: 20,
    marginBottom: 18,
  },
  section: { marginBottom: 18, gap: 6 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
  sectionBody: {
    fontSize: 14,
    color: AuthUI.text,
    lineHeight: 21,
    fontFamily: AuthUI.font.regular,
  },
  note: {
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: AuthUI.textMuted,
    lineHeight: 19,
  },
});
