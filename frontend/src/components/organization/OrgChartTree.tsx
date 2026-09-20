"use client";

import { useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Filter,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar, Button, PresenceDot, PRESENCE_LABELS, TextInput } from "@/components/ds";
import { UserDetailsModal } from "./UserDetailsModal";
import type { OrgTreeNode, OrgTreeResponse, PresenceStatus, UUID, UserRead } from "@/lib/types";

interface Props {
  data: OrgTreeResponse;
  onInvite?: () => void;
  onEditUser?: (user: UserRead) => void;
  canManage?: boolean;
}

export function OrgChartTree({
  data,
  onInvite,
  onEditUser,
  canManage = false,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [collapsedNodes, setCollapsedNodes] = useState<Set<UUID>>(new Set());
  const [selectedUser, setSelectedUser] = useState<UserRead | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Departments list extracted from data
  const departments = useMemo(() => {
    const set = new Set<string>();
    function collect(node: OrgTreeNode) {
      if (node.department_name) set.add(node.department_name);
      node.direct_reports.forEach(collect);
    }
    data.roots.forEach(collect);
    data.unassigned.forEach(collect);
    return Array.from(set).sort();
  }, [data]);

  // Toggle collapse
  function toggleCollapse(nodeId: UUID, e: React.MouseEvent) {
    e.stopPropagation();
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function expandAll() {
    setCollapsedNodes(new Set());
  }

  function collapseAll() {
    const allIds = new Set<UUID>();
    function collect(node: OrgTreeNode) {
      if (node.direct_reports.length > 0) allIds.add(node.id);
      node.direct_reports.forEach(collect);
    }
    data.roots.forEach(collect);
    setCollapsedNodes(allIds);
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  // Mouse pan handlers
  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return; // only left click
    // ignore if clicking an interactive element
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input")) {
      return;
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  // Zoom handlers
  function zoomIn() {
    setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))));
  }

  function zoomOut() {
    setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))));
  }

  // Filter root trees matching search or department
  const filteredRoots = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dept = selectedDept;

    function matchesFilter(node: OrgTreeNode): boolean {
      const matchSearch =
        !q ||
        node.full_name.toLowerCase().includes(q) ||
        node.email.toLowerCase().includes(q) ||
        (node.job_title && node.job_title.toLowerCase().includes(q)) ||
        (node.team_name && node.team_name.toLowerCase().includes(q)) ||
        (node.department_name && node.department_name.toLowerCase().includes(q));

      const matchDept = dept === "all" || node.department_name === dept;

      if (matchSearch && matchDept) return true;
      return node.direct_reports.some(matchesFilter);
    }

    return data.roots.filter(matchesFilter);
  }, [data.roots, search, selectedDept]);

  function handleCardClick(node: OrgTreeNode) {
    // Convert OrgTreeNode to UserRead
    const userRead: UserRead = {
      id: node.id,
      email: node.email,
      first_name: node.first_name,
      last_name: node.last_name,
      full_name: node.full_name,
      job_title: node.job_title ?? null,
      avatar_url: node.avatar_url ?? null,
      bio: node.bio ?? null,
      presence_status: node.presence_status as PresenceStatus,
      status_text: node.status_text ?? null,
      status_emoji: node.status_emoji ?? null,
      department_id: node.department_id ?? null,
      department_name: node.department_name ?? null,
      team_id: node.team_id ?? null,
      team_name: node.team_name ?? null,
      manager_id: node.manager_user_id ?? null,
      manager_name: node.manager_name ?? null,
      is_active: true,
      mfa_enabled: false,
      roles: node.role_names,
      permissions: [],
      created_at: new Date().toISOString(),
    };
    setSelectedUser(userRead);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "75vh",
        background: "var(--surface-1)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Control Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 18px",
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border-subtle)",
          flexWrap: "wrap",
          zIndex: 10,
        }}
      >
        {/* Left: Search & Department Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: 220 }}>
            <Search
              size={15}
              style={{ position: "absolute", left: 10, top: 10, color: "var(--text-tertiary)" }}
            />
            <TextInput
              placeholder="Search coworkers or teams…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32, height: 34, fontSize: 12.5 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto" }}>
            <button
              type="button"
              onClick={() => setSelectedDept("all")}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: "var(--radius-full)",
                border: "1px solid",
                borderColor: selectedDept === "all" ? "var(--primary)" : "var(--border-subtle)",
                background: selectedDept === "all" ? "color-mix(in srgb, var(--primary) 15%, var(--surface-3))" : "var(--surface-3)",
                color: selectedDept === "all" ? "var(--primary)" : "var(--text-secondary)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              All Departments ({data.total_departments})
            </button>
            {departments.map((dept) => (
              <button
                key={dept}
                type="button"
                onClick={() => setSelectedDept(dept)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: "var(--radius-full)",
                  border: "1px solid",
                  borderColor: selectedDept === dept ? "var(--primary)" : "var(--border-subtle)",
                  background: selectedDept === dept ? "color-mix(in srgb, var(--primary) 15%, var(--surface-3))" : "var(--surface-3)",
                  color: selectedDept === dept ? "var(--primary)" : "var(--text-secondary)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Zoom & Expand Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={expandAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              background: "var(--surface-3)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-secondary)",
              fontSize: 12,
              cursor: "pointer",
            }}
            title="Expand all branches"
          >
            <Maximize2 size={13} /> Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              background: "var(--surface-3)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-secondary)",
              fontSize: 12,
              cursor: "pointer",
            }}
            title="Collapse all branches"
          >
            <Minimize2 size={13} /> Collapse All
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--surface-3)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={zoomOut}
              style={{
                padding: "6px 9px",
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              title="Zoom out"
            >
              <Minus size={13} />
            </button>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                padding: "0 6px",
                color: "var(--text-primary)",
                userSelect: "none",
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={zoomIn}
              style={{
                padding: "6px 9px",
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              title="Zoom in"
            >
              <Plus size={13} />
            </button>
            <button
              type="button"
              onClick={resetView}
              style={{
                padding: "6px 8px",
                background: "transparent",
                border: "none",
                borderLeft: "1px solid var(--border-subtle)",
                color: "var(--text-tertiary)",
                cursor: "pointer",
              }}
              title="Reset view"
            >
              <RotateCcw size={12} />
            </button>
          </div>

          {canManage && onInvite && (
            <Button size="sm" onClick={onInvite}>
              <UserPlus size={13} style={{ marginRight: 5 }} /> Invite
            </Button>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          flex: 1,
          overflow: "hidden",
          cursor: isDragging ? "grabbing" : "grab",
          position: "relative",
          userSelect: "none",
          backgroundImage:
            "radial-gradient(circle, color-mix(in srgb, var(--border-subtle) 40%, transparent) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {filteredRoots.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-tertiary)",
              gap: 8,
            }}
          >
            <Users size={36} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>No teammates found</div>
            <div style={{ fontSize: 12.5 }}>Try adjusting your search query or department filter.</div>
          </div>
        ) : (
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "top center",
              transition: isDragging ? "none" : "transform 0.15s ease-out",
              padding: "48px 60px 100px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 40,
              minWidth: "max-content",
            }}
          >
            {/* Roots level */}
            <div style={{ display: "flex", gap: 48, justifyContent: "center" }}>
              {filteredRoots.map((root) => (
                <TreeNode
                  key={root.id}
                  node={root}
                  search={search}
                  collapsedNodes={collapsedNodes}
                  onToggleCollapse={toggleCollapse}
                  onCardClick={handleCardClick}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Unassigned Teammates Bar (if any) */}
      {data.unassigned.length > 0 && (
        <div
          style={{
            padding: "10px 16px",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            overflowX: "auto",
            zIndex: 10,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={14} /> Unassigned Teammates ({data.unassigned.length}):
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {data.unassigned.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => handleCardClick(node)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <Avatar name={node.full_name} size={18} />
                <span>{node.full_name}</span>
                {node.role_names[0] && (
                  <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>
                    ({node.role_names[0]})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* User Details Modal */}
      <UserDetailsModal
        user={selectedUser}
        open={Boolean(selectedUser)}
        onClose={() => setSelectedUser(null)}
        onEdit={onEditUser}
        canEdit={canManage}
      />
    </div>
  );
}

function TreeNode({
  node,
  search,
  collapsedNodes,
  onToggleCollapse,
  onCardClick,
}: {
  node: OrgTreeNode;
  search: string;
  collapsedNodes: Set<UUID>;
  onToggleCollapse: (id: UUID, e: React.MouseEvent) => void;
  onCardClick: (node: OrgTreeNode) => void;
}) {
  const isCollapsed = collapsedNodes.has(node.id);
  const hasChildren = node.direct_reports.length > 0;
  const status = (node.presence_status ?? "offline") as PresenceStatus;

  const isMatched =
    Boolean(search.trim()) &&
    (node.full_name.toLowerCase().includes(search.toLowerCase()) ||
      node.email.toLowerCase().includes(search.toLowerCase()) ||
      (node.job_title && node.job_title.toLowerCase().includes(search.toLowerCase())) ||
      (node.team_name && node.team_name.toLowerCase().includes(search.toLowerCase())));

  const isExec =
    node.role_names.includes("SuperAdmin") ||
    node.role_names.includes("CLevel") ||
    node.role_names.includes("CompanyManager");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
      {/* Node Card */}
      <div
        onClick={() => onCardClick(node)}
        style={{
          width: 230,
          background: isMatched
            ? "color-mix(in srgb, var(--primary) 12%, var(--surface-2))"
            : isExec
            ? "color-mix(in srgb, var(--primary) 6%, var(--surface-2))"
            : "var(--surface-2)",
          border: `1.5px solid ${
            isMatched
              ? "var(--primary)"
              : isExec
              ? "color-mix(in srgb, var(--primary) 40%, var(--border-default))"
              : "var(--border-default)"
          }`,
          borderRadius: "var(--radius-lg)",
          padding: "12px 14px",
          boxShadow: isMatched
            ? "0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent), 0 8px 24px rgba(0,0,0,0.35)"
            : "0 4px 16px rgba(0,0,0,0.25)",
          cursor: "pointer",
          transition: "all 0.15s ease",
          position: "relative",
          zIndex: 2,
        }}
        className="pmp-row"
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
            <Avatar name={node.full_name} size={38} />
            <PresenceDot status={status} overlay size={10} />
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13.5,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {node.full_name}
              </div>
              {node.status_emoji && (
                <span style={{ fontSize: 12, lineHeight: 1 }}>{node.status_emoji}</span>
              )}
            </div>

            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-secondary)",
                fontWeight: 500,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {node.job_title || (isExec ? "Executive" : "Team Member")}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
              {node.department_name && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--surface-3)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {node.department_name}
                </span>
              )}
              {node.team_name && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: "var(--radius-full)",
                    background: "color-mix(in srgb, var(--primary) 12%, var(--surface-3))",
                    color: "var(--primary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {node.team_name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Reports Expand/Collapse Button */}
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => onToggleCollapse(node.id, e)}
            style={{
              position: "absolute",
              bottom: -12,
              left: "50%",
              transform: "translateX(-50%)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: "var(--radius-full)",
              background: isCollapsed ? "var(--primary)" : "var(--surface-3)",
              border: "1px solid var(--border-default)",
              color: isCollapsed ? "#ffffff" : "var(--text-secondary)",
              fontSize: 10.5,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
              zIndex: 3,
            }}
          >
            {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
            <span>{node.direct_reports.length}</span>
          </button>
        )}
      </div>

      {/* Children Tree Branch */}
      {hasChildren && !isCollapsed && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
          {/* Vertical line from parent card */}
          <div
            style={{
              width: 2,
              height: 24,
              background: "var(--border-strong)",
            }}
          />

          {/* Children container with connecting lines */}
          <div
            style={{
              display: "flex",
              gap: 28,
              position: "relative",
              paddingTop: 12,
            }}
          >
            {/* Horizontal line across children */}
            {node.direct_reports.length > 1 && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 115,
                  right: 115,
                  height: 2,
                  background: "var(--border-strong)",
                }}
              />
            )}

            {node.direct_reports.map((child) => (
              <div
                key={child.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  position: "relative",
                }}
              >
                {/* Vertical line connecting from horizontal bar to child */}
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    width: 2,
                    height: 12,
                    background: "var(--border-strong)",
                  }}
                />
                <TreeNode
                  node={child}
                  search={search}
                  collapsedNodes={collapsedNodes}
                  onToggleCollapse={onToggleCollapse}
                  onCardClick={onCardClick}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
