import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CircleCheck,
  ExternalLink,
} from "lucide-react-native";
import { Badge, Button, Card, Header } from "@/components/ds";
import { Api } from "@/lib/api";
import { formatNotificationBody, relativeTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { colors } from "@/theme/colors";

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "action_required">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, [filter]);

  async function loadNotifications() {
    try {
      const data = await Api.listNotifications(filter);
      setNotifications(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleMarkAllRead() {
    await Api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function handleResolve(id: string) {
    const updated = await Api.resolveNotification(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true, resolved_at: new Date().toISOString() } : n))
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header
        title="Notifications"
        subtitle="Mentions & Action Items"
        rightAction={
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.readAllBtn}>
            <CheckCheck size={18} color={colors.accent} />
          </TouchableOpacity>
        }
      />

      {/* Filter Tabs */}
      <View style={styles.tabRow}>
        {(["all", "unread", "action_required"] as const).map((tab) => {
          const isActive = filter === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setFilter(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab === "all" ? "All" : tab === "unread" ? "Unread" : "Waiting on Me"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadNotifications();
              }}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <Card
              style={[
                styles.notifCard,
                !item.is_read && styles.unreadCard,
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.titleRow}>
                  {!item.is_read && <View style={styles.unreadDot} />}
                  <Text style={styles.title}>{item.title}</Text>
                </View>
                <Text style={styles.time}>{relativeTime(item.created_at)}</Text>
              </View>

              <Text style={styles.body}>
                {formatNotificationBody(item.body)}
              </Text>

              <View style={styles.cardFooter}>
                {item.requires_action && !item.resolved_at && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<CircleCheck size={14} color={colors.accent} />}
                    onPress={() => handleResolve(item.id)}
                  >
                    Resolve
                  </Button>
                )}
                {item.resolved_at && (
                  <Badge label="Resolved" color={colors.statusCompleted} bg={colors.statusCompletedBg} />
                )}
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  readAllBtn: {
    padding: 6,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtnActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  notifCard: {
    marginBottom: 10,
    padding: 14,
  },
  unreadCard: {
    borderColor: "rgba(0, 226, 97, 0.3)",
    backgroundColor: "rgba(0, 226, 97, 0.03)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  time: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  body: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    alignItems: "center",
  },
});
