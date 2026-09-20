"use client";

import { useState, useRef, type ReactNode } from "react";
import Link from "next/link";
import { MessageSquare, Mail, Briefcase, Building } from "lucide-react";
import { Avatar, PresenceDot, PRESENCE_LABELS } from "@/components/ds";
import { useUserStatus } from "@/lib/stores/presence";
import type { UUID } from "@/lib/types";

interface Props {
  userId?: UUID | null;
  name: string;
  email?: string | null;
  jobTitle?: string | null;
  departmentName?: string | null;
  avatarUrl?: string | null;
  children: ReactNode;
}

export function UserStatusHoverCard({
  userId,
  name,
  email,
  jobTitle,
  departmentName,
  avatarUrl,
  children,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusInfo = useUserStatus(userId);

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOpen(true), 250);
  }

  function handleMouseLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOpen(false), 200);
  }

  const status = statusInfo.status || "offline";
  const statusText = statusInfo.status_text;
  const statusEmoji = statusInfo.status_emoji;

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            zIndex: 1000,
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-3)",
            boxShadow: "var(--shadow-xl)",
            width: 280,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            pointerEvents: "auto",
            animation: "modalFadeIn 0.15s ease-out",
          }}
        >
          {/* Top section: Avatar + Name + Presence dot */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Avatar name={name} size={44} />
              <PresenceDot status={status} overlay size={11} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {name}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11.5,
                  color: "var(--text-tertiary)",
                  marginTop: 2,
                }}
              >
                <PresenceDot status={status} size={6} />
                <span>{PRESENCE_LABELS[status]}</span>
              </div>
            </div>
          </div>

          {/* Custom status message banner if present */}
          {(statusText || statusEmoji) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-2)",
                border: "1px solid var(--border-subtle)",
                fontSize: 12.5,
                color: "var(--text-primary)",
              }}
            >
              {statusEmoji && <span style={{ fontSize: 15 }}>{statusEmoji}</span>}
              <span style={{ fontWeight: 500, lineHeight: 1.3 }}>{statusText || "Status set"}</span>
            </div>
          )}

          {/* Details: Job title & Dept */}
          {(jobTitle || departmentName || email) && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 11.5,
                color: "var(--text-secondary)",
                paddingTop: 4,
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              {jobTitle && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Briefcase size={13} style={{ color: "var(--text-tertiary)" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {jobTitle}
                  </span>
                </div>
              )}
              {departmentName && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Building size={13} style={{ color: "var(--text-tertiary)" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {departmentName}
                  </span>
                </div>
              )}
              {email && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Mail size={13} style={{ color: "var(--text-tertiary)" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {email}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Action: View Profile */}
          {userId && (
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <Link
                href={`/profile/${userId}`}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-1)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                View Profile
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
