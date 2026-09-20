"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  GitPullRequest,
  History,
  Layers,
  MessageSquare,
  Play,
  Plus,
  Power,
  RefreshCw,
  Sparkles,
  Trash2,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import {
  automationsApi,
  type AutomationRule,
  type CreateAutomationRulePayload,
} from "@/lib/api/automations";
import { AppError } from "@/lib/api/client";
import { Button, Card, Field, Modal, Switch, TextInput, useToast } from "@/components/ds";
import { PageHeader, PAGE_STYLE } from "@/components/ui/States";

const TRIGGER_OPTIONS = [
  { value: "github.pr_merged", label: "GitHub PR Merged", icon: GitPullRequest },
  { value: "task.status_changed", label: "Task Status Changed", icon: Workflow },
  { value: "blocker.raised", label: "Blocker Raised", icon: XCircle },
  { value: "meeting.remind", label: "Meeting Reminder", icon: Zap },
];

const ACTION_OPTIONS = [
  { value: "mark_task_done", label: "Mark Task as Done", icon: CheckCircle2 },
  { value: "send_whatsapp", label: "Send WhatsApp Notification", icon: MessageSquare },
  { value: "create_task", label: "Create Follow-up Task", icon: Layers },
  { value: "generate_chart_doc", label: "Generate SVG Diagram Page", icon: Sparkles },
];

export default function AutomationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"rules" | "logs">("rules");
  const [showModal, setShowModal] = useState(false);

  // New rule form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("github.pr_merged");
  const [actionType, setActionType] = useState("mark_task_done");

  const { data: rules, isLoading: loadingRules } = useQuery({
    queryKey: ["automations-rules"],
    queryFn: automationsApi.listRules,
  });

  const { data: logs, isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ["automations-logs"],
    queryFn: () => automationsApi.listLogs(50),
    enabled: activeTab === "logs",
  });

  const createRuleMutation = useMutation({
    mutationFn: (payload: CreateAutomationRulePayload) => automationsApi.createRule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations-rules"] });
      setShowModal(false);
      setName("");
      setDescription("");
      toast.push("Automation rule created successfully.", "success");
    },
    onError: (e) =>
      toast.push(e instanceof AppError ? e.message : "Failed to create rule.", "error"),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      automationsApi.updateRule(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations-rules"] });
      toast.push("Rule status updated.", "success");
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: automationsApi.deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations-rules"] });
      toast.push("Rule deleted.", "success");
    },
  });

  const testRuleMutation = useMutation({
    mutationFn: automationsApi.testRule,
    onSuccess: () => {
      toast.push("Test run dispatched. Check execution logs.", "success");
      queryClient.invalidateQueries({ queryKey: ["automations-logs"] });
    },
  });

  return (
    <div style={PAGE_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <PageHeader
          title="Workflow Automations"
          subtitle="Build reactive triggers, GitHub PR automations, WhatsApp notifications, and diagram generators."
        />
        <Button onClick={() => setShowModal(true)}>
          <Plus size={15} /> Create Automation Rule
        </Button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, borderBottom: "1px solid var(--border-default)", marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab("rules")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "rules" ? "2px solid var(--accent-primary)" : "2px solid transparent",
            color: activeTab === "rules" ? "var(--text-primary)" : "var(--text-tertiary)",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          <Workflow size={15} /> Active Rules ({rules?.length ?? 0})
        </button>
        <button
          onClick={() => {
            setActiveTab("logs");
            refetchLogs();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "logs" ? "2px solid var(--accent-primary)" : "2px solid transparent",
            color: activeTab === "logs" ? "var(--text-primary)" : "var(--text-tertiary)",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          <History size={15} /> Execution Audit Logs
        </button>
      </div>

      {/* RULES TAB */}
      {activeTab === "rules" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rules && rules.length > 0 ? (
            rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-3)",
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                      {rule.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: rule.is_active ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)",
                        color: rule.is_active ? "#10b981" : "#94a3b8",
                        fontWeight: 600,
                      }}
                    >
                      {rule.is_active ? "Active" : "Paused"}
                    </span>
                  </div>

                  {rule.description && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {rule.description}
                    </div>
                  )}

                  {/* Trigger -> Action flow pills */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "rgba(56, 189, 248, 0.1)",
                        color: "#38bdf8",
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <Zap size={13} /> {rule.trigger_type}
                    </span>
                    <ArrowRight size={14} color="var(--text-tertiary)" />
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "rgba(168, 85, 247, 0.1)",
                        color: "#c084fc",
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <Sparkles size={13} /> {rule.action_type}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => testRuleMutation.mutate(rule.id)}
                    disabled={testRuleMutation.isPending}
                  >
                    <Play size={13} /> Test
                  </Button>
                  <Switch
                    checked={rule.is_active}
                    onChange={(val) => toggleRuleMutation.mutate({ id: rule.id, is_active: val })}
                  />
                  <button
                    onClick={() => deleteRuleMutation.mutate(rule.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--status-delayed, #ef4444)",
                      cursor: "pointer",
                      padding: 6,
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                    }}
                    title="Delete Rule"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "60px 20px",
                color: "var(--text-tertiary)",
                background: "var(--surface-1)",
                borderRadius: "var(--radius-3)",
                border: "1px dashed var(--border-default)",
              }}
            >
              <Workflow size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                No Automation Rules Created Yet
              </div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                Create automated rules to connect GitHub pull requests, WhatsApp alerts, and docs diagrams.
              </div>
              <Button onClick={() => setShowModal(true)}>
                <Plus size={15} /> Create First Rule
              </Button>
            </div>
          )}
        </div>
      )}

      {/* LOGS TAB */}
      {activeTab === "logs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button size="sm" variant="secondary" onClick={() => refetchLogs()}>
              <RefreshCw size={13} className={loadingLogs ? "animate-spin" : ""} /> Refresh Logs
            </Button>
          </div>

          {logs && logs.length > 0 ? (
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-2)",
                overflow: "hidden",
                background: "var(--surface-1)",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                    <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)" }}>Status</th>
                    <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)" }}>Rule Name</th>
                    <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)" }}>Trigger Event</th>
                    <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)" }}>Result Summary</th>
                    <th style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-secondary)" }}>Executed At</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: log.status === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                            color: log.status === "success" ? "#10b981" : "#ef4444",
                            fontWeight: 600,
                          }}
                        >
                          {log.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {log.rule_name}
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12, color: "#38bdf8" }}>
                        {log.trigger_event}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>
                        {log.result_summary}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-tertiary)", fontSize: 12 }}>
                        {new Date(log.executed_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-tertiary)" }}>
              No execution logs recorded yet.
            </div>
          )}
        </div>
      )}

      {/* CREATE RULE MODAL */}
      {showModal && (
        <Modal
          title="Create New Automation Rule"
          open={showModal}
          onClose={() => setShowModal(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Rule Name" hint="e.g. Auto-Complete Tasks on PR Merge">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule Name" />
            </Field>

            <Field label="Description (Optional)">
              <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
            </Field>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                1. When This Event Occurs (Trigger):
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {TRIGGER_OPTIONS.map((trig) => (
                  <button
                    key={trig.value}
                    type="button"
                    onClick={() => setTriggerType(trig.value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-2)",
                      border: `1px solid ${triggerType === trig.value ? "var(--accent-primary)" : "var(--border-default)"}`,
                      background: triggerType === trig.value ? "rgba(56, 189, 248, 0.1)" : "var(--surface-2)",
                      color: triggerType === trig.value ? "var(--accent-primary)" : "var(--text-primary)",
                      cursor: "pointer",
                      fontSize: 12.5,
                      fontWeight: 600,
                      textAlign: "left",
                    }}
                  >
                    <trig.icon size={15} />
                    {trig.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                2. Then Automatically Execute (Action):
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {ACTION_OPTIONS.map((act) => (
                  <button
                    key={act.value}
                    type="button"
                    onClick={() => setActionType(act.value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-2)",
                      border: `1px solid ${actionType === act.value ? "var(--accent-primary)" : "var(--border-default)"}`,
                      background: actionType === act.value ? "rgba(168, 85, 247, 0.1)" : "var(--surface-2)",
                      color: actionType === act.value ? "#c084fc" : "var(--text-primary)",
                      cursor: "pointer",
                      fontSize: 12.5,
                      fontWeight: 600,
                      textAlign: "left",
                    }}
                  >
                    <act.icon size={15} />
                    {act.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  createRuleMutation.mutate({
                    name,
                    description,
                    trigger_type: triggerType,
                    action_type: actionType,
                  })
                }
                disabled={!name || createRuleMutation.isPending}
              >
                Create Rule
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
