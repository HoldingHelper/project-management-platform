"""FastAPI router for Workflow Automations."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.automations import service

automations_router = APIRouter(prefix="/automations", tags=["Workflow Automations"])


class AutomationRuleCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    trigger_type: str = Field(..., min_length=2, max_length=64)
    condition_json: Dict[str, Any] = Field(default_factory=dict)
    action_type: str = Field(..., min_length=2, max_length=64)
    action_config: Dict[str, Any] = Field(default_factory=dict)


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    condition_json: Optional[Dict[str, Any]] = None
    action_config: Optional[Dict[str, Any]] = None


@automations_router.get("/rules")
async def list_automation_rules(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """List all workspace automation rules."""
    rules = await service.list_rules(db, current_user.user_id)
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "description": r.description,
            "trigger_type": r.trigger_type,
            "condition_json": r.condition_json,
            "action_type": r.action_type,
            "action_config": r.action_config,
            "is_active": r.is_active,
            "created_at": r.created_at.isoformat(),
        }
        for r in rules
    ]


@automations_router.post("/rules", status_code=status.HTTP_201_CREATED)
async def create_automation_rule(
    payload: AutomationRuleCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Create a new automation rule."""
    rule = await service.create_rule(
        db,
        name=payload.name,
        description=payload.description,
        trigger_type=payload.trigger_type,
        condition_json=payload.condition_json,
        action_type=payload.action_type,
        action_config=payload.action_config,
        created_by_user_id=current_user.user_id,
    )
    return {"id": str(rule.id), "status": "created"}


@automations_router.patch("/rules/{rule_id}")
async def update_automation_rule(
    rule_id: UUID,
    payload: AutomationRuleUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Update rule status or configuration."""
    rule = await service.update_rule(
        db,
        rule_id,
        name=payload.name,
        is_active=payload.is_active,
        condition_json=payload.condition_json,
        action_config=payload.action_config,
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found.")
    return {"id": str(rule.id), "status": "updated"}


@automations_router.delete(
    "/rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_automation_rule(
    rule_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Delete automation rule."""
    ok = await service.delete_rule(db, rule_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Rule not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@automations_router.get("/logs")
async def list_automation_logs(
    limit: int = 50,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Retrieve history of executed automations."""
    logs = await service.list_execution_logs(db, limit=limit)
    return [
        {
            "id": str(log.id),
            "rule_id": str(log.rule_id) if log.rule_id else None,
            "rule_name": log.rule_name,
            "trigger_event": log.trigger_event,
            "payload_json": log.payload_json,
            "status": log.status,
            "result_summary": log.result_summary,
            "executed_at": log.executed_at.isoformat(),
        }
        for log in logs
    ]


@automations_router.post("/rules/{rule_id}/test")
async def test_automation_rule(
    rule_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Manually test an automation rule with mock event payload."""
    rules = await service.list_rules(db)
    target = next((r for r in rules if r.id == rule_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Rule not found.")

    res = await service.execute_matching_rules(
        db, target.trigger_type, {"mock": True, "test_by": str(current_user.user_id)}
    )
    return {"results": res}
