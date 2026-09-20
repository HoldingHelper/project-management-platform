# 14 - Testing Strategy & Quality Assurance

## 1. Testing Pyramid Overview

The Knowledge Workspace testing strategy spans unit, integration, end-to-end (E2E), performance, and security testing:

```text
       ▲
      / \        E2E Tests (Playwright) - 6 Critical Journeys
     /   \       ---------------------------------------------
    /     \      Integration Tests (Pytest + React Testing Library)
   /       \     - APIs, Database Transactions, Search, SSE Stream
  /─────────\    --------------------------------------------------
 /           \   Unit Tests (Fast execution)
/             \  - WikiLink parser, Backlink diff, Token budget, RRF
```

---

## 2. Unit Testing Scope

### 2.1 Backend Unit Tests (`backend/tests/unit/test_knowledge_*.py`)
- **WikiLink Parser**: Test extraction of `[[Simple Link]]`, `[[Link#Heading]]`, `[[Link|Custom Alias]]`, and rejection of malformed brackets.
- **Relation Diffing**: Test adding links, removing links, renaming target title, and verifying correct additions/deletions in `docs.relations`.
- **Token Budgeter**: Test truncation of large context documents, section-aware preservation of headers, and source chunk selection within 8,000 token limit.
- **Hybrid Search Ranker (RRF)**: Verify Reciprocal Rank Fusion calculation with varying weights.
- **Cycle Detection**: Verify that moving a page into its own child or grandchild raises `ValidationAppError`.

### 2.2 Frontend Unit Tests (`frontend/src/lib/knowledge/*.test.ts`)
- **WikiLink AST Transformer**: Verify markdown preview transforms `[[Title]]` into interactive links.
- **Tab State Store**: Verify opening tabs, closing tabs, cycling active tabs, dirty indicators, and localStorage serialization.
- **Outline Extractor**: Verify heading hierarchy extraction (`h1` -> `h2` -> `h3`) from markdown text.

---

## 3. Integration Testing Scope

- **Document CRUD & Autosave**: Verify `PATCH /api/v1/docs/pages/{id}` updates content, generates `DocRevision`, updates `docs.relations`, and returns `< 250ms`.
- **Backlink Endpoint**: Create Page A linking to Page B. Verify `GET /api/v1/docs/pages/{id}/backlinks` on Page B returns Page A.
- **Full-Text Search (FTS)**: Query keywords; verify `search_vector` GIN index returns ranked matches with highlighted snippets.
- **Source Ingestion & Chunking**: Upload source; verify text extraction, chunk creation, and status transitions.
- **AI Streaming Endpoint**: Connect to `POST /api/v1/docs/ai/chat/stream`; verify Server-Sent Events stream tokens and emit citation events.

---

## 4. E2E User Journeys (Playwright)

| Flow | Journey Description | Key Assertions |
|---|---|---|
| **Flow 1: Workspace & Autosave** | Open `/app/docs` -> Expand space -> Click doc -> Type content -> Pause. | Subtle "Saving..." indicator changes to "Saved"; content persists on refresh. |
| **Flow 2: Connected Knowledge** | In Doc A, type `[[Architecture Overview]]` -> Save -> Open Architecture Overview. | Right Context Inspector displays "Backlinks (1)" with link back to Doc A. |
| **Flow 3: Quick Switcher** | Press `Cmd+P` -> Type "Auth" -> Press `Enter`. | Quick Switcher appears in <100ms; pressing enter opens target in a new tab. |
| **Flow 4: Open Notebook Sources** | Open Sources tab -> Attach research URL/text -> Verify status. | Status transitions from "processing" to "ready"; chunk count is displayed. |
| **Flow 5: Grounded AI with Citations** | Select context -> Ask question -> Stream response -> Click citation `[1]`. | Streaming starts in <2.5s; clicking citation scrolls to referenced source excerpt. |
| **Flow 6: Security Boundary Isolation** | User A creates private doc; User B searches for it or asks AI. | Document is completely absent from User B's search, graph, and AI answers. |

---

## 5. Accessibility (a11y) Standards

- Complete keyboard operability: `Tab`, `ArrowUp/Down` in Explorer tree, `Cmd+P` for switcher, `Esc` to dismiss dialogs.
- ARIA live regions for non-intrusive status announcements (`Saving...`, `Saved`).
- Visible focus rings with high-contrast outlines matching the design system.
