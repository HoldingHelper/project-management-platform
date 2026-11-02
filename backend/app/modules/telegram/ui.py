"""Telegram UI helpers: Dynamic permission-aware menus, inline keyboards, confirmation dialogs."""

from __future__ import annotations

from typing import Any, List, Optional
from uuid import UUID

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup

from app.modules.telegram.capabilities import UserCapabilities


def make_dynamic_main_menu(
    capabilities: UserCapabilities, lang: str = "fa"
) -> InlineKeyboardMarkup:
    """Build dynamic Telegram main menu strictly reflecting the user's effective permissions."""
    keyboard: List[List[InlineKeyboardButton]] = []

    # Row 1: My Work & Personal Tasks (Primary Workspace Hub)
    hub_row: List[InlineKeyboardButton] = []
    if capabilities.can_view_analytics:
        hub_row.append(
            InlineKeyboardButton(
                text="📊 کارهای من و داشبورد" if lang == "fa" else "📊 My Work & Dash",
                callback_data="menu:analytics",
            )
        )
    if capabilities.can_view_tasks:
        hub_row.append(
            InlineKeyboardButton(
                text="📋 تسک‌های من" if lang == "fa" else "📋 My Tasks",
                callback_data="menu:mytasks",
            )
        )
    if hub_row:
        keyboard.append(hub_row)

    # Row 2: Projects
    proj_row: List[InlineKeyboardButton] = []
    if capabilities.can_view_projects:
        proj_row.append(
            InlineKeyboardButton(
                text="📁 پروژه‌ها" if lang == "fa" else "📁 Projects",
                callback_data="menu:projects",
            )
        )
    if capabilities.can_create_project:
        proj_row.append(
            InlineKeyboardButton(
                text="🏢 ساخت پروژه" if lang == "fa" else "🏢 Create Project",
                callback_data="menu:create_project",
            )
        )
    if proj_row:
        keyboard.append(proj_row)

    # Row 3: Create Task & Sprints
    action_row: List[InlineKeyboardButton] = []
    if capabilities.can_create_task:
        action_row.append(
            InlineKeyboardButton(
                text="➕ تسک جدید" if lang == "fa" else "➕ New Task",
                callback_data="menu:create_task",
            )
        )
    if capabilities.can_view_sprints or capabilities.can_create_sprint:
        action_row.append(
            InlineKeyboardButton(
                text="🚀 اسپرینت جاری" if lang == "fa" else "🚀 Current Sprint",
                callback_data="menu:current_sprint",
            )
        )
    if action_row:
        keyboard.append(action_row)

    # Row 4: Docs
    support_row: List[InlineKeyboardButton] = []
    if capabilities.can_search_docs:
        support_row.append(
            InlineKeyboardButton(
                text="📚 مستندات" if lang == "fa" else "📚 Docs",
                callback_data="menu:docs",
            )
        )
    if support_row:
        keyboard.append(support_row)

    # Row 5: Help & Language Switcher
    keyboard.append(
        [
            InlineKeyboardButton(
                text="❓ راهنما" if lang == "fa" else "❓ Help",
                callback_data="menu:help",
            ),
            InlineKeyboardButton(
                text="🌐 تغییر زبان (Language)" if lang == "fa" else "🌐 Switch Language",
                callback_data="menu:language",
            ),
        ]
    )

    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def make_persistent_reply_keyboard(
    capabilities: UserCapabilities, lang: str = "fa"
) -> ReplyKeyboardMarkup:
    """Build persistent custom keyboard docked in the Telegram input field.
    
    This provides the persistent '⌘' / keyboard toggle button on the right side
    of the Telegram message bar, allowing users to toggle and view the menu at any time.
    """
    keyboard: List[List[KeyboardButton]] = []

    # Row 1: Primary My Work & Tasks
    row1: List[KeyboardButton] = []
    if capabilities.can_view_analytics:
        row1.append(KeyboardButton(text="📊 کارهای من" if lang == "fa" else "📊 My Work"))
    if capabilities.can_view_tasks:
        row1.append(KeyboardButton(text="📋 تسک‌های من" if lang == "fa" else "📋 My Tasks"))
    if row1:
        keyboard.append(row1)

    # Row 2: Create Task & Projects
    row2: List[KeyboardButton] = []
    if capabilities.can_create_task:
        row2.append(KeyboardButton(text="➕ تسک جدید" if lang == "fa" else "➕ New Task"))
    if capabilities.can_view_projects:
        row2.append(KeyboardButton(text="📁 پروژه‌ها" if lang == "fa" else "📁 Projects"))
    if row2:
        keyboard.append(row2)

    # Row 3: Create Project
    row3: List[KeyboardButton] = []
    if capabilities.can_create_project:
        row3.append(KeyboardButton(text="🏢 ساخت پروژه" if lang == "fa" else "🏢 New Project"))
    if row3:
        keyboard.append(row3)

    # Row 4: Help & Language Switch
    row4: List[KeyboardButton] = [
        KeyboardButton(text="❓ راهنما" if lang == "fa" else "❓ Help"),
        KeyboardButton(text="🌐 تغییر زبان" if lang == "fa" else "🌐 Language"),
    ]
    keyboard.append(row4)

    return ReplyKeyboardMarkup(
        keyboard=keyboard,
        resize_keyboard=True,
        is_persistent=True,
        input_field_placeholder="پیام یا دستور خود را بنویسید..." if lang == "fa" else "Enter a message or command...",
    )


def make_analytics_menu_keyboard(
    report_type: str = "personal",
    pending_count: int = 0,
    late_count: int = 0,
    upcoming_count: int = 0,
    can_view_exec: bool = False,
    task_action_ids: Optional[List[tuple[str, str]]] = None,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build rich, interactive navigation keyboard for My Work & Analytics."""
    rows: List[List[InlineKeyboardButton]] = []

    if report_type in ("personal", "my_work", "refresh"):
        # Primary My Work action rows
        row1 = [
            InlineKeyboardButton(
                text=f"⚡️ نیاز به اقدام ({pending_count})" if lang == "fa" else f"⚡️ Needs Me ({pending_count})",
                callback_data="an:pending",
            ),
            InlineKeyboardButton(
                text=f"⏰ با تاخیر ({late_count})" if lang == "fa" else f"⏰ Late ({late_count})",
                callback_data="an:late",
            ),
        ]
        rows.append(row1)

        row2 = [
            InlineKeyboardButton(
                text=f"📅 مهلت‌های ۷ روزه ({upcoming_count})" if lang == "fa" else f"📅 Upcoming 7d ({upcoming_count})",
                callback_data="an:upcoming",
            ),
            InlineKeyboardButton(
                text="🏃 آمار اسپرینت من" if lang == "fa" else "🏃 My Sprint",
                callback_data="an:sprint",
            ),
        ]
        rows.append(row2)

        row3 = [
            InlineKeyboardButton(
                text="🩺 سلامت پروژه‌ها" if lang == "fa" else "🩺 Project Health",
                callback_data="an:health",
            ),
        ]
        if can_view_exec:
            row3.append(
                InlineKeyboardButton(
                    text="🏢 داشبورد سازمانی" if lang == "fa" else "🏢 Executive",
                    callback_data="an:exec",
                )
            )
        rows.append(row3)

        row4 = [
            InlineKeyboardButton(
                text="🔄 به‌روزرسانی" if lang == "fa" else "🔄 Refresh",
                callback_data="an:refresh",
            ),
            InlineKeyboardButton(
                text="📋 منوی اصلی" if lang == "fa" else "📋 Main Menu",
                callback_data="menu:main",
            ),
        ]
        rows.append(row4)

    else:
        # Sub-view specific action buttons (e.g. for pending/late tasks)
        if task_action_ids:
            for tid, title in task_action_ids[:3]:
                short_t = title[:15] + "..." if len(title) > 15 else title
                rows.append([
                    InlineKeyboardButton(
                        text=f"👁 {short_t}",
                        callback_data=f"task_act:view:{tid}",
                    ),
                    InlineKeyboardButton(
                        text="✅ انجام شد" if lang == "fa" else "✅ Done",
                        callback_data=f"task_st:{tid}:Done",
                    ),
                ])

        # Sub-view navigation
        nav_row = [
            InlineKeyboardButton(
                text="📊 کارهای من (My Work)" if lang == "fa" else "📊 My Work",
                callback_data="an:my_work",
            ),
            InlineKeyboardButton(
                text="🔄 به‌روزرسانی" if lang == "fa" else "🔄 Refresh",
                callback_data=f"an:{report_type}",
            ),
        ]
        rows.append(nav_row)

        if can_view_exec and report_type in ("exec", "executive", "health"):
            rows.append([
                InlineKeyboardButton(
                    text="👥 بار کاری تیم" if lang == "fa" else "👥 Team Workload",
                    callback_data="an:workload",
                )
            ])

        rows.append([
            InlineKeyboardButton(
                text="📋 منوی اصلی" if lang == "fa" else "📋 Main Menu",
                callback_data="menu:main",
            )
        ])

    return InlineKeyboardMarkup(inline_keyboard=rows)


def make_task_actions_keyboard(
    task_id: UUID | str,
    current_status: str,
    capabilities: Optional[UserCapabilities] = None,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build permission-aware quick action inline buttons for a task."""
    tid = str(task_id)
    buttons: List[List[InlineKeyboardButton]] = []

    # Quick status transitions (only if permitted)
    can_status = capabilities.can_change_task_status if capabilities else True
    if can_status:
        status_row = []
        if current_status != "InProgress":
            status_row.append(
                InlineKeyboardButton(
                    text="▶️ شروع کار" if lang == "fa" else "▶️ Start",
                    callback_data=f"task_st:{tid}:InProgress",
                )
            )
        if current_status != "Done":
            status_row.append(
                InlineKeyboardButton(
                    text="✅ انجام شد" if lang == "fa" else "✅ Done",
                    callback_data=f"task_st:{tid}:Done",
                )
            )
        if current_status != "Blocked":
            status_row.append(
                InlineKeyboardButton(
                    text="🚫 مسدود" if lang == "fa" else "🚫 Block",
                    callback_data=f"task_st:{tid}:Blocked",
                )
            )
        if status_row:
            buttons.append(status_row)

    # Management & Edit buttons (only if permitted)
    mgmt_row: List[InlineKeyboardButton] = []
    if capabilities is None or capabilities.can_edit_task:
        mgmt_row.append(
            InlineKeyboardButton(
                text="✏️ ویرایش تسک" if lang == "fa" else "✏️ Edit Task",
                callback_data=f"task_act:edit:{tid}",
            )
        )
    if capabilities is None or capabilities.can_assign_task:
        mgmt_row.append(
            InlineKeyboardButton(
                text="👤 ارجاع" if lang == "fa" else "👤 Assign",
                callback_data=f"task_act:assign:{tid}",
            )
        )
    if capabilities is None or capabilities.can_add_comment:
        mgmt_row.append(
            InlineKeyboardButton(
                text="💬 نظر" if lang == "fa" else "💬 Comment",
                callback_data=f"task_act:comment:{tid}",
            )
        )
    if mgmt_row:
        buttons.append(mgmt_row)

    # Navigation buttons: Back to My Tasks & Main Menu
    buttons.append([
        InlineKeyboardButton(
            text="🔙 تسک‌های من" if lang == "fa" else "🔙 My Tasks",
            callback_data="menu:mytasks",
        ),
        InlineKeyboardButton(
            text="📋 منوی اصلی" if lang == "fa" else "📋 Main Menu",
            callback_data="menu:main",
        ),
    ])

    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_my_tasks_keyboard(
    tasks: Sequence[Any],
    capabilities: Optional[UserCapabilities] = None,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build interactive task selector buttons for the My Tasks list view."""
    buttons: List[List[InlineKeyboardButton]] = []

    for t in tasks[:15]:
        tid = str(getattr(t, "id", t))
        title = getattr(t, "title", "Task")
        st = str(getattr(t, "status", ""))
        icon = "✅" if st in ("Done", "completed") else ("🟡" if st in ("InProgress", "in-progress") else ("🚫" if st in ("Blocked", "blocked") else "📌"))
        buttons.append([
            InlineKeyboardButton(
                text=f"{icon} #{tid[:8]} {title[:32]}",
                callback_data=f"task_act:view:{tid}",
            )
        ])

    action_row: List[InlineKeyboardButton] = []
    if capabilities is None or capabilities.can_create_task:
        action_row.append(
            InlineKeyboardButton(
                text="➕ تسک جدید" if lang == "fa" else "➕ New Task",
                callback_data="menu:create_task",
            )
        )
    action_row.append(
        InlineKeyboardButton(
            text="📋 منوی اصلی" if lang == "fa" else "📋 Main Menu",
            callback_data="menu:main",
        )
    )
    buttons.append(action_row)
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_task_edit_menu_keyboard(
    task_id: UUID | str,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build field selection keyboard for editing a task."""
    tid = str(task_id)
    buttons = [
        [
            InlineKeyboardButton(
                text="🏷 عنوان تسک" if lang == "fa" else "🏷 Task Title",
                callback_data=f"task_ed:title:{tid}",
            ),
            InlineKeyboardButton(
                text="📝 توضیحات" if lang == "fa" else "📝 Description",
                callback_data=f"task_ed:desc:{tid}",
            ),
        ],
        [
            InlineKeyboardButton(
                text="⚡️ اولویت" if lang == "fa" else "⚡️ Priority",
                callback_data=f"task_ed:prio:{tid}",
            ),
            InlineKeyboardButton(
                text="🔄 وضعیت" if lang == "fa" else "🔄 Status",
                callback_data=f"task_ed:stat:{tid}",
            ),
        ],
        [
            InlineKeyboardButton(
                text="📅 مهلت انجام (ددلاین)" if lang == "fa" else "📅 Due Date",
                callback_data=f"task_ed:due:{tid}",
            ),
        ],
        [
            InlineKeyboardButton(
                text="🔙 مشخصات تسک" if lang == "fa" else "🔙 Back to Task",
                callback_data=f"task_act:view:{tid}",
            ),
            InlineKeyboardButton(
                text="🔙 تسک‌های من" if lang == "fa" else "🔙 My Tasks",
                callback_data="menu:mytasks",
            ),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_task_priority_keyboard(
    task_id: UUID | str,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build priority selection buttons for a task."""
    tid = str(task_id)
    buttons = [
        [
            InlineKeyboardButton(
                text="🔴 فوری (P0)" if lang == "fa" else "🔴 Urgent (P0)",
                callback_data=f"task_prio:{tid}:P0",
            ),
            InlineKeyboardButton(
                text="🟠 بالا (P1)" if lang == "fa" else "🟠 High (P1)",
                callback_data=f"task_prio:{tid}:P1",
            ),
        ],
        [
            InlineKeyboardButton(
                text="🟡 متوسط (P2)" if lang == "fa" else "🟡 Medium (P2)",
                callback_data=f"task_prio:{tid}:P2",
            ),
            InlineKeyboardButton(
                text="🟢 پایین (P3)" if lang == "fa" else "🟢 Low (P3)",
                callback_data=f"task_prio:{tid}:P3",
            ),
        ],
        [
            InlineKeyboardButton(
                text="🔙 بازگشت به ویرایش" if lang == "fa" else "🔙 Back to Edit",
                callback_data=f"task_act:edit:{tid}",
            ),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_task_status_keyboard(
    task_id: UUID | str,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build status selection buttons for a task."""
    tid = str(task_id)
    buttons = [
        [
            InlineKeyboardButton(
                text="📋 در انتظار (Ready)" if lang == "fa" else "📋 Ready",
                callback_data=f"task_st:{tid}:Ready",
            ),
            InlineKeyboardButton(
                text="🟡 در حال انجام" if lang == "fa" else "🟡 In Progress",
                callback_data=f"task_st:{tid}:InProgress",
            ),
        ],
        [
            InlineKeyboardButton(
                text="🔍 در حال بررسی" if lang == "fa" else "🔍 In Review",
                callback_data=f"task_st:{tid}:InReview",
            ),
            InlineKeyboardButton(
                text="🚫 مسدود" if lang == "fa" else "🚫 Blocked",
                callback_data=f"task_st:{tid}:Blocked",
            ),
        ],
        [
            InlineKeyboardButton(
                text="✅ انجام شده" if lang == "fa" else "✅ Done",
                callback_data=f"task_st:{tid}:Done",
            ),
        ],
        [
            InlineKeyboardButton(
                text="🔙 بازگشت به ویرایش" if lang == "fa" else "🔙 Back to Edit",
                callback_data=f"task_act:edit:{tid}",
            ),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_projects_list_keyboard(
    projects: Sequence[Any],
    capabilities: Optional[UserCapabilities] = None,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build interactive project selector buttons for the projects list."""
    buttons: List[List[InlineKeyboardButton]] = []

    # 1 button per project with name and progress
    for p in projects[:15]:
        pid = str(getattr(p, "id", p))
        pname = getattr(p, "name", "Project")
        prog = f"{getattr(p, 'progress_percentage', 0):.0f}%"
        buttons.append([
            InlineKeyboardButton(
                text=f"📁 {pname[:35]} ({prog})",
                callback_data=f"proj_act:view:{pid}",
            )
        ])

    extra_row: List[InlineKeyboardButton] = []
    if capabilities is None or capabilities.can_create_project:
        extra_row.append(
            InlineKeyboardButton(
                text="➕ ساخت پروژه جدید" if lang == "fa" else "➕ New Project",
                callback_data="menu:create_project",
            )
        )
    extra_row.append(
        InlineKeyboardButton(
            text="📋 منوی اصلی" if lang == "fa" else "📋 Main Menu",
            callback_data="menu:main",
        )
    )
    buttons.append(extra_row)
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_project_actions_keyboard(
    project_id: UUID | str,
    capabilities: Optional[UserCapabilities] = None,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build rich permission-aware action buttons for a project."""
    pid = str(project_id)
    buttons: List[List[InlineKeyboardButton]] = []

    # Row 1: Tasks & Sprints
    row1 = [
        InlineKeyboardButton(
            text="📋 مشاهده تسک‌ها" if lang == "fa" else "📋 View Tasks",
            callback_data=f"proj_act:tasks:{pid}",
        ),
        InlineKeyboardButton(
            text="🏃 اسپرینت‌ها" if lang == "fa" else "🏃 Sprints",
            callback_data=f"proj_act:sprints:{pid}",
        ),
    ]
    buttons.append(row1)

    # Row 2: Edit & New Task
    row2: List[InlineKeyboardButton] = []
    if capabilities is None or capabilities.can_manage_project or capabilities.can_create_project:
        row2.append(
            InlineKeyboardButton(
                text="✏️ ویرایش پروژه" if lang == "fa" else "✏️ Edit Project",
                callback_data=f"proj_act:edit:{pid}",
            )
        )
    if capabilities is None or capabilities.can_create_task:
        row2.append(
            InlineKeyboardButton(
                text="➕ ایجاد تسک" if lang == "fa" else "➕ New Task",
                callback_data=f"proj_act:new_task:{pid}",
            )
        )
    if row2:
        buttons.append(row2)

    # Row 3: New Sprint & Members
    row3: List[InlineKeyboardButton] = []
    if capabilities is None or capabilities.can_create_sprint:
        row3.append(
            InlineKeyboardButton(
                text="🚀 ساخت اسپرینت" if lang == "fa" else "🚀 New Sprint",
                callback_data=f"proj_act:new_sprint:{pid}",
            )
        )
    if capabilities is None or capabilities.can_manage_project_members or capabilities.can_view_projects:
        row3.append(
            InlineKeyboardButton(
                text="👥 اعضای پروژه" if lang == "fa" else "👥 Members",
                callback_data=f"proj_act:members:{pid}",
            )
        )
    if row3:
        buttons.append(row3)

    # Row 4: Navigation
    buttons.append([
        InlineKeyboardButton(
            text="🔙 لیست پروژه‌ها" if lang == "fa" else "🔙 Projects List",
            callback_data="menu:projects",
        ),
        InlineKeyboardButton(
            text="📋 منوی اصلی" if lang == "fa" else "📋 Main Menu",
            callback_data="menu:main",
        ),
    ])

    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_project_edit_menu_keyboard(
    project_id: UUID | str,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build edit field choices for a project."""
    pid = str(project_id)
    buttons = [
        [
            InlineKeyboardButton(text="📝 ویرایش نام" if lang == "fa" else "📝 Edit Name", callback_data=f"proj_ed:name:{pid}"),
            InlineKeyboardButton(text="📄 ویرایش توضیحات" if lang == "fa" else "📄 Edit Description", callback_data=f"proj_ed:desc:{pid}"),
        ],
        [
            InlineKeyboardButton(text="📊 تغییر وضعیت" if lang == "fa" else "📊 Change Status", callback_data=f"proj_ed:stat:{pid}"),
            InlineKeyboardButton(text="⚡️ تغییر اولویت" if lang == "fa" else "⚡️ Change Priority", callback_data=f"proj_ed:prio:{pid}"),
        ],
        [
            InlineKeyboardButton(text="💰 تغییر بودجه" if lang == "fa" else "💰 Change Budget", callback_data=f"proj_ed:budget:{pid}"),
        ],
        [
            InlineKeyboardButton(text="🔙 بازگشت به مشخصات پروژه" if lang == "fa" else "🔙 Back to Project", callback_data=f"proj_act:view:{pid}"),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_project_status_keyboard(
    project_id: UUID | str,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build status selection keyboard for a project."""
    pid = str(project_id)
    buttons = [
        [
            InlineKeyboardButton(text="⚪️ شروع نشده" if lang == "fa" else "⚪️ Not Started", callback_data=f"proj_set:stat:{pid}:not-started"),
            InlineKeyboardButton(text="🟡 در حال انجام" if lang == "fa" else "🟡 In Progress", callback_data=f"proj_set:stat:{pid}:in-progress"),
        ],
        [
            InlineKeyboardButton(text="✅ تکمیل شده" if lang == "fa" else "✅ Completed", callback_data=f"proj_set:stat:{pid}:completed"),
            InlineKeyboardButton(text="⏸ متوقف شده" if lang == "fa" else "⏸ On Hold", callback_data=f"proj_set:stat:{pid}:on-hold"),
        ],
        [
            InlineKeyboardButton(text="📦 آرشیو شده" if lang == "fa" else "📦 Archived", callback_data=f"proj_set:stat:{pid}:archived"),
        ],
        [
            InlineKeyboardButton(text="🔙 بازگشت" if lang == "fa" else "🔙 Back", callback_data=f"proj_act:view:{pid}"),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_project_priority_keyboard(
    project_id: UUID | str,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build priority selection keyboard for a project."""
    pid = str(project_id)
    buttons = [
        [
            InlineKeyboardButton(text="🔥 P0 - بحرانی" if lang == "fa" else "🔥 P0 - Critical", callback_data=f"proj_set:prio:{pid}:P0"),
            InlineKeyboardButton(text="⚡️ P1 - بالا" if lang == "fa" else "⚡️ P1 - High", callback_data=f"proj_set:prio:{pid}:P1"),
        ],
        [
            InlineKeyboardButton(text="🔹 P2 - متوسط" if lang == "fa" else "🔹 P2 - Medium", callback_data=f"proj_set:prio:{pid}:P2"),
            InlineKeyboardButton(text="▫️ P3 - پایین" if lang == "fa" else "▫️ P3 - Low", callback_data=f"proj_set:prio:{pid}:P3"),
        ],
        [
            InlineKeyboardButton(text="🔙 بازگشت" if lang == "fa" else "🔙 Back", callback_data=f"proj_act:view:{pid}"),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_project_tasks_keyboard(
    project_id: UUID | str,
    tasks: Sequence[Any],
    capabilities: Optional[UserCapabilities] = None,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build tasks list keyboard for a project."""
    pid = str(project_id)
    buttons: List[List[InlineKeyboardButton]] = []
    for t in tasks[:10]:
        tid = str(getattr(t, "id", t))
        title = getattr(t, "title", "Task")
        st = getattr(t, "status", "")
        icon = "✅" if st in ("Done", "completed") else ("🟡" if st in ("InProgress", "in-progress") else "📌")
        buttons.append([
            InlineKeyboardButton(
                text=f"{icon} #{tid[:8]} {title[:28]}",
                callback_data=f"task_act:view:{tid}",
            )
        ])

    row: List[InlineKeyboardButton] = []
    if capabilities is None or capabilities.can_create_task:
        row.append(
            InlineKeyboardButton(
                text="➕ ایجاد تسک" if lang == "fa" else "➕ New Task",
                callback_data=f"proj_act:new_task:{pid}",
            )
        )
    row.append(
        InlineKeyboardButton(
            text="🔙 مشخصات پروژه" if lang == "fa" else "🔙 Project Details",
            callback_data=f"proj_act:view:{pid}",
        )
    )
    buttons.append(row)
    buttons.append([
        InlineKeyboardButton(
            text="🔙 لیست پروژه‌ها" if lang == "fa" else "🔙 Projects List",
            callback_data="menu:projects",
        ),
        InlineKeyboardButton(
            text="📋 منوی اصلی" if lang == "fa" else "📋 Main Menu",
            callback_data="menu:main",
        ),
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_project_sprints_keyboard(
    project_id: UUID | str,
    capabilities: Optional[UserCapabilities] = None,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build sprints view keyboard for a project."""
    pid = str(project_id)
    buttons: List[List[InlineKeyboardButton]] = []
    row: List[InlineKeyboardButton] = []
    if capabilities is None or capabilities.can_create_sprint:
        row.append(
            InlineKeyboardButton(
                text="🚀 ساخت اسپرینت جدید" if lang == "fa" else "🚀 New Sprint",
                callback_data=f"proj_act:new_sprint:{pid}",
            )
        )
    row.append(
        InlineKeyboardButton(
            text="🔙 مشخصات پروژه" if lang == "fa" else "🔙 Project Details",
            callback_data=f"proj_act:view:{pid}",
        )
    )
    buttons.append(row)
    buttons.append([
        InlineKeyboardButton(
            text="🔙 لیست پروژه‌ها" if lang == "fa" else "🔙 Projects List",
            callback_data="menu:projects",
        ),
        InlineKeyboardButton(
            text="📋 منوی اصلی" if lang == "fa" else "📋 Main Menu",
            callback_data="menu:main",
        ),
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_disambiguation_keyboard(
    entity_type: str,
    candidates: List[Any],
    label_attr: str = "title",
    id_attr: str = "id",
    extra_sub_attr: Optional[str] = None,
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build an inline selection keyboard when entity resolution is ambiguous."""
    buttons: List[List[InlineKeyboardButton]] = []

    for item in candidates[:5]:
        item_id = str(getattr(item, id_attr, ""))
        label = str(getattr(item, label_attr, item_id))
        if extra_sub_attr and hasattr(item, extra_sub_attr):
            sub = getattr(item, extra_sub_attr)
            if sub:
                label = f"{label} ({sub})"

        cb_data = f"select:{entity_type}:{item_id}"
        buttons.append([InlineKeyboardButton(text=f"📌 {label[:45]}", callback_data=cb_data)])

    # Cancel button
    cancel_label = "❌ لغو" if lang == "fa" else "❌ Cancel"
    buttons.append([InlineKeyboardButton(text=cancel_label, callback_data="cancel:flow")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_project_selection_keyboard(
    projects: Sequence[Any],
    cancel_callback: str = "cancel:flow",
    lang: str = "fa",
) -> InlineKeyboardMarkup:
    """Build inline buttons for selecting a project when creating a task."""
    buttons: List[List[InlineKeyboardButton]] = []
    for p in projects[:12]:
        pid = str(getattr(p, "id", p))
        name = getattr(p, "name", pid)
        buttons.append([
            InlineKeyboardButton(text=f"📁 {name[:40]}", callback_data=f"task_proj:{pid}")
        ])
    cancel_label = "❌ انصراف" if lang == "fa" else "❌ Cancel"
    buttons.append([
        InlineKeyboardButton(text=cancel_label, callback_data=cancel_callback)
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def make_confirmation_keyboard(token: str, lang: str = "fa") -> InlineKeyboardMarkup:
    """Build an inline keyboard for approving or rejecting a high-impact operation."""
    confirm_label = "✅ تایید" if lang == "fa" else "✅ Confirm"
    cancel_label = "❌ لغو" if lang == "fa" else "❌ Cancel"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text=confirm_label, callback_data=f"confirm:{token}"),
                InlineKeyboardButton(text=cancel_label, callback_data=f"cancel:{token}"),
            ]
        ]
    )


def make_pagination_keyboard(
    prefix: str, current_page: int, total_pages: int, lang: str = "fa"
) -> Optional[InlineKeyboardMarkup]:
    """Build pagination inline buttons."""
    if total_pages <= 1:
        return None

    prev_label = "⬅️ قبلی" if lang == "fa" else "⬅️ Previous"
    next_label = "بعدی ➡️" if lang == "fa" else "Next ➡️"
    row: List[InlineKeyboardButton] = []
    if current_page > 1:
        row.append(InlineKeyboardButton(text=prev_label, callback_data=f"{prefix}:{current_page - 1}"))
    row.append(InlineKeyboardButton(text=f"{current_page} / {total_pages}", callback_data="noop"))
    if current_page < total_pages:
        row.append(InlineKeyboardButton(text=next_label, callback_data=f"{prefix}:{current_page + 1}"))

    return InlineKeyboardMarkup(inline_keyboard=[row])


def make_product_line_selection_keyboard(
    products: List[Any], token: str, lang: str = "fa"
) -> InlineKeyboardMarkup:
    """Build inline buttons for selecting an authorized product line during project creation."""
    keyboard: List[List[InlineKeyboardButton]] = []
    for prod in products:
        prod_id = getattr(prod, "id", "")
        prod_id_str = getattr(prod_id, "hex", str(prod_id))
        keyboard.append(
            [
                InlineKeyboardButton(
                    text=f"🏢 {prod.name}",
                    callback_data=f"proj_prod:{token}:{prod_id_str}",
                )
            ]
        )

    # Cancel button
    keyboard.append(
        [
            InlineKeyboardButton(
                text="❌ لغو" if lang == "fa" else "❌ Cancel",
                callback_data=f"cancel:{token}",
            )
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def make_project_preview_keyboard(token: str, lang: str = "fa") -> InlineKeyboardMarkup:
    """Build inline buttons for project preview: Create, Change Product Line, Cancel."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 ایجاد Project" if lang == "fa" else "🚀 Create Project",
                    callback_data=f"proj_ok:{token}",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🔄 تغییر Product Line" if lang == "fa" else "🔄 Change Product Line",
                    callback_data=f"proj_chg:{token}",
                )
            ],
            [
                InlineKeyboardButton(
                    text="❌ لغو" if lang == "fa" else "❌ Cancel",
                    callback_data=f"cancel:{token}",
                )
            ],
        ]
    )


def make_help_keyboard(lang: str = "fa") -> InlineKeyboardMarkup:
    """Build keyboard for help section with language switch options and main menu."""
    is_fa = lang == "fa"
    lang_row = [
        InlineKeyboardButton(
            text="🇮🇷 فارسی" + (" ✅" if is_fa else ""),
            callback_data="set_lang:fa",
        ),
        InlineKeyboardButton(
            text="🇬🇧 English" + (" ✅" if not is_fa else ""),
            callback_data="set_lang:en",
        ),
    ]
    menu_row = [
        InlineKeyboardButton(
            text="📋 منوی اصلی گزینه‌ها" if is_fa else "📋 Main Menu Options",
            callback_data="menu:main",
        )
    ]
    return InlineKeyboardMarkup(inline_keyboard=[lang_row, menu_row])
