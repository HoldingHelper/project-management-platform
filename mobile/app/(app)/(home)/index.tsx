import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  Sparkles,
} from "lucide-react-native";
import { Avatar, Badge, Card, Header, StatusPill } from "@/components/ds";
import { StatusPickerSheet } from "@/components/status/StatusPickerSheet";
import { Api } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { getPriorityColor } from "@/lib/format";
import type { Project, Task } from "@/lib/types";
import { colors } from "@/theme/colors";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusSheetVisible, setStatusSheetVisible] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [pData, tData] = await Promise.all([
        Api.listProjects().catch(() => []),
        Api.listTasks().catch(() => []),
      ]);
      setProjects(pData);
      setTasks(tData);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const assignedTasks = tasks.filter((t) =>
    user ? t.assignees?.some((a) => a.user_id === user.id) : false
  );
  const activeProjects = projects.filter((p) => p.status === "Active");
  const blockedTasks = tasks.filter((t) => t.status === "Blocked");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header
        title={`Hi, ${user?.full_name?.split(" ")[0] || "there"}`}
        subtitle={user?.department_name ? `${user.department_name} Department` : "Overview"}
        rightAction={
          <TouchableOpacity
            onPress={() => setStatusSheetVisible(true)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            {user?.status_emoji ? (
              <View
                style={{
                  backgroundColor: colors.surface2,
                  borderRadius: 12,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  borderWidth: 1,
                  borderColor: colors.borderSubtle,
                }}
              >
                <Text style={{ fontSize: 13 }}>{user.status_emoji}</Text>
              </View>
            ) : null}
            <Avatar
              name={user?.full_name}
              url={user?.avatar_url}
              size={36}
              presence={user?.presence_status || "online"}
            />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor={colors.accent}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Blocker Alert Banner if any */}
            {blockedTasks.length > 0 && (
              <Card style={styles.blockerCard}>
                <View style={styles.blockerHeader}>
                  <AlertCircle size={20} color={colors.statusBlocked} />
                  <Text style={styles.blockerTitle}>
                    {blockedTasks.length} Task{blockedTasks.length > 1 ? "s" : ""} Blocked
                  </Text>
                </View>
                <Text style={styles.blockerText}>
                  Action required to keep sprint velocity on track.
                </Text>
              </Card>
            )}

            {/* Quick Metrics */}
            <View style={styles.metricsRow}>
              <View style={styles.metricBox}>
                <Text style={styles.metricNumber}>{assignedTasks.length}</Text>
                <Text style={styles.metricLabel}>Assigned to Me</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricNumber}>{activeProjects.length}</Text>
                <Text style={styles.metricLabel}>Active Projects</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={[styles.metricNumber, { color: colors.accent }]}>
                  {tasks.filter((t) => t.status === "Done").length}
                </Text>
                <Text style={styles.metricLabel}>Completed</Text>
              </View>
            </View>

            {/* My Focus Tasks */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Focus Tasks</Text>
              <TouchableOpacity
                onPress={() => router.push("/(app)/(tasks)")}
                style={styles.seeAllBtn}
              >
                <Text style={styles.seeAllText}>View All</Text>
                <ArrowRight size={14} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {assignedTasks.length === 0 ? (
              <Card style={{ alignItems: "center", paddingVertical: 24 }}>
                <CheckCircle2 size={32} color={colors.accent} style={{ marginBottom: 8 }} />
                <Text style={{ color: colors.text, fontWeight: "600" }}>All Caught Up!</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                  No pending tasks assigned to you right now.
                </Text>
              </Card>
            ) : (
              assignedTasks.slice(0, 4).map((task) => (
                <TouchableOpacity
                  key={task.id}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/(app)/(tasks)/${task.id}`)}
                >
                  <Card>
                    <View style={styles.taskTopRow}>
                      <StatusPill status={task.status} />
                      <Badge
                        label={task.priority}
                        color={getPriorityColor(task.priority)}
                        bg="rgba(255,255,255,0.06)"
                      />
                    </View>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    {task.checklist_total > 0 && (
                      <Text style={styles.checklistText}>
                        ✓ {task.checklist_completed}/{task.checklist_total} items
                      </Text>
                    )}
                  </Card>
                </TouchableOpacity>
              ))
            )}

            {/* Active Projects */}
            <View style={[styles.sectionHeader, { marginTop: 16 }]}>
              <Text style={styles.sectionTitle}>Active Projects</Text>
            </View>

            {activeProjects.slice(0, 3).map((project) => (
              <Card key={project.id}>
                <View style={styles.projectHeader}>
                  <FolderKanban size={18} color={colors.accent} />
                  <Text style={styles.projectName} numberOfLines={1}>
                    {project.name}
                  </Text>
                </View>
                {project.description && (
                  <Text style={styles.projectDesc} numberOfLines={2}>
                    {project.description}
                  </Text>
                )}
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${project.progress_pct}%` },
                    ]}
                  />
                </View>
                <View style={styles.projectFooter}>
                  <Text style={styles.progressText}>Progress</Text>
                  <Text style={styles.progressPct}>{project.progress_pct}%</Text>
                </View>
              </Card>
            ))}
          </>
        )}
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
  blockerCard: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  blockerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  blockerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.statusBlocked,
    marginLeft: 8,
  },
  blockerText: {
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  metricNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textTertiary,
    marginTop: 4,
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent,
  },
  taskTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  checklistText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
  },
  projectHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  projectName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
  },
  projectDesc: {
    fontSize: 12.5,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.surface3,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 8,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  projectFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  progressText: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
});
