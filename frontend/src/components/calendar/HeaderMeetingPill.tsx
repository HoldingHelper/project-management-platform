"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  ExternalLink,
  Video,
  RefreshCw,
  Clock3,
  Users,
  MapPin,
  ChevronDown,
} from "lucide-react";
import { getUpcomingMeetings, syncCalendar, type CalendarEvent } from "@/lib/api/calendar";

export function HeaderMeetingPill() {
  const queryClient = useQueryClient();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["calendar-upcoming"],
    queryFn: () => getUpcomingMeetings(24),
    refetchInterval: 60000,
    retry: false,
  });

  const syncMutation = useMutation({
    mutationFn: syncCalendar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-upcoming"] });
    },
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading || !data?.connected) {
    return null;
  }

  const nextMeeting = data.next_meeting;
  const isImminent = nextMeeting && (nextMeeting.is_now || nextMeeting.starts_in_minutes <= 20);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: isImminent
            ? "color-mix(in srgb, var(--accent-primary) 12%, var(--surface-2))"
            : "var(--surface-2)",
          border: isImminent
            ? "1px solid color-mix(in srgb, var(--accent-primary) 35%, transparent)"
            : "1px solid var(--border-default)",
          borderRadius: "var(--radius-full)",
          padding: "4px 10px 4px 12px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          cursor: "pointer",
          transition: "all 150ms ease",
        }}
        onClick={() => setDropdownOpen((prev) => !prev)}
        title="Click to view today's Google Calendar agenda"
      >
        {isImminent ? (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 8px #10b981",
              display: "inline-block",
            }}
          />
        ) : (
          <Calendar size={13} style={{ color: "var(--text-tertiary)" }} />
        )}

        {nextMeeting ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                maxWidth: 130,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {nextMeeting.title}
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontFamily: "var(--font-mono)",
                color: isImminent ? "var(--accent-primary)" : "var(--text-tertiary)",
                fontWeight: 700,
              }}
            >
              {nextMeeting.is_now
                ? "NOW"
                : nextMeeting.starts_in_minutes < 60
                ? `${nextMeeting.starts_in_minutes}m`
                : `${Math.floor(nextMeeting.starts_in_minutes / 60)}h`}
            </span>
          </span>
        ) : (
          <span style={{ color: "var(--text-tertiary)", fontSize: 11.5 }}>No meetings</span>
        )}

        {nextMeeting?.meet_url && (
          <a
            href={nextMeeting.meet_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: "var(--radius-full)",
              background: "var(--accent-primary)",
              color: "var(--text-on-accent, #fff)",
              fontSize: 11,
              fontWeight: 700,
              textDecoration: "none",
              marginLeft: 2,
            }}
            title="Join Google Meet / Video call in new tab"
          >
            <Video size={11} /> Join
          </a>
        )}

        <ChevronDown size={12} style={{ color: "var(--text-tertiary)", marginLeft: 2 }} />
      </div>

      {dropdownOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-2)",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.35)",
            zIndex: 100,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Calendar size={15} style={{ color: "var(--accent-primary)" }} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Today&apos;s Meetings</span>
            </div>
            <button
              type="button"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-tertiary)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
              }}
              title="Force sync with Google Calendar"
            >
              <RefreshCw size={12} className={syncMutation.isPending ? "animate-spin" : ""} />
              Sync
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
            {data.meetings.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "12px 0" }}>
                No meetings scheduled for the next 24 hours.
              </p>
            ) : (
              data.meetings.map((meeting: CalendarEvent) => (
                <div
                  key={meeting.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--radius-1)",
                    background: meeting.is_now ? "rgba(16, 185, 129, 0.08)" : "var(--surface-2)",
                    border: meeting.is_now
                      ? "1px solid rgba(16, 185, 129, 0.3)"
                      : "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text-primary)" }}>
                      {meeting.title}
                    </span>
                    {meeting.is_now && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontFamily: "var(--font-mono)",
                          padding: "1px 5px",
                          borderRadius: 4,
                          background: "#10b981",
                          color: "#fff",
                          fontWeight: 700,
                        }}
                      >
                        LIVE
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--text-tertiary)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <Clock3 size={11} />
                      {new Date(meeting.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {meeting.attendees?.length > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <Users size={11} />
                        {meeting.attendees.length}
                      </span>
                    )}
                    {meeting.location && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <MapPin size={11} />
                        {meeting.location}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                    {meeting.meet_url && (
                      <a
                        href={meeting.meet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 10px",
                          borderRadius: "var(--radius-1)",
                          background: "var(--accent-primary)",
                          color: "var(--text-on-accent, #fff)",
                          fontSize: 11,
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        <Video size={11} /> Join Meeting
                      </a>
                    )}
                    {meeting.html_link && (
                      <a
                        href={meeting.html_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          textDecoration: "none",
                        }}
                      >
                        Google Calendar <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
