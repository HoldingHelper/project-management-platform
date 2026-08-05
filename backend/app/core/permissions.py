"""The canonical RBAC permission catalog and role -> permission matrix.

This is the single source of truth referenced by every module. Permission
code strings must never be renamed once shipped (additive changes only).
"""

from __future__ import annotations


class Permissions:
    MANAGE_USERS = "system.manage_users"
    MANAGE_ROLES = "system.manage_roles"
    VIEW_AUDIT_LOGS = "system.view_audit_logs"
    MANAGE_SETTINGS = "system.manage_settings"

    PRODUCTS_VIEW_ALL = "products.view_all"
    PRODUCTS_VIEW_ASSIGNED = "products.view_assigned"
    PRODUCTS_MANAGE_ALL = "products.manage_all"

    PROJECTS_VIEW_ALL = "projects.view_all"
    PROJECTS_VIEW_ASSIGNED = "projects.view_assigned"
    PROJECTS_MANAGE_ALL = "projects.manage_all"
    PROJECTS_MANAGE_ASSIGNED = "projects.manage_assigned"
    PROJECTS_MANAGE_USERS = "projects.manage_users"

    PHASES_VIEW = "phases.view"
    PHASES_MANAGE_ALL = "phases.manage_all"
    PHASES_MANAGE_TEAM = "phases.manage_team"
    PHASES_APPROVE = "phases.approve"

    TASKS_VIEW = "tasks.view"
    TASKS_EDIT_ASSIGNED = "tasks.edit_assigned"
    TASKS_MANAGE_TEAM = "tasks.manage_team"
    TASKS_MANAGE_ALL = "tasks.manage_all"
    TASKS_COMMENT = "tasks.comment"
    TASKS_UPLOAD_FILES = "tasks.upload_files"
    TASKS_MANAGE_TESTING = "tasks.manage_testing"
    TASKS_MANAGE_DESIGN = "tasks.manage_design"

    REQUIREMENTS_CREATE = "requirements.create"

    REPORTS_VIEW = "reports.view"
    REPORTS_VIEW_EXECUTIVE = "reports.view_executive"
    TIMELINES_VIEW = "timelines.view"

    READONLY_ACCESS = "readonly.access"

    USERS_INVITE = "users.invite"
    MILESTONES_MANAGE = "milestones.manage"
    CHAT_ACCESS = "chat.access"
    MUSIC_ACCESS = "music.access"
    ANALYTICS_VIEW_ORG = "analytics.view_org"
    ANALYTICS_EXPORT = "analytics.export"
    PLANNING_UPLOAD = "planning.upload"

    @classmethod
    def all(cls) -> list[str]:
        return [
            v
            for k, v in vars(cls).items()
            if not k.startswith("_") and isinstance(v, str)
        ]


ROLE_SUPER_ADMIN = "SuperAdmin"
ROLE_C_LEVEL = "CLevel"
ROLE_COMPANY_MANAGER = "CompanyManager"
ROLE_PROJECT_MANAGER = "ProjectManager"
ROLE_TEAM_LEAD = "TeamLead"
ROLE_DEVELOPER = "Developer"
ROLE_QA = "QA"
ROLE_UIUX = "UIUX"
ROLE_BUSINESS_ANALYST = "BusinessAnalyst"
ROLE_CLIENT = "Client"
ROLE_GUEST = "Guest"

ALL_ROLES = [
    ROLE_SUPER_ADMIN,
    ROLE_C_LEVEL,
    ROLE_COMPANY_MANAGER,
    ROLE_PROJECT_MANAGER,
    ROLE_TEAM_LEAD,
    ROLE_DEVELOPER,
    ROLE_QA,
    ROLE_UIUX,
    ROLE_BUSINESS_ANALYST,
    ROLE_CLIENT,
    ROLE_GUEST,
]

# Role -> permission codes. SuperAdmin implicitly has every permission
# (enforced in code, not listed exhaustively here).
ROLE_PERMISSIONS: dict[str, list[str]] = {
    ROLE_SUPER_ADMIN: Permissions.all(),
    ROLE_C_LEVEL: [
        # Read-heavy executive role: business dashboards, org-wide analytics,
        # long-term planning. No day-to-day management permissions.
        Permissions.PRODUCTS_VIEW_ALL,
        Permissions.PROJECTS_VIEW_ALL,
        Permissions.PHASES_VIEW,
        Permissions.TASKS_VIEW,
        Permissions.REPORTS_VIEW,
        Permissions.REPORTS_VIEW_EXECUTIVE,
        Permissions.TIMELINES_VIEW,
        Permissions.ANALYTICS_VIEW_ORG,
        Permissions.ANALYTICS_EXPORT,
        Permissions.PLANNING_UPLOAD,
        Permissions.CHAT_ACCESS,
        Permissions.MUSIC_ACCESS,
        Permissions.READONLY_ACCESS,
    ],
    ROLE_COMPANY_MANAGER: [
        Permissions.PRODUCTS_VIEW_ALL,
        Permissions.PROJECTS_MANAGE_ALL,
        Permissions.PHASES_APPROVE,
        Permissions.PHASES_MANAGE_TEAM,
        Permissions.TASKS_MANAGE_ALL,
        Permissions.REPORTS_VIEW_EXECUTIVE,
        Permissions.REPORTS_VIEW,
        Permissions.TIMELINES_VIEW,
        Permissions.VIEW_AUDIT_LOGS,
        Permissions.USERS_INVITE,
        Permissions.MILESTONES_MANAGE,
        Permissions.CHAT_ACCESS,
        Permissions.MUSIC_ACCESS,
        Permissions.ANALYTICS_VIEW_ORG,
        Permissions.ANALYTICS_EXPORT,
    ],
    ROLE_PROJECT_MANAGER: [
        Permissions.PRODUCTS_VIEW_ASSIGNED,
        Permissions.PROJECTS_MANAGE_ASSIGNED,
        Permissions.PHASES_APPROVE,
        Permissions.PHASES_MANAGE_TEAM,
        Permissions.TASKS_MANAGE_ALL,
        Permissions.PROJECTS_MANAGE_USERS,
        Permissions.REPORTS_VIEW,
        Permissions.TIMELINES_VIEW,
        Permissions.TASKS_COMMENT,
        Permissions.TASKS_UPLOAD_FILES,
        Permissions.MILESTONES_MANAGE,
        Permissions.CHAT_ACCESS,
        Permissions.MUSIC_ACCESS,
        Permissions.ANALYTICS_EXPORT,
    ],
    ROLE_TEAM_LEAD: [
        Permissions.PRODUCTS_VIEW_ASSIGNED,
        Permissions.PROJECTS_VIEW_ASSIGNED,
        Permissions.PHASES_MANAGE_TEAM,
        Permissions.TASKS_MANAGE_TEAM,
        Permissions.REPORTS_VIEW,
        Permissions.TASKS_COMMENT,
        Permissions.TASKS_UPLOAD_FILES,
        Permissions.CHAT_ACCESS,
        Permissions.MUSIC_ACCESS,
    ],
    ROLE_DEVELOPER: [
        Permissions.PRODUCTS_VIEW_ASSIGNED,
        Permissions.PROJECTS_VIEW_ASSIGNED,
        Permissions.TASKS_EDIT_ASSIGNED,
        Permissions.TASKS_COMMENT,
        Permissions.TASKS_UPLOAD_FILES,
        Permissions.CHAT_ACCESS,
        Permissions.MUSIC_ACCESS,
    ],
    ROLE_QA: [
        Permissions.PRODUCTS_VIEW_ASSIGNED,
        Permissions.PROJECTS_VIEW_ASSIGNED,
        Permissions.TASKS_MANAGE_TESTING,
        Permissions.TASKS_COMMENT,
        Permissions.TASKS_UPLOAD_FILES,
        Permissions.CHAT_ACCESS,
        Permissions.MUSIC_ACCESS,
    ],
    ROLE_UIUX: [
        Permissions.PRODUCTS_VIEW_ASSIGNED,
        Permissions.PROJECTS_VIEW_ASSIGNED,
        Permissions.TASKS_MANAGE_DESIGN,
        Permissions.TASKS_COMMENT,
        Permissions.TASKS_UPLOAD_FILES,
        Permissions.CHAT_ACCESS,
        Permissions.MUSIC_ACCESS,
    ],
    ROLE_BUSINESS_ANALYST: [
        Permissions.PRODUCTS_VIEW_ASSIGNED,
        Permissions.PROJECTS_VIEW_ASSIGNED,
        Permissions.REQUIREMENTS_CREATE,
        Permissions.TIMELINES_VIEW,
        Permissions.TASKS_COMMENT,
        Permissions.CHAT_ACCESS,
        Permissions.MUSIC_ACCESS,
    ],
    ROLE_CLIENT: [
        Permissions.READONLY_ACCESS,
        Permissions.CHAT_ACCESS,
        Permissions.MUSIC_ACCESS,
    ],
    ROLE_GUEST: [],
}


def permissions_for_roles(roles: list[str]) -> list[str]:
    """Union of permissions granted by a list of role names."""
    result: set[str] = set()
    for role in roles:
        result.update(ROLE_PERMISSIONS.get(role, []))
    return sorted(result)
