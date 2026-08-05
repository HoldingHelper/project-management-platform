"""Enumerations for the Projects module. Persisted as plain strings with a DB
CHECK constraint (rather than native Postgres ENUM types) to keep Alembic
migrations simple and additive."""

from __future__ import annotations

from enum import Enum


class ProductStatus(str, Enum):
    PLANNING = "Planning"
    ACTIVE = "Active"
    MAINTENANCE = "Maintenance"
    SUNSET = "Sunset"


class Environment(str, Enum):
    DEVELOPMENT = "Development"
    STAGING = "Staging"
    PRODUCTION = "Production"


class Priority(str, Enum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class RiskLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"


class HealthStatus(str, Enum):
    ON_TRACK = "on-track"
    AT_RISK = "at-risk"
    DELAYED = "delayed"
    BLOCKED = "blocked"
    COMPLETED = "completed"


class ProjectStatus(str, Enum):
    NOT_STARTED = "not-started"
    IN_PROGRESS = "in-progress"
    ON_HOLD = "on-hold"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ARCHIVED = "archived"


class PhaseType(str, Enum):
    REQUIREMENTS = "Requirements"
    ARCHITECTURE = "Architecture"
    DESIGN = "Design"
    DEVELOPMENT = "Development"
    TESTING = "Testing"
    DEPLOYMENT = "Deployment"
    MAINTENANCE = "Maintenance"


class PhaseStatus(str, Enum):
    NOT_STARTED = "not-started"
    IN_PROGRESS = "in-progress"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    DELAYED = "delayed"


class TaskType(str, Enum):
    FEATURE = "Feature"
    BUG = "Bug"
    ENHANCEMENT = "Enhancement"
    RESEARCH = "Research"
    DOCUMENTATION = "Documentation"
    MEETING = "Meeting"
    TESTING = "Testing"
    DEPLOYMENT = "Deployment"


class TaskStatus(str, Enum):
    NOT_STARTED = "NotStarted"
    READY = "Ready"
    IN_PROGRESS = "InProgress"
    WAITING = "Waiting"
    BLOCKED = "Blocked"
    REVIEW = "Review"
    TESTING = "Testing"
    DONE = "Done"
    CANCELLED = "Cancelled"
    ARCHIVED = "Archived"


TERMINAL_TASK_STATUSES = {
    TaskStatus.DONE.value,
    TaskStatus.ARCHIVED.value,
    TaskStatus.CANCELLED.value,
}

PENDING_REVIEW_STATUSES = {
    TaskStatus.REVIEW.value,
    TaskStatus.TESTING.value,
    TaskStatus.WAITING.value,
}


class DependencyType(str, Enum):
    FINISH_TO_START = "FinishToStart"
    START_TO_START = "StartToStart"
    FINISH_TO_FINISH = "FinishToFinish"
    START_TO_FINISH = "StartToFinish"


class ProjectMemberRole(str, Enum):
    PROJECT_MANAGER = "ProjectManager"
    TEAM_LEAD = "TeamLead"
    DEVELOPER = "Developer"
    QA = "QA"
    UIUX = "UIUX"
    BUSINESS_ANALYST = "BusinessAnalyst"
    CLIENT = "Client"
    OBSERVER = "Observer"
