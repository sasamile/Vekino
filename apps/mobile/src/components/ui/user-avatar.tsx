import { View, Text, Image, StyleSheet } from "react-native";
import { initials } from "@/lib/utils";
import { AuthUI } from "@/lib/auth-ui";
import { C } from "@/lib/theme";

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
  if (image) {
    return (
      <Image
        source={{ uri: image }}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
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
    >
      <Text style={[styles.initials, { fontSize: size * 0.32 }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: C.bgSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontFamily: AuthUI.font.semibold,
    color: AuthUI.text,
  },
});
