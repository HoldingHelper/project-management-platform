import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type TextInputProps as RNTextInputProps,
} from "react-native";
import { colors } from "@/theme/colors";

interface TextInputProps extends RNTextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function TextInput({ label, error, icon, style, ...props }: TextInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.focused,
          !!error && styles.errorBorder,
        ]}
      >
        {icon && <View style={styles.icon}>{icon}</View>}
        <RNTextInput
          placeholderTextColor={colors.textTertiary}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[styles.input, style]}
          {...props}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  focused: {
    borderColor: colors.accent,
  },
  errorBorder: {
    borderColor: colors.statusBlocked,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    height: "100%",
  },
  errorText: {
    fontSize: 12,
    color: colors.statusBlocked,
    marginTop: 4,
  },
});
