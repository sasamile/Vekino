import { Tabs } from "expo-router";
import { GlassTabBar } from "@/components/ui/tab-bar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="administradores" />
      <Tabs.Screen name="facturas" />
      <Tabs.Screen name="comunicados" />
      <Tabs.Screen name="mas" />
      <Tabs.Screen name="perfil" />
    </Tabs>
  );
}
