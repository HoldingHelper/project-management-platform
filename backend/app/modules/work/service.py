from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.exceptions import BusinessRuleError, NotFoundError
from app.modules.authz.service import authorize
from app.modules.org.models import OrgNode
from app.modules.org.service import get_node
from app.modules.projects.enums import TaskStatus, TaskType
from app.modules.projects.models import TaskItem, WorkRequest
from app.modules.work.schemas import RequestCreate


async def create_request(db: AsyncSession, payload: RequestCreate, actor: CurrentUser) -> WorkRequest:
    source = await get_node(db, payload.from_node_id)
    target = await get_node(db, payload.to_node_id)
    await authorize(db, actor, "create", source, object_type="request")
    if target.type not in {"function", "team"}:
        raise BusinessRuleError("Requests must target a function or team.")
    request = WorkRequest(**payload.model_dump(), status="requested", created_by_user_id=actor.user_id)
    db.add(request)
    await db.commit()
    await db.refresh(request)
    return request


async def list_requests(db: AsyncSession, node_id: UUID, actor: CurrentUser) -> list[WorkRequest]:
    node = await get_node(db, node_id)
    await authorize(db, actor, "view", node, object_type="request")
    return list((await db.execute(select(WorkRequest).where(or_(WorkRequest.from_node_id == node_id, WorkRequest.to_node_id == node_id)).order_by(WorkRequest.created_at.desc()))).scalars().all())


async def accept_request(db: AsyncSession, request_id: UUID, actor: CurrentUser) -> WorkRequest:
    request = (await db.execute(select(WorkRequest).where(WorkRequest.id == request_id))).scalar_one_or_none()
    if not request:
        raise NotFoundError("Request", request_id)
    if request.status != "requested":
        raise BusinessRuleError("Only requested work can be accepted.")
    target = await get_node(db, request.to_node_id)
    await authorize(db, actor, "accept", target, object_type="request")
    source = await get_node(db, request.from_node_id)
    venture = (await db.execute(select(OrgNode).where(OrgNode.type == "venture"))).scalars().all()
    source_venture = next((node for node in venture if source.path == node.path or source.path.startswith(f"{node.path}.")), None)
    task = TaskItem(
        title=request.title, description=request.need, task_type=TaskType.FEATURE.value,
        priority=request.priority, status=TaskStatus.READY.value, due_date=request.due_date,
        function_id=target.id if target.type == "function" else None,
        venture_id=source_venture.id if source_venture else None,
        created_by="request", last_modified_by="request",
    )
    db.add(task)
    await db.flush()
    request.status = "accepted"
    request.created_task_id = task.id
    await db.commit()
    await db.refresh(request)
    return request
