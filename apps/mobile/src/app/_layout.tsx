import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Appearance, View } from "react-native";
import { ConvexReactClient } from "convex/react";
import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";
import { useAuthFonts } from "@/lib/use-auth-fonts";

// Fuerza modo claro a nivel JS/RN para que el tab bar nativo
// nunca adopte el tema oscuro del sistema, ni en dev ni en prod.
Appearance.setColorScheme("light");

const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL as string,
  { unsavedChangesWarning: false }
);

export default function RootLayout() {
  const fontsLoaded = useAuthFonts();

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />;
  }

  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient as unknown as AuthClient}
    >
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </ConvexBetterAuthProvider>
  );
}
