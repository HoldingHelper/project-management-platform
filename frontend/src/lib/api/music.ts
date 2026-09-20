import { apiFetch, resolveApiResourceUrl } from "./client";
import type {
  DriveFolder,
  DriveStatus,
  MusicChannelListItem,
  MusicChannelRead,
  MusicMemberRead,
  PlaybackAction,
  PlaybackState,
  UUID,
} from "@/lib/types";

// ---- Channels ----
export function listMusicChannels() {
  return apiFetch<MusicChannelListItem[]>("/music/channels");
}
export function createMusicChannel(input: {
  name: string;
  color?: string;
  drive_folder_id?: string;
  drive_folder_name?: string;
}) {
  return apiFetch<MusicChannelRead>("/music/channels", { method: "POST", body: input });
}
export function joinMusicChannel(channelId: UUID) {
  return apiFetch<void>(`/music/channels/${channelId}/join`, { method: "POST" });
}
export function leaveMusicChannel(channelId: UUID) {
  return apiFetch<void>(`/music/channels/${channelId}/leave`, { method: "POST" });
}
export function deleteMusicChannel(channelId: UUID) {
  return apiFetch<void>(`/music/channels/${channelId}`, { method: "DELETE" });
}

// ---- Members ----
export function listMusicMembers(channelId: UUID) {
  return apiFetch<MusicMemberRead[]>(`/music/channels/${channelId}/members`);
}
export function setMemberControl(channelId: UUID, userId: UUID, can_control: boolean) {
  return apiFetch<MusicMemberRead>(`/music/channels/${channelId}/members/${userId}`, {
    method: "PATCH",
    body: { can_control },
  });
}

// ---- Playback ----
export function getPlaybackState(channelId: UUID) {
  return apiFetch<PlaybackState>(`/music/channels/${channelId}/state`);
}
export function sendPlaybackCommand(
  channelId: UUID,
  input: { action: PlaybackAction; position_seconds?: number; track_index?: number },
) {
  return apiFetch<PlaybackState>(`/music/channels/${channelId}/playback`, {
    method: "POST",
    body: input,
  });
}
/** Short-lived signed URL for one track (usable as an <audio> src). */
export function getStreamUrl(channelId: UUID, fileId: string) {
  return apiFetch<{ url: string }>(
    `/music/channels/${channelId}/tracks/${encodeURIComponent(fileId)}/stream-url`,
  ).then(({ url }) => ({ url: resolveApiResourceUrl(url) }));
}

// ---- Google Drive ----
export function getDriveStatus() {
  return apiFetch<DriveStatus>("/music/drive/status");
}
export function getDriveAuthUrl() {
  return apiFetch<{ url: string; state: string }>("/music/drive/auth-url");
}
export function connectDrive(code: string, state: string) {
  return apiFetch<DriveStatus>("/music/drive/connect", {
    method: "POST",
    body: { code, state },
  });
}
export function listDriveFolders() {
  return apiFetch<DriveFolder[]>("/music/drive/folders");
}
export function setChannelFolder(
  channelId: UUID,
  input: { folder_id: string; folder_name?: string },
) {
  return apiFetch<PlaybackState>(`/music/channels/${channelId}/folder`, {
    method: "POST",
    body: input,
  });
}
