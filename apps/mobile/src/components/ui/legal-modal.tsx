import { View, Text, ScrollView, Modal, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SoftUI } from "@/lib/soft-ui";
import { AuthUI } from "@/lib/auth-ui";
import {
  PRIVACY_LEAD,
  PRIVACY_NOTE,
  PRIVACY_SECTIONS,
  TERMS_LEAD,
  TERMS_NOTE,
  TERMS_SECTIONS,
  type LegalSection,
} from "@/lib/legal-content";

export type LegalDoc = "terminos" | "privacidad";

type Props = {
  visible: boolean;
  doc: LegalDoc | null;
  onClose: () => void;
};

/**
 * Modal legal reutilizable (login / auth).
 * No requiere sesión.
 */
export function LegalModal({ visible, doc, onClose }: Props) {
  const isTerms = doc === "terminos";
  const title = isTerms ? "Términos de servicio" : "Política de privacidad";
  const lead = isTerms ? TERMS_LEAD : PRIVACY_LEAD;
  const sections = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const note = isTerms ? TERMS_NOTE : PRIVACY_NOTE;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={22} color={SoftUI.text} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lead}>{lead}</Text>
          {sections.map((s) => (
            <Section key={s.title} {...s} />
          ))}
          <View style={styles.note}>
            <Ionicons
              name={isTerms ? "document-text-outline" : "lock-closed-outline"}
              size={18}
              color={SoftUI.brand}
            />
            <Text style={styles.noteText}>{note}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, body }: LegalSection) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SoftUI.white,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SoftUI.space.sm,
    paddingBottom: SoftUI.space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SoftUI.divider,
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: AuthUI.font.semibold,
    color: SoftUI.text,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: SoftUI.padH,
    paddingTop: SoftUI.space.lg,
    paddingBottom: SoftUI.space.section,
  },
  lead: {
    fontSize: SoftUI.type.body.size,
    lineHeight: SoftUI.type.body.line,
    fontFamily: AuthUI.font.regular,
    color: SoftUI.textSecondary,
    marginBottom: SoftUI.space.xl,
  },
  section: {
    marginBottom: SoftUI.space.lg,
    gap: SoftUI.space.xs,
  },
  sectionTitle: {
    fontSize: SoftUI.type.body.size,
    fontFamily: AuthUI.font.semibold,
    color: SoftUI.text,
  },
  sectionBody: {
    fontSize: SoftUI.type.body.size,
    lineHeight: SoftUI.type.body.line,
    fontFamily: AuthUI.font.regular,
    color: SoftUI.text,
  },
  note: {
    marginTop: SoftUI.space.sm,
    padding: SoftUI.space.base,
    borderRadius: SoftUI.radius.cardSm,
    backgroundColor: SoftUI.brandSoft,
    flexDirection: "row",
    gap: SoftUI.space.sm,
    alignItems: "flex-start",
  },
  noteText: {
    flex: 1,
    fontSize: SoftUI.type.caption.size,
    lineHeight: SoftUI.type.caption.line + 1,
    fontFamily: AuthUI.font.regular,
    color: SoftUI.textSecondary,
  },
});
