"""LLM structured intent parser fallback using ChatOpenAI."""

from __future__ import annotations

import structlog
from typing import Optional

from app.core.config import get_settings
from app.modules.telegram.schemas import (
    BaseTelegramIntent,
    CreateProjectIntent,
    CreateSprintBatchIntent,
    CreateTaskIntent,
    CreateTicketIntent,
    TelegramIntentUnion,
    UnknownIntent,
)

logger = structlog.get_logger(__name__)
settings = get_settings()

SYSTEM_PROMPT = """You are the natural language understanding parser for Project Management Platform (PMP).
Extract user requests into the most appropriate structured PMP intent.
Rules:
1. NEVER invent database UUIDs or numbers.
2. Extract exact names as mentioned by the user (projects, sprints, tasks, users, teams).
3. If the user language is Persian, maintain Persian entity names as written.
4. Support project management concepts: tasks, projects, sprints, backlog, tickets, assignments, status changes, checklists, comments, milestones, docs.
"""


async def parse_llm_intent(text: str) -> Optional[TelegramIntentUnion]:
    """Parse complex or conversational text into a structured intent using ChatOpenAI."""
    if not settings.openai_api_key:
        return None

    try:
        from langchain_core.messages import HumanMessage, SystemMessage
        from langchain_openai import ChatOpenAI

        model = ChatOpenAI(
            model=settings.project_ai_model or "gpt-4o",
            api_key=settings.openai_api_key,
            temperature=0.0,
            timeout=10,
            max_retries=1,
        )

        structured_model = model.with_structured_output(TelegramIntentUnion)  # type: ignore[arg-type]
        result = await structured_model.ainvoke(
            [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=text)]
        )
        if isinstance(result, BaseTelegramIntent):
            result.raw_query = text
            return result
        return None
    except Exception as exc:
        logger.warning("telegram_llm_parse_error", error=str(exc))
        return None

