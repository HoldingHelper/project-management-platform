import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Building,
  LogOut,
  Mail,
  ScanFace,
  Shield,
  Smartphone,
  User as UserIcon,
} from "lucide-react-native";
import { Avatar, Badge, Button, Card, Header } from "@/components/ds";
import { StatusPickerSheet } from "@/components/status/StatusPickerSheet";
import { useAuth } from "@/lib/authContext";
import { Storage } from "@/lib/storage";
import { colors } from "@/theme/colors";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, isBiometricAvailable } = useAuth();
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [statusSheetVisible, setStatusSheetVisible] = useState(false);

  async function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  async function toggleBiometric(val: boolean) {
    setBiometricEnabled(val);
    await Storage.setBiometricEnabled(val);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header title="My Profile" subtitle="Account & App Settings" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* User Card */}
        <Card style={styles.profileCard}>
          <Avatar
            name={user?.full_name}
            url={user?.avatar_url}
            size={68}
            presence={user?.presence_status || "online"}
          />
          <Text style={styles.userName}>{user?.full_name || "User"}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>

          {/* Slack-style Status Pill */}
          <TouchableOpacity
            style={styles.statusPill}
            onPress={() => setStatusSheetVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 15 }}>{user?.status_emoji || "💬"}</Text>
            <Text style={styles.statusPillText} numberOfLines={1}>
              {user?.status_text || "Set custom status…"}
            </Text>
            <Text style={styles.statusEditText}>Edit</Text>
          </TouchableOpacity>

          {user?.is_super_admin && (
            <Badge
              label="Super Admin"
              color={colors.accent}
              bg={colors.accentMuted}
              style={{ marginTop: 8 }}
            />
          )}
        </Card>

        {/* Organization Info */}
        <Text style={styles.sectionHeading}>Department & Role</Text>
        <Card>
          <View style={styles.row}>
            <Building size={18} color={colors.textTertiary} />
            <Text style={styles.rowLabel}>Department</Text>
            <Text style={styles.rowValue}>
              {user?.department_name || "Operations / Engineering"}
            </Text>
          </View>
          <View style={styles.row}>
            <Shield size={18} color={colors.textTertiary} />
            <Text style={styles.rowLabel}>System Access</Text>
            <Text style={styles.rowValue}>
              {user?.is_super_admin ? "Full Admin" : "Active Member"}
            </Text>
          </View>
        </Card>

        {/* Security & Biometrics */}
        <Text style={styles.sectionHeading}>Security</Text>
        <Card>
          {isBiometricAvailable && (
            <View style={[styles.row, { paddingVertical: 4 }]}>
              <ScanFace size={18} color={colors.accent} />
              <Text style={styles.rowLabel}>Face ID / Touch ID Unlock</Text>
              <Switch
                value={biometricEnabled}
                onValueChange={toggleBiometric}
                trackColor={{ false: colors.surface3, true: colors.accent }}
                thumbColor="#ffffff"
              />
            </View>
          )}
          <View style={styles.row}>
            <Smartphone size={18} color={colors.textTertiary} />
            <Text style={styles.rowLabel}>App Version</Text>
            <Text style={styles.rowValue}>v1.0.0 (Build 1)</Text>
          </View>
        </Card>

        {/* Sign Out Button */}
        <Button
          variant="danger"
          icon={<LogOut size={18} color={colors.statusBlocked} />}
          onPress={handleLogout}
          style={{ marginTop: 24 }}
        >
          Sign Out
        </Button>
      </ScrollView>

      <StatusPickerSheet
        visible={statusSheetVisible}
        onClose={() => setStatusSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    alignItems: "center",
    paddingVertical: 24,
  },
  userName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginTop: 12,
  },
  userEmail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
    marginTop: 12,
    maxWidth: "90%",
  },
  statusPillText: {
    fontSize: 12.5,
    color: colors.text,
    fontWeight: "500",
    flexShrink: 1,
  },
  statusEditText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    marginLeft: 4,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  rowValue: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
});
