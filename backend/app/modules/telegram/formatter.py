"""Telegram message formatters in Persian and English."""

from __future__ import annotations

import html
from typing import Any, List, Optional
from uuid import UUID

from app.modules.projects.enums import Priority, TaskStatus
from app.modules.projects.models import Phase, Project, TaskItem
from app.modules.projects.schemas import ProjectSummary, TaskRead


_STATUS_ICONS = {
    "NotStarted": "⚪️",
    "Ready": "🔵",
    "InProgress": "🟡",
    "Waiting": "⏳",
    "Blocked": "🔴",
    "Review": "🟣",
    "Testing": "🧪",
    "Done": "✅",
    "Cancelled": "❌",
    "Archived": "📁",
}

_PRIORITY_ICONS_FA = {
    "P0": "🔥 بحرانی (P0)",
    "P1": "⚡️ بالا (P1)",
    "P2": "🔹 متوسط (P2)",
    "P3": "▫️ پایین (P3)",
}

_PRIORITY_ICONS_EN = {
    "P0": "🔥 Critical (P0)",
    "P1": "⚡️ High (P1)",
    "P2": "🔹 Medium (P2)",
    "P3": "▫️ Low (P3)",
}

_PRIORITY_ICONS = _PRIORITY_ICONS_FA


def _format_priority(priority: Any, lang: str = "fa") -> str:
    p_str = str(getattr(priority, "value", priority))
    if lang == "en":
        return _PRIORITY_ICONS_EN.get(p_str, p_str)
    return _PRIORITY_ICONS_FA.get(p_str, p_str)


def _progress_bar(percentage: float, width: int = 10) -> str:
    filled = int(round((percentage / 100.0) * width))
    filled = max(0, min(width, filled))
    return "█" * filled + "░" * (width - filled) + f" {percentage:.0f}%"


def format_task_details(task: Any, lang: str = "fa") -> str:
    """Format a single task's full details."""
    default_title = "بدون عنوان" if lang == "fa" else "Untitled"
    title = html.escape(getattr(task, "title", default_title))
    status = getattr(task, "status", TaskStatus.READY)
    status_icon = _STATUS_ICONS.get(status, "📌")
    priority = getattr(task, "priority", Priority.P2)
    prio_str = _format_priority(priority, lang=lang)
    raw_desc = getattr(task, "description", None) or "—"
    if len(raw_desc) > 1500:
        raw_desc = raw_desc[:1497] + "..."
    desc = html.escape(raw_desc)

    due_date = getattr(task, "due_date", None)
    start_date = getattr(task, "start_date", None)
    due_str = str(due_date) if due_date else ("ندارد" if lang == "fa" else "None")
    start_str = str(start_date) if start_date else ("ندارد" if lang == "fa" else "None")

    # Assignees
    assignees_list = []
    if hasattr(task, "assignees") and task.assignees:
        assignees_list = [str(a.user_id)[:8] for a in task.assignees]
    unassigned_lbl = "اختصاص نیافته" if lang == "fa" else "Unassigned"
    assignees_str = ", ".join(assignees_list) if assignees_list else unassigned_lbl

    # Checklists
    checklists_str = ""
    if hasattr(task, "checklist_items") and task.checklist_items:
        done_cnt = sum(1 for c in task.checklist_items if c.is_done)
        total_cnt = len(task.checklist_items)
        chk_label = "چک‌لیست" if lang == "fa" else "Checklist"
        checklists_str = f"\n☑️ <b>{chk_label}:</b> {done_cnt}/{total_cnt}"

    tid_short = str(task.id)[:8]
    st_val = str(getattr(status, "value", status))

    if lang == "fa":
        st_fa_map = {
            "Ready": "آماده انجام",
            "InProgress": "در حال انجام",
            "InReview": "در حال بررسی",
            "Blocked": "مسدود",
            "Done": "انجام شده",
        }
        st_fa = st_fa_map.get(st_val, st_val)
        return (
            f"📋 <b>تسک #{tid_short}: {title}</b>\n\n"
            f"<b>وضعیت:</b> {status_icon} {st_fa}\n"
            f"<b>اولویت:</b> {prio_str}\n"
            f"<b>مسئولین:</b> {assignees_str}\n"
            f"<b>تاریخ شروع:</b> {start_str}\n"
            f"<b>مهلت انجام (ددلاین):</b> {due_str}{checklists_str}\n\n"
            f"<b>توضیحات:</b>\n{desc}"
        )
    else:
        return (
            f"📋 <b>Task #{tid_short}: {title}</b>\n\n"
            f"<b>Status:</b> {status_icon} {st_val}\n"
            f"<b>Priority:</b> {prio_str}\n"
            f"<b>Assignees:</b> {assignees_str}\n"
            f"<b>Start:</b> {start_str} | <b>Due:</b> {due_str}{checklists_str}\n\n"
            f"<b>Description:</b>\n{desc}"
        )


def format_tasks_list(tasks: List[Any], header: str, lang: str = "fa") -> str:
    """Format a list of tasks."""
    if not tasks:
        return f"{header}\n\n<i>هیچ تسکی یافت نشد.</i>" if lang == "fa" else f"{header}\n\n<i>No tasks found.</i>"

    hdr_line = header if ("<" in header and ">" in header) else f"<b>{header}</b>"
    lines = [f"{hdr_line}\n"]
    default_title = "بدون عنوان" if lang == "fa" else "Untitled"
    due_prefix = "مهلت: " if lang == "fa" else "Due: "
    for i, t in enumerate(tasks[:15], 1):
        status_icon = _STATUS_ICONS.get(getattr(t, "status", ""), "📌")
        title = html.escape(getattr(t, "title", default_title))
        tid_short = str(getattr(t, "id", ""))[:8]
        due = f" ({due_prefix}{t.due_date})" if getattr(t, "due_date", None) else ""
        lines.append(f"{i}. {status_icon} <code>#{tid_short}</code> {title}{due}")

    if len(tasks) > 15:
        more_str = f"\n<i>... و {len(tasks) - 15} تسک دیگر</i>" if lang == "fa" else f"\n<i>... and {len(tasks) - 15} more tasks</i>"
        lines.append(more_str)

    return "\n".join(lines)


def format_project_summary(project: Project, summary: Optional[ProjectSummary] = None, lang: str = "fa") -> str:
    """Format project status overview."""
    p_name = html.escape(project.name)
    status_icon = _STATUS_ICONS.get(project.status, "🚀")
    prio_str = _format_priority(project.priority, lang=lang)
    prog = float(project.progress_percentage or 0.0)
    bar = _progress_bar(prog)

    total_tasks = summary.total_tasks if summary else 0
    completed_tasks = summary.completed_tasks if summary else 0

    sprint_info = ""
    if hasattr(project, "phases") and project.phases:
        active_sprint = next((p for p in project.phases if p.status == "in-progress" and p.is_sprint), None)
        if active_sprint:
            s_label = "اسپرینت فعال" if lang == "fa" else "Active Sprint"
            sprint_info = f"\n🏃 <b>{s_label}:</b> {html.escape(active_sprint.name)}"

    raw_pdesc = project.description or "—"
    if len(raw_pdesc) > 1500:
        raw_pdesc = raw_pdesc[:1497] + "..."
    pdesc = html.escape(raw_pdesc)

    if lang == "fa":
        return (
            f"🏢 <b>پروژه: {p_name}</b>\n\n"
            f"<b>وضعیت:</b> {status_icon} {project.status}\n"
            f"<b>اولویت:</b> {prio_str}\n"
            f"<b>پیشرفت کل:</b> {bar}\n"
            f"<b>تسک‌ها:</b> {completed_tasks} از {total_tasks} انجام شده{sprint_info}\n"
            f"<b>توضیحات:</b> {pdesc}"
        )
    else:
        return (
            f"🏢 <b>Project: {p_name}</b>\n\n"
            f"<b>Status:</b> {status_icon} {project.status}\n"
            f"<b>Priority:</b> {prio_str}\n"
            f"<b>Progress:</b> {bar}\n"
            f"<b>Tasks:</b> {completed_tasks}/{total_tasks} completed{sprint_info}\n"
            f"<b>Description:</b> {pdesc}"
        )


def format_sprint_details(sprint: Phase, task_count: int = 0, lang: str = "fa") -> str:
    """Format sprint details."""
    s_name = html.escape(sprint.name)
    unknown_lbl = "نامشخص" if lang == "fa" else "Unknown"
    start_d = str(sprint.start_date) if sprint.start_date else unknown_lbl
    end_d = str(sprint.end_date) if sprint.end_date else unknown_lbl
    dur = sprint.duration_days
    prog = float(sprint.progress_percentage or 0.0)
    bar = _progress_bar(prog)

    if lang == "fa":
        return (
            f"🏃 <b>اسپرینت: {s_name}</b>\n\n"
            f"<b>وضعیت:</b> {sprint.status}\n"
            f"<b>دوره زمانی:</b> {start_d} تا {end_d} ({dur} روز)\n"
            f"<b>پیشرفت:</b> {bar}\n"
            f"<b>تعداد تسک‌ها:</b> {task_count}"
        )
    else:
        return (
            f"🏃 <b>Sprint: {s_name}</b>\n\n"
            f"<b>Status:</b> {sprint.status}\n"
            f"<b>Period:</b> {start_d} to {end_d} ({dur} days)\n"
            f"<b>Progress:</b> {bar}\n"
            f"<b>Tasks count:</b> {task_count}"
        )


def format_project_overview_card(
    overview: Any,
    product_name: str = "",
    manager_name: str = "",
    members_names: Optional[List[str]] = None,
    lang: str = "fa",
) -> str:
    """Format rich interactive project card with full details, progress, and sprints."""
    proj = overview.project
    p_name = html.escape(proj.name)
    status_icon = _STATUS_ICONS.get(proj.status, "🏢")
    prio_str = _format_priority(proj.priority, lang=lang)
    prog = float(proj.progress_percentage or 0.0)
    bar = _progress_bar(prog)

    budget_val = getattr(proj, "budget", None)
    curr_unit = "تومان" if lang == "fa" else "Tomans"
    budget_str = f"{budget_val:,.0f} {curr_unit}" if budget_val else "—"
    start_d = str(proj.start_date) if proj.start_date else "—"
    end_d = str(proj.end_date) if proj.end_date else "—"

    # Tasks stats
    stats = getattr(overview, "task_stats", None)
    total_tasks = stats.total if stats else 0
    done_tasks = stats.done if stats else 0
    in_prog = stats.in_progress if stats else 0
    blocked = stats.blocked if stats else 0

    # Sprints summary
    sprints = getattr(overview, "sprints", []) or []
    current_sprint = getattr(overview, "current_sprint", None)
    sprints_lines = []
    to_sep = " تا " if lang == "fa" else " to "
    for s in sprints[:5]:
        is_cur = current_sprint and getattr(s, "id", None) == getattr(current_sprint, "id", None)
        icon = "🏃" if is_cur else ("✅" if getattr(s, "status", "") == "completed" else "▫️")
        cur_badge = (" (فعال)" if lang == "fa" else " (Active)") if is_cur else ""
        s_start = str(getattr(s, "start_date", "—"))
        s_end = str(getattr(s, "end_date", "—"))
        sprints_lines.append(f"  {icon} <b>{html.escape(s.name)}</b>{cur_badge} ({s_start}{to_sep}{s_end})")
    if len(sprints) > 5:
        more_cnt = len(sprints) - 5
        sprints_lines.append(f"  ... و {more_cnt} اسپرینت دیگر" if lang == "fa" else f"  ... and {more_cnt} more sprints")

    sprint_section = "\n".join(sprints_lines) if sprints_lines else ("<i>اسپرینتی ثبت نشده است</i>" if lang == "fa" else "<i>No sprints defined</i>")

    # Members summary
    members_list = members_names or []
    members_str = ", ".join(members_list[:6]) if members_list else ("ندارد" if lang == "fa" else "None")
    if len(members_list) > 6:
        members_str += f" (+{len(members_list) - 6})"

    raw_desc = proj.description or "—"
    if len(raw_desc) > 500:
        raw_desc = raw_desc[:497] + "..."
    desc = html.escape(raw_desc)

    if lang == "fa":
        lines = [
            f"🏢 <b>پروژه: {p_name}</b>",
            "───────────────────────",
            f"🏷 <b>خط محصول:</b> {html.escape(product_name or '—')}",
            f"👤 <b>مدیر پروژه:</b> {html.escape(manager_name or '—')}",
            f"📊 <b>وضعیت:</b> {status_icon} {proj.status}",
            f"⚡️ <b>اولویت:</b> {prio_str}",
            f"💰 <b>بودجه:</b> {budget_str}",
            f"📅 <b>بازه زمانی:</b> {start_d} تا {end_d}",
            "",
            "📈 <b>پیشرفت کلی و وضعیت تسک‌ها:</b>",
            f"{bar}",
            f"📋 {done_tasks} از {total_tasks} تسک انجام شده (در حال انجام: {in_prog} | مسدود: {blocked})",
            "",
            f"🏃 <b>اسپرینت‌ها ({len(sprints)} اسپرینت):</b>",
            sprint_section,
            "",
            f"👥 <b>اعضای تیم:</b> {members_str}",
            f"📄 <b>توضیحات:</b> {desc}",
            "───────────────────────",
        ]
    else:
        lines = [
            f"🏢 <b>Project: {p_name}</b>",
            "───────────────────────",
            f"🏷 <b>Product Line:</b> {html.escape(product_name or '—')}",
            f"👤 <b>Project Manager:</b> {html.escape(manager_name or '—')}",
            f"📊 <b>Status:</b> {status_icon} {proj.status}",
            f"⚡️ <b>Priority:</b> {prio_str}",
            f"💰 <b>Budget:</b> {budget_str}",
            f"📅 <b>Timeline:</b> {start_d} to {end_d}",
            "",
            "📈 <b>Overall Progress & Tasks:</b>",
            f"{bar}",
            f"📋 {done_tasks}/{total_tasks} completed (In Progress: {in_prog} | Blocked: {blocked})",
            "",
            f"🏃 <b>Sprints ({len(sprints)} Sprints):</b>",
            sprint_section,
            "",
            f"👥 <b>Team Members:</b> {members_str}",
            f"📄 <b>Description:</b> {desc}",
            "───────────────────────",
        ]

    res = "\n".join(lines)
    if len(res) > 4000:
        res = res[:3996] + "..."
    return res


def format_project_sprints_view(
    overview: Any,
    lang: str = "fa",
) -> str:
    """Format detailed sprints view for a project."""
    proj = overview.project
    p_name = html.escape(proj.name)
    sprints = getattr(overview, "sprints", []) or []
    current_sprint = getattr(overview, "current_sprint", None)

    if lang == "fa":
        lines = [
            f"🏃 <b>اسپرینت‌های پروژه «{p_name}»</b>",
            "───────────────────────",
        ]
        if not sprints:
            lines.append("<i>هیچ اسپرینتی برای این پروژه ثبت نشده است.</i>")
        else:
            for i, s in enumerate(sprints, 1):
                is_cur = current_sprint and getattr(s, "id", None) == getattr(current_sprint, "id", None)
                icon = "🏃" if is_cur else ("✅" if getattr(s, "status", "") == "completed" else "▫️")
                cur_badge = " <b>(اسپرینت فعال)</b>" if is_cur else ""
                s_name = html.escape(s.name)
                s_start = str(getattr(s, "start_date", "—"))
                s_end = str(getattr(s, "end_date", "—"))
                dur = getattr(s, "duration_days", None)
                dur_str = f" ({dur} روزه)" if dur else ""
                lines.append(f"{i}. {icon} <b>{s_name}</b>{cur_badge}")
                lines.append(f"   📅 تاریخ: {s_start} تا {s_end}{dur_str} | وضعیت: {s.status}")
        lines.append("───────────────────────")
    else:
        lines = [
            f"🏃 <b>Sprints for '{p_name}'</b>",
            "───────────────────────",
        ]
        if not sprints:
            lines.append("<i>No sprints defined for this project.</i>")
        else:
            for i, s in enumerate(sprints, 1):
                is_cur = current_sprint and getattr(s, "id", None) == getattr(current_sprint, "id", None)
                icon = "🏃" if is_cur else ("✅" if getattr(s, "status", "") == "completed" else "▫️")
                cur_badge = " <b>(Active Sprint)</b>" if is_cur else ""
                s_name = html.escape(s.name)
                s_start = str(getattr(s, "start_date", "—"))
                s_end = str(getattr(s, "end_date", "—"))
                dur = getattr(s, "duration_days", None)
                dur_str = f" ({dur} days)" if dur else ""
                lines.append(f"{i}. {icon} <b>{s_name}</b>{cur_badge}")
                lines.append(f"   📅 Dates: {s_start} to {s_end}{dur_str} | Status: {s.status}")
        lines.append("───────────────────────")

    res = "\n".join(lines)
    if len(res) > 4000:
        res = res[:3996] + "..."
    return res


def format_project_tasks_view(
    project_name: str,
    tasks: Sequence[Any],
    lang: str = "fa",
) -> str:
    """Format tasks list view for a project."""
    p_name = html.escape(project_name)
    if lang == "fa":
        lines = [
            f"📋 <b>تسک‌های پروژه «{p_name}»</b>",
            f"تعداد کل تسک‌ها: {len(tasks)}\n",
            "───────────────────────",
        ]
        if not tasks:
            lines.append("<i>هیچ تسکی در این پروژه یافت نشد.</i>")
        else:
            for i, t in enumerate(tasks[:15], 1):
                status_icon = _STATUS_ICONS.get(getattr(t, "status", ""), "📌")
                title = html.escape(getattr(t, "title", "بدون عنوان"))
                tid_short = str(getattr(t, "id", ""))[:8]
                due = f" | مهلت: {t.due_date}" if getattr(t, "due_date", None) else ""
                lines.append(f"{i}. {status_icon} <code>#{tid_short}</code> <b>{title}</b>{due}")
            if len(tasks) > 15:
                lines.append(f"\n<i>... و {len(tasks) - 15} تسک دیگر</i>")
        lines.append("───────────────────────")
    else:
        lines = [
            f"📋 <b>Tasks in Project '{p_name}'</b>",
            f"Total tasks: {len(tasks)}\n",
            "───────────────────────",
        ]
        if not tasks:
            lines.append("<i>No tasks found in this project.</i>")
        else:
            for i, t in enumerate(tasks[:15], 1):
                status_icon = _STATUS_ICONS.get(getattr(t, "status", ""), "📌")
                title = html.escape(getattr(t, "title", "Untitled"))
                tid_short = str(getattr(t, "id", ""))[:8]
                due = f" | Due: {t.due_date}" if getattr(t, "due_date", None) else ""
                lines.append(f"{i}. {status_icon} <code>#{tid_short}</code> <b>{title}</b>{due}")
            if len(tasks) > 15:
                lines.append(f"\n<i>... and {len(tasks) - 15} more tasks</i>")
        lines.append("───────────────────────")

    res = "\n".join(lines)
    if len(res) > 4000:
        res = res[:3996] + "..."
    return res


def format_project_preview(
    name: str,
    product_name: str,
    description: Optional[str] = None,
    priority: Optional[str] = None,
    start_date: Optional[Any] = None,
    end_date: Optional[Any] = None,
    lang: str = "fa",
) -> str:
    """Format project creation preview before final commit."""
    p_name = html.escape(name)
    prod_name = html.escape(product_name)
    desc = html.escape(description) if description else None
    prio_str = _format_priority(priority, lang=lang) if priority else None

    if lang == "fa":
        lines = [
            "📋 <b>پیش‌نمایش ایجاد پروژه:</b>\n",
            f"▫️ <b>پروژه:</b> {p_name}",
            f"▫️ <b>خط محصول (Product Line):</b> {prod_name}",
        ]
        if prio_str:
            lines.append(f"▫️ <b>اولویت:</b> {prio_str}")
        if start_date:
            lines.append(f"▫️ <b>تاریخ شروع:</b> {start_date}")
        if end_date:
            lines.append(f"▫️ <b>تاریخ پایان:</b> {end_date}")
        if desc:
            lines.append(f"▫️ <b>توضیحات:</b> {desc}")
        lines.append("\nآیا اطلاعات بالا مورد تایید است؟")
        return "\n".join(lines)
    else:
        lines = [
            "📋 <b>Project Creation Preview:</b>\n",
            f"▫️ <b>Project:</b> {p_name}",
            f"▫️ <b>Product Line:</b> {prod_name}",
        ]
        if prio_str:
            lines.append(f"▫️ <b>Priority:</b> {prio_str}")
        if start_date:
            lines.append(f"▫️ <b>Start Date:</b> {start_date}")
        if end_date:
            lines.append(f"▫️ <b>End Date:</b> {end_date}")
        if desc:
            lines.append(f"▫️ <b>Description:</b> {desc}")
        lines.append("\nDo you want to create this project?")
        return "\n".join(lines)


def format_help_message(lang: str = "fa") -> str:
    """Return user-friendly guide with practical Persian and English examples."""
    if lang == "en":
        return (
            "🤖 <b>PMP Smart Assistant Guide</b>\n\n"
            "You can manage your tasks and projects using natural conversational messages in <b>English or Persian</b>:\n\n"
            "🔹 <b>Project Management:</b>\n"
            "• <i>«Create project Atlas»</i>\n"
            "• <i>«Status of project Atlas»</i>\n"
            "• <i>«List projects»</i> or <code>/projects</code>\n"
            "• <i>«Members of project Atlas»</i>\n"
            "• <i>«Add Alex to project Atlas»</i>\n\n"
            "🔹 <b>Sprint Management:</b>\n"
            "• <i>«Create 5 14-day sprints for Atlas»</i>\n"
            "• <i>«Current sprint»</i> or <code>/sprint</code>\n"
            "• <i>«Sprints of Atlas»</i>\n"
            "• <i>«Move this task to sprint 2»</i>\n"
            "• <i>«Move this task to backlog»</i>\n\n"
            "🔹 <b>Task Management:</b>\n"
            "• <i>«Create a task Fix login in project Atlas and assign to Alex»</i>\n"
            "• <i>«Create task in current sprint»</i>\n"
            "• <i>«View task 142»</i>\n"
            "• <i>«Assign task 142 to Alex»</i>\n"
            "• <i>«Set task 142 to Done»</i> or <i>«In Progress»</i>\n"
            "• <i>«Set due date to next Tuesday»</i>\n"
            "• <i>«Set priority to high»</i>\n"
            "• <i>«Add label backend, bug»</i>\n"
            "• <i>«Add comment to task: Fixed and verified»</i>\n\n"
            "🔹 <b>Reports & Analytics:</b>\n"
            "• <i>«My tasks»</i> or <code>/mytasks</code>\n"
            "• <i>«Overdue tasks»</i>\n"
            "• <i>«My dashboard»</i> or <code>/analytics</code>\n"
            "• <i>«Project health report»</i>\n"
            "• <i>«Create a ticket for QA team»</i>\n\n"
            "🔹 <b>Control Commands:</b>\n"
            "• <code>/menu</code> : Open interactive main menu\n"
            "• <code>/cancel</code> : Cancel ongoing operation\n"
            "• <code>/status</code> : Account connection status\n"
            "• <code>/help</code> : Show this guide & switch language\n"
            "• <code>/start</code> : Restart bot or reconnect"
        )

    return (
        "🤖 <b>راهنمای دستیار هوشمند پلتفرم مدیریت پروژه (PMP)</b>\n\n"
        "شما می‌توانید با پیام‌های گفتاری به زبان <b>فارسی یا انگلیسی</b> کارهای خود را مدیریت کنید:\n\n"
        "🔹 <b>مدیریت پروژه‌ها:</b>\n"
        "• <i>«پروژه Atlas را بساز»</i>\n"
        "• <i>«وضعیت پروژه Atlas را بگو»</i>\n"
        "• <i>«لیست پروژه‌ها»</i> یا <code>/projects</code>\n"
        "• <i>«اعضای پروژه Atlas»</i>\n"
        "• <i>«علی را به پروژه Atlas اضافه کن»</i>\n\n"
        "🔹 <b>مدیریت اسپرینت‌ها:</b>\n"
        "• <i>«۵ اسپرینت ۷ روزه برای Atlas بساز»</i>\n"
        "• <i>«اسپرینت فعلی»</i> یا <code>/sprint</code>\n"
        "• <i>«اسپرینت‌های پروژه Atlas»</i>\n"
        "• <i>«این تسک را به اسپرینت ۴ ببر»</i>\n"
        "• <i>«این تسک را به بک‌لاگ ببر»</i>\n\n"
        "🔹 <b>مدیریت تسک‌ها:</b>\n"
        "• <i>«برای پروژه PMP یک تسک برای رفع مشکل لاگین بساز و به علی بده»</i>\n"
        "• <i>«یک تسک به نام Fix login در اسپرینت فعلی بساز»</i>\n"
        "• <i>«تسک 142 را باز کن»</i>\n"
        "• <i>«تسک 142 را به علی و سارا بده»</i>\n"
        "• <i>«تسک 142 را Done کن»</i> یا <i>«تسک 142 را در حال انجام بگذار»</i>\n"
        "• <i>«ددلاینش را سه‌شنبه بگذار»</i>\n"
        "• <i>«اولویتش را بالا بگذار»</i>\n"
        "• <i>«لیبل‌های backend و urgent را اضافه کن»</i>\n"
        "• <i>«چک‌لیست اضافه کن: تست کد، مستندسازی»</i>\n"
        "• <i>«روی تسک 142 کامنت بگذار: بررسی شد»</i>\n\n"
        "🔹 <b>گزارش‌ها و جستجو:</b>\n"
        "• <i>«تسک‌های من»</i> یا <code>/mytasks</code>\n"
        "• <i>«تسک‌های علی»</i>\n"
        "• <i>«تسک‌های اسپرینت فعلی»</i>\n"
        "• <i>«تسک‌های عقب‌افتاده»</i>\n"
        "• <i>«تسک‌های تیم بکند»</i>\n"
        "• <i>«یک تیکت برای تیم QA بساز»</i>\n"
        "• <i>«داشبورد من»</i> یا <code>/analytics</code>\n\n"
        "🔹 <b>دستورات کنترلی:</b>\n"
        "• <code>/menu</code> : باز کردن منوی اصلی گزینه‌ها\n"
        "• <code>/cancel</code> یا <i>«لغو»</i> : لغو عملیات جاری\n"
        "• <code>/status</code> : وضعیت اتصال حساب\n"
        "• <code>/help</code> : راهنما و تغییر زبان\n"
        "• <code>/start</code> : اتصال یا شروع مجدد"
    )

