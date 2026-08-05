"""In-memory DAG utilities for task dependencies.

This provides a fast, friendly pre-check (DFS cycle detection + Kahn's
topological sort) run in the application layer *before* an INSERT is even
attempted, giving users an immediate, well-worded 400 response. The
authoritative, race-condition-proof guard is the Postgres recursive-CTE
constraint trigger (see `alembic` migration `0002_dag_cycle_trigger`) which
still runs inside the database transaction as defense-in-depth -- this module
does NOT replace it.
"""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Dict, Iterable, List, Set, Tuple
from uuid import UUID

from app.core.exceptions import BusinessRuleError


class DependencyCycleError(BusinessRuleError):
    def __init__(
        self, predecessor_id: UUID, successor_id: UUID, cycle_path: List[UUID]
    ):
        path_str = " -> ".join(str(p) for p in cycle_path)
        super().__init__(
            f"Cannot add dependency: task {successor_id} cannot depend on task {predecessor_id} "
            f"because it would create a circular chain ({path_str})."
        )
        self.predecessor_id = predecessor_id
        self.successor_id = successor_id
        self.cycle_path = cycle_path


def build_adjacency(edges: Iterable[Tuple[UUID, UUID]]) -> Dict[UUID, List[UUID]]:
    """edges are (predecessor_id, successor_id) pairs; adjacency maps a task
    to the tasks that directly depend on it (its successors)."""
    graph: Dict[UUID, List[UUID]] = defaultdict(list)
    for predecessor, successor in edges:
        graph[predecessor].append(successor)
    return graph


def would_create_cycle(
    existing_edges: Iterable[Tuple[UUID, UUID]],
    new_predecessor_id: UUID,
    new_successor_id: UUID,
) -> List[UUID] | None:
    """Returns the offending path if adding `new_predecessor_id ->
    new_successor_id` would create a cycle, else None.

    A cycle occurs iff `new_predecessor_id` is already reachable FROM
    `new_successor_id` in the existing graph (i.e. successor is an ancestor
    requirement of predecessor already), since that would close the loop.
    """
    if new_predecessor_id == new_successor_id:
        return [new_predecessor_id, new_successor_id]

    graph = build_adjacency(existing_edges)

    # BFS forward from new_successor_id: if we can reach new_predecessor_id,
    # adding predecessor->successor would close a cycle.
    queue: deque[Tuple[UUID, List[UUID]]] = deque(
        [(new_successor_id, [new_successor_id])]
    )
    visited: Set[UUID] = {new_successor_id}

    while queue:
        current, path = queue.popleft()
        for neighbour in graph.get(current, []):
            if neighbour == new_predecessor_id:
                return path + [neighbour]
            if neighbour not in visited:
                visited.add(neighbour)
                queue.append((neighbour, path + [neighbour]))

    return None


def topological_sort(
    nodes: Iterable[UUID], edges: Iterable[Tuple[UUID, UUID]]
) -> List[UUID]:
    """Kahn's algorithm. Raises BusinessRuleError if the graph is not a DAG
    (defensive; should be unreachable given the cycle guard above + the DB
    trigger, but protects the critical-path calculator from an infinite loop
    if data is ever manipulated out-of-band)."""
    nodes = list(nodes)
    in_degree: Dict[UUID, int] = {n: 0 for n in nodes}
    graph = build_adjacency(edges)
    for predecessor, successor in edges:
        if successor in in_degree:
            in_degree[successor] += 1

    queue: deque[UUID] = deque([n for n in nodes if in_degree[n] == 0])
    ordered: List[UUID] = []

    while queue:
        current = queue.popleft()
        ordered.append(current)
        for neighbour in graph.get(current, []):
            if neighbour in in_degree:
                in_degree[neighbour] -= 1
                if in_degree[neighbour] == 0:
                    queue.append(neighbour)

    if len(ordered) != len(nodes):
        raise BusinessRuleError(
            "Task dependency graph contains a cycle and cannot be topologically sorted."
        )

    return ordered
