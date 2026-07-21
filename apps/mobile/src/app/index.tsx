import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter, useRootNavigationState } from "expo-router";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { StatusBar } from "expo-status-bar";
import { storageGet } from "@/lib/storage";
import { ONBOARDING_KEY, SPLASH_ONLY } from "@/lib/auth-ui";

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return;
    router.replace(to as never);
  }, [router, to, navState?.key]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FCFBFD" }}>
      <ActivityIndicator color="#0E0E0F" size="large" />
    </View>
  );
}

function UnauthGate() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (SPLASH_ONLY) {
      setTarget("/(auth)/welcome");
      return;
    }
    storageGet(ONBOARDING_KEY).then((done) => {
      setTarget(done ? "/(auth)/login" : "/(auth)/welcome");
    });
  }, []);

  if (!target) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FCFBFD" }}>
        <ActivityIndicator color="#0E0E0F" size="large" />
      </View>
    );
  }

  return <Redirect to={target} />;
}

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: "#FCFBFD" }}>
      <StatusBar style="dark" />
      <AuthLoading>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#0E0E0F" size="large" />
        </View>
      </AuthLoading>
      <Unauthenticated>
        <UnauthGate />
      </Unauthenticated>
      <Authenticated>
        {SPLASH_ONLY ? <Redirect to="/(auth)/welcome" /> : <Redirect to="/(app)" />}
      </Authenticated>
    </View>
  );
}
