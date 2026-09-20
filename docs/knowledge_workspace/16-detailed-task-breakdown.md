# 16 - Detailed Task Breakdown

This document defines the actionable work breakdown structure across all phases, formatted with owners, dependencies, acceptance criteria, tests, and non-functional considerations.

---

### Task ID: P2-T01
- **Title**: Create Knowledge Workspace Alembic Migration
- **Owner**: Migration Agent (Agent K) & Backend Platform Agent (Agent D)
- **Dependencies**: None
- **Goal**: Introduce database tables for relations, tags, sources, source chunks, chat sessions, and messages, plus the `search_vector` column on `docs.pages`.
- **Implementation**:
  - Add `backend/alembic/versions/g1a2b3c4d5e6_knowledge_workspace_tables.py`.
  - Add tables: `docs.relations`, `docs.tags`, `docs.page_tags`, `docs.sources`, `docs.source_chunks`, `docs.chat_sessions`, `docs.chat_messages`, `docs.citations`.
  - Add `search_vector` generated `tsvector` column and GIN index to `docs.pages`.
- **Acceptance Criteria**:
  - Migration applies cleanly with `alembic upgrade head`.
  - Downgrade cleanly reverts added tables.
  - Zero modification or data loss on existing `docs.spaces` and `docs.pages`.
- **Tests**: Run `alembic upgrade head` and verify schema in PostgreSQL.
- **Performance Considerations**: GIN index creation on `search_vector` is instantaneous on empty/moderate tables; uses stored generated column.
- **Security Considerations**: Multi-schema isolation in `docs` preserved.
- **Migration Considerations**: Resumable and idempotent.

---

### Task ID: P3-T01
- **Title**: Implement Domain Models & Extended Schemas
- **Owner**: Backend Platform Agent (Agent D)
- **Dependencies**: P2-T01
- **Goal**: Update SQLAlchemy models and Pydantic schemas for the new entities.
- **Implementation**:
  - Update `backend/app/modules/docs/models.py` with `DocRelation`, `DocTag`, `DocPageTag`, `DocSource`, `DocSourceChunk`, `DocChatSession`, `DocChatMessage`, `DocCitation`.
  - Update `backend/app/modules/docs/schemas.py` with corresponding read/write schemas, graph schemas, and RAG schemas.
- **Acceptance Criteria**:
  - All models inherit from `Base` and mixins.
  - Pydantic models validate input and serialize output without circular references.
- **Tests**: Model instantiation unit tests in `test_docs.py`.
- **Performance Considerations**: Use lazy loading strategies appropriately (`selectinload`).
- **Security Considerations**: Validate input lengths and URL schemas.

---

### Task ID: P4-T01
- **Title**: Build Knowledge Workspace Shell & Tab Manager
- **Owner**: Frontend Workspace Agent (Agent E)
- **Dependencies**: None (Frontend foundation)
- **Goal**: Implement the 3-panel workspace layout with resizable splitters, collapsible sidebars, and tab management.
- **Implementation**:
  - Create `frontend/src/app/(app)/app/docs/workspace/` components:
    - `KnowledgeWorkspaceShell.tsx`: Container with flex layout, CSS variables for panel widths.
    - `WorkspaceTabBar.tsx`: Draggable/scrollable tabs with dirty dots, pin, close button.
    - `useKnowledgeWorkspaceStore.ts`: Zustand/Context store for tabs, layout widths, and active views.
- **Acceptance Criteria**:
  - Switching tabs takes <16ms (instantaneous).
  - Panel resizing is smooth (60fps).
  - Tab state persists across page reload via `localStorage`.
- **Tests**: Unit tests for `useKnowledgeWorkspaceStore`.
- **Performance Considerations**: Inactive tabs do not render full DOM tree.
- **UX Considerations**: Seamless desktop app feel with no route transitions.

---

### Task ID: P5-T01
- **Title**: Build Knowledge Explorer (Tree, Tags, Sources)
- **Owner**: Frontend Workspace Agent (Agent E)
- **Dependencies**: P4-T01
- **Goal**: Create fast folder and document navigation with spaces, tags, sources, recent, and favorites.
- **Implementation**:
  - Create `frontend/src/components/docs/KnowledgeExplorer.tsx`.
  - Implement collapsible space groups, nested page tree, tag filter badges, and sources list.
  - Implement Quick Switcher launch shortcut (`Cmd+P`).
- **Acceptance Criteria**:
  - Clicking a document opens or focuses its tab in the workspace.
  - Tree expansion is smooth and remembers expanded states.
- **Tests**: React component tests for tree navigation and selection.
- **Performance Considerations**: Memoize tree items; support virtualized rendering if >500 items.

---

### Task ID: P6-T01
- **Title**: Markdown Editor with Non-Blocking Autosave
- **Owner**: Frontend Workspace Agent (Agent E)
- **Dependencies**: P4-T01, P3-T01
- **Goal**: Build an ergonomic Markdown editor with real-time status and debounced autosave.
- **Implementation**:
  - Create `frontend/src/components/docs/MarkdownWorkspaceEditor.tsx`.
  - Support headings, bold, italic, code blocks, lists, quotes, and checklists.
  - Implement debounced autosave (750ms) sending `PATCH` requests.
  - Render subtle save status indicator (`Saved`, `Saving...`, `Offline`).
  - Keep unsaved buffer in memory if network fails.
- **Acceptance Criteria**:
  - Typing never stutters or blocks on network calls.
  - Edits autosave reliably after user stops typing.
  - Force save on `Cmd+S`.
- **Tests**: Autosave debounce timing and error retry tests.
- **Performance Considerations**: Debounce at 750ms; avoid triggering parent rerenders on every keystroke.

---

### Task ID: P7-T01
- **Title**: WikiLink Extraction & Backlink Engine Backend
- **Owner**: Backend Platform Agent (Agent D)
- **Dependencies**: P3-T01
- **Goal**: Parse `[[WikiLinks]]` from markdown text, maintain `docs.relations`, and provide fast backlink queries.
- **Implementation**:
  - Create `backend/app/modules/docs/relations.py`.
  - Implement `extract_wikilinks(content)` parsing `[[Title]]` and `[[Title#Anchor]]`.
  - Implement `sync_page_relations(db, page_id, links)` transactionally diffing relations.
  - Add endpoint `GET /api/v1/docs/pages/{id}/backlinks`.
  - Add endpoint `GET /api/v1/docs/wikilink-suggestions?query=...`.
- **Acceptance Criteria**:
  - Saving a document with `[[Target]]` creates a relation.
  - Removing the link deletes the relation.
  - Backlink queries return in <150ms.
- **Tests**: Unit tests for parsing, diffing, and stub resolution.
- **Performance Considerations**: Indexed lookups on `source_page_id` and `target_page_id`.

---

### Task ID: P7-T02
- **Title**: WikiLink Autocomplete & Grounded Markdown Preview
- **Owner**: Frontend Workspace Agent (Agent E)
- **Dependencies**: P7-T01, P6-T01
- **Goal**: Support typing `[[` in editor to trigger autocomplete popup, and render clickable `[[WikiLinks]]` in preview.
- **Implementation**:
  - Add inline suggestion popup in editor when `[[` is typed.
  - Update `MarkdownPreview.tsx` to parse `[[Title]]` into clickable internal links opening tabs.
  - Create `BacklinksPanel.tsx` in the right Context Inspector.
- **Acceptance Criteria**:
  - Typing `[[` shows matching documents.
  - Clicking a `[[WikiLink]]` in preview opens that document in a tab.
  - Backlinks panel displays all incoming links with excerpts.
- **Tests**: Component tests for suggestion trigger and preview click.

---

### Task ID: P9-T01
- **Title**: Keyboard-First Quick Switcher (`Cmd+P`)
- **Owner**: Frontend Workspace Agent (Agent E)
- **Dependencies**: P4-T01, P7-T01
- **Goal**: Implement desktop-grade quick document switcher responding in <100ms.
- **Implementation**:
  - Create `frontend/src/components/docs/QuickSwitcherModal.tsx`.
  - Global hotkey listener for `Cmd+P` / `Ctrl+P`.
  - In-memory recent tabs + fast title query.
  - Keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Esc`).
- **Acceptance Criteria**:
  - Modal appears in <50ms.
  - Selecting an item opens it immediately in a tab.
- **Tests**: Keyboard navigation tests.

---

### Task ID: P10-T01
- **Title**: PostgreSQL Full-Text & Hybrid Search Service
- **Owner**: Search & Retrieval Agent (Agent F) & Backend Platform Agent (Agent D)
- **Dependencies**: P2-T01, P3-T01
- **Goal**: Implement 4-tier search with PostgreSQL `tsvector`, GIN index, and hybrid RRF scoring.
- **Implementation**:
  - Create `backend/app/modules/docs/search_service.py`.
  - Add search endpoints `GET /api/v1/docs/search/v2` and `/search/quick`.
  - Integrate weighted FTS (`A`: title, `B`: excerpt, `C`: content).
  - Enforce user authorization in SQL.
- **Acceptance Criteria**:
  - Search returns ranked results with highlighted snippets in <200ms.
  - Unauthorized pages never appear.
- **Tests**: Search ranking and permission filtering tests.
- **Performance Considerations**: Utilize GIN index; limit results to 30.

---

### Task ID: P11-T01
- **Title**: Knowledge Graph Service & Interactive Visualization
- **Owner**: Knowledge Agent (Agent C) & Frontend Workspace Agent (Agent E)
- **Dependencies**: P7-T01, P4-T01
- **Goal**: Build local (depth 1–2) and global interactive knowledge graph visualization.
- **Implementation**:
  - Backend: `backend/app/modules/docs/graph_service.py` with `get_local_graph` and `get_global_graph`.
  - Frontend: `frontend/src/components/docs/KnowledgeGraphView.tsx` using SVG/Canvas force-directed rendering.
  - Interactive node clicking to open documents in tabs.
- **Acceptance Criteria**:
  - Local graph renders direct connections and tags in <250ms.
  - Node hover highlights connected edges.
  - Clicking a node opens that document in a tab.
- **Tests**: Graph query API tests and canvas rendering tests.
- **Performance Considerations**: Canvas rendering for >200 nodes; prevent layout thrashing.

---

### Task ID: P12-T01
- **Title**: Open Notebook Sources Ingestion & Storage
- **Owner**: Backend Platform Agent (Agent D) & Frontend Workspace Agent (Agent E)
- **Dependencies**: P3-T01, P4-T01
- **Goal**: Support attaching external sources (URLs, PDFs, code files, ADRs) with text extraction and chunking.
- **Implementation**:
  - Backend: `backend/app/modules/docs/sources_service.py`.
  - Endpoints: `POST /api/v1/docs/sources`, `GET /api/v1/docs/sources`, `GET /api/v1/docs/sources/{id}`.
  - Frontend: `SourcesPanel.tsx` in Context Inspector.
- **Acceptance Criteria**:
  - Users can attach web URLs and upload PDFs/markdown.
  - Content is normalized and chunked into ~800-token chunks.
  - Status is displayed (`processing` -> `ready`).
- **Tests**: Source creation and chunking unit tests.

---

### Task ID: P14-T01 & P15-T01
- **Title**: Knowledge AI Assistant with RAG & Streaming
- **Owner**: AI Knowledge Agent (Agent G) & Frontend Workspace Agent (Agent E)
- **Dependencies**: P10-T01, P12-T01, P4-T01
- **Goal**: Implement source-grounded AI chat with explicit context selection, token budgeting, and Server-Sent Events streaming.
- **Implementation**:
  - Backend: `backend/app/modules/docs/ai_service.py`.
  - Endpoint: `POST /api/v1/docs/ai/chat/stream`.
  - Context Drawer: Select documents and sources into prompt context.
  - Frontend: `KnowledgeAIPanel.tsx` streaming markdown response and rendering clickable citation badges `[1]`, `[2]`.
- **Acceptance Criteria**:
  - Context is transparently displayed before sending.
  - Stream begins in <2.5s.
  - Clickable citations link directly to source excerpts.
  - Model adheres to strict anti-hallucination prompt.
- **Tests**: Context budgeting tests, citation extraction tests, streaming SSE tests.
- **Security Considerations**: Strict pre-retrieval permission filter on all context items.

---

### Task ID: P30-T01
- **Title**: Comprehensive E2E Testing Suite (Playwright)
- **Owner**: QA / E2E Agent (Agent I)
- **Dependencies**: All prior tasks
- **Goal**: Implement Playwright E2E tests validating the 6 critical user journeys.
- **Implementation**:
  - Add `frontend/e2e/knowledge-workspace.spec.ts`.
  - Test Flow 1 (Workspace, tabs, autosave), Flow 2 (WikiLinks & backlinks), Flow 3 (Quick Switcher), Flow 4 (Sources), Flow 5 (AI with citations), Flow 6 (Security boundaries).
- **Acceptance Criteria**:
  - 100% test pass rate with no flaky steps.
- **Tests**: Execute `npx playwright test e2e/knowledge-workspace.spec.ts`.
