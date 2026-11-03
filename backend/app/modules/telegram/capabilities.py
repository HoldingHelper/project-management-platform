"""Dynamic capability resolver deriving Telegram actions from current PMP RBAC permissions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.permissions import Permissions


@dataclass(frozen=True)
class UserCapabilities:
    """Set of authorized capabilities available to a user in Telegram."""

    can_create_project: bool = False
    can_view_projects: bool = False
    can_manage_project: bool = False
    can_manage_project_members: bool = False
    can_create_sprint: bool = False
    can_view_sprints: bool = False
    can_create_task: bool = False
    can_view_tasks: bool = False
    can_assign_task: bool = False
    can_edit_task: bool = False
    can_change_task_status: bool = False
    can_add_comment: bool = False
    can_upload_files: bool = False
    can_create_ticket: bool = False
    can_manage_milestones: bool = False
    can_search_docs: bool = False
    can_view_analytics: bool = False


class TelegramCapabilityService:
    """Resolves Telegram actions from authoritative, live PMP permissions.

    Never caches permissions permanently; always evaluates the live CurrentUser.
    """

    @classmethod
    async def resolve_user_capabilities(
        cls, db: AsyncSession, current_user: Optional[CurrentUser]
    ) -> UserCapabilities:
        """Derive capabilities combining global RBAC permissions and accessible Product Lines."""
        if not current_user:
            return UserCapabilities()
        caps = cls.get_user_capabilities(current_user)
        if current_user.is_super_admin():
            return caps

        try:
            from app.modules.projects.product_access import visible_product_ids
            prod_ids = await visible_product_ids(db, current_user)
            if prod_ids is not None and len(prod_ids) == 0:
                # User has no accessible product lines; disable project/task/sprint actions
                return UserCapabilities(
                    can_create_project=False,
                    can_view_projects=False,
                    can_manage_project=False,
                    can_manage_project_members=False,
                    can_create_sprint=False,
                    can_view_sprints=False,
                    can_create_task=False,
                    can_view_tasks=False,
                    can_assign_task=False,
                    can_edit_task=False,
                    can_change_task_status=False,
                    can_add_comment=False,
                    can_upload_files=False,
                    can_create_ticket=False,
                    can_manage_milestones=False,
                    can_search_docs=caps.can_search_docs,
                    can_view_analytics=caps.can_view_analytics,
                )
        except (AttributeError, TypeError):
            return caps
        return caps

    @classmethod
    def get_user_capabilities(cls, current_user: CurrentUser) -> UserCapabilities:
        """Derive all global capabilities for a user from their active PMP permissions."""
        if current_user.is_super_admin():
            return UserCapabilities(
                can_create_project=True,
                can_view_projects=True,
                can_manage_project=True,
                can_manage_project_members=True,
                can_create_sprint=True,
                can_view_sprints=True,
                can_create_task=True,
                can_view_tasks=True,
                can_assign_task=True,
                can_edit_task=True,
                can_change_task_status=True,
                can_add_comment=True,
                can_upload_files=True,
                can_create_ticket=True,
                can_manage_milestones=True,
                can_search_docs=True,
                can_view_analytics=True,
            )

        # 1. Projects
        can_create_proj = current_user.has_permission(Permissions.PROJECTS_CREATE)
        can_view_proj = current_user.has_any_permission(
            Permissions.PROJECTS_VIEW_ALL,
            Permissions.PROJECTS_VIEW_ASSIGNED,
            Permissions.PROJECTS_MANAGE_ALL,
            Permissions.PROJECTS_MANAGE_ASSIGNED,
            Permissions.READONLY_ACCESS,
        )
        can_manage_proj = current_user.has_any_permission(
            Permissions.PROJECTS_MANAGE_ALL,
            Permissions.PROJECTS_MANAGE_ASSIGNED,
        )
        can_manage_members = current_user.has_any_permission(
            Permissions.PROJECTS_MANAGE_ALL,
            Permissions.PROJECTS_MANAGE_USERS,
        )

        # 2. Sprints & Phases
        can_create_sp = current_user.has_any_permission(
            Permissions.PHASES_MANAGE_ALL,
            Permissions.PHASES_MANAGE_TEAM,
            Permissions.PROJECTS_MANAGE_ALL,
        )
        can_view_sp = current_user.has_any_permission(
            Permissions.PHASES_VIEW,
            Permissions.PHASES_MANAGE_ALL,
            Permissions.PROJECTS_VIEW_ALL,
            Permissions.PROJECTS_VIEW_ASSIGNED,
            Permissions.READONLY_ACCESS,
        )

        # 3. Tasks
        can_create_t = current_user.has_any_permission(
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.PROJECTS_MANAGE_ALL,
            Permissions.TASKS_EDIT_ASSIGNED,
            Permissions.TASKS_ASSIGN,
        )
        can_view_t = current_user.has_any_permission(
            Permissions.TASKS_VIEW,
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_EDIT_ASSIGNED,
            Permissions.READONLY_ACCESS,
        )
        can_assign_t = current_user.has_any_permission(
            Permissions.TASKS_ASSIGN,
            Permissions.TASKS_MANAGE_ALL,
        )
        can_edit_t = current_user.has_any_permission(
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.TASKS_EDIT_ASSIGNED,
        )
        can_status_t = can_edit_t or can_view_t  # contributors can transition their tasks

        # 4. Collaboration, Tickets & Files
        can_comment = current_user.has_any_permission(
            Permissions.TASKS_COMMENT,
            Permissions.TASKS_VIEW,
            Permissions.TASKS_EDIT_ASSIGNED,
            Permissions.TASKS_MANAGE_ALL,
        )
        can_files = current_user.has_any_permission(
            Permissions.TASKS_UPLOAD_FILES,
            Permissions.TASKS_MANAGE_ALL,
            Permissions.PLANNING_UPLOAD,
        )
        can_ticket = current_user.has_any_permission(
            Permissions.TASKS_VIEW,
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_EDIT_ASSIGNED,
            Permissions.TASKS_ASSIGN,
        )

        # 5. Milestones, Docs & Analytics
        can_milestone = current_user.has_any_permission(
            Permissions.MILESTONES_MANAGE,
            Permissions.PROJECTS_MANAGE_ALL,
        )
        can_docs = current_user.has_any_permission(
            Permissions.DOCS_VIEW,
            Permissions.DOCS_CREATE,
            Permissions.DOCS_EDIT,
            Permissions.DOCS_MANAGE,
        )
        can_analytics = current_user.has_any_permission(
            Permissions.REPORTS_VIEW,
            Permissions.REPORTS_VIEW_EXECUTIVE,
            Permissions.ANALYTICS_VIEW_ORG,
            Permissions.TASKS_VIEW,
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_EDIT_ASSIGNED,
        )

        return UserCapabilities(
            can_create_project=can_create_proj,
            can_view_projects=can_view_proj,
            can_manage_project=can_manage_proj,
            can_manage_project_members=can_manage_members,
            can_create_sprint=can_create_sp,
            can_view_sprints=can_view_sp,
            can_create_task=can_create_t,
            can_view_tasks=can_view_t,
            can_assign_task=can_assign_t,
            can_edit_task=can_edit_t,
            can_change_task_status=can_status_t,
            can_add_comment=can_comment,
            can_upload_files=can_files,
            can_create_ticket=can_ticket,
            can_manage_milestones=can_milestone,
            can_search_docs=can_docs,
            can_view_analytics=can_analytics,
        )

    @classmethod
    def can_create_project(cls, current_user: CurrentUser) -> bool:
        return current_user.is_super_admin() or current_user.has_permission(Permissions.PROJECTS_CREATE)

    @classmethod
    def can_view_projects(cls, current_user: CurrentUser) -> bool:
        return current_user.is_super_admin() or current_user.has_any_permission(
            Permissions.PROJECTS_VIEW_ALL,
            Permissions.PROJECTS_VIEW_ASSIGNED,
            Permissions.PROJECTS_MANAGE_ALL,
            Permissions.PROJECTS_MANAGE_ASSIGNED,
            Permissions.READONLY_ACCESS,
        )

    @classmethod
    def can_manage_project(cls, current_user: CurrentUser, project: Any = None) -> bool:
        if current_user.is_super_admin() or current_user.has_permission(Permissions.PROJECTS_MANAGE_ALL):
            return True
        return current_user.has_permission(Permissions.PROJECTS_MANAGE_ASSIGNED)

    @classmethod
    def can_manage_project_members(cls, current_user: CurrentUser, project: Any = None) -> bool:
        if current_user.is_super_admin() or current_user.has_permission(Permissions.PROJECTS_MANAGE_ALL):
            return True
        return current_user.has_permission(Permissions.PROJECTS_MANAGE_USERS)

    @classmethod
    def can_create_sprint(cls, current_user: CurrentUser, project: Any = None) -> bool:
        if current_user.is_super_admin() or current_user.has_permission(Permissions.PROJECTS_MANAGE_ALL):
            return True
        return current_user.has_any_permission(Permissions.PHASES_MANAGE_ALL, Permissions.PHASES_MANAGE_TEAM)

    @classmethod
    def can_view_sprints(cls, current_user: CurrentUser) -> bool:
        return current_user.is_super_admin() or current_user.has_any_permission(
            Permissions.PHASES_VIEW,
            Permissions.PHASES_MANAGE_ALL,
            Permissions.PROJECTS_VIEW_ALL,
            Permissions.PROJECTS_VIEW_ASSIGNED,
            Permissions.READONLY_ACCESS,
        )

    @classmethod
    def can_create_task(cls, current_user: CurrentUser, project: Any = None) -> bool:
        if current_user.is_super_admin() or current_user.has_permission(Permissions.PROJECTS_MANAGE_ALL):
            return True
        return current_user.has_any_permission(
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_MANAGE_TEAM,
            Permissions.TASKS_EDIT_ASSIGNED,
            Permissions.TASKS_ASSIGN,
        )

    @classmethod
    def can_view_tasks(cls, current_user: CurrentUser) -> bool:
        return current_user.is_super_admin() or current_user.has_any_permission(
            Permissions.TASKS_VIEW,
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_EDIT_ASSIGNED,
            Permissions.READONLY_ACCESS,
        )

    @classmethod
    def can_assign_task(cls, current_user: CurrentUser, task: Any = None) -> bool:
        if current_user.is_super_admin() or current_user.has_permission(Permissions.TASKS_MANAGE_ALL):
            return True
        return current_user.has_permission(Permissions.TASKS_ASSIGN)

    @classmethod
    def can_edit_task(cls, current_user: CurrentUser, task: Any = None) -> bool:
        if current_user.is_super_admin() or current_user.has_permission(Permissions.TASKS_MANAGE_ALL):
            return True
        if current_user.has_permission(Permissions.TASKS_MANAGE_TEAM):
            return True
        if current_user.has_permission(Permissions.TASKS_EDIT_ASSIGNED):
            if task is None:
                return True
            assignees = getattr(task, "assignees", [])
            assignee_ids = {a.user_id for a in assignees} if assignees else set()
            return current_user.user_id in assignee_ids
        return False

    @classmethod
    def can_change_task_status(cls, current_user: CurrentUser, task: Any = None) -> bool:
        return cls.can_edit_task(current_user, task) or cls.can_view_tasks(current_user)

    @classmethod
    def can_add_comment(cls, current_user: CurrentUser) -> bool:
        return current_user.is_super_admin() or current_user.has_any_permission(
            Permissions.TASKS_COMMENT,
            Permissions.TASKS_VIEW,
            Permissions.TASKS_EDIT_ASSIGNED,
            Permissions.TASKS_MANAGE_ALL,
        )

    @classmethod
    def can_upload_files(cls, current_user: CurrentUser) -> bool:
        return current_user.is_super_admin() or current_user.has_any_permission(
            Permissions.TASKS_UPLOAD_FILES,
            Permissions.TASKS_MANAGE_ALL,
            Permissions.PLANNING_UPLOAD,
        )

    @classmethod
    def can_create_ticket(cls, current_user: CurrentUser) -> bool:
        return current_user.is_super_admin() or current_user.has_any_permission(
            Permissions.TASKS_VIEW,
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_EDIT_ASSIGNED,
            Permissions.TASKS_ASSIGN,
        )

    @classmethod
    def can_manage_milestones(cls, current_user: CurrentUser) -> bool:
        return current_user.is_super_admin() or current_user.has_any_permission(
            Permissions.MILESTONES_MANAGE,
            Permissions.PROJECTS_MANAGE_ALL,
        )

    @classmethod
    def can_search_docs(cls, current_user: CurrentUser) -> bool:
        return current_user.is_super_admin() or current_user.has_any_permission(
            Permissions.DOCS_VIEW,
            Permissions.DOCS_CREATE,
            Permissions.DOCS_EDIT,
            Permissions.DOCS_MANAGE,
        )

    @classmethod
    def can_view_analytics(cls, current_user: CurrentUser) -> bool:
        return current_user.is_super_admin() or current_user.has_any_permission(
            Permissions.REPORTS_VIEW,
            Permissions.REPORTS_VIEW_EXECUTIVE,
            Permissions.ANALYTICS_VIEW_ORG,
            Permissions.TASKS_VIEW,
            Permissions.TASKS_MANAGE_ALL,
            Permissions.TASKS_EDIT_ASSIGNED,
        )

