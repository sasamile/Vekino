import { View, Text, Image, StyleSheet } from "react-native";
import { initials } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { SoftUI } from "@/lib/soft-ui";

export function UserAvatar({
  name,
  image,
  size = 40,
}: {
  name: string;
  image?: string | null;
  size?: number;
}) {
  const radius = size / 2;
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
        },
      ]}
      accessibilityLabel={`Avatar de ${name}`}
    >
      <Text
        style={[
          styles.initials,
          { fontSize: Math.max(12, size * 0.34) },
        ]}
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
  },
});
