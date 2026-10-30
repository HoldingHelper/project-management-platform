"""Separate document creation from global draft editing."""
from alembic import op

revision = "r2f4a6b8c0d1"
down_revision = "q1e3f5a7b9c0"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        INSERT INTO identity.permissions (id, code, description)
        VALUES (gen_random_uuid(), 'docs.create', 'Create documentation drafts')
        ON CONFLICT (code) DO NOTHING
    """)
    # Only internal roles that already retain Docs access receive the new grant.
    op.execute("""
        INSERT INTO identity.role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM identity.roles r
        CROSS JOIN identity.permissions p
        WHERE r.name IN ('SuperAdmin', 'CLevel', 'CompanyManager', 'ProjectManager',
                         'TeamLead', 'Developer', 'QA', 'UIUX', 'BusinessAnalyst')
          AND p.code = 'docs.create'
          AND EXISTS (SELECT 1 FROM identity.role_permissions rp
                      JOIN identity.permissions vp ON vp.id = rp.permission_id
                      WHERE rp.role_id = r.id AND vp.code = 'docs.view')
        ON CONFLICT DO NOTHING
    """)


def downgrade():
    op.execute("DELETE FROM identity.role_permissions WHERE permission_id IN (SELECT id FROM identity.permissions WHERE code = 'docs.create')")
    op.execute("DELETE FROM identity.permissions WHERE code = 'docs.create'")
