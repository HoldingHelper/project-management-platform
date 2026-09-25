"""Projects module REST endpoints (Products, Projects, Sprints, Tasks, Dependencies)."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.exceptions import ValidationAppError
from app.core.pagination import Page, PageParams
from app.core.permissions import Permissions
from app.modules.collaboration.authorization import (
    _require_project_access,
    _require_task_access,
)
from app.modules.projects import service
from app.modules.projects.ai_generation import (
    confirm_generation,
    create_generation_job,
    get_generation_draft,
    get_generation_job_status,
    template_bytes,
)
from app.modules.projects.ai_schemas import (
    ConfirmGenerationRequest,
    GenerationDraftResponse,
    GenerationJobResponse,
)
from app.modules.projects.schemas import (
    AttachTaskRequest,
    MilestoneCreate,
    MilestoneRead,
    MilestoneUpdate,
    PhaseCreate,
    PhaseRead,
    PhaseUpdate,
    PortfolioGantt,
    ProductCreate,
    ProductRead,
    ProductUpdate,
    ProgressBreakdown,
    ProjectCreate,
    ProjectAdminTransfer,
    ProjectDependencyCreate,
    ProjectDependencyRead,
    ProjectMemberCreate,
    ProjectMemberRead,
    ProjectOverview,
    ProjectRead,
    ProjectTimeline,
    ProjectUpdate,
    ReorderTasksRequest,
    TaskCreate,
    TaskDependencyCreate,
    TaskDependencyRead,
    TaskPartitionCreate,
    TaskPartitionRead,
    TaskPartitionUpdate,
    TaskRead,
    TaskUpdate,
    UpdateChecklistItemRequest,
    UpdateTaskStatusRequest,
)

portfolio_router = APIRouter(prefix="/portfolio", tags=["Projects - Portfolio"])

products_router = APIRouter(prefix="/products", tags=["Projects - Products"])
projects_router = APIRouter(prefix="/projects", tags=["Projects - Projects"])
phases_router = APIRouter(prefix="/phases", tags=["Projects - Legacy Phases"])
sprints_router = APIRouter(prefix="/sprints", tags=["Projects - Sprints"])
tasks_router = APIRouter(prefix="/tasks", tags=["Projects - Tasks"])
partitions_router = APIRouter(prefix="/partitions", tags=["Projects - Partitions"])
dependencies_router = APIRouter(
    prefix="/dependencies", tags=["Projects - Dependencies"]
)


# ---------- Partitions ----------
@partitions_router.get("", response_model=list[TaskPartitionRead])
async def list_task_partitions(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TaskPartitionRead]:
    return await service.list_task_partitions(db)


@partitions_router.post(
    "", response_model=TaskPartitionRead, status_code=status.HTTP_201_CREATED
)
async def create_task_partition(
    payload: TaskPartitionCreate,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.MANAGE_USERS, Permissions.MANAGE_SETTINGS)
    ),
    db: AsyncSession = Depends(get_db),
) -> TaskPartitionRead:
    return await service.create_task_partition(db, payload)


@partitions_router.patch("/{partition_id}", response_model=TaskPartitionRead)
async def update_task_partition(
    partition_id: UUID,
    payload: TaskPartitionUpdate,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.MANAGE_USERS, Permissions.MANAGE_SETTINGS)
    ),
    db: AsyncSession = Depends(get_db),
) -> TaskPartitionRead:
    return await service.update_task_partition(db, partition_id, payload)


@partitions_router.delete(
    "/{partition_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def delete_task_partition(
    partition_id: UUID,
    replacement_partition_id: Optional[UUID] = Query(default=None),
    current_user: CurrentUser = Depends(
        require_permission(Permissions.MANAGE_USERS, Permissions.MANAGE_SETTINGS)
    ),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.delete_task_partition(db, partition_id, replacement_partition_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _generation_request_content(
    prompt_file: UploadFile | None,
    extra_context: str | None,
) -> tuple[str, str]:
    chunks: list[str] = []
    filename = "project-brief.md"
    if prompt_file is not None:
        file_bytes = await prompt_file.read()
        if file_bytes:
            chunks.append(file_bytes.decode("utf-8"))
            filename = prompt_file.filename or filename
    if extra_context and extra_context.strip():
        chunks.append(
            "## Optional: Extra uploaded context\n" f"{extra_context.strip()}\n"
        )
    content = "\n\n".join(chunk.strip() for chunk in chunks if chunk.strip())
    if not content:
        raise ValidationAppError(
            "Provide a brief file, Google Sheet URL, or extra notes.",
            errors={"brief": ["File or extra context is required."]},
        )
    return content, filename


# ---------- Products ----------
@products_router.post(
    "", response_model=ProductRead, status_code=status.HTTP_201_CREATED
)
async def create_product(
    payload: ProductCreate,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.PRODUCTS_MANAGE_ALL)
    ),
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    return await service.create_product(db, payload)


@products_router.get("", response_model=Page[ProductRead])
async def list_products(
    params: PageParams = Depends(),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[ProductRead]:
    items, total = await service.list_products(db, params.page, params.page_size)
    return Page.create(items, total, params)


@products_router.get("/{product_id}", response_model=ProductRead)
async def get_product(
    product_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    return await service.get_product(db, product_id)


@products_router.put("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: UUID,
    payload: ProductUpdate,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.PRODUCTS_MANAGE_ALL)
    ),
    db: AsyncSession = Depends(get_db),
) -> ProductRead:
    return await service.update_product(db, product_id, payload)


@products_router.get("/{product_id}/projects", response_model=Page[ProjectRead])
async def get_projects_by_product(
    product_id: UUID,
    params: PageParams = Depends(),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[ProjectRead]:
    items, total = await service.list_projects_by_product(
        db, product_id, params.page, params.page_size
    )
    return Page.create(items, total, params)


# ---------- Projects ----------
@projects_router.post(
    "", response_model=ProjectRead, status_code=status.HTTP_201_CREATED
)
async def create_project(
    payload: ProjectCreate,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PROJECTS_CREATE,
            Permissions.PROJECTS_MANAGE_ALL,
            Permissions.PROJECTS_MANAGE_ASSIGNED,
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> ProjectRead:
    return await service.create_project(
        db, payload, created_by_user_id=current_user.user_id
    )


@projects_router.get("/ai-template")
async def download_ai_project_template(
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PROJECTS_MANAGE_ASSIGNED,
            Permissions.PHASES_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_ALL,
        )
    ),
) -> Response:
    return Response(
        content=template_bytes(),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="project_brief_template.md"'
        },
    )


@projects_router.post(
    "/generate",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def generate_project_draft(
    prompt_file: UploadFile | None = File(None),
    extra_context: str | None = Form(None),
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PROJECTS_MANAGE_ASSIGNED,
            Permissions.PHASES_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_ALL,
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> GenerationJobResponse:
    content, filename = await _generation_request_content(prompt_file, extra_context)
    job = await create_generation_job(
        db,
        user_id=current_user.user_id,
        raw_input=content,
        filename=filename,
    )
    return GenerationJobResponse(**job)


@projects_router.get(
    "/generation-jobs/{job_id}",
    response_model=GenerationJobResponse,
)
async def get_project_generation_job(
    job_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GenerationJobResponse:
    return GenerationJobResponse(
        **await get_generation_job_status(
            db,
            job_id=job_id,
            user_id=current_user.user_id,
        )
    )


@projects_router.get(
    "/generation-jobs/{job_id}/draft",
    response_model=GenerationDraftResponse,
)
async def get_project_generation_draft(
    job_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GenerationDraftResponse:
    return await get_generation_draft(
        db,
        job_id=job_id,
        user_id=current_user.user_id,
    )


@projects_router.post("/generation-jobs/{job_id}/confirm")
async def confirm_project_generation_job(
    job_id: UUID,
    payload: ConfirmGenerationRequest | None = Body(default=None),
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PROJECTS_MANAGE_ASSIGNED,
            Permissions.PHASES_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_ALL,
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await confirm_generation(
        db,
        job_id,
        current_user.user_id,
        draft_override=payload.project if payload else None,
    )


@projects_router.get("", response_model=Page[ProjectRead])
async def list_projects(
    params: PageParams = Depends(),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[ProjectRead]:
    items, total = await service.list_all_projects(
        db, params.page, params.page_size, current_user=current_user
    )
    return Page.create(items, total, params)


@projects_router.post("/{project_id}/confirm-generation")
async def confirm_project_generation(
    project_id: UUID,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PROJECTS_MANAGE_ASSIGNED,
            Permissions.PHASES_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_ALL,
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await service.require_project_manage_access(db, project_id, current_user)
    return await confirm_generation(db, project_id, current_user.user_id)


@projects_router.post(
    "/{project_id}/regenerate",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def regenerate_project_draft(
    project_id: UUID,
    prompt_file: UploadFile | None = File(None),
    extra_context: str | None = Form(None),
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PROJECTS_MANAGE_ASSIGNED,
            Permissions.PHASES_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_ALL,
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> GenerationJobResponse:
    await service.require_project_manage_access(db, project_id, current_user)
    content, filename = await _generation_request_content(prompt_file, extra_context)
    job = await create_generation_job(
        db,
        user_id=current_user.user_id,
        raw_input=content,
        filename=filename,
        existing_project_id=project_id,
    )
    return GenerationJobResponse(**job)


@projects_router.post("/{project_id}/regenerate/confirm")
async def confirm_project_regeneration(
    project_id: UUID,
    generation_run_id: UUID = Query(...),
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PROJECTS_MANAGE_ASSIGNED,
            Permissions.PHASES_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.TASKS_MANAGE_ALL,
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await service.require_project_manage_access(db, project_id, current_user)
    return await confirm_generation(db, generation_run_id, current_user.user_id)


@projects_router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectRead:
    await _require_project_access(db, current_user, project_id)
    return await service.get_project(db, project_id)


@projects_router.put("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PROJECTS_MANAGE_ALL, Permissions.PROJECTS_MANAGE_ASSIGNED
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> ProjectRead:
    await service.require_project_manage_access(db, project_id, current_user)
    return await service.update_project(db, project_id, payload)


@projects_router.post("/{project_id}/archive", response_model=ProjectRead)
async def archive_project(
    project_id: UUID,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PROJECTS_MANAGE_ALL, Permissions.PROJECTS_MANAGE_ASSIGNED
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> ProjectRead:
    await service.require_project_manage_access(db, project_id, current_user)
    return await service.archive_project(db, project_id)


@projects_router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_project(
    project_id: UUID,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PROJECTS_MANAGE_ALL, Permissions.PROJECTS_MANAGE_ASSIGNED
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.require_project_manage_access(db, project_id, current_user)
    await service.delete_project(db, project_id)


@projects_router.get("/{project_id}/overview", response_model=ProjectOverview)
async def get_project_overview(
    project_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectOverview:
    await _require_project_access(db, current_user, project_id)
    return await service.get_project_overview(db, project_id)


@projects_router.get("/{project_id}/members", response_model=list[ProjectMemberRead])
async def get_project_members(
    project_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectMemberRead]:
    await _require_project_access(db, current_user, project_id)
    return await service.list_project_members(db, project_id)


@projects_router.delete(
    "/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def remove_project_member(
    project_id: UUID,
    user_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.require_project_admin(db, project_id, current_user)
    await service.remove_project_member(db, project_id, user_id)


@projects_router.put(
    "/{project_id}/admin",
    response_model=ProjectMemberRead,
)
async def transfer_project_admin(
    project_id: UUID,
    payload: ProjectAdminTransfer,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectMemberRead:
    await service.require_project_admin(db, project_id, current_user)
    return await service.transfer_project_admin(db, project_id, payload)


@projects_router.post(
    "/{project_id}/milestones",
    response_model=MilestoneRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_milestone(
    project_id: UUID,
    payload: MilestoneCreate,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.MILESTONES_MANAGE, Permissions.PROJECTS_MANAGE_ALL
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> MilestoneRead:
    return await service.create_milestone(
        db, project_id, payload, created_by_user_id=current_user.user_id
    )


@projects_router.get("/{project_id}/milestones", response_model=list[MilestoneRead])
async def list_milestones(
    project_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MilestoneRead]:
    await _require_project_access(db, current_user, project_id)
    return await service.list_milestones(db, project_id)


@projects_router.patch("/milestones/{milestone_id}", response_model=MilestoneRead)
async def update_milestone(
    milestone_id: UUID,
    payload: MilestoneUpdate,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.MILESTONES_MANAGE, Permissions.PROJECTS_MANAGE_ALL
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> MilestoneRead:
    return await service.update_milestone(db, milestone_id, payload)


@projects_router.delete(
    "/milestones/{milestone_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_milestone(
    milestone_id: UUID,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.MILESTONES_MANAGE, Permissions.PROJECTS_MANAGE_ALL
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.delete_milestone(db, milestone_id)


@projects_router.post(
    "/{project_id}/dependencies",
    response_model=ProjectDependencyRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_dependency(
    project_id: UUID,
    payload: ProjectDependencyCreate,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.PROJECTS_MANAGE_ALL)
    ),
    db: AsyncSession = Depends(get_db),
) -> ProjectDependencyRead:
    return await service.create_project_dependency(db, payload)


@projects_router.delete(
    "/dependencies/{dependency_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_project_dependency(
    dependency_id: UUID,
    current_user: CurrentUser = Depends(
        require_permission(Permissions.PROJECTS_MANAGE_ALL)
    ),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.delete_project_dependency(db, dependency_id)


@projects_router.get("/{project_id}/timeline", response_model=ProjectTimeline)
async def get_project_timeline(
    project_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectTimeline:
    await _require_project_access(db, current_user, project_id)
    return await service.get_project_timeline(db, project_id)


@projects_router.get("/{project_id}/sprints", response_model=list[PhaseRead])
@projects_router.get("/{project_id}/phases", response_model=list[PhaseRead], deprecated=True)
async def get_phases_by_project(
    project_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PhaseRead]:
    await _require_project_access(db, current_user, project_id)
    return await service.list_phases_by_project(db, project_id)


@projects_router.post(
    "/{project_id}/members",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def add_project_member(
    project_id: UUID,
    payload: ProjectMemberCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.require_project_admin(db, project_id, current_user)
    await service.add_project_member(db, project_id, payload)


# ---------- Phases ----------
@sprints_router.post("", response_model=PhaseRead, status_code=status.HTTP_201_CREATED)
@phases_router.post("", response_model=PhaseRead, status_code=status.HTTP_201_CREATED, deprecated=True)
async def create_phase(
    payload: PhaseCreate,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PHASES_MANAGE_ALL, Permissions.PHASES_MANAGE_TEAM
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> PhaseRead:
    return await service.create_phase(db, payload)


@sprints_router.get("/{phase_id}", response_model=PhaseRead)
@phases_router.get("/{phase_id}", response_model=PhaseRead, deprecated=True)
async def get_phase(
    phase_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhaseRead:
    phase = await service.get_phase(db, phase_id)
    await _require_project_access(db, current_user, phase.project_id)
    return phase


@sprints_router.put("/{phase_id}", response_model=PhaseRead)
@phases_router.put("/{phase_id}", response_model=PhaseRead, deprecated=True)
async def update_phase(
    phase_id: UUID,
    payload: PhaseUpdate,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.PHASES_MANAGE_ALL,
            Permissions.PHASES_MANAGE_TEAM,
            Permissions.PHASES_APPROVE,
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> PhaseRead:
    phase = await service.get_phase(db, phase_id)
    await service.require_project_manage_access(db, phase.project_id, current_user)
    return await service.update_phase(db, phase_id, payload)


@sprints_router.get("/{phase_id}/tasks", response_model=list[TaskRead])
@phases_router.get("/{phase_id}/tasks", response_model=list[TaskRead], deprecated=True)
async def get_tasks_by_phase(
    phase_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TaskRead]:
    phase = await service.get_phase(db, phase_id)
    await _require_project_access(db, current_user, phase.project_id)
    return await service.list_tasks_by_phase(db, phase_id)


@sprints_router.get("/{phase_id}/progress", response_model=ProgressBreakdown)
@phases_router.get("/{phase_id}/progress", response_model=ProgressBreakdown, deprecated=True)
async def get_phase_progress(
    phase_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProgressBreakdown:
    phase = await service.get_phase(db, phase_id)
    await _require_project_access(db, current_user, phase.project_id)
    return await service.get_phase_progress_breakdown(db, phase_id)


# ---------- Portfolio ----------
@portfolio_router.get("/gantt", response_model=PortfolioGantt)
async def get_portfolio_gantt(
    include_archived: bool = Query(default=False),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PortfolioGantt:
    return await service.get_portfolio_gantt(db, include_archived=include_archived)


# ---------- Tasks ----------
@tasks_router.get("", response_model=Page[TaskRead])
async def list_tasks(
    partition: Optional[str] = Query(default=None),
    label: Optional[str] = Query(default=None),
    assignee_user_id: Optional[UUID] = Query(default=None),
    task_status: Optional[str] = Query(default=None, alias="status"),
    unattached: Optional[bool] = Query(default=None),
    parent_task_id: Optional[UUID] = Query(default=None),
    search: Optional[str] = Query(default=None),
    params: PageParams = Depends(),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[TaskRead]:
    items, total = await service.list_tasks(
        db,
        partition=partition,
        label=label,
        assignee_user_id=assignee_user_id,
        status=task_status,
        unattached=unattached,
        parent_task_id=parent_task_id,
        search=search,
        current_user=current_user,
        page=params.page,
        page_size=params.page_size,
    )
    return Page.create(items, total, params)


@tasks_router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    return await service.create_task(
        db, payload, created_by_user_id=current_user.user_id, current_user=current_user
    )


@tasks_router.put(
    "/reorder", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def reorder_tasks(
    payload: ReorderTasksRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await service.require_task_board_access(db, current_user, payload.task_ids)
    await service.reorder_tasks(db, payload.task_ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@tasks_router.post("/{task_id}/attach", response_model=TaskRead)
async def attach_task(
    task_id: UUID,
    payload: AttachTaskRequest,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.TASKS_MANAGE_ALL, Permissions.PROJECTS_MANAGE_ALL
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    return await service.attach_task_to_phase(db, task_id, payload.phase_id)


@tasks_router.post("/{task_id}/detach", response_model=TaskRead)
async def detach_task(
    task_id: UUID,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.TASKS_MANAGE_ALL, Permissions.PROJECTS_MANAGE_ALL
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    return await service.detach_task_from_phase(db, task_id)


@tasks_router.get("/{task_id}", response_model=TaskRead)
async def get_task(
    task_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    await _require_task_access(db, current_user, task_id)
    return await service.get_task(db, task_id)


@tasks_router.put("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    return await service.update_task(db, task_id, payload, current_user)


@tasks_router.put("/{task_id}/status", response_model=TaskRead)
async def update_task_status(
    task_id: UUID,
    payload: UpdateTaskStatusRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    await service.require_task_board_access(db, current_user, [task_id])
    return await service.update_task_status(
        db, task_id, payload.status, changed_by_user_id=current_user.user_id
    )


@tasks_router.put("/{task_id}/checklist/{checklist_item_id}", response_model=TaskRead)
async def update_task_checklist_item(
    task_id: UUID,
    checklist_item_id: UUID,
    payload: UpdateChecklistItemRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    await service.require_task_edit_access(db, current_user, task_id)
    return await service.update_checklist_item(
        db,
        task_id=task_id,
        checklist_item_id=checklist_item_id,
        is_done=payload.is_done,
        changed_by_user_id=current_user.user_id,
    )


@tasks_router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_task(
    task_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.require_task_edit_access(db, current_user, task_id)
    await service.delete_task(db, task_id)


# ---------- Dependencies ----------
@dependencies_router.post(
    "", response_model=TaskDependencyRead, status_code=status.HTTP_201_CREATED
)
async def create_dependency(
    payload: TaskDependencyCreate,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.PROJECTS_MANAGE_ALL,
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> TaskDependencyRead:
    return await service.create_dependency(db, payload)


@dependencies_router.delete(
    "/{dependency_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_dependency(
    dependency_id: UUID,
    current_user: CurrentUser = Depends(
        require_permission(
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.PROJECTS_MANAGE_ALL,
        )
    ),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.delete_dependency(db, dependency_id)
