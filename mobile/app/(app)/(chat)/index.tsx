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
import { Hash, Lock, MessageSquare, Radio, Users } from "lucide-react-native";
import { Badge, Card, Header } from "@/components/ds";
import { Api } from "@/lib/api";
import type { ChatChannel } from "@/lib/types";
import { colors } from "@/theme/colors";

export default function ChatListScreen() {
  const router = useRouter();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadChannels();
  }, []);

  async function loadChannels() {
    try {
      const data = await Api.listChannels();
      setChannels(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header
        title="Channels & Chat"
        subtitle="Real-time Team Collaboration"
      />

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={channels}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadChannels();
              }}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push(`/(app)/(chat)/${item.id}`)}
            >
              <Card style={styles.channelCard}>
                <View style={styles.channelRow}>
                  <View style={styles.iconBox}>
                    {item.type === "private" ? (
                      <Lock size={18} color={colors.textSecondary} />
                    ) : item.type === "direct" ? (
                      <Users size={18} color={colors.accent} />
                    ) : (
                      <Hash size={18} color={colors.accent} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.channelName}>{item.name}</Text>
                    {item.topic && (
                      <Text style={styles.channelTopic} numberOfLines={1}>
                        {item.topic}
                      </Text>
                    )}
                  </View>
                  {item.unread_count && item.unread_count > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadCount}>{item.unread_count}</Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            </TouchableOpacity>
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
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  channelCard: {
    marginBottom: 8,
    paddingVertical: 12,
  },
  channelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  channelName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  channelTopic: {
    fontSize: 12.5,
    color: colors.textTertiary,
    marginTop: 2,
  },
  unreadBadge: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  unreadCount: {
    fontSize: 11,
    fontWeight: "800",
    color: "#000000",
  },
});
