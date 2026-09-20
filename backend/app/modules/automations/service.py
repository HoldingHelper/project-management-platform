"""Workflow Automations service layer for reactive triggers and rule execution."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
from uuid import UUID

import structlog
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.events import event_bus
from app.modules.automations.models import AutomationExecutionLog, AutomationRule
from app.modules.collaboration.models import Comment
from app.modules.docs import diagram_generator
from app.modules.docs.models import DocPage, DocSpace
from app.modules.integrations.whatsapp import service as whatsapp_service
from app.modules.projects.models import Project, TaskItem as Task
from app.shared.base_model import utcnow
from app.shared.events import (
    BlockerRaised,
    CommentAdded,
    NotificationRequested,
    TaskStatusChanged,
)

logger = structlog.get_logger(__name__)


async def list_rules(
    db: AsyncSession, user_id: Optional[UUID] = None
) -> List[AutomationRule]:
    """Retrieve all automation rules."""
    query = select(AutomationRule).order_by(AutomationRule.created_at.desc())
    res = await db.execute(query)
    return list(res.scalars().all())


async def create_rule(
    db: AsyncSession,
    *,
    name: str,
    description: Optional[str],
    trigger_type: str,
    condition_json: Dict[str, Any],
    action_type: str,
    action_config: Dict[str, Any],
    created_by_user_id: UUID,
) -> AutomationRule:
    """Create a new automation rule."""
    rule = AutomationRule(
        name=name,
        description=description,
        trigger_type=trigger_type,
        condition_json=condition_json,
        action_type=action_type,
        action_config=action_config,
        created_by_user_id=created_by_user_id,
        is_active=True,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def update_rule(
    db: AsyncSession,
    rule_id: UUID,
    *,
    name: Optional[str] = None,
    is_active: Optional[bool] = None,
    condition_json: Optional[Dict[str, Any]] = None,
    action_config: Optional[Dict[str, Any]] = None,
) -> Optional[AutomationRule]:
    """Update existing automation rule."""
    res = await db.execute(
        select(AutomationRule).where(AutomationRule.id == rule_id)
    )
    rule = res.scalar_one_or_none()
    if not rule:
        return None

    if name is not None:
        rule.name = name
    if is_active is not None:
        rule.is_active = is_active
    if condition_json is not None:
        rule.condition_json = condition_json
    if action_config is not None:
        rule.action_config = action_config

    await db.commit()
    await db.refresh(rule)
    return rule


async def delete_rule(db: AsyncSession, rule_id: UUID) -> bool:
    """Delete automation rule."""
    res = await db.execute(
        delete(AutomationRule).where(AutomationRule.id == rule_id)
    )
    await db.commit()
    return res.rowcount > 0


async def list_execution_logs(
    db: AsyncSession, limit: int = 50
) -> List[AutomationExecutionLog]:
    """List recent execution logs."""
    res = await db.execute(
        select(AutomationExecutionLog)
        .order_by(AutomationExecutionLog.executed_at.desc())
        .limit(limit)
    )
    return list(res.scalars().all())


async def execute_matching_rules(
    db: AsyncSession,
    trigger_type: str,
    event_payload: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Find active rules matching trigger_type and execute their actions."""
    res = await db.execute(
        select(AutomationRule).where(
            AutomationRule.trigger_type == trigger_type,
            AutomationRule.is_active.is_(True),
        )
    )
    rules = res.scalars().all()
    results = []

    for rule in rules:
        try:
            # Check conditions (if any specified)
            matches = True
            for k, v in rule.condition_json.items():
                if event_payload.get(k) != v:
                    matches = False
                    break

            if not matches:
                continue

            # Execute action
            summary = await _execute_action(db, rule.action_type, rule.action_config, event_payload)

            log = AutomationExecutionLog(
                rule_id=rule.id,
                rule_name=rule.name,
                trigger_event=trigger_type,
                payload_json=event_payload,
                status="success",
                result_summary=summary,
            )
            db.add(log)
            results.append({"rule_id": str(rule.id), "status": "success", "summary": summary})

        except Exception as exc:
            logger.error("automation_rule_failed", rule_id=str(rule.id), error=str(exc))
            log = AutomationExecutionLog(
                rule_id=rule.id,
                rule_name=rule.name,
                trigger_event=trigger_type,
                payload_json=event_payload,
                status="failed",
                result_summary=f"Error: {str(exc)}",
            )
            db.add(log)
            results.append({"rule_id": str(rule.id), "status": "failed", "error": str(exc)})

    await db.commit()
    return results


async def _execute_action(
    db: AsyncSession,
    action_type: str,
    action_config: Dict[str, Any],
    event_payload: Dict[str, Any],
) -> str:
    """Execute a single configured automation action."""
    if action_type == "send_whatsapp":
        phone = action_config.get("phone_number")
        user_id_str = action_config.get("user_id") or event_payload.get("user_id")
        msg = action_config.get("message") or f"Automated alert: {event_payload.get('title', 'Event triggered')}"

        if phone:
            await whatsapp_service.send_whatsapp_text_message(phone, msg)
            return f"Sent WhatsApp message to {phone}"
        elif user_id_str:
            uid = UUID(str(user_id_str))
            await whatsapp_service.notify_user_via_whatsapp(
                db, uid, "mention", "Automation Alert", msg
            )
            return f"Dispatched WhatsApp alert to user {uid}"

    elif action_type == "mark_task_done":
        task_id_str = event_payload.get("task_id") or action_config.get("task_id")
        if task_id_str:
            tid = UUID(str(task_id_str))
            await db.execute(
                update(Task).where(Task.id == tid).values(status="done")
            )
            return f"Marked task {tid} as done"

    elif action_type == "create_task":
        project_id = UUID(str(action_config.get("project_id") or event_payload.get("project_id")))
        title = action_config.get("title") or f"Automated Task for {event_payload.get('event_type', 'trigger')}"
        author_id = UUID(str(event_payload.get("user_id") or "00000000-0000-0000-0000-000000000000"))

        new_t = Task(
            project_id=project_id,
            title=title,
            description=action_config.get("description", "Created by automation rule."),
            status=action_config.get("status", "backlog"),
            priority=action_config.get("priority", "medium"),
            created_by_user_id=author_id,
        )
        db.add(new_t)
        await db.flush()
        return f"Created task {new_t.id} ({title})"

    elif action_type == "generate_chart_doc":
        space_id_str = action_config.get("space_id")
        title = action_config.get("title", "Generated Diagram")
        dtype = action_config.get("diagram_type", "architecture")
        spec = action_config.get("spec", {})

        svg_content = diagram_generator.render_diagram_svg(dtype, title, spec)
        if space_id_str:
            sid = UUID(str(space_id_str))
            page = DocPage(
                space_id=sid,
                title=title,
                slug=f"diagram-{int(utcnow().timestamp())}",
                content=f"# {title}\n\n```xml\n{svg_content}\n```",
                created_by=UUID("00000000-0000-0000-0000-000000000000"),
                updated_by=UUID("00000000-0000-0000-0000-000000000000"),
            )
            db.add(page)
            await db.flush()
            return f"Generated diagram page {page.id}"

    return "Action executed"


def register_automation_event_listeners() -> None:
    """Subscribe to global domain events to trigger automated rules."""
    async def on_task_status_changed(ev: TaskStatusChanged) -> None:
        async with AsyncSessionLocal() as db:
            await execute_matching_rules(
                db,
                "task.status_changed",
                {
                    "task_id": str(ev.task_id),
                    "old_status": ev.old_status,
                    "new_status": ev.new_status,
                    "project_id": str(ev.project_id) if ev.project_id else None,
                },
            )

    async def on_blocker_raised(ev: BlockerRaised) -> None:
        async with AsyncSessionLocal() as db:
            await execute_matching_rules(
                db,
                "blocker.raised",
                {
                    "blocker_id": str(ev.blocker_id),
                    "task_id": str(ev.task_id),
                    "pending_on_user_id": str(ev.pending_on_user_id),
                    "severity": ev.severity,
                },
            )

    async def on_notification_requested(ev: NotificationRequested) -> None:
        # Check if WhatsApp notification should be sent
        async with AsyncSessionLocal() as db:
            await whatsapp_service.notify_user_via_whatsapp(
                db,
                user_id=ev.user_id,
                message_type=ev.type,
                title=ev.title,
                body=ev.body,
                link=ev.link,
            )

    event_bus.subscribe(TaskStatusChanged, on_task_status_changed)
    event_bus.subscribe(BlockerRaised, on_blocker_raised)
    event_bus.subscribe(NotificationRequested, on_notification_requested)
