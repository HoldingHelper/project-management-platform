"""Unified Natural Language Intent Parser coordinating deterministic and LLM parsers."""

from __future__ import annotations

from typing import Optional

from app.modules.telegram.nlp.deterministic import parse_deterministic_intent
from app.modules.telegram.nlp.llm_parser import parse_llm_intent
from app.modules.telegram.schemas import TelegramIntentUnion, UnknownIntent


async def parse_user_intent(text: str, lang: str = "fa") -> TelegramIntentUnion:
    """Parse user text into a typed PMP intent using high-precision deterministic regex first,
    falling back to structured LLM parsing if available, or UnknownIntent.
    """
    clean_text = text.strip()
    if not clean_text:
        return UnknownIntent(raw_query="", suggested_action="help", language=lang)

    # 1. Deterministic high-speed parser (0 network/API latency)
    det_intent = parse_deterministic_intent(clean_text)
    if det_intent is not None:
        if hasattr(det_intent, "language"):
            det_intent.language = lang
        return det_intent

    # 2. Structured LLM fallback if configured
    llm_intent = await parse_llm_intent(clean_text)
    if llm_intent is not None:
        if hasattr(llm_intent, "language"):
            llm_intent.language = lang
        return llm_intent

    # 3. Unknown intent with guidance
    help_suggestion = (
        "Please describe your request more clearly, or use /help to see examples."
        if lang == "en"
        else "لطفاً دستور خود را واضح‌تر بیان کنید یا از /help استفاده نمایید."
    )
    return UnknownIntent(
        raw_query=clean_text,
        suggested_action=help_suggestion,
        language=lang,
    )

