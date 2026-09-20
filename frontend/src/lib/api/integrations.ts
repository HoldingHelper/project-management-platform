import { apiFetch } from "@/lib/api/client";

export interface IntegrationItemStatus {
  provider: string;
  is_connected: boolean;
  account_name?: string | null;
  account_id?: string | null;
  avatar_url?: string | null;
  last_synced_at?: string | null;
  details?: Record<string, any> | null;
}

export interface IntegrationsStatusResponse {
  github: IntegrationItemStatus;
  google_calendar: IntegrationItemStatus;
  google_drive: IntegrationItemStatus;
  telegram: IntegrationItemStatus;
  whatsapp: IntegrationItemStatus;
}

export interface GitHubRepoItem {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  is_private: boolean;
  description?: string | null;
  html_url: string;
  default_branch: string;
}

export interface GitHubIssueOrPRItem {
  id: number;
  number: number;
  title: string;
  type: "issue" | "pull_request";
  state: "open" | "closed" | "merged";
  author: string;
  html_url: string;
  labels: string[];
  created_at: string;
  updated_at: string;
}

export interface GitHubMentionResolved {
  repo: string;
  number: number;
  type: "issue" | "pull_request";
  title: string;
  state: "open" | "closed" | "merged";
  author: string;
  html_url: string;
  labels: string[];
}

export interface TelegramLinkCodeResponse {
  link_code: string;
  bot_username: string;
  deep_link: string;
  expires_at: string;
}

export interface TelegramTestResponse {
  success: boolean;
  chat_id?: string | null;
  message: string;
}

export interface GitHubRepoLink {
  id: string;
  repo_owner: string;
  repo_name: string;
  default_project_id: string | null;
  default_phase_id: string | null;
  auto_create_tasks: boolean;
  auto_close_tasks_on_merge: boolean;
  created_at: string;
}

export interface ConfigureGitHubRepoPayload {
  repo_owner: string;
  repo_name: string;
  default_project_id?: string | null;
  default_phase_id?: string | null;
  auto_create_tasks: boolean;
  auto_close_tasks_on_merge: boolean;
}

export interface WhatsAppSettings {
  connected: boolean;
  phone_number: string;
  notify_meetings: boolean;
  notify_mentions: boolean;
  notify_blockers: boolean;
  notify_dms: boolean;
  is_verified?: boolean;
}

export const integrationsApi = {
  // Unified Status
  async getStatus(): Promise<IntegrationsStatusResponse> {
    return apiFetch<IntegrationsStatusResponse>("/integrations/status");
  },

  // GitHub User OAuth & Mentions
  async getGitHubAuthUrl(redirect_uri?: string): Promise<{ url: string }> {
    const qs = redirect_uri ? `?redirect_uri=${encodeURIComponent(redirect_uri)}` : "";
    return apiFetch<{ url: string }>(`/integrations/github/auth-url${qs}`);
  },

  async connectGitHub(code: string, state?: string): Promise<{ status: string; github_username: string; avatar_url?: string }> {
    return apiFetch<{ status: string; github_username: string; avatar_url?: string }>("/integrations/github/callback", {
      method: "POST",
      body: { code, state },
    });
  },

  async disconnectGitHub(): Promise<void> {
    return apiFetch<void>("/integrations/github/disconnect", { method: "DELETE" });
  },

  async listUserGitHubRepos(): Promise<GitHubRepoItem[]> {
    return apiFetch<GitHubRepoItem[]>("/integrations/github/user-repos");
  },

  async searchGitHubIssuesAndPRs(repo: string, query?: string): Promise<GitHubIssueOrPRItem[]> {
    const params = new URLSearchParams({ repo });
    if (query) params.set("q", query);
    return apiFetch<GitHubIssueOrPRItem[]>(`/integrations/github/issues-and-prs?${params.toString()}`);
  },

  async resolveGitHubMention(repo: string, number: number): Promise<GitHubMentionResolved> {
    return apiFetch<GitHubMentionResolved>(`/integrations/github/resolve-mention?repo=${encodeURIComponent(repo)}&number=${number}`);
  },

  // Telegram
  async generateTelegramLinkCode(): Promise<TelegramLinkCodeResponse> {
    return apiFetch<TelegramLinkCodeResponse>("/integrations/telegram/link-code", { method: "POST" });
  },

  async disconnectTelegram(): Promise<void> {
    return apiFetch<void>("/integrations/telegram/disconnect", { method: "DELETE" });
  },

  async sendTestTelegramMessage(): Promise<TelegramTestResponse> {
    return apiFetch<TelegramTestResponse>("/integrations/telegram/test", { method: "POST" });
  },

  // Google Drive
  async getDriveAuthUrl(): Promise<{ url: string }> {
    return apiFetch<{ url: string }>("/integrations/drive/auth-url");
  },

  async connectDrive(code: string, state?: string): Promise<{ status: string; email?: string }> {
    return apiFetch<{ status: string; email?: string }>("/integrations/drive/callback", {
      method: "POST",
      body: { code, state },
    });
  },

  async disconnectDrive(): Promise<void> {
    return apiFetch<void>("/integrations/drive/disconnect", { method: "DELETE" });
  },

  // GitHub Org Webhook Links
  async listGitHubRepos(): Promise<GitHubRepoLink[]> {
    return apiFetch<GitHubRepoLink[]>("/integrations/github/repos");
  },

  async configureGitHubRepo(payload: ConfigureGitHubRepoPayload): Promise<{ status: string; id: string }> {
    return apiFetch<{ status: string; id: string }>("/integrations/github/repos", {
      method: "POST",
      body: payload,
    });
  },

  // WhatsApp
  async getWhatsAppSettings(): Promise<WhatsAppSettings> {
    return apiFetch<WhatsAppSettings>("/integrations/whatsapp/settings");
  },

  async updateWhatsAppSettings(payload: {
    phone_number: string;
    notify_meetings: boolean;
    notify_mentions: boolean;
    notify_blockers: boolean;
    notify_dms: boolean;
  }): Promise<{ status: string; phone_number: string }> {
    return apiFetch<{ status: string; phone_number: string }>(
      "/integrations/whatsapp/settings",
      {
        method: "POST",
        body: payload,
      }
    );
  },

  async sendTestWhatsAppMessage(): Promise<{ delivered: boolean }> {
    return apiFetch<{ delivered: boolean }>("/integrations/whatsapp/test", {
      method: "POST",
    });
  },
};
