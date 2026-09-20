from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser
from app.core.exceptions import NotFoundError
from app.modules.docs import repository as repo
from app.modules.docs.models import DocPage, DocRelation, DocSpace
from app.modules.docs.schemas import GraphEdge, GraphNode, GraphResponse
from app.modules.docs.service import _page_visible


async def get_local_graph(
    db: AsyncSession,
    user: CurrentUser,
    page_id: UUID,
    depth: int = 1,
) -> GraphResponse:
    center_page = await repo.get_page(db, page_id)
    if not center_page:
        raise NotFoundError("Documentation page", page_id)
    center_space = await repo.get_space(db, center_page.space_id)
    if not center_space or not await _page_visible(db, user, center_page, center_space):
        raise NotFoundError("Documentation page", page_id)

    visited_page_ids: set[UUID] = {page_id}
    current_frontier: set[UUID] = {page_id}
    collected_relations: list[DocRelation] = []

    for _ in range(depth):
        if not current_frontier:
            break
        # Find relations where source or target is in current_frontier
        stmt = select(DocRelation).where(
            or_(
                DocRelation.source_page_id.in_(current_frontier),
                DocRelation.target_page_id.in_(current_frontier),
            )
        )
        result = await db.execute(stmt)
        relations = result.scalars().all()
        next_frontier: set[UUID] = set()

        for rel in relations:
            collected_relations.append(rel)
            if rel.source_page_id and rel.source_page_id not in visited_page_ids:
                next_frontier.add(rel.source_page_id)
                visited_page_ids.add(rel.source_page_id)
            if rel.target_page_id and rel.target_page_id not in visited_page_ids:
                next_frontier.add(rel.target_page_id)
                visited_page_ids.add(rel.target_page_id)

        current_frontier = next_frontier

    # Load all pages in visited_page_ids to check visibility
    pages_stmt = select(DocPage, DocSpace).join(DocSpace, DocPage.space_id == DocSpace.id).where(DocPage.id.in_(visited_page_ids))
    pages_result = await db.execute(pages_stmt)
    pages_map: dict[UUID, DocPage] = {}

    for p, s in pages_result.all():
        if await _page_visible(db, user, p, s):
            pages_map[p.id] = p

    # Build nodes & edges
    node_degree: dict[str, int] = defaultdict(int)
    edges: list[GraphEdge] = []
    seen_edge_ids: set[str] = set()

    nodes_dict: dict[str, GraphNode] = {}

    for rel in collected_relations:
        src_id = str(rel.source_page_id)
        if rel.source_page_id not in pages_map:
            continue

        if rel.target_page_id and rel.target_page_id in pages_map:
            tgt_id = str(rel.target_page_id)
            tgt_page = pages_map[rel.target_page_id]
            if tgt_id not in nodes_dict:
                nodes_dict[tgt_id] = GraphNode(
                    id=tgt_id,
                    label=tgt_page.title,
                    doc_type=tgt_page.doc_type,
                    is_stub=False,
                    space_id=tgt_page.space_id,
                    degree=0,
                    group=tgt_page.doc_type,
                )
        elif rel.is_stub:
            tgt_id = f"stub:{rel.target_title}"
            if tgt_id not in nodes_dict:
                nodes_dict[tgt_id] = GraphNode(
                    id=tgt_id,
                    label=rel.target_title,
                    doc_type="stub",
                    is_stub=True,
                    space_id=None,
                    degree=0,
                    group="stub",
                )
        else:
            continue

        src_page = pages_map[rel.source_page_id]
        if src_id not in nodes_dict:
            nodes_dict[src_id] = GraphNode(
                id=src_id,
                label=src_page.title,
                doc_type=src_page.doc_type,
                is_stub=False,
                space_id=src_page.space_id,
                degree=0,
                group=src_page.doc_type,
            )

        edge_id = str(rel.id)
        if edge_id not in seen_edge_ids:
            seen_edge_ids.add(edge_id)
            edges.append(
                GraphEdge(
                    id=edge_id,
                    source=src_id,
                    target=tgt_id,
                    relation_type=rel.relation_type,
                    weight=1.0,
                )
            )
            node_degree[src_id] += 1
            node_degree[tgt_id] += 1

    # Update degrees
    for nid, node in nodes_dict.items():
        node.degree = node_degree[nid]

    # Ensure center page is in nodes even if it has no connections
    center_id_str = str(center_page.id)
    if center_id_str not in nodes_dict:
        nodes_dict[center_id_str] = GraphNode(
            id=center_id_str,
            label=center_page.title,
            doc_type=center_page.doc_type,
            is_stub=False,
            space_id=center_page.space_id,
            degree=0,
            group=center_page.doc_type,
        )

    return GraphResponse(
        nodes=list(nodes_dict.values()),
        edges=edges,
        total_nodes=len(nodes_dict),
        total_edges=len(edges),
    )


async def get_global_graph(
    db: AsyncSession,
    user: CurrentUser,
    space_id: UUID | None = None,
) -> GraphResponse:
    pages_stmt = select(DocPage, DocSpace).join(DocSpace, DocPage.space_id == DocSpace.id)
    if space_id:
        pages_stmt = pages_stmt.where(DocPage.space_id == space_id)

    pages_result = await db.execute(pages_stmt)
    visible_pages: dict[UUID, DocPage] = {}

    for p, s in pages_result.all():
        if await _page_visible(db, user, p, s):
            visible_pages[p.id] = p

    if not visible_pages:
        return GraphResponse(nodes=[], edges=[], total_nodes=0, total_edges=0)

    rel_stmt = select(DocRelation).where(DocRelation.source_page_id.in_(list(visible_pages.keys())))
    rel_result = await db.execute(rel_stmt)
    relations = rel_result.scalars().all()

    nodes_dict: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []
    seen_edge_ids: set[str] = set()
    node_degree: dict[str, int] = defaultdict(int)

    # Initialize nodes for all visible pages
    for pid, page in visible_pages.items():
        pid_str = str(pid)
        nodes_dict[pid_str] = GraphNode(
            id=pid_str,
            label=page.title,
            doc_type=page.doc_type,
            is_stub=False,
            space_id=page.space_id,
            degree=0,
            group=page.doc_type or "general",
        )

    for rel in relations:
        src_id = str(rel.source_page_id)
        if rel.target_page_id and rel.target_page_id in visible_pages:
            tgt_id = str(rel.target_page_id)
        elif rel.is_stub:
            tgt_id = f"stub:{rel.target_title}"
            if tgt_id not in nodes_dict:
                nodes_dict[tgt_id] = GraphNode(
                    id=tgt_id,
                    label=rel.target_title,
                    doc_type="stub",
                    is_stub=True,
                    space_id=None,
                    degree=0,
                    group="stub",
                )
        else:
            continue

        edge_id = str(rel.id)
        if edge_id not in seen_edge_ids:
            seen_edge_ids.add(edge_id)
            edges.append(
                GraphEdge(
                    id=edge_id,
                    source=src_id,
                    target=tgt_id,
                    relation_type=rel.relation_type,
                    weight=1.0,
                )
            )
            node_degree[src_id] += 1
            node_degree[tgt_id] += 1

    for nid, node in nodes_dict.items():
        node.degree = node_degree[nid]

    return GraphResponse(
        nodes=list(nodes_dict.values()),
        edges=edges,
        total_nodes=len(nodes_dict),
        total_edges=len(edges),
    )
