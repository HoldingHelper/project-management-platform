import { apiFetch } from "./client";
import type { CommentRead, FileAttachmentRead, NotificationRead, UUID } from "@/lib/types";

export function listComments(entity_type: string, entity_id: UUID) {
  return apiFetch<CommentRead[]>(
    `/comments?entity_type=${encodeURIComponent(entity_type)}&entity_id=${entity_id}`,
  );
}

export function addComment(input: {
  entity_type: string;
  entity_id: UUID;
  body: string;
  parent_comment_id?: UUID | null;
  mentioned_user_ids?: UUID[];
}) {
  return apiFetch<CommentRead>("/comments", {
    method: "POST",
    body: { mentioned_user_ids: [], ...input },
  });
}

export function listNotifications(
  filter: "all" | "unread" | "action_required" = "all",
) {
  return apiFetch<NotificationRead[]>(`/notifications?filter=${filter}`);
}

export function markNotificationRead(id: UUID) {
  return apiFetch<NotificationRead>(`/notifications/${id}/read`, { method: "PUT" });
}

export function markAllNotificationsRead() {
  return apiFetch<{ marked_read: number }>("/notifications/read-all", {
    method: "PUT",
  });
}

export function replyToNotification(
  id: UUID,
  input: { body?: string; attachment_id?: UUID },
) {
  return apiFetch<NotificationRead>(`/notifications/${id}/reply`, {
    method: "POST",
    body: input,
  });
}

export function resolveNotification(id: UUID) {
  return apiFetch<NotificationRead>(`/notifications/${id}/resolve`, {
    method: "POST",
  });
}

export function listFiles(entity_type: string, entity_id: UUID) {
  return apiFetch<FileAttachmentRead[]>(
    `/files?entity_type=${encodeURIComponent(entity_type)}&entity_id=${entity_id}`,
  );
}

export function uploadFile(entity_type: string, entity_id: UUID, file: Blob, fileName: string) {
  const form = new FormData();
  form.append("file", file, fileName);
  return apiFetch<FileAttachmentRead>(
    `/files?entity_type=${encodeURIComponent(entity_type)}&entity_id=${entity_id}`,
    { method: "POST", formData: form },
  );
}

export function getFileDownloadUrl(attachmentId: UUID) {
  return apiFetch<{ url: string }>(`/files/${attachmentId}/download-url`);
}
