import React from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCondominio } from "@/context/condominio-context";
import { NoCondominioScreen } from "@/components/ui/no-condominio";
import { CondominioHeader } from "@/components/ui/condominio-header";
import { ScreenBackground } from "@/components/ui/glass";

/** Scaffold común para pantallas de módulo del condominio. */
export function Section({
  title,
  right,
  children,
  scroll = true,
  showBack = true,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** false = FlatList interno maneja el scroll (paginación). */
  scroll?: boolean;
  /** Chevron atrás + gesto iOS (stack). */
  showBack?: boolean;
}) {
  const { condominioId, isSuperadmin } = useCondominio();

  if (isSuperadmin && !condominioId) return <NoCondominioScreen />;

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          {scroll ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 200, paddingHorizontal: 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              contentInsetAdjustmentBehavior="automatic"
            >
              <CondominioHeader
                condominioId={condominioId}
                title={title}
                right={right}
                showBack={showBack}
              />
              {children}
            </ScrollView>
          ) : (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
              <CondominioHeader
                condominioId={condominioId}
                title={title}
                right={right}
                showBack={showBack}
              />
              <View style={{ flex: 1 }}>{children}</View>
            </View>
          )}
        </SafeAreaView>
      </ScreenBackground>
    </View>
  );
}
