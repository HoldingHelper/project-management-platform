"""Command executor orchestrating PMP application services with RBAC and read-before-write."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import html
from typing import Any, Dict, List, Optional
from uuid import UUID

import structlog
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError, ValidationAppError
from app.modules.analytics import service as analytics_service
from app.modules.blockers import service as blockers_service
from app.modules.collaboration import service as collaboration_service
from app.modules.collaboration.schemas import CommentCreate
from app.modules.docs import service as docs_service
from app.modules.docs.diagram_generator import render_diagram_svg
from app.modules.projects import repository as projects_repo
from app.modules.projects import service as projects_service
from app.modules.projects.enums import Priority, ProjectMemberRole, TaskStatus
from app.modules.projects.models import Phase, Product, Project, TaskItem
from app.modules.projects.schemas import (
    MilestoneCreate,
    ProjectCreate,
    ProjectMemberCreate,
    ProjectUpdate,
    SprintBatchCreate,
    TaskCreate,
    TaskUpdate,
)
from app.modules.telegram.capabilities import TelegramCapabilityService
from app.modules.telegram.formatter import (
    format_help_message,
    format_project_overview_card,
    format_project_preview,
    format_project_sprints_view,
    format_project_summary,
    format_project_tasks_view,
    format_sprint_details,
    format_task_details,
    format_tasks_list,
)
from app.modules.telegram.resolver import EntityResolver
from app.modules.telegram.schemas import (
    AddCommentIntent,
    AddProjectMemberIntent,
    AssignTaskIntent,
    CreateDiagramIntent,
    CreateMilestoneIntent,
    CreateProjectIntent,
    CreateSprintBatchIntent,
    CreateSprintIntent,
    CreateTaskIntent,
    CreateTicketIntent,
    ListMilestonesIntent,
    ListProjectMembersIntent,
    ListProjectsIntent,
    ListSprintsIntent,
    MoveTaskIntent,
    ReadDocIntent,
    RemoveProjectMemberIntent,
    SearchDocsIntent,
    SearchTasksIntent,
    TelegramIntentUnion,
    UnknownIntent,
    UpdateProjectIntent,
    UpdateTaskDetailsIntent,
    UpdateTaskStatusIntent,
    ViewAnalyticsIntent,
    ViewCurrentSprintIntent,
    ViewProjectStatusIntent,
    ViewTaskIntent,
)
from app.modules.telegram.state import conversation_state_manager
from app.modules.telegram.ui import (
    make_analytics_menu_keyboard,
    make_confirmation_keyboard,
    make_disambiguation_keyboard,
    make_product_line_selection_keyboard,
    make_project_actions_keyboard,
    make_project_preview_keyboard,
    make_projects_list_keyboard,
    make_task_actions_keyboard,
)

logger = structlog.get_logger(__name__)


@dataclass
class ExecutionResult:
    text: str
    reply_markup: Optional[Any] = None
    extra_data: Optional[Dict[str, Any]] = None


class CommandExecutor:
    """Dispatches validated intents to existing PMP domain services."""

    def __init__(self, db: AsyncSession, current_user: CurrentUser, chat_id: str | int) -> None:
        self.db = db
        self.user = current_user
        self.chat_id = str(chat_id)

    async def execute(self, intent: TelegramIntentUnion) -> ExecutionResult:
        """Route intent to its respective domain operation."""
        try:
            if isinstance(intent, CreateTaskIntent):
                return await self._create_task(intent)
            elif isinstance(intent, ViewTaskIntent):
                return await self._view_task(intent)
            elif isinstance(intent, SearchTasksIntent):
                return await self._search_tasks(intent)
            elif isinstance(intent, UpdateTaskStatusIntent):
                return await self._update_task_status(intent)
            elif isinstance(intent, AssignTaskIntent):
                return await self._assign_task(intent)
            elif isinstance(intent, UpdateTaskDetailsIntent):
                return await self._update_task_details(intent)
            elif isinstance(intent, MoveTaskIntent):
                return await self._move_task(intent)
            elif isinstance(intent, AddCommentIntent):
                return await self._add_comment(intent)
            elif isinstance(intent, CreateProjectIntent):
                return await self._create_project(intent)
            elif isinstance(intent, ViewProjectStatusIntent):
                return await self._view_project_status(intent)
            elif isinstance(intent, ListProjectsIntent):
                return await self._list_projects(intent)
            elif isinstance(intent, UpdateProjectIntent):
                return await self._update_project(intent)
            elif isinstance(intent, AddProjectMemberIntent):
                return await self._add_project_member(intent)
            elif isinstance(intent, RemoveProjectMemberIntent):
                return await self._remove_project_member(intent)
            elif isinstance(intent, ListProjectMembersIntent):
                return await self._list_project_members(intent)
            elif isinstance(intent, CreateSprintBatchIntent):
                return await self._create_sprint_batch(intent)
            elif isinstance(intent, ListSprintsIntent):
                return await self._list_sprints(intent)
            elif isinstance(intent, ViewCurrentSprintIntent):
                return await self._view_current_sprint(intent)
            elif isinstance(intent, CreateTicketIntent):
                return await self._create_ticket(intent)
            elif isinstance(intent, CreateMilestoneIntent):
                return await self._create_milestone(intent)
            elif isinstance(intent, ListMilestonesIntent):
                return await self._list_milestones(intent)
            elif isinstance(intent, SearchDocsIntent):
                return await self._search_docs(intent)
            elif isinstance(intent, ReadDocIntent):
                return await self._read_doc(intent)
            elif isinstance(intent, CreateDiagramIntent):
                return await self._create_diagram(intent)
            elif isinstance(intent, ViewAnalyticsIntent):
                return await self._view_analytics(intent)
            elif isinstance(intent, UnknownIntent):
                lang = getattr(intent, "language", "fa")
                help_sugg = "Use /help to see examples." if lang == "en" else "برای مشاهده نمونه‌ها از /help استفاده کنید."
                prefix = "❓ I did not understand that command." if lang == "en" else "❓ متوجه دستور نشدم."
                return ExecutionResult(
                    text=f"{prefix}\n{intent.suggested_action or help_sugg}"
                )
            else:
                lang = getattr(intent, "language", "fa")
                msg = "Operation not supported." if lang == "en" else "عملیات مورد نظر پشتیبانی نمی‌شود."
                return ExecutionResult(text=msg)
        except ForbiddenError as exc:
            logger.warning("telegram_permission_denied", user_id=str(self.user.user_id), error=str(exc))
            lang = getattr(intent, "language", "fa")
            prefix = "⛔️ <b>Permission Denied:</b>" if lang == "en" else "⛔️ <b>دسترسی غیرمجاز:</b>"
            return ExecutionResult(text=f"{prefix} {exc.message}")
        except NotFoundError as exc:
            lang = getattr(intent, "language", "fa")
            prefix = "🔍 <b>Not Found:</b>" if lang == "en" else "🔍 <b>یافت نشد:</b>"
            return ExecutionResult(text=f"{prefix} {exc.message}")
        except (ValidationAppError, BusinessRuleError) as exc:
            msg = exc.message
            lang = getattr(intent, "language", "fa")
            if "Choose a project and sprint before assigning people" in msg:
                msg = (
                    "Backlog tasks must be attached to a project and sprint before assigning."
                    if lang == "en"
                    else "تسک‌های بک‌لاگ قبل از ارجاع به فرد، باید ابتدا به یک پروژه و اسپرینت مشخص متصل شوند."
                )
            elif "Tasks can only be assigned to active members of their project" in msg:
                msg = (
                    "Tasks can only be assigned to active members of the same project. Please add the user to the project first."
                    if lang == "en"
                    else "تسک فقط به اعضای فعال همان پروژه قابل ارجاع است. لطفاً ابتدا کاربر را به پروژه اضافه کنید."
                )
            prefix = "⚠️ <b>Error:</b>" if lang == "en" else "⚠️ <b>خطا:</b>"
            return ExecutionResult(text=f"{prefix} {msg}")
        except Exception as exc:
            logger.exception("telegram_execution_unhandled", error=str(exc))
            lang = getattr(intent, "language", "fa")
            msg = "❌ An unexpected error occurred while executing the operation." if lang == "en" else "❌ متاسفانه در اجرای عملیات خطایی رخ داد."
            return ExecutionResult(text=msg)

    # --- Task Operations -----------------------------------------------------

    async def _resolve_default_or_target_project(self, project_name: Optional[str]) -> Optional[Project]:
        if project_name:
            res = await EntityResolver.resolve_project(self.db, project_name, self.user)
            if res.is_exact:
                return res.entity
            return None

        # Try context
        last_pid = await conversation_state_manager.get_context(self.chat_id, "last_project_id")
        if last_pid:
            p_res = await EntityResolver.resolve_project(self.db, last_pid, self.user)
            if p_res.is_exact and p_res.entity:
                return p_res.entity

        # Pick first accessible project
        projects, _ = await projects_service.list_all_projects(self.db, 1, 50, self.user)
        if projects:
            return await projects_repo.get_project(self.db, projects[0].id)
        return None

    async def _create_task(self, intent: CreateTaskIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_create_task(self.user):
            msg = "⛔️ You do not have permission to create tasks." if intent.language == "en" else "⛔️ شما دسترسی لازم برای ایجاد تسک را ندارید."
            return ExecutionResult(text=msg)

        try:
            from app.modules.projects.product_access import visible_product_ids, require_product_access
            prod_ids = await visible_product_ids(self.db, self.user)
            if prod_ids is not None and len(prod_ids) == 0:
                msg = "⛔️ شما عضو هیچ خط محصولی (Product Line) نیستید و امکان ایجاد تسک را ندارید." if intent.language == "fa" else "⛔️ You do not have access to any product lines."
                return ExecutionResult(text=msg)
        except (AttributeError, TypeError):
            prod_ids = None

        # 1. Resolve project
        project = None
        if intent.project_name:
            res = await EntityResolver.resolve_project(self.db, intent.project_name, self.user)
            if res.is_exact and res.entity:
                project = res.entity
            elif res.is_ambiguous:
                dis_msg = "Multiple projects found with similar name. Which one did you mean?" if intent.language == "en" else "چند پروژه با نام مشابه پیدا شد. کدام پروژه مد نظر شماست؟"
                return ExecutionResult(
                    text=dis_msg,
                    reply_markup=make_disambiguation_keyboard("project", res.candidates, label_attr="name"),
                )
            else:
                not_f_msg = f"Project '{intent.project_name}' not found or access denied." if intent.language == "en" else f"پروژه‌ای با نام «{intent.project_name}» پیدا نشد یا شما به آن دسترسی ندارید."
                return ExecutionResult(text=not_f_msg)
        else:
            projects, total = await projects_service.list_all_projects(self.db, 1, 50, self.user)
            if not projects or total == 0:
                none_msg = "⛔️ No accessible projects found. You must create a project first." if intent.language == "en" else "⛔️ هیچ پروژه‌ای در دسترس شما نیست. ابتدا باید یک پروژه ایجاد کنید."
                return ExecutionResult(text=none_msg)
            elif len(projects) == 1:
                project = await projects_repo.get_project(self.db, projects[0].id)
            else:
                from app.modules.telegram.ui import make_project_selection_keyboard
                prompt_txt = "Select a project:" if intent.language == "en" else "پروژه مورد نظر را انتخاب کنید:"
                await conversation_state_manager.set_pending_intent(
                    self.chat_id,
                    intent_data=intent.model_dump(mode="json"),
                    missing_field="task_project_select",
                    prompt_text=prompt_txt,
                )
                title_preview = f" <b>«{intent.title}»</b>" if intent.title else ""
                sel_msg = (
                    f"📁 Where should task{title_preview} be created?\nPlease select a project:"
                    if intent.language == "en"
                    else f"📁 تسک{title_preview} در کدام پروژه ایجاد شود؟\nلطفاً پروژه مورد نظر را انتخاب نمایید:"
                )
                return ExecutionResult(
                    text=sel_msg,
                    reply_markup=make_project_selection_keyboard(projects, lang=intent.language),
                )

        if project and getattr(project, "product_id", None):
            try:
                await require_product_access(self.db, self.user, project.product_id)
            except ForbiddenError:
                denied_prod = "⛔️ You do not have access to the Product Line for this project." if intent.language == "en" else "⛔️ شما به خط محصول مربوط به این پروژه دسترسی ندارید."
                return ExecutionResult(text=denied_prod)
            except (AttributeError, TypeError):
                pass

        phase_id = None
        if project and not intent.is_backlog:
            if intent.in_current_sprint or intent.sprint_name:
                sp_query = intent.sprint_name or "current"
                sprint_res = await EntityResolver.resolve_sprint(self.db, project.id, sp_query)
                if sprint_res.is_exact and sprint_res.entity:
                    phase_id = sprint_res.entity.id  # type: ignore[union-attr]
            else:
                sprint_res = await EntityResolver.resolve_sprint(self.db, project.id, "current")
                if sprint_res.is_exact and sprint_res.entity:
                    phase_id = sprint_res.entity.id

        # 2. Resolve assignees
        assignee_ids: List[UUID] = []
        for name in intent.assignee_names:
            u_res = await EntityResolver.resolve_user(self.db, name)
            if u_res.is_exact:
                assignee_ids.append(u_res.entity.id)  # type: ignore[union-attr]
            elif u_res.is_ambiguous:
                dis_msg = f"Multiple users matched '{name}'. Please choose:" if intent.language == "en" else f"چند کاربر با نام «{name}» پیدا شد. لطفاً انتخاب کنید:"
                return ExecutionResult(
                    text=dis_msg,
                    reply_markup=make_disambiguation_keyboard("user", u_res.candidates, label_attr="full_name"),
                )

        # 3. Create Task via PMP service
        payload = TaskCreate(
            title=intent.title,
            phase_id=phase_id,
            assignee_user_ids=assignee_ids,
            priority=Priority(intent.priority) if intent.priority in Priority._value2member_map_ else Priority.P2,
            due_date=intent.due_date,
            description=intent.description,
            label_names=intent.labels,
        )

        task_read = await projects_service.create_task(
            self.db, payload, created_by_user_id=self.user.user_id, current_user=self.user
        )

        # Save context for follow-ups
        await conversation_state_manager.set_context(self.chat_id, "last_task_id", str(task_read.id))
        await conversation_state_manager.set_context(self.chat_id, "last_task_title", task_read.title)
        if project:
            await conversation_state_manager.set_context(self.chat_id, "last_project_id", str(project.id))

        # Retrieve freshly loaded model for presentation
        task_model = await projects_repo.get_task(self.db, task_read.id)
        formatted = format_task_details(task_model or task_read, lang=intent.language)
        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        st_val = str(getattr(task_read.status, "value", task_read.status))
        success_prefix = "✅ <b>Task created successfully:</b>" if intent.language == "en" else "✅ <b>تسک با موفقیت ایجاد شد:</b>"
        return ExecutionResult(
            text=f"{success_prefix}\n\n{formatted}",
            reply_markup=make_task_actions_keyboard(task_read.id, st_val, capabilities=caps, lang=intent.language),
        )

    async def _view_task(self, intent: ViewTaskIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_view_tasks(self.user):
            msg = "⛔️ You do not have permission to view tasks." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مشاهده تسک‌ها را ندارید."
            return ExecutionResult(text=msg)

        res = await EntityResolver.resolve_task(self.db, intent.task_id_or_title, self.user)
        if res.is_ambiguous:
            dis_msg = "Multiple tasks matched your query. Which one did you mean?" if intent.language == "en" else "چندین تسک با این مشخصات یافت شد. کدام تسک را مد نظر دارید؟"
            return ExecutionResult(
                text=dis_msg,
                reply_markup=make_disambiguation_keyboard("task", res.candidates, label_attr="title"),
            )
        if not res.is_exact or not res.entity:
            not_f_msg = f"Task '{intent.task_id_or_title}' not found." if intent.language == "en" else f"تسکی با مشخصات «{intent.task_id_or_title}» پیدا نشد."
            return ExecutionResult(text=not_f_msg)

        task = res.entity
        await conversation_state_manager.set_context(self.chat_id, "last_task_id", str(task.id))
        await conversation_state_manager.set_context(self.chat_id, "last_task_title", task.title)
        if task.phase:
            await conversation_state_manager.set_context(self.chat_id, "last_project_id", str(task.phase.project_id))

        formatted = format_task_details(task, lang=intent.language)
        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        return ExecutionResult(
            text=formatted,
            reply_markup=make_task_actions_keyboard(task.id, task.status, capabilities=caps, lang=intent.language),
        )

    async def _update_task_status(self, intent: UpdateTaskStatusIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_change_task_status(self.user):
            msg = "⛔️ You do not have permission to update task status." if intent.language == "en" else "⛔️ شما دسترسی لازم برای تغییر وضعیت تسک را ندارید."
            return ExecutionResult(text=msg)

        # 1. Resolve task
        task_ref = intent.task_id_or_title or await conversation_state_manager.get_context(self.chat_id, "last_task_id")
        if not task_ref:
            prompt_ref = "Please specify which task status to update." if intent.language == "en" else "لطفاً مشخص کنید وضعیت کدام تسک باید تغییر کند."
            return ExecutionResult(text=prompt_ref)

        res = await EntityResolver.resolve_task(self.db, task_ref, self.user)
        if res.is_ambiguous:
            dis_msg = "Multiple tasks found. Please select one:" if intent.language == "en" else "چندین تسک پیدا شد. لطفاً تسک مورد نظر را انتخاب کنید:"
            return ExecutionResult(
                text=dis_msg,
                reply_markup=make_disambiguation_keyboard("task", res.candidates, label_attr="title"),
            )
        if not res.is_exact or not res.entity:
            not_f_msg = f"Task '{task_ref}' not found." if intent.language == "en" else f"تسکی با مشخصات «{task_ref}» پیدا نشد."
            return ExecutionResult(text=not_f_msg)

        task = res.entity
        if not TelegramCapabilityService.can_change_task_status(self.user, task):
            msg = "⛔️ You do not have permission to update the status of this task." if intent.language == "en" else "⛔️ شما دسترسی لازم برای تغییر وضعیت این تسک را ندارید."
            return ExecutionResult(text=msg)

        # 2. Map status enum
        st_enum = TaskStatus._value2member_map_.get(intent.status) or TaskStatus.DONE
        updated = await projects_service.update_task_status(
            self.db, task.id, st_enum, changed_by_user_id=self.user.user_id
        )

        await conversation_state_manager.set_context(self.chat_id, "last_task_id", str(task.id))
        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        st_val = str(getattr(updated.status, "value", updated.status))
        success_msg = (
            f"✅ Task <b>«{task.title}»</b> status changed to <b>{st_val}</b>."
            if intent.language == "en"
            else f"✅ وضعیت تسک <b>«{task.title}»</b> به <b>{st_val}</b> تغییر یافت."
        )
        return ExecutionResult(
            text=success_msg,
            reply_markup=make_task_actions_keyboard(task.id, st_val, capabilities=caps, lang=intent.language),
        )

    async def _assign_task(self, intent: AssignTaskIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_assign_task(self.user):
            msg = "⛔️ You do not have permission to assign tasks." if intent.language == "en" else "⛔️ شما دسترسی لازم برای ارجاع تسک را ندارید."
            return ExecutionResult(text=msg)

        task_ref = intent.task_id_or_title or await conversation_state_manager.get_context(self.chat_id, "last_task_id")
        if not task_ref:
            prompt_ref = "Please specify which task to assign." if intent.language == "en" else "لطفاً مشخص کنید کدام تسک باید ارجاع داده شود."
            return ExecutionResult(text=prompt_ref)

        res = await EntityResolver.resolve_task(self.db, task_ref, self.user)
        if not res.is_exact or not res.entity:
            not_f_msg = f"Task '{task_ref}' not found." if intent.language == "en" else f"تسکی با مشخصات «{task_ref}» پیدا نشد."
            return ExecutionResult(text=not_f_msg)

        task = res.entity
        # Resolve target users
        target_uids: List[UUID] = []
        target_names: List[str] = []
        for name in intent.assignee_names:
            u_res = await EntityResolver.resolve_user(self.db, name)
            if u_res.is_exact and u_res.entity:
                target_uids.append(u_res.entity.id)
                target_names.append(u_res.entity.full_name or u_res.entity.username or name)
            elif u_res.is_ambiguous:
                dis_msg = f"Multiple users matched '{name}':" if intent.language == "en" else f"چند کاربر با نام «{name}» پیدا شد:"
                return ExecutionResult(
                    text=dis_msg,
                    reply_markup=make_disambiguation_keyboard("user", u_res.candidates, label_attr="full_name"),
                )
            else:
                not_f_msg = f"User '{name}' not found." if intent.language == "en" else f"کاربری با مشخصات «{name}» پیدا نشد."
                return ExecutionResult(text=not_f_msg)

        if not target_uids and not intent.is_unassign:
            no_user_msg = "No user selected for assignment." if intent.language == "en" else "کاربری برای ارجاع تسک انتخاب نشد."
            return ExecutionResult(text=no_user_msg)

        current_assignees = [a.user_id for a in task.assignees]
        if intent.is_unassign:
            new_assignees = [uid for uid in current_assignees if uid not in target_uids]
        else:
            new_assignees = list(dict.fromkeys([*current_assignees, *target_uids]))

        await projects_service.update_task(
            self.db, task.id, TaskUpdate(assignee_user_ids=new_assignees), current_user=self.user
        )

        default_names = "Selected users" if intent.language == "en" else "کاربران انتخابی"
        names_str = ", ".join(target_names) or default_names
        if intent.language == "en":
            action = "removed from assignees" if intent.is_unassign else "assigned to task"
            asgn_text = f"👤 {names_str} was successfully {action}.\nTask: <b>{task.title}</b>"
        else:
            action = "از مسئولین تسک حذف شد" if intent.is_unassign else "به عنوان مسئول تسک تعیین شد"
            asgn_text = f"👤 {names_str} با موفقیت {action}.\nتسک: <b>{task.title}</b>"
        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        status_obj = getattr(task, "status", "Ready")
        st_val = str(getattr(status_obj, "value", status_obj))
        return ExecutionResult(
            text=asgn_text,
            reply_markup=make_task_actions_keyboard(task.id, st_val, capabilities=caps, lang=intent.language),
        )

    async def _update_task_details(self, intent: UpdateTaskDetailsIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_edit_task(self.user):
            msg = "⛔️ You do not have permission to edit tasks." if intent.language == "en" else "⛔️ شما دسترسی لازم برای ویرایش تسک را ندارید."
            return ExecutionResult(text=msg)

        task_ref = intent.task_id_or_title or await conversation_state_manager.get_context(self.chat_id, "last_task_id")
        if not task_ref:
            prompt_ref = "Please specify the target task." if intent.language == "en" else "لطفاً تسک مورد نظر را مشخص کنید."
            return ExecutionResult(text=prompt_ref)

        res = await EntityResolver.resolve_task(self.db, task_ref, self.user)
        if not res.is_exact or not res.entity:
            not_f_msg = f"Task '{task_ref}' not found." if intent.language == "en" else f"تسکی با مشخصات «{task_ref}» پیدا نشد."
            return ExecutionResult(text=not_f_msg)

        task = res.entity
        if not TelegramCapabilityService.can_edit_task(self.user, task):
            msg = "⛔️ You do not have permission to edit this task." if intent.language == "en" else "⛔️ شما دسترسی لازم برای ویرایش این تسک را ندارید."
            return ExecutionResult(text=msg)

        update_payload = TaskUpdate()
        messages = []

        if intent.title:
            update_payload.title = intent.title
            task.title = intent.title
            title_lbl = f"Title updated: {intent.title}" if intent.language == "en" else f"عنوان تسک به «{intent.title}» تغییر یافت."
            messages.append(title_lbl)

        if intent.due_date:
            update_payload.due_date = intent.due_date
            due_lbl = f"Due date: {intent.due_date}" if intent.language == "en" else f"مهلت انجام (ددلاین): {intent.due_date}"
            messages.append(due_lbl)

        if intent.priority:
            update_payload.priority = Priority(intent.priority)
            prio_lbl = f"Priority: {intent.priority}" if intent.language == "en" else f"اولویت: {intent.priority}"
            messages.append(prio_lbl)

        if intent.description:
            update_payload.description = intent.description
            desc_lbl = "Description updated." if intent.language == "en" else "توضیحات به‌روز شد."
            messages.append(desc_lbl)

        if intent.add_labels:
            existing_labels = [la.label.name for la in task.label_assignments if la.label]
            update_payload.label_names = list(dict.fromkeys([*existing_labels, *intent.add_labels]))
            lbl_info = f"Labels: {', '.join(intent.add_labels)}" if intent.language == "en" else f"لیبل‌ها: {', '.join(intent.add_labels)}"
            messages.append(lbl_info)

        if intent.add_checklist_items:
            from app.modules.projects.schemas import ChecklistItemCreate
            current_items = [ChecklistItemCreate(text=c.text, is_done=c.is_done, order=c.order) for c in task.checklist_items]
            start_order = len(current_items)
            for i, text in enumerate(intent.add_checklist_items):
                current_items.append(ChecklistItemCreate(text=text, is_done=False, order=start_order + i))
            update_payload.checklist_items = current_items
            chk_info = f"{len(intent.add_checklist_items)} item(s) added to checklist." if intent.language == "en" else f"{len(intent.add_checklist_items)} مورد به چک‌لیست اضافه شد."
            messages.append(chk_info)

        await projects_service.update_task(self.db, task.id, update_payload, current_user=self.user)
        details_str = "\n• ".join(messages)
        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        status_obj = getattr(task, "status", "Ready")
        st_val = str(getattr(status_obj, "value", status_obj))
        upd_text = (
            f"✅ Task <b>«{task.title}»</b> details updated:\n• {details_str}"
            if intent.language == "en"
            else f"✅ مشخصات تسک <b>«{task.title}»</b> به‌روزرسانی شد:\n• {details_str}"
        )
        return ExecutionResult(
            text=upd_text,
            reply_markup=make_task_actions_keyboard(task.id, st_val, capabilities=caps, lang=intent.language),
        )

    async def _move_task(self, intent: MoveTaskIntent) -> ExecutionResult:
        task_ref = intent.task_id_or_title or await conversation_state_manager.get_context(self.chat_id, "last_task_id")
        if not task_ref:
            prompt_ref = "Please specify the task to move." if intent.language == "en" else "لطفاً تسک مورد نظر را مشخص کنید."
            return ExecutionResult(text=prompt_ref)

        res = await EntityResolver.resolve_task(self.db, task_ref, self.user)
        if not res.is_exact or not res.entity:
            not_f_msg = "Task not found." if intent.language == "en" else "تسک مورد نظر پیدا نشد."
            return ExecutionResult(text=not_f_msg)

        task = res.entity
        if not (TelegramCapabilityService.can_edit_task(self.user, task) or TelegramCapabilityService.can_create_task(self.user)):
            msg = "⛔️ You do not have permission to move tasks." if intent.language == "en" else "⛔️ شما دسترسی لازم برای انتقال تسک را ندارید."
            return ExecutionResult(text=msg)

        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        status_obj = getattr(task, "status", "Ready")
        st_val = str(getattr(status_obj, "value", status_obj))

        if intent.to_backlog:
            await projects_service.detach_task_from_phase(self.db, task.id)
            bk_msg = f"📦 Task <b>«{task.title}»</b> moved to Backlog." if intent.language == "en" else f"📦 تسک <b>«{task.title}»</b> به بک‌لاگ منتقل شد."
            return ExecutionResult(
                text=bk_msg,
                reply_markup=make_task_actions_keyboard(task.id, st_val, capabilities=caps, lang=intent.language),
            )

        # Move to target sprint
        if not intent.target_sprint_name_or_number:
            prompt_sp = "Please specify target sprint." if intent.language == "en" else "لطفاً اسپرینت مقصد را مشخص کنید."
            return ExecutionResult(text=prompt_sp)

        if not task.phase:
            # Need project context
            last_pid = await conversation_state_manager.get_context(self.chat_id, "last_project_id")
            if not last_pid:
                need_p_msg = "To move task to sprint, please specify its project first." if intent.language == "en" else "برای انتقال تسک به اسپرینت، ابتدا پروژه مربوطه را مشخص کنید."
                return ExecutionResult(text=need_p_msg)
            p_id = UUID(last_pid)
        else:
            p_id = task.phase.project_id

        s_res = await EntityResolver.resolve_sprint(self.db, p_id, intent.target_sprint_name_or_number)
        if not s_res.is_exact or not s_res.entity:
            not_f_sp = f"Sprint '{intent.target_sprint_name_or_number}' not found." if intent.language == "en" else f"اسپرینت «{intent.target_sprint_name_or_number}» پیدا نشد."
            return ExecutionResult(text=not_f_sp)

        target_phase = s_res.entity
        await projects_service.attach_task_to_phase(self.db, task.id, target_phase.id)
        moved_msg = (
            f"🏃 Task <b>«{task.title}»</b> moved to sprint <b>«{target_phase.name}»</b>."
            if intent.language == "en"
            else f"🏃 تسک <b>«{task.title}»</b> به اسپرینت <b>«{target_phase.name}»</b> منتقل شد."
        )
        return ExecutionResult(
            text=moved_msg,
            reply_markup=make_task_actions_keyboard(task.id, st_val, capabilities=caps, lang=intent.language),
        )
    async def _add_comment(self, intent: AddCommentIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_add_comment(self.user):
            msg = "⛔️ You do not have permission to comment on tasks." if intent.language == "en" else "⛔️ شما دسترسی لازم برای ثبت نظر را ندارید."
            return ExecutionResult(text=msg)

        task_ref = intent.task_id_or_title or await conversation_state_manager.get_context(self.chat_id, "last_task_id")
        if not task_ref:
            prompt_ref = "Please specify the task to comment on." if intent.language == "en" else "لطفاً تسک مورد نظر را برای ثبت کامنت مشخص کنید."
            return ExecutionResult(text=prompt_ref)

        res = await EntityResolver.resolve_task(self.db, task_ref, self.user)
        if not res.is_exact or not res.entity:
            not_f_msg = "Task not found." if intent.language == "en" else "تسک مورد نظر پیدا نشد."
            return ExecutionResult(text=not_f_msg)

        task = res.entity
        await collaboration_service.create_comment(
            self.db,
            current_user=self.user,
            payload=CommentCreate(
                entity_type="task",
                entity_id=task.id,
                body=intent.comment_text,
            ),
        )
        msg = f"💬 Comment added to task <b>«{task.title}»</b>." if intent.language == "en" else f"💬 نظر شما روی تسک <b>«{task.title}»</b> با موفقیت ثبت شد."
        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        status_obj = getattr(task, "status", "Ready")
        st_val = str(getattr(status_obj, "value", status_obj))
        return ExecutionResult(
            text=msg,
            reply_markup=make_task_actions_keyboard(task.id, st_val, capabilities=caps, lang=intent.language),
        )

    async def _search_tasks(self, intent: SearchTasksIntent) -> ExecutionResult:
        menu_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="📋 منوی اصلی گزینه‌ها" if intent.language == "fa" else "📋 Main Menu Options", callback_data="menu:main")]
            ]
        )
        if not TelegramCapabilityService.can_view_tasks(self.user):
            msg = "⛔️ You do not have permission to view tasks." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مشاهده تسک‌ها را ندارید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)
        if intent.is_my_tasks or getattr(intent, "assigned_to_me", False):
            raw_tasks = await projects_repo.list_tasks_by_assignee(self.db, self.user.user_id)
            accessible_tasks = []
            for t in raw_tasks:
                try:
                    from app.modules.collaboration.authorization import _require_task_access
                    await _require_task_access(self.db, self.user, t.id)
                    accessible_tasks.append(t)
                except Exception:
                    continue
            caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
            if intent.language == "en":
                header_txt = "📋 <b>My Tasks:</b>"
                if accessible_tasks:
                    sub_txt = "\nSelect any task below to view details and edit it:\n"
                else:
                    sub_txt = "\n<i>You currently have no assigned tasks.</i>"
            else:
                header_txt = "📋 <b>تسک‌های من:</b>"
                if accessible_tasks:
                    sub_txt = "\nبرای مشاهده مشخصات کامل و ویرایش، تسک مورد نظر را انتخاب کنید:\n"
                else:
                    sub_txt = "\n<i>در حال حاضر هیچ تسکی به شما اختصاص داده نشده است.</i>"

            from app.modules.telegram.ui import make_my_tasks_keyboard
            return ExecutionResult(
                text=format_tasks_list(accessible_tasks[:intent.limit], header_txt + sub_txt, lang=intent.language),
                reply_markup=make_my_tasks_keyboard(accessible_tasks[:intent.limit], capabilities=caps, lang=intent.language),
            )

        if intent.assignee_name:
            u_res = await EntityResolver.resolve_user(self.db, intent.assignee_name)
            if u_res.is_exact and u_res.entity:
                raw_tasks = await projects_repo.list_tasks_by_assignee(self.db, u_res.entity.id)
                accessible_tasks = []
                for t in raw_tasks:
                    try:
                        from app.modules.collaboration.authorization import _require_task_access
                        await _require_task_access(self.db, self.user, t.id)
                        accessible_tasks.append(t)
                    except Exception:
                        continue
                name = u_res.entity.full_name or u_res.entity.username or intent.assignee_name
                header_txt = f"📋 <b>Tasks of {name}:</b>" if intent.language == "en" else f"📋 <b>تسک‌های {name}:</b>"
                return ExecutionResult(
                    text=format_tasks_list(accessible_tasks[:intent.limit], header_txt, lang=intent.language),
                    reply_markup=menu_kb,
                )
            not_f_usr = f"User '{intent.assignee_name}' not found." if intent.language == "en" else f"کاربر «{intent.assignee_name}» پیدا نشد."
            return ExecutionResult(text=not_f_usr, reply_markup=menu_kb)

        if intent.is_overdue:
            # Query overdue tasks assigned to me or in project
            today = datetime.now(timezone.utc).date()
            stmt = (
                select(TaskItem)
                .where(
                    TaskItem.due_date < today,
                    TaskItem.status.notin_(["Done", "Cancelled", "Archived"]),
                )
                .limit(intent.limit)
            )
            res = await self.db.execute(stmt)
            tasks = res.scalars().all()
            accessible_tasks = []
            for t in tasks:
                try:
                    from app.modules.collaboration.authorization import _require_task_access
                    await _require_task_access(self.db, self.user, t.id)
                    accessible_tasks.append(t)
                except Exception:
                    continue
            header_txt = "⚠️ <b>Overdue Tasks:</b>" if intent.language == "en" else "⚠️ <b>تسک‌های عقب‌افتاده:</b>"
            return ExecutionResult(
                text=format_tasks_list(accessible_tasks, header_txt, lang=intent.language),
                reply_markup=menu_kb,
            )

        if intent.in_current_sprint:
            project = await self._resolve_default_or_target_project(intent.project_name)
            if not project:
                no_p_msg = "No project specified to view current sprint." if intent.language == "en" else "پروژه‌ای برای مشاهده اسپرینت فعلی مشخص نشده است."
                return ExecutionResult(text=no_p_msg, reply_markup=menu_kb)
            s_res = await EntityResolver.resolve_sprint(self.db, project.id, "current")
            if s_res.is_exact and s_res.entity:
                tasks = await projects_repo.list_tasks_by_phase(self.db, s_res.entity.id)
                accessible_tasks = []
                for t in tasks:
                    try:
                        from app.modules.collaboration.authorization import _require_task_access
                        await _require_task_access(self.db, self.user, t.id)
                        accessible_tasks.append(t)
                    except Exception:
                        continue
                header_txt = (
                    f"🏃 <b>Current Sprint Tasks ({s_res.entity.name}):</b>"
                    if intent.language == "en"
                    else f"🏃 <b>تسک‌های اسپرینت جاری ({s_res.entity.name}):</b>"
                )
                return ExecutionResult(
                    text=format_tasks_list(accessible_tasks, header_txt, lang=intent.language),
                    reply_markup=menu_kb,
                )
            no_sp_msg = "No active sprint found in this project." if intent.language == "en" else "اسپرینت فعالی در این پروژه یافت نشد."
            return ExecutionResult(text=no_sp_msg, reply_markup=menu_kb)

        # Text keyword search
        query = intent.query or ""
        stmt = select(TaskItem).where(TaskItem.title.ilike(f"%{query}%")).limit(intent.limit)
        res = await self.db.execute(stmt)
        tasks = res.scalars().all()
        accessible_tasks = []
        for t in tasks:
            try:
                from app.modules.collaboration.authorization import _require_task_access
                await _require_task_access(self.db, self.user, t.id)
                accessible_tasks.append(t)
            except Exception:
                continue
        header_txt = f"🔍 <b>Search results for '{query}':</b>" if intent.language == "en" else f"🔍 <b>نتایج جستجوی «{query}»:</b>"
        return ExecutionResult(
            text=format_tasks_list(accessible_tasks, header_txt, lang=intent.language),
            reply_markup=menu_kb,
        )

    # --- Project Operations --------------------------------------------------

    async def _create_project(self, intent: CreateProjectIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_create_project(self.user):
            msg = "⛔️ You do not have permission to create projects." if intent.language == "en" else "⛔️ شما دسترسی لازم برای ساخت پروژه را ندارید."
            return ExecutionResult(text=msg)

        from app.modules.telegram.wizard import get_user_member_products
        products = await get_user_member_products(self.db, self.user)

        if not products:
            msg = "⛔️ شما عضو هیچ خط محصولی (Product Line) نیستید و امکان ساخت پروژه را ندارید." if intent.language == "fa" else "⛔️ You are not a member of any product line and cannot create a project."
            return ExecutionResult(text=msg)

        # Case 1: Product line was explicitly specified by the user
        if intent.product_name:
            p_name_lower = intent.product_name.strip().lower()
            matched_prod = next((p for p in products if p.name.strip().lower() == p_name_lower), None)
            if not matched_prod:
                matched_prod = next((p for p in products if p_name_lower in p.name.strip().lower()), None)

            if not matched_prod:
                msg = f"خط محصول «{intent.product_name}» یافت نشد یا شما به آن دسترسی ندارید." if intent.language == "fa" else f"Product line '{intent.product_name}' not found or inaccessible."
                return ExecutionResult(text=msg)

            # Store draft confirmation and show Preview
            token = await conversation_state_manager.create_confirmation(
                self.chat_id,
                action_type="create_project",
                description=f"Create project '{intent.name}' in '{matched_prod.name}'",
                payload={
                    "name": intent.name,
                    "product_id": str(matched_prod.id),
                    "product_name": matched_prod.name,
                    "description": intent.description,
                    "priority": intent.priority or "P2",
                    "start_date": intent.start_date.isoformat() if intent.start_date else None,
                    "end_date": intent.end_date.isoformat() if intent.end_date else None,
                    "lang": intent.language,
                },
                ttl_seconds=600,
            )
            preview_text = format_project_preview(
                name=intent.name,
                product_name=matched_prod.name,
                description=intent.description,
                priority=intent.priority,
                start_date=intent.start_date,
                end_date=intent.end_date,
                lang=intent.language,
            )
            return ExecutionResult(
                text=preview_text,
                reply_markup=make_project_preview_keyboard(token, lang=intent.language),
            )

        # Case 2: Product line was not specified
        # If user only has exactly 1 accessible product line -> auto-select it and show Preview
        if len(products) == 1:
            auto_prod = products[0]
            token = await conversation_state_manager.create_confirmation(
                self.chat_id,
                action_type="create_project",
                description=f"Create project '{intent.name}' in '{auto_prod.name}'",
                payload={
                    "name": intent.name,
                    "product_id": str(auto_prod.id),
                    "product_name": auto_prod.name,
                    "description": intent.description,
                    "priority": intent.priority or "P2",
                    "start_date": intent.start_date.isoformat() if intent.start_date else None,
                    "end_date": intent.end_date.isoformat() if intent.end_date else None,
                    "lang": intent.language,
                },
                ttl_seconds=600,
            )
            preview_text = format_project_preview(
                name=intent.name,
                product_name=auto_prod.name,
                description=intent.description,
                priority=intent.priority,
                start_date=intent.start_date,
                end_date=intent.end_date,
                lang=intent.language,
            )
            return ExecutionResult(
                text=preview_text,
                reply_markup=make_project_preview_keyboard(token, lang=intent.language),
            )

        # If user has > 1 accessible product lines -> ask user to choose via inline buttons
        token = await conversation_state_manager.create_confirmation(
            self.chat_id,
            action_type="create_project",
            description=f"Create project '{intent.name}'",
            payload={
                "name": intent.name,
                "product_id": None,
                "product_name": None,
                "description": intent.description,
                "priority": intent.priority or "P2",
                "start_date": intent.start_date.isoformat() if intent.start_date else None,
                "end_date": intent.end_date.isoformat() if intent.end_date else None,
                "lang": intent.language,
            },
            ttl_seconds=600,
        )
        prompt_text = (
            f"🏢 پروژه «<b>{intent.name}</b>» مربوط به کدام Product Line است؟"
            if intent.language == "fa"
            else f"🏢 Which Product Line does project '<b>{intent.name}</b>' belong to?"
        )
        return ExecutionResult(
            text=prompt_text,
            reply_markup=make_product_line_selection_keyboard(products, token, lang=intent.language),
        )

    async def _get_project_card_data(self, project_id: UUID) -> tuple[Any, str, str, List[str]]:
        overview = await projects_service.get_project_overview(self.db, project_id)
        proj = overview.project
        product_name = ""
        if getattr(proj, "product_id", None):
            product = await projects_repo.get_product(self.db, proj.product_id)
            if product:
                product_name = product.name

        members_raw = await projects_repo.list_project_members(self.db, project_id)
        from app.modules.projects import membership
        people = await membership.project_people(self.db, project_id)
        people_map = {p.id: (p.full_name or p.email or p.username) for p in people}

        manager_name = ""
        for m in members_raw:
            if m.role in ("ProjectManager", "Owner", "Lead"):
                manager_name = people_map.get(m.user_id, "")
                if manager_name:
                    break

        members_names = [people_map[p.id] for p in people if p.id in people_map]
        return overview, product_name, manager_name, members_names

    async def _view_project_status(self, intent: ViewProjectStatusIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_view_projects(self.user):
            msg = "⛔️ You do not have permission to view projects." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مشاهده پروژه‌ها را ندارید."
            return ExecutionResult(text=msg)

        res = await EntityResolver.resolve_project(self.db, intent.project_name, self.user)
        if not res.is_exact or not res.entity:
            msg = f"Project '{intent.project_name}' not found or inaccessible." if intent.language == "en" else f"پروژه «{intent.project_name}» پیدا نشد یا شما به آن دسترسی ندارید."
            return ExecutionResult(text=msg)

        project = res.entity
        overview, product_name, manager_name, members_names = await self._get_project_card_data(project.id)
        formatted = format_project_overview_card(
            overview,
            product_name=product_name,
            manager_name=manager_name,
            members_names=members_names,
            lang=intent.language,
        )
        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        return ExecutionResult(
            text=formatted,
            reply_markup=make_project_actions_keyboard(project.id, capabilities=caps, lang=intent.language),
        )

    async def _list_projects(self, intent: ListProjectsIntent) -> ExecutionResult:
        menu_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="📋 منوی اصلی گزینه‌ها" if intent.language == "fa" else "📋 Main Menu Options", callback_data="menu:main")]
            ]
        )
        if not TelegramCapabilityService.can_view_projects(self.user):
            msg = "⛔️ You do not have permission to view projects." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مشاهده پروژه‌ها را ندارید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        projects, _ = await projects_service.list_all_projects(self.db, 1, 50, self.user)
        if not projects:
            msg = "No projects available." if intent.language == "en" else "هیچ پروژه‌ای در دسترس شما نیست."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        if intent.language == "en":
            lines = [
                "🏢 <b>Active Projects:</b>",
                "Select a project below to view details, sprints, and tasks or edit it:\n",
            ]
            for i, p in enumerate(projects[:15], 1):
                prog = f"{p.progress_percentage:.0f}%" if p.progress_percentage else "0%"
                lines.append(f"{i}. <b>{p.name}</b> — Progress: {prog} ({p.status})")
        else:
            lines = [
                "🏢 <b>لیست پروژه‌های فعال:</b>",
                "برای مشاهده جزئیات کامل، اسپرینت‌ها، تسک‌ها و ویرایش، پروژه مورد نظر را انتخاب کنید:\n",
            ]
            for i, p in enumerate(projects[:15], 1):
                prog = f"{p.progress_percentage:.0f}%" if p.progress_percentage else "0%"
                lines.append(f"{i}. <b>{p.name}</b> — پیشرفت: {prog} ({p.status})")

        return ExecutionResult(
            text="\n".join(lines),
            reply_markup=make_projects_list_keyboard(projects[:15], capabilities=caps, lang=intent.language),
        )

    async def _update_project(self, intent: UpdateProjectIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_manage_project(self.user):
            msg = "⛔️ You do not have permission to manage projects." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مدیریت پروژه‌ها را ندارید."
            return ExecutionResult(text=msg)

        res = await EntityResolver.resolve_project(self.db, intent.project_name, self.user)
        if not res.is_exact or not res.entity:
            msg = f"Project '{intent.project_name}' not found or inaccessible." if intent.language == "en" else f"پروژه «{intent.project_name}» پیدا نشد یا شما به آن دسترسی ندارید."
            return ExecutionResult(text=msg)

        project = res.entity
        try:
            await projects_service.require_project_manage_access(self.db, project.id, self.user)
        except (AttributeError, TypeError):
            pass
        update_payload = ProjectUpdate()
        if intent.name:
            update_payload.name = intent.name
        if intent.description:
            update_payload.description = intent.description
        if intent.status:
            from app.modules.projects.enums import ProjectStatus
            update_payload.status = ProjectStatus(intent.status)
        if intent.priority:
            from app.modules.projects.enums import Priority
            update_payload.priority = Priority(intent.priority)
        if intent.budget is not None:
            update_payload.budget = intent.budget

        await projects_service.update_project(self.db, project.id, update_payload)
        await self.db.commit()

        overview, product_name, manager_name, members_names = await self._get_project_card_data(project.id)
        card_text = format_project_overview_card(
            overview,
            product_name=product_name,
            manager_name=manager_name,
            members_names=members_names,
            lang=intent.language,
        )
        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        success_msg = (
            f"✅ Project <b>'{project.name}'</b> updated successfully.\n\n{card_text}"
            if intent.language == "en"
            else f"✅ پروژه <b>«{project.name}»</b> با موفقیت به‌روزرسانی شد.\n\n{card_text}"
        )
        return ExecutionResult(
            text=success_msg,
            reply_markup=make_project_actions_keyboard(project.id, capabilities=caps, lang=intent.language),
        )

    # --- Project Membership --------------------------------------------------

    async def _add_project_member(self, intent: AddProjectMemberIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_manage_project_members(self.user):
            msg = "⛔️ You do not have permission to manage project members." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مدیریت اعضای پروژه را ندارید."
            return ExecutionResult(text=msg)

        p_res = await EntityResolver.resolve_project(self.db, intent.project_name, self.user)
        if not p_res.is_exact or not p_res.entity:
            msg = f"Project '{intent.project_name}' not found or inaccessible." if intent.language == "en" else f"پروژه «{intent.project_name}» پیدا نشد یا شما به آن دسترسی ندارید."
            return ExecutionResult(text=msg)

        try:
            await projects_service.require_project_admin(self.db, p_res.entity.id, self.user)
        except (AttributeError, TypeError):
            pass

        u_res = await EntityResolver.resolve_user(self.db, intent.user_name)
        if not u_res.is_exact or not u_res.entity:
            msg = f"User '{intent.user_name}' not found." if intent.language == "en" else f"کاربر «{intent.user_name}» پیدا نشد."
            return ExecutionResult(text=msg)

        role_enum = ProjectMemberRole.DEVELOPER
        for r in ProjectMemberRole:
            if r.value.lower() == intent.role.lower():
                role_enum = r
                break

        await projects_service.add_project_member(
            self.db,
            p_res.entity.id,
            ProjectMemberCreate(user_id=u_res.entity.id, role=role_enum),
        )
        caps = await TelegramCapabilityService.resolve_user_capabilities(self.db, self.user)
        success_msg = (
            f"✅ User <b>{u_res.entity.full_name}</b> added to project <b>'{p_res.entity.name}'</b> as {role_enum.value}."
            if intent.language == "en"
            else f"✅ کاربر <b>{u_res.entity.full_name}</b> با نقش {role_enum.value} به پروژه <b>«{p_res.entity.name}»</b> افزوده شد."
        )
        return ExecutionResult(
            text=success_msg,
            reply_markup=make_project_actions_keyboard(p_res.entity.id, capabilities=caps, lang=intent.language),
        )

    async def _remove_project_member(self, intent: RemoveProjectMemberIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_manage_project_members(self.user):
            msg = "⛔️ You do not have permission to manage project members." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مدیریت اعضای پروژه را ندارید."
            return ExecutionResult(text=msg)

        p_res = await EntityResolver.resolve_project(self.db, intent.project_name, self.user)
        if not p_res.is_exact or not p_res.entity:
            msg = f"Project '{intent.project_name}' not found or inaccessible." if intent.language == "en" else f"پروژه «{intent.project_name}» پیدا نشد یا شما به آن دسترسی ندارید."
            return ExecutionResult(text=msg)

        try:
            await projects_service.require_project_admin(self.db, p_res.entity.id, self.user)
        except (AttributeError, TypeError):
            pass

        u_res = await EntityResolver.resolve_user(self.db, intent.user_name)
        if not u_res.is_exact or not u_res.entity:
            msg = f"User '{intent.user_name}' not found." if intent.language == "en" else f"کاربر «{intent.user_name}» پیدا نشد."
            return ExecutionResult(text=msg)

        await projects_service.remove_project_member(self.db, p_res.entity.id, u_res.entity.id)
        msg = (
            f"🗑 User <b>{u_res.entity.full_name}</b> removed from project <b>'{p_res.entity.name}'</b>."
            if intent.language == "en"
            else f"🗑 کاربر <b>{u_res.entity.full_name}</b> از پروژه <b>«{p_res.entity.name}»</b> حذف شد."
        )
        return ExecutionResult(text=msg)

    async def _list_project_members(self, intent: ListProjectMembersIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_view_projects(self.user):
            msg = "⛔️ You do not have permission to view project members." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مشاهده اعضای پروژه را ندارید."
            return ExecutionResult(text=msg)

        p_res = await EntityResolver.resolve_project(self.db, intent.project_name, self.user)
        if not p_res.is_exact or not p_res.entity:
            msg = f"Project '{intent.project_name}' not found or inaccessible." if intent.language == "en" else f"پروژه «{intent.project_name}» پیدا نشد یا شما به آن دسترسی ندارید."
            return ExecutionResult(text=msg)

        try:
            from app.modules.collaboration.authorization import _require_project_access
            await _require_project_access(self.db, self.user, p_res.entity.id)
        except (AttributeError, TypeError):
            pass

        members = await projects_service.list_project_members(self.db, p_res.entity.id)
        if not members:
            msg = f"Project '{p_res.entity.name}' has no members." if intent.language == "en" else f"پروژه «{p_res.entity.name}» عضوی ندارد."
            return ExecutionResult(text=msg)

        from app.modules.projects import membership
        users = await membership.project_people(self.db, p_res.entity.id)
        u_by_id = {u.id: u for u in users}

        if intent.language == "en":
            lines = [f"👥 <b>Members of project '{p_res.entity.name}':</b>\n"]
            for i, m in enumerate(members, 1):
                u = u_by_id.get(m.user_id)
                name = (
                    getattr(u, "full_name", None)
                    or (f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip() if u else "")
                    or getattr(u, "email", None)
                    or str(m.user_id)[:8]
                )
                lines.append(f"{i}. <b>{name}</b> — Role: {m.role}")
        else:
            lines = [f"👥 <b>اعضای پروژه «{p_res.entity.name}»:</b>\n"]
            for i, m in enumerate(members, 1):
                u = u_by_id.get(m.user_id)
                name = (
                    getattr(u, "full_name", None)
                    or (f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip() if u else "")
                    or getattr(u, "email", None)
                    or str(m.user_id)[:8]
                )
                lines.append(f"{i}. <b>{name}</b> — نقش: {m.role}")

        return ExecutionResult(text="\n".join(lines))

    # --- Sprints Operations --------------------------------------------------

    async def _create_sprint_batch(self, intent: CreateSprintBatchIntent) -> ExecutionResult:
        if not TelegramCapabilityService.can_create_sprint(self.user):
            msg = "⛔️ You do not have permission to create sprints." if intent.language == "en" else "⛔️ شما دسترسی لازم برای ایجاد اسپرینت را ندارید."
            return ExecutionResult(text=msg)

        # Respect PMP duration rules: exactly 3, 7, or 14 days
        duration = intent.duration_days
        if duration not in (3, 7, 14):
            if intent.language == "en":
                return ExecutionResult(
                    text="❌ Invalid sprint duration. PMP only supports 3, 7, or 14-day sprints."
                )
            return ExecutionResult(
                text="❌ طول دوره اسپرینت نامعتبر است. سیستم PMP فقط از دوره‌های ۳، ۷ و ۱۴ روزه پشتیبانی می‌کند."
            )

        try:
            from app.modules.projects.product_access import visible_product_ids
            prod_ids = await visible_product_ids(self.db, self.user)
            if prod_ids is not None and len(prod_ids) == 0:
                msg = "⛔️ You do not have access to any product lines." if intent.language == "en" else "⛔️ شما عضو هیچ خط محصولی (Product Line) نیستید و امکان ایجاد اسپرینت را ندارید."
                return ExecutionResult(text=msg)
        except (AttributeError, TypeError):
            prod_ids = None

        project = None
        if intent.project_name:
            p_res = await EntityResolver.resolve_project(self.db, intent.project_name, self.user)
            if p_res.is_exact and p_res.entity:
                project = p_res.entity
            elif p_res.is_ambiguous:
                dis_msg = (
                    "Multiple projects found with similar name. Which one did you mean?"
                    if intent.language == "en"
                    else "چند پروژه با نام مشابه پیدا شد. کدام پروژه مد نظر شماست؟"
                )
                from app.modules.telegram.ui import make_disambiguation_keyboard
                return ExecutionResult(
                    text=dis_msg,
                    reply_markup=make_disambiguation_keyboard("project", p_res.candidates, label_attr="name"),
                )
            else:
                msg = (
                    f"Project '{intent.project_name}' not found or inaccessible."
                    if intent.language == "en"
                    else f"پروژه «{intent.project_name}» پیدا نشد یا شما به آن دسترسی ندارید."
                )
                return ExecutionResult(text=msg)
        else:
            # 1. Try context: did user recently interact with a project?
            last_pid = await conversation_state_manager.get_context(self.chat_id, "last_project_id")
            if last_pid:
                p_res = await EntityResolver.resolve_project(self.db, last_pid, self.user)
                if p_res.is_exact and p_res.entity:
                    project = p_res.entity

            # 2. If not found in context, inspect accessible projects
            if not project:
                projects, total = await projects_service.list_all_projects(self.db, 1, 50, self.user)
                if not projects or total == 0:
                    none_msg = (
                        "⛔️ No accessible projects found. You must create a project first."
                        if intent.language == "en"
                        else "⛔️ هیچ پروژه‌ای در دسترس شما نیست. ابتدا باید یک پروژه ایجاد کنید."
                    )
                    return ExecutionResult(text=none_msg)
                elif len(projects) == 1:
                    project = await projects_repo.get_project(self.db, projects[0].id)
                else:
                    from app.modules.telegram.ui import make_project_selection_keyboard
                    prompt_txt = (
                        "Select a project to create sprints:"
                        if intent.language == "en"
                        else "پروژه مورد نظر برای ایجاد اسپرینت‌ها را انتخاب کنید:"
                    )
                    await conversation_state_manager.set_pending_intent(
                        self.chat_id,
                        intent_data=intent.model_dump(mode="json"),
                        missing_field="sprint_batch_project_select",
                        prompt_text=prompt_txt,
                    )
                    return ExecutionResult(
                        text=prompt_txt,
                        reply_markup=make_project_selection_keyboard(projects, lang=intent.language),
                    )

        try:
            await projects_service.require_project_manage_access(self.db, project.id, self.user)
        except (AttributeError, TypeError):
            pass

        start_d = intent.start_date or (datetime.now(timezone.utc).date() + timedelta(days=1))
        batch_payload = SprintBatchCreate(
            name=intent.name_prefix or "Sprint",
            count=min(intent.count, 52),
            duration_days=duration,
            start_date=start_d,
        )

        sprints = await projects_service.create_sprint_batch(self.db, project.id, batch_payload)
        await conversation_state_manager.set_context(self.chat_id, "last_project_id", str(project.id))
        if intent.language == "en":
            sp_names = ", ".join(s.name for s in sprints[:3])
            return ExecutionResult(
                text=f"🚀 <b>Created {len(sprints)} sprints ({duration} days each)</b> for project '{project.name}' starting {start_d}.\n{sp_names}..."
            )
        return ExecutionResult(
            text=f"🚀 <b>{len(sprints)} اسپرینت {duration} روزه</b> برای پروژه «{project.name}» از تاریخ {start_d} با موفقیت ایجاد شد."
        )

    async def _list_sprints(self, intent: ListSprintsIntent) -> ExecutionResult:
        menu_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="📋 منوی اصلی گزینه‌ها" if intent.language == "fa" else "📋 Main Menu Options", callback_data="menu:main")]
            ]
        )
        if not TelegramCapabilityService.can_view_sprints(self.user):
            msg = "⛔️ You do not have permission to view sprints." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مشاهده اسپرینت‌ها را ندارید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        project = await self._resolve_default_or_target_project(intent.project_name)
        if not project:
            msg = "No project specified to view sprints." if intent.language == "en" else "پروژه‌ای برای مشاهده اسپرینت‌ها مشخص نشده است."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        phases = await projects_repo.list_phases_by_project(self.db, project.id)
        sprints = [p for p in phases if p.is_sprint]
        if not sprints:
            msg = f"Project '{project.name}' has no sprints." if intent.language == "en" else f"پروژه «{project.name}» هیچ اسپرینتی ندارد."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        if intent.language == "en":
            lines = [f"🏃 <b>Sprints for project '{project.name}':</b>\n"]
            for s in sprints:
                status_badge = "🟢 Active" if s.status == "in-progress" else ("⚪️ Completed" if s.status == "completed" else "⏳ Planned")
                lines.append(f"• <b>{s.name}</b> ({s.duration_days} days) — {status_badge}")
        else:
            lines = [f"🏃 <b>اسپرینت‌های پروژه «{project.name}»:</b>\n"]
            for s in sprints:
                status_badge = "🟢 فعال" if s.status == "in-progress" else ("⚪️ انجام شده" if s.status == "completed" else "⏳ برنامه‌ریزی شده")
                lines.append(f"• <b>{s.name}</b> ({s.duration_days} روزه) — {status_badge}")

        return ExecutionResult(text="\n".join(lines), reply_markup=menu_kb)

    async def _view_current_sprint(self, intent: ViewCurrentSprintIntent) -> ExecutionResult:
        menu_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="📋 منوی اصلی گزینه‌ها" if intent.language == "fa" else "📋 Main Menu Options", callback_data="menu:main")]
            ]
        )
        if not TelegramCapabilityService.can_view_sprints(self.user):
            msg = "⛔️ You do not have permission to view sprints." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مشاهده اسپرینت‌ها را ندارید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        project = await self._resolve_default_or_target_project(intent.project_name)
        if not project:
            msg = "No project specified to view current sprint." if intent.language == "en" else "پروژه‌ای برای مشاهده اسپرینت فعلی مشخص نشده است."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        s_res = await EntityResolver.resolve_sprint(self.db, project.id, "current")
        if not s_res.is_exact or not s_res.entity:
            msg = f"No active sprint found in project '{project.name}'." if intent.language == "en" else f"هیچ اسپرینت فعالی در پروژه «{project.name}» پیدا نشد."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        sprint = s_res.entity
        tasks = await projects_repo.list_tasks_by_phase(self.db, sprint.id)
        formatted = format_sprint_details(sprint, task_count=len(tasks), lang=intent.language)
        return ExecutionResult(text=formatted, reply_markup=menu_kb)

    # --- Tickets -------------------------------------------------------------

    async def _create_ticket(self, intent: CreateTicketIntent) -> ExecutionResult:
        menu_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="📋 منوی اصلی گزینه‌ها" if intent.language == "fa" else "📋 Main Menu Options", callback_data="menu:main")]
            ]
        )
        if not TelegramCapabilityService.can_create_ticket(self.user):
            msg = "⛔️ You do not have permission to create tickets." if intent.language == "en" else "⛔️ شما دسترسی لازم برای ثبت تیکت را ندارید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        # Resolve target teams or users
        team_ids: List[UUID] = []
        user_ids: List[UUID] = []

        for tname in intent.recipient_team_names:
            t_res = await EntityResolver.resolve_team(self.db, tname)
            if t_res.is_exact and t_res.entity:
                team_ids.append(t_res.entity.id)

        for uname in intent.recipient_user_names:
            u_res = await EntityResolver.resolve_user(self.db, uname)
            if u_res.is_exact and u_res.entity:
                user_ids.append(u_res.entity.id)

        if not team_ids and not user_ids:
            # Fallback to team QA if mentioned or default team
            team_res = await EntityResolver.resolve_team(self.db, "QA")
            if team_res.is_exact and team_res.entity:
                team_ids.append(team_res.entity.id)
            else:
                msg = "Please specify recipient team or user for the ticket." if intent.language == "en" else "لطفاً تیم یا کاربر دریافت‌کننده تیکت را مشخص کنید."
                return ExecutionResult(text=msg, reply_markup=menu_kb)

        ticket_payload = TaskCreate(
            title=intent.title,
            description=intent.description,
            is_ticket=True,
            ticket_recipient_team_ids=team_ids,
            ticket_recipient_user_ids=user_ids,
            priority=Priority(intent.priority) if intent.priority in Priority._value2member_map_ else Priority.P2,
        )

        ticket = await projects_service.create_task(
            self.db, ticket_payload, created_by_user_id=self.user.user_id, current_user=self.user
        )

        await conversation_state_manager.set_context(self.chat_id, "last_task_id", str(ticket.id))
        target_info = ""
        if team_ids:
            target_info += (
                f"👥 Recipient teams: <b>{len(team_ids)} teams</b>\n"
                if intent.language == "en"
                else f"👥 تیم‌های دریافت‌کننده: <b>{len(team_ids)} تیم</b>\n"
            )
        if user_ids:
            target_info += (
                f"👤 Recipient users: <b>{len(user_ids)} users</b>\n"
                if intent.language == "en"
                else f"👤 افراد دریافت‌کننده: <b>{len(user_ids)} نفر</b>\n"
            )

        if intent.language == "en":
            resp_text = (
                f"🎫 <b>Ticket successfully dispatched:</b>\n\n"
                f"📌 Title: <b>{ticket.title}</b>\n"
                f"{target_info}"
                f"ID: <code>#{str(ticket.id)[:8]}</code>\n\n"
                f"<i>Notification sent and task added to recipients' dashboards.</i>"
            )
        else:
            resp_text = (
                f"🎫 <b>تیکت با موفقیت ثبت و ارسال شد:</b>\n\n"
                f"📌 عنوان: <b>{ticket.title}</b>\n"
                f"{target_info}"
                f"شناسه: <code>#{str(ticket.id)[:8]}</code>\n\n"
                f"<i>اعلان برای دریافت‌کنندگان ارسال گردید و به داشبورد کاری آن‌ها اضافه شد.</i>"
            )
        return ExecutionResult(
            text=resp_text,
            reply_markup=menu_kb,
        )

    # --- Milestones ----------------------------------------------------------

    async def _create_milestone(self, intent: CreateMilestoneIntent) -> ExecutionResult:
        menu_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="📋 منوی اصلی گزینه‌ها" if intent.language == "fa" else "📋 Main Menu Options", callback_data="menu:main")]
            ]
        )
        if not TelegramCapabilityService.can_manage_milestones(self.user):
            msg = "⛔️ You do not have permission to manage milestones." if intent.language == "en" else "⛔️ شما دسترسی لازم برای ایجاد مایلستون را ندارید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        project = await self._resolve_default_or_target_project(intent.project_name)
        if not project:
            msg = "Please specify the project for the milestone." if intent.language == "en" else "لطفاً پروژه مربوط به مایلستون را مشخص کنید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        try:
            await projects_service.require_project_manage_access(self.db, project.id, self.user)
        except (AttributeError, TypeError):
            pass

        payload = MilestoneCreate(
            project_id=project.id,
            name=intent.title,
            due_date=intent.due_date,
            description=intent.description,
        )
        milestone = await projects_service.create_milestone(
            self.db, payload, created_by_user_id=self.user.user_id
        )
        success_msg = (
            f"🚩 Milestone <b>'{milestone.name}'</b> created successfully for project '{project.name}'."
            if intent.language == "en"
            else f"🚩 مایلستون <b>«{milestone.name}»</b> برای پروژه «{project.name}» با موفقیت ایجاد شد."
        )
        return ExecutionResult(
            text=success_msg,
            reply_markup=menu_kb,
        )

    async def _list_milestones(self, intent: ListMilestonesIntent) -> ExecutionResult:
        menu_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="📋 منوی اصلی گزینه‌ها" if intent.language == "fa" else "📋 Main Menu Options", callback_data="menu:main")]
            ]
        )
        if not TelegramCapabilityService.can_view_projects(self.user):
            msg = "⛔️ You do not have permission to view milestones." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مشاهده مایلستون‌ها را ندارید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        project = await self._resolve_default_or_target_project(intent.project_name)
        if not project:
            msg = "Please specify the project." if intent.language == "en" else "لطفاً پروژه را مشخص کنید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        try:
            from app.modules.collaboration.authorization import _require_project_access
            await _require_project_access(self.db, self.user, project.id)
        except (AttributeError, TypeError):
            pass

        milestones = await projects_service.list_milestones(self.db, project.id)
        if not milestones:
            msg = f"No milestones found in project '{project.name}'." if intent.language == "en" else f"هیچ مایلستونی در پروژه «{project.name}» ثبت نشده است."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        if intent.language == "en":
            lines = [f"🚩 <b>Milestones for project '{project.name}':</b>\n"]
            for i, m in enumerate(milestones, 1):
                due = f" (Due: {m.due_date})" if m.due_date else ""
                status = "✅ Completed" if m.completed_at else "⏳ In Progress"
                lines.append(f"{i}. <b>{m.name}</b>{due} — {status}")
        else:
            lines = [f"🚩 <b>مایلستون‌های پروژه «{project.name}»:</b>\n"]
            for i, m in enumerate(milestones, 1):
                due = f" (مهلت: {m.due_date})" if m.due_date else ""
                status = "✅ تکمیل شده" if m.completed_at else "⏳ در حال انجام"
                lines.append(f"{i}. <b>{m.name}</b>{due} — {status}")

        return ExecutionResult(text="\n".join(lines), reply_markup=menu_kb)

    # --- Docs & Diagrams -----------------------------------------------------

    async def _search_docs(self, intent: SearchDocsIntent) -> ExecutionResult:
        menu_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="📋 منوی اصلی گزینه‌ها" if intent.language == "fa" else "📋 Main Menu Options", callback_data="menu:main")]
            ]
        )
        if not TelegramCapabilityService.can_search_docs(self.user):
            msg = "⛔️ You do not have permission to search docs." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مشاهده مستندات را ندارید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        pages = await docs_service.search_pages(self.db, self.user, intent.query)
        if not pages:
            msg = f"No documents found matching '{intent.query}'." if intent.language == "en" else f"مستندی مطابق با «{intent.query}» پیدا نشد."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        if intent.language == "en":
            lines = [f"📚 <b>Documents matching '{intent.query}':</b>\n"]
        else:
            lines = [f"📚 <b>مستندات مرتبط با «{intent.query}»:</b>\n"]
        for i, p in enumerate(pages[:8], 1):
            lines.append(f"{i}. <b>{p.title}</b>")

        return ExecutionResult(text="\n".join(lines), reply_markup=menu_kb)

    async def _read_doc(self, intent: ReadDocIntent) -> ExecutionResult:
        menu_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="📋 منوی اصلی گزینه‌ها" if intent.language == "fa" else "📋 Main Menu Options", callback_data="menu:main")]
            ]
        )
        if not TelegramCapabilityService.can_search_docs(self.user):
            msg = "⛔️ You do not have permission to access docs." if intent.language == "en" else "⛔️ شما دسترسی لازم برای مشاهده مستندات را ندارید."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        pages = await docs_service.search_pages(self.db, self.user, intent.title_or_slug)
        if not pages:
            msg = f"Document '{intent.title_or_slug}' not found." if intent.language == "en" else f"مستندی با نام «{intent.title_or_slug}» پیدا نشد."
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        page = await docs_service.get_page(self.db, self.user, pages[0].id)
        content_preview = (page.content or "")[:600]
        suffix = "View in web for full content." if intent.language == "en" else "برای مشاهده کامل به وب مراجعه فرمایید."
        return ExecutionResult(
            text=f"📄 <b>{page.title}</b>\n\n{content_preview}\n\n<i>... {suffix}</i>",
            reply_markup=menu_kb,
        )

    async def _create_diagram(self, intent: CreateDiagramIntent) -> ExecutionResult:
        svg_content = render_diagram_svg(
            intent.diagram_type,
            intent.title,
            spec={"description": intent.description or intent.title},
        )
        msg = (
            f"📊 <b>{intent.diagram_type.title()} diagram created:</b>\n<i>'{intent.title}'</i>"
            if intent.language == "en"
            else f"📊 <b>دیاگرام {intent.diagram_type.title()} ایجاد شد:</b>\n<i>«{intent.title}»</i>"
        )
        return ExecutionResult(
            text=msg,
            extra_data={"svg_content": svg_content, "filename": f"{intent.diagram_type}_diagram.svg"},
        )

    # --- Analytics & Dashboard -----------------------------------------------

    async def _view_analytics(self, intent: ViewAnalyticsIntent) -> ExecutionResult:
        lang = intent.language or "fa"
        if not TelegramCapabilityService.can_view_analytics(self.user):
            msg = (
                "⛔️ شما دسترسی لازم برای مشاهده آمار و گزارشات را ندارید."
                if lang == "fa"
                else "⛔️ You do not have permission to view analytics."
            )
            menu_kb = InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text="📋 منوی اصلی" if lang == "fa" else "📋 Main Menu", callback_data="menu:main")]]
            )
            return ExecutionResult(text=msg, reply_markup=menu_kb)

        can_exec = self.user.is_super_admin() or self.user.has_any_permission(
            "reports.view_executive", "analytics.view_org", "reports.view"
        )

        rep_type = (intent.report_type or "personal").lower().strip()
        if rep_type in ("refresh", "my_work", "mywork", "dashboard"):
            rep_type = "personal"

        # -------------------------------------------------------------
        # 1. REPORT: HEALTH (Project Health Report)
        # -------------------------------------------------------------
        if rep_type == "health":
            health = await analytics_service.get_project_health(self.db)
            delayed_count = len(health.delayed)
            blocked_count = len(health.blocked)

            if lang == "fa":
                lines = [
                    "🩺 <b>گزارش جامع سلامت پروژه‌ها</b>\n",
                    f"• پروژه‌های فعال: <b>{health.active}</b>",
                    f"• پروژه‌های تکمیل‌شده: <b>{health.completed}</b>",
                    f"• پروژه‌های در انتظار / تعلیق: <b>{health.on_hold}</b>",
                    f"• پروژه‌های آغازنشده: <b>{health.not_started}</b>",
                    f"• پروژه‌های دارای تاخیر: <b>{delayed_count}</b>",
                    f"• پروژه‌های مسدود: <b>{blocked_count}</b>",
                ]
                if health.delayed:
                    lines.append("\n⚠️ <b>پروژه‌های دارای تاخیر:</b>")
                    for p in health.delayed[:4]:
                        p_name = p.get("name", "") if isinstance(p, dict) else getattr(p, "name", str(p))
                        lines.append(f"  • {html.escape(str(p_name))}")
                if health.blocked:
                    lines.append("\n🚫 <b>پروژه‌های مسدودشده:</b>")
                    for p in health.blocked[:4]:
                        p_name = p.get("name", "") if isinstance(p, dict) else getattr(p, "name", str(p))
                        lines.append(f"  • {html.escape(str(p_name))}")
            else:
                lines = [
                    "🩺 <b>Project Health Report</b>\n",
                    f"• Active Projects: <b>{health.active}</b>",
                    f"• Completed Projects: <b>{health.completed}</b>",
                    f"• On Hold: <b>{health.on_hold}</b>",
                    f"• Not Started: <b>{health.not_started}</b>",
                    f"• Delayed Projects: <b>{delayed_count}</b>",
                    f"• Blocked Projects: <b>{blocked_count}</b>",
                ]
                if health.delayed:
                    lines.append("\n⚠️ <b>Delayed Projects:</b>")
                    for p in health.delayed[:4]:
                        p_name = p.get("name", "") if isinstance(p, dict) else getattr(p, "name", str(p))
                        lines.append(f"  • {html.escape(str(p_name))}")
                if health.blocked:
                    lines.append("\n🚫 <b>Blocked Projects:</b>")
                    for p in health.blocked[:4]:
                        p_name = p.get("name", "") if isinstance(p, dict) else getattr(p, "name", str(p))
                        lines.append(f"  • {html.escape(str(p_name))}")

            kb = make_analytics_menu_keyboard(report_type="health", can_view_exec=can_exec, lang=lang)
            return ExecutionResult(text="\n".join(lines), reply_markup=kb)

        # -------------------------------------------------------------
        # 2. REPORT: PENDING (Needs Me / Pending On Me)
        # -------------------------------------------------------------
        if rep_type == "pending":
            try:
                pending_work = await blockers_service.get_user_pending_work(self.db, self.user.user_id)
                pending_items = pending_work.pending_on_me
            except Exception:
                pending_items = []

            if not pending_items:
                msg = (
                    "🎉 <b>تبریک! هیچ کاری در انتظار اقدام شما نیست.</b>\n"
                    "تمام بررسی‌ها و موانع متصل به شما مرتفع شده‌اند و کارها کاملاً به‌روز هستند."
                    if lang == "fa"
                    else "🎉 <b>Nothing pending on you!</b>\nYou are all caught up on reviews and blockers."
                )
                kb = make_analytics_menu_keyboard(report_type="pending", can_view_exec=can_exec, lang=lang)
                return ExecutionResult(text=msg, reply_markup=kb)

            task_actions = []
            if lang == "fa":
                lines = [
                    f"⚡️ <b>کارهای در انتظار اقدام شما ({len(pending_items)} مورد)</b>",
                    "موارد زیر نیازمند بررسی، اقدام یا رفع مانع توسط شما هستند:\n",
                ]
                for it in pending_items[:6]:
                    icon = "🚫 مانع" if it.kind == "blocker" else "🔍 بررسی تسک"
                    short_title = html.escape(it.title)
                    lines.append(f"• {icon}: <b>{short_title}</b>")
                    lines.append(f"  ⚡️ اولویت: <code>{it.priority}</code>")
                    if it.detail:
                        lines.append(f"  ℹ️ <i>{html.escape(it.detail)}</i>")
                    if it.kind != "blocker" and it.id:
                        task_actions.append((str(it.id), it.title))
            else:
                lines = [
                    f"⚡️ <b>Pending On You ({len(pending_items)} items)</b>",
                    "These items are waiting for your review, action, or unblocking:\n",
                ]
                for it in pending_items[:6]:
                    icon = "🚫 Blocker" if it.kind == "blocker" else "🔍 Review"
                    short_title = html.escape(it.title)
                    lines.append(f"• {icon}: <b>{short_title}</b>")
                    lines.append(f"  ⚡️ Priority: <code>{it.priority}</code>")
                    if it.detail:
                        lines.append(f"  ℹ️ <i>{html.escape(it.detail)}</i>")
                    if it.kind != "blocker" and it.id:
                        task_actions.append((str(it.id), it.title))

            kb = make_analytics_menu_keyboard(
                report_type="pending",
                task_action_ids=task_actions,
                can_view_exec=can_exec,
                lang=lang,
            )
            return ExecutionResult(text="\n".join(lines), reply_markup=kb)

        # -------------------------------------------------------------
        # 3. REPORT: LATE (My Late Tasks)
        # -------------------------------------------------------------
        if rep_type == "late":
            dash = await analytics_service.get_personal_dashboard(self.db, self.user.user_id)
            late_tasks = dash.late_tasks

            if not late_tasks:
                msg = (
                    "👏 <b>عالی است! هیچ تسک دارای تاخیری ندارید.</b>\n"
                    "تمامی تسک‌های شما طبق ددلاین و زمان‌بندی پیش می‌روند."
                    if lang == "fa"
                    else "👏 <b>Great! You have no late tasks.</b>\nAll your tasks are on schedule."
                )
                kb = make_analytics_menu_keyboard(report_type="late", can_view_exec=can_exec, lang=lang)
                return ExecutionResult(text=msg, reply_markup=kb)

            task_actions = []
            if lang == "fa":
                lines = [
                    f"⏰ <b>کارهای دارای تاخیر شما ({len(late_tasks)} تسک)</b>",
                    "موعد سررسید این تسک‌ها گذشته است؛ لطفاً وضعیت آن‌ها را تعیین فرمایید:\n",
                ]
                for t in late_tasks[:6]:
                    tid = t.get("task_id", "")
                    title = t.get("title", "")
                    due = t.get("due_date", "")
                    lines.append(f"• 🔴 <b>{html.escape(title)}</b>\n  ⏰ سررسید: <code>{due}</code> (گذشته)")
                    if tid:
                        task_actions.append((tid, title))
            else:
                lines = [
                    f"⏰ <b>My Late Tasks ({len(late_tasks)} tasks)</b>",
                    "These tasks are past their deadline. Please update or complete them:\n",
                ]
                for t in late_tasks[:6]:
                    tid = t.get("task_id", "")
                    title = t.get("title", "")
                    due = t.get("due_date", "")
                    lines.append(f"• 🔴 <b>{html.escape(title)}</b>\n  ⏰ Due Date: <code>{due}</code> (Past due)")
                    if tid:
                        task_actions.append((tid, title))

            kb = make_analytics_menu_keyboard(
                report_type="late",
                task_action_ids=task_actions,
                can_view_exec=can_exec,
                lang=lang,
            )
            return ExecutionResult(text="\n".join(lines), reply_markup=kb)

        # -------------------------------------------------------------
        # 4. REPORT: UPCOMING (Upcoming Deadlines in next 7 days)
        # -------------------------------------------------------------
        if rep_type == "upcoming":
            dash = await analytics_service.get_personal_dashboard(self.db, self.user.user_id)
            upcoming = dash.upcoming_deadlines

            if not upcoming:
                msg = (
                    "📅 در ۷ روز آینده تسکی با موعد سررسید فوری برای شما ثبت نشده است."
                    if lang == "fa"
                    else "📅 No upcoming task deadlines in the next 7 days."
                )
                kb = make_analytics_menu_keyboard(report_type="upcoming", can_view_exec=can_exec, lang=lang)
                return ExecutionResult(text=msg, reply_markup=kb)

            task_actions = []
            if lang == "fa":
                lines = [
                    f"📅 <b>مهلت‌های ۷ روز آینده ({len(upcoming)} تسک)</b>",
                    "تسک‌های دارای سررسید در بازه ۷ روز پیش‌رو:\n",
                ]
                for t in upcoming[:6]:
                    tid = t.get("task_id", "")
                    title = t.get("title", "")
                    due = t.get("due_date", "")
                    lines.append(f"• 🔹 <b>{html.escape(title)}</b>\n  ⏰ سررسید: <code>{due}</code>")
                    if tid:
                        task_actions.append((tid, title))
            else:
                lines = [
                    f"📅 <b>Upcoming Deadlines (Next 7 days: {len(upcoming)})</b>",
                    "Tasks due within the upcoming 7-day window:\n",
                ]
                for t in upcoming[:6]:
                    tid = t.get("task_id", "")
                    title = t.get("title", "")
                    due = t.get("due_date", "")
                    lines.append(f"• 🔹 <b>{html.escape(title)}</b>\n  ⏰ Due: <code>{due}</code>")
                    if tid:
                        task_actions.append((tid, title))

            kb = make_analytics_menu_keyboard(
                report_type="upcoming",
                task_action_ids=task_actions,
                can_view_exec=can_exec,
                lang=lang,
            )
            return ExecutionResult(text="\n".join(lines), reply_markup=kb)

        # -------------------------------------------------------------
        # 5. REPORT: SPRINT (My Sprint Stats & Delivery Details)
        # -------------------------------------------------------------
        if rep_type == "sprint":
            dash = await analytics_service.get_personal_dashboard(self.db, self.user.user_id)
            if lang == "fa":
                lines = [
                    "🏃 <b>جزئیات اسپرینت و عملکرد تحویل من</b>\n",
                    f"• 🎯 سرعت من (Story Points تکمیل‌شده): <b>{dash.velocity_points_completed} پوینت</b>",
                    f"• ⏱ ساعت‌های ثبت‌شده (Hours Logged): <b>{dash.hours_logged:.1f} ساعت</b>",
                    f"• 📊 درصد موفقیت و تکمیل تسک‌ها: <b>{dash.completion_rate_percent:.1f}%</b>",
                    f"• 📋 کل تسک‌های محول‌شده: <b>{dash.assigned_tasks_total}</b>",
                    f"• 🟡 تسک‌های در حال انجام: <b>{dash.in_progress_tasks}</b>",
                    f"• ✅ تسک‌های تکمیل‌شده: <b>{dash.completed_tasks}</b>",
                    f"• 🚫 تسک‌های مسدود: <b>{dash.blocked_tasks}</b>",
                    f"• ⚠️ تسک‌های نیازمند توجه: <b>{dash.attention_required_tasks}</b>",
                    f"• 🗓 تسک‌های بدون زمان‌بندی: <b>{dash.unscheduled_open_tasks}</b>",
                ]
            else:
                lines = [
                    "🏃 <b>My Sprint Delivery & Velocity Details</b>\n",
                    f"• 🎯 My Velocity (Completed Story Points): <b>{dash.velocity_points_completed} pts</b>",
                    f"• ⏱ Hours Logged: <b>{dash.hours_logged:.1f}h</b>",
                    f"• 📊 Task Completion Rate: <b>{dash.completion_rate_percent:.1f}%</b>",
                    f"• 📋 Total Assigned Tasks: <b>{dash.assigned_tasks_total}</b>",
                    f"• 🟡 In Progress: <b>{dash.in_progress_tasks}</b>",
                    f"• ✅ Completed: <b>{dash.completed_tasks}</b>",
                    f"• 🚫 Blocked: <b>{dash.blocked_tasks}</b>",
                    f"• ⚠️ Attention Required: <b>{dash.attention_required_tasks}</b>",
                    f"• 🗓 Unscheduled Open Tasks: <b>{dash.unscheduled_open_tasks}</b>",
                ]

            kb = make_analytics_menu_keyboard(report_type="sprint", can_view_exec=can_exec, lang=lang)
            return ExecutionResult(text="\n".join(lines), reply_markup=kb)

        # -------------------------------------------------------------
        # 6. REPORT: EXECUTIVE & AT RISK PROJECTS
        # -------------------------------------------------------------
        if rep_type in ("executive", "exec", "at_risk"):
            if not can_exec:
                msg = (
                    "⛔️ مشاهده داشبورد سازمانی نیازمند مجوز مدیریت است."
                    if lang == "fa"
                    else "⛔️ Executive dashboard requires manager permissions."
                )
                kb = make_analytics_menu_keyboard(report_type="personal", lang=lang)
                return ExecutionResult(text=msg, reply_markup=kb)

            exec_dash = await analytics_service.get_executive_dashboard(self.db)
            health = await analytics_service.get_project_health(self.db)

            if lang == "fa":
                lines = [
                    "🏢 <b>داشبورد سازمانی و وضعیت پروژه‌ها</b>\n",
                    f"• 📁 پروژه‌های فعال: <b>{exec_dash.active_projects}</b>",
                    f"• ✅ پروژه‌های تکمیل‌شده: <b>{exec_dash.completed_projects}</b>",
                    f"• ⏰ پروژه‌های دارای تاخیر: <b>{exec_dash.delayed_projects}</b>",
                    f"• 🚫 پروژه‌های مسدود: <b>{exec_dash.blocked_projects}</b>",
                ]

                at_risk = list(health.delayed) + list(health.blocked)
                if at_risk:
                    lines.append("\n⚠️ <b>پروژه‌های در معرض ریسک و مسدود (At Risk):</b>")
                    for p in at_risk[:5]:
                        st_name = "مسدود" if p in health.blocked else "دارای تاخیر"
                        p_name = p.get("name", "") if isinstance(p, dict) else getattr(p, "name", str(p))
                        lines.append(f"  • {html.escape(str(p_name))} <i>({st_name})</i>")
            else:
                lines = [
                    "🏢 <b>Executive Dashboard & Project Health</b>\n",
                    f"• 📁 Active Projects: <b>{exec_dash.active_projects}</b>",
                    f"• ✅ Completed Projects: <b>{exec_dash.completed_projects}</b>",
                    f"• ⏰ Delayed Projects: <b>{exec_dash.delayed_projects}</b>",
                    f"• 🚫 Blocked Projects: <b>{exec_dash.blocked_projects}</b>",
                ]

                at_risk = list(health.delayed) + list(health.blocked)
                if at_risk:
                    lines.append("\n⚠️ <b>At-Risk / Blocked Projects:</b>")
                    for p in at_risk[:5]:
                        st_name = "Blocked" if p in health.blocked else "Delayed"
                        p_name = p.get("name", "") if isinstance(p, dict) else getattr(p, "name", str(p))
                        lines.append(f"  • {html.escape(str(p_name))} <i>({st_name})</i>")

            kb = make_analytics_menu_keyboard(report_type="exec", can_view_exec=True, lang=lang)
            return ExecutionResult(text="\n".join(lines), reply_markup=kb)

        # -------------------------------------------------------------
        # 7. REPORT: WORKLOAD (Team Workload)
        # -------------------------------------------------------------
        if rep_type == "workload":
            if not can_exec:
                msg = "⛔️ دسترسی به بار کاری تیم را ندارید." if lang == "fa" else "⛔️ Access denied."
                return ExecutionResult(text=msg, reply_markup=make_analytics_menu_keyboard(lang=lang))

            workload_items = await analytics_service.get_workload(self.db)
            from app.modules.identity.models import User
            lines = ["👥 <b>توزیع بار کاری تیم (Team Workload)</b>\n"] if lang == "fa" else ["👥 <b>Team Workload Distribution</b>\n"]
            for w in workload_items[:6]:
                u = await self.db.get(User, w.user_id) if getattr(w, "user_id", None) else None
                u_name = (u.full_name or u.email) if u else str(getattr(w, "user_id", ""))[:8]
                if lang == "fa":
                    lines.append(
                        f"• <b>{html.escape(u_name)}</b>:\n"
                        f"  تسک‌های باز: <b>{w.open_tasks}</b> | در حال انجام: <b>{w.in_progress}</b> | موانع: <b>{w.open_blockers}</b>"
                    )
                else:
                    lines.append(
                        f"• <b>{html.escape(u_name)}</b>:\n"
                        f"  Open Tasks: <b>{w.open_tasks}</b> | In Progress: <b>{w.in_progress}</b> | Blockers: <b>{w.open_blockers}</b>"
                    )

            kb = make_analytics_menu_keyboard(report_type="exec", can_view_exec=True, lang=lang)
            return ExecutionResult(text="\n".join(lines), reply_markup=kb)

        # -------------------------------------------------------------
        # 8. PRIMARY REPORT: MY WORK HUB & PERSONAL KPI PULSE
        # -------------------------------------------------------------
        dash = await analytics_service.get_personal_dashboard(self.db, self.user.user_id)
        try:
            pending_work = await blockers_service.get_user_pending_work(self.db, self.user.user_id)
            pending_items = pending_work.pending_on_me
        except Exception:
            pending_items = []

        pending_cnt = len(pending_items)
        late_cnt = len(dash.late_tasks)
        upcoming_cnt = len(dash.upcoming_deadlines)
        velocity_pts = int(dash.velocity_points_completed)

        focus_score = 100 if (pending_cnt + late_cnt == 0) else max(0, 100 - (pending_cnt + late_cnt) * 12)
        action_pressure = pending_cnt + late_cnt

        if lang == "fa":
            badge = "🟢 عالی" if focus_score >= 80 else ("🟡 خوب" if focus_score >= 50 else "🔴 تحت فشار")
            u_name = html.escape(self.user.full_name or self.user.email)
            text = (
                f"📊 <b>کارهای من (My Work Hub)</b>\n"
                f"سلام <b>{u_name}</b>، خلاصه وضعیت کاری و عملکرد شما:\n\n"
                "📈 <b>کارت‌های کلیدی عملکرد:</b>\n"
                f"• 🏃 <b>سرعت من (My Velocity):</b> <b>{velocity_pts}</b> پوینت تکمیل‌شده\n"
                f"• ⚡️ <b>نیاز به اقدام من:</b> <b>{pending_cnt}</b> مورد (ریویوها و موانع)\n"
                f"• ⏰ <b>کارهای دارای تاخیر:</b> <b>{late_cnt}</b> تسک معوق\n"
                f"• 📅 <b>مهلت‌های ۷ روز آینده:</b> <b>{upcoming_cnt}</b> تسک پیش‌رو\n\n"
                "🎯 <b>نبض تمرکز و کارایی (KPI Pulse):</b>\n"
                f"• امتیاز تمرکز: <b>{focus_score}%</b> ({badge})\n"
                f"• سیگنال تکمیل: <b>{velocity_pts} پوینت</b>\n"
                f"• فشار کاری معوقات: <b>{action_pressure} مورد</b>\n\n"
                "🏃 <b>وضعیت اسپرینت و تسک‌های جاری:</b>\n"
                f"• کل تسک‌های محول‌شده: <b>{dash.assigned_tasks_total}</b>\n"
                f"• در حال انجام: <b>{dash.in_progress_tasks}</b>\n"
                f"• تکمیل‌شده: <b>{dash.completed_tasks}</b> (نرخ تکمیل: <b>{dash.completion_rate_percent:.1f}%</b>)\n"
                f"• تسک‌های مسدود: <b>{dash.blocked_tasks}</b>\n"
                f"• نیازمند توجه: <b>{dash.attention_required_tasks}</b>\n"
                f"• ساعت‌های ثبت‌شده: <b>{dash.hours_logged:.1f} ساعت</b>"
            )
        else:
            badge = "🟢 Excellent" if focus_score >= 80 else ("🟡 Good" if focus_score >= 50 else "🔴 High Pressure")
            u_name = html.escape(self.user.full_name or self.user.email)
            text = (
                f"📊 <b>My Work & Personal Dashboard</b>\n"
                f"Hello <b>{u_name}</b>, your delivery and performance overview:\n\n"
                "📈 <b>Key Performance Cards:</b>\n"
                f"• 🏃 <b>My Velocity:</b> <b>{velocity_pts}</b> points completed\n"
                f"• ⚡️ <b>Needs Me (Pending):</b> <b>{pending_cnt}</b> (reviews & blockers)\n"
                f"• ⏰ <b>My Late Work:</b> <b>{late_cnt}</b> overdue task(s)\n"
                f"• 📅 <b>Upcoming (7 days):</b> <b>{upcoming_cnt}</b> deadline(s)\n\n"
                "🎯 <b>My KPI Pulse:</b>\n"
                f"• Focus Score: <b>{focus_score}%</b> ({badge})\n"
                f"• Completion Signal: <b>{velocity_pts} pts</b>\n"
                f"• Action Pressure: <b>{action_pressure} item(s)</b>\n\n"
                "🏃 <b>My Sprint & Tasks:</b>\n"
                f"• Total Assigned: <b>{dash.assigned_tasks_total}</b>\n"
                f"• In Progress: <b>{dash.in_progress_tasks}</b>\n"
                f"• Completed: <b>{dash.completed_tasks}</b> ({dash.completion_rate_percent:.1f}%)\n"
                f"• Blocked: <b>{dash.blocked_tasks}</b>\n"
                f"• Attention Required: <b>{dash.attention_required_tasks}</b>\n"
                f"• Hours Logged: <b>{dash.hours_logged:.1f}h</b>"
            )

        kb = make_analytics_menu_keyboard(
            report_type="personal",
            pending_count=pending_cnt,
            late_count=late_cnt,
            upcoming_count=upcoming_cnt,
            can_view_exec=can_exec,
            lang=lang,
        )
        return ExecutionResult(text=text, reply_markup=kb)
