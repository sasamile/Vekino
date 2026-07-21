import { Alert } from "react-native";

type DocumentPickerModule = typeof import("expo-document-picker");

let cached: DocumentPickerModule | null | undefined;

/**
 * Carga expo-document-picker solo al usarlo.
 * Si el binario nativo aún no se reconstruyó, avisa en vez de tumbar la pantalla.
 */
export async function getDocumentPicker(): Promise<DocumentPickerModule | null> {
  if (cached !== undefined) return cached;
  try {
    cached = await import("expo-document-picker");
    return cached;
  } catch {
    cached = null;
    Alert.alert(
      "Reinicia la app nativa",
      "Para adjuntar PDFs hay que reconstruir iOS (bunx expo run:ios). Las fotos sí funcionan.",
    );
    return null;
  }
}
