"""Idempotent seed routine for internal documentation spaces and tutorial pages.

Populates docs.spaces and docs.pages with comprehensive guides covering:
- Projects & Execution
- Tasks, Kanban & Timeline DAG
- Real-Time Chat & Channels
- Music Channel Synchronized Playback
- Google Calendar & Meeting Alerts
- GitHub PR Automations
- WhatsApp Bot & Notifications
- MCP Server & AI Tools
- Strawberry GraphQL Engine
- Visual Workflow Automations
- Admin, Users & RBAC
- Diagram Design System
"""

from __future__ import annotations

from typing import Any, Dict, List
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.docs import diagram_generator
from app.modules.docs.models import DocPage, DocSpace
from app.modules.identity.models import User

logger = structlog.get_logger(__name__)

SYSTEM_AUTHOR_ID = UUID("00000000-0000-0000-0000-000000000000")


DOC_SPACES_DATA: List[Dict[str, Any]] = [
    {
        "name": "Getting Started & Core Platform",
        "slug": "getting-started",
        "description": "Fundamental concepts, workspace architecture, global navigation, and quickstart tutorials.",
        "icon": "book-open",
        "position": 1,
        "visibility": "public",
        "pages": [
            {
                "title": "Platform Architecture & Overview",
                "slug": "platform-architecture-overview",
                "excerpt": "High-level design of the Project Management Platform combining Knowledge Docs and Real-Time Execution.",
                "content": """# Project Management Platform Architecture & Overview

Welcome to the **Project Management Platform** — an enterprise-grade, real-time project management and organizational intelligence platform.

## Unified Knowledge & Execution
Project Management Platform bridges the gap between durable documentation and agile execution:
1. **Knowledge Layer (`/app/docs`)**: Spaces, hierarchical documentation, RFCs, and accessible SVG diagrams.
2. **Execution Layer (`/app/teams`)**: Projects, task DAGs, portfolio roadmaps, team assignment, and blockers.
3. **Collaboration & Media**: WebSockets real-time channels, direct messages, and synced music rooms.
4. **Developer Intelligence**: Model Context Protocol (MCP) server, Strawberry GraphQL engine, GitHub PR sync, and WhatsApp bot.

```xml
{ARCHITECTURE_DIAGRAM}
```

## Global Navigation
- **Docs / Teams Switcher**: Toggle between knowledge base and project execution in the top header.
- **Meeting Pill**: Real-time Google Calendar counter with 1-click Google Meet joins.
- **Global Search (`Cmd+K`)**: Rapidly search tasks, projects, documentation pages, and team members.
""",
            },
            {
                "title": "Signing In & Profile Management",
                "slug": "signing-in-and-profile",
                "excerpt": "Account authentication, theme customization, email updates, and security credentials.",
                "content": """# Signing In & Profile Management

## Authentication & Security
- **Email / Password Authentication**: Sign in using your registered corporate email address.
- **Theme Preferences**: Switch between sleek Dark Mode and High-Contrast Light Mode in Settings.
- **Password Management**: Update your password under Settings (signs out active sessions).
- **Admin Password Reset**: Platform administrators can reset user credentials directly from the Administration portal.
""",
            },
        ],
    },
    {
        "name": "Projects & Portfolio Management",
        "slug": "projects-portfolio",
        "description": "How to create projects, configure two-week sprints, manage budgets, and generate scopes with AI.",
        "icon": "folder-kanban",
        "position": 2,
        "visibility": "workspace",
        "pages": [
            {
                "title": "How to Create and Configure Projects",
                "slug": "how-to-create-projects",
                "excerpt": "Step-by-step tutorial on defining project scopes, owners, sprints, risk levels, and budgets.",
                "content": """# How to Create and Configure Projects

Creating clear, outcome-oriented projects is the foundation of high-velocity delivery.

## Step-by-Step Tutorial
1. **Navigate to Projects**: Open `/app/teams/portfolio` or click **Projects** in the left sidebar.
2. **Click New Project**: Select the `+ New Project` button in the top right.
3. **Define Core Metadata**:
   - **Name**: Name the outcome (e.g. *Customer Self-Service Billing Portal*).
   - **Owner**: Select the accountable lead.
   - **Priority & Risk Level**: Specify relative urgency (P0..P3) and Risk (Low/Medium/High).
   - **Budget & Timeline**: Enter estimated budget and target delivery milestone.
4. **Configure Sprints**: Break the project into sequential two-week sprints (e.g. *Sprint 1: Architecture*, *Sprint 2: Core API*, *Sprint 3: UAT*).
5. **Attach Documentation**: Link the project to internal specifications in `/app/docs`.

```xml
{FLOWCHART_DIAGRAM}
```
""",
            },
            {
                "title": "Using the AI Project Generator",
                "slug": "using-ai-project-generator",
                "excerpt": "Leverage Gemini AI to generate complete project scopes, sprints, tasks, and risk assessments in seconds.",
                "content": """# Using the AI Project Generator

Project Management Platform features a built-in AI Project Generator powered by Google Gemini.

## How to Generate a Project Plan
1. Open **AI Generator** from the sidebar (`/app/teams/projects/ai-generator`).
2. Provide a descriptive prompt explaining the project requirements, technology stack, and timeline constraints.
3. Select your target team capacity and risk tolerance.
4. Click **Generate Project Structure**.
5. Review the generated two-week sprints, task breakdowns, dependency graph, and risk matrix.
6. Click **Import to Workspace** to automatically create the project and all associated tasks!
""",
            },
        ],
    },
    {
        "name": "Tasks, Kanban & Critical Path DAG",
        "slug": "tasks-kanban",
        "description": "Tutorials for creating tasks, organizing Kanban columns, viewing timelines, and unblocking dependencies.",
        "icon": "check-square",
        "position": 3,
        "visibility": "workspace",
        "pages": [
            {
                "title": "Creating, Viewing and Ordering Tasks",
                "slug": "creating-viewing-ordering-tasks",
                "excerpt": "Master the Kanban board, List browser, multi-dimensional filters, and drag-and-drop prioritization.",
                "content": """# Creating, Viewing and Ordering Tasks

## How to Create a Task
1. Click **+ New Task** from any project board or the global Task Browser (`/tasks`).
2. Set the **Title**, **Description**, **Priority**, and **Sprint**.
3. Assign the task to team members by searching their name or role.

## Views & Customization
- **Kanban Board View**: Organize work across status columns (`Backlog`, `In Progress`, `Review`, `Done`, `Blocked`).
- **Drag & Drop**: Drag cards within a column to reorder priorities, or drag between columns to transition statuses.
- **List View**: Dense, scannable table for bulk status reviews.
- **Timeline / Gantt View**: View start/end dates, milestone deadlines, and critical paths.
- **Filters**: Filter in real time by Assignee, Priority, Sprint, or status.
""",
            },
            {
                "title": "Task Dependencies & Critical Path Scheduling",
                "slug": "task-dependencies-critical-path",
                "excerpt": "Link predecessor/successor dependencies, compute critical path DAGs, and resolve blockers.",
                "content": """# Task Dependencies & Critical Path Scheduling

Project Management Platform features an asynchronous Directed Acyclic Graph (DAG) scheduler that calculates critical path delivery.

## Managing Dependencies
- **Predecessors**: Tasks that must be completed before the current task can start.
- **Successors**: Downstream tasks that are unlocked when this task is finished.
- **Automatic Blockers**: If an upstream task is delayed or marked blocked, downstream assignees receive instant notifications.
""",
            },
        ],
    },
    {
        "name": "Real-Time Chat & Channels",
        "slug": "chat-channels",
        "description": "How to communicate with channels, direct messages, threaded discussions, and file sharing.",
        "icon": "message-square",
        "position": 4,
        "visibility": "workspace",
        "pages": [
            {
                "title": "Using Channels & Direct Messages",
                "slug": "using-channels-and-dms",
                "excerpt": "Real-time communication, team channels, 1-on-1 direct messages, and rich markdown formatting.",
                "content": """# Using Channels & Direct Messages

Keep conversations close to the code, tasks, and documentation they impact.

## Chat Features
- **Project Channels**: Dedicated discussion channels linked directly to active projects.
- **Direct Messages (DMs)**: Private, encrypted 1-on-1 conversations with teammates.
- **Rich Formatting**: Full markdown support with code snippets, bullet points, and inline links.
- **@Mentions**: Mention teammates with `@username` to trigger real-time notifications and WhatsApp alerts.
- **File Sharing**: Upload screenshots, specifications, and PDFs directly into conversations.
""",
            },
        ],
    },
    {
        "name": "Music Channels & Synced Playback",
        "slug": "music-playback",
        "description": "Collaborative listening rooms with real-time multi-user playback synchronization.",
        "icon": "music",
        "position": 5,
        "visibility": "workspace",
        "pages": [
            {
                "title": "How to Use Music Channels",
                "slug": "how-to-use-music-channels",
                "excerpt": "Join channel listening rooms, queue tracks, sync playback with team members, and control volume.",
                "content": """# How to Use Music Channels

Project Management Platform includes built-in collaborative music rooms powered by the WebSocket backplane.

## Listening Together
1. Open any music-enabled channel or open the bottom music player bar.
2. **Join Room**: Click **Join Channel Audio** to synchronize playback with your teammates.
3. **Queue Tracks**: Search and add tracks to the shared channel playlist.
4. **Real-Time Sync**: Play, pause, seek, and track transitions are broadcast in real time across all connected clients.
5. **Volume Control**: Each user controls their own local listening volume independently.
""",
            },
        ],
    },
    {
        "name": "Google Calendar & Smart Meetings",
        "slug": "calendar-meetings",
        "description": "Google Calendar integration, meeting countdown pill, 1-click Google Meet joins, and reminders.",
        "icon": "calendar",
        "position": 6,
        "visibility": "workspace",
        "pages": [
            {
                "title": "Google Calendar Setup & Smart Notifications",
                "slug": "google-calendar-setup",
                "excerpt": "Connect Google Calendar with 1-click OAuth, view upcoming calls in the header, and get T-10m/T-2m alerts.",
                "content": """# Google Calendar Setup & Smart Notifications

Never miss an important standup, sprint review, or client meeting.

## Setup Instructions
1. Open **Settings** (`/settings`).
2. Scroll to **Google Calendar & Smart Meetings**.
3. Click **Connect Google Calendar** to authorize with Google OAuth 2.0.
4. Once connected, your upcoming events sync automatically.

## Smart Features
- **Header Meeting Pill**: Live countdown badge in the top navigation bar showing your next meeting time and title.
- **1-Click Google Meet Join**: Click the green camera icon on the meeting pill to join calls instantly.
- **Popover Agenda**: Click the pill to expand a detailed view of upcoming meetings for the day.
- **Smart Background Reminders**: Dispatches in-app and WhatsApp alerts at T-10 minutes and T-2 minutes before meetings begin.
""",
            },
        ],
    },
    {
        "name": "Integrations, GitHub & WhatsApp",
        "slug": "integrations-github-whatsapp",
        "description": "Automate pull requests, two-way task sync on merge, and WhatsApp notification bots.",
        "icon": "git-pull-request",
        "position": 7,
        "visibility": "workspace",
        "pages": [
            {
                "title": "GitHub Organization & PR Automation Guide",
                "slug": "github-pr-automation-guide",
                "excerpt": "Configure repository webhooks, auto-create tasks on PR opening, and auto-complete tasks on merge.",
                "content": """# GitHub Organization & PR Automation Guide

Seamlessly synchronize your GitHub organization with Project Management Platform.

## How it Works
1. **Link Repository**: In **Settings**, add your repository owner and name (e.g. `ali-Eskandarian/project-management-platform`).
2. **Configure Webhook**: Set your GitHub organization or repository webhook payload URL to `https://dev.localhost:3000/api/v1/integrations/github/webhook`.
3. **Automated Lifecycle**:
   - **PR Opened**: Creates a task under the configured project or links the task ID mentioned in the branch/title.
   - **Review Requested**: Automatically transitions task status to `Review`.
   - **PR Merged**: Automatically transitions task status to `Done` and posts a completion comment with PR URL!
""",
            },
            {
                "title": "WhatsApp Notifications & Bot Assistant",
                "slug": "whatsapp-notifications-bot",
                "excerpt": "Receive meeting alerts, DMs, and blockers on WhatsApp, and query active tasks on the go.",
                "content": """# WhatsApp Notifications & Bot Assistant

Connect your mobile device to receive high-priority alerts wherever you are.

## Setup
1. In **Settings**, enter your E.164 phone number (e.g. `+14155552671` or `+905321234567`).
2. Toggle the alert categories you want to receive:
   - Meeting Reminders (T-10m & T-2m)
   - Direct Messages & @Mentions
   - Blockers Waiting On You
3. Click **Send Test Alert** to verify message delivery.

## Bot Commands
Send messages directly to the Platform WhatsApp bot:
- `tasks`: Returns your top active assigned tasks.
- `help`: Displays available bot commands and shortcuts.
""",
            },
        ],
    },
    {
        "name": "MCP Server & GraphQL Engine",
        "slug": "mcp-graphql",
        "description": "Model Context Protocol tools for AI assistants and Strawberry GraphQL API documentation.",
        "icon": "bot",
        "position": 8,
        "visibility": "workspace",
        "pages": [
            {
                "title": "Model Context Protocol (MCP) Server Guide",
                "slug": "mcp-server-guide",
                "excerpt": "Connect Claude Desktop, Cursor, Antigravity, and GPT to create docs, diagrams, and manage tasks.",
                "content": """# Model Context Protocol (MCP) Server Guide

Project Management Platform provides a native **MCP Server** exposing standard JSON-RPC 2.0 tools.

## Supported MCP Tools
- `pmp_docs_create_page`: Create internal documentation pages.
- `pmp_docs_update_page`: Update titles and markdown content.
- `pmp_docs_search_or_get`: Keyword search or retrieve specific doc pages.
- `pmp_diagram_create`: Generate accessible SVG diagrams (Architecture, Sequence, Flowchart, ER, Timeline, Quadrant).
- `pmp_tasks_create`: Create tasks in projects and sprints.
- `pmp_tasks_update_status`: Update task status (`in_progress`, `review`, `done`, `blocked`).
- `pmp_tasks_list`: Query and filter tasks.
- `pmp_automations_create`: Create reactive automation rules.
- `pmp_whatsapp_send`: Send WhatsApp alerts to team members.
- `pmp_github_check_pr`: Inspect linked GitHub pull requests.

## Claude Desktop Configuration
Add the following to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "project-management-platform": {
      "url": "https://dev.localhost:3000/api/v1/mcp",
      "transport": "http"
    }
  }
}
```
""",
            },
            {
                "title": "Strawberry GraphQL Engine & Explorer",
                "slug": "strawberry-graphql-guide",
                "excerpt": "Explore the unified GraphQL schema, queries, mutations, and the GraphiQL interactive playground.",
                "content": """# Strawberry GraphQL Engine & Explorer

Access Project Management Platform data using our performant Strawberry GraphQL API.

## Endpoints
- **GraphiQL Playground**: [Open `/graphql`](/graphql)
- **API Endpoint**: `/api/v1/graphql`

## Example Query
```graphql
query GetWorkspaceOverview {
  me {
    email
    fullName
    roles
  }
  projects(status: "in_progress") {
    id
    name
    status
  }
  upcomingMeetings(hoursAhead: 24) {
    title
    startTime
    meetUrl
    startsInMinutes
  }
}
```
""",
            },
        ],
    },
    {
        "name": "Visual Workflow Automations",
        "slug": "automations-engine",
        "category": "Platform",
        "description": "Create no-code trigger-action automations for PR merges, status changes, and notifications.",
        "icon": "zap",
        "position": 9,
        "visibility": "workspace",
        "pages": [
            {
                "title": "Building Reactive Automation Rules",
                "slug": "building-reactive-automation-rules",
                "excerpt": "Visual rule builder, event triggers, conditional actions, and execution audit history.",
                "content": """# Building Reactive Automation Rules

Automate repetitive workflows without writing custom code.

## Available Triggers
- **GitHub PR Merged (`github.pr_merged`)**: Fires when a pull request is merged into main/dev.
- **Task Status Changed (`task.status_changed`)**: Fires when a task moves to Review, Done, or Blocked.
- **Blocker Raised (`blocker.raised`)**: Fires when a team member flags a blocker.
- **Meeting Reminder (`meeting.remind`)**: Fires before scheduled meetings.

## Available Actions
- **Mark Task as Done**: Automatically closes the associated task.
- **Send WhatsApp Notification**: Dispatches an instant WhatsApp alert to the assignee.
- **Create Follow-up Task**: Automatically spawns verification or testing tasks.
- **Generate SVG Diagram Page**: Generates and embeds updated architecture or sequence diagrams in internal docs.

## Managing Rules
Open **Automations** from the sidebar (`/automations`) to create new rules, toggle rules on/off, test rule execution, and inspect historical audit logs.
""",
            },
        ],
    },
    {
        "name": "Technical Architecture & API Engineering",
        "slug": "technical-architecture",
        "category": "Technical",
        "description": "System architecture, API specifications, database design, backend services, and engineering standards.",
        "icon": "cpu",
        "position": 10,
        "visibility": "workspace",
        "pages": [
            {
                "title": "Backend Architecture & Service Layer Guidelines",
                "slug": "backend-architecture-guidelines",
                "excerpt": "Clean modular monolith architecture, strict separation of concerns, and async event dispatching.",
                "content": """# Backend Architecture & Service Layer Guidelines

## Modular Monolith Design
The backend is structured into modular domains (`identity`, `organization`, `projects`, `collaboration`, `blockers`, `analytics`, `chat`, `docs`, `music`, `automations`).

### Key Rules
1. **Never import another module's ORM model or repository directly.**
2. **Interact strictly through service functions or async event contracts (`app/shared/events.py`).**
3. **Routers strictly enforce RBAC via `require_permission(...)` or Department Manager checks.**
4. **All database sessions use AsyncPG with SQLAlchemy 2.0 async engine.**
""",
            },
        ],
    },
    {
        "name": "Marketing & Go-to-Market Strategy",
        "slug": "marketing-gtm",
        "category": "Marketing",
        "description": "GTM strategy, customer acquisition, product positioning, content calendars, and brand growth.",
        "icon": "megaphone",
        "position": 11,
        "visibility": "workspace",
        "pages": [
            {
                "title": "Go-to-Market Strategy & Launch Playbook",
                "slug": "gtm-strategy-launch-playbook",
                "excerpt": "Product launch checklist, target customer personas, multi-channel distribution, and viral loops.",
                "content": """# Go-to-Market Strategy & Launch Playbook

## Target Audiences & Segments
- **Enterprise Engineering Teams**: Requiring high-velocity execution, DAG scheduling, and live presence.
- **Product & Project Managers**: Demanding AI brief generation, automated roadmaps, and blocker resolution.
- **Executive Leadership**: Needing organization-wide velocity charts and real-time operational health.

## Distribution Channels
1. **Developer Open Source / GitHub Release**: Community engagement and MCP developer ecosystem.
2. **Direct Enterprise Sales**: Tailored platform demonstrations and SOC2/ISO compliance briefings.
3. **Content Marketing**: Case studies on AI-driven project acceleration.
""",
            },
        ],
    },
    {
        "name": "Operations, SOPs & Incident Playbooks",
        "slug": "operations-playbooks",
        "category": "Operations",
        "description": "Standard operating procedures, deployment checklists, on-call schedules, and incident response.",
        "icon": "shield-alert",
        "position": 12,
        "visibility": "workspace",
        "pages": [
            {
                "title": "Production Incident Response & Severity Matrix",
                "slug": "production-incident-response",
                "excerpt": "Sev-1 to Sev-3 definitions, on-call paging, escalation paths, and post-mortem templates.",
                "content": """# Production Incident Response & Severity Matrix

## Incident Severity Levels
- **Sev-1 (Critical)**: Platform outage, data integrity compromise, or authentication failure. Resolution SLA: < 30m.
- **Sev-2 (Major)**: Core feature degraded (e.g. Chat WebSockets, Task scheduling). Resolution SLA: < 2 hours.
- **Sev-3 (Minor)**: Cosmetic UI issue, non-critical background task delay. Resolution SLA: < 24 hours.

## Escalation Path
1. Incident Commander flags on WhatsApp `#ops-incidents` channel.
2. Triage team opens war room in Platform Chat.
3. Rollback or hotfix deployed via automated GitHub Actions CI/CD.
4. Blameless Post-Mortem published within 48 hours.
""",
            },
        ],
    },
    {
        "name": "Business Strategy & Executive Roadmaps",
        "slug": "business-strategy",
        "category": "Business",
        "description": "Company OKRs, strategic roadmaps, commercial metrics, client deliverables, and quarterly milestones.",
        "icon": "trending-up",
        "position": 13,
        "visibility": "workspace",
        "pages": [
            {
                "title": "Quarterly OKRs & Strategic Growth Pillars",
                "slug": "quarterly-okrs-growth-pillars",
                "excerpt": "Company Objectives & Key Results, velocity benchmarks, and commercial expansion goals.",
                "content": """# Quarterly OKRs & Strategic Growth Pillars

## Q3/Q4 Objectives & Key Results
- **Objective 1: Platform Velocity**: Reduce average feature delivery cycle time by 40% through AI generation and DAG scheduling.
- **Objective 2: Enterprise Reliability**: Achieve 99.95% system uptime and sub-50ms API response latency.
- **Objective 3: Adoption & Collaboration**: Drive 85%+ active weekly engagement across project workspaces and team chat channels.
""",
            },
        ],
    },
    {
        "name": "Design System & UI/UX Guidelines",
        "slug": "design-system-guidelines",
        "category": "Designs",
        "description": "Platform Green design tokens, Figma component guidelines, micro-interactions, and accessibility standards.",
        "icon": "palette",
        "position": 14,
        "visibility": "workspace",
        "pages": [
            {
                "title": "Platform Design Tokens & Visual Hierarchy",
                "slug": "pmp-design-tokens-visual-hierarchy",
                "excerpt": "Primary brand color #00E261, charcoal surface hierarchy, glassmorphism tokens, and responsive typography.",
                "content": """# Platform Design Tokens & Visual Hierarchy

## Core Brand Palette
- **Platform Brand Green**: `#00E261` (Used for primary CTAs, active status, and positive progress indicators).
- **Surface Deepest**: `#0A0D0E` (Main application background).
- **Surface 1**: `#121719` (Sidebar and header elevated surfaces).
- **Surface 2**: `#181F22` (Card and panel containers).
- **Surface 3**: `#222B2F` (Input fields and nested list items).
- **Border Default**: `rgba(255, 255, 255, 0.08)`

## Typography & Elevation
- **Display Font**: Inter / Sans-Serif with sharp tracking and high contrast.
- **Mono Font**: JetBrains Mono for commit hashes, slugs, and technical IDs.
""",
            },
        ],
    },
]


async def seed_internal_documentation(db: AsyncSession) -> None:
    """Idempotently seed documentation spaces and comprehensive guide pages."""
    logger.info("seeding_internal_docs_start")

    # Get admin user ID to attribute pages to
    admin_res = await db.execute(
        select(User.id).where(User.is_active.is_(True)).limit(1)
    )
    author_id = admin_res.scalar_one_or_none() or SYSTEM_AUTHOR_ID

    # Seed canonical departments
    from app.modules.organization.service import seed_canonical_departments
    await seed_canonical_departments(db, author_id)

    # Generate reusable diagram SVGs
    arch_svg = diagram_generator.render_diagram_svg(
        "architecture",
        "Project Management Platform Architecture",
        {
            "nodes": [
                {"id": "web", "label": "Next.js Web App", "sub": "React 15 · TypeScript", "type": "client"},
                {"id": "api", "label": "FastAPI Core", "sub": "Python 3.12 · GraphQL", "type": "focal"},
                {"id": "mcp", "label": "MCP Server", "sub": "JSON-RPC 2.0 · AI Tools", "type": "focal"},
                {"id": "db", "label": "PostgreSQL & Redis", "sub": "AsyncPG · PubSub", "type": "storage"},
            ]
        },
    )

    flow_svg = diagram_generator.render_diagram_svg(
        "flowchart",
        "Project Lifecycle Workflow",
        {
            "steps": [
                {"title": "1. Scoping & AI Plan", "desc": "Define outcomes & generate tasks"},
                {"title": "2. Sprint Scheduling", "desc": "Assign developers & set DAG dependencies"},
                {"title": "3. Real-Time Execution", "desc": "Kanban status updates, PR sync & chat"},
                {"title": "4. Automated Merge & Done", "desc": "Auto-close tasks and notify on WhatsApp"},
            ]
        },
    )

    for space_data in DOC_SPACES_DATA:
        category = space_data.get("category", "Platform")
        # Check or create Space
        res = await db.execute(
            select(DocSpace).where(DocSpace.slug == space_data["slug"])
        )
        space = res.scalar_one_or_none()

        if not space:
            space = DocSpace(
                name=space_data["name"],
                slug=space_data["slug"],
                description=space_data.get("description"),
                icon=space_data.get("icon"),
                category=category,
                responsible_user_id=author_id,
                position=space_data.get("position", 0),
                visibility=space_data.get("visibility", "workspace"),
                created_by=author_id,
            )
            db.add(space)
            await db.flush()
        else:
            space.name = space_data["name"]
            space.description = space_data.get("description")
            space.category = category
            if not space.responsible_user_id:
                space.responsible_user_id = author_id
            space.position = space_data.get("position", 0)

        # Seed Pages under Space
        for page_data in space_data.get("pages", []):
            p_res = await db.execute(
                select(DocPage).where(
                    DocPage.space_id == space.id,
                    DocPage.slug == page_data["slug"],
                )
            )
            page = p_res.scalar_one_or_none()

            content = page_data["content"]
            content = content.replace("{ARCHITECTURE_DIAGRAM}", arch_svg)
            content = content.replace("{FLOWCHART_DIAGRAM}", flow_svg)

            if not page:
                page = DocPage(
                    space_id=space.id,
                    title=page_data["title"],
                    slug=page_data["slug"],
                    excerpt=page_data.get("excerpt"),
                    content=content,
                    status="published",
                    visibility="inherit",
                    responsible_user_id=author_id,
                    created_by=author_id,
                    updated_by=author_id,
                )
                db.add(page)
            else:
                page.title = page_data["title"]
                page.excerpt = page_data.get("excerpt")
                page.content = content
                page.status = "published"
                if not page.responsible_user_id:
                    page.responsible_user_id = author_id

    await db.commit()
    logger.info("seeding_internal_docs_complete")
