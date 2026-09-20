import { Storage } from "./storage";
import type {
  DocCategory,
  DocPage,
  DocSpace,
  Notification,
  Project,
  Task,
  User,
  ChatChannel,
  ChatMessage,
} from "./types";

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await Storage.getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    await Storage.clearTokens();
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorBody.detail || `Request failed with status ${res.status}`);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const Api = {
  // Auth
  async login(identifier: string, password: string): Promise<{ access_token: string; refresh_token: string; user: User }> {
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
  },

  async getMe(): Promise<User> {
    return request("/users/me");
  },

  // User Status & Presence
  async updateStatus(payload: {
    presence_status?: "online" | "busy" | "away" | "focus" | "offline";
    status_text?: string | null;
    status_emoji?: string | null;
    clear_after_minutes?: number | null;
  }): Promise<User> {
    return request("/users/me/status", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async clearStatus(): Promise<User> {
    return request("/users/me/status", { method: "DELETE" });
  },

  // Devices & Push Tokens
  async registerDevice(device_token: string, platform: "ios" | "android", device_name?: string): Promise<void> {
    return request("/devices/register", {
      method: "POST",
      body: JSON.stringify({
        device_token,
        platform,
        device_name: device_name || (platform === "ios" ? "iPhone" : "Android Device"),
        app_version: "1.0.0",
      }),
    });
  },

  async unregisterDevice(device_token: string): Promise<void> {
    return request(`/devices/${device_token}`, { method: "DELETE" });
  },

  // Docs
  async listSpaces(category?: DocCategory): Promise<DocSpace[]> {
    const query = category ? `?category=${encodeURIComponent(category)}` : "";
    return request(`/docs/spaces${query}`);
  },

  async listPages(category?: DocCategory, space_id?: string): Promise<DocPage[]> {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (space_id) params.set("space_id", space_id);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return request(`/docs/pages${qs}`);
  },

  async getPage(spaceId: string, pageId: string): Promise<DocPage> {
    return request(`/docs/spaces/${spaceId}/pages/${pageId}`);
  },

  async searchDocs(query: string, category?: DocCategory): Promise<DocPage[]> {
    const params = new URLSearchParams({ q: query });
    if (category) params.set("category", category);
    return request(`/docs/search?${params.toString()}`);
  },

  // Projects & Tasks
  async listProjects(): Promise<Project[]> {
    return request("/projects");
  },

  async getProject(projectId: string): Promise<Project> {
    return request(`/projects/${projectId}`);
  },

  async listTasks(projectId?: string): Promise<Task[]> {
    const qs = projectId ? `?project_id=${projectId}` : "";
    return request(`/tasks${qs}`);
  },

  async getTask(taskId: string): Promise<Task> {
    return request(`/tasks/${taskId}`);
  },

  async updateTaskStatus(taskId: string, status: string): Promise<Task> {
    return request(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  // Notifications
  async listNotifications(filter: "all" | "unread" | "action_required" = "all"): Promise<Notification[]> {
    return request(`/notifications?filter=${filter}`);
  },

  async markNotificationRead(id: string): Promise<Notification> {
    return request(`/notifications/${id}/read`, { method: "PUT" });
  },

  async markAllNotificationsRead(): Promise<{ marked_read: number }> {
    return request("/notifications/read-all", { method: "PUT" });
  },

  async resolveNotification(id: string): Promise<Notification> {
    return request(`/notifications/${id}/resolve`, { method: "POST" });
  },

  // Chat
  async listChannels(): Promise<ChatChannel[]> {
    return request("/chat/channels");
  },

  async listMessages(channelId: string): Promise<ChatMessage[]> {
    return request(`/chat/channels/${channelId}/messages`);
  },

  async sendMessage(channelId: string, body: string, message_type: "text" | "voice" = "text", attachment_id?: string): Promise<ChatMessage> {
    return request(`/chat/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, message_type, attachment_id }),
    });
  },
};
