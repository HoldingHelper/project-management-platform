import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@/theme/colors";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  highlight?: boolean;
}

export function Card({ children, style, highlight = false }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        highlight && styles.highlight,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface1,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  highlight: {
    borderColor: "rgba(0, 226, 97, 0.3)",
    backgroundColor: "rgba(0, 226, 97, 0.03)",
  },
});
