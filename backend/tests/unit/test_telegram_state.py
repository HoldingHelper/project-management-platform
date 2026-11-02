"""Unit tests for conversation state manager, multi-turn contexts, and single-use confirmations."""

from __future__ import annotations

import time
import pytest

from app.modules.telegram.state import ConversationState, ConversationStateManager


@pytest.mark.asyncio
async def test_state_context_storage_and_ttl():
    mgr = ConversationStateManager(ttl_seconds=2)
    chat_id = "112233"

    # Context storage
    await mgr.set_context(chat_id, "last_task_id", "task-abc-123")
    val = await mgr.get_context(chat_id, "last_task_id")
    assert val == "task-abc-123"

    # State update
    state = await mgr.get_state(chat_id)
    assert state.context.get("last_task_id") == "task-abc-123"

    # Multi-turn pending intent
    await mgr.set_pending_intent(
        chat_id,
        intent_data={"title": "Fix login"},
        missing_field="project_name",
        prompt_text="برای کدام پروژه؟",
    )
    state = await mgr.get_state(chat_id)
    assert state.pending_intent.get("missing_field") == "project_name"

    # Clear pending intent
    await mgr.clear_pending_intent(chat_id)
    state = await mgr.get_state(chat_id)
    assert state.pending_intent == {}


@pytest.mark.asyncio
async def test_state_cancel():
    mgr = ConversationStateManager(ttl_seconds=60)
    chat_id = "998877"

    await mgr.set_pending_intent(
        chat_id,
        intent_data={"title": "Test task"},
        missing_field="project_name",
        prompt_text="Which project?",
    )
    had_pending = await mgr.cancel(chat_id)
    assert had_pending is True

    state = await mgr.get_state(chat_id)
    assert state.pending_intent == {}

    had_pending_again = await mgr.cancel(chat_id)
    assert had_pending_again is False


@pytest.mark.asyncio
async def test_single_use_confirmation_token_anti_replay():
    mgr = ConversationStateManager(ttl_seconds=60)
    chat_id = "554433"

    token = await mgr.create_confirmation(
        chat_id,
        action_type="delete_task",
        description="Delete task 142",
        payload={"task_id": "uuid-142"},
        ttl_seconds=10,
    )
    assert len(token) == 16

    # 1. First consumption succeeds
    data = await mgr.consume_confirmation(chat_id, token)
    assert data is not None
    assert data["action_type"] == "delete_task"
    assert data["payload"]["task_id"] == "uuid-142"

    # 2. Second consumption (replay attack) fails
    replay = await mgr.consume_confirmation(chat_id, token)
    assert replay is None

    # 3. Consumption by wrong chat_id fails
    token2 = await mgr.create_confirmation(
        chat_id,
        action_type="bulk_update",
        description="Update 20 tasks",
        payload={},
    )
    wrong_user = await mgr.consume_confirmation("wrong_chat_id", token2)
    assert wrong_user is None

