# 03 - Gap Analysis: Current State vs. Target Knowledge Workspace

## 1. Comparative Matrix

| Capability Area | Current Implementation (`Docs`) | Target State (`Knowledge Workspace`) | Architecture Delta |
|---|---|---|---|
| **Document Identity & Linking** | Basic title/slug mapping; links only to external entities (`DocLink` for project/task). | Stable UUID identity; bidirectional WikiLinks (`[[Title]]`, `[[Title#Heading]]`); unresolved link stubs; backlink indexing. | Add `DocRelation` table, wiki link parser AST, backlink query service, title alias index. |
| **Knowledge Graph** | None. Zero graph capabilities. | Interactive 2D Knowledge Graph (local depth 1–2 view + global interactive filterable graph). | Add graph query endpoint `/graph/local` and `/graph/global`, frontend Canvas/SVG force-directed graph with community clustering. |
| **Structure & Navigation** | Flat category spaces + manual drag-drop tree; single page at a time. | 3-panel workspace: Knowledge Explorer (spaces, folders, tags, sources, recent, favorites) + Multi-Tab Editor + Context Inspector. | Add Tab state management, resizable 3-panel layout, keyboard navigation, tree virtualization. |
| **Quick Switcher & Search** | Top search bar calling SQL `ILIKE '%query%'` on `DocPage`. No hotkey palette. | Global Quick Switcher (`Cmd+P` / `Cmd+K`) <150ms response; 4-tier search (exact title, fuzzy, Postgres FTS GIN, vector semantic). | Full-text `tsvector` column + GIN index on `docs.pages`; vector embeddings table `docs.chunks`; hybrid search ranker. |
| **Editing & Autosave** | Manual "Save" button triggering full update & revision creation; raw `<TextArea>`. | Markdown-first editor with non-blocking debounced autosave (500–1000ms), dirty status indicator (`Saving...`, `Saved`), offline buffer. | Modern editor shell with inline formatting, wiki-link autocomplete (`[[`), outline generator, autosave state engine. |
| **Document Metadata & Tags** | Fixed fields: `category`, `status`, `visibility`, `responsible_user_id`, `youtube_url`. | Rich Properties panel: Frontmatter/Properties (tags `#tag`, status, type, owners, review dates, linked ADRs/runbooks). | Add `DocTag` and `DocPageTag` tables, frontmatter parser, properties inspector component. |
| **Sources & Research** | Basic attachment upload (`DocAttachment`) storing raw files in S3. | Open Notebook Sources: URLs, PDFs, code files, ADRs, runbooks with ingestion status (`pending`, `processing`, `ready`, `failed`), text extraction, chunking. | Add `DocSource`, `DocSourceChunk`, text extractor, chunker, and background worker queue. |
| **AI & Retrieval (RAG)** | No AI capabilities in Docs (AI is only used in `projects.ai_generation`). | Grounded Knowledge AI: Explicit Context Drawer (documents + sources in context), RAG pipeline, streaming response, clickable citations with line/excerpt anchors. | Add AI retrieval service, context selector UI, SSE streaming endpoint (`/ai/chat`), citation resolution system. |
| **Repository Intelligence** | Purely prose documentation; no link to repository code, ADRs, or architecture specs. | Architecture & code grounding: link documents to repo files, git commit references, and architecture decisions. | Code block syntax highlighting, file path resolver, ADR templates. |
| **Performance & Smoothness** | Route transitions cause full page loads and layout shifts; queries unindexed for search. | Desktop-grade app feel: instant tab switching, optimistic updates, skeleton loaders, query caching, background async indexing. | React Query cache persistence, tab memory virtualization, non-blocking asynchronous event bus for embeddings/indexing. |

---

## 2. Key Architecture Gaps to Bridge

### Gap 1: Document Relationship Engine
Currently, documents have no awareness of other documents they link to. A backlink query would require scanning all document markdown bodies on the fly (`O(N)` scan).
**Resolution**: Implement an incremental link extraction parser that fires on document save, updating a normalized `docs.relations` table transactionally, enabling `O(1)` indexed backlink lookups.

### Gap 2: Search & Retrieval Tier
`ILIKE '%query%'` is neither fast nor intelligent.
**Resolution**:
1. Tier 1: In-memory title and slug prefix matching (<50ms).
2. Tier 2: PostgreSQL Full-Text Search using `to_tsvector('english', title || ' ' || excerpt || ' ' || content)` and GIN indexes (<150ms).
3. Tier 3: Vector similarity via pgvector/embeddings for semantic retrieval (<500ms).
4. Hybrid RRF (Reciprocal Rank Fusion) ranking combining keyword BM25 + semantic vector score.

### Gap 3: Source Pipeline (Open Notebook)
Documents need supporting sources (design specs, web URLs, PDFs, code snippets) that ground AI and provide reference material without polluting document text.
**Resolution**: Create the `docs.sources` and `docs.source_chunks` domain with background worker extraction, chunking, and indexing.

### Gap 4: Workspace Shell & Multi-Tab UX
The existing `/app/docs/spaces/[spaceId]/[pageId]` requires a full page navigation for every document, discarding editor state, scroll position, and active panel state.
**Resolution**: Implement a unified workspace shell at `/app/docs` with an internal Tab Manager, collapsible and resizable 3-column layout (Explorer | Editor Tabs | Inspector/AI), and keyboard-driven Quick Switcher.
