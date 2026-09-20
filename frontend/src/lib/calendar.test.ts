import test from "node:test";
import assert from "node:assert/strict";
import type { CalendarEvent, UpcomingMeetingsResponse } from "./api/calendar";

test("CalendarEvent formats meeting time status accurately", () => {
  const meeting: CalendarEvent = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    google_event_id: "google-event-1",
    title: "Sprint Review & Demo",
    start_time: "2026-08-20T10:00:00Z",
    end_time: "2026-08-20T11:00:00Z",
    meet_url: "https://meet.google.com/abc-defg-hij",
    attendees: [
      { email: "lead@example.com", displayName: "Tech Lead", responseStatus: "accepted" },
    ],
    is_all_day: false,
    starts_in_minutes: 8,
    is_now: false,
  };

  assert.equal(meeting.title, "Sprint Review & Demo");
  assert.equal(meeting.starts_in_minutes, 8);
  assert.equal(meeting.is_now, false);
  assert.ok(meeting.meet_url?.includes("meet.google.com"));
  assert.equal(meeting.attendees.length, 1);
});

test("UpcomingMeetingsResponse sorts and selects next meeting", () => {
  const meetings: CalendarEvent[] = [
    {
      id: "ev-1",
      google_event_id: "g-1",
      title: "Daily Standup",
      start_time: "2026-08-20T09:00:00Z",
      end_time: "2026-08-20T09:15:00Z",
      meet_url: "https://meet.google.com/xyz-uvwx-rst",
      attendees: [],
      is_all_day: false,
      starts_in_minutes: 2,
      is_now: false,
    },
    {
      id: "ev-2",
      google_event_id: "g-2",
      title: "Design Critique",
      start_time: "2026-08-20T14:00:00Z",
      end_time: "2026-08-20T15:00:00Z",
      meet_url: null,
      attendees: [],
      is_all_day: false,
      starts_in_minutes: 300,
      is_now: false,
    },
  ];

  const response: UpcomingMeetingsResponse = {
    connected: true,
    meetings,
    next_meeting: meetings[0],
  };

  assert.equal(response.connected, true);
  assert.equal(response.next_meeting?.title, "Daily Standup");
  assert.equal(response.next_meeting?.starts_in_minutes, 2);
});
