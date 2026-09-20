import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Lock, Mail, ScanFace, Sparkles } from "lucide-react-native";
import { Button, Card, TextInput } from "@/components/ds";
import { useAuth } from "@/lib/authContext";
import { colors } from "@/theme/colors";

export default function LoginScreen() {
  const router = useRouter();
  const { user, login, loginWithBiometrics, isBiometricAvailable } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      router.replace("/(app)/(home)");
    }
  }, [user]);

  async function handleLogin() {
    if (!identifier || !password) {
      setError("Please fill in all fields");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(identifier, password);
      router.replace("/(app)/(home)");
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometricLogin() {
    setError(null);
    const success = await loginWithBiometrics();
    if (success) {
      router.replace("/(app)/(home)");
    } else {
      setError("Biometric login failed or expired. Please use password.");
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <View style={styles.brandContainer}>
            <View style={styles.logoBadge}>
              <Sparkles size={28} color="#000000" />
            </View>
            <Text style={styles.brandTitle}>Project Management Platform</Text>
            <Text style={styles.brandSubtitle}>
              Internal Docs, Tasks & Team Execution
            </Text>
          </View>

          {/* Form Card */}
          <Card style={styles.formCard}>
            <Text style={styles.formTitle}>Sign In</Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TextInput
              label="Email or Username"
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="e.g. admin@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              icon={<Mail size={18} color={colors.textTertiary} />}
            />

            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              icon={<Lock size={18} color={colors.textTertiary} />}
            />

            <Button
              onPress={handleLogin}
              loading={loading}
              style={{ marginTop: 8 }}
            >
              Sign In with Password
            </Button>

            {isBiometricAvailable && (
              <Button
                variant="secondary"
                onPress={handleBiometricLogin}
                icon={<ScanFace size={18} color={colors.accent} />}
                style={{ marginTop: 12 }}
              >
                Sign In with Face ID / Touch ID
              </Button>
            )}
          </Card>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: 24,
    justifyContent: "center",
    minHeight: "100%",
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  formCard: {
    padding: 20,
    backgroundColor: colors.surface1,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: colors.statusBlocked,
    fontSize: 13,
  },
  demoSection: {
    marginTop: 28,
    alignItems: "center",
  },
  demoHeading: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  demoRow: {
    flexDirection: "row",
    gap: 8,
  },
  demoChip: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  demoChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
});
