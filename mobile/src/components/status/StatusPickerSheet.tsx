import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, Clock, Sparkles, Trash2, X } from "lucide-react-native";
import { Api } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { colors } from "@/theme/colors";

interface StatusPreset {
  emoji: string;
  text: string;
  presence: "online" | "busy" | "away" | "focus";
  durationMinutes: number | null;
}

const PRESETS: StatusPreset[] = [
  { emoji: "💬", text: "Active & Available", presence: "online", durationMinutes: null },
  { emoji: "🎯", text: "Deep working — Focus", presence: "focus", durationMinutes: 120 },
  { emoji: "🤒", text: "Out sick", presence: "away", durationMinutes: 1440 },
  { emoji: "✈️", text: "On a business trip", presence: "away", durationMinutes: 4320 },
  { emoji: "🥪", text: "Out for lunch", presence: "away", durationMinutes: 60 },
  { emoji: "🚗", text: "In an appointment / Commuting", presence: "away", durationMinutes: 60 },
  { emoji: "🌴", text: "On vacation / PTO", presence: "away", durationMinutes: null },
];

const EMOJI_LIST = ["💬", "🎯", "🤒", "✈️", "🥪", "🚗", "🌴", "⚡", "☕", "💻", "🎧", "🚀", "📞"];

const DURATION_OPTIONS = [
  { label: "Don't clear", value: 0 },
  { label: "30 mins", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "4 hours", value: 240 },
  { label: "Today", value: 720 },
  { label: "This week", value: 10080 },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function StatusPickerSheet({ visible, onClose, onSuccess }: Props) {
  const { user, refreshUser } = useAuth();

  const [presence, setPresence] = useState<"online" | "away">(
    user?.presence_status === "away" ? "away" : "online"
  );
  const [emoji, setEmoji] = useState(user?.status_emoji || "💬");
  const [text, setText] = useState(user?.status_text || "");
  const [durationMinutes, setDurationMinutes] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  function applyPreset(p: StatusPreset) {
    setEmoji(p.emoji);
    setText(p.text);
    setPresence(p.presence === "online" ? "online" : "away");
    if (p.durationMinutes) {
      setDurationMinutes(p.durationMinutes);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await Api.updateStatus({
        presence_status: presence,
        status_emoji: emoji || null,
        status_text: text ? text.trim() : null,
        clear_after_minutes: durationMinutes > 0 ? durationMinutes : null,
      });
      await refreshUser();
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Failed to save status on mobile", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await Api.clearStatus();
      await refreshUser();
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Failed to clear status on mobile", err);
    } finally {
      setSaving(false);
    }
  }

  const isInactive = presence === "away";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIcon}>
                <Sparkles size={16} color={colors.accent} />
              </View>
              <View>
                <Text style={styles.title}>Set Status</Text>
                <Text style={styles.subtitle}>Broadcast your availability to coworkers</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Active / Inactive Switch */}
            <Text style={styles.sectionLabel}>AVAILABILITY</Text>
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[styles.segmentBtn, !isInactive && styles.segmentBtnActive]}
                onPress={() => setPresence("online")}
              >
                <View style={[styles.dot, { backgroundColor: colors.presenceOnline }]} />
                <Text style={[styles.segmentText, !isInactive && styles.segmentTextActive]}>
                  Active
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, isInactive && styles.segmentBtnActive]}
                onPress={() => setPresence("away")}
              >
                <View style={[styles.dot, { backgroundColor: colors.presenceAway }]} />
                <Text style={[styles.segmentText, isInactive && styles.segmentTextActive]}>
                  Away / Inactive
                </Text>
              </TouchableOpacity>
            </View>

            {/* Custom status text & emoji */}
            <Text style={styles.sectionLabel}>STATUS MESSAGE</Text>
            <View style={styles.inputCard}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
                {EMOJI_LIST.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
                    onPress={() => setEmoji(e)}
                  >
                    <Text style={{ fontSize: 18 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.inputRow}>
                <Text style={styles.selectedEmoji}>{emoji}</Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="What's your status? (e.g. Out sick)"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.textInput}
                  maxLength={100}
                />
                {text.length > 0 && (
                  <TouchableOpacity onPress={() => setText("")}>
                    <X size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Presets */}
            <Text style={styles.sectionLabel}>QUICK PRESETS</Text>
            <View style={styles.presetsGrid}>
              {PRESETS.map((p) => {
                const isSelected = text === p.text && emoji === p.emoji;
                return (
                  <TouchableOpacity
                    key={p.text}
                    style={[styles.presetChip, isSelected && styles.presetChipActive]}
                    onPress={() => applyPreset(p)}
                  >
                    <Text style={{ fontSize: 14 }}>{p.emoji}</Text>
                    <Text
                      style={[styles.presetText, isSelected && styles.presetTextActive]}
                      numberOfLines={1}
                    >
                      {p.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Duration */}
            <Text style={styles.sectionLabel}>CLEAR AFTER</Text>
            <View style={styles.durationsRow}>
              {DURATION_OPTIONS.map((d) => {
                const isSelected = durationMinutes === d.value;
                return (
                  <TouchableOpacity
                    key={d.label}
                    style={[styles.durationChip, isSelected && styles.durationChipActive]}
                    onPress={() => setDurationMinutes(d.value)}
                  >
                    <Text
                      style={[
                        styles.durationText,
                        isSelected && styles.durationTextActive,
                      ]}
                    >
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.clearBtn, (!user?.status_text && !user?.status_emoji) && { opacity: 0.4 }]}
              onPress={handleClear}
              disabled={saving || (!user?.status_text && !user?.status_emoji)}
            >
              <Trash2 size={16} color={colors.textTertiary} />
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <>
                  <Check size={16} color="#000" />
                  <Text style={styles.saveText}>Save Status</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.border,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    maxHeight: 400,
  },
  bodyContent: {
    padding: 20,
    gap: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textTertiary,
    letterSpacing: 0.6,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: colors.surface1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textTertiary,
  },
  segmentTextActive: {
    color: colors.text,
  },
  inputCard: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
  },
  emojiRow: {
    flexDirection: "row",
  },
  emojiBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface3,
    marginRight: 6,
  },
  emojiBtnActive: {
    backgroundColor: colors.surface4,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 8,
  },
  selectedEmoji: {
    fontSize: 18,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    padding: 0,
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 6,
  },
  presetChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  presetText: {
    fontSize: 12,
    color: colors.textSecondary,
    maxWidth: 200,
  },
  presetTextActive: {
    color: colors.accent,
    fontWeight: "600",
  },
  durationsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  durationChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  durationChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  durationText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  durationTextActive: {
    color: colors.accent,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surface2,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearText: {
    fontSize: 13,
    color: colors.textTertiary,
    fontWeight: "500",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    gap: 6,
  },
  saveText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#000",
  },
});
