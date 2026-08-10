/**
 * Carga segura de react-native-webrtc.
 *
 * En Expo Go el módulo nativo no existe: un `import` estático tumba toda la
 * ruta de la sala (Metro reporta "missing default export"). Aquí se comprueba
 * el nativo antes de hacer `require`.
 */
import type { ComponentType } from "react";
import { NativeModules } from "react-native";
import Constants from "expo-constants";

export type WebRtcModule = {
  RTCView: ComponentType<{
    streamURL: string;
    style?: object;
    objectFit?: "contain" | "cover";
    mirror?: boolean;
    zOrder?: number;
  }>;
  RTCPeerConnection: typeof import("react-native-webrtc").RTCPeerConnection;
  mediaDevices: typeof import("react-native-webrtc").mediaDevices;
  MediaStream: typeof import("react-native-webrtc").MediaStream;
};

let cached: WebRtcModule | null | undefined;

export function webrtcDisponible(): boolean {
  /* Expo Go nunca trae el nativo; no intentes cargarlo. */
  if (Constants.appOwnership === "expo") return false;
  return !!NativeModules.WebRTCModule;
}

export function getWebRtc(): WebRtcModule | null {
  if (cached !== undefined) return cached;
  if (!webrtcDisponible()) {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("react-native-webrtc") as WebRtcModule;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}
