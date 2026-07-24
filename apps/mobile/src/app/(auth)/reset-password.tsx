"use client";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { C } from "@/lib/theme";
import { authClient } from "@/lib/auth-client";
import { VekinoLogo } from "@/components/ui/vekino-logo";
import { AuthShell, authStyles as s } from "@/components/ui/auth-shell";
import { AuthPrimaryButton } from "@/components/ui/auth-primary-button";
import { authErrorEs } from "@/lib/auth-errors";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focus, setFocus] = useState<"password" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    if (!token) {
      setError("Enlace inválido o expirado. Solicita uno nuevo.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (authError) {
        throw new Error(
          authErrorEs(authError.message, "No se pudo restablecer la contraseña."),
        );
      }
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(
        authErrorEs(
          e instanceof Error ? e.message : null,
          "No se pudo restablecer la contraseña. Inténtalo de nuevo.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.brand}>
              <View style={s.logoWrap}>
                <VekinoLogo size={34} color={C.brand} />
              </View>
              <Text style={s.brandName}>Vekino</Text>
              <Text style={s.tagline}>Nueva contraseña</Text>
            </View>

            <View style={s.card}>
              <BlurView intensity={55} tint="light" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
              <View style={s.cardInner}>
                <Text style={s.title}>{success ? "Listo" : "Nueva contraseña"}</Text>
                <Text style={s.subtitle}>
                  {success
                    ? "Tu contraseña se actualizó correctamente"
                    : "Mínimo 8 caracteres"}
                </Text>

                {!success ? (
                  <>
                    <Text style={s.label}>Contraseña</Text>
                    <View
                      style={[s.inputRow, focus === "password" && s.inputRowFocused]}
                    >
                      <Ionicons name="lock-closed-outline" size={18} color={C.textMuted} />
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        placeholderTextColor={C.textMuted}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        onFocus={() => setFocus("password")}
                        onBlur={() => setFocus(null)}
                        style={s.input}
                      />
                      <Text
                        onPress={() => setShowPassword((v) => !v)}
                        style={{ color: C.textMuted, fontSize: 13, fontWeight: "600", padding: 4 }}
                      >
                        {showPassword ? "Ocultar" : "Ver"}
                      </Text>
                    </View>

                    <Text style={s.label}>Confirmar</Text>
                    <View
                      style={[
                        s.inputRow,
                        focus === "confirm" && s.inputRowFocused,
                        { marginBottom: 0 },
                      ]}
                    >
                      <Ionicons name="lock-closed-outline" size={18} color={C.textMuted} />
                      <TextInput
                        value={confirm}
                        onChangeText={setConfirm}
                        placeholder="••••••••"
                        placeholderTextColor={C.textMuted}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        returnKeyType="done"
                        onSubmitEditing={submit}
                        onFocus={() => setFocus("confirm")}
                        onBlur={() => setFocus(null)}
                        style={s.input}
                      />
                    </View>

                    {error ? (
                      <View style={s.errorBox}>
                        <Text style={s.errorText}>{error}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: 16 }}>
              <AuthPrimaryButton
                label={success ? "Ir a iniciar sesión" : "Guardar contraseña"}
                loading={loading}
                onPress={() => {
                  if (success) {
                    router.replace("/(auth)/login" as never);
                    return;
                  }
                  submit();
                }}
              />
            </View>

            {!success ? (
              <Text
                style={s.linkMuted}
                onPress={() => router.replace("/(auth)/login" as never)}
              >
                Volver a iniciar sesión
              </Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AuthShell>
  );
}
