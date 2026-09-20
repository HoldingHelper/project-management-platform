# 13 - Performance Budgets & SLA Targets

## 1. Explicit Performance Budgets

The Knowledge Workspace enforces strict performance budgets across the entire lifecycle:

| Operation | Target Budget (p95) | Hard Limit (Max) | Optimization Mechanism |
|---|---|---|---|
| **Explorer Open / Mount** | < 150 ms | < 300 ms | SWR cache from React Query, structural skeleton |
| **Cached Document Tab Switch** | < 16 ms (1 frame) | < 50 ms | In-memory component state, no network roundtrip |
| **Fresh Document Fetch** | < 200 ms | < 350 ms | Indexed UUID lookup, pre-joined permissions, parallel query |
| **Autosave Acknowledgement** | < 200 ms | < 300 ms | Non-blocking PATCH, deferred FTS/embedding indexing |
| **Backlink Query** | < 150 ms | < 250 ms | B-Tree index scan on `docs.relations(target_page_id)` |
| **Local Knowledge Graph (depth 1)** | < 250 ms | < 450 ms | Subgraph adjacency query with depth limit |
| **Quick Switcher Title Suggestions** | < 80 ms | < 150 ms | Prefix index scan on `docs.pages(title, slug)` |
| **Full-Text Search (FTS)** | < 200 ms | < 350 ms | PostgreSQL `tsvector` @@ `tsquery` with GIN index |
| **Semantic Retrieval (Sources/RAG)** | < 600 ms | < 900 ms | Top-K similarity with pre-filtered candidate pool |
| **AI Context Assembly** | < 400 ms | < 700 ms | Token budgeting, parallel chunk fetch |
| **AI First-Token Latency (TTFT)** | < 2.5 s | < 4.0 s | SSE streaming from model provider |
| **Memory Footprint (Client)** | < 80 MB | < 150 MB | Virtualized inactive tabs, canvas graph rendering |

---

## 2. Regression Prevention Rules

1. **No Save Blocking**: Under no circumstances may an autosave or manual save wait for background worker tasks (embedding, graph clustering, or AI analysis).
2. **No Unvirtualized Large Trees**: Trees with >500 items must use windowed/virtualized lists to prevent DOM explosion.
3. **No Unindexed ILIKE**: All search queries must utilize `search_vector` GIN indexes or exact/prefix indexes.
4. **Bundle Size Ceiling**: Frontend workspace additions must not increase the initial JavaScript bundle by more than 120 KB gzip.
