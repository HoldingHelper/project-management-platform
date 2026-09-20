"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleDot, FolderGit2, GitPullRequest, Search, X } from "lucide-react";
import { integrationsApi, type GitHubIssueOrPRItem, type GitHubRepoItem } from "@/lib/api/integrations";
import { TextInput } from "@/components/ds";

interface GitHubMentionPickerProps {
  onSelect: (repo: string, item: GitHubIssueOrPRItem) => void;
  onClose: () => void;
}

export function GitHubMentionPicker({ onSelect, onClose }: GitHubMentionPickerProps) {
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: repos } = useQuery({
    queryKey: ["user-github-repos"],
    queryFn: integrationsApi.listUserGitHubRepos,
  });

  useEffect(() => {
    if (!selectedRepo && repos?.length) setSelectedRepo(repos[0].full_name);
  }, [repos, selectedRepo]);

  const { data: items, isLoading } = useQuery({
    queryKey: ["github-issues-prs", selectedRepo, search],
    queryFn: () => integrationsApi.searchGitHubIssuesAndPRs(selectedRepo, search),
    enabled: !!selectedRepo,
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        width: 380,
        maxHeight: 340,
        backgroundColor: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 10,
        boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      {/* Header with Repo Selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-subtle)",
          backgroundColor: "var(--surface-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, marginRight: 8 }}>
          <FolderGit2 size={14} color="var(--accent-primary)" />
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-primary)",
              fontSize: 12.5,
              fontWeight: 600,
              outline: "none",
              cursor: "pointer",
              maxWidth: 260,
            }}
          >
            <option value="">Select a connected repository</option>
            {repos?.map((r) => (
              <option key={r.id} value={r.full_name} style={{ background: "#18181b", color: "#fff" }}>
                {r.full_name} {r.is_private ? "(Private)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onClose}
          style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
        <input
          type="text"
          placeholder="Filter issue or PR by title or #number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12.5,
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
      </div>

      {/* Issues / PRs List */}
      <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
        {isLoading ? (
          <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
            Loading GitHub issues and pull requests…
          </div>
        ) : !items || items.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
            No matching issues or PRs found in this repository.
          </div>
        ) : (
          items.map((item) => {
            const isMerged = item.state === "merged";
            const isOpen = item.state === "open";
            const stateColor = isMerged ? "#a855f7" : isOpen ? "#00E261" : "#ef4444";

            return (
              <div
                key={item.id}
                onClick={() => {
                  onSelect(selectedRepo, item);
                  onClose();
                }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
                className="pmp-row"
              >
                {item.type === "pull_request" ? (
                  <GitPullRequest size={14} color={stateColor} style={{ marginTop: 2, flexShrink: 0 }} />
                ) : (
                  <CircleDot size={14} color={stateColor} style={{ marginTop: 2, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: stateColor }}>
                      #{item.number}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                    by {item.author} • {item.state}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
