import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { getStatusTheme } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";

interface StatusPillProps {
  status: TaskStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  const theme = getStatusTheme(status);

  return (
    <View style={[styles.pill, { backgroundColor: theme.bg, borderColor: theme.fg }]}>
      <View style={[styles.dot, { backgroundColor: theme.fg }]} />
      <Text style={[styles.text, { color: theme.fg }]}>{theme.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontSize: 11.5,
    fontWeight: "600",
  },
});
