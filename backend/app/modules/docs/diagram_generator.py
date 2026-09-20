"""Diagram generator for Project Management Platform docs and MCP tools.

Follows the opinionated diagram-design specification:
- 4px grid, hairline borders, clean typography (Geist/Inter & Serif accents).
- Semantic focal nodes, high contrast WCAG AA accessible SVG output.
- Generates Architecture, Sequence, Flowchart, State, ER, Timeline, and Quadrant charts.
"""

from __future__ import annotations

import html
from typing import Any, Dict, List, Optional


def render_diagram_svg(
    diagram_type: str,
    title: str,
    spec: Dict[str, Any],
) -> str:
    """Render a clean, accessible SVG diagram matching the diagram-design system."""
    d_type = diagram_type.lower().replace("-", "_")

    if d_type in ("architecture", "deployment", "layers"):
        return _render_architecture_diagram(title, spec)
    elif d_type in ("sequence", "timeline"):
        return _render_sequence_diagram(title, spec)
    elif d_type in ("quadrant", "radar"):
        return _render_quadrant_diagram(title, spec)
    elif d_type in ("er", "db_schema", "database"):
        return _render_er_diagram(title, spec)
    else:
        # Default to Flowchart / State Machine
        return _render_flowchart_diagram(title, spec)


def _render_architecture_diagram(title: str, spec: Dict[str, Any]) -> str:
    """Render 3-tier / microservices architecture diagram."""
    nodes = spec.get("nodes", [
        {"id": "client", "label": "Web & Mobile App", "sub": "Next.js 15 · HTTPS", "type": "client"},
        {"id": "api", "label": "API Gateway & Core", "sub": "FastAPI · Python 3.12", "type": "focal"},
        {"id": "db", "label": "PostgreSQL & Redis", "sub": "AsyncPG · Pub/Sub", "type": "storage"},
    ])

    width = max(800, len(nodes) * 220 + 80)
    height = 360

    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}" style="background:#0f172a; border-radius:12px; font-family:var(--font-sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif);">'
        f'<style>'
        f'.title {{ font-size:18px; font-weight:700; fill:#f8fafc; font-family:Instrument Serif, Georgia, serif; }}'
        f'.node-box {{ rx:8px; stroke-width:1.5px; }}'
        f'.node-focal {{ fill:#1e293b; stroke:#3b82f6; }}'
        f'.node-client {{ fill:#1e293b; stroke:#10b981; }}'
        f'.node-storage {{ fill:#1e293b; stroke:#8b5cf6; }}'
        f'.node-title {{ font-size:13px; font-weight:600; fill:#f1f5f9; }}'
        f'.node-sub {{ font-size:11px; fill:#94a3b8; font-family:monospace; }}'
        f'.edge {{ stroke:#475569; stroke-width:2px; stroke-dasharray:4; }}'
        f'</style>'
        f'<text x="32" y="44" class="title">{html.escape(title)}</text>'
    ]

    # Render connector line across all nodes
    start_x = 80
    box_w = 180
    box_h = 90
    y_pos = 140

    for i in range(len(nodes) - 1):
        x1 = start_x + i * 220 + box_w
        x2 = start_x + (i + 1) * 220
        svg_parts.append(
            f'<line x1="{x1}" y1="{y_pos + box_h // 2}" x2="{x2}" y2="{y_pos + box_h // 2}" class="edge"/>'
            f'<polygon points="{x2},{y_pos + box_h // 2} {x2-6},{y_pos + box_h // 2 - 4} {x2-6},{y_pos + box_h // 2 + 4}" fill="#64748b"/>'
        )

    for i, node in enumerate(nodes):
        x = start_x + i * 220
        ntype = node.get("type", "focal")
        label = html.escape(str(node.get("label", "Service")))
        sub = html.escape(str(node.get("sub", "")))

        svg_parts.append(
            f'<g transform="translate({x}, {y_pos})">'
            f'<rect width="{box_w}" height="{box_h}" class="node-box node-{ntype}"/>'
            f'<text x="16" y="38" class="node-title">{label}</text>'
            f'<text x="16" y="62" class="node-sub">{sub}</text>'
            f'</g>'
        )

    svg_parts.append('</svg>')
    return "".join(svg_parts)


def _render_flowchart_diagram(title: str, spec: Dict[str, Any]) -> str:
    """Render step-by-step process flowchart."""
    steps = spec.get("steps", [
        {"title": "Step 1", "desc": "Trigger / Event"},
        {"title": "Step 2", "desc": "Validation & Logic"},
        {"title": "Step 3", "desc": "Execution & Persist"},
    ])

    width = 720
    height = len(steps) * 100 + 80

    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}" style="background:#0f172a; border-radius:12px; font-family:sans-serif;">'
        f'<style>'
        f'.title {{ font-size:18px; font-weight:700; fill:#f8fafc; }}'
        f'.step-box {{ fill:#1e293b; stroke:#38bdf8; stroke-width:1.5px; rx:8px; }}'
        f'.step-title {{ font-size:14px; font-weight:700; fill:#f8fafc; }}'
        f'.step-desc {{ font-size:12px; fill:#94a3b8; }}'
        f'</style>'
        f'<text x="32" y="44" class="title">{html.escape(title)}</text>'
    ]

    for i, step in enumerate(steps):
        y = 80 + i * 100
        if i < len(steps) - 1:
            svg_parts.append(
                f'<line x1="160" y1="{y + 60}" x2="160" y2="{y + 100}" stroke="#475569" stroke-width="2"/>'
                f'<polygon points="160,{y + 100} 156,{y + 92} 164,{y + 92}" fill="#64748b"/>'
            )

        st_title = html.escape(str(step.get("title", f"Step {i+1}")))
        st_desc = html.escape(str(step.get("desc", "")))

        svg_parts.append(
            f'<g transform="translate(60, {y})">'
            f'<rect width="400" height="60" class="step-box"/>'
            f'<text x="20" y="26" class="step-title">{st_title}</text>'
            f'<text x="20" y="46" class="step-desc">{st_desc}</text>'
            f'</g>'
        )

    svg_parts.append('</svg>')
    return "".join(svg_parts)


def _render_sequence_diagram(title: str, spec: Dict[str, Any]) -> str:
    """Render sequence interaction diagram."""
    participants = spec.get("participants", ["Client", "API Gateway", "Database"])
    messages = spec.get("messages", [
        {"from": 0, "to": 1, "label": "POST /request"},
        {"from": 1, "to": 2, "label": "SQL Query"},
        {"from": 2, "to": 1, "label": "Results"},
        {"from": 1, "to": 0, "label": "200 OK"},
    ])

    width = max(680, len(participants) * 200)
    height = max(340, len(messages) * 50 + 140)

    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}" style="background:#0f172a; border-radius:12px; font-family:sans-serif;">'
        f'<style>'
        f'.title {{ font-size:18px; font-weight:700; fill:#f8fafc; }}'
        f'.part-box {{ fill:#1e293b; stroke:#64748b; stroke-width:1.5px; rx:6px; }}'
        f'.part-text {{ font-size:13px; font-weight:600; fill:#f1f5f9; text-anchor:middle; }}'
        f'.lifeline {{ stroke:#334155; stroke-dasharray:4; stroke-width:1.5px; }}'
        f'.msg-line {{ stroke:#38bdf8; stroke-width:1.5px; }}'
        f'.msg-text {{ font-size:11px; fill:#cbd5e1; text-anchor:middle; font-family:monospace; }}'
        f'</style>'
        f'<text x="32" y="44" class="title">{html.escape(title)}</text>'
    ]

    p_xs = [80 + i * 200 for i in range(len(participants))]

    for i, p in enumerate(participants):
        x = p_xs[i]
        svg_parts.append(
            f'<rect x="{x - 60}" y="70" width="120" height="36" class="part-box"/>'
            f'<text x="{x}" y="93" class="part-text">{html.escape(p)}</text>'
            f'<line x1="{x}" y1="106" x2="{x}" y2="{height - 30}" class="lifeline"/>'
        )

    for j, msg in enumerate(messages):
        y = 140 + j * 45
        from_idx = min(len(p_xs) - 1, int(msg.get("from", 0)))
        to_idx = min(len(p_xs) - 1, int(msg.get("to", 1)))
        x1 = p_xs[from_idx]
        x2 = p_xs[to_idx]
        lbl = html.escape(str(msg.get("label", "")))

        svg_parts.append(
            f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" class="msg-line"/>'
            f'<polygon points="{x2},{y} {x2 - (6 if x2 > x1 else -6)},{y - 4} {x2 - (6 if x2 > x1 else -6)},{y + 4}" fill="#38bdf8"/>'
            f'<text x="{(x1 + x2) / 2}" y="{y - 6}" class="msg-text">{lbl}</text>'
        )

    svg_parts.append('</svg>')
    return "".join(svg_parts)


def _render_quadrant_diagram(title: str, spec: Dict[str, Any]) -> str:
    """Render 2x2 quadrant (e.g. Impact vs Effort)."""
    items = spec.get("items", [
        {"name": "Quick Wins", "x": 0.25, "y": 0.8, "color": "#10b981"},
        {"name": "Major Projects", "x": 0.75, "y": 0.85, "color": "#3b82f6"},
        {"name": "Fill-ins", "x": 0.25, "y": 0.3, "color": "#94a3b8"},
        {"name": "Thankless Tasks", "x": 0.8, "y": 0.2, "color": "#ef4444"},
    ])

    width = 640
    height = 540

    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}" style="background:#0f172a; border-radius:12px; font-family:sans-serif;">'
        f'<style>'
        f'.title {{ font-size:18px; font-weight:700; fill:#f8fafc; }}'
        f'.axis {{ stroke:#475569; stroke-width:1.5px; }}'
        f'.axis-lbl {{ font-size:12px; font-weight:600; fill:#94a3b8; }}'
        f'.quad-lbl {{ font-size:12px; fill:#64748b; font-weight:600; }}'
        f'</style>'
        f'<text x="32" y="44" class="title">{html.escape(title)}</text>'
        f'<line x1="80" y1="460" x2="580" y2="460" class="axis"/>'
        f'<line x1="80" y1="460" x2="80" y2="80" class="axis"/>'
        f'<line x1="330" y1="80" x2="330" y2="460" stroke="#334155" stroke-dasharray="3"/>'
        f'<line x1="80" y1="270" x2="580" y2="270" stroke="#334155" stroke-dasharray="3"/>'
        f'<text x="540" y="480" class="axis-lbl">Effort →</text>'
        f'<text x="30" y="95" class="axis-lbl">↑ Impact</text>'
    ]

    for item in items:
        name = html.escape(str(item.get("name", "")))
        ix = 80 + float(item.get("x", 0.5)) * 500
        iy = 460 - float(item.get("y", 0.5)) * 380
        color = item.get("color", "#38bdf8")

        svg_parts.append(
            f'<circle cx="{ix}" cy="{iy}" r="6" fill="{color}"/>'
            f'<text x="{ix + 10}" y="{iy + 4}" fill="#f8fafc" font-size="12" font-weight="600">{name}</text>'
        )

    svg_parts.append('</svg>')
    return "".join(svg_parts)


def _render_er_diagram(title: str, spec: Dict[str, Any]) -> str:
    """Render ER / Data model diagram."""
    entities = spec.get("entities", [
        {"name": "User", "fields": ["id: UUID (PK)", "email: String", "full_name: String"]},
        {"name": "Task", "fields": ["id: UUID (PK)", "project_id: UUID (FK)", "title: String", "status: String"]},
        {"name": "Project", "fields": ["id: UUID (PK)", "name: String", "owner_id: UUID (FK)"]},
    ])

    width = max(700, len(entities) * 230 + 40)
    height = 360

    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}" style="background:#0f172a; border-radius:12px; font-family:sans-serif;">'
        f'<style>'
        f'.title {{ font-size:18px; font-weight:700; fill:#f8fafc; }}'
        f'.ent-box {{ fill:#1e293b; stroke:#475569; stroke-width:1.5px; rx:6px; }}'
        f'.ent-header {{ fill:#334155; rx:6px; }}'
        f'.ent-name {{ font-size:13px; font-weight:700; fill:#38bdf8; text-anchor:middle; }}'
        f'.field-text {{ font-size:11px; fill:#cbd5e1; font-family:monospace; }}'
        f'</style>'
        f'<text x="32" y="44" class="title">{html.escape(title)}</text>'
    ]

    for i, ent in enumerate(entities):
        x = 50 + i * 230
        y = 90
        ename = html.escape(str(ent.get("name", "Entity")))
        fields = ent.get("fields", [])
        eh = 40 + len(fields) * 22

        svg_parts.append(
            f'<g transform="translate({x}, {y})">'
            f'<rect width="200" height="{eh}" class="ent-box"/>'
            f'<rect width="200" height="30" class="ent-header"/>'
            f'<text x="100" y="20" class="ent-name">{ename}</text>'
        )

        for j, fld in enumerate(fields):
            fy = 48 + j * 22
            svg_parts.append(
                f'<text x="14" y="{fy}" class="field-text">{html.escape(fld)}</text>'
            )

        svg_parts.append('</g>')

    svg_parts.append('</svg>')
    return "".join(svg_parts)
