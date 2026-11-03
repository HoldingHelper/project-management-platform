"""Deterministic Persian & English natural language intent extractor."""

from __future__ import annotations

import re
from typing import List, Optional

from app.modules.telegram.dates import normalize_digits, parse_relative_date
from app.modules.telegram.schemas import (
    AddCommentIntent,
    AddProjectMemberIntent,
    AssignTaskIntent,
    CancelIntent,
    CreateDiagramIntent,
    CreateMilestoneIntent,
    CreateProjectIntent,
    CreateSprintBatchIntent,
    CreateSprintIntent,
    CreateTaskIntent,
    CreateTicketIntent,
    HelpIntent,
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


def _detect_language(text: str) -> str:
    """Detect whether message is primarily Persian or English."""
    persian_chars = len(re.findall(r"[\u0600-\u06FF]", text))
    return "fa" if persian_chars > 0 else "en"


def _clean_quotes(text: str) -> str:
    return text.strip(" '\"`«»“”")


def parse_deterministic_intent(text: str) -> Optional[TelegramIntentUnion]:
    """Parse common Persian & English commands deterministically using high-precision patterns."""
    raw = text.strip()
    if not raw:
        return None

    lang = _detect_language(raw)
    normalized = normalize_digits(raw)
    lower = normalized.lower()

    # --- Cancellation --------------------------------------------------------
    if lower in ("cancel", "/cancel", "لغو", "انصراف", "کنسل"):
        return CancelIntent(raw_query=raw, language=lang)

    # --- Help ----------------------------------------------------------------
    if lower in ("help", "/help", "راهنما", "کمک"):
        return HelpIntent(raw_query=raw, language=lang)

    # --- My Work & Dashboard / Slash /mywork --------------------------------
    if any(phrase in lower for phrase in ("/mywork", "mywork", "/my_work", "my_work", "کارهای من", "کار های من", "my work", "داشبورد من", "داشبورد", "my dashboard")):
        return ViewAnalyticsIntent(report_type="personal", raw_query=raw, language=lang)

    # --- List My Tasks / Slash /mytasks -------------------------------------
    if any(phrase in lower for phrase in ("/mytasks", "mytasks", "تسک‌های من", "تسکهای من", "وظایف من", "show my tasks", "my tasks")):
        return SearchTasksIntent(is_my_tasks=True, raw_query=raw, language=lang)

    # --- Overdue Tasks -------------------------------------------------------
    if any(phrase in lower for phrase in ("تسک‌های عقب‌افتاده", "تسکهای عقب افتاده", "تسک‌های تاخیر خورده", "overdue tasks", "show overdue tasks")):
        return SearchTasksIntent(is_overdue=True, raw_query=raw, language=lang)

    # --- Tasks in Current Sprint ---------------------------------------------
    if any(phrase in lower for phrase in ("تسک‌های اسپرینت فعلی", "تسکهای اسپرینت فعلی", "تسک‌های اسپرینت جاری", "tasks in current sprint", "tasks in the current sprint")):
        return SearchTasksIntent(in_current_sprint=True, raw_query=raw, language=lang)

    # --- List Projects / Slash /projects ------------------------------------
    if lower in ("/projects", "projects", "پروژه‌ها", "پروژه ها", "لیست پروژه‌ها", "لیست پروژه ها", "show projects", "list projects"):
        return ListProjectsIntent(raw_query=raw, language=lang)

    # --- Project Members -----------------------------------------------------
    pm_match = re.search(r"(?:اعضای\s+پروژه|اعضا\s+پروژه|project\s+members\s+for|show\s+project\s+members|members\s+of\s+project)\s+([A-Za-z0-9_\-آ-ی]+)", normalized, re.IGNORECASE)
    if pm_match:
        return ListProjectMembersIntent(project_name=_clean_quotes(pm_match.group(1)), raw_query=raw, language=lang)

    # --- Add User to Project -------------------------------------------------
    # e.g., "علی را به پروژه Atlas اضافه کن" or "Add Ali to project Atlas"
    add_mem_fa = re.search(r"(.+?)\s+را\s+به\s+پروژه\s+([A-Za-z0-9_\-آ-ی]+)\s+اضافه\s+کن", normalized)
    if add_mem_fa:
        user_name = _clean_quotes(add_mem_fa.group(1))
        project_name = _clean_quotes(add_mem_fa.group(2))
        return AddProjectMemberIntent(project_name=project_name, user_name=user_name, raw_query=raw, language=lang)

    add_mem_en = re.search(r"add\s+(.+?)\s+to\s+project\s+([A-Za-z0-9_\-آ-ی]+)", normalized, re.IGNORECASE)
    if add_mem_en:
        user_name = _clean_quotes(add_mem_en.group(1))
        project_name = _clean_quotes(add_mem_en.group(2))
        return AddProjectMemberIntent(project_name=project_name, user_name=user_name, raw_query=raw, language=lang)

    # --- Remove User from Project --------------------------------------------
    # e.g., "علی را از پروژه Atlas حذف کن" or "Remove Ali from project Atlas"
    rem_mem_fa = re.search(r"(.+?)\s+را\s+از\s+پروژه\s+([A-Za-z0-9_\-آ-ی]+)\s+حذف\s+کن", normalized)
    if rem_mem_fa:
        user_name = _clean_quotes(rem_mem_fa.group(1))
        project_name = _clean_quotes(rem_mem_fa.group(2))
        return RemoveProjectMemberIntent(project_name=project_name, user_name=user_name, raw_query=raw, language=lang)

    rem_mem_en = re.search(r"remove\s+(.+?)\s+from\s+project\s+([A-Za-z0-9_\-آ-ی]+)", normalized, re.IGNORECASE)
    if rem_mem_en:
        user_name = _clean_quotes(rem_mem_en.group(1))
        project_name = _clean_quotes(rem_mem_en.group(2))
        return RemoveProjectMemberIntent(project_name=project_name, user_name=user_name, raw_query=raw, language=lang)

    # --- Project Status / Details --------------------------------------------
    # e.g., "وضعیت پروژه Atlas را بگو" or "Show project Atlas status" or "وضعیت پروژه Atlas"
    ps_match = re.search(r"(?:وضعیت\s+پروژه\s+([A-Za-z0-9_\-آ-ی]+)|show\s+project\s+([A-Za-z0-9_\-آ-ی]+)\s+status|project\s+([A-Za-z0-9_\-آ-ی]+)\s+status)", normalized, re.IGNORECASE)
    if ps_match:
        p_name = _clean_quotes(ps_match.group(1) or ps_match.group(2) or ps_match.group(3))
        return ViewProjectStatusIntent(project_name=p_name, raw_query=raw, language=lang)

    # --- Create Project (with or without Product Line) ------------------------
    # e.g. "یک پروژه به نام Atlas در خط محصول Mobile بساز" or "Atlas را در Product Line Mobile بساز"
    is_sprint_kw = ("اسپرینت" in normalized or "sprint" in lower)
    if not is_sprint_kw:
        cp_prod_fa_1 = re.search(
            r"(?:یک\s+)?پروژه\s+(?:به\s+نام\s+|نام\s+)?([A-Za-z0-9_\-آ-ی]+)(?:\s+را)?\s+(?:در|توی)\s+(?:خط\s+محصول|product\s+line|محصول)\s+([A-Za-z0-9_\-آ-ی]+)\s*(?:بساز|ایجاد\s+کن)?",
            normalized,
            re.IGNORECASE,
        )
        if cp_prod_fa_1:
            p_name = _clean_quotes(cp_prod_fa_1.group(1))
            prod_line = _clean_quotes(cp_prod_fa_1.group(2))
            return CreateProjectIntent(name=p_name, product_name=prod_line, raw_query=raw, language=lang)

        cp_prod_fa_2 = re.search(
            r"([A-Za-z0-9_\-آ-ی]+)\s+را\s+(?:در|توی)\s+(?:خط\s+محصول|product\s+line|محصول)\s+([A-Za-z0-9_\-آ-ی]+)\s*(?:بساز|ایجاد\s+کن)?",
            normalized,
            re.IGNORECASE,
        )
        if cp_prod_fa_2:
            p_name = _clean_quotes(cp_prod_fa_2.group(1))
            prod_line = _clean_quotes(cp_prod_fa_2.group(2))
            return CreateProjectIntent(name=p_name, product_name=prod_line, raw_query=raw, language=lang)

        cp_prod_en = re.search(
            r"create\s+(?:a\s+)?project\s+(?:named\s+|called\s+)?([A-Za-z0-9_\-آ-ی]+)\s+in\s+(?:product\s+line\s+|product\s+)?([A-Za-z0-9_\-آ-ی]+)",
            normalized,
            re.IGNORECASE,
        )
        if cp_prod_en:
            p_name = _clean_quotes(cp_prod_en.group(1))
            prod_line = _clean_quotes(cp_prod_en.group(2))
            return CreateProjectIntent(name=p_name, product_name=prod_line, raw_query=raw, language=lang)

        # Without Product Line:
        # e.g. "یک پروژه به نام Atlas بساز", "پروژه Atlas را بساز", "پروژه به نام نگین بساز"
        cp_fa = re.search(
            r"(?:یک\s+)?پروژه\s+(?:به\s+نام\s+|نام\s+)?([A-Za-z0-9_\-آ-ی]+)(?:\s+را)?\s*(?:بساز|ایجاد\s+کن)",
            normalized,
            re.IGNORECASE,
        )
        if cp_fa:
            return CreateProjectIntent(name=_clean_quotes(cp_fa.group(1)), raw_query=raw, language=lang)

        cp_en = re.search(
            r"create\s+(?:a\s+)?project\s+(?:named\s+|called\s+)?([A-Za-z0-9_\-آ-ی]+)",
            normalized,
            re.IGNORECASE,
        )
        if cp_en:
            return CreateProjectIntent(name=_clean_quotes(cp_en.group(1)), raw_query=raw, language=lang)

    # --- Update Project Description ------------------------------------------
    # e.g. "توضیحات پروژه Atlas را به ... تغییر بده" or "Update project Atlas description to ..."
    up_fa = re.search(r"توضیحات\s+پروژه\s+([A-Za-z0-9_\-آ-ی]+)\s+(?:را\s+به\s+|رو\s+به\s+)(.+?)(?:\s+تغییر\s+بده|\s+به‌روز\s+کن|\s+آپدیت\s+کن)?$", normalized)
    if up_fa:
        return UpdateProjectIntent(project_name=_clean_quotes(up_fa.group(1)), description=_clean_quotes(up_fa.group(2)), raw_query=raw, language=lang)

    up_en = re.search(r"update\s+(?:the\s+)?project\s+([A-Za-z0-9_\-آ-ی]+)\s+description\s+to\s+(.+)", normalized, re.IGNORECASE)
    if up_en:
        return UpdateProjectIntent(project_name=_clean_quotes(up_en.group(1)), description=_clean_quotes(up_en.group(2)), raw_query=raw, language=lang)

    # --- Sprints Batch Creation ----------------------------------------------
    # e.g. "۵ اسپرینت ۷ روزه برای Atlas بساز", "Create 5 14-day sprints", "Create 5 seven-day sprints for Atlas starting next Monday"
    # Ensure this doesn't conflict with creating a task, ticket, or project in a sprint
    not_task_or_ticket_en = not bool(re.search(r"\b(?:create|make|add)\s+(?:a\s+)?(?:task|ticket)\b", lower))
    not_task_or_ticket_fa = not bool(re.search(r"(?:تسک|وظیفه|تیکت)\s+.*(?:بساز|ایجاد\s+کن|تعریف\s+کن)", normalized))

    is_sprint_batch_en = not_task_or_ticket_en and (
        bool(re.search(r"\b(?:create|make|add|generate|batch[\s-]create|build)\s+.*?\bsprints?\b", lower))
        or bool(re.search(r"\b\d+\s+(?:[A-Za-z0-9\-]+\s+)?sprints?\b", lower))
    )
    is_sprint_batch_fa = not_task_or_ticket_fa and (
        bool(re.search(r"(?:\d+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)?\s*(?:تا\s*)?اسپرینت\b.*(?:بساز|ایجاد|تعریف|روزه|هفته)", normalized))
        or bool(re.search(r"(?:ساخت|ایجاد|تعریف)\s+(?:\d+|[آ-ی]+)?\s*(?:تا\s*)?اسپرینت", normalized))
    )

    if is_sprint_batch_en or is_sprint_batch_fa:
        # Determine duration: PMP supports 3, 7, 14 days (default 14)
        duration = 14
        if (
            re.search(r"\b(?:14|fourteen|۱۴)[\s-]*(?:days?|روزه?)\b", lower)
            or re.search(r"\b(?:2|two|دو)[\s-]*(?:weeks?|هفته(?:\s*ای|‌ای)?)\b", lower)
            or "۱۴ روزه" in normalized
            or "14 روزه" in normalized
            or "دو هفته" in normalized
            or "۲ هفته" in normalized
            or "2 هفته" in normalized
        ):
            duration = 14
        elif (
            re.search(r"\b(?:7|seven|۷)[\s-]*(?:days?|روزه?)\b", lower)
            or re.search(r"\b(?:1|one|یک)[\s-]*(?:weeks?|هفته(?:\s*ای|‌ای)?)\b", lower)
            or "۷ روزه" in normalized
            or "7 روزه" in normalized
            or "یک هفته" in normalized
            or "۱ هفته" in normalized
            or "1 هفته" in normalized
        ):
            duration = 7
        elif (
            re.search(r"\b(?:3|three|۳)[\s-]*(?:days?|روزه?)\b", lower)
            or "۳ روزه" in normalized
            or "3 روزه" in normalized
        ):
            duration = 3

        # Extract count: digits or words (default 5)
        count = 5
        _cnt_match = re.search(
            r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)\s*(?:تا\s*)?(?:(?:seven|7|fourteen|14|three|3|two|2|one|1)[\s-]*(?:days?|weeks?|روزه?|هفته\s*ای|هفته‌ای)?\s*)?sprints?",
            lower,
        )
        if not _cnt_match and is_sprint_batch_fa:
            _cnt_match = re.search(r"(\d+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)\s*(?:تا\s*)?اسپرینت", normalized)
        if not _cnt_match:
            _cnt_match = re.search(r"\b(?:create|make|add|generate|batch[\s-]create)\s+(?:a\s+batch\s+of\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b", lower)
        if not _cnt_match and is_sprint_batch_fa:
            _cnt_match = re.search(r"(?:ایجاد|ساخت|تعریف)\s+(\d+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده)\s*(?:تا\s*)?اسپرینت", normalized)
        if _cnt_match:
            c_raw = _cnt_match.group(1)
            _WORD_NUMS = {
                "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
                "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
                "یک": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5,
                "شش": 6, "هفت": 7, "هشت": 8, "نه": 9, "ده": 10,
            }
            if c_raw.isdigit():
                count = int(c_raw)
            elif c_raw in _WORD_NUMS:
                count = _WORD_NUMS[c_raw]

        # Extract target project name if specified
        p_name = None
        p_match = re.search(
            r"(?:for\s+(?:the\s+)?(?:project\s+)?|برای\s+(?:پروژه\s+)?)([A-Za-z0-9_\-آ-ی]+)",
            normalized,
            re.IGNORECASE,
        )
        if p_match:
            candidate_p = _clean_quotes(p_match.group(1))
            if candidate_p.lower() not in ("the", "project", "sprint", "sprints", "پروژه", "اسپرینت"):
                p_name = candidate_p

        # Extract start date if specified
        start_d = None
        date_match = re.search(
            r"(?:starting|from|begins?|شروع\s+از|از\s+تاریخ|از)\s+([A-Za-z0-9_\-\sآ-ی]+)",
            normalized,
            re.IGNORECASE,
        )
        if date_match:
            start_d = parse_relative_date(date_match.group(1))

        return CreateSprintBatchIntent(
            project_name=p_name,
            count=count,
            duration_days=duration,
            start_date=start_d,
            raw_query=raw,
            language=lang,
        )

    # --- Sprints List / Current Sprint ---------------------------------------
    if any(phrase in lower for phrase in ("اسپرینت‌های پروژه", "اسپرینتهای پروژه", "list sprints for", "show sprints")):
        p_match = re.search(r"(?:پروژه|for)\s+([A-Za-z0-9_\-آ-ی]+)", normalized)
        p_name = _clean_quotes(p_match.group(1)) if p_match else None
        return ListSprintsIntent(project_name=p_name, raw_query=raw, language=lang)

    if any(phrase == lower or (phrase in lower and not any(kw in lower for kw in ("create", "task", "تسک", "بساز"))) for phrase in ("اسپرینت فعلی", "وضعیت اسپرینت فعلی", "current sprint status", "current sprint")):
        return ViewCurrentSprintIntent(raw_query=raw, language=lang)

    # --- Move Task to Backlog or Sprint --------------------------------------
    # e.g. "این تسک را به بکلاگ ببر" or "Move this task to the backlog"
    if any(phrase in lower for phrase in ("به بکلاگ ببر", "به بک‌لاگ ببر", "به بک لاگ ببر", "to the backlog", "to backlog")):
        t_match = re.search(r"(?:تسک|task)\s+([A-Za-z0-9_\-]+)", normalized, re.IGNORECASE)
        t_ref = _clean_quotes(t_match.group(1)) if t_match else None
        return MoveTaskIntent(task_id_or_title=t_ref, to_backlog=True, raw_query=raw, language=lang)

    # e.g. "این تسک را به Sprint 4 ببر" or "Move this task to Sprint 4"
    move_sp = re.search(r"(?:تسک\s+([A-Za-z0-9_\-]+)\s+را\s+)?به\s+(?:اسپرینت|sprint)\s+([A-Za-z0-9_\-]+)\s+ببر", normalized, re.IGNORECASE)
    if move_sp:
        t_ref = _clean_quotes(move_sp.group(1)) if move_sp.group(1) else None
        target_sp = _clean_quotes(move_sp.group(2))
        return MoveTaskIntent(task_id_or_title=t_ref, target_sprint_name_or_number=target_sp, raw_query=raw, language=lang)

    move_sp_en = re.search(r"move\s+(?:this\s+task|task\s+([A-Za-z0-9_\-]+))\s+to\s+(?:sprint\s+)?([A-Za-z0-9_\-]+)", normalized, re.IGNORECASE)
    if move_sp_en:
        t_ref = _clean_quotes(move_sp_en.group(1)) if move_sp_en.group(1) else None
        target_sp = _clean_quotes(move_sp_en.group(2))
        return MoveTaskIntent(task_id_or_title=t_ref, target_sprint_name_or_number=target_sp, raw_query=raw, language=lang)

    # --- Create Ticket -------------------------------------------------------
    # e.g. "یک تیکت برای تیم QA بساز" or "Create a ticket for the QA team"
    ticket_fa = re.search(r"(?:یک\s+)?تیکت\s+برای\s+(?:تیم\s+)?([A-Za-z0-9_\-آ-ی]+)\s+بساز", normalized)
    if ticket_fa:
        team_name = _clean_quotes(ticket_fa.group(1))
        return CreateTicketIntent(title=f"Ticket for {team_name}", recipient_team_names=[team_name], raw_query=raw, language=lang)

    ticket_en = re.search(r"create\s+(?:a\s+)?ticket\s+for\s+(?:the\s+)?([A-Za-z0-9_\-آ-ی]+)(?:\s+team)?", normalized, re.IGNORECASE)
    if ticket_en:
        team_name = _clean_quotes(ticket_en.group(1))
        return CreateTicketIntent(title=f"Ticket for {team_name}", recipient_team_names=[team_name], raw_query=raw, language=lang)

    # --- Add Comment ---------------------------------------------------------
    # e.g. "روی تسک 142 کامنت بگذار: بررسی شد" or "Add a comment to task 142: ..."
    comm_fa = re.search(r"(?:روی\s+)?(?:تسک|وظیفه)\s+([A-Za-z0-9_\-]+)\s+کامنت\s+(?:بگذار|بذار|ثبت کن)[:\s]+(.+)", normalized)
    if comm_fa:
        return AddCommentIntent(task_id_or_title=_clean_quotes(comm_fa.group(1)), comment_text=_clean_quotes(comm_fa.group(2)), raw_query=raw, language=lang)

    comm_en = re.search(r"add\s+(?:a\s+)?comment\s+to\s+task\s+([A-Za-z0-9_\-]+)[:\s]+(.+)", normalized, re.IGNORECASE)
    if comm_en:
        return AddCommentIntent(task_id_or_title=_clean_quotes(comm_en.group(1)), comment_text=_clean_quotes(comm_en.group(2)), raw_query=raw, language=lang)

    # --- Task Status Change --------------------------------------------------
    # e.g. "تسک 142 را Done کن" or "تسک 142 را در حال انجام بگذار" or "Change task 142 to In Progress"
    status_map = {
        "done": "Done",
        "انجام شد": "Done",
        "انجام شده": "Done",
        "تکمیل شد": "Done",
        "in progress": "InProgress",
        "در حال انجام": "InProgress",
        "در دست اقدام": "InProgress",
        "ready": "Ready",
        "آماده": "Ready",
        "blocked": "Blocked",
        "مسدود": "Blocked",
        "review": "Review",
        "در حال بررسی": "Review",
        "بررسی": "Review",
        "cancelled": "Cancelled",
        "لغو شده": "Cancelled",
    }

    for phrase, mapped_st in status_map.items():
        # Task X to Status Y
        pattern_fa = rf"(?:تسک|وظیفه)\s+([A-Za-z0-9_\-]+)\s+را\s+(?:به\s+)?{re.escape(phrase)}"
        m_fa = re.search(pattern_fa, normalized, re.IGNORECASE)
        if m_fa:
            return UpdateTaskStatusIntent(task_id_or_title=_clean_quotes(m_fa.group(1)), status=mapped_st, raw_query=raw, language=lang)

        # Contextual: "این تسک را Done کن" or "Done کن"
        if re.search(rf"\b(?:این\s+تسک\s+را\s+)?{re.escape(phrase)}\s+(?:کن|بگذار|قرار\s+بده)\b", normalized, re.IGNORECASE):
            return UpdateTaskStatusIntent(status=mapped_st, raw_query=raw, language=lang)

        pattern_en = rf"change\s+(?:task\s+([A-Za-z0-9_\-]+)\s+to\s+)?{re.escape(phrase)}"
        m_en = re.search(pattern_en, normalized, re.IGNORECASE)
        if m_en:
            t_ref = _clean_quotes(m_en.group(1)) if m_en.group(1) else None
            return UpdateTaskStatusIntent(task_id_or_title=t_ref, status=mapped_st, raw_query=raw, language=lang)

    # --- Create Task ---------------------------------------------------------
    # Example 1: "برای پروژه PMP یک تسک برای رفع مشکل لاگین بساز و به علی بده"
    ct_full_fa = re.search(r"برای\s+پروژه\s+([A-Za-z0-9_\-آ-ی]+)\s+(?:یک\s+)?تسک\s+(?:برای\s+|به\s+نام\s+)?(.+?)\s+بساز(?:\s+و\s+به\s+(.+?)\s+بده)?$", normalized)
    if ct_full_fa:
        p_name = _clean_quotes(ct_full_fa.group(1))
        title = _clean_quotes(ct_full_fa.group(2))
        assignee = _clean_quotes(ct_full_fa.group(3)) if ct_full_fa.group(3) else None
        assignees = [assignee] if assignee else []
        return CreateTaskIntent(title=title, project_name=p_name, assignee_names=assignees, raw_query=raw, language=lang)

    # Example 2: "یک تسک به نام Fix login بساز" or "یک تسک Fix login بساز"
    ct_simple_fa = re.search(r"(?:یک\s+)?(?:تسک|وظیفه)\s+(?:به\s+نام\s+|نام\s+)?([A-Za-z0-9_\-\sآ-ی]+?)\s+بساز", normalized)
    if ct_simple_fa:
        title = _clean_quotes(ct_simple_fa.group(1))
        in_sprint = "اسپرینت فعلی" in lower
        in_backlog = "بکلاگ" in lower or "بک‌لاگ" in lower
        return CreateTaskIntent(title=title, in_current_sprint=in_sprint, is_backlog=in_backlog, raw_query=raw, language=lang)

    # English: "Create a task called 'Fix login redirect' in the current sprint"
    ct_en = re.search(r"create\s+(?:a\s+)?task\s+(?:called\s+|named\s+)?['\"`«]?(.+?)['\"`»]?(?:\s+in\s+(?:the\s+)?current\s+sprint|\s+in\s+(?:the\s+)?backlog|\s+for\s+project\s+([A-Za-z0-9_\-]+))?$", normalized, re.IGNORECASE)
    if ct_en:
        title = _clean_quotes(ct_en.group(1))
        in_sprint = "current sprint" in lower
        in_backlog = "backlog" in lower
        p_name = _clean_quotes(ct_en.group(2)) if ct_en.group(2) else None
        return CreateTaskIntent(title=title, project_name=p_name, in_current_sprint=in_sprint, is_backlog=in_backlog, raw_query=raw, language=lang)

    # --- Task Assignment -----------------------------------------------------
    # e.g. "تسک 142 را به علی و سارا بده" or "Assign task 142 to Reza and Sara"
    assign_fa = re.search(r"(?:تسک\s+([A-Za-z0-9_\-]+)\s+را\s+)?به\s+([A-Za-z0-9_\-آ-ی\s,و]+?)\s+(?:بده|اختصاص\s+بده|assign\s+کن)", normalized, re.IGNORECASE)
    if assign_fa:
        t_ref = _clean_quotes(assign_fa.group(1)) if assign_fa.group(1) else None
        names_raw = assign_fa.group(2)
        # Split by comma or 'و' or 'and'
        names = [n.strip() for n in re.split(r",|\s+و\s+|\s+and\s+", names_raw) if n.strip()]
        return AssignTaskIntent(task_id_or_title=t_ref, assignee_names=names, raw_query=raw, language=lang)

    assign_en = re.search(r"assign\s+(?:task\s+([A-Za-z0-9_\-]+)\s+to\s+|this\s+task\s+to\s+)?([A-Za-z0-9_\-آ-ی\s,and]+)", normalized, re.IGNORECASE)
    if assign_en:
        t_ref = _clean_quotes(assign_en.group(1)) if assign_en.group(1) else None
        names_raw = assign_en.group(2)
        names = [n.strip() for n in re.split(r",|\s+and\s+", names_raw) if n.strip()]
        return AssignTaskIntent(task_id_or_title=t_ref, assignee_names=names, raw_query=raw, language=lang)

    # --- Task Details: Deadline, Priority, Labels, Checklist -----------------
    # Deadline: "ددلاینش را سه‌شنبه بگذار" or "Set its deadline to next Tuesday"
    if any(kw in lower for kw in ("ددلاین", "مهلت", "deadline", "due date")):
        parsed_d = parse_relative_date(normalized)
        t_match = re.search(r"(?:تسک|task)\s+([A-Za-z0-9_\-]+)", normalized, re.IGNORECASE)
        t_ref = _clean_quotes(t_match.group(1)) if t_match else None
        return UpdateTaskDetailsIntent(task_id_or_title=t_ref, due_date=parsed_d, raw_query=raw, language=lang)

    # Priority: "اولویتش را High کن" or "Set its priority to High"
    prio_match = re.search(r"(?:اولویت(?:ش|اش)?|priority)\s+(?:را\s+|رو\s+|به\s+|to\s+)?(critical|high|medium|low|p0|p1|p2|p3|بالا|متوسط|پایین|فوری)", normalized, re.IGNORECASE)
    if prio_match:
        p_val = prio_match.group(1).lower()
        mapped_prio = "P0" if p_val in ("critical", "p0", "فوری") else ("P1" if p_val in ("high", "p1", "بالا") else ("P2" if p_val in ("medium", "p2", "متوسط") else "P3"))
        t_match = re.search(r"(?:تسک|task)\s+([A-Za-z0-9_\-]+)", normalized, re.IGNORECASE)
        t_ref = _clean_quotes(t_match.group(1)) if t_match else None
        return UpdateTaskDetailsIntent(task_id_or_title=t_ref, priority=mapped_prio, raw_query=raw, language=lang)

    # Labels: "لیبل‌های backend و urgent را اضافه کن" or "Add the labels backend and urgent"
    labels_fa = re.search(r"(?:برچسب‌های|برچسبهای|لیبل‌های|لیبلهای|labels?)\s+([A-Za-z0-9_\-آ-ی\s,و]+?)\s+(?:را\s+اضافه\s+کن|اضافه\s+کن)", normalized, re.IGNORECASE)
    if labels_fa:
        lbls = [l.strip() for l in re.split(r",|\s+و\s+|\s+and\s+", labels_fa.group(1)) if l.strip()]
        t_match = re.search(r"(?:تسک|task)\s+([A-Za-z0-9_\-]+)", normalized, re.IGNORECASE)
        t_ref = _clean_quotes(t_match.group(1)) if t_match else None
        return UpdateTaskDetailsIntent(task_id_or_title=t_ref, add_labels=lbls, raw_query=raw, language=lang)

    labels_en = re.search(r"add\s+(?:the\s+)?labels?\s+([A-Za-z0-9_\-آ-ی\s,and]+)", normalized, re.IGNORECASE)
    if labels_en:
        lbls = [l.strip() for l in re.split(r",|\s+and\s+", labels_en.group(1)) if l.strip()]
        return UpdateTaskDetailsIntent(add_labels=lbls, raw_query=raw, language=lang)

    # Checklist: "چک‌لیست اضافه کن: تست ۱، تست ۲" or "Add a checklist"
    if any(kw in lower for kw in ("چک‌لیست", "چک لیست", "checklist")):
        cl_items: List[str] = []
        if ":" in normalized:
            _, after_colon = normalized.split(":", 1)
            cl_items = [item.strip() for item in re.split(r",|،|\n", after_colon) if item.strip()]
        t_match = re.search(r"(?:تسک|task)\s+([A-Za-z0-9_\-]+)", normalized, re.IGNORECASE)
        t_ref = _clean_quotes(t_match.group(1)) if t_match else None
        return UpdateTaskDetailsIntent(task_id_or_title=t_ref, add_checklist_items=cl_items, raw_query=raw, language=lang)

    # --- View Task / Task Search ---------------------------------------------
    # e.g. "تسک Login را باز کن" or "تسک 142 را نشان بده" or "View task 142"
    vt_fa = re.search(r"(?:تسک|وظیفه)\s+([A-Za-z0-9_\-\sآ-ی]+?)\s+را\s+(?:باز\s+کن|نشان\s+بده|نمایش\s+بده)", normalized)
    if vt_fa:
        return ViewTaskIntent(task_id_or_title=_clean_quotes(vt_fa.group(1)), raw_query=raw, language=lang)

    vt_en = re.search(r"(?:show|view|open)\s+task\s+([A-Za-z0-9_\-]+)", normalized, re.IGNORECASE)
    if vt_en:
        return ViewTaskIntent(task_id_or_title=_clean_quotes(vt_en.group(1)), raw_query=raw, language=lang)

    # "تسک‌های تیم بکند" or "tasks assigned to the backend team"
    team_tasks = re.search(r"(?:تسک(?:‌های|های)\s+تیم|tasks\s+assigned\s+to\s+(?:the\s+)?)\s*([A-Za-z0-9_\-آ-ی]+)", normalized, re.IGNORECASE)
    if team_tasks:
        return SearchTasksIntent(team_name=_clean_quotes(team_tasks.group(1)), raw_query=raw, language=lang)

    # "تسک‌های علی را نشان بده" or "Show Ali's tasks"
    user_tasks_fa = re.search(r"تسک(?:‌های|های)\s+([A-Za-z0-9_\-آ-ی]+)(?:\s+را\s+نشان\s+بده)?", normalized)
    if user_tasks_fa:
        u_name = _clean_quotes(user_tasks_fa.group(1))
        if u_name not in ("من", "اسپرینت", "پروژه", "عقب‌افتاده", "عقب افتاده", "تیم"):
            return SearchTasksIntent(assignee_name=u_name, raw_query=raw, language=lang)

    user_tasks_en = re.search(r"show\s+([A-Za-z0-9_\-]+)'s\s+tasks", normalized, re.IGNORECASE)
    if user_tasks_en:
        return SearchTasksIntent(assignee_name=_clean_quotes(user_tasks_en.group(1)), raw_query=raw, language=lang)

    # "Find the task about login" or "تسک در مورد لاگین"
    search_task = re.search(r"(?:پیدا\s+کردن\s+تسک|تسک\s+در\s+مورد|find\s+(?:the\s+)?task\s+about)\s+(.+)", normalized, re.IGNORECASE)
    if search_task:
        return SearchTasksIntent(query=_clean_quotes(search_task.group(1)), raw_query=raw, language=lang)

    # --- Milestones ----------------------------------------------------------
    if any(phrase in lower for phrase in ("مایلستون‌های پروژه", "list milestones")):
        p_match = re.search(r"(?:پروژه|for)\s+([A-Za-z0-9_\-آ-ی]+)", normalized)
        p_name = _clean_quotes(p_match.group(1)) if p_match else "Atlas"
        return ListMilestonesIntent(project_name=p_name, raw_query=raw, language=lang)

    cm_match = re.search(r"(?:مایلستون|milestone)\s+([A-Za-z0-9_\-آ-ی\s]+?)\s+(?:را\s+بساز|create)", normalized, re.IGNORECASE)
    if cm_match:
        m_title = _clean_quotes(cm_match.group(1))
        return CreateMilestoneIntent(project_name="", title=m_title, raw_query=raw, language=lang)

    # --- Documentation -------------------------------------------------------
    doc_search = re.search(r"(?:جستجوی\s+مستندات|جستجو\s+در\s+مستندات|search\s+docs)\s+(.+)", normalized, re.IGNORECASE)
    if doc_search:
        return SearchDocsIntent(query=_clean_quotes(doc_search.group(1)), raw_query=raw, language=lang)

    doc_read = re.search(r"(?:مستند|صفحه|doc)\s+([A-Za-z0-9_\-آ-ی]+)\s+را\s+(?:نشان\s+بده|بخوان)", normalized, re.IGNORECASE)
    if doc_read:
        return ReadDocIntent(title_or_slug=_clean_quotes(doc_read.group(1)), raw_query=raw, language=lang)

    # --- Diagrams ------------------------------------------------------------
    if any(kw in lower for kw in ("دیاگرام", "diagram")):
        d_type = "architecture"
        if "sequence" in lower or "توالی" in lower:
            d_type = "sequence"
        elif "flowchart" in lower or "فلوچارت" in lower:
            d_type = "flowchart"
        elif "er" in lower or "دیتابیس" in lower or "موجودیت" in lower:
            d_type = "er"
        return CreateDiagramIntent(diagram_type=d_type, title=raw, raw_query=raw, language=lang)

    # --- Analytics / My Work / Dashboard -------------------------------------
    if any(phrase in lower for phrase in ("کارهای در انتظار", "منتظر اقدام من", "منتظر من", "pending on me", "needs me")):
        return ViewAnalyticsIntent(report_type="pending", raw_query=raw, language=lang)

    if any(phrase in lower for phrase in ("کارهای با تاخیر", "تسک‌های تاخیردار", "کارهای معوق", "late tasks", "overdue tasks", "تسک‌های معوق")):
        return ViewAnalyticsIntent(report_type="late", raw_query=raw, language=lang)

    if any(phrase in lower for phrase in ("مهلت‌های پیش‌رو", "مهلت‌ها", "سررسیدها", "ددلاین‌ها", "upcoming deadlines")):
        return ViewAnalyticsIntent(report_type="upcoming", raw_query=raw, language=lang)

    if any(phrase in lower for phrase in ("اسپرینت من", "سرعت من", "my velocity", "my sprint")):
        return ViewAnalyticsIntent(report_type="sprint", raw_query=raw, language=lang)

    if any(phrase in lower for phrase in ("داشبورد سازمانی", "داشبورد مدیریتی", "پروژه‌های ریسک‌دار", "ریسک‌ها", "executive dashboard", "at risk")):
        return ViewAnalyticsIntent(report_type="exec", raw_query=raw, language=lang)

    if any(phrase in lower for phrase in ("کارهای من", "کار های من", "my work", "my-work", "داشبورد من", "داشبورد", "my dashboard", "dashboard", "آمار من")):
        return ViewAnalyticsIntent(report_type="personal", raw_query=raw, language=lang)

    if any(phrase in lower for phrase in ("سلامت پروژه", "سلامت پروژه‌ها", "project health")):
        return ViewAnalyticsIntent(report_type="health", raw_query=raw, language=lang)

    return None

