"""Initialize the holding root after identity bootstrap on an empty database."""
from datetime import date
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import ROLE_SUPER_ADMIN
from app.modules.identity.models import Role, User, UserRole
from app.modules.org.models import Membership, OrgNode


async def bootstrap_holding(db: AsyncSession) -> None:
    # Serialize startup initializers; no membership is restored on an existing root.
    await db.execute(text("SELECT pg_advisory_xact_lock(870143201)"))
    existing = (await db.execute(select(OrgNode).where(OrgNode.type == "holding"))).scalars().first()
    if existing is not None:
        return
    admins = list((await db.execute(
        select(User).join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.name == ROLE_SUPER_ADMIN, User.is_active.is_(True))
        .order_by(User.created_at)
    )).scalars().all())
    if not admins:
        return
    root = OrgNode(
        id=UUID("00000000-0000-0000-0000-000000000001"),
        type="holding", parent_id=None, path="holding", name="Holding", slug="holding",
        status="active", confidentiality="standard", created_by=admins[0].id,
        metadata_json={}, acl_version=1,
    )
    db.add(root)
    await db.flush()
    for admin in admins:
        db.add(Membership(
            person_id=admin.id, node_id=root.id, role="holding_owner",
            since=date.today(), granted_by=admin.id,
        ))
    await db.flush()
