"""Holding operating system foundation and compatibility backfill.

Revision ID: h2b4d6f8a0c1
Revises: g1a2b3c4d5e6
Create Date: 2026-09-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "h2b4d6f8a0c1"
down_revision: Union[str, None] = "g1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _execute_statements(sql: str) -> None:
    """Execute backfill statements individually for asyncpg compatibility."""
    uncommented_sql = "\n".join(
        line for line in sql.splitlines() if not line.lstrip().startswith("--")
    )
    for statement in uncommented_sql.split(";"):
        if statement.strip():
            op.execute(statement)


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.execute("CREATE EXTENSION IF NOT EXISTS ltree")
    op.execute("CREATE SCHEMA IF NOT EXISTS org")
    op.execute("CREATE SCHEMA IF NOT EXISTS strategy")

    op.create_table(
        "nodes",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("parent_id", uuid, sa.ForeignKey("org.nodes.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("confidentiality", sa.String(16), nullable=False, server_default="standard"),
        sa.Column("created_by", uuid, nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("acl_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source_type", sa.String(40), nullable=True),
        sa.Column("source_id", uuid, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("type IN ('holding','function','venture','venture_function','program','project','shared_initiative','milestone','workstream','sprint','task','team','doc_space')", name="ck_org_nodes_type"),
        sa.CheckConstraint("status IN ('active','archived')", name="ck_org_nodes_status"),
        sa.CheckConstraint("confidentiality IN ('standard','restricted','board')", name="ck_org_nodes_confidentiality"),
        sa.UniqueConstraint("parent_id", "slug", name="uq_org_nodes_parent_slug"),
        sa.UniqueConstraint("source_type", "source_id", name="uq_org_nodes_source"),
        schema="org",
    )
    op.execute("ALTER TABLE org.nodes ALTER COLUMN path TYPE ltree USING path::ltree")
    op.create_index("ix_org_nodes_path_gist", "nodes", ["path"], schema="org", postgresql_using="gist")
    op.create_index("ix_org_nodes_parent_id", "nodes", ["parent_id"], schema="org")
    op.create_index("ix_org_nodes_type", "nodes", ["type"], schema="org")

    op.create_table(
        "memberships",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("person_id", uuid, nullable=False),
        sa.Column("node_id", uuid, sa.ForeignKey("org.nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(40), nullable=False),
        sa.Column("since", sa.Date(), nullable=False),
        sa.Column("until", sa.Date(), nullable=True),
        sa.Column("granted_by", uuid, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("person_id", "node_id", "role", name="uq_org_membership_role"),
        schema="org",
    )
    op.create_index("ix_org_memberships_person_id", "memberships", ["person_id"], schema="org")
    op.create_index("ix_org_memberships_node_id", "memberships", ["node_id"], schema="org")

    op.create_table(
        "allocations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("person_id", uuid, nullable=False),
        sa.Column("node_id", uuid, sa.ForeignKey("org.nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("percent > 0 AND percent <= 100", name="ck_org_allocations_percent"),
        sa.CheckConstraint("end_date IS NULL OR end_date >= start_date", name="ck_org_allocations_dates"),
        schema="org",
    )
    op.create_index("ix_org_allocations_person_id", "allocations", ["person_id"], schema="org")
    op.create_index("ix_org_allocations_node_id", "allocations", ["node_id"], schema="org")

    op.create_table(
        "venture_walls",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("person_id", uuid, nullable=False),
        sa.Column("venture_a_id", uuid, nullable=False),
        sa.Column("venture_b_id", uuid, nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("venture_a_id <> venture_b_id", name="ck_org_venture_wall_distinct"),
        sa.UniqueConstraint("person_id", "venture_a_id", "venture_b_id", name="uq_org_venture_wall"),
        schema="org",
    )

    # Strategy spine.
    op.create_table("visions",
        sa.Column("id", uuid, primary_key=True), sa.Column("node_id", uuid, nullable=False),
        sa.Column("statement", sa.Text(), nullable=False), sa.Column("horizon", sa.String(40)),
        sa.Column("narrative_page_id", uuid), sa.Column("updated_by", uuid, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("node_id", name="uq_strategy_vision_node"), schema="strategy")
    op.create_table("objectives",
        sa.Column("id", uuid, primary_key=True), sa.Column("node_id", uuid, nullable=False),
        sa.Column("parent_objective_id", uuid, sa.ForeignKey("strategy.objectives.id", ondelete="SET NULL")),
        sa.Column("title", sa.String(240), nullable=False), sa.Column("period", sa.String(40), nullable=False),
        sa.Column("owner_user_id", uuid, nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="draft"),
        sa.Column("confidence", sa.Numeric(5, 2), nullable=False, server_default="0.5"),
        sa.Column("weight", sa.Numeric(5, 2), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), schema="strategy")
    op.create_index("ix_strategy_objectives_node_id", "objectives", ["node_id"], schema="strategy")
    op.create_index("ix_strategy_objectives_period", "objectives", ["period"], schema="strategy")
    op.create_table("key_results",
        sa.Column("id", uuid, primary_key=True), sa.Column("objective_id", uuid, sa.ForeignKey("strategy.objectives.id", ondelete="CASCADE"), nullable=False),
        sa.Column("metric", sa.String(240), nullable=False), sa.Column("baseline", sa.Numeric(16, 4), nullable=False),
        sa.Column("target", sa.Numeric(16, 4), nullable=False), sa.Column("current", sa.Numeric(16, 4), nullable=False),
        sa.Column("unit", sa.String(40), nullable=False), sa.Column("update_cadence", sa.String(24), nullable=False, server_default="weekly"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), schema="strategy")
    op.create_table("checkins",
        sa.Column("id", uuid, primary_key=True), sa.Column("key_result_id", uuid, sa.ForeignKey("strategy.key_results.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value", sa.Numeric(16, 4), nullable=False), sa.Column("confidence", sa.Numeric(5, 2), nullable=False),
        sa.Column("note", sa.Text()), sa.Column("created_by", uuid, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), schema="strategy")
    op.create_table("initiative_links",
        sa.Column("id", uuid, primary_key=True), sa.Column("objective_id", uuid, sa.ForeignKey("strategy.objectives.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_type", sa.String(24), nullable=False), sa.Column("target_id", uuid, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("objective_id", "target_type", "target_id", name="uq_strategy_initiative_link"), schema="strategy")
    op.create_table("decisions",
        sa.Column("id", uuid, primary_key=True), sa.Column("node_id", uuid, nullable=False), sa.Column("title", sa.String(240), nullable=False),
        sa.Column("context", sa.Text(), nullable=False), sa.Column("options", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("decision", sa.Text(), nullable=False), sa.Column("consequences", sa.Text()),
        sa.Column("decider_user_ids", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("decided_at", sa.Date(), nullable=False), sa.Column("page_id", uuid),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), schema="strategy")
    op.create_table("risks",
        sa.Column("id", uuid, primary_key=True), sa.Column("node_id", uuid, nullable=False), sa.Column("description", sa.Text(), nullable=False),
        sa.Column("likelihood", sa.Integer(), nullable=False), sa.Column("impact", sa.Integer(), nullable=False),
        sa.Column("owner_user_id", uuid, nullable=False), sa.Column("mitigation", sa.Text()),
        sa.Column("status", sa.String(24), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), schema="strategy")

    # Compatibility columns keep old APIs live during phased cut-over.
    op.add_column("users", sa.Column("home_function_id", uuid, nullable=True), schema="identity")
    op.add_column("users", sa.Column("manager_id", uuid, nullable=True), schema="identity")
    op.add_column("users", sa.Column("employment_type", sa.String(24), nullable=False, server_default="employee"), schema="identity")
    op.add_column("products", sa.Column("org_node_id", uuid, nullable=True), schema="projects")
    op.add_column("projects", sa.Column("org_node_id", uuid, nullable=True), schema="projects")
    for name in ("workstream_id", "milestone_id", "function_id", "venture_id"):
        op.add_column("tasks", sa.Column(name, uuid, nullable=True), schema="projects")
    op.add_column("tasks", sa.Column("confidentiality", sa.String(16), nullable=False, server_default="standard"), schema="projects")
    for name, type_ in (("definition_of_done", sa.Text()), ("owner_user_id", uuid), ("baseline_date", sa.Date()), ("forecast_date", sa.Date()), ("actual_date", sa.Date()), ("org_node_id", uuid)):
        op.add_column("milestones", sa.Column(name, type_, nullable=True), schema="projects")
    op.add_column("milestones", sa.Column("rag_status", sa.String(16), nullable=False, server_default="on-track"), schema="projects")
    op.add_column("task_dependencies", sa.Column("visibility", sa.String(12), nullable=False, server_default="ghost"), schema="projects")
    op.add_column("spaces", sa.Column("node_id", uuid, nullable=True), schema="docs")
    op.add_column("spaces", sa.Column("default_edit_role", sa.String(40), nullable=True), schema="docs")
    op.add_column("pages", sa.Column("confidentiality", sa.String(16), nullable=False, server_default="inherit"), schema="docs")
    op.add_column("pages", sa.Column("publish_level", sa.String(16), nullable=False, server_default="private"), schema="docs")
    op.add_column("pages", sa.Column("is_template", sa.Boolean(), nullable=False, server_default=sa.false()), schema="docs")

    op.create_table("workstreams",
        sa.Column("id", uuid, primary_key=True), sa.Column("project_id", uuid, sa.ForeignKey("projects.projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("function_id", uuid, nullable=False), sa.Column("org_node_id", uuid, nullable=False), sa.Column("name", sa.String(160), nullable=False),
        sa.Column("lead_user_id", uuid), sa.Column("status", sa.String(24), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "function_id", name="uq_project_function_workstream"),
        sa.UniqueConstraint("org_node_id", name="uq_projects_workstreams_org_node_id"), schema="projects")
    op.create_table("requests",
        sa.Column("id", uuid, primary_key=True), sa.Column("from_node_id", uuid, nullable=False), sa.Column("to_node_id", uuid, nullable=False),
        sa.Column("title", sa.String(240), nullable=False), sa.Column("need", sa.Text(), nullable=False), sa.Column("due_date", sa.Date()),
        sa.Column("priority", sa.String(10), nullable=False, server_default="P2"), sa.Column("status", sa.String(24), nullable=False, server_default="requested"),
        sa.Column("created_by_user_id", uuid, nullable=False), sa.Column("created_task_id", uuid),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), schema="projects")
    op.create_table("shares",
        sa.Column("id", uuid, primary_key=True), sa.Column("object_type", sa.String(16), nullable=False), sa.Column("object_id", uuid, nullable=False),
        sa.Column("target_type", sa.String(16), nullable=False), sa.Column("target_id", uuid, nullable=False), sa.Column("permission", sa.String(16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True)), sa.Column("granted_by", uuid, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("object_type", "object_id", "target_type", "target_id", name="uq_doc_share_target"), schema="docs")

    # Deterministic, idempotent backfill from the legacy flat model.
    _execute_statements("""
    INSERT INTO org.nodes (id,type,parent_id,path,name,slug,status,confidentiality,created_by,metadata_json,acl_version,source_type,source_id)
    SELECT '00000000-0000-0000-0000-000000000001'::uuid,'holding',NULL,'holding'::ltree,'Holding','holding','active','standard',u.id,'{}'::jsonb,1,NULL,NULL
    FROM identity.users u ORDER BY u.created_at LIMIT 1 ON CONFLICT DO NOTHING;

    INSERT INTO org.nodes (id,type,parent_id,path,name,slug,status,confidentiality,created_by,metadata_json,acl_version,source_type,source_id)
    SELECT gen_random_uuid(),'venture','00000000-0000-0000-0000-000000000001'::uuid,('holding.v_'||replace(p.id::text,'-',''))::ltree,p.name,
           left(regexp_replace(lower(p.name),'[^a-z0-9]+','_','g'),65)||'_'||left(p.id::text,6),
           CASE WHEN p.status='Sunset' THEN 'archived' ELSE 'active' END,'standard',p.owner_user_id,
           jsonb_build_object('legacy_product_id',p.id,'priority',p.priority,'environment',p.environment),1,'product',p.id
    FROM projects.products p WHERE EXISTS (SELECT 1 FROM org.nodes WHERE type='holding') ON CONFLICT DO NOTHING;

    INSERT INTO org.nodes (id,type,parent_id,path,name,slug,status,confidentiality,created_by,metadata_json,acl_version,source_type,source_id)
    SELECT gen_random_uuid(),'function','00000000-0000-0000-0000-000000000001'::uuid,('holding.f_'||replace(d.id::text,'-',''))::ltree,d.name,
           left(regexp_replace(lower(d.name),'[^a-z0-9]+','_','g'),65)||'_'||left(d.id::text,6),'active','standard',
           coalesce(d.head_of_department_user_id,(SELECT id FROM identity.users ORDER BY created_at LIMIT 1)),'{}'::jsonb,1,'department',d.id
    FROM organization.departments d WHERE EXISTS (SELECT 1 FROM org.nodes WHERE type='holding') ON CONFLICT DO NOTHING;

    INSERT INTO org.nodes (id,type,parent_id,path,name,slug,status,confidentiality,created_by,metadata_json,acl_version,source_type,source_id)
    SELECT gen_random_uuid(),'project',v.id,(v.path::text||'.p_'||replace(p.id::text,'-',''))::ltree,p.name,
           left(regexp_replace(lower(p.name),'[^a-z0-9]+','_','g'),65)||'_'||left(p.id::text,6),
           CASE WHEN p.status='archived' THEN 'archived' ELSE 'active' END,'standard',pr.owner_user_id,
           jsonb_build_object('health_status',p.health_status,'rag',p.health_status,'progress',p.progress_percentage),1,'project',p.id
    FROM projects.projects p JOIN projects.products pr ON pr.id=p.product_id JOIN org.nodes v ON v.source_type='product' AND v.source_id=pr.id ON CONFLICT DO NOTHING;

    INSERT INTO org.nodes (id,type,parent_id,path,name,slug,status,confidentiality,created_by,metadata_json,acl_version,source_type,source_id)
    SELECT gen_random_uuid(),'team',f.id,(f.path::text||'.t_'||replace(t.id::text,'-',''))::ltree,t.name,
           left(regexp_replace(lower(t.name),'[^a-z0-9]+','_','g'),65)||'_'||left(t.id::text,6),'active','standard',
           coalesce(t.lead_user_id,(SELECT id FROM identity.users ORDER BY created_at LIMIT 1)),'{}'::jsonb,1,'team',t.id
    FROM organization.teams t JOIN org.nodes f ON f.source_type='department' AND f.source_id=t.department_id ON CONFLICT DO NOTHING;

    INSERT INTO org.nodes (id,type,parent_id,path,name,slug,status,confidentiality,created_by,metadata_json,acl_version,source_type,source_id)
    SELECT gen_random_uuid(),'milestone',pn.id,(pn.path::text||'.m_'||replace(m.id::text,'-',''))::ltree,m.name,
           left(regexp_replace(lower(m.name),'[^a-z0-9]+','_','g'),65)||'_'||left(m.id::text,6),'active','standard',m.created_by_user_id,
           jsonb_build_object('due_date',m.due_date,'completed_at',m.completed_at),1,'milestone',m.id
    FROM projects.milestones m JOIN org.nodes pn ON pn.source_type='project' AND pn.source_id=m.project_id ON CONFLICT DO NOTHING;

    UPDATE projects.products p SET org_node_id=n.id FROM org.nodes n WHERE n.source_type='product' AND n.source_id=p.id;
    UPDATE projects.projects p SET org_node_id=n.id FROM org.nodes n WHERE n.source_type='project' AND n.source_id=p.id;
    UPDATE projects.milestones m SET org_node_id=n.id FROM org.nodes n WHERE n.source_type='milestone' AND n.source_id=m.id;

    INSERT INTO org.memberships (id,person_id,node_id,role,since,granted_by)
    SELECT gen_random_uuid(),p.owner_user_id,n.id,'venture_lead',CURRENT_DATE,p.owner_user_id
    FROM projects.products p JOIN org.nodes n ON n.source_type='product' AND n.source_id=p.id ON CONFLICT DO NOTHING;
    INSERT INTO org.memberships (id,person_id,node_id,role,since,granted_by)
    SELECT gen_random_uuid(),pm.user_id,n.id,
      CASE pm.role WHEN 'ProjectManager' THEN 'project_manager' WHEN 'TeamLead' THEN 'workstream_lead' WHEN 'Client' THEN 'viewer' WHEN 'Observer' THEN 'viewer' ELSE 'contributor' END,
      CURRENT_DATE,coalesce(p.owner_user_id,pm.user_id)
    FROM projects.project_members pm JOIN projects.projects pr ON pr.id=pm.project_id JOIN projects.products p ON p.id=pr.product_id
    JOIN org.nodes n ON n.source_type='project' AND n.source_id=pm.project_id ON CONFLICT DO NOTHING;
    INSERT INTO org.memberships (id,person_id,node_id,role,since,granted_by)
    SELECT gen_random_uuid(),ur.user_id,'00000000-0000-0000-0000-000000000001'::uuid,'holding_owner',CURRENT_DATE,ur.user_id
    FROM identity.user_roles ur JOIN identity.roles r ON r.id=ur.role_id WHERE r.name='SuperAdmin'
      AND EXISTS (SELECT 1 FROM org.nodes WHERE id='00000000-0000-0000-0000-000000000001'::uuid) ON CONFLICT DO NOTHING;

    INSERT INTO org.memberships (id,person_id,node_id,role,since,granted_by)
    SELECT gen_random_uuid(),d.head_of_department_user_id,n.id,'function_lead',CURRENT_DATE,d.head_of_department_user_id
    FROM organization.departments d JOIN org.nodes n ON n.source_type='department' AND n.source_id=d.id
    WHERE d.head_of_department_user_id IS NOT NULL ON CONFLICT DO NOTHING;
    INSERT INTO org.memberships (id,person_id,node_id,role,since,granted_by)
    SELECT gen_random_uuid(),t.lead_user_id,n.id,'team_lead',CURRENT_DATE,t.lead_user_id
    FROM organization.teams t JOIN org.nodes n ON n.source_type='team' AND n.source_id=t.id
    WHERE t.lead_user_id IS NOT NULL ON CONFLICT DO NOTHING;

    -- Convert legacy task partitions into functional workstreams when a
    -- matching function exists. Unmatched partitions remain visible in the
    -- dry-run report produced by scripts/backfill_holding_graph.py.
    WITH candidates AS (
      SELECT DISTINCT p.id project_id, pn.id project_node_id, pn.path project_path,
        f.id function_id, t.partition,
        md5('workstream:'||p.id::text||':'||f.id::text)::uuid workstream_id,
        coalesce(tp.name, initcap(t.partition)) workstream_name,
        p.name project_name, pr.owner_user_id
      FROM projects.tasks t
      JOIN projects.phases ph ON ph.id=t.phase_id
      JOIN projects.projects p ON p.id=ph.project_id
      JOIN projects.products pr ON pr.id=p.product_id
      JOIN org.nodes pn ON pn.source_type='project' AND pn.source_id=p.id
      JOIN org.nodes f ON f.type='function' AND (
        lower(f.name)=lower(t.partition) OR f.slug LIKE regexp_replace(lower(t.partition),'[^a-z0-9]+','_','g')||'%'
      )
      LEFT JOIN projects.task_partitions tp ON tp.slug=t.partition
      WHERE t.partition IS NOT NULL
    )
    INSERT INTO org.nodes (id,type,parent_id,path,name,slug,status,confidentiality,created_by,metadata_json,acl_version,source_type,source_id)
    SELECT workstream_id,'workstream',project_node_id,(project_path::text||'.w_'||replace(workstream_id::text,'-',''))::ltree,
      workstream_name,left(regexp_replace(lower(workstream_name),'[^a-z0-9]+','_','g'),60)||'_'||left(workstream_id::text,6),
      'active','standard',owner_user_id,jsonb_build_object('function_id',function_id),1,'workstream',workstream_id
    FROM candidates ON CONFLICT DO NOTHING;

    INSERT INTO projects.workstreams (id,project_id,function_id,org_node_id,name,status)
    SELECT n.id,(n.metadata_json->>'project_id')::uuid,(n.metadata_json->>'function_id')::uuid,n.id,n.name,'active'
    FROM org.nodes n WHERE false;
    -- The metadata-free INSERT above is intentionally a no-op; use the source
    -- joins to retain normalized IDs without relying on JSON casts.
    INSERT INTO projects.workstreams (id,project_id,function_id,org_node_id,name,status)
    SELECT n.id,p.id,f.id,n.id,n.name,'active'
    FROM org.nodes n
    JOIN org.nodes pn ON pn.id=n.parent_id AND pn.source_type='project'
    JOIN projects.projects p ON p.id=pn.source_id
    JOIN org.nodes f ON f.type='function' AND (n.metadata_json->>'function_id')::uuid=f.id
    WHERE n.source_type='workstream' ON CONFLICT DO NOTHING;

    UPDATE projects.tasks t SET
      venture_id=v.id,
      function_id=w.function_id,
      workstream_id=w.id
    FROM projects.phases ph, projects.projects p, org.nodes pn, org.nodes v, projects.workstreams w, org.nodes wn, org.nodes fn
    WHERE ph.id=t.phase_id AND p.id=ph.project_id
      AND pn.source_type='project' AND pn.source_id=p.id
      AND v.type='venture' AND pn.path <@ v.path
      AND wn.id=w.org_node_id AND wn.parent_id=pn.id AND fn.id=w.function_id
      AND (lower(fn.name)=lower(t.partition) OR fn.slug LIKE regexp_replace(lower(t.partition),'[^a-z0-9]+','_','g')||'%');

    -- Bind every legacy space to a first-class doc-space node. Category/name
    -- matching places function playbooks correctly; all others inherit from
    -- the holding root.
    INSERT INTO org.nodes (id,type,parent_id,path,name,slug,status,confidentiality,created_by,metadata_json,acl_version,source_type,source_id)
    SELECT gen_random_uuid(),'doc_space',coalesce(f.id,'00000000-0000-0000-0000-000000000001'::uuid),
      (coalesce(f.path::text,'holding')||'.d_'||replace(s.id::text,'-',''))::ltree,s.name,
      left(regexp_replace(lower(s.name),'[^a-z0-9]+','_','g'),65)||'_'||left(s.id::text,6),'active','standard',s.created_by,'{}'::jsonb,1,'doc_space',s.id
    FROM docs.spaces s LEFT JOIN org.nodes f ON f.type='function' AND (lower(f.name)=lower(s.category) OR lower(f.name)=lower(s.name))
    WHERE EXISTS (SELECT 1 FROM org.nodes WHERE type='holding') ON CONFLICT DO NOTHING;
    UPDATE docs.spaces s SET node_id=n.id FROM org.nodes n WHERE n.source_type='doc_space' AND n.source_id=s.id;
    """)

    op.create_index("ix_projects_tasks_venture_status", "tasks", ["venture_id", "status"], schema="projects")
    op.create_index("ix_projects_tasks_function_status", "tasks", ["function_id", "status"], schema="projects")


def downgrade() -> None:
    op.drop_table("shares", schema="docs")
    op.drop_table("requests", schema="projects")
    op.drop_table("workstreams", schema="projects")
    for name in ("is_template", "publish_level", "confidentiality"):
        op.drop_column("pages", name, schema="docs")
    for name in ("default_edit_role", "node_id"):
        op.drop_column("spaces", name, schema="docs")
    op.drop_column("task_dependencies", "visibility", schema="projects")
    for name in ("rag_status", "org_node_id", "actual_date", "forecast_date", "baseline_date", "owner_user_id", "definition_of_done"):
        op.drop_column("milestones", name, schema="projects")
    for name in ("confidentiality", "venture_id", "function_id", "milestone_id", "workstream_id"):
        op.drop_column("tasks", name, schema="projects")
    op.drop_column("projects", "org_node_id", schema="projects")
    op.drop_column("products", "org_node_id", schema="projects")
    for name in ("employment_type", "manager_id", "home_function_id"):
        op.drop_column("users", name, schema="identity")
    for table in ("risks", "decisions", "initiative_links", "checkins", "key_results", "objectives", "visions"):
        op.drop_table(table, schema="strategy")
    for table in ("venture_walls", "allocations", "memberships", "nodes"):
        op.drop_table(table, schema="org")
    op.execute("DROP SCHEMA IF EXISTS strategy")
    op.execute("DROP SCHEMA IF EXISTS org")
