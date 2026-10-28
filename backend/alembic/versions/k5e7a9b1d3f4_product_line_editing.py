"""Grant product-line editing to executives independently of broader management.

Revision ID: k5e7a9b1d3f4
Revises: j4d6f8a0c2e3
"""
from alembic import op

revision = "k5e7a9b1d3f4"
down_revision = "j4d6f8a0c2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO identity.permissions (id, code, description)
        VALUES (gen_random_uuid(), 'products.update', 'Edit product line details')
        ON CONFLICT (code) DO NOTHING
    """)
    op.execute("""
        INSERT INTO identity.role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM identity.roles r
        CROSS JOIN identity.permissions p
        WHERE r.name IN ('CLevel', 'SuperAdmin') AND p.code = 'products.update'
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM identity.role_permissions
        WHERE permission_id IN (SELECT id FROM identity.permissions WHERE code = 'products.update')
    """)
    op.execute("DELETE FROM identity.permissions WHERE code = 'products.update'")
