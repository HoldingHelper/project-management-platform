from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.current_user import CurrentUser
from app.modules.docs.ai_service import prepare_context
from app.modules.docs.models import DocPage, DocSpace
from app.modules.docs.relations import extract_wikilinks
from app.modules.docs.schemas import AIChatRequest, GraphEdge, GraphNode, GraphResponse, PageRead, PageSummary, SourceCreate
from app.modules.docs.search_service import _extract_highlight, _score_match
from app.modules.docs.sources_service import chunk_text


def test_extract_wikilinks_simple_and_aliased():
    content = """
    Check out [[Architecture Overview]] for the design.
    Also read [[ADR-001|Database Migration Decision]] and [[Nonexistent Page]].
    No link here [Regular](https://example.com).
    """
    links = extract_wikilinks(content)
    assert len(links) == 3
    assert links[0]["target"] == "Architecture Overview"
    assert links[0]["alias"] is None

    assert links[1]["target"] == "ADR-001"
    assert links[1]["alias"] == "Database Migration Decision"

    assert links[2]["target"] == "Nonexistent Page"


def test_chunk_text_paragraphs_and_overlap():
    text = ("Paragraph one with some interesting knowledge.\n\n" * 20)
    chunks = chunk_text(text, target_chunk_size=500, overlap=50)
    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk) > 0


def test_search_score_and_highlight():
    score_exact, field_exact = _score_match("Knowledge Base", "Some content", None, "knowledge base")
    assert score_exact == 1.0
    assert field_exact == "title"

    score_prefix, field_prefix = _score_match("Knowledge Base", "Some content", None, "know")
    assert score_prefix == 0.9
    assert field_prefix == "title"

    score_content, field_content = _score_match("Different Title", "We store documentation here.", None, "documentation")
    assert score_content == 0.35
    assert field_content == "content"

    highlight = _extract_highlight("This is a long text containing important secrets about the architecture.", "secrets")
    assert "secrets" in highlight


def test_graph_schemas_validation():
    node = GraphNode(
        id=str(uuid4()),
        label="Architecture",
        title="Architecture",
        doc_type="adr",
        degree=2,
    )
    edge = GraphEdge(
        source=node.id,
        target=str(uuid4()),
        relation_type="links_to",
        confidence_score=1.0,
    )
    graph = GraphResponse(nodes=[node], edges=[edge])
    assert len(graph.nodes) == 1
    assert len(graph.edges) == 1


@pytest.mark.asyncio
async def test_prepare_context_with_explicit_pages(monkeypatch):
    user = CurrentUser(user_id=uuid4(), email="dev@example.com", full_name="Developer", permissions=["docs.view"])
    page_id = uuid4()
    space_id = uuid4()

    mock_page = DocPage(
        id=page_id,
        space_id=space_id,
        title="Service Architecture",
        slug="service-architecture",
        content="Microservices use gRPC for internal communications.",
        doc_type="document",
        visibility="workspace",
        created_by=user.user_id,
        updated_by=user.user_id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    mock_space = DocSpace(
        id=space_id,
        name="Engineering",
        slug="engineering",
        visibility="workspace",
        created_by=user.user_id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    class MockSession:
        pass

    async def mock_get_page(_db, _pid):
        return mock_page if _pid == page_id else None

    async def mock_get_space(_db, _sid):
        return mock_space if _sid == space_id else None

    async def mock_visible(_db, _u, _p, _s):
        return True

    from app.modules.docs import ai_service, repository as repo
    monkeypatch.setattr(repo, "get_page", mock_get_page)
    monkeypatch.setattr(repo, "get_space", mock_get_space)
    monkeypatch.setattr(ai_service, "_page_visible", mock_visible)

    req = AIChatRequest(question="How do microservices communicate?", page_ids=[page_id])
    context, citations = await prepare_context(MockSession(), user, req)

    assert "[1] (Page: \"Service Architecture\")" in context
    assert "Microservices use gRPC" in context
    assert len(citations) == 1
    assert citations[0]["source_title"] == "Service Architecture"
    assert citations[0]["citation_index"] == 1
