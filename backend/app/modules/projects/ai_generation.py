"""LangGraph workflow for AI-assisted project and task generation."""

from __future__ import annotations

import os
import re
import time
import uuid
import csv
from datetime import date, datetime, timezone
from io import BytesIO
from io import StringIO
from pathlib import Path
from typing import Any, TypedDict
from uuid import UUID

import httpx
import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.events import event_bus
from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.storage import file_storage_service
from app.modules.identity.models import User
from app.modules.projects import repository as repo
from app.modules.projects.ai_schemas import (
    GenerationChange,
    GenerationDraftResponse,
    GenerationValidationError,
    GeneratedProject,
)
from app.modules.projects.enums import DependencyType, PhaseType, Priority, ProjectStatus
from app.modules.projects.models import (
    ChecklistItem,
    GenerationRun,
    Phase,
    Product,
    Project,
    ProjectMember,
    TaskAssignee,
    TaskDependency,
    TaskItem,
    TaskLabelAssignment,
)
from app.modules.projects.service import recalculate_phase_and_project_progress
from app.shared.events import NotificationRequested

logger = structlog.get_logger(__name__)
settings = get_settings()

PROMPT_DIR = Path(__file__).resolve().parent / "prompts"
TEMPLATE_PATH = PROMPT_DIR / "project_brief_template.md"
SYSTEM_PROMPT_PATH = PROMPT_DIR / "system" / "project_generator.md"
GOOGLE_SHEETS_URL_RE = re.compile(
    r"https://docs\.google\.com/spreadsheets/d/(?P<sheet_id>[a-zA-Z0-9-_]+)(?P<rest>[^\s)]*)?"
)
GID_RE = re.compile(r"(?:[?#&]gid=)(?P<gid>\d+)")
MAX_SHEET_CONTEXT_CHARS = 80_000
MAX_SHEET_TASKS = 500
DATE_RE = re.compile(r"\b(?P<date>\d{4}-\d{2}-\d{2})\b")

GUIDE_SECTIONS = {
    "project name / working title": "Project name / working title",
    "project goal / objective": "Project goal / objective",
    "target audience or stakeholders": "Target audience or stakeholders",
    "rough timeline / deadline": "Rough timeline / deadline",
    "team members available for assignment": "Team members available for assignment",
    "known constraints": "Known constraints",
}


class AiGenerationState(TypedDict, total=False):
    db: AsyncSession
    user_id: UUID
    operation: str
    existing_project_id: UUID | None
    generation_run_id: UUID
    raw_input: str
    filename: str
    sheet_context: str
    source_task_titles: list[str]
    parsed_input: dict[str, str]
    validation_errors: list[dict[str, str]]
    draft: GeneratedProject | None
    retry_count: int
    resolved_assignees: dict[str, str | None]
    generation_run: GenerationRun
    change_set: list[dict[str, Any]]
    metrics: dict[str, Any]


def template_bytes() -> bytes:
    return TEMPLATE_PATH.read_bytes()


def _section_key(line: str) -> str | None:
    if not line.startswith("## "):
        return None
    title = line[3:].strip()
    title = title.replace("Required:", "").replace("Optional:", "").replace("Guide:", "").strip()
    return title.lower()


def parse_brief(raw: str) -> dict[str, str]:
    current: str | None = None
    sections: dict[str, list[str]] = {}
    for line in raw.splitlines():
        key = _section_key(line)
        if key:
            current = key
            sections.setdefault(current, [])
            continue
        if current is not None and not line.strip().startswith("<!--"):
            sections[current].append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items()}


def google_sheet_export_urls(raw: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for match in GOOGLE_SHEETS_URL_RE.finditer(raw):
        sheet_id = match.group("sheet_id")
        rest = match.group("rest") or ""
        gid_match = GID_RE.search(rest)
        gid = gid_match.group("gid") if gid_match else "0"
        export_url = (
            f"https://docs.google.com/spreadsheets/d/{sheet_id}/export"
            f"?format=csv&gid={gid}"
        )
        if export_url not in seen:
            seen.add(export_url)
            urls.append(export_url)
    return urls


def _clean_sheet_cell(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def _normalize_task_title(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def parse_google_sheet_csv(source_url: str, csv_text: str, index: int) -> tuple[str, list[str]]:
    rows = [
        [_clean_sheet_cell(cell) for cell in row]
        for row in csv.reader(StringIO(csv_text))
        if any(cell.strip() for cell in row)
    ]
    if not rows:
        return f"### Google Sheet {index}\nSource: {source_url}\nNo rows found.", []

    project_meta: dict[str, str] = {}
    if len(rows) >= 2 and rows[0][0].casefold() == "project name":
        for key, value in zip(rows[0], rows[1], strict=False):
            if key and value:
                project_meta[key] = value

    task_header_index = next(
        (
            row_index
            for row_index, row in enumerate(rows)
            if row and row[0].casefold() in {"tasks", "task", "task title", "title"}
        ),
        None,
    )
    if task_header_index is None:
        raw_preview = csv_text[:MAX_SHEET_CONTEXT_CHARS]
        return (
            f"### Google Sheet {index}\n"
            f"Source: {source_url}\n"
            "Could not detect the fixed task table header. Raw CSV preview follows:\n"
            f"{raw_preview}",
            [],
        )

    headers = rows[task_header_index]
    task_rows = rows[task_header_index + 1 : task_header_index + 1 + MAX_SHEET_TASKS]
    records: list[dict[str, str]] = []
    task_titles: list[str] = []
    seen_titles: set[str] = set()
    for row in task_rows:
        if not row or not row[0]:
            continue
        record = {
            (headers[column_index] if column_index < len(headers) and headers[column_index] else f"column_{column_index + 1}"): value
            for column_index, value in enumerate(row)
            if value
        }
        title = record.get(headers[0], row[0]).strip()
        title_key = _normalize_task_title(title)
        if not title_key or title_key in seen_titles:
            continue
        seen_titles.add(title_key)
        task_titles.append(title)
        records.append(record)

    lines = [
        f"### Google Sheet {index}: structured project/task source",
        f"Source: {source_url}",
        "",
        "MANDATORY COVERAGE RULE: create one generated task for every sheet task title listed below. Use each title exactly unless the uploaded brief explicitly renames it.",
    ]
    if project_meta:
        lines.append("")
        lines.append("Project metadata from sheet:")
        lines.extend(f"- {key}: {value}" for key, value in project_meta.items())
    lines.append("")
    lines.append("Task rows from sheet:")
    for number, record in enumerate(records, start=1):
        title = record.get(headers[0], f"Task {number}")
        lines.append(f"{number}. {title}")
        for key, value in record.items():
            if key == headers[0]:
                continue
            lines.append(f"   - {key}: {value}")
    if len(task_rows) >= MAX_SHEET_TASKS:
        lines.append(f"\nOnly first {MAX_SHEET_TASKS} task rows were read from this sheet.")
    return "\n".join(lines)[:MAX_SHEET_CONTEXT_CHARS], task_titles


async def fetch_google_sheets_context(raw: str) -> tuple[str, list[dict[str, str]], list[str]]:
    chunks: list[str] = []
    errors: list[dict[str, str]] = []
    task_titles: list[str] = []
    urls = google_sheet_export_urls(raw)
    if not urls:
        return "", errors, task_titles
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        for index, url in enumerate(urls, start=1):
            try:
                response = await client.get(url)
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").lower()
                text = response.text.strip()
                if "text/html" in content_type:
                    raise ValueError(
                        "Sheet did not export as CSV. Share it so anyone with the link can view."
                    )
                context, titles = parse_google_sheet_csv(url, text, index)
                chunks.append(context)
                task_titles.extend(titles)
            except Exception as exc:  # noqa: BLE001
                errors.append({"field": f"google_sheet_{index}", "message": str(exc)})
    return "\n\n".join(chunks), errors, task_titles


def validate_required_sections(parsed: dict[str, str]) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    for key, label in GUIDE_SECTIONS.items():
        value = parsed.get(key, "").strip()
        if not value or value.lower() == "none":
            errors.append({"field": label, "message": "Guide section is blank."})
    return errors


def unresolved_guide_fields(parsed: dict[str, str]) -> list[str]:
    return [
        label
        for key, label in GUIDE_SECTIONS.items()
        if not (value := parsed.get(key, "").strip()) or value.lower() == "none"
    ]


def _brief_summary(parsed: dict[str, str]) -> dict[str, Any]:
    return {
        "sections": sorted(parsed.keys()),
        "chars": sum(len(v) for v in parsed.values()),
        "required_missing": [e["field"] for e in validate_required_sections(parsed)],
    }


async def _node_log(node: str, started: float, success: bool, **kwargs: Any) -> None:
    logger.info(
        "project_ai_node",
        node=node,
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        success=success,
        **kwargs,
    )


def parse_input(state: AiGenerationState) -> AiGenerationState:
    started = time.perf_counter()
    parsed = parse_brief(state["raw_input"])
    state["parsed_input"] = parsed
    state.setdefault("metrics", {})["input_chars"] = len(state["raw_input"])
    logger.info("project_ai_parse_input", input_summary=_brief_summary(parsed))
    logger.info(
        "project_ai_node",
        node="parse_input",
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        success=True,
    )
    return state


async def load_google_sheets_context(state: AiGenerationState) -> AiGenerationState:
    started = time.perf_counter()
    context, errors, task_titles = await fetch_google_sheets_context(state["raw_input"])
    sheet_count = len(google_sheet_export_urls(state["raw_input"]))
    if context:
        state["sheet_context"] = context
        state["source_task_titles"] = task_titles
        state["raw_input"] = (
            f"{state['raw_input']}\n\n"
            "## Optional: Additional Google Sheets context\n"
            "The following structured task data came from shared Google Sheets URLs in the brief.\n\n"
            f"{context}\n"
        )
        state["parsed_input"] = parse_brief(state["raw_input"])
    state["validation_errors"] = state.get("validation_errors", []) + errors
    state.setdefault("metrics", {})["google_sheet_count"] = sheet_count
    state["metrics"]["google_sheet_context_chars"] = len(context)
    await _node_log(
        "load_google_sheets_context",
        started,
        not errors,
        sheet_count=sheet_count,
        source_task_count=len(task_titles),
        error_count=len(errors),
    )
    return state


def missing_source_task_titles(draft: GeneratedProject, source_titles: list[str]) -> list[str]:
    if not source_titles:
        return []
    generated = {_normalize_task_title(task.title) for task in draft.tasks}
    return [
        title
        for title in source_titles
        if _normalize_task_title(title) not in generated
    ]


def validate_source_task_coverage(draft: GeneratedProject, source_titles: list[str]) -> list[dict[str, str]]:
    missing = missing_source_task_titles(draft, source_titles)
    if not missing:
        return []
    return [
        {
            "field": "google_sheet_task_coverage",
            "message": (
                "Generated draft is missing required Google Sheet task titles: "
                + ", ".join(missing)
            ),
        }
    ]


def validate_input(state: AiGenerationState) -> AiGenerationState:
    started = time.perf_counter()
    parsed = state.get("parsed_input", {})
    has_structured_sheet = bool(state.get("source_task_titles"))
    has_freeform_text = bool(re.sub(r"https://docs\.google\.com/spreadsheets/d/\S+", "", state.get("raw_input", "")).strip())
    errors = state.get("validation_errors", [])
    if not has_structured_sheet and not has_freeform_text:
        errors.append({
            "field": "brief",
            "message": "Upload a brief, paste project notes, or provide a shared Google Sheet URL.",
        })
    state["validation_errors"] = errors
    missing_guides = unresolved_guide_fields(parsed)
    state.setdefault("metrics", {})["input_validation_errors"] = len(errors)
    state["metrics"]["guide_fields_missing"] = missing_guides
    logger.info(
        "project_ai_node",
        node="validate_input",
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        success=not errors,
        error_fields=[e["field"] for e in errors],
        missing_guide_fields=missing_guides,
    )
    return state


def _after_validate_input(state: AiGenerationState) -> str:
    return "persist" if state.get("validation_errors") else "generate_draft"


def _configure_langsmith() -> None:
    if settings.langchain_tracing_v2:
        os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
        os.environ.setdefault("LANGCHAIN_ENDPOINT", settings.langchain_endpoint)
        os.environ.setdefault("LANGSMITH_API_KEY", settings.langsmith_api_key)
        os.environ.setdefault("LANGCHAIN_PROJECT", settings.langchain_project)


def _llm() -> Any:
    if not settings.openai_api_key:
        raise ValidationAppError(
            "OPENAI_API_KEY is not configured.",
            errors={"OPENAI_API_KEY": ["Set OPENAI_API_KEY in backend .env."]},
        )
    _configure_langsmith()
    model = ChatOpenAI(
        model=settings.project_ai_model,
        api_key=settings.openai_api_key,
        temperature=settings.project_ai_temperature,
        timeout=settings.project_ai_timeout_seconds,
        max_retries=settings.project_ai_max_api_retries,
        max_tokens=settings.project_ai_max_tokens,
    )
    return model.with_structured_output(GeneratedProject)


async def _call_llm(system_prompt: str, user_prompt: str) -> tuple[GeneratedProject, dict[str, Any]]:
    structured = _llm()
    started = time.perf_counter()
    result = await structured.ainvoke(
        [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
    )
    usage = getattr(result, "usage_metadata", None) or {}
    metrics = {
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        "model": settings.project_ai_model,
        "prompt_tokens": usage.get("input_tokens"),
        "completion_tokens": usage.get("output_tokens"),
    }
    return result, metrics


async def generate_draft(state: AiGenerationState) -> AiGenerationState:
    started = time.perf_counter()
    system_prompt = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    guide_missing = state.get("metrics", {}).get("guide_fields_missing", [])
    missing_context = (
        "\n\n## Missing brief fields allowed for manual review\n"
        "The manager did not provide these guide fields. Do not block generation. "
        "Infer only when the Google Sheet or uploaded notes clearly provide the value; "
        "otherwise use null/empty values and list them in unresolved_fields: "
        f"{', '.join(guide_missing)}.\n"
        if guide_missing
        else ""
    )
    user_prompt = state["raw_input"] + missing_context
    last_error: str | None = None
    source_titles = state.get("source_task_titles", [])
    for attempt in range(settings.project_ai_max_schema_retries + 1):
        try:
            draft, llm_metrics = await _call_llm(system_prompt, user_prompt)
            state.setdefault("metrics", {})["llm"] = {**llm_metrics, "schema_retry_count": attempt}
            coverage_errors = validate_source_task_coverage(draft, source_titles)
            if coverage_errors:
                last_error = coverage_errors[0]["message"]
                if attempt < settings.project_ai_max_schema_retries:
                    missing_titles = missing_source_task_titles(draft, source_titles)
                    generated_titles = ", ".join(task.title for task in draft.tasks)
                    user_prompt += (
                        "\n\nPrevious draft failed mandatory Google Sheet task coverage validation. "
                        "Return the full corrected project JSON again. "
                        "You must include one generated task for every missing Google Sheet task title, "
                        "using the exact title unless the user brief explicitly renamed it. "
                        f"Missing titles: {', '.join(missing_titles)}. "
                        f"Previous generated titles: {generated_titles}."
                    )
                    continue
                state["draft"] = draft
                state["validation_errors"] = coverage_errors
                await _node_log("generate_draft", started, False, error=last_error, retry_count=attempt)
                return state
            state["draft"] = draft
            logger.info("project_ai_llm_call", **state["metrics"]["llm"])
            await _node_log("generate_draft", started, True, retry_count=attempt)
            return state
        except (ValidationError, ValueError) as exc:
            last_error = str(exc)
            user_prompt += (
                "\n\nPrevious response failed schema validation. Return corrected strict JSON only. "
                f"Validation error: {last_error[:1000]}"
            )
    state["validation_errors"] = [
        {"field": "llm_output", "message": last_error or "Model output validation failed."}
    ]
    await _node_log("generate_draft", started, False, error=last_error)
    return state


def validate_output(state: AiGenerationState) -> AiGenerationState:
    started = time.perf_counter()
    draft = state.get("draft")
    errors: list[dict[str, str]] = []
    if draft is None:
        errors.append({"field": "draft", "message": "Generation failed."})
    elif not draft.tasks:
        errors.append({"field": "tasks", "message": "At least one task is required."})
    state["validation_errors"] = state.get("validation_errors", []) + errors
    logger.info(
        "project_ai_node",
        node="validate_output",
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        success=not errors,
        task_count=len(draft.tasks) if draft else 0,
    )
    return state


async def resolve_assignees(state: AiGenerationState) -> AiGenerationState:
    started = time.perf_counter()
    draft = state.get("draft")
    if draft is None:
        return state
    result = await state["db"].execute(select(User).where(User.is_active.is_(True)))
    users = result.scalars().all()
    by_email = {u.email.lower(): u for u in users}
    by_name = {u.full_name.lower(): u for u in users}
    resolved: dict[str, str | None] = {}
    for task in draft.tasks:
        raw = (task.assignee or "").strip().lower()
        user = by_email.get(raw) or by_name.get(raw)
        if user:
            task.assignee_user_id = user.id
            resolved[task.title] = str(user.id)
        elif task.assignee:
            draft.unresolved_fields.append(f"Task '{task.title}' assignee '{task.assignee}' did not match a real active user.")
            resolved[task.title] = None
    state["resolved_assignees"] = resolved
    await _node_log("resolve_assignees", started, True, resolved_count=sum(1 for v in resolved.values() if v))
    return state


async def review_gate(state: AiGenerationState) -> AiGenerationState:
    started = time.perf_counter()
    draft = state.get("draft")
    project_id = state.get("existing_project_id")
    changes: list[GenerationChange] = []
    if draft and project_id:
        existing = await repo.get_project(state["db"], project_id)
        if existing is None:
            raise NotFoundError("Project", project_id)
        for field, after in (
            ("name", draft.name),
            ("description", draft.description),
            ("priority", draft.priority),
            ("risk_level", draft.risk_level),
            ("start_date", draft.timeline_start.isoformat() if draft.timeline_start else None),
            ("end_date", draft.timeline_end.isoformat() if draft.timeline_end else None),
        ):
            before = getattr(existing, field if field not in {"start_date", "end_date"} else field)
            before_value = before.isoformat() if hasattr(before, "isoformat") else before
            if before_value != after:
                changes.append(GenerationChange(path=f"project.{field}", before=before_value, after=after, change_type="modified"))
        current_tasks = {t.title: t for t in await repo.list_tasks_by_project(state["db"], project_id)}
        generated_titles = {t.title for t in draft.tasks}
        for title in generated_titles - set(current_tasks):
            changes.append(GenerationChange(path=f"tasks.{title}", before=None, after=title, change_type="added"))
        for title in set(current_tasks) - generated_titles:
            changes.append(GenerationChange(path=f"tasks.{title}", before=title, after=None, change_type="removed"))
        for task in draft.tasks:
            existing_task = current_tasks.get(task.title)
            if existing_task and existing_task.description != task.description:
                changes.append(GenerationChange(path=f"tasks.{task.title}.description", before=existing_task.description, after=task.description, change_type="modified"))
    state["change_set"] = [c.model_dump(mode="json") for c in changes]
    await _node_log("review_gate", started, True, change_count=len(changes))
    return state


async def persist(state: AiGenerationState) -> AiGenerationState:
    started = time.perf_counter()
    db = state["db"]
    prompt_key = f"ai-generation/prompts/{uuid.uuid4()}-{state.get('filename') or 'project-brief.md'}"
    try:
        file_storage_service.upload(
            prompt_key,
            BytesIO(state["raw_input"].encode("utf-8")),
            "text/markdown; charset=utf-8",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("project_ai_prompt_upload_failed", error=str(exc))
        prompt_key = None
    run = await db.get(GenerationRun, state["generation_run_id"])
    if run is None:
        raise NotFoundError("GenerationRun", state["generation_run_id"])
    run.status = "validation_failed" if state.get("validation_errors") else "draft"
    run.model = settings.project_ai_model
    run.prompt_storage_key = prompt_key
    run.draft_json = state["draft"].model_dump(mode="json") if state.get("draft") else {}
    run.change_set_json = {"changes": state.get("change_set", [])}
    run.resolved_assignees_json = state.get("resolved_assignees", {})
    run.metrics_json = state.get("metrics", {})
    run.validation_errors_json = state.get("validation_errors", [])
    run.error = "Input or output validation failed." if state.get("validation_errors") else None
    run.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(run)
    state["generation_run"] = run
    await _node_log("persist", started, True, status=run.status)
    return state


def _build_graph(include_review_gate: bool) -> Any:
    graph = StateGraph(AiGenerationState)
    graph.add_node("parse_input", parse_input)
    graph.add_node("load_google_sheets_context", load_google_sheets_context)
    graph.add_node("validate_input", validate_input)
    graph.add_node("generate_draft", generate_draft)
    graph.add_node("validate_output", validate_output)
    graph.add_node("resolve_assignees", resolve_assignees)
    graph.add_node("persist", persist)
    if include_review_gate:
        graph.add_node("review_gate", review_gate)
    graph.set_entry_point("parse_input")
    graph.add_edge("parse_input", "load_google_sheets_context")
    graph.add_edge("load_google_sheets_context", "validate_input")
    graph.add_conditional_edges("validate_input", _after_validate_input, {"persist": "persist", "generate_draft": "generate_draft"})
    graph.add_edge("generate_draft", "validate_output")
    graph.add_edge("validate_output", "resolve_assignees")
    if include_review_gate:
        graph.add_edge("resolve_assignees", "review_gate")
        graph.add_edge("review_gate", "persist")
    else:
        graph.add_edge("resolve_assignees", "persist")
    graph.add_edge("persist", END)
    return graph.compile()


def _first_nonempty_line(raw_input: str) -> str:
    for line in raw_input.splitlines():
        stripped = line.strip().strip("#").strip()
        if stripped and "docs.google.com/spreadsheets" not in stripped:
            return stripped
    return ""


def _parse_project_dates(value: str) -> tuple[date | None, date | None]:
    parsed_dates: list[date] = []
    for match in DATE_RE.finditer(value):
        try:
            parsed_dates.append(date.fromisoformat(match.group("date")))
        except ValueError:
            continue
    if not parsed_dates:
        return None, None
    if len(parsed_dates) == 1:
        return None, parsed_dates[0]
    return parsed_dates[0], parsed_dates[-1]


def _detect_priority(raw_input: str) -> str:
    match = re.search(r"\bP[0-3]\b", raw_input, re.IGNORECASE)
    return match.group(0).upper() if match else Priority.P2.value


def _detect_risk(raw_input: str) -> str:
    lowered = raw_input.casefold()
    for risk in ("critical", "high", "medium", "low"):
        if re.search(rf"\b{risk}\b", lowered):
            return risk.capitalize()
    return "Medium"


def _project_tags(parsed: dict[str, str]) -> list[str]:
    constraints = parsed.get("known constraints", "")
    candidates = re.split(r"[,;\n]", constraints)
    tags: list[str] = []
    for candidate in candidates:
        tag = re.sub(r"\s+", " ", candidate.strip())
        if 2 <= len(tag) <= 40 and tag.lower() != "none":
            tags.append(tag)
    return tags[:10]


def _initial_project_attrs(raw_input: str) -> dict[str, Any]:
    parsed = parse_brief(raw_input)
    name = parsed.get("project name / working title", "").strip()
    goal = parsed.get("project goal / objective", "").strip()
    timeline = parsed.get("rough timeline / deadline", "").strip()
    start_date, end_date = _parse_project_dates(timeline or raw_input)
    fallback = _first_nonempty_line(raw_input)
    description = goal if goal and goal.lower() != "none" else fallback
    if len(description) < 30:
        description = (raw_input.strip() or "AI generated project awaiting draft review.")[:500]
    return {
        "name": (name if name and name.lower() != "none" else fallback or "AI Generated Project")[:200],
        "description": description[:1000],
        "priority": _detect_priority(raw_input),
        "risk_level": _detect_risk(raw_input),
        "start_date": start_date,
        "end_date": end_date,
        "estimated_completion_date": end_date,
        "tags": _project_tags(parsed),
    }


def _draft_response_from_run(run: GenerationRun) -> GenerationDraftResponse:
    project = GeneratedProject.model_validate(run.draft_json) if run.draft_json else None
    return GenerationDraftResponse(
        generation_run_id=run.id,
        status=run.status,
        operation=run.operation,
        project=project,
        validation_errors=[GenerationValidationError(**e) for e in run.validation_errors_json],
        change_set=[GenerationChange(**c) for c in run.change_set_json.get("changes", [])],
        prompt_storage_key=run.prompt_storage_key,
    )


async def create_generation_job(
    db: AsyncSession,
    *,
    user_id: UUID,
    raw_input: str,
    filename: str,
    existing_project_id: UUID | None = None,
) -> dict[str, Any]:
    operation = "regenerate" if existing_project_id else "generate"
    if existing_project_id:
        project = await repo.get_project(db, existing_project_id)
        if project is None:
            raise NotFoundError("Project", existing_project_id)
    else:
        product = await _ensure_ai_product(db, user_id)
        attrs = _initial_project_attrs(raw_input)
        project = Project(
            product_id=product.id,
            name=attrs["name"],
            description=attrs["description"],
            priority=attrs["priority"],
            risk_level=attrs["risk_level"],
            start_date=attrs["start_date"],
            end_date=attrs["end_date"],
            estimated_completion_date=attrs["estimated_completion_date"],
            status=ProjectStatus.NOT_STARTED.value,
            tags=attrs["tags"],
            created_by="ai",
            last_modified_by="ai",
        )
        db.add(project)
        await db.flush()
        db.add(ProjectMember(project_id=project.id, user_id=user_id, role="ProjectManager"))

    input_key = f"ai-generation/inputs/{uuid.uuid4()}-{filename or 'project-brief.md'}"
    file_storage_service.upload(
        input_key,
        BytesIO(raw_input.encode("utf-8")),
        "text/markdown; charset=utf-8",
    )
    run = GenerationRun(
        triggered_by_user_id=user_id,
        existing_project_id=existing_project_id,
        resulting_project_id=project.id,
        status="queued",
        operation=operation,
        model=settings.project_ai_model,
        input_storage_key=input_key,
        input_filename=filename,
    )
    db.add(run)
    await db.flush()
    project.generation_run_id = run.id
    await db.commit()
    return {"job_id": run.id, "project_id": project.id, "status": run.status}


async def run_generation_job(
    db: AsyncSession,
    *,
    job_id: UUID,
    raw_input: str | None = None,
    filename: str | None = None,
) -> None:
    run = await db.get(GenerationRun, job_id)
    if run is None:
        raise NotFoundError("GenerationRun", job_id)
    if run.status != "queued":
        logger.warning("generation_job_not_queued", job_id=str(job_id), status=run.status)
        return
    if raw_input is None:
        if not run.input_storage_key:
            raise ValidationAppError("Generation job has no stored input.", errors={"input_storage_key": ["missing"]})
        raw_input = file_storage_service.download(run.input_storage_key).decode("utf-8")
    filename = filename or run.input_filename or "project-brief.md"
    run.status = "running"
    run.updated_at = datetime.now(timezone.utc)
    await db.commit()

    await _execute_generation_job(db, run, raw_input=raw_input, filename=filename)


async def _execute_generation_job(
    db: AsyncSession,
    run: GenerationRun,
    *,
    raw_input: str,
    filename: str,
) -> None:
    app = _build_graph(include_review_gate=run.existing_project_id is not None)
    try:
        await app.ainvoke(
            {
                "db": db,
                "generation_run_id": run.id,
                "user_id": run.triggered_by_user_id,
                "operation": run.operation,
                "existing_project_id": run.existing_project_id,
                "raw_input": raw_input,
                "filename": filename,
            }
        )
    except Exception as exc:
        await db.rollback()
        failed_run = await db.get(GenerationRun, run.id)
        if failed_run:
            failed_run.status = "failed"
            failed_run.error = str(exc)
            failed_run.updated_at = datetime.now(timezone.utc)
            await db.commit()
        logger.exception("generation_job_failed", job_id=str(run.id), error=str(exc))


async def claim_next_generation_job(db: AsyncSession) -> UUID | None:
    result = await db.execute(
        select(GenerationRun)
        .where(GenerationRun.status == "queued")
        .order_by(GenerationRun.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    run = result.scalar_one_or_none()
    if run is None:
        await db.rollback()
        return None
    run.status = "running"
    run.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return run.id


async def run_claimed_generation_job(db: AsyncSession, *, job_id: UUID) -> None:
    run = await db.get(GenerationRun, job_id)
    if run is None:
        raise NotFoundError("GenerationRun", job_id)
    if run.status != "running":
        logger.warning("generation_job_not_running", job_id=str(job_id), status=run.status)
        return
    if not run.input_storage_key:
        raise ValidationAppError("Generation job has no stored input.", errors={"input_storage_key": ["missing"]})
    raw_input = file_storage_service.download(run.input_storage_key).decode("utf-8")
    await _execute_generation_job(
        db,
        run,
        raw_input=raw_input,
        filename=run.input_filename or "project-brief.md",
    )


async def run_generation_job_in_new_session(
    *,
    job_id: UUID,
    raw_input: str | None = None,
    filename: str | None = None,
) -> None:
    async with AsyncSessionLocal() as db:
        await run_generation_job(
            db,
            job_id=job_id,
            raw_input=raw_input,
            filename=filename,
        )


async def get_generation_job_status(
    db: AsyncSession,
    *,
    job_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    result = await db.execute(
        select(GenerationRun).where(
            GenerationRun.id == job_id,
            GenerationRun.triggered_by_user_id == user_id,
        )
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise NotFoundError("GenerationRun", job_id)
    return {
        "job_id": run.id,
        "project_id": run.existing_project_id or run.resulting_project_id,
        "status": run.status,
        "error": run.error,
    }


async def get_generation_draft(
    db: AsyncSession,
    *,
    job_id: UUID,
    user_id: UUID,
) -> GenerationDraftResponse:
    result = await db.execute(
        select(GenerationRun).where(
            GenerationRun.id == job_id,
            GenerationRun.triggered_by_user_id == user_id,
        )
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise NotFoundError("GenerationRun", job_id)
    if run.status in {"queued", "running"}:
        raise ValidationAppError("Generation draft is not ready.", errors={"status": [run.status]})
    if run.status == "failed":
        raise ValidationAppError(run.error or "Generation failed.", errors={"status": [run.status]})
    return _draft_response_from_run(run)


async def _ensure_ai_product(db: AsyncSession, user_id: UUID) -> Product:
    products, _ = await repo.list_products(db, 0, 1)
    if products:
        return products[0]
    product = Product(
        name="AI Generated Projects",
        description="Container product for projects generated from AI briefs.",
        owner_user_id=user_id,
    )
    db.add(product)
    await db.flush()
    return product


def _summary_markdown(draft: GeneratedProject) -> str:
    tasks = "\n".join(f"- {t.title} ({t.priority}, {t.status})" for t in draft.tasks)
    return f"# {draft.name}\n\n{draft.description}\n\n## Goal\n{draft.goal}\n\n## Tasks\n{tasks}\n"


async def _create_generated_tasks_batch(
    db: AsyncSession,
    *,
    phase_id: UUID,
    draft: GeneratedProject,
    run_id: UUID,
    user_id: UUID,
) -> tuple[dict[str, UUID], list[str]]:
    title_to_id: dict[str, UUID] = {}
    task_ids: list[str] = []
    label_cache: dict[str, UUID] = {}
    now = datetime.now(timezone.utc)

    for item in draft.tasks:
        task = TaskItem(
            phase_id=phase_id,
            title=item.title,
            description=item.description,
            task_type=item.task_type,
            priority=item.priority,
            status=item.status,
            estimated_hours=item.estimated_hours,
            due_date=item.due_date,
            partition=item.partition,
            created_by="ai",
            last_modified_by="ai",
            generation_run_id=run_id,
        )
        db.add(task)
        await db.flush()

        if item.assignee_user_id:
            db.add(TaskAssignee(task_id=task.id, user_id=item.assignee_user_id))

        for label_name in item.tags:
            name = label_name.strip()
            if not name:
                continue
            label_id = label_cache.get(name)
            if label_id is None:
                label = await repo.get_or_create_label(db, name)
                label_id = label.id
                label_cache[name] = label_id
            db.add(TaskLabelAssignment(task_id=task.id, label_id=label_id))

        db.add(
            ChecklistItem(
                task_id=task.id,
                text="Confirm generated task details",
                order=0,
            )
        )
        repo.add_status_transition(
            db,
            task_id=task.id,
            from_status=None,
            to_status=task.status,
            changed_by_user_id=user_id,
            changed_at=now,
        )
        title_to_id[item.title] = task.id
        task_ids.append(str(task.id))

    return title_to_id, task_ids


async def confirm_generation(
    db: AsyncSession,
    run_id: UUID,
    user_id: UUID,
    draft_override: GeneratedProject | None = None,
) -> dict[str, Any]:
    run = await db.get(GenerationRun, run_id)
    if run is None:
        raise NotFoundError("GenerationRun", run_id)
    if run.triggered_by_user_id != user_id:
        raise NotFoundError("GenerationRun", run_id)
    if run.status not in {"draft", "change_set_ready"}:
        raise ValidationAppError("Generation run is not confirmable.", errors={"status": [run.status]})
    draft = draft_override or GeneratedProject.model_validate(run.draft_json)
    if draft_override is not None:
        run.draft_json = draft.model_dump(mode="json")
    project_id = run.existing_project_id or run.resulting_project_id
    if project_id is None:
        raise ValidationAppError("Generation run has no project.", errors={"project_id": ["missing"]})
    project = await repo.get_project(db, project_id)
    if project is None:
        raise NotFoundError("Project", project_id)
    project.name = draft.name
    project.description = draft.description
    project.priority = draft.priority
    project.risk_level = draft.risk_level
    project.start_date = draft.timeline_start
    project.end_date = draft.timeline_end
    project.estimated_completion_date = draft.timeline_end
    project.tags = draft.tags
    project.last_modified_by = "ai"
    project.generation_run_id = run.id
    project.ai_prompt_storage_key = run.prompt_storage_key
    phase = Phase(
        project_id=project.id,
        name="AI Generated Plan",
        phase_type=PhaseType.DEVELOPMENT.value,
        sequence=1,
        start_date=draft.timeline_start,
        end_date=draft.timeline_end,
    )
    db.add(phase)
    await db.flush()

    title_to_id, task_ids = await _create_generated_tasks_batch(
        db,
        phase_id=phase.id,
        draft=draft,
        run_id=run.id,
        user_id=user_id,
    )

    for item in draft.tasks:
        successor_id = title_to_id.get(item.title)
        if not successor_id:
            continue
        for dep_title in item.dependencies:
            predecessor_id = title_to_id.get(dep_title)
            if predecessor_id and predecessor_id != successor_id:
                db.add(
                    TaskDependency(
                        predecessor_task_id=predecessor_id,
                        successor_task_id=successor_id,
                        dependency_type=DependencyType.FINISH_TO_START.value,
                    )
                )

    summary_key = f"ai-generation/summaries/{run.id}.md"
    try:
        file_storage_service.upload(
            summary_key,
            BytesIO(_summary_markdown(draft).encode("utf-8")),
            "text/markdown; charset=utf-8",
        )
        project.ai_summary_storage_key = summary_key
        run.summary_storage_key = summary_key
    except Exception as exc:  # noqa: BLE001
        logger.warning("project_ai_summary_upload_failed", error=str(exc))

    run.status = "committed"
    run.resulting_project_id = project.id
    run.resulting_task_ids = task_ids
    run.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await recalculate_phase_and_project_progress(db, phase.id)
    await event_bus.publish(
        NotificationRequested(
            user_id=user_id,
            type="project_generated",
            title="AI project committed",
            body=f"{project.name} was created with {len(task_ids)} generated tasks.",
            link=f"/projects/{project.id}",
            entity_type="project",
            entity_id=project.id,
        )
    )
    return {"project_id": project.id, "task_ids": task_ids, "generation_run_id": run.id}
