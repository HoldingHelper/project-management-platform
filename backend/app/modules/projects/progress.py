"""Progress Calculation Engine (architecture spec section 5.1).

Progress is a weighted average across a set of work items, weighted by
either story points or estimated hours, where completion is a binary
(1.0 if the item is Done/Archived, 0.0 otherwise). This module is pure and
has no I/O so it can be tested exhaustively.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from app.modules.projects.enums import TERMINAL_TASK_STATUSES, TaskStatus


@dataclass(frozen=True)
class WeightedItem:
    weight: float
    is_done: bool


def weighted_progress_percentage(items: Sequence[WeightedItem]) -> float:
    """Returns a percentage in [0, 100], rounded to 2 decimal places.

    If every item has a weight of zero (e.g. no story points/estimates were
    ever set), falls back to a simple unweighted completion ratio so the
    metric is still meaningful instead of collapsing to 0.
    """
    if not items:
        return 0.0

    total_weight = sum(item.weight for item in items)
    if total_weight <= 0:
        done_count = sum(1 for item in items if item.is_done)
        return round((done_count / len(items)) * 100, 2)

    completed_weight = sum(item.weight for item in items if item.is_done)
    return round((completed_weight / total_weight) * 100, 2)


def task_weight(story_points: float | None, estimated_hours: float | None) -> float:
    """Prefers story points when present (matches Agile-methodology teams),
    falling back to estimated hours, then to a nominal weight of 1 so
    un-estimated tasks still count towards progress."""
    if story_points is not None and story_points > 0:
        return float(story_points)
    if estimated_hours is not None and estimated_hours > 0:
        return float(estimated_hours)
    return 1.0


def is_task_done(status: str) -> bool:
    return status in TERMINAL_TASK_STATUSES and status != TaskStatus.CANCELLED.value


@dataclass(frozen=True)
class TaskProgressInput:
    task_id: str
    status: str
    story_points: float | None
    estimated_hours: float | None


def calculate_phase_progress(tasks: Iterable[TaskProgressInput]) -> float:
    items = [
        WeightedItem(
            weight=task_weight(t.story_points, t.estimated_hours),
            is_done=is_task_done(t.status),
        )
        for t in tasks
    ]
    return weighted_progress_percentage(items)


@dataclass(frozen=True)
class PhaseProgressInput:
    phase_id: str
    progress_percentage: float
    task_count: int


def calculate_project_progress(phases: Iterable[PhaseProgressInput]) -> float:
    """Project progress is the task-count-weighted average of its phases'
    already-computed progress percentages (so an empty phase doesn't skew
    the number as much as a phase with 50 tasks)."""
    items = [WeightedItem(weight=max(p.task_count, 1), is_done=False) for p in phases]
    if not items:
        return 0.0
    total_weight = sum(i.weight for i in items)
    weighted_sum = sum(p.progress_percentage * max(p.task_count, 1) for p in phases)
    return round(weighted_sum / total_weight, 2) if total_weight else 0.0


STATUS_BREAKDOWN_BUCKETS = ("completed", "in_progress", "blocked", "overdue", "pending")


def progress_breakdown(
    tasks: Iterable[TaskProgressInput], overdue_task_ids: set[str] | None = None
) -> dict[str, float]:
    """Returns the percentage split shown on the Master Progress Bar UI, e.g.
    52% Completed / 30% Pending / 10% Blocked / 8% Overdue."""
    overdue_task_ids = overdue_task_ids or set()
    tasks = list(tasks)
    if not tasks:
        return {bucket: 0.0 for bucket in STATUS_BREAKDOWN_BUCKETS}

    counts = {bucket: 0 for bucket in STATUS_BREAKDOWN_BUCKETS}
    for t in tasks:
        if t.task_id in overdue_task_ids and not is_task_done(t.status):
            counts["overdue"] += 1
        elif is_task_done(t.status):
            counts["completed"] += 1
        elif t.status == TaskStatus.BLOCKED.value:
            counts["blocked"] += 1
        elif t.status in (
            TaskStatus.IN_PROGRESS.value,
            TaskStatus.REVIEW.value,
            TaskStatus.TESTING.value,
        ):
            counts["in_progress"] += 1
        else:
            counts["pending"] += 1

    total = len(tasks)
    return {bucket: round((count / total) * 100, 2) for bucket, count in counts.items()}


def blocks_string(percent: float, total_blocks: int = 20) -> str:
    """The terminal-style Master Progress Bar rendering: `██████████░░░░░░░░`."""
    filled = round((max(0.0, min(percent, 100.0)) / 100) * total_blocks)
    return "█" * filled + "░" * (total_blocks - filled)
