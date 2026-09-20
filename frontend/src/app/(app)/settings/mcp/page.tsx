"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  KeyRound,
  LockKeyhole,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { API_BASE_URL, AppError } from "@/lib/api/client";
import {
  createMcpToken,
  getMcpSetup,
  listMcpTokens,
  revokeMcpToken,
  type McpTokenCreated,
} from "@/lib/api/mcp";
import { Button, Card, Field, Select, TextInput, useToast } from "@/components/ds";
import { EmptyState, PageHeader, PAGE_STYLE, Spinner } from "@/components/ui/States";

type ConfigTab = "json" | "codex" | "claude";

function endpointUrl(): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  if (/^https?:\/\//i.test(base)) return `${base}/mcp`;
  if (typeof window === "undefined") return `${base}/mcp`;
  return `${window.location.origin}${base.startsWith("/") ? "" : "/"}${base}/mcp`;
}

function formatDate(value?: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function permissionLabel(code: string): string {
  return code
    .split(".")
    .flatMap((part) => part.split("_"))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function McpSettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("My AI agent");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [createdToken, setCreatedToken] = useState<McpTokenCreated | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [configTab, setConfigTab] = useState<ConfigTab>("json");
  const initializedPermissions = useRef(false);

  const setupQuery = useQuery({ queryKey: ["mcp-setup"], queryFn: getMcpSetup });
  const tokensQuery = useQuery({ queryKey: ["mcp-tokens"], queryFn: listMcpTokens });
  const setup = setupQuery.data;

  useEffect(() => {
    if (setup && !initializedPermissions.current) {
      initializedPermissions.current = true;
      setSelectedPermissions(setup.available_permissions.map((permission) => permission.code));
    }
  }, [setup]);

  const createMutation = useMutation({
    mutationFn: () =>
      createMcpToken({
        name,
        expires_in_days: Number(expiresInDays),
        permission_codes: selectedPermissions,
      }),
    onSuccess: (token) => {
      setCreatedToken(token);
      setShowSecret(true);
      queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
      toast.push("MCP connection created. Copy the secret now; it is shown once.", "success");
    },
    onError: (error) =>
      toast.push(error instanceof AppError ? error.message : "Could not create MCP token.", "error"),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeMcpToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-tokens"] });
      toast.push("MCP token revoked immediately.", "success");
    },
    onError: (error) =>
      toast.push(error instanceof AppError ? error.message : "Could not revoke MCP token.", "error"),
  });

  const filteredPermissions = useMemo(() => {
    const query = permissionSearch.trim().toLowerCase();
    if (!query) return setup?.available_permissions ?? [];
    return (setup?.available_permissions ?? []).filter(
      (permission) =>
        permission.code.toLowerCase().includes(query) ||
        permission.description.toLowerCase().includes(query) ||
        permission.tool_names.some((tool) => tool.toLowerCase().includes(query)),
    );
  }, [permissionSearch, setup]);

  const selectedToolNames = useMemo(() => {
    const selected = new Set(selectedPermissions);
    const tools = new Set<string>(["pmp_user_context"]);
    for (const permission of setup?.available_permissions ?? []) {
      if (selected.has(permission.code)) permission.tool_names.forEach((tool) => tools.add(tool));
    }
    return tools;
  }, [selectedPermissions, setup]);

  const url = endpointUrl();
  const rawSecret = createdToken?.token ?? "<GENERATE_A_PERSONAL_TOKEN>";
  const mcpJson = JSON.stringify(
    {
      mcpServers: {
        "project-management-platform": {
          type: "http",
          url,
          headers: { Authorization: `Bearer ${rawSecret}` },
        },
      },
    },
    null,
    2,
  );
  const codexToml = `[mcp_servers.project-management-platform]\nurl = "${url}"\nhttp_headers = { Authorization = "Bearer ${rawSecret}" }`;
  const claudeCommand = `claude mcp add --transport http project-management-platform "${url}" --header "Authorization: Bearer ${rawSecret}"`;
  const activeConfig = configTab === "json" ? mcpJson : configTab === "codex" ? codexToml : claudeCommand;
  const visibleConfig =
    createdToken && !showSecret
      ? activeConfig.replaceAll(createdToken.token, `${createdToken.token_prefix}••••••••••••••••••••••••`)
      : activeConfig;

  const togglePermission = (code: string) => {
    setSelectedPermissions((current) =>
      current.includes(code) ? current.filter((value) => value !== code) : [...current, code],
    );
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.push(`${label} copied.`, "success");
  };

  const downloadSkill = () => {
    if (!setup) return;
    const href = URL.createObjectURL(new Blob([setup.skill_markdown], { type: "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "SKILL.md";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  if (setupQuery.isLoading || tokensQuery.isLoading) {
    return <div style={PAGE_STYLE}><Spinner label="Loading MCP access…" /></div>;
  }

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        title="AI & MCP Connections"
        subtitle="Connect Codex, Claude, Cursor, or another MCP client as your own Platform account—with revocable, permission-limited access."
        badge={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 999, background: "var(--status-success-bg)", color: "var(--status-success)", fontSize: 12, fontWeight: 700 }}>
            <ShieldCheck size={13} /> User-scoped
          </span>
        }
      />

      <Card style={{ borderColor: "color-mix(in srgb, var(--accent-primary) 35%, var(--border-subtle))" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: "var(--accent-primary-soft)", color: "var(--accent-primary)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <LockKeyhole size={21} />
          </span>
          <div>
            <h2 style={{ margin: "1px 0 5px", fontSize: 16 }}>Passwords never leave Platform</h2>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 }}>
              AI clients authenticate with a personal token. Platform stores only its hash, checks your live account permissions on every request, and exposes the full authenticated JSON API plus typed tools—never more than you can already access.
            </p>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 430px), 1fr))", gap: 20, alignItems: "start" }}>
        <Card
          title="1. Create a personal MCP token"
          subtitle="Start with all your available MCP permissions, then remove anything the agent does not need."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(130px, 0.4fr)", gap: 12 }}>
              <Field label="Connection name">
                <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Work Mac — Codex" />
              </Field>
              <Field label="Expires after">
                <Select
                  value={expiresInDays}
                  onChange={(event) => setExpiresInDays(event.target.value)}
                  options={[
                    { value: "7", label: "7 days" },
                    { value: "30", label: "30 days" },
                    { value: "90", label: "90 days" },
                    { value: "180", label: "180 days" },
                    { value: "365", label: "1 year" },
                  ]}
                />
              </Field>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Permission limit</div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 2 }}>{selectedPermissions.length} selected · {selectedToolNames.size} tools · None gives identity/skill only</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedPermissions(setup?.available_permissions.map((permission) => permission.code) ?? [])}>All</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedPermissions([])}>None</Button>
                </div>
              </div>
              <TextInput
                value={permissionSearch}
                onChange={(event) => setPermissionSearch(event.target.value)}
                icon={<Search size={15} />}
                placeholder="Search permissions or tools…"
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 330, overflowY: "auto", marginTop: 10, paddingRight: 3 }}>
                {filteredPermissions.map((permission) => {
                  const checked = selectedPermissions.includes(permission.code);
                  return (
                    <label
                      key={permission.code}
                      style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)", gap: 10, padding: 11, border: `1px solid ${checked ? "color-mix(in srgb, var(--accent-primary) 45%, var(--border-default))" : "var(--border-subtle)"}`, borderRadius: 10, background: checked ? "var(--accent-primary-soft)" : "var(--surface-1)", cursor: "pointer" }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => togglePermission(permission.code)} style={{ width: 17, height: 17, marginTop: 2, accentColor: "var(--accent-primary)" }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 650 }}>{permissionLabel(permission.code)}</span>
                        <code style={{ display: "block", color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 2 }}>{permission.code}</code>
                        <span style={{ display: "block", color: "var(--text-secondary)", fontSize: 11.5, marginTop: 5, lineHeight: 1.45 }}>
                          {permission.tool_names.join(" · ")}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
            >
              <KeyRound size={15} /> {createMutation.isPending ? "Generating…" : "Generate connection token"}
            </Button>
          </div>
        </Card>

        <Card
          title="2. Copy into your AI client"
          subtitle="The configuration includes the generated token and the MCP endpoint."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {createdToken ? (
              <div style={{ padding: 12, borderRadius: 10, border: "1px solid var(--status-warning)", background: "var(--status-warning-bg)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div>
                    <div style={{ color: "var(--status-warning)", fontSize: 12, fontWeight: 800 }}>COPY NOW — SHOWN ONCE</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 11.5, marginTop: 3 }}>If lost, revoke it and generate another.</div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setShowSecret((value) => !value)}>
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />} {showSecret ? "Hide" : "Show"}
                  </Button>
                </div>
                <code style={{ display: "block", marginTop: 10, padding: 10, borderRadius: 7, background: "var(--surface-1)", overflowWrap: "anywhere", fontSize: 11.5 }}>
                  {showSecret ? createdToken.token : `${createdToken.token_prefix}••••••••••••••••••••••••`}
                </code>
              </div>
            ) : (
              <div style={{ padding: 12, borderRadius: 10, background: "var(--surface-1)", color: "var(--text-secondary)", fontSize: 12.5 }}>
                Generate a token on the left. Your ready-to-copy configuration will appear here with the secret already inserted.
              </div>
            )}

            <div role="tablist" aria-label="MCP client configuration" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {([
                ["json", "MCP JSON"],
                ["codex", "Codex config"],
                ["claude", "Claude CLI"],
              ] as const).map(([value, label]) => (
                <Button key={value} size="sm" variant={configTab === value ? "primary" : "secondary"} role="tab" aria-selected={configTab === value} onClick={() => setConfigTab(value)}>
                  {label}
                </Button>
              ))}
            </div>

            <CodeBlock value={visibleConfig} onCopy={() => copy(activeConfig, configTab === "json" ? "MCP JSON" : "Configuration")} disabled={!createdToken} />

            <div style={{ display: "grid", gap: 8 }}>
              <Step number="1" text="Generate a token and copy the configuration." />
              <Step number="2" text="Paste it into your AI client's MCP settings, then restart or reload the client." />
              <Step number="3" text={`Ask the agent to read ${setup?.skill_resource_uri ?? "pmp://agent/SKILL.md"} before its first tool call.`} />
            </div>
          </div>
        </Card>
      </div>

      <Card title="Active and previous connections" subtitle="Revocation is immediate. Existing client sessions lose access on their next request.">
        {(tokensQuery.data ?? []).length === 0 ? (
          <EmptyState title="No MCP connections yet" hint="Generate your first personal token above." icon={<KeyRound size={20} />} />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {(tokensQuery.data ?? []).map((token) => (
              <div key={token.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 14, alignItems: "center", padding: 13, border: "1px solid var(--border-subtle)", borderRadius: 11, background: "var(--surface-1)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13.5 }}>{token.name}</strong>
                    <span style={{ padding: "2px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: token.is_active ? "var(--status-success-bg)" : "var(--surface-3)", color: token.is_active ? "var(--status-success)" : "var(--text-tertiary)" }}>
                      {token.is_active ? "Active" : token.revoked_at ? "Revoked" : "Expired"}
                    </span>
                  </div>
                  <code style={{ display: "block", color: "var(--text-tertiary)", fontSize: 11.5, marginTop: 5 }}>{token.token_prefix}…</code>
                  <div style={{ color: "var(--text-secondary)", fontSize: 11.5, marginTop: 5, lineHeight: 1.5 }}>
                    {token.permission_codes.length} permissions · Last used {formatDate(token.last_used_at)} · Expires {formatDate(token.expires_at)}
                  </div>
                </div>
                {token.is_active && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={revokeMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Revoke “${token.name}”? Its AI client will immediately lose access.`)) revokeMutation.mutate(token.id);
                    }}
                  >
                    <Trash2 size={14} /> Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 20, alignItems: "start" }}>
        <Card
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><FileCode2 size={16} /> Agent SKILL.md</span>}
          subtitle={`Advertised through MCP as ${setup?.skill_resource_uri ?? "pmp://agent/SKILL.md"}.`}
          right={
            <div style={{ display: "flex", gap: 7 }}>
              <Button size="sm" variant="secondary" onClick={() => setup && copy(setup.skill_markdown, "SKILL.md")}><Copy size={13} /> Copy</Button>
              <Button size="sm" variant="secondary" onClick={downloadSkill}><Download size={13} /> Download</Button>
            </div>
          }
        >
          <pre tabIndex={0} aria-label="Platform MCP agent skill" style={{ margin: 0, maxHeight: 430, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 14, borderRadius: 9, background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", fontSize: 11.5, lineHeight: 1.6 }}>
            {setup?.skill_markdown}
          </pre>
        </Card>

        <Card
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Bot size={16} /> Available agent tools</span>}
          subtitle={`${setup?.available_tools.length ?? 0} typed tools, including permission-scoped access to the full authenticated JSON API.`}
        >
          <div style={{ display: "grid", gap: 8 }}>
            {(setup?.available_tools ?? []).map((tool) => (
              <div key={tool.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, padding: 11, borderRadius: 9, background: selectedToolNames.has(tool.name) ? "var(--accent-primary-soft)" : "var(--surface-1)", opacity: selectedToolNames.has(tool.name) ? 1 : 0.55 }}>
                <div style={{ minWidth: 0 }}>
                  <code style={{ fontSize: 11.5, color: "var(--accent-primary)", overflowWrap: "anywhere" }}>{tool.name}</code>
                  <div style={{ color: "var(--text-secondary)", fontSize: 11.5, lineHeight: 1.45, marginTop: 4 }}>{tool.description}</div>
                </div>
                <ChevronRight size={15} style={{ color: "var(--text-tertiary)", marginTop: 2 }} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CodeBlock({ value, onCopy, disabled }: { value: string; onCopy: () => void; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <pre tabIndex={0} aria-label="MCP client configuration" style={{ margin: 0, minHeight: 160, maxHeight: 310, overflow: "auto", padding: "46px 14px 14px", borderRadius: 10, background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", fontSize: 11.5, lineHeight: 1.55 }}>
        {value}
      </pre>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled}
        style={{ position: "absolute", top: 7, right: 7, minHeight: 32 }}
        onClick={async () => {
          onCopy();
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function Step({ number, text }: { number: string; text: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", gap: 9, alignItems: "start", color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.5 }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: "var(--surface-3)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-primary)", fontWeight: 700, fontSize: 11 }}>{number}</span>
      <span>{text}</span>
    </div>
  );
}
