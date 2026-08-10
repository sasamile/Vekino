import { View, Text, Image, StyleSheet } from "react-native";
import { initials } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI } from "@/lib/soft-ui";
import { useCondominio } from "@/context/condominio-context";

export function UserAvatar({
  name,
  image,
  size = 40,
}: {
  name: string;
  image?: string | null;
  size?: number;
}) {
  const { theme } = useCondominio();
  const radius = size / 2;
  const fuente = Math.max(12, Math.round(size * 0.34));
  const uri = typeof image === "string" && image.trim().length > 0 ? image.trim() : null;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
        accessibilityLabel={`Avatar de ${name}`}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: theme.accentSoft,
        },
      ]}
      accessibilityLabel={`Avatar de ${name}`}
    >
      <Text
        style={[
          styles.initials,
          {
            fontSize: fuente,
            // Sin un lineHeight explícito el Text de iOS reserva su propio
            // espacio de línea y las iniciales quedan corridas hacia arriba.
            lineHeight: fuente,
            color: theme.accent,
          },
        ]}
        numberOfLines={1}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: SoftUI.infoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontFamily: AuthUI.font.bold,
    color: SoftUI.blue,
    textAlign: "center",
    // Android: quita el relleno vertical que la fuente trae de fábrica.
    includeFontPadding: false,
  },
});
