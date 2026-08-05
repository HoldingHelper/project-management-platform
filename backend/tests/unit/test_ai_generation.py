from uuid import uuid4

import pytest

from app.modules.projects.ai_generation import (
    google_sheet_export_urls,
    parse_brief,
    parse_google_sheet_csv,
    unresolved_guide_fields,
    validate_required_sections,
    validate_source_task_coverage,
)
from app.modules.projects.ai_schemas import GeneratedProject, GeneratedTask


def test_parse_brief_and_required_validation():
    raw = """
## Guide: Project name / working title
Campaign Automation

## Guide: Project goal / objective
Launch a tracked campaign.

## Guide: Target audience or stakeholders
Marketing team

## Guide: Rough timeline / deadline
July

## Guide: Team members available for assignment
Ari ari@example.com

## Guide: Known constraints
Meta Ads, existing CRM
"""
    parsed = parse_brief(raw)
    assert parsed["project name / working title"] == "Campaign Automation"
    assert validate_required_sections(parsed) == []


def test_required_validation_marks_none_missing():
    parsed = {"project name / working title": "none"}
    errors = validate_required_sections(parsed)
    assert {e["field"] for e in errors} >= {
        "Project name / working title",
        "Project goal / objective",
    }


def test_unresolved_guide_fields_are_non_blocking_hints():
    parsed = {"project name / working title": "Free Carwash Campaign"}
    assert "Project name / working title" not in unresolved_guide_fields(parsed)
    assert "Project goal / objective" in unresolved_guide_fields(parsed)


def test_google_sheet_export_urls_extracts_unique_csv_exports():
    raw = """
    Notes:
    https://docs.google.com/spreadsheets/d/abcDEF_123/edit?gid=456#gid=456
    same again https://docs.google.com/spreadsheets/d/abcDEF_123/edit?gid=456#gid=456
    default tab https://docs.google.com/spreadsheets/d/xyz-789/edit
    """
    assert google_sheet_export_urls(raw) == [
        "https://docs.google.com/spreadsheets/d/abcDEF_123/export?format=csv&gid=456",
        "https://docs.google.com/spreadsheets/d/xyz-789/export?format=csv&gid=0",
    ]


def test_parse_google_sheet_csv_extracts_fixed_template_tasks():
    csv_text = """Project name,timeline ,Lead Team,priority,status,phases
Free Carwash Campaign,2026-07-08...2026-07-09,Ali and Zahra,P0,Delayed,Launch
Tasks,assigners,reviewers (Reviewer 1 → Reviewer 2),priority,level,timeline,description,checklist,type,dependency
Checklist for post,,,P0,Marketing,2026-07-08...2026-07-09,Image + caption,,,
Google Sheet integration,,,P0,Tech,2026-07-08...2026-07-09,Pre-defined message,,,
"""
    context, titles = parse_google_sheet_csv("https://example.test/export.csv", csv_text, 1)
    assert titles == ["Checklist for post", "Google Sheet integration"]
    assert "MANDATORY COVERAGE RULE" in context
    assert "Project metadata from sheet" in context
    assert "- level: Tech" in context


def test_source_task_coverage_detects_missing_sheet_rows():
    draft = GeneratedProject(
        name="Free Carwash Campaign",
        description="Detailed plan for a campaign launch with operational and marketing execution.",
        goal="Generate qualified leads.",
        tasks=[
            GeneratedTask(
                title="Checklist for post",
                description="Create image and caption checklist for post readiness.",
            )
        ],
    )
    errors = validate_source_task_coverage(
        draft,
        ["Checklist for post", "Google Sheet integration"],
    )
    assert errors
    assert "Google Sheet integration" in errors[0]["message"]


def test_generated_schema_uses_platform_enums():
    project = GeneratedProject(
        name="Free Carwash Campaign",
        description="Detailed plan for a campaign launch with operational and marketing execution.",
        goal="Generate qualified leads.",
        priority="P1",
        risk_level="Medium",
        tasks=[
            GeneratedTask(
                title="Configure Meta campaign",
                description="Set up Meta campaign, tracking, and naming conventions.",
                assignee_user_id=uuid4(),
                priority="P1",
                status="Ready",
                task_type="Feature",
                partition="marketing",
            )
        ],
    )
    assert project.tasks[0].priority == "P1"


def test_generated_schema_rejects_non_platform_status():
    with pytest.raises(Exception):
        GeneratedTask(
            title="Bad status",
            description="Enough detail to pass description length.",
            status="todo",
        )
