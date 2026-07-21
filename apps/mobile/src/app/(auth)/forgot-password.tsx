"use client";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { authClient } from "@/lib/auth-client";
import { PastelShell } from "@/components/ui/pastel-shell";
import { AuthUI } from "@/lib/auth-ui";
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
            <Text style={styles.title}>¿Olvidaste tu contraseña?</Text>
            <Text style={styles.subtitle}>
              Te enviaremos un enlace a tu correo
            </Text>

            <Text style={[styles.label, { marginTop: 44 }]}>Correo</Text>
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

            <View
              style={[styles.primaryBtn, { opacity: loading ? 0.7 : 1 }]}
              onTouchEnd={() => {
                if (loading) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                submit();
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryLabel}>Enviar enlace</Text>
              )}
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
    paddingHorizontal: AuthUI.padH,
    paddingTop: 28,
    paddingBottom: 24,
  },
  title: {
    fontFamily: AuthUI.font.bold,
    fontSize: 32,
    lineHeight: 38,
    color: AuthUI.text,
  },
  subtitle: {
    fontFamily: AuthUI.font.regular,
    fontSize: 17,
    color: "#171719",
    marginTop: 6,
  },
  label: {
    fontFamily: AuthUI.font.semibold,
    fontSize: 17,
    color: AuthUI.text,
  },
  field: {
    marginTop: 10,
    height: AuthUI.fieldH,
    borderRadius: AuthUI.radiusField,
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: "rgba(255,255,255,0.92)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  input: {
    fontFamily: AuthUI.font.regular,
    fontSize: 16,
    letterSpacing: 0,
    color: AuthUI.text,
    paddingVertical: 0,
    height: AuthUI.fieldH - 2,
  },
  err: {
    marginTop: 12,
    fontFamily: AuthUI.font.regular,
    fontSize: 13,
    color: "#dc2626",
  },
  ok: {
    marginTop: 12,
    fontFamily: AuthUI.font.regular,
    fontSize: 13,
    color: "#16a34a",
  },
  primaryBtn: {
    marginTop: 44,
    height: AuthUI.btnH,
    borderRadius: AuthUI.radiusBtn,
    backgroundColor: "#0E0E0F",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: {
    fontFamily: AuthUI.font.semibold,
    fontSize: 19,
    color: "#FFFFFF",
  },
  back: {
    marginTop: 24,
    textAlign: "center",
    fontFamily: AuthUI.font.semibold,
    fontSize: 15,
    color: AuthUI.text,
  },
});
