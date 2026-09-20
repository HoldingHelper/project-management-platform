export type DocCategory =
  | "Technical"
  | "Marketing"
  | "Operations"
  | "Platform"
  | "Business"
  | "Designs";

export const DOC_CATEGORIES: DocCategory[] = [
  "Technical",
  "Marketing",
  "Operations",
  "Platform",
  "Business",
  "Designs",
];

export interface User {
  id: string;
  email: string;
  full_name: string;
  username?: string;
  is_active: boolean;
  is_super_admin: boolean;
  avatar_url?: string | null;
  presence_status?: "online" | "busy" | "away" | "focus" | "offline";
  status_text?: string | null;
  status_emoji?: string | null;
  status_expires_at?: string | null;
  department_id?: string | null;
  department_name?: string | null;
}

export interface DocSpace {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category: DocCategory;
  is_private: boolean;
  responsible_user_id?: string | null;
  responsible_user_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocPage {
  id: string;
  space_id: string;
  parent_page_id?: string | null;
  title: string;
  slug: string;
  body_markdown: string;
  is_published: boolean;
  is_private: boolean;
  responsible_user_id?: string | null;
  author_user_id: string;
  space_name?: string;
  category?: DocCategory;
  created_at: string;
  updated_at: string;
}

export type TaskStatus =
  | "NotStarted"
  | "Ready"
  | "InProgress"
  | "Waiting"
  | "Blocked"
  | "Review"
  | "Testing"
  | "Done"
  | "Archived";

export type TaskPriority = "P0" | "P1" | "P2" | "P3";

export interface Task {
  id: string;
  project_id: string;
  phase_id?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  board_order: number;
  due_date?: string | null;
  checklist_total: number;
  checklist_completed: number;
  assignees: { id: string; user_id: string; full_name?: string; avatar_url?: string }[];
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: "Draft" | "Planning" | "Active" | "Paused" | "Completed" | "Cancelled" | "Archived";
  progress_pct: number;
  start_date?: string | null;
  target_date?: string | null;
  health_status?: "OnTrack" | "NeedsAttention" | "AtRisk";
  task_count?: number;
  completed_task_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  is_read: boolean;
  entity_type?: string | null;
  entity_id?: string | null;
  requires_action: boolean;
  resolved_at?: string | null;
  created_at: string;
}

export interface ChatChannel {
  id: string;
  name: string;
  type: "public" | "private" | "direct";
  topic?: string | null;
  unread_count?: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_user_id: string;
  sender_name?: string;
  sender_avatar?: string;
  body: string;
  message_type: "text" | "voice" | "image" | "file";
  attachment_url?: string | null;
  reactions?: { emoji: string; count: number; user_reacted: boolean }[];
  created_at: string;
}
