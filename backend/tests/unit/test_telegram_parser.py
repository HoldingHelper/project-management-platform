"""Unit tests for deterministic NLP parser in Persian and English."""

from __future__ import annotations

import pytest

from app.modules.telegram.nlp.deterministic import parse_deterministic_intent
from app.modules.telegram.schemas import (
    AddCommentIntent,
    AddProjectMemberIntent,
    AssignTaskIntent,
    CancelIntent,
    CreateMilestoneIntent,
    CreateProjectIntent,
    CreateSprintBatchIntent,
    CreateTaskIntent,
    CreateTicketIntent,
    HelpIntent,
    ListProjectMembersIntent,
    ListProjectsIntent,
    ListSprintsIntent,
    MoveTaskIntent,
    RemoveProjectMemberIntent,
    SearchTasksIntent,
    UpdateProjectIntent,
    UpdateTaskDetailsIntent,
    UpdateTaskStatusIntent,
    ViewCurrentSprintIntent,
    ViewProjectStatusIntent,
    ViewTaskIntent,
    ViewAnalyticsIntent,
)


def test_parse_project_creation_and_status():
    # Persian: "پروژه Atlas را بساز"
    res1 = parse_deterministic_intent("پروژه Atlas را بساز")
    assert isinstance(res1, CreateProjectIntent)
    assert res1.name == "Atlas"

    # English: "Create a project named Atlas"
    res2 = parse_deterministic_intent("Create a project named Atlas")
    assert isinstance(res2, CreateProjectIntent)
    assert res2.name == "Atlas"

    # Status: "وضعیت پروژه Atlas را بگو"
    res3 = parse_deterministic_intent("وضعیت پروژه Atlas را بگو")
    assert isinstance(res3, ViewProjectStatusIntent)
    assert res3.project_name == "Atlas"

    # List projects
    res4 = parse_deterministic_intent("لیست پروژه‌ها")
    assert isinstance(res4, ListProjectsIntent)

    # Update description: "توضیحات پروژه Atlas را به پلتفرم اصلی تغییر بده"
    res5 = parse_deterministic_intent("توضیحات پروژه Atlas را به پلتفرم اصلی تغییر بده")
    assert isinstance(res5, UpdateProjectIntent)
    assert res5.project_name == "Atlas"
    assert "پلتفرم اصلی" in (res5.description or "")


def test_parse_sprint_commands():
    # Sprints batch: "۵ اسپرینت ۷ روزه برای Atlas بساز"
    res1 = parse_deterministic_intent("۵ اسپرینت ۷ روزه برای Atlas بساز")
    assert isinstance(res1, CreateSprintBatchIntent)
    assert res1.count == 5
    assert res1.duration_days == 7
    assert res1.project_name == "Atlas"

    # English: "Create 5 seven-day sprints for Atlas starting next Monday"
    res2 = parse_deterministic_intent("Create 5 seven-day sprints for Atlas starting next Monday")
    assert isinstance(res2, CreateSprintBatchIntent)
    assert res2.count == 5
    assert res2.duration_days == 7
    assert res2.project_name == "Atlas"
    assert res2.start_date is not None

    # User request: "Create 5 14-day sprints" (without project)
    res_en_no_proj = parse_deterministic_intent("Create 5 14-day sprints")
    assert isinstance(res_en_no_proj, CreateSprintBatchIntent)
    assert res_en_no_proj.count == 5
    assert res_en_no_proj.duration_days == 14
    assert res_en_no_proj.project_name is None

    # English with project: "Create 5 14-day sprints for Atlas"
    res_en_with_proj = parse_deterministic_intent("Create 5 14-day sprints for Atlas")
    assert isinstance(res_en_with_proj, CreateSprintBatchIntent)
    assert res_en_with_proj.count == 5
    assert res_en_with_proj.duration_days == 14
    assert res_en_with_proj.project_name == "Atlas"

    # Persian without project: "۵ اسپرینت ۱۴ روزه بساز"
    res_fa_no_proj = parse_deterministic_intent("۵ اسپرینت ۱۴ روزه بساز")
    assert isinstance(res_fa_no_proj, CreateSprintBatchIntent)
    assert res_fa_no_proj.count == 5
    assert res_fa_no_proj.duration_days == 14
    assert res_fa_no_proj.project_name is None

    # Persian with "برای پروژه ...": "۵ اسپرینت ۷ روزه برای پروژه Atlas بساز"
    res_fa_with_proj = parse_deterministic_intent("۵ اسپرینت ۷ روزه برای پروژه Atlas بساز")
    assert isinstance(res_fa_with_proj, CreateSprintBatchIntent)
    assert res_fa_with_proj.count == 5
    assert res_fa_with_proj.duration_days == 7
    assert res_fa_with_proj.project_name == "Atlas"

    res_fa_with_proj2 = parse_deterministic_intent("۵ تا اسپرینت دو هفته ای برای پروژه تست بساز")
    assert isinstance(res_fa_with_proj2, CreateSprintBatchIntent)
    assert res_fa_with_proj2.count == 5
    assert res_fa_with_proj2.duration_days == 14
    assert res_fa_with_proj2.project_name == "تست"

    # Current sprint: "اسپرینت فعلی"
    res3 = parse_deterministic_intent("اسپرینت فعلی")
    assert isinstance(res3, ViewCurrentSprintIntent)

    # Move task to backlog: "این تسک را به بکلاگ ببر"
    res4 = parse_deterministic_intent("این تسک را به بکلاگ ببر")
    assert isinstance(res4, MoveTaskIntent)
    assert res4.to_backlog is True

    # Move task to sprint: "این تسک را به Sprint 4 ببر"
    res5 = parse_deterministic_intent("این تسک را به Sprint 4 ببر")
    assert isinstance(res5, MoveTaskIntent)
    assert res5.target_sprint_name_or_number == "4"


def test_parse_task_creation():
    # Full command: "برای پروژه PMP یک تسک برای رفع مشکل لاگین بساز و به علی بده"
    res1 = parse_deterministic_intent("برای پروژه PMP یک تسک برای رفع مشکل لاگین بساز و به علی بده")
    assert isinstance(res1, CreateTaskIntent)
    assert res1.project_name == "PMP"
    assert "رفع مشکل لاگین" in res1.title
    assert "علی" in res1.assignee_names

    # Simple: "یک تسک به نام Fix login بساز"
    res2 = parse_deterministic_intent("یک تسک به نام Fix login بساز")
    assert isinstance(res2, CreateTaskIntent)
    assert "Fix login" in res2.title

    # English: "Create a task called 'Fix login redirect' in the current sprint"
    res3 = parse_deterministic_intent("Create a task called 'Fix login redirect' in the current sprint")
    assert isinstance(res3, CreateTaskIntent)
    assert res3.title == "Fix login redirect"
    assert res3.in_current_sprint is True


def test_parse_task_assignment_and_status():
    # Assignment: "تسک 142 را به علی و سارا بده"
    res1 = parse_deterministic_intent("تسک 142 را به علی و سارا بده")
    assert isinstance(res1, AssignTaskIntent)
    assert res1.task_id_or_title == "142"
    assert "علی" in res1.assignee_names
    assert "سارا" in res1.assignee_names

    # English: "Assign task 142 to Reza and Sara"
    res2 = parse_deterministic_intent("Assign task 142 to Reza and Sara")
    assert isinstance(res2, AssignTaskIntent)
    assert res2.task_id_or_title == "142"
    assert "Reza" in res2.assignee_names
    assert "Sara" in res2.assignee_names

    # Status: "تسک 142 را Done کن"
    res3 = parse_deterministic_intent("تسک 142 را Done کن")
    assert isinstance(res3, UpdateTaskStatusIntent)
    assert res3.task_id_or_title == "142"
    assert res3.status == "Done"

    # English: "Change task 142 to In Progress"
    res4 = parse_deterministic_intent("Change task 142 to In Progress")
    assert isinstance(res4, UpdateTaskStatusIntent)
    assert res4.task_id_or_title == "142"
    assert res4.status == "InProgress"


def test_parse_task_details():
    # Deadline: "ددلاینش را سه‌شنبه بگذار"
    res1 = parse_deterministic_intent("ددلاینش را سه‌شنبه بگذار")
    assert isinstance(res1, UpdateTaskDetailsIntent)
    assert res1.due_date is not None

    # Priority: "اولویتش را High کن"
    res2 = parse_deterministic_intent("اولویتش را High کن")
    assert isinstance(res2, UpdateTaskDetailsIntent)
    assert res2.priority == "P1"

    # Labels: "لیبل‌های backend و urgent را اضافه کن"
    res3 = parse_deterministic_intent("لیبل‌های backend و urgent را اضافه کن")
    assert isinstance(res3, UpdateTaskDetailsIntent)
    assert "backend" in res3.add_labels
    assert "urgent" in res3.add_labels

    # Checklist: "چک‌لیست اضافه کن: تست ۱، تست ۲"
    res4 = parse_deterministic_intent("چک‌لیست اضافه کن: تست ۱، تست ۲")
    assert isinstance(res4, UpdateTaskDetailsIntent)
    assert len(res4.add_checklist_items) == 2


def test_parse_search_and_membership():
    # My tasks
    res1 = parse_deterministic_intent("تسک‌های من را نشان بده")
    assert isinstance(res1, SearchTasksIntent)
    assert res1.is_my_tasks is True

    # User tasks
    res2 = parse_deterministic_intent("تسک‌های علی را نشان بده")
    assert isinstance(res2, SearchTasksIntent)
    assert res2.assignee_name == "علی"

    # Overdue tasks
    res3 = parse_deterministic_intent("تسک‌های عقب‌افتاده")
    assert isinstance(res3, SearchTasksIntent)
    assert res3.is_overdue is True

    # Team tasks
    res4 = parse_deterministic_intent("تسک‌های تیم بکند")
    assert isinstance(res4, SearchTasksIntent)
    assert "بکند" in (res4.team_name or "")

    # Add member: "علی را به پروژه Atlas اضافه کن"
    res5 = parse_deterministic_intent("علی را به پروژه Atlas اضافه کن")
    assert isinstance(res5, AddProjectMemberIntent)
    assert res5.user_name == "علی"
    assert res5.project_name == "Atlas"

    # Remove member: "علی را از پروژه Atlas حذف کن"
    res6 = parse_deterministic_intent("علی را از پروژه Atlas حذف کن")
    assert isinstance(res6, RemoveProjectMemberIntent)
    assert res6.user_name == "علی"
    assert res6.project_name == "Atlas"

    # Create ticket: "یک تیکت برای تیم QA بساز"
    res7 = parse_deterministic_intent("یک تیکت برای تیم QA بساز")
    assert isinstance(res7, CreateTicketIntent)
    assert "QA" in res7.recipient_team_names

    # Add comment: "روی تسک 142 کامنت بگذار: بررسی شد"
    res8 = parse_deterministic_intent("روی تسک 142 کامنت بگذار: بررسی شد")
    assert isinstance(res8, AddCommentIntent)
    assert res8.task_id_or_title == "142"
    assert "بررسی شد" in res8.comment_text


def test_parse_mywork_and_analytics():
    res1 = parse_deterministic_intent("/mywork")
    assert isinstance(res1, ViewAnalyticsIntent)
    assert res1.report_type == "personal"

    res2 = parse_deterministic_intent("mywork")
    assert isinstance(res2, ViewAnalyticsIntent)
    assert res2.report_type == "personal"

    res3 = parse_deterministic_intent("کارهای من")
    assert isinstance(res3, ViewAnalyticsIntent)
    assert res3.report_type == "personal"

