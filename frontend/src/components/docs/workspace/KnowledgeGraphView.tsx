"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  Network,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  Layers,
  Filter,
} from "lucide-react";
import {
  getLocalGraph,
  getGlobalGraph,
  type GraphNode,
  type GraphEdge,
  type GraphResponse,
} from "@/lib/api/docs";
import { useKnowledgeWorkspace } from "@/lib/stores/knowledgeWorkspaceStore";

export function KnowledgeGraphView({
  pageId,
  isGlobal = false,
}: {
  pageId?: string;
  isGlobal?: boolean;
}) {
  const { openTab } = useKnowledgeWorkspace();
  const [graphData, setGraphData] = useState<GraphResponse>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [depth, setDepth] = useState(1);
  const [filterQuery, setFilterQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let active = true;
    const fetchGraph = async () => {
      setLoading(true);
      try {
        const res = !isGlobal && pageId
          ? await getLocalGraph(pageId, depth)
          : await getGlobalGraph();
        if (active) {
          setGraphData(res);
        }
      } catch (err) {
        console.error("Failed to load knowledge graph", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchGraph();
    return () => {
      active = false;
    };
  }, [pageId, isGlobal, depth]);

  // Compute node layout positions using a simple spring/circular simulation
  const layout = useMemo(() => {
    const nodes = graphData.nodes;
    const edges = graphData.edges;
    if (nodes.length === 0) return { nodePositions: new Map(), edgesWithPos: [] };

    const width = 800;
    const height = 600;
    const centerX = width / 2;
    const centerY = height / 2;
    const nodePositions = new Map<string, { x: number; y: number }>();

    // Initial radial placement
    const radius = Math.min(width, height) * 0.35;
    nodes.forEach((node, idx) => {
      const angle = (idx / nodes.length) * 2 * Math.PI;
      // If local graph and this is the center node, place in center
      if (!isGlobal && pageId && node.id === pageId) {
        nodePositions.set(node.id, { x: centerX, y: centerY });
      } else {
        nodePositions.set(node.id, {
          x: centerX + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
          y: centerY + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
        });
      }
    });

    // Map edges with coordinates
    const edgesWithPos = edges
      .map((e) => {
        const src = nodePositions.get(e.source);
        const tgt = nodePositions.get(e.target);
        if (!src || !tgt) return null;
        return { ...e, x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y };
      })
      .filter(Boolean);

    return { nodePositions, edgesWithPos };
  }, [graphData, isGlobal, pageId]);

  const filteredNodes = useMemo(() => {
    if (!filterQuery.trim()) return graphData.nodes;
    const q = filterQuery.toLowerCase();
    return graphData.nodes.filter((n) => n.label.toLowerCase().includes(q));
  }, [graphData.nodes, filterQuery]);

  const getNodeColor = (node: GraphNode) => {
    if (node.is_stub) return "#f59e0b"; // amber for stub
    switch (node.doc_type) {
      case "adr":
        return "#a855f7"; // purple
      case "runbook":
        return "#10b981"; // emerald
      case "rfc":
        return "#f97316"; // orange
      default:
        return "#6366f1"; // indigo
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 select-none relative overflow-hidden">
      {/* Graph Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-slate-950/90 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-white text-xs">
            <Network size={15} className="text-indigo-400" />
            <span>{isGlobal ? "Global Knowledge Graph" : "Local Graph"}</span>
          </div>

          {!isGlobal && (
            <div className="flex items-center gap-1 bg-slate-900 border border-white/5 rounded px-2 py-0.5 text-xs text-slate-400">
              <span>Depth:</span>
              <button
                type="button"
                onClick={() => setDepth(1)}
                className={`px-1 rounded ${depth === 1 ? "bg-indigo-600 text-white" : "hover:text-white"}`}
              >
                1
              </button>
              <button
                type="button"
                onClick={() => setDepth(2)}
                className={`px-1 rounded ${depth === 2 ? "bg-indigo-600 text-white" : "hover:text-white"}`}
              >
                2
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900 border border-white/5 rounded text-xs">
            <Search size={12} className="text-slate-500" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter nodes..."
              className="bg-transparent outline-none text-white w-28 placeholder-slate-500"
            />
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-900 border border-white/5 rounded p-0.5 text-slate-400">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}
            className="p-1 hover:text-white rounded"
            title="Zoom In"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.4))}
            className="p-1 hover:text-white rounded"
            title="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="p-1 hover:text-white rounded"
            title="Reset View"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        className="flex-1 w-full h-full cursor-grab active:cursor-grabbing relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <svg
          ref={svgRef}
          data-testid="knowledge-graph-canvas"
          className="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          {/* Edges */}
          <g>
            {layout.edgesWithPos.map((e: any, i: number) => (
              <line
                key={e.id || i}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth={1.5}
              />
            ))}
          </g>

          {/* Nodes */}
          <g>
            {filteredNodes.map((node) => {
              const pos = layout.nodePositions.get(node.id) || { x: 400, y: 300 };
              const radius = Math.max(7, Math.min(18, 7 + (node.degree || 0) * 2));
              const color = getNodeColor(node);

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!node.is_stub) {
                      openTab({
                        id: node.id,
                        pageId: node.id,
                        title: node.label,
                        viewMode: "editor",
                      });
                    }
                  }}
                  className="cursor-pointer group"
                >
                  <circle
                    r={radius}
                    fill={color}
                    opacity={0.85}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    className="transition-transform group-hover:scale-125"
                  />
                  <text
                    y={radius + 12}
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize={11}
                    fontFamily="var(--font-mono, monospace)"
                    className="pointer-events-none group-hover:fill-white font-medium"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-white/5 rounded-lg p-2.5 text-[10px] space-y-1 z-10">
          <div className="font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Legend
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
            <span>Document</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
            <span>ADR (Architecture Decision)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span>Runbook</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span>Stub (Uncreated link)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
