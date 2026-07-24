"use client";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { authClient } from "@/lib/auth-client";
import { PastelShell } from "@/components/ui/pastel-shell";
import { AuthPrimaryButton } from "@/components/ui/auth-primary-button";
import { Tap } from "@/components/ui/tap";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI } from "@/lib/soft-ui";
import { useAuthFonts } from "@/lib/use-auth-fonts";
import { authErrorEs } from "@/lib/auth-errors";

const scheme = (Constants.expoConfig?.scheme as string) ?? "vekino";

export default function ForgotPasswordScreen() {
  const fontsLoaded = useAuthFonts();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!email.trim()) {
      setError("Ingresa tu correo electrónico.");
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: `${scheme}://reset-password`,
      });
      if (authError) {
        throw new Error(
          authErrorEs(authError.message, "No se pudo enviar el enlace."),
        );
      }
      setSuccess(
        "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
      );
    } catch (e) {
      setError(
        authErrorEs(
          e instanceof Error ? e.message : null,
          "No se pudo enviar el enlace. Inténtalo de nuevo.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  if (!fontsLoaded) {
    return (
      <PastelShell>
        <View style={{ flex: 1 }} />
      </PastelShell>
    );
  }

  return (
    <PastelShell>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Tap onPress={() => router.back()}>
              <View style={styles.backBtn}>
                <Ionicons name="arrow-back" size={20} color={SoftUI.text} />
              </View>
            </Tap>

            <Text style={styles.title}>¿Olvidaste tu contraseña?</Text>
            <Text style={styles.subtitle}>
              Te enviaremos un enlace a tu correo
            </Text>

            <Text style={[styles.label, { marginTop: SoftUI.space.xxl }]}>
              Correo
            </Text>
            <View style={styles.field}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="tu@correo.com"
                placeholderTextColor={AuthUI.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submit}
                style={styles.input}
              />
            </View>

            {error ? <Text style={styles.err}>{error}</Text> : null}
            {success ? <Text style={styles.ok}>{success}</Text> : null}

            <View style={styles.primaryWrap}>
              <AuthPrimaryButton
                label="Enviar enlace"
                loading={loading}
                onPress={submit}
              />
            </View>

            <Text style={styles.back} onPress={() => router.back()}>
              Volver a iniciar sesión
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </PastelShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SoftUI.padH,
    paddingTop: SoftUI.space.sm,
    paddingBottom: SoftUI.space.xl,
  },
  backBtn: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.icon,
    backgroundColor: SoftUI.bgSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SoftUI.space.xl,
  },
  title: {
    fontFamily: AuthUI.font.bold,
    fontSize: SoftUI.type.hero.size,
    lineHeight: SoftUI.type.hero.line,
    color: SoftUI.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: AuthUI.font.regular,
    fontSize: SoftUI.type.body.size,
    lineHeight: SoftUI.type.body.line,
    color: SoftUI.textSecondary,
    marginTop: SoftUI.space.xs,
  },
  label: {
    fontFamily: AuthUI.font.semibold,
    fontSize: SoftUI.type.body.size,
    color: SoftUI.text,
  },
  field: {
    marginTop: SoftUI.space.sm,
    height: SoftUI.fieldH,
    borderRadius: SoftUI.radius.field,
    borderWidth: 1,
    borderColor: SoftUI.divider,
    backgroundColor: SoftUI.field,
    justifyContent: "center",
    paddingHorizontal: SoftUI.space.base,
  },
  input: {
    fontFamily: AuthUI.font.regular,
    fontSize: SoftUI.type.body.size,
    letterSpacing: 0,
    color: SoftUI.text,
    paddingVertical: 0,
    height: SoftUI.fieldH - 2,
  },
  err: {
    marginTop: SoftUI.space.md,
    fontFamily: AuthUI.font.regular,
    fontSize: SoftUI.type.caption.size,
    color: SoftUI.danger,
  },
  ok: {
    marginTop: SoftUI.space.md,
    fontFamily: AuthUI.font.regular,
    fontSize: SoftUI.type.caption.size,
    color: SoftUI.success,
  },
  primaryWrap: {
    marginTop: SoftUI.space.xxl,
  },
  back: {
    marginTop: SoftUI.space.xl,
    textAlign: "center",
    fontFamily: AuthUI.font.semibold,
    fontSize: SoftUI.type.body.size,
    color: SoftUI.brand,
  },
});
