"use client";

import React, { useEffect, useState } from "react";
import { GitPullRequest, CircleDot, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { integrationsApi, type GitHubMentionResolved } from "@/lib/api/integrations";

interface GitHubBadgeProps {
  repo: string;
  number: number;
}

export function GitHubBadge({ repo, number }: GitHubBadgeProps) {
  const [data, setData] = useState<GitHubMentionResolved | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    integrationsApi.resolveGitHubMention(repo, number)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [repo, number]);

  if (loading) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 6,
          background: "var(--surface-3)",
          fontSize: 12,
          color: "var(--text-tertiary)",
        }}
      >
        <GitPullRequest size={12} /> {repo}#{number}…
      </span>
    );
  }

  const isMerged = data?.state === "merged";
  const isOpen = data?.state === "open";
  const stateColor = isMerged ? "#a855f7" : isOpen ? "#00E261" : "#ef4444";
  const stateBg = isMerged ? "rgba(168, 85, 247, 0.12)" : isOpen ? "rgba(0, 226, 97, 0.12)" : "rgba(239, 68, 68, 0.12)";

  return (
    <a
      href={data?.html_url || `https://github.com/${repo}/issues/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        borderRadius: 6,
        background: stateBg,
        border: `1px solid ${stateColor}40`,
        color: "var(--text-primary)",
        fontSize: 12.5,
        fontWeight: 500,
        textDecoration: "none",
        verticalAlign: "middle",
        margin: "0 2px",
      }}
    >
      {data?.type === "pull_request" ? (
        <GitPullRequest size={13} color={stateColor} />
      ) : (
        <CircleDot size={13} color={stateColor} />
      )}
      <span style={{ fontWeight: 600, color: stateColor }}>
        #{number}
      </span>
      <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {data?.title || `${repo}#${number}`}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          padding: "1px 4px",
          borderRadius: 4,
          backgroundColor: stateColor,
          color: "#000",
        }}
      >
        {data?.state}
      </span>
    </a>
  );
}
