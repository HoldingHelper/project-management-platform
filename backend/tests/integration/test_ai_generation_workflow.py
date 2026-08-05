from uuid import uuid4

import pytest

from app.modules.projects import ai_generation
from app.modules.projects.ai_schemas import GeneratedProject, GeneratedTask
from app.modules.projects.models import GenerationRun


class FakeDb:
    def __init__(self, run=None):
        self.run = run

    async def execute(self, *_args, **_kwargs):
        class Result:
            def scalars(self):
                class Scalars:
                    def all(self):
                        return []

                return Scalars()

        return Result()

    def add(self, obj):
        self.obj = obj

    async def commit(self):
        if hasattr(self, "obj") and getattr(self.obj, "id", None) is None:
            self.obj.id = uuid4()

    async def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid4()

    async def get(self, model, key):
        if model is GenerationRun and self.run and self.run.id == key:
            return self.run
        return None


async def run_graph_with_existing_run(raw: str, *, user_id, filename: str):
    run = GenerationRun(
        id=uuid4(),
        triggered_by_user_id=user_id,
        status="running",
        operation="generate",
    )
    db = FakeDb(run)
    app = ai_generation._build_graph(include_review_gate=False)
    state = await app.ainvoke(
        {
            "db": db,
            "generation_run_id": run.id,
            "user_id": user_id,
            "operation": "generate",
            "existing_project_id": None,
            "raw_input": raw,
            "filename": filename,
        }
    )
    return state["generation_run"]


@pytest.mark.asyncio
async def test_generation_graph_draft_without_openai(monkeypatch):
    async def fake_call_llm(_system_prompt: str, _user_prompt: str):
        return (
            GeneratedProject(
                name="Campaign Automation",
                description="Detailed project description for campaign automation and launch readiness.",
                goal="Launch campaign with clear tracking.",
                tasks=[
                    GeneratedTask(
                        title="Prepare campaign plan",
                        description="Create campaign plan, tracking requirements, and approval checklist.",
                        priority="P2",
                        status="Ready",
                    )
                ],
            ),
            {"latency_ms": 1, "model": "test", "prompt_tokens": 1, "completion_tokens": 1},
        )

    monkeypatch.setattr(ai_generation, "_call_llm", fake_call_llm)
    monkeypatch.setattr(ai_generation.file_storage_service, "upload", lambda *args, **kwargs: "key")

    raw = """
## Required: Project name / working title
Campaign Automation
## Required: Project goal / objective
Launch campaign with tracking.
## Required: Target audience or stakeholders
Marketing
## Required: Rough timeline / deadline
July
## Required: Team members available for assignment
none@example.com
## Required: Known constraints
Meta Ads
"""
    run = await run_graph_with_existing_run(raw, user_id=uuid4(), filename="brief.md")
    assert run.status == "draft"
    assert run.draft_json["tasks"][0]["title"] == "Prepare campaign plan"


@pytest.mark.asyncio
async def test_generation_graph_retries_when_sheet_tasks_are_missing(monkeypatch):
    calls = {"count": 0}

    async def fake_fetch_sheets(_raw: str):
        return (
            "MANDATORY COVERAGE RULE\n1. Checklist for post\n2. Google Sheet integration",
            [],
            ["Checklist for post", "Google Sheet integration"],
        )

    async def fake_call_llm(_system_prompt: str, _user_prompt: str):
        calls["count"] += 1
        tasks = [
            GeneratedTask(
                title="Checklist for post",
                description="Create image and caption checklist for post readiness.",
                priority="P0",
                status="Ready",
            )
        ]
        if calls["count"] > 1:
            tasks.append(
                GeneratedTask(
                    title="Google Sheet integration",
                    description="Implement the Google Sheet integration with clear validation and fallback handling.",
                    priority="P0",
                    status="Ready",
                )
            )
        return (
            GeneratedProject(
                name="Free Carwash Campaign",
                description="Detailed project description for campaign automation and launch readiness.",
                goal="Launch campaign with clear tracking.",
                tasks=tasks,
            ),
            {"latency_ms": 1, "model": "test", "prompt_tokens": 1, "completion_tokens": 1},
        )

    monkeypatch.setattr(ai_generation, "fetch_google_sheets_context", fake_fetch_sheets)
    monkeypatch.setattr(ai_generation, "_call_llm", fake_call_llm)
    monkeypatch.setattr(ai_generation.file_storage_service, "upload", lambda *args, **kwargs: "key")
    monkeypatch.setattr(ai_generation.settings, "project_ai_max_schema_retries", 2)

    raw = """
## Required: Project name / working title
Campaign Automation
## Required: Project goal / objective
Launch campaign with tracking.
## Required: Target audience or stakeholders
Marketing
## Required: Rough timeline / deadline
July
## Required: Team members available for assignment
none@example.com
## Required: Known constraints
Meta Ads
## Optional: Extra context for AI
https://docs.google.com/spreadsheets/d/test/edit?gid=123#gid=123
"""
    run = await run_graph_with_existing_run(raw, user_id=uuid4(), filename="brief.md")
    assert calls["count"] == 2
    assert run.status == "draft"
    assert [task["title"] for task in run.draft_json["tasks"]] == [
        "Checklist for post",
        "Google Sheet integration",
    ]


@pytest.mark.asyncio
async def test_generation_graph_allows_sheet_only_context(monkeypatch):
    async def fake_fetch_sheets(_raw: str):
        return (
            "Project metadata from sheet:\n- Project name: Free Carwash Campaign\n\n"
            "MANDATORY COVERAGE RULE\n1. Checklist for post",
            [],
            ["Checklist for post"],
        )

    async def fake_call_llm(_system_prompt: str, user_prompt: str):
        assert "Missing brief fields allowed for manual review" in user_prompt
        return (
            GeneratedProject(
                name="Free Carwash Campaign",
                description="Detailed project description inferred from the Google Sheet and ready for manager review.",
                goal="Prepare the campaign work from the provided sheet.",
                unresolved_fields=["Target audience or stakeholders", "Known constraints"],
                tasks=[
                    GeneratedTask(
                        title="Checklist for post",
                        description="Create image and caption checklist for post readiness.",
                        priority="P0",
                        status="Ready",
                    )
                ],
            ),
            {"latency_ms": 1, "model": "test", "prompt_tokens": 1, "completion_tokens": 1},
        )

    monkeypatch.setattr(ai_generation, "fetch_google_sheets_context", fake_fetch_sheets)
    monkeypatch.setattr(ai_generation, "_call_llm", fake_call_llm)
    monkeypatch.setattr(ai_generation.file_storage_service, "upload", lambda *args, **kwargs: "key")

    raw = """
https://docs.google.com/spreadsheets/d/test/edit?gid=123#gid=123
"""
    run = await run_graph_with_existing_run(raw, user_id=uuid4(), filename="brief.md")
    assert run.status == "draft"
    assert run.validation_errors_json == []
    assert run.draft_json["tasks"][0]["title"] == "Checklist for post"
