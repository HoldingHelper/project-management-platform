import { apiFetch } from "./client";
import type { UUID } from "@/lib/types";

export interface McpTokenRead {
  id: UUID;
  name: string;
  token_prefix: string;
  permission_codes: string[];
  created_at: string;
  expires_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  is_active: boolean;
}

export interface McpTokenCreated extends McpTokenRead {
  token: string;
}

export interface McpPermissionOption {
  code: string;
  description: string;
  tool_names: string[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpSetupRead {
  endpoint_url: string;
  skill_resource_uri: string;
  skill_markdown: string;
  available_permissions: McpPermissionOption[];
  available_tools: McpToolDefinition[];
  security_notes: string[];
}

export function getMcpSetup() {
  return apiFetch<McpSetupRead>("/mcp/setup");
}

export function listMcpTokens() {
  return apiFetch<McpTokenRead[]>("/mcp/tokens");
}

export function createMcpToken(input: {
  name: string;
  permission_codes: string[];
  expires_in_days: number;
}) {
  return apiFetch<McpTokenCreated>("/mcp/tokens", { method: "POST", body: input });
}

export function revokeMcpToken(tokenId: UUID) {
  return apiFetch<void>(`/mcp/tokens/${tokenId}`, { method: "DELETE" });
}
