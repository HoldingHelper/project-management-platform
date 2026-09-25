"""Strawberry GraphQL Schema definitions with secure query and mutation resolvers."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional
from uuid import UUID

import strawberry
from sqlalchemy import select, update
from strawberry.schema.config import StrawberryConfig
from strawberry.types import Info

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, NotFoundError, UnauthorizedError
from app.graphql.context import GraphQLContext
from app.graphql.types import (
    AutomationRuleType,
    DiagramResultType,
    DocPageType,
    DocSpaceType,
    MeetingType,
    ProjectType,
    TaskType,
    UserType,
)
from app.modules.automations.models import AutomationRule
from app.modules.calendar import repository as calendar_repo
from app.modules.docs import diagram_generator
from app.modules.docs.models import DocPage, DocSpace
from app.modules.identity.models import User
from app.modules.integrations.whatsapp import service as whatsapp_service
from app.modules.projects.models import Project, TaskItem
from app.shared.base_model import utcnow


@strawberry.type
class Query:
    @strawberry.field
    async def me(self, info: Info[GraphQLContext, Any]) -> Optional[UserType]:
        user = info.context.current_user
        if not user:
            return None
        return UserType(
            id=user.user_id,
            email=user.email,
            full_name=user.full_name,
            roles=user.roles,
        )

    @strawberry.field
    async def projects(
        self, info: Info[GraphQLContext, Any], status: Optional[str] = None
    ) -> List[ProjectType]:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required.")

        db = info.context.db
        from app.modules.collaboration.authorization import _can_view_all_projects
        from app.modules.projects.models import ProjectMember

        stmt = select(Project)
        if not _can_view_all_projects(user):
            stmt = stmt.join(ProjectMember, ProjectMember.project_id == Project.id).where(
                ProjectMember.user_id == user.user_id
            )
        if status:
            stmt = stmt.where(Project.status == status)
        stmt = stmt.order_by(Project.created_at.desc())
        res = await db.execute(stmt)
        projects = res.scalars().all()
        return [
            ProjectType(
                id=p.id,
                name=p.name,
                description=p.description,
                status=p.status,
                key=p.key,
                created_at=p.created_at,
            )
            for p in projects
        ]

    @strawberry.field
    async def tasks(
        self,
        info: Info[GraphQLContext, Any],
        phase_id: Optional[UUID] = None,
        status: Optional[str] = None,
    ) -> List[TaskType]:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required.")

        db = info.context.db
        from app.modules.collaboration.authorization import _can_view_all_projects
        from app.modules.projects.models import Phase, ProjectMember, TaskAssignee

        stmt = select(TaskItem)
        if not _can_view_all_projects(user):
            # Show tasks in projects where user is member or tasks directly assigned to user
            from sqlalchemy import or_
            user_member_subq = (
                select(Phase.id)
                .join(ProjectMember, ProjectMember.project_id == Phase.project_id)
                .where(ProjectMember.user_id == user.user_id)
            )
            user_assigned_subq = (
                select(TaskAssignee.task_id).where(TaskAssignee.user_id == user.user_id)
            )
            stmt = stmt.where(
                or_(
                    TaskItem.phase_id.in_(user_member_subq),
                    TaskItem.id.in_(user_assigned_subq),
                    TaskItem.reviewer_user_id == user.user_id,
                    TaskItem.ticket_requested_by_user_id == user.user_id,
                )
            )

        if phase_id:
            stmt = stmt.where(TaskItem.phase_id == phase_id)
        if status:
            stmt = stmt.where(TaskItem.status == status)
        stmt = stmt.order_by(TaskItem.created_at.desc())
        res = await db.execute(stmt)
        tasks = res.scalars().all()
        return [
            TaskType(
                id=t.id,
                phase_id=t.phase_id,
                parent_task_id=t.parent_task_id,
                title=t.title,
                description=t.description,
                status=t.status,
                priority=t.priority,
                created_at=t.created_at,
                is_ticket=t.is_ticket,
                ticket_requested_by_user_id=t.ticket_requested_by_user_id,
            )
            for t in tasks
        ]

    @strawberry.field
    async def doc_spaces(self, info: Info[GraphQLContext, Any]) -> List[DocSpaceType]:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required.")

        from app.modules.docs import service as docs_service
        spaces = await docs_service.list_spaces(info.context.db, user)
        return [
            DocSpaceType(
                id=s.id,
                name=s.name,
                slug=s.slug,
                description=s.description,
                icon=s.icon,
                visibility=s.visibility,
            )
            for s in spaces
        ]

    @strawberry.field
    async def doc_page(
        self,
        info: Info[GraphQLContext, Any],
        id: Optional[UUID] = None,
        slug: Optional[str] = None,
    ) -> Optional[DocPageType]:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required.")

        from app.modules.docs import service as docs_service
        if id:
            try:
                p = await docs_service.get_page(info.context.db, user, id)
            except Exception:
                return None
        elif slug:
            db = info.context.db
            res = await db.execute(select(DocPage).where(DocPage.slug == slug))
            page_row = res.scalar_one_or_none()
            if not page_row:
                return None
            try:
                p = await docs_service.get_page(db, user, page_row.id)
            except Exception:
                return None
        else:
            return None

        return DocPageType(
            id=p.id,
            space_id=p.space_id,
            title=p.title,
            slug=p.slug,
            excerpt=p.excerpt,
            content=p.content,
            status=p.status,
            created_at=p.created_at,
        )

    @strawberry.field
    async def upcoming_meetings(
        self, info: Info[GraphQLContext, Any], hours_ahead: int = 24
    ) -> List[MeetingType]:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required.")
        db = info.context.db
        now = utcnow()
        to_time = now + timedelta(hours=hours_ahead)
        events = await calendar_repo.list_upcoming_events(db, user.user_id, now, to_time)
        return [
            MeetingType(
                id=e.id,
                title=e.title,
                start_time=e.start_time,
                end_time=e.end_time,
                meet_url=e.meet_url,
                html_link=e.html_link,
                starts_in_minutes=max(0, int((e.start_time - now).total_seconds() // 60)),
                is_now=e.start_time <= now <= e.end_time,
            )
            for e in events
        ]

    @strawberry.field
    async def automation_rules(self, info: Info[GraphQLContext, Any]) -> List[AutomationRuleType]:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required.")
        if not (user.is_super_admin() or user.has_permission("automations.manage")):
            raise ForbiddenError("You do not have permission to view automation rules.")

        db = info.context.db
        stmt = select(AutomationRule).order_by(AutomationRule.created_at.desc())
        res = await db.execute(stmt)
        rules = res.scalars().all()
        return [
            AutomationRuleType(
                id=r.id,
                name=r.name,
                trigger_type=r.trigger_type,
                action_type=r.action_type,
                is_active=r.is_active,
                created_at=r.created_at,
            )
            for r in rules
        ]


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def create_task(
        self,
        info: Info[GraphQLContext, Any],
        title: str,
        description: Optional[str] = None,
        phase_id: Optional[UUID] = None,
        priority: str = "P2",
        status: str = "Ready",
        assignee_user_ids: Optional[List[UUID]] = None,
        is_ticket: bool = False,
        ticket_recipient_user_ids: Optional[List[UUID]] = None,
        ticket_recipient_team_ids: Optional[List[UUID]] = None,
    ) -> TaskType:
        user = info.context.current_user
        db = info.context.db
        if user is None:
            raise UnauthorizedError("Authentication is required to create a task.")

        from app.modules.projects.schemas import TaskCreate
        from app.modules.projects.service import create_task as create_project_task

        task = await create_project_task(
            db,
            TaskCreate(
                title=title,
                description=description,
                phase_id=phase_id,
                priority=priority,
                status=status,
                assignee_user_ids=assignee_user_ids or [],
                is_ticket=is_ticket,
                ticket_recipient_user_ids=ticket_recipient_user_ids or [],
                ticket_recipient_team_ids=ticket_recipient_team_ids or [],
            ),
            created_by_user_id=user.user_id,
        )
        return TaskType(
            id=task.id,
            phase_id=task.phase_id,
            parent_task_id=task.parent_task_id,
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            created_at=task.created_at,
            is_ticket=task.is_ticket,
            ticket_requested_by_user_id=task.ticket_requested_by_user_id,
        )

    @strawberry.mutation
    async def update_task_status(
        self,
        info: Info[GraphQLContext, Any],
        task_id: UUID,
        status: str,
    ) -> TaskType:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required.")

        db = info.context.db
        from app.modules.projects.service import require_task_board_access, update_task_status as svc_update_status

        await require_task_board_access(db, user, [task_id])
        res = await db.execute(select(TaskItem).where(TaskItem.id == task_id))
        task = res.scalar_one_or_none()
        if not task:
            raise NotFoundError("Task", task_id)
        task.status = status
        await db.commit()
        await db.refresh(task)
        return TaskType(
            id=task.id,
            phase_id=task.phase_id,
            parent_task_id=task.parent_task_id,
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            created_at=task.created_at,
            is_ticket=task.is_ticket,
            ticket_requested_by_user_id=task.ticket_requested_by_user_id,
        )

    @strawberry.mutation
    async def create_doc_page(
        self,
        info: Info[GraphQLContext, Any],
        space_id: UUID,
        title: str,
        content: str,
    ) -> DocPageType:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required to create documentation pages.")

        db = info.context.db
        from app.modules.docs import service as docs_service
        from app.modules.docs.schemas import PageCreate

        page_read = await docs_service.create_page(
            db, user, space_id, PageCreate(title=title, content=content)
        )
        return DocPageType(
            id=page_read.id,
            space_id=page_read.space_id,
            title=page_read.title,
            slug=page_read.slug,
            excerpt=page_read.excerpt,
            content=page_read.content,
            status=page_read.status,
            created_at=page_read.created_at,
        )

    @strawberry.mutation
    async def create_diagram_doc(
        self,
        info: Info[GraphQLContext, Any],
        space_id: UUID,
        title: str,
        diagram_type: str,
        spec_json: str,
    ) -> DiagramResultType:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required to create diagram documents.")

        db = info.context.db
        from app.modules.docs import service as docs_service
        if not (
            user.is_super_admin()
            or await docs_service.can_access(db, user, "space", space_id, "edit")
        ):
            # check space visibility / permissions
            space = await db.get(DocSpace, space_id)
            if not space or not (space.visibility in {"workspace", "public"} and docs_service.has_global_docs_access(user, "edit")):
                raise ForbiddenError("You do not have permission to create documents in this space.")

        try:
            spec = json.loads(spec_json)
        except Exception:
            spec = {}

        svg_content = diagram_generator.render_diagram_svg(diagram_type, title, spec)

        from slugify import slugify
        page_slug = slugify(f"{title}-{diagram_type}") or f"diagram-{int(utcnow().timestamp())}"

        doc_content = f"# {title}\n\n*Type: {diagram_type.capitalize()} Diagram*\n\n```xml\n{svg_content}\n```"
        page = DocPage(
            space_id=space_id,
            title=title,
            slug=page_slug,
            content=doc_content,
            created_by=user.user_id,
            updated_by=user.user_id,
        )
        db.add(page)
        await db.commit()
        await db.refresh(page)

        return DiagramResultType(
            page_id=page.id,
            title=title,
            diagram_type=diagram_type,
            svg_content=svg_content,
            page_slug=page.slug,
        )

    @strawberry.mutation
    async def create_automation_rule(
        self,
        info: Info[GraphQLContext, Any],
        name: str,
        trigger_type: str,
        action_type: str,
        config_json: Optional[str] = None,
    ) -> AutomationRuleType:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required to create automation rules.")
        if not (user.is_super_admin() or user.has_permission("automations.manage")):
            raise ForbiddenError("You do not have permission to manage automation rules.")

        db = info.context.db
        action_config = {}
        if config_json:
            try:
                action_config = json.loads(config_json)
            except Exception:
                pass

        rule = AutomationRule(
            name=name,
            trigger_type=trigger_type,
            action_type=action_type,
            action_config=action_config,
            created_by_user_id=user.user_id,
            is_active=True,
        )
        db.add(rule)
        await db.commit()
        await db.refresh(rule)

        return AutomationRuleType(
            id=rule.id,
            name=rule.name,
            trigger_type=rule.trigger_type,
            action_type=rule.action_type,
            is_active=rule.is_active,
            created_at=rule.created_at,
        )

    @strawberry.mutation
    async def send_whatsapp_message(
        self,
        info: Info[GraphQLContext, Any],
        phone_number: str,
        message: str,
    ) -> bool:
        user = info.context.current_user
        if not user:
            raise UnauthorizedError("Authentication required to send WhatsApp messages.")
        if not (
            user.is_super_admin()
            or user.has_permission("integrations.manage")
            or user.has_permission("integrations.whatsapp")
        ):
            raise ForbiddenError("Permission denied: integrations.whatsapp or integrations.manage required.")

        return await whatsapp_service.send_whatsapp_text_message(phone_number, message)


extensions = []
if get_settings().is_production:
    from graphql.validation import NoSchemaIntrospectionCustomRule
    from strawberry.extensions import AddValidationRules

    extensions.append(lambda: AddValidationRules([NoSchemaIntrospectionCustomRule]))

schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    extensions=extensions,
)
