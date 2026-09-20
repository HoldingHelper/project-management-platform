# 05 - Target System Architecture

## 1. High-Level Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Next.js 15 / React 19)                      │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     Knowledge Workspace Shell (/app/docs)                 │  │
│  │  ┌──────────────────┬─────────────────────────────┬────────────────────┐  │  │
│  │  │ Knowledge        │ Multi-Tab Document Editor   │ Context & Research │  │  │
│  │  │ Explorer         │  - WikiLink Suggestions     │  - Outline / TOC   │  │  │
│  │  │  - Spaces Tree   │  - Markdown Preview / Edit  │  - Properties/Tags │  │  │
│  │  │  - Tags Browser  │  - Non-blocking Autosave    │  - Backlinks Panel │  │  │
│  │  │  - Sources List  │  - Local Graph Embed        │  - Sources Panel   │  │  │
│  │  │  - QuickSwitch   │  - Code Highlighting        │  - AI Chat & RAG   │  │  │
│  │  └──────────────────┴─────────────────────────────┴────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ HTTP / REST / SSE Streaming
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND API PLATFORM (FastAPI)                        │
│                                                                                 │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌──────────────────────┐  │
│  │ Knowledge API │ │  Search API   │ │   Graph API   │ │ AI / Retrieval API   │  │
│  │ (Spaces, Pages│ │ (Exact, FTS,  │ │ (Local/Global │ │ (Context, SSE Stream,│  │
│  │  Revisions)   │ │  Semantic)    │ │  Subgraphs)   │ │  Citations)          │  │
│  └───────┬───────┘ └───────┬───────┘ └───────┬───────┘ └──────────┬───────────┘  │
│          │                 │                 │                    │              │
│  ┌───────▼─────────────────▼─────────────────▼────────────────────▼───────────┐  │
│  │                          Domain Service Layer                              │  │
│  │  - KnowledgeService (CRUD, slug generation, revision history)              │  │
│  │  - RelationService (WikiLink parsing, backlink indexer, stub resolver)     │  │
│  │  - SearchService (FTS tsvector, hybrid reciprocal rank fusion)             │  │
│  │  - SourceService (PDF/URL/code ingestion, text extraction, chunking)       │  │
│  │  - KnowledgeAIService (context token budgeting, prompt synthesis, RAG)     │  │
│  │  - GraphService (subgraph extraction, Louvain community clustering)        │  │
│  └───────┬────────────────────────────────────────────────────────┬───────────┘  │
│          │                                                        │              │
│  ┌───────▼──────────────────────────┐                    ┌────────▼───────────┐  │
│  │    In-Process Event Bus          │                    │ Authorization      │  │
│  │    (DocumentUpdated, etc.)       │                    │ (CurrentUser RBAC, │  │
│  └───────┬──────────────────────────┘                    │  Resource Grants)  │  │
└──────────┼───────────────────────────────────────────────┴────────────────────┘  │
           │                                                                       
           ▼                                                                       
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PERSISTENCE & BACKGROUND ASYNC WORKERS                       │
│                                                                                 │
│  ┌────────────────────────┐  ┌───────────────────────┐  ┌────────────────────┐  │
│  │ PostgreSQL 16          │  │ MinIO Object Storage  │  │ Redis 7            │  │
│  │  - Schema: docs        │  │  - S3 Attachments     │  │  - Query Cache     │  │
│  │  - Schema: identity    │  │  - Source Raw Files   │  │  - Tree Cache      │  │
│  │  - GIN FTS Indexes     │  │  - Presigned URLs     │  │  - Pub/Sub Events  │  │
│  │  - B-Tree Relations    │  └───────────────────────┘  └────────────────────┘  │
│  └────────────────────────┘                                                      │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ Background Worker (generation_worker & async tasks)                       │  │
│  │  - Incremental full-text vector update (`to_tsvector`)                    │  │
│  │  - Source document text extraction (PDF / URL / Code)                     │  │
│  │  - Document chunking & embedding generation                               │  │
│  │  - Unresolved link stub reconciliation                                     │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Operational Invariants

### 2.1 Non-Blocking Saves
When a user edits a document:
1. The frontend immediately updates local editor state and dirty indicators.
2. After a debounced delay (750ms), a `PATCH /api/v1/docs/pages/{id}` is transmitted.
3. The API validates authorization, writes the document update and a revision record, updates `docs.relations` transactionally, and returns within **<250ms**.
4. Heavy operations—FTS `tsvector` generation, source text extraction, chunking, and vector embedding generation—are queued asynchronously. **Saving never waits for AI or embeddings.**

### 2.2 Strict Authorization Before Retrieval
Any search query, knowledge graph traversal, or AI context selection must filter candidate documents against the requesting user's RBAC and space/page visibility rules **before** data is serialized or forwarded to an LLM prompt. Unauthorized content is never retrieved or summarized.

### 2.3 Idempotent Background Processing
All worker tasks (source extraction, chunking, embedding generation) record execution states (`pending` -> `processing` -> `ready` / `failed`). Jobs can be safely retried without creating duplicate chunks or relations.
