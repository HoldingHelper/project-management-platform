"use client";

import { useState, type ReactNode } from "react";
import { Download, Maximize2, Minimize2 } from "lucide-react";

function sanitizeSvg(svgStr: string): string {
  // Extract clean svg block
  const match = svgStr.match(/<svg[\s\S]*<\/svg>/i);
  return match ? match[0] : svgStr;
}

function SvgDiagramViewer({ svg }: { svg: string }) {
  const [expanded, setExpanded] = useState(false);
  const clean = sanitizeSvg(svg);

  const downloadSvg = () => {
    const blob = new Blob([clean], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagram.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`rendered-svg-diagram-card ${expanded ? "expanded" : ""}`}
      style={{
        margin: "18px 0",
        borderRadius: "var(--radius-2, 10px)",
        border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
        background: "var(--surface-deepest, #080c14)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          background: "var(--surface-2, rgba(255,255,255,0.03))",
          borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-tertiary, #94a3b8)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--accent-primary, #6366f1)",
              display: "inline-block",
            }}
          />
          Interactive Diagram
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={downloadSvg}
            title="Download SVG"
            style={{
              background: "transparent",
              border: 0,
              color: "inherit",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Download size={13} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Expand Full Width"}
            style={{
              background: "transparent",
              border: 0,
              color: "inherit",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>
      <div
        style={{
          padding: 16,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          overflowX: "auto",
          maxWidth: "100%",
          maxHeight: expanded ? "none" : 540,
        }}
      >
        {/* SVG documents are rendered through the browser's image sandbox so
            user-authored public docs cannot execute SVG scripts or handlers. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`}
          alt="Document diagram"
          style={{ display: "block", maxWidth: "100%", maxHeight: expanded ? "none" : 500 }}
        />
      </div>
    </div>
  );
}

type TextHighlight = { id: string; text: string };

function highlightedText(text: string, highlights: TextHighlight[]): ReactNode {
  const matches = highlights
    .map((highlight) => ({ highlight, index: text.indexOf(highlight.text) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index || b.highlight.text.length - a.highlight.text.length)
    .filter((item, index, items) => !items.slice(0, index).some((prior) => item.index < prior.index + prior.highlight.text.length));
  if (!matches.length) return text;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const { highlight, index } of matches) {
    if (index > cursor) nodes.push(text.slice(cursor, index));
    nodes.push(
      <mark
        key={highlight.id}
        id={`doc-comment-${highlight.id}`}
        title="This text has an inline comment"
        style={{ background: "rgba(250, 204, 21, 0.3)", color: "inherit", borderBottom: "2px solid #eab308" }}
      >
        {highlight.text}
      </mark>,
    );
    cursor = index + highlight.text.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

function inline(text: string, highlights: TextHighlight[] = []): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|@[A-Za-z0-9_.-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@") && part.length > 1) {
      return (
        <span
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "1px 6px",
            borderRadius: "var(--radius-full)",
            background: "var(--accent-primary-soft, rgba(99,102,241,0.15))",
            color: "var(--accent-primary, #818cf8)",
            fontWeight: 700,
            fontSize: "0.92em",
            fontFamily: "var(--font-mono)",
            margin: "0 2px",
          }}
        >
          {part}
        </span>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} style={inlineCodeStyle}>
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer" style={{ color: "var(--text-link, #60a5fa)" }}>
          {link[1]}
        </a>
      );
    }
    return highlightedText(part, highlights);
  });
}

export function MarkdownPreview({ value, empty = "No description yet.", highlights = [] }: { value?: string | null; empty?: string; highlights?: TextHighlight[] }) {
  if (!value || !value.trim()) {
    return <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>{empty}</div>;
  }

  // Pre-process raw SVG blocks that are not inside code fences
  const content = value.trim();
  const lines = content.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let list: ReactNode[] = [];
  let code: string[] | null = null;
  let rawSvgLines: string[] | null = null;

  const flushList = () => {
    if (list.length) {
      nodes.push(
        <ul key={`ul-${nodes.length}`} style={{ margin: "8px 0", paddingLeft: 20 }}>
          {list}
        </ul>,
      );
      list = [];
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const line = raw.trimEnd();

    // Check for raw SVG outside code block
    if (rawSvgLines) {
      rawSvgLines.push(raw);
      if (line.includes("</svg>")) {
        const fullSvg = rawSvgLines.join("\n");
        nodes.push(<SvgDiagramViewer key={`raw-svg-${nodes.length}`} svg={fullSvg} />);
        rawSvgLines = null;
      }
      continue;
    }

    if (!code && (line.startsWith("<svg") || line.includes("<svg xmlns="))) {
      flushList();
      if (line.includes("</svg>")) {
        nodes.push(<SvgDiagramViewer key={`raw-svg-${nodes.length}`} svg={raw} />);
      } else {
        rawSvgLines = [raw];
      }
      continue;
    }

    if (line.startsWith("```")) {
      if (code) {
        const codeText = code.join("\n");
        if (codeText.includes("<svg") && codeText.includes("</svg>")) {
          nodes.push(<SvgDiagramViewer key={`code-svg-${nodes.length}`} svg={codeText} />);
        } else {
          nodes.push(
            <pre key={`pre-${nodes.length}`} style={preStyle}>
              {codeText}
            </pre>,
          );
        }
        code = null;
      } else {
        flushList();
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(raw);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const size = level === 1 ? 22 : level === 2 ? 18 : level === 3 ? 15 : 13.5;
      nodes.push(
        <div
          key={`h-${nodes.length}`}
          style={{
            fontSize: size,
            fontWeight: 800,
            color: "var(--text-primary)",
            marginTop: nodes.length ? 18 : 0,
            marginBottom: 8,
            letterSpacing: "-0.01em",
          }}
        >
          {inline(heading[2], highlights)}
        </div>,
      );
      continue;
    }

    const checklistItem = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (checklistItem) {
      const checked = checklistItem[1].toLowerCase() === "x";
      list.push(
        <li
          key={`cli-${nodes.length}-${list.length}`}
          style={{
            margin: "4px 0",
            listStyle: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginLeft: -16,
          }}
        >
          <input type="checkbox" checked={checked} readOnly style={{ accentColor: "var(--accent-primary)" }} />
          <span style={{ textDecoration: checked ? "line-through" : "none", color: checked ? "var(--text-tertiary)" : "inherit" }}>
            {inline(checklistItem[2], highlights)}
          </span>
        </li>,
      );
      continue;
    }

    const item = line.match(/^[-*]\s+(.+)$/);
    if (item) {
      list.push(
        <li key={`li-${nodes.length}-${list.length}`} style={{ margin: "4px 0" }}>
          {inline(item[1], highlights)}
        </li>,
      );
      continue;
    }

    const numItem = line.match(/^(\d+)\.\s+(.+)$/);
    if (numItem) {
      list.push(
        <li key={`nli-${nodes.length}-${list.length}`} style={{ margin: "4px 0" }}>
          {inline(numItem[2], highlights)}
        </li>,
      );
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushList();
      nodes.push(
        <blockquote key={`q-${nodes.length}`} style={quoteStyle}>
          {inline(quote[1], highlights)}
        </blockquote>,
      );
      continue;
    }

    flushList();
    nodes.push(
      <p key={`p-${nodes.length}`} style={{ margin: "8px 0", lineHeight: 1.65 }}>
        {inline(line, highlights)}
      </p>,
    );
  }

  flushList();
  if (code) {
    const codeText = code.join("\n");
    if (codeText.includes("<svg") && codeText.includes("</svg>")) {
      nodes.push(<SvgDiagramViewer key={`code-svg-${nodes.length}`} svg={codeText} />);
    } else {
      nodes.push(
        <pre key={`pre-${nodes.length}`} style={preStyle}>
          {codeText}
        </pre>,
      );
    }
  }
  if (rawSvgLines) {
    nodes.push(<SvgDiagramViewer key={`raw-svg-${nodes.length}`} svg={rawSvgLines.join("\n")} />);
  }

  if (!nodes.length) {
    return <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>{empty}</div>;
  }
  return <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: "22px" }}>{nodes}</div>;
}

const inlineCodeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.92em",
  padding: "2px 6px",
  borderRadius: "var(--radius-1)",
  background: "var(--surface-3, rgba(255,255,255,0.06))",
  color: "var(--accent-gold-bright, #facc15)",
};

const preStyle: React.CSSProperties = {
  margin: "12px 0",
  padding: 14,
  borderRadius: "var(--radius-2)",
  background: "var(--surface-deepest, #080c14)",
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
  color: "var(--text-secondary)",
  overflowX: "auto",
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const quoteStyle: React.CSSProperties = {
  margin: "10px 0",
  padding: "8px 12px",
  borderLeft: "3px solid var(--accent-primary, #6366f1)",
  background: "var(--surface-2, rgba(255,255,255,0.03))",
  borderRadius: "var(--radius-1)",
  color: "var(--text-secondary)",
};
