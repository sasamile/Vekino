import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import { bloqueaPorVersion, urlTienda } from "@/lib/version-minima";

/**
 * Pantalla de "actualiza la app" (Fase 4).
 *
 * La app informa su versión (`expo.version` de `app.json`, la que quedó en el
 * build) y el backend dice si ya no sirve (`appMovil.versionMinima`). Sin la
 * variable `MOVIL_VERSION_MINIMA` en el deployment no bloquea a nadie.
 *
 * Va en la raíz, fuera de la sesión: también la pantalla de ingreso avisa.
 */
export function AvisoVersionMinima() {
  const version = Constants.expoConfig?.version;
  const respuesta = useQuery(api.appMovil.versionMinima, {
    version: version ?? undefined,
    plataforma: Platform.OS,
  });
  if (!bloqueaPorVersion(respuesta)) return null;
  const tienda = urlTienda(Platform.OS);
  return (
    <View style={[StyleSheet.absoluteFill, styles.fondo]}>
      <Text style={styles.titulo}>Actualiza Vekino</Text>
      <Text style={styles.texto}>{respuesta?.mensaje}</Text>
      {tienda ? (
        <Pressable style={styles.boton} onPress={() => Linking.openURL(tienda)}>
          <Text style={styles.botonTexto}>Ir a la tienda</Text>
        </Pressable>
      ) : null}
      <Text style={styles.pie}>
        Tienes la versión {version ?? "desconocida"}; la mínima es {respuesta?.versionMinima}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  titulo: { fontSize: 22, fontWeight: "700", color: "#042046", textAlign: "center" },
  texto: { fontSize: 15, color: "#3A4A5E", textAlign: "center" },
  boton: { backgroundColor: "#042046", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  botonTexto: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  pie: { fontSize: 12, color: "#7A8796", textAlign: "center" },
});
