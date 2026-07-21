"use client";
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  type TextInput as TextInputType,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { authClient } from "@/lib/auth-client";
import { PastelShell } from "@/components/ui/pastel-shell";
import { GoogleLogo } from "@/components/ui/google-logo";
import { AuthUI } from "@/lib/auth-ui";
import { useAuthFonts } from "@/lib/use-auth-fonts";
import { storageGet, storageRemove, storageSet } from "@/lib/storage";
import { Toast } from "@/components/ui/toast";
import { authErrorEs } from "@/lib/auth-errors";

const REMEMBER_KEY = "vekino_remember_email";

export default function LoginScreen() {
  const fontsLoaded = useAuthFonts();
  const router = useRouter();
  const passwordRef = useRef<TextInputType>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    storageGet(REMEMBER_KEY).then((v) => {
      if (v) {
        setEmail(v);
        setRemember(true);
      }
    });
  }, []);

  function showError(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 4200);
  }

  async function signIn() {
    const next: typeof fieldError = {};
    const mail = email.trim().toLowerCase();
    if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      next.email = "Ingresa un correo válido.";
    }
    if (!password) next.password = "Ingresa tu contraseña.";
    setFieldError(next);
    if (Object.keys(next).length) {
      if (next.email) showError(next.email);
      else if (next.password) showError(next.password);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await authClient.signIn.email({
        email: mail,
        password,
      });
      if (authError) {
        throw new Error(
          authErrorEs(authError.message, "Correo o contraseña incorrectos"),
        );
      }
      if (remember) await storageSet(REMEMBER_KEY, mail);
      else await storageRemove(REMEMBER_KEY);
      router.replace("/(app)" as never);
    } catch (e) {
      showError(
        authErrorEs(
          e instanceof Error ? e.message : null,
          "No se pudo iniciar sesión. Inténtalo de nuevo.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (authError) {
        throw new Error(
          authErrorEs(authError.message, "No se pudo iniciar con Google"),
        );
      }
      // Si el usuario cierra el modal de Google, signIn.social resuelve sin
      // error (solo devolvió la URL OAuth). No entrar sin sesión real.
      const { data: session } = await authClient.getSession();
      if (!session?.user) return;
      router.replace("/(app)" as never);
    } catch (e) {
      showError(
        authErrorEs(
          e instanceof Error ? e.message : null,
          "No se pudo iniciar con Google. Inténtalo de nuevo.",
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
        <Toast message={error} type="error" position="bottom" />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ marginTop: 28 }}>
              <Text style={styles.title}>Iniciar sesión</Text>
              <Text style={styles.subtitle}>Qué bueno verte de nuevo</Text>
            </View>

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
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                style={styles.input}
              />
            </View>
            {fieldError.email ? (
              <Text style={styles.fieldErr}>{fieldError.email}</Text>
            ) : null}

            <Text style={[styles.label, { marginTop: 27 }]}>Contraseña</Text>
            <View style={styles.field}>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder="Tu contraseña"
                placeholderTextColor={AuthUI.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={signIn}
                style={[styles.input, { paddingRight: 48 }]}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eye}
                hitSlop={10}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={22}
                  color={AuthUI.placeholder}
                />
              </Pressable>
            </View>
            {fieldError.password ? (
              <Text style={styles.fieldErr}>{fieldError.password}</Text>
            ) : null}

            <View style={styles.rowOptions}>
              <Pressable
                onPress={() => setRemember((v) => !v)}
                style={styles.remember}
                hitSlop={6}
              >
                <View style={[styles.checkbox, remember && styles.checkboxOn]}>
                  {remember ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : null}
                </View>
                <Text style={styles.rememberLabel}>Recordarme</Text>
              </Pressable>
              <Text
                style={styles.forgot}
                onPress={() => router.push("/(auth)/forgot-password" as never)}
              >
                ¿Olvidaste tu contraseña?
              </Text>
            </View>

            <View
              style={[styles.primaryBtn, { opacity: loading ? 0.7 : 1 }]}
              onTouchEnd={() => {
                if (loading) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                signIn();
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryLabel}>Ingresar</Text>
              )}
            </View>

            <Text style={styles.orCentered}>o continúa con</Text>

            {/* Botón Google: full-width + borde fino (como la referencia) */}
            <Pressable
              style={[styles.googleBtn, { opacity: loading ? 0.7 : 1 }]}
              disabled={loading}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                void signInWithGoogle();
              }}
            >
              {loading ? (
                <ActivityIndicator color="#0E0E0F" />
              ) : (
                <>
                  <GoogleLogo size={20} />
                  <Text style={styles.googleLabel}>Continuar con Google</Text>
                </>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(auth)/codigo-asamblea" as never);
              }}
              style={styles.codigoLink}
            >
              <Ionicons name="key-outline" size={18} color={AuthUI.text} />
              <Text style={styles.codigoLinkText}>
                Iniciar con código para asamblea
              </Text>
            </Pressable>
            <Text style={styles.legal}>
              Al continuar aceptas los{" "}
              <Text style={styles.legalLink}>Términos de servicio</Text>
              {"\n"}y la{" "}
              <Text style={styles.legalLink}>Política de privacidad</Text>
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
  eye: {
    position: "absolute",
    right: 18,
    height: AuthUI.fieldH,
    justifyContent: "center",
  },
  fieldErr: {
    fontFamily: AuthUI.font.regular,
    fontSize: 13,
    color: "#dc2626",
    marginTop: 6,
  },
  rowOptions: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  remember: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: AuthUI.border,
    backgroundColor: AuthUI.white,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: AuthUI.purple,
    borderColor: AuthUI.purple,
  },
  rememberLabel: {
    fontFamily: AuthUI.font.regular,
    fontSize: 15,
    color: AuthUI.text,
  },
  forgot: {
    fontFamily: AuthUI.font.regular,
    fontSize: 15,
    color: AuthUI.text,
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
  orCentered: {
    marginTop: 40,
    marginBottom: 16,
    textAlign: "center",
    fontFamily: AuthUI.font.regular,
    fontSize: 14,
    color: AuthUI.textMuted,
  },
  googleBtn: {
    alignSelf: "stretch",
    height: 56,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "#D4D2D8",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  googleLabel: {
    marginLeft: 12,
    fontFamily: AuthUI.font.medium,
    fontSize: 16,
    color: "#0E0E0F",
  },
  legal: {
    marginTop: 28,
    marginBottom: 8,
    textAlign: "center",
    fontFamily: AuthUI.font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: AuthUI.textMuted,
  },
  legalLink: {
    fontFamily: AuthUI.font.semibold,
    color: "#3A393E",
  },
  codigoLink: {
    marginTop: 20,
    marginBottom: 12,
    alignSelf: "stretch",
    height: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "#D4D2D8",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  codigoLinkText: {
    fontFamily: AuthUI.font.medium,
    fontSize: 15,
    color: "#0E0E0F",
  },
});
