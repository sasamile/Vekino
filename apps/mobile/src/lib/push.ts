import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushPermissionState = "granted" | "denied" | "undetermined";

export async function getPushPermission(): Promise<PushPermissionState> {
  if (!Device.isDevice) return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

/**
 * Pide permiso (si hace falta) y devuelve el Expo Push Token, o null si
 * el usuario lo rechazó / no es un dispositivo físico.
 */
export async function ensurePushRegistration(): Promise<{
  permission: PushPermissionState;
  token: string | null;
  platform: "ios" | "android" | "web";
} | null> {
  if (Platform.OS === "web") {
    return { permission: "denied", token: null, platform: "web" };
  }
  if (!Device.isDevice) {
    return { permission: "denied", token: null, platform: Platform.OS === "ios" ? "ios" : "android" };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Avisos",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }

  const permission: PushPermissionState =
    status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";

  if (permission !== "granted") {
    return {
      permission,
      token: null,
      platform: Platform.OS === "ios" ? "ios" : "android",
    };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  try {
    const push = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return {
      permission: "granted",
      token: push.data,
      platform: Platform.OS === "ios" ? "ios" : "android",
    };
  } catch {
    return {
      permission: "granted",
      token: null,
      platform: Platform.OS === "ios" ? "ios" : "android",
    };
  }
}
