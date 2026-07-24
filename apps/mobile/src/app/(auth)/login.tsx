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
import * as AppleAuthentication from "expo-apple-authentication";
import { authClient } from "@/lib/auth-client";
import { PastelShell } from "@/components/ui/pastel-shell";
import { GoogleLogo } from "@/components/ui/google-logo";
import { VekinoLogo } from "@/components/ui/vekino-logo";
import { AuthPrimaryButton } from "@/components/ui/auth-primary-button";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI, softShadow } from "@/lib/soft-ui";
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
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    storageGet(REMEMBER_KEY).then((v) => {
      if (v) {
        setEmail(v);
        setRemember(true);
      }
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
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

  async function signInWithApple() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const token = credential.identityToken;
      if (!token) {
        throw new Error("Apple no devolvió el token de identidad.");
      }
      const fullName = credential.fullName;
      const hasName = !!(fullName?.givenName || fullName?.familyName);
      const { error: authError } = await authClient.signIn.social({
        provider: "apple",
        idToken: {
          token,
          ...(hasName
            ? {
                user: {
                  name: {
                    firstName: fullName?.givenName ?? "",
                    lastName: fullName?.familyName ?? "",
                  },
                  ...(credential.email ? { email: credential.email } : {}),
                },
              }
            : {}),
        },
      });
      if (authError) {
        throw new Error(
          authErrorEs(authError.message, "No se pudo iniciar con Apple"),
        );
      }
      const { data: session } = await authClient.getSession();
      if (!session?.user) return;
      router.replace("/(app)" as never);
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code?: string }).code === "ERR_REQUEST_CANCELED"
      ) {
        return;
      }
      showError(
        authErrorEs(
          e instanceof Error ? e.message : null,
          "No se pudo iniciar con Apple. Inténtalo de nuevo.",
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
            <View style={styles.brand}>
              <View style={styles.logoMark}>
                <VekinoLogo size={34} color={SoftUI.white} />
              </View>
              <Text style={styles.brandName}>Vekino</Text>
            </View>

            <Text style={styles.title}>Iniciar sesión</Text>
            <Text style={styles.subtitle}>Qué bueno verte de nuevo</Text>

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

            <Text style={[styles.label, { marginTop: SoftUI.space.lg }]}>
              Contraseña
            </Text>
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
                  color={SoftUI.textDisabled}
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

            <View style={styles.primaryWrap}>
              <AuthPrimaryButton
                label="Ingresar"
                loading={loading}
                onPress={signIn}
              />
            </View>

            <Text style={styles.orCentered}>o continúa con</Text>

            {appleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                buttonStyle={
                  AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={SoftUI.radius.button}
                style={styles.appleBtn}
                onPress={() => {
                  if (loading) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  void signInWithApple();
                }}
              />
            ) : null}

            <Pressable
              style={[styles.secondaryBtn, { opacity: loading ? 0.7 : 1 }]}
              disabled={loading}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                void signInWithGoogle();
              }}
            >
              {loading ? (
                <ActivityIndicator color={SoftUI.text} />
              ) : (
                <>
                  <GoogleLogo size={20} />
                  <Text style={styles.secondaryLabel}>Continuar con Google</Text>
                </>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(auth)/codigo-asamblea" as never);
              }}
              style={styles.secondaryBtn}
            >
              <Ionicons name="key-outline" size={18} color={SoftUI.text} />
              <Text style={styles.secondaryLabel}>
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
    paddingHorizontal: SoftUI.padH,
    paddingBottom: SoftUI.space.xl,
  },
  brand: {
    marginTop: SoftUI.space.lg,
    marginBottom: SoftUI.space.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.sm,
  },
  logoMark: {
    width: SoftUI.iconBtn,
    height: SoftUI.iconBtn,
    borderRadius: SoftUI.radius.icon,
    backgroundColor: SoftUI.blue,
    alignItems: "center",
    justifyContent: "center",
    ...softShadow,
  },
  brandName: {
    fontFamily: AuthUI.font.bold,
    fontSize: SoftUI.type.section.size,
    lineHeight: SoftUI.type.section.line,
    color: SoftUI.text,
    letterSpacing: -0.3,
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
  eye: {
    position: "absolute",
    right: SoftUI.space.base,
    height: SoftUI.fieldH,
    justifyContent: "center",
  },
  fieldErr: {
    fontFamily: AuthUI.font.regular,
    fontSize: SoftUI.type.caption.size,
    color: SoftUI.danger,
    marginTop: SoftUI.space.xs,
  },
  rowOptions: {
    marginTop: SoftUI.space.base,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  remember: {
    flexDirection: "row",
    alignItems: "center",
    gap: SoftUI.space.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: SoftUI.divider,
    backgroundColor: SoftUI.white,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: SoftUI.blue,
    borderColor: SoftUI.blue,
  },
  rememberLabel: {
    fontFamily: AuthUI.font.regular,
    fontSize: SoftUI.type.caption.size + 1,
    color: SoftUI.text,
  },
  forgot: {
    fontFamily: AuthUI.font.medium,
    fontSize: SoftUI.type.caption.size + 1,
    color: SoftUI.blue,
  },
  primaryWrap: {
    marginTop: SoftUI.space.xxl,
  },
  orCentered: {
    marginTop: SoftUI.space.xxl,
    marginBottom: SoftUI.space.base,
    textAlign: "center",
    fontFamily: AuthUI.font.regular,
    fontSize: SoftUI.type.caption.size,
    color: SoftUI.textSecondary,
  },
  appleBtn: {
    alignSelf: "stretch",
    height: SoftUI.buttonH,
    marginBottom: SoftUI.space.md,
  },
  secondaryBtn: {
    alignSelf: "stretch",
    height: SoftUI.buttonH,
    borderRadius: SoftUI.radius.button,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: SoftUI.divider,
    backgroundColor: SoftUI.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SoftUI.space.lg,
    marginBottom: SoftUI.space.md,
  },
  secondaryLabel: {
    marginLeft: SoftUI.space.md,
    fontFamily: AuthUI.font.medium,
    fontSize: SoftUI.type.body.size,
    color: SoftUI.text,
  },
  legal: {
    marginTop: SoftUI.space.lg,
    marginBottom: SoftUI.space.sm,
    textAlign: "center",
    fontFamily: AuthUI.font.regular,
    fontSize: SoftUI.type.caption.size,
    lineHeight: SoftUI.type.caption.line + 2,
    color: SoftUI.textSecondary,
  },
  legalLink: {
    fontFamily: AuthUI.font.semibold,
    color: SoftUI.text,
  },
});
