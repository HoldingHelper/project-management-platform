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
import { CheckSquare, Columns3, Filter, List, Plus } from "lucide-react-native";
import { Badge, Button, Card, Header, StatusPill } from "@/components/ds";
import { Api } from "@/lib/api";
import { getPriorityColor } from "@/lib/format";
import type { Task, TaskStatus } from "@/lib/types";
import { colors } from "@/theme/colors";

const KANBAN_COLS: { title: string; status: TaskStatus }[] = [
  { title: "To Do", status: "NotStarted" },
  { title: "In Progress", status: "InProgress" },
  { title: "Blocked", status: "Blocked" },
  { title: "Done", status: "Done" },
];

export default function TasksScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      const data = await Api.listTasks();
      setTasks(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const filteredTasks = tasks.filter((t) => {
    if (selectedStatus === "all") return true;
    return t.status === selectedStatus;
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header
        title="Tasks"
        subtitle={`${tasks.length} total across all projects`}
        rightAction={
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                viewMode === "list" && styles.toggleBtnActive,
              ]}
              onPress={() => setViewMode("list")}
            >
              <List size={16} color={viewMode === "list" ? "#000" : colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                viewMode === "board" && styles.toggleBtnActive,
              ]}
              onPress={() => setViewMode("board")}
            >
              <Columns3 size={16} color={viewMode === "board" ? "#000" : colors.textTertiary} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {["all", "NotStarted", "InProgress", "Blocked", "Done"].map((st) => (
            <TouchableOpacity
              key={st}
              style={[
                styles.filterChip,
                selectedStatus === st && styles.filterChipActive,
              ]}
              onPress={() => setSelectedStatus(st)}
            >
              <Text
                style={[
                  styles.filterText,
                  selectedStatus === st && styles.filterTextActive,
                ]}
              >
                {st === "all" ? "All Tasks" : st}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : viewMode === "list" ? (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadTasks();
              }}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push(`/(app)/(tasks)/${item.id}`)}
            >
              <Card>
                <View style={styles.taskTop}>
                  <StatusPill status={item.status} />
                  <Badge
                    label={item.priority}
                    color={getPriorityColor(item.priority)}
                    bg="rgba(255,255,255,0.06)"
                  />
                </View>
                <Text style={styles.taskTitle}>{item.title}</Text>
                {item.description && (
                  <Text style={styles.taskDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
                {item.checklist_total > 0 && (
                  <View style={styles.taskBottom}>
                    <Text style={styles.checklist}>
                      ✓ {item.checklist_completed}/{item.checklist_total} subtasks
                    </Text>
                  </View>
                )}
              </Card>
            </TouchableOpacity>
          )}
        />
      ) : (
        /* Kanban Horizontal Column Scroll */
        <ScrollView
          horizontal
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.boardContent}
        >
          {KANBAN_COLS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <View key={col.status} style={styles.kanbanColumn}>
                <View style={styles.colHeader}>
                  <Text style={styles.colTitle}>{col.title}</Text>
                  <Text style={styles.colCount}>{colTasks.length}</Text>
                </View>
                <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                  {colTasks.map((task) => (
                    <TouchableOpacity
                      key={task.id}
                      activeOpacity={0.8}
                      onPress={() => router.push(`/(app)/(tasks)/${task.id}`)}
                    >
                      <Card style={styles.kanbanCard}>
                        <View style={styles.taskTop}>
                          <Badge
                            label={task.priority}
                            color={getPriorityColor(task.priority)}
                            bg="rgba(255,255,255,0.06)"
                          />
                        </View>
                        <Text style={styles.kanbanTaskTitle} numberOfLines={2}>
                          {task.title}
                        </Text>
                      </Card>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: colors.accent,
  },
  filterRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  filterText: {
    fontSize: 12.5,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  filterTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  taskTop: {
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
  taskDesc: {
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 4,
  },
  taskBottom: {
    marginTop: 8,
  },
  checklist: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  boardContent: {
    padding: 16,
    gap: 12,
  },
  kanbanColumn: {
    width: 270,
    backgroundColor: colors.surface1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  colHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  colTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  colCount: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textTertiary,
  },
  kanbanCard: {
    backgroundColor: colors.surface2,
    marginBottom: 8,
    padding: 12,
  },
  kanbanTaskTitle: {
    fontSize: 13.5,
    fontWeight: "600",
    color: colors.text,
  },
});
