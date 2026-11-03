"""Conversation state manager for multi-turn dialogues, follow-up context, and confirmations."""

from __future__ import annotations

import json
import secrets
import time
from typing import Any, Dict, Optional

import structlog

from app.core.cache import get_redis
from app.core.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

STATE_PREFIX = "tg:state:"
CONFIRM_PREFIX = "tg:confirm:"


class ConversationState:
    def __init__(
        self,
        chat_id: str,
        user_id: Optional[str] = None,
        pending_intent: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None,
        updated_at: Optional[float] = None,
    ) -> None:
        self.chat_id = str(chat_id)
        self.user_id = user_id
        self.pending_intent = pending_intent or {}
        self.context = context or {}
        self.updated_at = updated_at or time.time()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chat_id": self.chat_id,
            "user_id": self.user_id,
            "pending_intent": self.pending_intent,
            "context": self.context,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ConversationState:
        return cls(
            chat_id=data.get("chat_id", ""),
            user_id=data.get("user_id"),
            pending_intent=data.get("pending_intent") or {},
            context=data.get("context") or {},
            updated_at=data.get("updated_at") or time.time(),
        )


class ConversationStateManager:
    """Manages conversation state with Redis persistence and resilient in-memory fallback."""

    def __init__(self, ttl_seconds: Optional[int] = None) -> None:
        self.ttl = ttl_seconds or settings.telegram_state_ttl_seconds or 900
        self._memory_states: Dict[str, Dict[str, Any]] = {}
        self._memory_confirms: Dict[str, Dict[str, Any]] = {}

    async def get_state(self, chat_id: str | int) -> ConversationState:
        key = f"{STATE_PREFIX}{chat_id}"
        try:
            redis_client = get_redis()
            raw = await redis_client.get(key)
            if raw:
                data = json.loads(raw)
                return ConversationState.from_dict(data)
        except Exception as exc:
            logger.debug("redis_get_state_fallback", error=str(exc))

        # In-memory check
        mem_data = self._memory_states.get(str(chat_id))
        if mem_data:
            if time.time() - mem_data.get("updated_at", 0) > self.ttl:
                del self._memory_states[str(chat_id)]
            else:
                return ConversationState.from_dict(mem_data)

        return ConversationState(chat_id=str(chat_id))

    async def save_state(self, state: ConversationState) -> None:
        key = f"{STATE_PREFIX}{state.chat_id}"
        state.updated_at = time.time()
        payload = state.to_dict()

        # Update in-memory
        self._memory_states[state.chat_id] = payload

        # Update Redis
        try:
            redis_client = get_redis()
            await redis_client.set(key, json.dumps(payload, default=str), ex=self.ttl)
        except Exception as exc:
            logger.debug("redis_save_state_fallback", error=str(exc))

    async def set_context(self, chat_id: str | int, key: str, value: Any) -> None:
        state = await self.get_state(chat_id)
        state.context[key] = value
        await self.save_state(state)

    async def get_context(self, chat_id: str | int, key: str) -> Optional[Any]:
        state = await self.get_state(chat_id)
        return state.context.get(key)

    async def set_pending_intent(
        self,
        chat_id: str | int,
        intent_data: Dict[str, Any],
        missing_field: str,
        prompt_text: str,
    ) -> None:
        state = await self.get_state(chat_id)
        state.pending_intent = {
            "intent": intent_data,
            "missing_field": missing_field,
            "prompt_text": prompt_text,
            "timestamp": time.time(),
        }
        await self.save_state(state)

    async def get_pending_intent(self, chat_id: str | int) -> Optional[Dict[str, Any]]:
        """Get currently active pending intent, or None if none."""
        state = await self.get_state(chat_id)
        if not state.pending_intent:
            return None
        intent_payload = state.pending_intent.get("intent")
        if intent_payload is None:
            intent_payload = state.pending_intent.get("intent_data", {})
        return {
            "intent_data": intent_payload,
            "missing_field": state.pending_intent.get("missing_field"),
            "prompt_text": state.pending_intent.get("prompt_text"),
            "timestamp": state.pending_intent.get("timestamp"),
        }

    async def clear_pending_intent(self, chat_id: str | int) -> None:
        state = await self.get_state(chat_id)
        state.pending_intent = {}
        await self.save_state(state)

    async def cancel(self, chat_id: str | int) -> bool:
        """Cancel any active multi-turn intent or pending confirmation."""
        state = await self.get_state(chat_id)
        had_pending = bool(state.pending_intent)
        state.pending_intent = {}
        await self.save_state(state)
        return had_pending

    async def create_confirmation(
        self,
        chat_id: str | int,
        action_type: str,
        description: str,
        payload: Dict[str, Any],
        ttl_seconds: int = 300,
    ) -> str:
        """Create a single-use secure confirmation token."""
        token = secrets.token_hex(8)
        data = {
            "token": token,
            "chat_id": str(chat_id),
            "action_type": action_type,
            "description": description,
            "payload": payload,
            "created_at": time.time(),
            "expires_at": time.time() + ttl_seconds,
        }
        self._memory_confirms[token] = data

        key = f"{CONFIRM_PREFIX}{token}"
        try:
            redis_client = get_redis()
            await redis_client.set(key, json.dumps(data, default=str), ex=ttl_seconds)
        except Exception as exc:
            logger.debug("redis_confirm_fallback", error=str(exc))

        return token

    async def get_confirmation(
        self, chat_id: str | int, token: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve confirmation data without consuming it."""
        key = f"{CONFIRM_PREFIX}{token}"
        data = None

        try:
            redis_client = get_redis()
            raw = await redis_client.get(key)
            if raw:
                data = json.loads(raw)
        except Exception as exc:
            logger.debug("redis_get_confirm_fallback", error=str(exc))

        if not data and token in self._memory_confirms:
            mem_data = self._memory_confirms.get(token)
            if mem_data and mem_data.get("expires_at", 0) > time.time():
                data = mem_data

        if not data:
            return None

        # Verify chat_id ownership
        if str(data.get("chat_id")) != str(chat_id):
            logger.warning("confirm_token_chat_id_mismatch", token=token)
            return None

        return data

    async def update_confirmation(
        self, chat_id: str | int, token: str, payload_updates: Dict[str, Any]
    ) -> bool:
        """Update existing confirmation data payload."""
        conf = await self.get_confirmation(chat_id, token)
        if not conf:
            return False

        conf["payload"].update(payload_updates)
        remaining_ttl = max(int(conf.get("expires_at", 0) - time.time()), 60)
        self._memory_confirms[token] = conf

        key = f"{CONFIRM_PREFIX}{token}"
        try:
            redis_client = get_redis()
            await redis_client.set(key, json.dumps(conf, default=str), ex=remaining_ttl)
        except Exception as exc:
            logger.debug("redis_update_confirm_fallback", error=str(exc))

        return True

    async def consume_confirmation(
        self, chat_id: str | int, token: str
    ) -> Optional[Dict[str, Any]]:
        """Validate and consume a confirmation token once, preventing replay attacks."""
        key = f"{CONFIRM_PREFIX}{token}"
        data = None

        try:
            redis_client = get_redis()
            raw = await redis_client.get(key)
            if raw:
                await redis_client.delete(key)
                data = json.loads(raw)
        except Exception as exc:
            logger.debug("redis_consume_confirm_fallback", error=str(exc))

        # Always remove from in-memory fallback to prevent replay attacks
        mem_data = self._memory_confirms.pop(token, None)
        if not data and mem_data:
            if mem_data.get("expires_at", 0) > time.time():
                data = mem_data

        if not data:
            return None

        # Verify chat_id ownership
        if str(data.get("chat_id")) != str(chat_id):
            logger.warning("confirm_token_chat_id_mismatch", token=token)
            return None

        return data


conversation_state_manager = ConversationStateManager()

LANG_PREFIX = "tg:lang:"


async def get_user_language(chat_id: str | int, default_lang_code: Optional[str] = None) -> str:
    """Resolve active language for user ('fa' or 'en')."""
    chat_key = str(chat_id)
    try:
        redis_client = get_redis()
        val = await redis_client.get(f"{LANG_PREFIX}{chat_key}")
        if val:
            if isinstance(val, bytes):
                val = val.decode("utf-8")
            if val in ("fa", "en"):
                return val
    except Exception:
        pass

    state = await conversation_state_manager.get_state(chat_key)
    ctx_lang = state.context.get("lang")
    if ctx_lang in ("fa", "en"):
        return ctx_lang

    if default_lang_code:
        code = default_lang_code.strip().lower()
        if code.startswith("en"):
            return "en"
        elif code.startswith("fa"):
            return "fa"

    return "fa"


async def set_user_language(chat_id: str | int, lang: str) -> None:
    """Persist user language choice ('fa' or 'en')."""
    chat_key = str(chat_id)
    target_lang = "en" if lang == "en" else "fa"
    await conversation_state_manager.set_context(chat_key, "lang", target_lang)
    try:
        redis_client = get_redis()
        await redis_client.set(f"{LANG_PREFIX}{chat_key}", target_lang, ex=86400 * 30)
    except Exception:
        pass

