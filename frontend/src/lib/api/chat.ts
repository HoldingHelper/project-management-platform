import { apiFetch } from "./client";
import type {
  ChannelListItem,
  ChannelMemberRead,
  ChannelRead,
  MessageRead,
  UUID,
} from "@/lib/types";

export function listChannels() {
  return apiFetch<ChannelListItem[]>("/chat/channels");
}

export function createDm(user_id: UUID) {
  return apiFetch<ChannelRead>("/chat/dms", { method: "POST", body: { user_id } });
}

export function listChannelMembers(channelId: UUID) {
  return apiFetch<ChannelMemberRead[]>(`/chat/channels/${channelId}/members`);
}

export function listMessages(
  channelId: UUID,
  opts: { before?: UUID; thread_of?: UUID; limit?: number } = {},
) {
  const q = new URLSearchParams();
  if (opts.before) q.set("before", opts.before);
  if (opts.thread_of) q.set("thread_of", opts.thread_of);
  q.set("limit", String(opts.limit ?? 50));
  return apiFetch<MessageRead[]>(`/chat/channels/${channelId}/messages?${q.toString()}`);
}

export function sendMessage(
  channelId: UUID,
  input: {
    body?: string;
    message_type?: "text" | "voice" | "file";
    attachment_id?: UUID;
    parent_message_id?: UUID;
    mentioned_user_ids?: UUID[];
  },
) {
  return apiFetch<MessageRead>(`/chat/channels/${channelId}/messages`, {
    method: "POST",
    body: { body: "", message_type: "text", ...input },
  });
}

export function markChannelRead(channelId: UUID, message_id: UUID) {
  return apiFetch<void>(`/chat/channels/${channelId}/read`, {
    method: "POST",
    body: { message_id },
  });
}

export function deleteMessage(messageId: UUID) {
  return apiFetch<void>(`/chat/messages/${messageId}`, { method: "DELETE" });
}

export function addReaction(messageId: UUID, emoji: string) {
  return apiFetch<void>(`/chat/messages/${messageId}/reactions`, {
    method: "POST",
    body: { emoji },
  });
}

export function removeReaction(messageId: UUID, emoji: string) {
  return apiFetch<void>(
    `/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    { method: "DELETE" },
  );
}
