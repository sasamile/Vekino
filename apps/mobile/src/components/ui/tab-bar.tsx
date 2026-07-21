import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useCondominio } from "@/context/condominio-context";
import { AuthUI } from "@/lib/auth-ui";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const TAB_CONFIG: Record<
  string,
  { label: string; labelPanel?: string; icon: IoniconName; iconActive: IoniconName }
> = {
  index: { label: "Inicio", labelPanel: "Panel", icon: "grid-outline", iconActive: "grid" },
  administradores: { label: "Admins", icon: "shield-outline", iconActive: "shield" },
  facturas: { label: "Facturas", icon: "wallet-outline", iconActive: "wallet" },
  comunicados: { label: "Avisos", icon: "megaphone-outline", iconActive: "megaphone" },
  mas: { label: "Más", icon: "apps-outline", iconActive: "apps" },
  perfil: { label: "Perfil", icon: "person-outline", iconActive: "person" },
};

const TABS_CONDOMINIO = ["index", "facturas", "comunicados", "mas", "perfil"];
const TABS_PANEL = ["index", "administradores", "perfil"];
const TABS_GUARDIA = ["index", "mas", "perfil"];

function TabItem({
  name,
  focused,
  panelMode,
  accent,
  activeBg,
  onPress,
}: {
  name: string;
  focused: boolean;
  panelMode: boolean;
  accent: string;
  activeBg: string;
  onPress: () => void;
}) {
  const config = TAB_CONFIG[name] ?? {
    label: name,
    icon: "ellipse-outline" as IoniconName,
    iconActive: "ellipse" as IoniconName,
  };
  const label = panelMode && config.labelPanel ? config.labelPanel : config.label;
  const color = focused ? (panelMode ? AuthUI.text : accent) : AuthUI.textMuted;
  const pillBg = focused
    ? panelMode
      ? "rgba(14,14,15,0.06)"
      : activeBg
    : undefined;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={styles.tabItem}
      hitSlop={4}
    >
      <View style={[styles.tabPill, pillBg ? { backgroundColor: pillBg } : null]}>
        <Ionicons
          name={focused ? config.iconActive : config.icon}
          size={21}
          color={color}
        />
        <Text
          style={[
            styles.tabLabel,
            { color },
            focused && styles.tabLabelActive,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Navbar liquid glass blanca — blur claro sobre el glow del fondo. */
export function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { condominioId, isSuperadmin, isGuardia, theme } = useCondominio();
  const panelMode = isSuperadmin && !condominioId;
  const visible = panelMode
    ? TABS_PANEL
    : isGuardia
      ? TABS_GUARDIA
      : TABS_CONDOMINIO;
  const routes = state.routes.filter((r) => visible.includes(r.name));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom * 0.35, 6) }]}
    >
      <View style={styles.glassOuter}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={64} tint="light" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.androidFill]} />
        )}
        {/* Capa blanca semitransparente: fondo blanco + deja pasar el blur/glow */}
        <View style={styles.whiteWash} pointerEvents="none" />
        <View style={styles.sheen} pointerEvents="none" />
        <View style={styles.tabs}>
          {routes.map((route) => {
            const originalIndex = state.routes.findIndex((r) => r.key === route.key);
            const focused = state.index === originalIndex;
            return (
              <TabItem
                key={route.key}
                name={route.name}
                focused={focused}
                panelMode={panelMode}
                accent={theme.accent}
                activeBg={theme.tabActiveBg}
                onPress={() => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!event.defaultPrevented) navigation.navigate(route.name);
                }}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    zIndex: 50,
  },
  glassOuter: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "rgba(14,14,15,0.08)",
    backgroundColor: "rgba(255,255,255,0.55)",
    shadowColor: "#0E0E0F",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  androidFill: {
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  whiteWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  sheen: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.95)",
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
  },
  tabPill: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 18,
    minWidth: 64,
  },
  tabLabel: {
    fontFamily: AuthUI.font.medium,
    fontSize: 11,
  },
  tabLabelActive: {
    fontFamily: AuthUI.font.semibold,
  },
});
