import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, useRouter, useRootNavigationState } from "expo-router";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { CondominioProvider } from "@/context/condominio-context";
import { PushBootstrap } from "@/components/push-bootstrap";

function RedirectToLogin() {
  const router = useRouter();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return;
    router.replace("/(auth)/login" as never);
  }, [router, navState?.key]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FCFBFD",
      }}
    >
      <ActivityIndicator color="#0E0E0F" size="large" />
    </View>
  );
}

/**
 * Stack encima de Tabs → gesto “atrás” de iOS en módulos (Residentes, etc.)
 * y historial real al salir de Más.
 */
export default function AppLayout() {
  return (
    <>
      <AuthLoading>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FCFBFD",
          }}
        >
          <ActivityIndicator color="#0E0E0F" size="large" />
        </View>
      </AuthLoading>
      <Unauthenticated>
        <RedirectToLogin />
      </Unauthenticated>
      <Authenticated>
        <CondominioProvider>
          <PushBootstrap />
          <Stack
            screenOptions={{ headerShown: false, animation: "slide_from_right" }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="residentes" options={{ gestureEnabled: true }} />
            <Stack.Screen name="unidades" options={{ gestureEnabled: true }} />
            <Stack.Screen name="reservas" options={{ gestureEnabled: true }} />
            <Stack.Screen name="vehiculos" options={{ gestureEnabled: true }} />
            <Stack.Screen name="visitantes" options={{ gestureEnabled: true }} />
            <Stack.Screen
              name="guardia/visitantes"
              options={{ gestureEnabled: true }}
            />
            <Stack.Screen
              name="guardia/minuta"
              options={{ gestureEnabled: true }}
            />
            <Stack.Screen
              name="guardia/paqueteria"
              options={{ gestureEnabled: true }}
            />
            <Stack.Screen
              name="guardia/reservas"
              options={{ gestureEnabled: true }}
            />
            <Stack.Screen
              name="guardia/novedades"
              options={{ gestureEnabled: true }}
            />
            <Stack.Screen
              name="guardia/avisos"
              options={{ gestureEnabled: true }}
            />
            <Stack.Screen name="pqrs" options={{ gestureEnabled: true }} />
            <Stack.Screen name="privacidad" options={{ gestureEnabled: true }} />
            <Stack.Screen
              name="notificaciones"
              options={{ gestureEnabled: true }}
            />
            <Stack.Screen name="soporte" options={{ gestureEnabled: true }} />
            <Stack.Screen
              name="asambleas/index"
              options={{ gestureEnabled: true }}
            />
            <Stack.Screen
              name="asambleas/[id]"
              options={{ gestureEnabled: true }}
            />
            <Stack.Screen
              name="asambleas/apoderado"
              options={{ gestureEnabled: true }}
            />
            <Stack.Screen name="consejo" options={{ gestureEnabled: true }} />
            <Stack.Screen name="documentos" options={{ gestureEnabled: true }} />
            <Stack.Screen name="control" options={{ gestureEnabled: true }} />
            <Stack.Screen name="historial" options={{ gestureEnabled: true }} />
            <Stack.Screen name="reportes" options={{ gestureEnabled: true }} />
          </Stack>
        </CondominioProvider>
      </Authenticated>
    </>
  );
}
