"""Allow executives to create product lines without granting product management.

Revision ID: i3c5e7a9b1d2
Revises: h2b4d6f8a0c1
"""
from alembic import op

revision = "i3c5e7a9b1d2"
down_revision = "h2b4d6f8a0c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO identity.permissions (id, code, description)
        VALUES (gen_random_uuid(), 'products.create', 'Create product lines')
        ON CONFLICT (code) DO NOTHING
    """)
    op.execute("""
        INSERT INTO identity.role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM identity.roles r
        CROSS JOIN identity.permissions p
        WHERE r.name IN ('CLevel', 'SuperAdmin') AND p.code = 'products.create'
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM identity.role_permissions
        WHERE permission_id IN (SELECT id FROM identity.permissions WHERE code = 'products.create')
    """)
    op.execute("DELETE FROM identity.permissions WHERE code = 'products.create'")
