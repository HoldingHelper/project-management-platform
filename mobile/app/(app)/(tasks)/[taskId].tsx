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
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  User,
} from "lucide-react-native";
import { Avatar, Badge, Button, Card, Header, StatusPill } from "@/components/ds";
import { Api } from "@/lib/api";
import { getPriorityColor, relativeTime } from "@/lib/format";
import type { Task, TaskStatus } from "@/lib/types";
import { colors } from "@/theme/colors";

const STATUSES: TaskStatus[] = [
  "NotStarted",
  "InProgress",
  "Blocked",
  "Review",
  "Done",
];

export default function TaskDetailScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (taskId) loadTask();
  }, [taskId]);

  async function loadTask() {
    try {
      const data = await Api.getTask(taskId);
      setTask(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(status: TaskStatus) {
    if (!task) return;
    setUpdating(true);
    try {
      const updated = await Api.updateTaskStatus(task.id, status);
      setTask(updated);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Task Details"
          leftAction={
            <TouchableOpacity onPress={() => router.back()}>
              <ArrowLeft size={22} color={colors.text} />
            </TouchableOpacity>
          }
        />
        <View style={{ padding: 24, alignItems: "center" }}>
          <Text style={{ color: colors.textSecondary }}>Task not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header
        title="Task"
        subtitle={task.id.slice(0, 8)}
        leftAction={
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title & Priority Header */}
        <Card>
          <View style={styles.topRow}>
            <StatusPill status={task.status} />
            <Badge
              label={task.priority}
              color={getPriorityColor(task.priority)}
              bg="rgba(255,255,255,0.06)"
            />
          </View>
          <Text style={styles.title}>{task.title}</Text>
          {task.description ? (
            <Text style={styles.description}>{task.description}</Text>
          ) : (
            <Text style={[styles.description, { fontStyle: "italic" }]}>
              No description provided.
            </Text>
          )}
        </Card>

        {/* Status Transition Picker */}
        <Text style={styles.sectionHeading}>Update Status</Text>
        <Card>
          <View style={styles.statusGrid}>
            {STATUSES.map((st) => (
              <TouchableOpacity
                key={st}
                style={[
                  styles.statusOption,
                  task.status === st && styles.statusOptionActive,
                ]}
                disabled={updating}
                onPress={() => handleStatusChange(st)}
              >
                <Text
                  style={[
                    styles.statusOptionText,
                    task.status === st && styles.statusOptionTextActive,
                  ]}
                >
                  {st}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Assignees */}
        <Text style={styles.sectionHeading}>Assignees</Text>
        <Card>
          {task.assignees?.length > 0 ? (
            task.assignees.map((a) => (
              <View key={a.id} style={styles.assigneeRow}>
                <Avatar name={a.full_name} url={a.avatar_url} size={28} />
                <Text style={styles.assigneeName}>{a.full_name || "Team Member"}</Text>
              </View>
            ))
          ) : (
            <Text style={{ color: colors.textTertiary, fontSize: 13 }}>
              Unassigned
            </Text>
          )}
        </Card>

        {/* Meta info */}
        <Text style={styles.sectionHeading}>Details</Text>
        <Card>
          <View style={styles.metaRow}>
            <Clock size={16} color={colors.textTertiary} />
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>{relativeTime(task.created_at)}</Text>
          </View>
          {task.due_date && (
            <View style={styles.metaRow}>
              <Calendar size={16} color={colors.textTertiary} />
              <Text style={styles.metaLabel}>Due Date</Text>
              <Text style={styles.metaValue}>
                {new Date(task.due_date).toLocaleDateString()}
              </Text>
            </View>
          )}
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
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 24,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    lineHeight: 20,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusOptionActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  statusOptionText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  statusOptionTextActive: {
    color: colors.accent,
  },
  assigneeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  assigneeName: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  metaLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 8,
    flex: 1,
  },
  metaValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
  },
});
