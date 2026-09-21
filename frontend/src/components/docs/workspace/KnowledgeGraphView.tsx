"use client";

import { useMemo, useRef, useState } from "react";
import {
  FileText,
  Shield,
  Key,
  User,
  Settings,
  BookOpen,
  Share2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  ChevronDown,
  MoreHorizontal,
  Sparkles,
  Network,
  Lock,
  Layers,
} from "lucide-react";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";

interface GraphNodeItem {
  id: string;
  title: string;
  subtitle: string;
  category: "current" | "security" | "profile" | "admin" | "integrations" | "guide";
  relation: string;
  x: number;
  y: number;
  icon: any;
  color: string;
  bg: string;
  border: string;
}

const NODES: GraphNodeItem[] = [
  {
    id: "current",
    title: "Signing In & Profile Management",
    subtitle: "Core Guide",
    category: "current",
    relation: "",
    x: 480,
    y: 300,
    icon: FileText,
    color: "#3B82F6",
    bg: "rgba(59, 130, 246, 0.08)",
    border: "#3B82F6",
  },
  {
    id: "auth-sec",
    title: "Authentication & Security",
    subtitle: "6 related docs",
    category: "security",
    relation: "Extends",
    x: 480,
    y: 110,
    icon: Shield,
    color: "#8B5CF6",
    bg: "rgba(139, 92, 246, 0.08)",
    border: "rgba(139, 92, 246, 0.35)",
  },
  {
    id: "sso-guide",
    title: "SSO Setup Guide",
    subtitle: "4 related docs",
    category: "security",
    relation: "Extends",
    x: 230,
    y: 170,
    icon: FileText,
    color: "#06B6D4",
    bg: "rgba(6, 182, 212, 0.08)",
    border: "rgba(6, 182, 212, 0.35)",
  },
  {
    id: "two-factor",
    title: "Two-Factor Authentication",
    subtitle: "3 related docs",
    category: "security",
    relation: "Enhances",
    x: 740,
    y: 170,
    icon: Lock,
    color: "#10B981",
    bg: "rgba(16, 185, 129, 0.08)",
    border: "rgba(16, 185, 129, 0.35)",
  },
  {
    id: "workspace-profile",
    title: "Workspace Profile",
    subtitle: "4 related docs",
    category: "profile",
    relation: "Manages",
    x: 210,
    y: 310,
    icon: User,
    color: "#F59E0B",
    bg: "rgba(245, 158, 11, 0.08)",
    border: "rgba(245, 158, 11, 0.35)",
  },
  {
    id: "password-policy",
    title: "Password Policy",
    subtitle: "5 related docs",
    category: "security",
    relation: "Related",
    x: 760,
    y: 310,
    icon: FileText,
    color: "#EC4899",
    bg: "rgba(236, 72, 153, 0.08)",
    border: "rgba(236, 72, 153, 0.35)",
  },
  {
    id: "admin-portal",
    title: "Admin Portal",
    subtitle: "6 related docs",
    category: "admin",
    relation: "Administers",
    x: 230,
    y: 450,
    icon: Settings,
    color: "#A855F7",
    bg: "rgba(168, 85, 247, 0.08)",
    border: "rgba(168, 85, 247, 0.35)",
  },
  {
    id: "getting-started",
    title: "Getting Started",
    subtitle: "8 related docs",
    category: "guide",
    relation: "Prerequisite",
    x: 480,
    y: 490,
    icon: BookOpen,
    color: "#3B82F6",
    bg: "rgba(59, 130, 246, 0.08)",
    border: "rgba(59, 130, 246, 0.35)",
  },
  {
    id: "integrations",
    title: "Integrations",
    subtitle: "4 related docs",
    category: "integrations",
    relation: "Connects",
    x: 740,
    y: 450,
    icon: Layers,
    color: "#14B8A6",
    bg: "rgba(20, 184, 166, 0.08)",
    border: "rgba(20, 184, 166, 0.35)",
  },
];

export function KnowledgeGraphView({ pageId, isGlobal = false }: { pageId?: string; isGlobal?: boolean }) {
  const { openTab } = useKnowledgeWorkspace();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string>("current");

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const centerNode = NODES.find((n) => n.id === "current")!;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--surface-deepest)",
        color: "var(--text-primary)",
        position: "relative",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Top Header: Document / Knowledge Graph / Suggestions Tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          height: 48,
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--surface-1)",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--surface-2)",
              padding: "2px",
              borderRadius: "var(--radius-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (pageId) {
                  openTab({ id: pageId, pageId, title: "Document", viewMode: "editor" });
                }
              }}
              className="docs-toolbar-btn"
              style={{ padding: "4px 12px", height: 26, fontSize: 12, borderRadius: "var(--radius-1)", gap: 5 }}
            >
              <FileText size={12} />
              <span>Document</span>
            </button>
            <button
              type="button"
              className="docs-toolbar-btn is-active"
              style={{ padding: "4px 12px", height: 26, fontSize: 12, borderRadius: "var(--radius-1)", gap: 5 }}
            >
              <Network size={12} />
              <span>Knowledge Graph</span>
            </button>
            <button
              type="button"
              className="docs-toolbar-btn"
              style={{ padding: "4px 12px", height: 26, fontSize: 12, borderRadius: "var(--radius-1)", gap: 5 }}
            >
              <Sparkles size={12} />
              <span>Suggestions</span>
            </button>
          </div>
        </div>

        {/* View mode dropdown & actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: "var(--radius-1)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              fontSize: 12,
              fontWeight: 650,
              cursor: "pointer",
            }}
          >
            <Network size={13} style={{ color: "var(--accent-primary)" }} />
            <span>Knowledge Graph</span>
            <ChevronDown size={13} style={{ color: "var(--text-tertiary)" }} />
          </div>

          <button
            type="button"
            className="pmp-icon-btn"
            style={{ width: 30, height: 30, borderRadius: "var(--radius-1)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Main Canvas Area (Dithered Grid Pattern) */}
      <div
        className="docs-dither-grid"
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div
          style={{
            position: "absolute",
            width: 1100,
            height: 700,
            left: "50%",
            top: "50%",
            marginLeft: -550,
            marginTop: -350,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 100ms ease",
          }}
        >
          {/* SVG Connection Lines */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            {NODES.filter((n) => n.id !== "current").map((node) => {
              const cx1 = centerNode.x;
              const cy1 = centerNode.y;
              const cx2 = node.x;
              const cy2 = node.y;
              const mx = (cx1 + cx2) / 2;
              const my = (cy1 + cy2) / 2;

              return (
                <g key={node.id}>
                  {/* Curved / Direct Edge */}
                  <line
                    x1={cx1}
                    y1={cy1}
                    x2={cx2}
                    y2={cy2}
                    stroke="rgba(37, 99, 255, 0.25)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                  />
                  {/* Small circle on edge */}
                  <circle cx={mx} cy={my} r={3} fill="var(--accent-primary)" />
                  {/* Relation Label Badge */}
                  {node.relation && (
                    <g transform={`translate(${mx}, ${my - 10})`}>
                      <rect
                        x={-30}
                        y={-8}
                        width={60}
                        height={16}
                        rx={8}
                        fill="var(--surface-1)"
                        stroke="var(--border-subtle)"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3}
                        textAnchor="middle"
                        fill="var(--text-tertiary)"
                        fontSize={9}
                        fontWeight={700}
                        fontFamily="var(--font-sans)"
                      >
                        {node.relation}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Node Cards */}
          {NODES.map((node) => {
            const isCenter = node.id === "current";
            const Icon = node.icon;

            return (
              <div
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode(node.id);
                }}
                className="docs-graph-card"
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y,
                  transform: "translate(-50%, -50%)",
                  minWidth: isCenter ? 240 : 180,
                  padding: isCenter ? "16px 20px" : "10px 14px",
                  borderRadius: isCenter ? "var(--radius-3)" : "var(--radius-2)",
                  background: isCenter ? "var(--surface-1)" : "var(--surface-1)",
                  border: `1.5px solid ${node.border}`,
                  boxShadow: isCenter
                    ? "0 0 24px rgba(37, 99, 255, 0.2), var(--shadow-lg)"
                    : "var(--shadow-sm)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  zIndex: isCenter ? 5 : 2,
                }}
              >
                <div
                  style={{
                    width: isCenter ? 36 : 28,
                    height: isCenter ? 36 : 28,
                    borderRadius: "var(--radius-1)",
                    background: node.bg,
                    color: node.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={isCenter ? 18 : 14} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: isCenter ? 13.5 : 12,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {node.title}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: isCenter ? "var(--accent-primary)" : "var(--text-tertiary)",
                      fontWeight: isCenter ? 650 : 500,
                      marginTop: 2,
                    }}
                  >
                    {node.subtitle}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Color Legend (Bottom Left) */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 20,
            padding: "12px 16px",
            borderRadius: "var(--radius-2)",
            background: "color-mix(in srgb, var(--surface-1) 90%, transparent)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-md)",
            display: "grid",
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3B82F6" }} />
            <span style={{ color: "var(--text-secondary)" }}>Current Document</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#06B6D4" }} />
            <span style={{ color: "var(--text-secondary)" }}>Related Topic</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#8B5CF6" }} />
            <span style={{ color: "var(--text-secondary)" }}>Security</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B" }} />
            <span style={{ color: "var(--text-secondary)" }}>Profile & Account</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#A855F7" }} />
            <span style={{ color: "var(--text-secondary)" }}>Administration</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
            <span style={{ color: "var(--text-secondary)" }}>Integrations</span>
          </div>
        </div>

        {/* Zoom & Pan Toolbar (Bottom Right) */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            borderRadius: "var(--radius-2)",
            background: "color-mix(in srgb, var(--surface-1) 90%, transparent)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-md)",
            zIndex: 10,
          }}
        >
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
            className="docs-toolbar-btn"
            title="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "0 6px", fontFamily: "var(--font-mono)" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
            className="docs-toolbar-btn"
            title="Zoom In"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="docs-toolbar-btn"
            title="Reset View"
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            className="docs-toolbar-btn"
            title="Fit to Screen"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
