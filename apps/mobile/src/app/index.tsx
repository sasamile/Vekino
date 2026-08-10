import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter, useRootNavigationState } from "expo-router";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { StatusBar } from "expo-status-bar";
import { storageGet } from "@/lib/storage";
import { ONBOARDING_KEY, SPLASH_ONLY } from "@/lib/auth-ui";
import { SplashPantalla, SplashMarca } from "@/components/ui/splash-marca";
import { useSplashCumplido } from "@/lib/arranque";

/**
 * `esperarSplash` retiene el salto hasta que la animación se vea completa.
 * Solo se usa hacia el login: ahí no hay nada que precargar, así que la espera
 * es puro momento de marca. Hacia la app NO se espera aquí — conviene entrar
 * ya y aprovechar ese tiempo cargando datos (lo hace `(app)/_layout`).
 */
function Redirect({ to, esperarSplash = false }: { to: string; esperarSplash?: boolean }) {
  const router = useRouter();
  const navState = useRootNavigationState();
  const splashCumplido = useSplashCumplido();

  useEffect(() => {
    if (!navState?.key) return;
    if (esperarSplash && !splashCumplido) return;
    router.replace(to as never);
  }, [router, to, navState?.key, esperarSplash, splashCumplido]);

  return <SplashPantalla />;
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

  if (!target) return <SplashPantalla />;

  return <Redirect to={target} esperarSplash />;
}

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: "#FCFBFD" }}>
      <StatusBar style="dark" />
      <AuthLoading>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <SplashMarca />
        </View>
      </AuthLoading>
      <Unauthenticated>
        <UnauthGate />
      </Unauthenticated>
      <Authenticated>
        {SPLASH_ONLY ? (
          <Redirect to="/(auth)/welcome" esperarSplash />
        ) : (
          <Redirect to="/(app)" />
        )}
      </Authenticated>
    </View>
  );
}
