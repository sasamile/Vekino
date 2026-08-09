import { Alert, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

/**
 * Abre un documento (PDF, imagen, adjunto) SIN sacar al usuario de la app.
 *
 * Usa el visor incrustado del sistema — SFSafariViewController en iOS,
 * Custom Tabs en Android — que renderiza PDFs y trae su propio botón de
 * cerrar. `Linking.openURL` queda solo como salvavidas: manda el archivo al
 * navegador externo si el visor interno falla.
 */
export async function openDocument(
  url: string | null | undefined,
  opts?: { accent?: string },
): Promise<void> {
  const destino = url?.trim();
  if (!destino) {
    Alert.alert(
      "Documento no disponible",
      "Este archivo todavía no tiene un enlace válido. Avísale a la administración.",
    );
    return;
  }

  try {
    await WebBrowser.openBrowserAsync(destino, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      dismissButtonStyle: "close",
      enableBarCollapsing: true,
      ...(opts?.accent ? { controlsColor: opts.accent } : {}),
    });
  } catch {
    try {
      await Linking.openURL(destino);
    } catch {
      Alert.alert(
        "No se pudo abrir",
        "Revisa tu conexión e inténtalo de nuevo.",
      );
    }
  }
}
