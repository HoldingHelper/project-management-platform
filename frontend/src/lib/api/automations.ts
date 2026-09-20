import { apiFetch } from "@/lib/api/client";

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  condition_json: Record<string, any>;
  action_type: string;
  action_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

export interface AutomationExecutionLog {
  id: string;
  rule_id: string | null;
  rule_name: string;
  trigger_event: string;
  payload_json: Record<string, any>;
  status: "success" | "failed" | "skipped";
  result_summary: string;
  executed_at: string;
}

export interface CreateAutomationRulePayload {
  name: string;
  description?: string;
  trigger_type: string;
  condition_json?: Record<string, any>;
  action_type: string;
  action_config?: Record<string, any>;
}

export const automationsApi = {
  async listRules(): Promise<AutomationRule[]> {
    return apiFetch<AutomationRule[]>("/automations/rules");
  },

  async createRule(payload: CreateAutomationRulePayload): Promise<{ id: string; status: string }> {
    return apiFetch<{ id: string; status: string }>("/automations/rules", {
      method: "POST",
      body: payload,
    });
  },

  async updateRule(
    ruleId: string,
    payload: {
      name?: string;
      is_active?: boolean;
      condition_json?: Record<string, any>;
      action_config?: Record<string, any>;
    }
  ): Promise<{ id: string; status: string }> {
    return apiFetch<{ id: string; status: string }>(`/automations/rules/${ruleId}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteRule(ruleId: string): Promise<void> {
    return apiFetch<void>(`/automations/rules/${ruleId}`, {
      method: "DELETE",
    });
  },

  async listLogs(limit: number = 50): Promise<AutomationExecutionLog[]> {
    return apiFetch<AutomationExecutionLog[]>(`/automations/logs?limit=${limit}`);
  },

  async testRule(ruleId: string): Promise<{ results: any[] }> {
    return apiFetch<{ results: any[] }>(`/automations/rules/${ruleId}/test`, {
      method: "POST",
    });
  },
};
