"""Unit tests for Strawberry GraphQL Engine queries and mutations."""

from __future__ import annotations

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone
from types import SimpleNamespace

from app.graphql.schema import schema
from app.graphql.context import GraphQLContext
from app.core.current_user import CurrentUser
from app.modules.projects.models import Project, TaskItem as Task
from app.modules.docs.models import DocSpace, DocPage


@pytest.mark.asyncio
async def test_graphql_query_me(monkeypatch):
    user_id = uuid4()
    mock_user = CurrentUser(
        user_id=user_id,
        email="architect@example.com",
        full_name="Lead Architect",
        roles=["admin"],
        permissions=["*"],
    )

    context = GraphQLContext(request=MagicMock(), current_user=mock_user)

    query = """
    query {
        me {
            id
            email
            fullName
            roles
        }
    }
    """
    res = await schema.execute(query, context_value=context)
    assert res.errors is None
    assert res.data["me"]["email"] == "architect@example.com"
    assert res.data["me"]["fullName"] == "Lead Architect"


@pytest.mark.asyncio
async def test_graphql_mutation_create_diagram_doc(monkeypatch):
    user_id = uuid4()
    space_id = uuid4()
    mock_user = CurrentUser(
        user_id=user_id,
        email="architect@example.com",
        full_name="Lead Architect",
        roles=["admin"],
        permissions=["*"],
    )

    mock_db = AsyncMock()
    context = GraphQLContext(request=MagicMock(), current_user=mock_user)
    context._db = mock_db

    mutation = """
    mutation CreateDiag($spaceId: UUID!, $title: String!, $dtype: String!, $spec: String!) {
        createDiagramDoc(spaceId: $spaceId, title: $title, diagramType: $dtype, specJson: $spec) {
            title
            diagramType
            svgContent
            pageSlug
        }
    }
    """
    variables = {
        "spaceId": str(space_id),
        "title": "Core System Architecture",
        "dtype": "architecture",
        "spec": '{"nodes": [{"id": "web", "label": "Web App", "type": "client"}, {"id": "api", "label": "FastAPI", "type": "focal"}]}',
    }

    res = await schema.execute(mutation, variable_values=variables, context_value=context)
    assert res.errors is None
    data = res.data["createDiagramDoc"]
    assert data["title"] == "Core System Architecture"
    assert data["diagramType"] == "architecture"
    assert "<svg" in data["svgContent"]
    assert "FastAPI" in data["svgContent"]


@pytest.mark.asyncio
async def test_graphql_ticket_creation_uses_project_service(monkeypatch):
    from app.modules.projects import service as projects_service

    creator_id = uuid4()
    recipient_id = uuid4()
    task_id = uuid4()
    mock_user = CurrentUser(
        user_id=creator_id,
        email="creator@example.com",
        full_name="Ticket Creator",
        roles=["Developer"],
        permissions=["tasks.manage_team"],
    )
    created = SimpleNamespace(
        id=task_id,
        phase_id=None,
        parent_task_id=None,
        title="Restore service",
        description=None,
        status="Ready",
        priority="P2",
        created_at=datetime.now(timezone.utc),
        is_ticket=True,
        ticket_requested_by_user_id=creator_id,
    )
    create_task = AsyncMock(return_value=created)
    monkeypatch.setattr(projects_service, "create_task", create_task)
    context = GraphQLContext(request=MagicMock(), current_user=mock_user)
    context._db = AsyncMock()

    result = await schema.execute(
        """
        mutation CreateTicket($recipient: UUID!) {
          createTask(
            title: "Restore service"
            isTicket: true
            ticketRecipientUserIds: [$recipient]
          ) {
            id
            isTicket
            ticketRequestedByUserId
          }
        }
        """,
        variable_values={"recipient": str(recipient_id)},
        context_value=context,
    )

    assert result.errors is None
    assert result.data["createTask"]["isTicket"] is True
    payload = create_task.await_args.args[1]
    assert payload.ticket_recipient_user_ids == [recipient_id]
    assert create_task.await_args.kwargs["created_by_user_id"] == creator_id
