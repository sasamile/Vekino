import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const scheme = (Constants.expoConfig?.scheme as string) ?? "vekino";
const baseURL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.trim();

if (!baseURL) {
  console.error(
    "[auth] Falta EXPO_PUBLIC_CONVEX_SITE_URL. Revisá apps/mobile/.env.local y reiniciá Metro con --clear.",
  );
}

export const authClient = createAuthClient({
  baseURL: baseURL ?? "https://agreeable-bee-782.convex.site",
  plugins: [
    expoClient({
      scheme,
      storagePrefix: scheme,
      storage: SecureStore,
    }),
    convexClient(),
  ],
});
