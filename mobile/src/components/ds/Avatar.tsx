import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import { initials } from "@/lib/format";

interface AvatarProps {
  name?: string | null;
  url?: string | null;
  size?: number;
  presence?: "online" | "busy" | "away" | "focus" | "offline";
}

const PRESENCE_COLORS: Record<string, string> = {
  online: colors.presenceOnline,
  busy: colors.presenceBusy,
  away: colors.presenceAway,
  focus: colors.presenceFocus,
  offline: colors.presenceOffline,
};

export function Avatar({ name, url, size = 36, presence }: AvatarProps) {
  const dotSize = Math.max(8, Math.round(size * 0.26));

  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.surface3,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize: size * 0.38 }]}>
            {initials(name)}
          </Text>
        </View>
      )}

      {presence && (
        <View
          style={[
            styles.presenceDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: PRESENCE_COLORS[presence] || colors.presenceOffline,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: colors.surface2,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  initials: {
    color: colors.text,
    fontWeight: "700",
  },
  presenceDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
});
