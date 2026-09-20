import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BookOpen,
  ChevronRight,
  FileText,
  Lock,
  Search,
  UserCheck,
} from "lucide-react-native";
import { Badge, Card, Header, TextInput } from "@/components/ds";
import { Api } from "@/lib/api";
import { DOC_CATEGORIES, type DocCategory, type DocPage, type DocSpace } from "@/lib/types";
import { colors } from "@/theme/colors";

const CATEGORY_COLORS: Record<DocCategory, string> = {
  Technical: "#38bdf8",
  Marketing: "#f472b6",
  Operations: "#fbbf24",
  Platform: "#00E261",
  Business: "#a78bfa",
  Designs: "#fb923c",
};

export default function DocsScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<DocCategory>("Platform");
  const [spaces, setSpaces] = useState<DocSpace[]>([]);
  const [pages, setPages] = useState<DocPage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDocs();
  }, [selectedCategory]);

  async function loadDocs() {
    setLoading(true);
    try {
      const [sData, pData] = await Promise.all([
        Api.listSpaces(selectedCategory).catch(() => []),
        Api.listPages(selectedCategory).catch(() => []),
      ]);
      setSpaces(sData);
      setPages(pData);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const categoryColor = CATEGORY_COLORS[selectedCategory];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header
        title="Knowledge"
        subtitle="Internal Docs & Specifications"
      />

      {/* 6 Canonical Category Selector Chips */}
      <View style={styles.categoryScroll}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {DOC_CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat;
            const cColor = CATEGORY_COLORS[cat];
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  isActive && {
                    backgroundColor: `${cColor}20`,
                    borderColor: cColor,
                  },
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    isActive && { color: cColor, fontWeight: "700" },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadDocs();
            }}
            tintColor={colors.accent}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Spaces in this Category */}
            <Text style={styles.sectionHeading}>
              {selectedCategory} Spaces ({spaces.length})
            </Text>

            {spaces.length === 0 ? (
              <Card style={{ alignItems: "center", paddingVertical: 20 }}>
                <BookOpen size={28} color={colors.textTertiary} style={{ marginBottom: 6 }} />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  No spaces under {selectedCategory} yet.
                </Text>
              </Card>
            ) : (
              spaces.map((space) => (
                <Card key={space.id} style={styles.spaceCard}>
                  <View style={styles.spaceHeader}>
                    <View style={styles.spaceTitleRow}>
                      <BookOpen size={16} color={categoryColor} />
                      <Text style={styles.spaceName}>{space.name}</Text>
                      {space.is_private && <Lock size={12} color={colors.textTertiary} />}
                    </View>
                    <Badge
                      label={selectedCategory}
                      color={categoryColor}
                      bg={`${categoryColor}15`}
                    />
                  </View>
                  {space.description && (
                    <Text style={styles.spaceDesc}>{space.description}</Text>
                  )}
                  {space.responsible_user_name && (
                    <View style={styles.responsibleRow}>
                      <UserCheck size={13} color={colors.textTertiary} />
                      <Text style={styles.responsibleText}>
                        Lead: {space.responsible_user_name}
                      </Text>
                    </View>
                  )}
                </Card>
              ))
            )}

            {/* Pages under this Category */}
            <Text style={[styles.sectionHeading, { marginTop: 20 }]}>
              {selectedCategory} Articles ({pages.length})
            </Text>

            {pages.length === 0 ? (
              <Card style={{ alignItems: "center", paddingVertical: 20 }}>
                <FileText size={28} color={colors.textTertiary} style={{ marginBottom: 6 }} />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  No pages published in {selectedCategory}.
                </Text>
              </Card>
            ) : (
              pages.map((page) => (
                <TouchableOpacity
                  key={page.id}
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push(`/(app)/(docs)/${page.space_id}/${page.id}`)
                  }
                >
                  <Card style={styles.pageCard}>
                    <View style={styles.pageRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pageTitle}>{page.title}</Text>
                        <Text style={styles.pageMeta}>
                          {page.space_name || selectedCategory} • updated {new Date(page.updated_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={colors.textTertiary} />
                    </View>
                  </Card>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  categoryScroll: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  spaceCard: {
    marginBottom: 10,
  },
  spaceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  spaceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  spaceName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  spaceDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
  },
  responsibleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  responsibleText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  pageCard: {
    marginBottom: 8,
    paddingVertical: 12,
  },
  pageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageTitle: {
    fontSize: 14.5,
    fontWeight: "600",
    color: colors.text,
  },
  pageMeta: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 3,
  },
});
