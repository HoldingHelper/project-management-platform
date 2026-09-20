# 01 - Current System Analysis

## 1. Executive Summary

This document captures the architectural and technical baseline of the **Project Management Platform** repository as of September 2026, specifically focusing on the existing **Documentation (Docs)** system, frontend application shell, backend platform, database schema, search capabilities, AI integrations, and deployment topology.

The repository is a full-stack, enterprise-grade project management and collaboration platform consisting of:
- **Backend**: FastAPI (Python 3.12+), SQLAlchemy 2.0 (async with `asyncpg`), Alembic migrations, PostgreSQL 16 with multi-schema architecture (`public`, `docs`, `identity`, `projects`, `chat`, `music`, `analytics`, etc.), Redis 7, MinIO (S3-compatible object storage), and LangGraph / LangChain OpenAI integrations.
- **Frontend**: Next.js 15 (App Router, React 19), TanStack React Query v5, Tailwind CSS with customized design tokens, Lucide icons, and Playwright for E2E testing.
- **Mobile**: React Native / Expo application in `mobile/`.
- **Infrastructure**: Docker Compose (`compose.yaml`) orchestrating PostgreSQL, Redis, MinIO, API server, background generation worker, and Next.js frontend.

---

## 2. Repository Topography & Component Map

```text
project-management-platform/
├── backend/
│   ├── alembic/                    # Database migrations (23 migrations in versions/)
│   ├── app/
│   │   ├── core/                   # Config, database engine, auth, events, storage, logging
│   │   ├── shared/                 # Base models, mixins (UUIDPKMixin, TimestampMixin, AuditableMixin)
│   │   ├── modules/
│   │   │   ├── docs/               # EXISTING DOCS MODULE (models, schemas, service, repo, router)
│   │   │   ├── identity/           # User authentication, RBAC, invitations, sessions
│   │   │   ├── projects/           # Projects, tasks, phases, dependencies, AI generation
│   │   │   ├── collaboration/      # Comments, attachments, reactions
│   │   │   ├── chat/               # Real-time channels, websockets, voice notes
│   │   │   ├── music/              # Collaborative music rooms, Google Drive streaming
│   │   │   ├── mcp/                # Model Context Protocol server and token management
│   │   │   ├── automations/        # Event-driven rule engine
│   │   │   └── analytics/          # Dashboards, velocity, burn-down, KPIs
│   │   ├── workers/                # Background worker processes (generation_worker.py)
│   │   └── main.py                 # FastAPI application factory and router mounting
│   └── tests/                      # Pytest test suites (unit, integration, smoke)
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (app)/              # Authenticated workspace shell routes
│   │   │   │   ├── app/docs/       # Private Docs UI (/app/docs and spaces/[spaceId]/[pageId])
│   │   │   │   └── app/teams/      # Teams & execution UI
│   │   │   ├── docs/               # Public published documentation routes (/docs/[category]/[slug])
│   │   │   └── layout.tsx          # Root layout with fonts, auth provider, query provider
│   │   ├── components/
│   │   │   ├── ds/                 # Core Design System (Button, Modal, TextInput, TextArea, MarkdownPreview)
│   │   │   ├── docs/               # DocsSidebar, PublishedWorkspaceDocs, DocsSearch, SearchSuggestionInput
│   │   │   └── shell/              # AppShell, Header, Sidebar, GlobalSearch, MobileNavigation
│   │   └── lib/
│   │       ├── api/                # API clients (docs.ts, client.ts, auth.ts, projects.ts)
│   │       ├── auth/               # AuthProvider, RBAC hooks (useAuth)
│   │       └── docs/               # Public docs static content and server-side fetching
│   └── e2e/                        # Playwright end-to-end tests
└── docs/                           # High-level architecture markdown documentation
```

---

## 3. Database Architecture & Schema Isolation

The application enforces strict multi-schema separation in PostgreSQL:
- Each functional module owns its dedicated schema (`identity`, `projects`, `docs`, `chat`, `music`, `analytics`).
- Cross-schema foreign keys are used where referential integrity is required (e.g. `docs.spaces.created_by` references `identity.users.id`).
- All ORM models inherit from `app.core.database.Base` and mixins:
  - `UUIDPKMixin`: UUID primary keys generated client/server side via `uuid.uuid4()`.
  - `TimestampMixin`: `created_at` and `updated_at` with timezone awareness.
  - `AuditableMixin`: `created_by` and `updated_by` audit trails.

---

## 4. Authentication & RBAC Model

Authentication is Bearer JWT-based:
- `CurrentUser` dependency injected into all route handlers via `app.core.current_user.get_current_user`.
- RBAC permissions enforced globally or per-resource:
  - Global permissions: `docs.view`, `docs.comment`, `docs.edit`, `docs.manage`, `docs.publish`.
  - Resource permissions: `docs.permissions` table allows granular grants on a `space` or `page` to a `user`, `role`, `team`, or `department`.
  - SuperAdmins bypass resource checks.

---

## 5. Storage & Asynchronous Infrastructure

- **MinIO Object Storage**: S3-compatible storage managed via `app.core.storage.file_storage_service`.
  - Used for document attachments, avatars, audio files, and exported artifacts.
  - Bucket: `project-platform` (or configured via `S3_BUCKET`).
  - Presigned URLs are generated for secure downloads.
- **Redis 7**:
  - Used for caching, session management, and pub/sub for WebSocket events.
- **Background Workers**:
  - `app.workers.generation_worker.py`: Database-polled worker claiming jobs (`GenerationRun`) for AI project generation.

---

## 6. AI Foundations

- **LangGraph & LangChain OpenAI**:
  - Configured in `app.core.config.Settings` (`openai_api_key`, `project_ai_model`, `project_ai_temperature`, etc.).
  - Used in `app.modules.projects.ai_generation.py` for structured project planning.
  - No existing RAG, semantic retrieval, or vector embedding system currently exists for Docs.
