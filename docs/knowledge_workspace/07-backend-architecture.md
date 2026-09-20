# 07 - Backend Platform Architecture

## 1. Service Layer Decomposition

The backend platform refactors `backend/app/modules/docs/` into modular, high-cohesion domain services adhering to repository patterns:

```text
backend/app/modules/docs/
├── models.py               # SQLAlchemy ORM models (Space, Page, Relation, Tag, Source, Chunk, Chat)
├── schemas.py              # Pydantic v2 schemas for requests, responses, graph, and RAG
├── repository.py           # Database query execution with SQLAlchemy 2.0 async select/join/CTE
├── service.py              # Core KnowledgeService: page/space CRUD, permissions, revisions
├── relations.py            # RelationService: WikiLink parsing AST, backlink indexer, stub resolver
├── search_service.py       # SearchService: 4-layer search (title, FTS tsvector, semantic, hybrid)
├── sources_service.py      # SourceService: Ingestion, PDF/URL extraction, text normalization, chunking
├── graph_service.py        # GraphService: Subgraph extraction, local depth 1-2, global graph
├── ai_service.py           # KnowledgeAIService: Context assembly, token budgeting, prompt synthesis, streaming
└── router.py               # FastAPI APIRouter endpoints mounted under /api/v1/docs
```

---

## 2. Service Boundaries & Responsibilities

### 2.1 `KnowledgeService` (`service.py`)
- Space and page lifecycle management (create, read, update, move, delete, archive).
- Hierarchical page validation and cycle prevention (ensures page cannot become child of itself or its descendants).
- Access control enforcement: checks `CurrentUser` global permissions (`docs.view`, `docs.edit`, etc.) and resource-level `DocPermission` entries.
- Revision history: automatically captures a `DocRevision` on every content update.

### 2.2 `RelationService` (`relations.py`)
- **WikiLink Parser**: Uses regex and markdown AST tokenization to extract all occurrences of `[[Page Title]]` or `[[Page Title#Heading]]`.
- **Atomic Relation Sync**: During a page update transaction, compares currently extracted links against existing `docs.relations`:
  - New targets inserted.
  - Removed targets deleted.
  - Unchanged targets preserved.
- **Backlink Retrieval**: Efficiently queries `docs.relations` where `target_page_id = :page_id`, joined with `docs.pages` to return caller title, slug, excerpt, and anchor text.
- **Stub Resolution**: When a page is created or renamed, updates `docs.relations` where `target_title = :new_title` to point `target_page_id = :new_page_id`.

### 2.3 `SearchService` (`search_service.py`)
- Implements 4 search layers:
  1. Title & Slug prefix exact match.
  2. PostgreSQL Full-Text Search via `websearch_to_tsquery('english', :query)` matched against `DocPage.search_vector`.
  3. Semantic vector search (or embedding distance ranking).
  4. Hybrid Reciprocal Rank Fusion (RRF) combining keyword and semantic ranking.
- All search queries enforce user visibility filters in SQL before returning.

### 2.4 `SourceService` (`sources_service.py`)
- Manages research sources attached to spaces or documents.
- Supported ingestion types:
  - `url`: Outbound HTTP request via `httpx` to extract clean article markdown.
  - `pdf`: Extracted using PyPDF / pdfplumber or text extractor.
  - `code`: Normalized source code with language tag.
  - `text` / `adr` / `runbook`: Direct markdown text storage.
- Chunking: Splits content into semantically coherent chunks (500–1000 tokens with 10% overlap).
- Status tracking: `pending` -> `processing` -> `ready` / `failed`.

### 2.5 `GraphService` (`graph_service.py`)
- Builds NetworkX / adjacency subgraphs for visualization.
- `get_local_graph(page_id, depth=1)`: Retrieves the target node, all direct neighbors (links_to and linked_by), and direct tags.
- `get_global_graph(space_id=None, category=None)`: Retrieves all visible nodes and edges, enriched with community cluster IDs.

### 2.6 `KnowledgeAIService` (`ai_service.py`)
- Context builder: Takes explicit context IDs (`page_ids`, `source_ids`), retrieves content, and enforces a strict token budget (e.g. 8,000 tokens).
- Prompt synthesis: Uses system prompts instructing the model to answer using only supplied context, never hallucinating missing facts, and providing bracketed citations `[1]`, `[2]`.
- Streaming: Returns an asynchronous generator formatted as Server-Sent Events (`text/event-stream`).

---

## 3. Transaction Boundaries & Performance

```text
PATCH /api/v1/docs/pages/{id}
│
├── 1. Begin AsyncSession Transaction
│   ├── Check authorization (can_access 'edit')
│   ├── Lock page row (SELECT ... FOR UPDATE)
│   ├── Snapshot current state into DocRevision
│   ├── Update page fields (title, slug, content, updated_at)
│   ├── Parse [[WikiLinks]] from content
│   ├── Diff and update docs.relations (bulk insert/delete)
│   ├── Diff and update docs.page_tags
│   └── Commit Transaction (< 200ms)
│
└── 2. Emit Background Event (Async / Non-blocking)
    ├── Update search_vector (to_tsvector)
    └── Resolve any stub relations matching new title
```
All heavy operations (full-text index updates, chunking, AI embedding generation) occur **outside** the HTTP request transaction.
