"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  Copy,
  ExternalLink,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { Avatar, Button, Modal, PresenceDot, PRESENCE_LABELS, StatusChip } from "@/components/ds";
import { useUserStatus } from "@/lib/stores/presence";
import { useUserMap } from "@/lib/hooks";
import { useToast } from "@/components/ds";
import type { PresenceStatus, UUID, UserRead } from "@/lib/types";

interface Props {
  user: UserRead | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (user: UserRead) => void;
  canEdit?: boolean;
}

export function UserDetailsModal({
  user,
  open,
  onClose,
  onEdit,
  canEdit = false,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const { users } = useUserMap();

  const live = useUserStatus(user?.id);
  const status = (live.status ?? (user?.presence_status as PresenceStatus) ?? "offline") as PresenceStatus;
  const statusEmoji = live.status_emoji ?? user?.status_emoji;
  const statusText = live.status_text ?? user?.status_text;

  // Find manager user
  const manager = useMemo(() => {
    if (!user?.manager_id) return null;
    return users.find((u) => u.id === user.manager_id) ?? null;
  }, [user?.manager_id, users]);

  // Find direct reports
  const directReports = useMemo(() => {
    if (!user?.id) return [];
    return users.filter((u) => u.manager_id === user.id);
  }, [user?.id, users]);

  if (!user) return null;

  function copyEmail() {
    if (user?.email) {
      navigator.clipboard.writeText(user.email);
      toast.success("Email copied to clipboard");
    }
  }

  function handleStartChat() {
    if (!user) return;
    onClose();
    // Dispatch chat open event or navigate to chat
    window.dispatchEvent(
      new CustomEvent("open-dm-with-user", { detail: { userId: user.id } })
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title=""
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <Button
            variant="secondary"
            onClick={() => {
              onClose();
              router.push(`/profile/${user.id}`);
            }}
          >
            <ExternalLink size={14} style={{ marginRight: 6 }} /> Full Profile
          </Button>
          <div style={{ display: "flex", gap: 8 }}>
            {canEdit && onEdit && (
              <Button
                variant="secondary"
                onClick={() => {
                  onClose();
                  onEdit(user);
                }}
              >
                Edit Teammate
              </Button>
            )}
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Header Profile Section */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
            padding: "16px",
            background: "var(--surface-2)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
            <Avatar name={user.full_name} size={56} />
            <PresenceDot status={status} overlay size={14} />
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                {user.full_name}
              </h2>
              {statusEmoji && (
                <span
                  title={statusText || undefined}
                  style={{
                    fontSize: 14,
                    background: "var(--surface-3)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    border: "1px solid var(--border-subtle)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{statusEmoji}</span>
                  {statusText && (
                    <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-secondary)" }}>
                      {statusText}
                    </span>
                  )}
                </span>
              )}
            </div>

            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {user.job_title ? (
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{user.job_title}</span>
              ) : (
                <span style={{ fontStyle: "italic", color: "var(--text-tertiary)" }}>No job title</span>
              )}
              {user.username && (
                <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>@{user.username}</span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, background: "var(--surface-3)", padding: "2px 8px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-subtle)" }}>
                <PresenceDot status={status} size={7} glow={false} />
                <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{PRESENCE_LABELS[status]}</span>
              </span>

              {user.roles.map((r) => (
                <span
                  key={r}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    background: r === "SuperAdmin" || r === "CLevel" ? "color-mix(in srgb, var(--primary) 20%, var(--surface-3))" : "var(--surface-3)",
                    color: r === "SuperAdmin" || r === "CLevel" ? "var(--primary)" : "var(--text-secondary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={handleStartChat}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "9px 14px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            className="pmp-row"
          >
            <MessageSquare size={15} style={{ color: "var(--primary)" }} /> Send Message
          </button>
          <button
            type="button"
            onClick={copyEmail}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 14px",
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-secondary)",
              fontSize: 13,
              cursor: "pointer",
            }}
            className="pmp-row"
            title="Copy email address"
          >
            <Copy size={14} /> Copy Email
          </button>
        </div>

        {/* Details Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            background: "var(--surface-1)",
            padding: 14,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mail size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Email</div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Building2 size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Department</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.department_name ?? "General / Unassigned"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Team</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.team_name ?? "No team"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserCheck size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Reports to (Manager)</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {manager ? manager.full_name : user.manager_name ?? "None (Executive/Top Lead)"}
              </div>
            </div>
          </div>

          {user.location && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Location</div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)" }}>{user.location}</div>
              </div>
            </div>
          )}

          {user.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Phone size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Phone</div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)" }}>{user.phone}</div>
              </div>
            </div>
          )}
        </div>

        {/* Bio */}
        {user.bio && (
          <div style={{ padding: "12px", background: "var(--surface-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", marginBottom: 6 }}>
              About
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
              {user.bio}
            </div>
          </div>
        )}

        {/* Direct Reports section */}
        {directReports.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={13} /> Direct Reports ({directReports.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
              {directReports.map((report) => (
                <Link
                  key={report.id}
                  href={`/profile/${report.id}`}
                  onClick={onClose}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                  className="pmp-row"
                >
                  <Avatar name={report.full_name} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {report.full_name}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                      {report.job_title || report.team_name || "Team Member"}
                    </div>
                  </div>
                  {report.team_name && (
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", background: "var(--surface-3)", padding: "1px 6px", borderRadius: "var(--radius-full)" }}>
                      {report.team_name}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
