"""Seed internal documentation spaces and tutorial pages

Revision ID: f9a1c3e5d7b2
Revises: e8c1b4d9a2f7
Create Date: 2026-08-20
"""

from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from app.modules.docs.seed import DOC_SPACES_DATA
from app.modules.docs import diagram_generator

revision: str = "f9a1c3e5d7b2"
down_revision: Union[str, None] = "e8c1b4d9a2f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    author_id = uuid.UUID("00000000-0000-0000-0000-000000000000")

    # Generate SVGs
    arch_svg = diagram_generator.render_diagram_svg(
        "architecture",
        "Project Management Platform Architecture",
        {
            "nodes": [
                {"id": "web", "label": "Next.js Web App", "sub": "React 15 · TypeScript", "type": "client"},
                {"id": "api", "label": "FastAPI Core", "sub": "Python 3.12 · GraphQL", "type": "focal"},
                {"id": "mcp", "label": "MCP Server", "sub": "JSON-RPC 2.0 · AI Tools", "type": "focal"},
                {"id": "db", "label": "PostgreSQL & Redis", "sub": "AsyncPG · PubSub", "type": "storage"},
            ]
        },
    )

    flow_svg = diagram_generator.render_diagram_svg(
        "flowchart",
        "Project Lifecycle Workflow",
        {
            "steps": [
                {"title": "1. Scoping & AI Plan", "desc": "Define outcomes & generate tasks"},
                {"title": "2. Phase Scheduling", "desc": "Assign developers & set DAG dependencies"},
                {"title": "3. Real-Time Execution", "desc": "Kanban status updates, PR sync & chat"},
                {"title": "4. Automated Merge & Done", "desc": "Auto-close tasks and notify on WhatsApp"},
            ]
        },
    )

    for space in DOC_SPACES_DATA:
        space_slug = space["slug"]
        # Check if space exists
        res = conn.execute(
            sa.text("SELECT id FROM docs.spaces WHERE slug = :slug"),
            {"slug": space_slug},
        ).fetchone()

        if not res:
            space_id = uuid.uuid4()
            conn.execute(
                sa.text(
                    """
                    INSERT INTO docs.spaces (id, name, slug, description, icon, visibility, position, created_by, created_at, updated_at)
                    VALUES (:id, :name, :slug, :description, :icon, :visibility, :position, :created_by, NOW(), NOW())
                    """
                ),
                {
                    "id": space_id,
                    "name": space["name"],
                    "slug": space_slug,
                    "description": space.get("description"),
                    "icon": space.get("icon"),
                    "visibility": space.get("visibility", "workspace"),
                    "position": space.get("position", 0),
                    "created_by": author_id,
                },
            )
        else:
            space_id = res[0]

        # Insert / update pages
        for page in space.get("pages", []):
            page_slug = page["slug"]
            content = page["content"].replace("{ARCHITECTURE_DIAGRAM}", arch_svg).replace("{FLOWCHART_DIAGRAM}", flow_svg)

            p_res = conn.execute(
                sa.text("SELECT id FROM docs.pages WHERE space_id = :space_id AND slug = :slug"),
                {"space_id": space_id, "slug": page_slug},
            ).fetchone()

            if not p_res:
                page_id = uuid.uuid4()
                conn.execute(
                    sa.text(
                        """
                        INSERT INTO docs.pages (id, space_id, title, slug, excerpt, content, content_json, status, visibility, position, created_by, updated_by, created_at, updated_at)
                        VALUES (:id, :space_id, :title, :slug, :excerpt, :content, '{}'::jsonb, 'published', 'inherit', 0, :created_by, :updated_by, NOW(), NOW())
                        """
                    ),
                    {
                        "id": page_id,
                        "space_id": space_id,
                        "title": page["title"],
                        "slug": page_slug,
                        "excerpt": page.get("excerpt"),
                        "content": content,
                        "created_by": author_id,
                        "updated_by": author_id,
                    },
                )


def downgrade() -> None:
    pass
