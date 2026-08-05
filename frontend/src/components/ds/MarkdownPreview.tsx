import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
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
        <a key={i} href={link[2]} target="_blank" rel="noreferrer" style={{ color: "var(--text-link)" }}>
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

export function MarkdownPreview({ value, empty = "No description yet." }: { value?: string | null; empty?: string }) {
  const lines = (value ?? "").trim().split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let list: ReactNode[] = [];
  let code: string[] | null = null;

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

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("```")) {
      if (code) {
        nodes.push(
          <pre key={`pre-${nodes.length}`} style={preStyle}>
            {code.join("\n")}
          </pre>,
        );
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
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const size = heading[1].length === 1 ? 18 : heading[1].length === 2 ? 15 : 13.5;
      nodes.push(
        <div key={`h-${nodes.length}`} style={{ fontSize: size, fontWeight: 800, marginTop: nodes.length ? 10 : 0 }}>
          {inline(heading[2])}
        </div>,
      );
      continue;
    }
    const item = line.match(/^[-*]\s+(.+)$/);
    if (item) {
      list.push(
        <li key={`li-${nodes.length}-${list.length}`} style={{ margin: "3px 0" }}>
          {inline(item[1])}
        </li>,
      );
      continue;
    }
    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushList();
      nodes.push(
        <blockquote key={`q-${nodes.length}`} style={quoteStyle}>
          {inline(quote[1])}
        </blockquote>,
      );
      continue;
    }
    flushList();
    nodes.push(
      <p key={`p-${nodes.length}`} style={{ margin: "7px 0" }}>
        {inline(line)}
      </p>,
    );
  }

  flushList();
  if (code) {
    nodes.push(
      <pre key={`pre-${nodes.length}`} style={preStyle}>
        {code.join("\n")}
      </pre>,
    );
  }

  if (!nodes.length) {
    return <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>{empty}</div>;
  }
  return <div style={{ color: "var(--text-secondary)", fontSize: 13.5, lineHeight: "21px" }}>{nodes}</div>;
}

const inlineCodeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.92em",
  padding: "1px 5px",
  borderRadius: "var(--radius-1)",
  background: "var(--surface-3)",
  color: "var(--accent-gold-bright)",
};

const preStyle: React.CSSProperties = {
  margin: "10px 0",
  padding: 12,
  borderRadius: "var(--radius-2)",
  background: "var(--surface-deepest)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-secondary)",
  overflowX: "auto",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};

const quoteStyle: React.CSSProperties = {
  margin: "8px 0",
  padding: "7px 10px",
  borderLeft: "3px solid var(--accent-secondary)",
  background: "var(--surface-2)",
  borderRadius: "var(--radius-1)",
};
