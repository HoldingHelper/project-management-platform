"use client";

import { useState } from "react";
import { Check, Clock, Sparkles, Trash2, X } from "lucide-react";
import { updateMyStatus, clearMyStatus } from "@/lib/api/users";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PresenceDot } from "@/components/ds";
import type { PresenceStatus } from "@/lib/types";

interface StatusPreset {
  emoji: string;
  text: string;
  presence: PresenceStatus;
  durationMinutes: number | null; // null = don't clear
}

const PRESETS: StatusPreset[] = [
  { emoji: "💬", text: "Active & Available", presence: "online", durationMinutes: null },
  { emoji: "🎯", text: "Deep working — Do not disturb", presence: "focus", durationMinutes: 120 },
  { emoji: "🤒", text: "Out sick", presence: "away", durationMinutes: 1440 },
  { emoji: "✈️", text: "On a business trip", presence: "away", durationMinutes: 4320 },
  { emoji: "🥪", text: "Out for lunch", presence: "away", durationMinutes: 60 },
  { emoji: "🚗", text: "In an appointment / Commuting", presence: "away", durationMinutes: 60 },
  { emoji: "🌴", text: "On vacation / PTO", presence: "away", durationMinutes: null },
];

const EMOJI_OPTIONS = ["💬", "🎯", "🤒", "✈️", "🥪", "🚗", "🌴", "⚡", "☕", "💻", "🎧", "🚀", "📞", "🏃", "📚"];

const DURATION_OPTIONS = [
  { label: "Don't clear", value: 0 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "4 hours", value: 240 },
  { label: "Today (end of day)", value: 720 },
  { label: "This week", value: 10080 },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function UserStatusPickerModal({ isOpen, onClose, onSuccess }: Props) {
  const { user, setUser } = useAuth();

  const [presence, setPresence] = useState<PresenceStatus>(
    (user?.presence_status as PresenceStatus) || "online"
  );
  const [emoji, setEmoji] = useState(user?.status_emoji || "💬");
  const [text, setText] = useState(user?.status_text || "");
  const [durationMinutes, setDurationMinutes] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  if (!isOpen) return null;

  function applyPreset(preset: StatusPreset) {
    setEmoji(preset.emoji);
    setText(preset.text);
    setPresence(preset.presence);
    if (preset.durationMinutes) {
      setDurationMinutes(preset.durationMinutes);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateMyStatus({
        presence_status: presence,
        status_emoji: emoji || null,
        status_text: text ? text.trim() : null,
        clear_after_minutes: durationMinutes > 0 ? durationMinutes : null,
      });
      if (setUser) {
        setUser(updated);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Failed to update status", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      const updated = await clearMyStatus();
      if (setUser) {
        setUser(updated);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Failed to clear status", err);
    } finally {
      setSaving(false);
    }
  }

  const isInactive = presence === "away" || presence === "offline";

  return (
    <div
      className="pmp-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-3)",
          boxShadow: "var(--shadow-xl)",
          width: "100%",
          maxWidth: 480,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "modalFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "color-mix(in srgb, var(--accent-primary) 18%, transparent)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-primary)",
              }}
            >
              <Sparkles size={16} />
            </span>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Set your status
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0, marginTop: 1 }}>
                Let your team know your availability & focus
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 6,
              borderRadius: "var(--radius-full)",
              color: "var(--text-tertiary)",
              display: "inline-flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18, maxHeight: "75vh", overflowY: "auto" }}>
          {/* Active vs Inactive state segmented switch */}
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 8 }}>
              Availability State
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                background: "var(--surface-2)",
                padding: 4,
                borderRadius: "var(--radius-2)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <button
                type="button"
                onClick={() => setPresence("online")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: "var(--radius-1)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                  background: !isInactive ? "var(--surface-1)" : "transparent",
                  color: !isInactive ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: !isInactive ? "var(--shadow-sm)" : "none",
                }}
              >
                <PresenceDot status="online" size={10} />
                <span>Active</span>
              </button>
              <button
                type="button"
                onClick={() => setPresence("away")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: "var(--radius-1)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                  background: isInactive ? "var(--surface-1)" : "transparent",
                  color: isInactive ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: isInactive ? "var(--shadow-sm)" : "none",
                }}
              >
                <PresenceDot status="away" size={10} />
                <span>Away / Inactive</span>
              </button>
            </div>
          </div>

          {/* Custom Status Message & Emoji Input */}
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 8 }}>
              Custom Status Message
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--surface-2)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-2)",
                padding: "4px 8px",
              }}
            >
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((o) => !o)}
                  style={{
                    fontSize: 20,
                    width: 38,
                    height: 38,
                    border: "none",
                    background: "var(--surface-3)",
                    borderRadius: "var(--radius-1)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Pick emoji"
                >
                  {emoji || "💬"}
                </button>
                {showEmojiPicker && (
                  <div
                    style={{
                      position: "absolute",
                      top: 44,
                      left: 0,
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-2)",
                      boxShadow: "var(--shadow-lg)",
                      padding: 8,
                      display: "grid",
                      gridTemplateColumns: "repeat(5, 32px)",
                      gap: 4,
                      zIndex: 30,
                    }}
                  >
                    {EMOJI_OPTIONS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => {
                          setEmoji(e);
                          setShowEmojiPicker(false);
                        }}
                        style={{
                          fontSize: 18,
                          width: 32,
                          height: 32,
                          border: "none",
                          background: emoji === e ? "var(--surface-3)" : "transparent",
                          borderRadius: "var(--radius-1)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What's your status? (e.g. Out sick, Deep working...)"
                maxLength={255}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 13.5,
                  color: "var(--text-primary)",
                }}
              />

              {text && (
                <button
                  type="button"
                  onClick={() => setText("")}
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-tertiary)", padding: 4 }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 8 }}>
              Quick Presets
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PRESETS.map((p) => {
                const isSelected = text === p.text && emoji === p.emoji;
                return (
                  <button
                    key={p.text}
                    type="button"
                    onClick={() => applyPreset(p)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 10px",
                      borderRadius: "var(--radius-full)",
                      border: `1px solid ${isSelected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                      background: isSelected ? "color-mix(in srgb, var(--accent-primary) 14%, transparent)" : "var(--surface-2)",
                      color: isSelected ? "var(--accent-primary)" : "var(--text-secondary)",
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                    }}
                  >
                    <span>{p.emoji}</span>
                    <span>{p.text}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Auto-Clear Duration */}
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Clock size={13} />
              Clear After
            </label>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "var(--radius-2)",
                background: "var(--surface-2)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--surface-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            type="button"
            onClick={handleClear}
            disabled={saving || (!user?.status_text && !user?.status_emoji)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: "var(--radius-2)",
              border: "1px solid var(--border-subtle)",
              background: "transparent",
              color: "var(--text-tertiary)",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: saving || (!user?.status_text && !user?.status_emoji) ? "not-allowed" : "pointer",
              opacity: !user?.status_text && !user?.status_emoji ? 0.5 : 1,
            }}
          >
            <Trash2 size={14} /> Clear status
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "7px 14px",
                borderRadius: "var(--radius-2)",
                border: "1px solid var(--border-default)",
                background: "var(--surface-1)",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 18px",
                borderRadius: "var(--radius-2)",
                border: "none",
                background: "var(--accent-primary)",
                color: "var(--accent-text)",
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <Check size={15} />
              {saving ? "Saving…" : "Save Status"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
