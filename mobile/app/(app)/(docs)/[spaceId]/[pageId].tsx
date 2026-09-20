import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, BookOpen, Calendar, User } from "lucide-react-native";
import { Badge, Card, Header } from "@/components/ds";
import { Api } from "@/lib/api";
import type { DocPage } from "@/lib/types";
import { colors } from "@/theme/colors";

export default function DocPageReaderScreen() {
  const { spaceId, pageId } = useLocalSearchParams<{ spaceId: string; pageId: string }>();
  const router = useRouter();
  const [page, setPage] = useState<DocPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (spaceId && pageId) {
      loadPage();
    }
  }, [spaceId, pageId]);

  async function loadPage() {
    try {
      const data = await Api.getPage(spaceId, pageId);
      setPage(data);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!page) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Document"
          leftAction={
            <TouchableOpacity onPress={() => router.back()}>
              <ArrowLeft size={22} color={colors.text} />
            </TouchableOpacity>
          }
        />
        <View style={{ padding: 24, alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary }}>Document not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header
        title={page.title}
        subtitle={page.category || "Documentation"}
        leftAction={
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Article Meta Header */}
        <View style={styles.metaBox}>
          <View style={styles.metaRow}>
            <Calendar size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>
              Updated {new Date(page.updated_at).toLocaleDateString()}
            </Text>
          </View>
          {page.category && (
            <Badge label={page.category} color={colors.accent} bg={colors.accentMuted} />
          )}
        </View>

        {/* Article Markdown Body Content */}
        <Card style={styles.contentCard}>
          <Text style={styles.bodyText}>
            {page.body_markdown || "No content written yet."}
          </Text>
        </Card>
      </ScrollView>
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
  metaBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12.5,
    color: colors.textTertiary,
  },
  contentCard: {
    padding: 18,
    backgroundColor: colors.surface1,
  },
  bodyText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 24,
  },
});
