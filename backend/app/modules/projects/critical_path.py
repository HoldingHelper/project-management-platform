"""Critical Path Method (CPM) engine (architecture spec section 5.2).

Pure, dependency-free implementation of the classic forward/backward pass:

- Forward pass (topological order): EarliestStart = max(EarliestFinish of all
  predecessors + lag), EarliestFinish = EarliestStart + duration.
- Backward pass (reverse topological order): LatestFinish = min(LatestStart of
  all successors - lag), LatestStart = LatestFinish - duration.
- TotalSlack = LatestStart - EarliestStart. A task is on the critical path iff
  TotalSlack == 0.

Per the spec's `auto_scheduling_use_progress` optimisation, callers may pass
`excluded_task_ids` (typically tasks already at 100% progress) to prune them
-- and any edges touching them -- from the graph before recomputation, which
significantly reduces node traversal on large, mostly-complete projects.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence, Set
from uuid import UUID

from app.modules.projects.dag import topological_sort


@dataclass(frozen=True)
class CpmTask:
    task_id: UUID
    duration_days: float


@dataclass(frozen=True)
class CpmEdge:
    predecessor_id: UUID
    successor_id: UUID
    lag_days: float = 0.0


@dataclass(frozen=True)
class CpmResult:
    task_id: UUID
    earliest_start: float
    earliest_finish: float
    latest_start: float
    latest_finish: float
    total_slack: float
    is_critical: bool


def _prune(
    tasks: Sequence[CpmTask], edges: Sequence[CpmEdge], excluded_task_ids: Set[UUID]
) -> tuple[list[CpmTask], list[CpmEdge]]:
    kept_tasks = [t for t in tasks if t.task_id not in excluded_task_ids]
    kept_ids = {t.task_id for t in kept_tasks}
    kept_edges = [
        e for e in edges if e.predecessor_id in kept_ids and e.successor_id in kept_ids
    ]
    return kept_tasks, kept_edges


def compute_critical_path(
    tasks: Sequence[CpmTask],
    edges: Sequence[CpmEdge],
    excluded_task_ids: Iterable[UUID] | None = None,
) -> Dict[UUID, CpmResult]:
    excluded = set(excluded_task_ids or [])
    tasks, edges = _prune(tasks, edges, excluded)

    if not tasks:
        return {}

    duration_by_id = {t.task_id: t.duration_days for t in tasks}
    node_ids = [t.task_id for t in tasks]
    edge_pairs = [(e.predecessor_id, e.successor_id) for e in edges]
    order = topological_sort(node_ids, edge_pairs)

    predecessors: Dict[UUID, List[CpmEdge]] = {n: [] for n in node_ids}
    successors: Dict[UUID, List[CpmEdge]] = {n: [] for n in node_ids}
    for e in edges:
        predecessors[e.successor_id].append(e)
        successors[e.predecessor_id].append(e)

    earliest_start: Dict[UUID, float] = {}
    earliest_finish: Dict[UUID, float] = {}
    for task_id in order:
        preds = predecessors.get(task_id, [])
        if not preds:
            es = 0.0
        else:
            es = max(earliest_finish[e.predecessor_id] + e.lag_days for e in preds)
        earliest_start[task_id] = es
        earliest_finish[task_id] = es + duration_by_id[task_id]

    project_duration = max(earliest_finish.values(), default=0.0)

    latest_finish: Dict[UUID, float] = {}
    latest_start: Dict[UUID, float] = {}
    for task_id in reversed(order):
        succs = successors.get(task_id, [])
        if not succs:
            lf = project_duration
        else:
            lf = min(latest_start[e.successor_id] - e.lag_days for e in succs)
        latest_finish[task_id] = lf
        latest_start[task_id] = lf - duration_by_id[task_id]

    results: Dict[UUID, CpmResult] = {}
    for task_id in node_ids:
        slack = round(latest_start[task_id] - earliest_start[task_id], 4)
        results[task_id] = CpmResult(
            task_id=task_id,
            earliest_start=round(earliest_start[task_id], 4),
            earliest_finish=round(earliest_finish[task_id], 4),
            latest_start=round(latest_start[task_id], 4),
            latest_finish=round(latest_finish[task_id], 4),
            total_slack=slack,
            is_critical=slack <= 1e-9,
        )
    return results


def hours_to_days(
    hours: float | None, hours_per_day: float = 8.0, default_days: float = 1.0
) -> float:
    if hours is None or hours <= 0:
        return default_days
    return round(hours / hours_per_day, 4)
