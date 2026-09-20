"""Organization module REST endpoints."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.exceptions import ForbiddenError
from app.core.permissions import Permissions
from app.modules.organization import service
from app.modules.organization.schemas import (
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
    EmployeeCreate,
    EmployeeRead,
    EmployeeUpdate,
    SkillAssignment,
    SkillCreate,
    SkillRead,
    TeamCreate,
    TeamRead,
    TeamUpdate,
    OrgTreeNode,
    OrgTreeResponse,
)

departments_router = APIRouter(
    prefix="/departments", tags=["Organization - Departments"]
)
teams_router = APIRouter(prefix="/teams", tags=["Organization - Teams"])
employees_router = APIRouter(prefix="/employees", tags=["Organization - Employees"])
skills_router = APIRouter(prefix="/skills", tags=["Organization - Skills"])


@departments_router.post(
    "", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED
)
async def create_department(
    payload: DepartmentCreate,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.MANAGE_USERS, Permissions.MANAGE_SETTINGS)
    ),
    db: AsyncSession = Depends(get_db),
) -> DepartmentRead:
    return await service.create_department(db, payload)


@departments_router.patch("/{department_id}", response_model=DepartmentRead)
async def update_department(
    department_id: UUID,
    payload: DepartmentUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DepartmentRead:
    is_mgr = await service.is_department_manager(db, current_user.user_id, department_id)
    if not (current_user.is_super_admin() or current_user.has_permission(Permissions.MANAGE_USERS) or is_mgr):
        raise ForbiddenError("You do not have permission to modify this department.")
    return await service.update_department(db, department_id, payload)


@departments_router.delete(
    "/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_department(
    department_id: UUID,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.MANAGE_USERS, Permissions.MANAGE_SETTINGS)
    ),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.delete_department(db, department_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@departments_router.get("", response_model=list[DepartmentRead])
async def list_departments(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DepartmentRead]:
    return await service.list_departments(db)


@departments_router.get("/{department_id}", response_model=DepartmentRead)
async def get_department(
    department_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DepartmentRead:
    return await service.get_department(db, department_id)


@departments_router.get("/{department_id}/members", response_model=list[EmployeeRead])
async def list_department_members(
    department_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EmployeeRead]:
    return await service.list_employees(db, department_id=department_id)


organization_router = APIRouter(
    prefix="/organization", tags=["Organization - General"]
)


@organization_router.get("/tree", response_model=OrgTreeResponse)
async def get_organization_tree(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgTreeResponse:
    return await service.get_organization_tree(db)


@teams_router.post("", response_model=TeamRead, status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: TeamCreate,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.MANAGE_USERS, Permissions.MANAGE_SETTINGS)
    ),
    db: AsyncSession = Depends(get_db),
) -> TeamRead:
    return await service.create_team(db, payload)


@teams_router.patch("/{team_id}", response_model=TeamRead)
async def update_team(
    team_id: UUID,
    payload: TeamUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TeamRead:
    if not (current_user.is_super_admin() or current_user.has_permission(Permissions.MANAGE_USERS)):
        team = await service.get_team(db, team_id)
        is_mgr = await service.is_department_manager(db, current_user.user_id, team.department_id)
        if not is_mgr and team.lead_user_id != current_user.user_id:
            raise ForbiddenError("You do not have permission to modify this team.")
    return await service.update_team(db, team_id, payload)


@teams_router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_team(
    team_id: UUID,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.MANAGE_USERS, Permissions.MANAGE_SETTINGS)
    ),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.delete_team(db, team_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@teams_router.get("", response_model=list[TeamRead])
async def list_teams(
    department_id: Optional[UUID] = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TeamRead]:
    return await service.list_teams(db, department_id)


@teams_router.get("/{team_id}", response_model=TeamRead)
async def get_team(
    team_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TeamRead:
    return await service.get_team(db, team_id)


@employees_router.post(
    "", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED
)
async def create_employee(
    payload: EmployeeCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EmployeeRead:
    if payload.department_id:
        is_mgr = await service.is_department_manager(db, current_user.user_id, payload.department_id)
    else:
        is_mgr = False
    if not (current_user.is_super_admin() or current_user.has_permission(Permissions.MANAGE_USERS) or is_mgr):
        raise ForbiddenError("You do not have permission to add employees.")
    return await service.create_employee(db, payload)


@employees_router.patch("/{employee_id}", response_model=EmployeeRead)
async def update_employee(
    employee_id: UUID,
    payload: EmployeeUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EmployeeRead:
    emp = await service.get_employee(db, employee_id)
    is_mgr = False
    if emp.department_id:
        is_mgr = await service.is_department_manager(db, current_user.user_id, emp.department_id)
    if not (current_user.is_super_admin() or current_user.has_permission(Permissions.MANAGE_USERS) or is_mgr):
        raise ForbiddenError("You do not have permission to update this employee.")
    return await service.update_employee(db, employee_id, payload)


@employees_router.get("", response_model=list[EmployeeRead])
async def list_employees(
    team_id: Optional[UUID] = Query(default=None),
    department_id: Optional[UUID] = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EmployeeRead]:
    return await service.list_employees(db, team_id=team_id, department_id=department_id)


@employees_router.get("/{employee_id}", response_model=EmployeeRead)
async def get_employee(
    employee_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EmployeeRead:
    return await service.get_employee(db, employee_id)


@employees_router.post(
    "/{employee_id}/skills",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def assign_skill(
    employee_id: UUID,
    payload: SkillAssignment,
    current_user: CurrentUser = Depends(require_permission(Permissions.MANAGE_USERS)),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.assign_skill(db, employee_id, payload)


@skills_router.post("", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
async def create_skill(
    payload: SkillCreate,
    current_user: CurrentUser = Depends(require_permission(Permissions.MANAGE_USERS)),
    db: AsyncSession = Depends(get_db),
) -> SkillRead:
    return await service.create_skill(db, payload)


@skills_router.get("", response_model=list[SkillRead])
async def list_skills(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SkillRead]:
    return await service.list_skills(db)
