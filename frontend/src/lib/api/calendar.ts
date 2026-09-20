import { apiFetch } from "./client";

export interface CalendarAuthUrlResponse {
  auth_url: string;
}

export interface CalendarConnectionStatus {
  connected: boolean;
  google_email?: string | null;
  last_synced_at?: string | null;
  is_active: boolean;
}

export interface CalendarAttendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
  self?: boolean;
}

export interface CalendarEvent {
  id: string;
  google_event_id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  meet_url?: string | null;
  html_link?: string | null;
  location?: string | null;
  attendees: CalendarAttendee[];
  is_all_day: boolean;
  starts_in_minutes: number;
  is_now: boolean;
}

export interface UpcomingMeetingsResponse {
  connected: boolean;
  meetings: CalendarEvent[];
  next_meeting?: CalendarEvent | null;
}

export async function getCalendarAuthUrl(): Promise<CalendarAuthUrlResponse> {
  return apiFetch<CalendarAuthUrlResponse>("/calendar/auth-url");
}

export async function connectCalendar(code: string): Promise<CalendarConnectionStatus> {
  return apiFetch<CalendarConnectionStatus>("/calendar/connect", {
    method: "POST",
    body: { code },
  });
}

export async function getCalendarStatus(): Promise<CalendarConnectionStatus> {
  return apiFetch<CalendarConnectionStatus>("/calendar/status");
}

export async function disconnectCalendar(): Promise<void> {
  return apiFetch<void>("/calendar/disconnect", { method: "DELETE" });
}

export async function getUpcomingMeetings(hoursAhead = 24): Promise<UpcomingMeetingsResponse> {
  return apiFetch<UpcomingMeetingsResponse>(`/calendar/upcoming?hours_ahead=${hoursAhead}`);
}

export async function syncCalendar(): Promise<CalendarConnectionStatus> {
  return apiFetch<CalendarConnectionStatus>("/calendar/sync", { method: "POST" });
}
