# 08 - Search & Retrieval Architecture

## 1. Multi-Layer Search Architecture

The Knowledge Workspace replaces raw `ILIKE '%query%'` with a robust 4-layer search architecture designed to return fast, relevant, and authorized results:

```text
User Query (e.g. "auth token refresh")
│
├── Layer 1: Exact Title & Slug Matching (< 50ms)
│   └── SQL exact / prefix index scan on `title` and `slug`.
│       Returns immediate exact document matches.
│
├── Layer 2: Prefix & Fuzzy Suggestion Matching (< 100ms)
│   └── Trigram / prefix matching for autocomplete and Quick Switcher suggestions.
│
├── Layer 3: PostgreSQL Full-Text Search (< 250ms)
│   └── PostgreSQL `to_tsvector('english', title || ' ' || excerpt || ' ' || content)`
│       queried via `websearch_to_tsquery('english', :query)`
│       Scored via `ts_rank_cd(search_vector, query)` with GIN indexing.
│
└── Layer 4: Semantic Retrieval (< 600ms)
    └── Embedding cosine similarity over `docs.source_chunks` and document abstracts.
```

---

## 2. PostgreSQL Full-Text Search (FTS) Schema

### 2.1 Column & GIN Index
A new generated or stored column `search_vector` on `docs.pages`:

```sql
ALTER TABLE docs.pages 
ADD COLUMN search_vector tsvector 
GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C')
) STORED;

CREATE INDEX ix_doc_pages_search_vector ON docs.pages USING GIN (search_vector);
```

### 2.2 Weighted FTS Ranking
- **Weight 'A'**: Document Title (Highest relevance).
- **Weight 'B'**: Document Excerpt & Metadata.
- **Weight 'C'**: Document Body Content.

Query execution:
```sql
SELECT 
    p.id, 
    p.title, 
    p.slug, 
    p.space_id, 
    p.excerpt,
    ts_rank_cd(p.search_vector, websearch_to_tsquery('english', :query)) AS rank,
    ts_headline('english', p.content, websearch_to_tsquery('english', :query), 'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15') AS snippet
FROM docs.pages p
JOIN docs.spaces s ON s.id = p.space_id
WHERE p.search_vector @@ websearch_to_tsquery('english', :query)
  AND (s.visibility IN ('public', 'workspace') OR s.responsible_user_id = :user_id OR ...)
ORDER BY rank DESC
LIMIT 30;
```

---

## 3. Hybrid Ranking (Reciprocal Rank Fusion - RRF)

To combine keyword relevance (FTS) with semantic similarity without score calibration issues, the search engine applies Reciprocal Rank Fusion:

$$RRF(d) = \sum_{m \in \{\text{keyword}, \text{semantic}\}} \frac{1}{k + r_m(d)}$$

Where:
- $k = 60$ (smoothing constant).
- $r_m(d)$ is the rank position of document $d$ in result set $m$.
- Documents appearing in both keyword and semantic top results receive a boosted score.

---

## 4. Unified Search Result Schema

All search layers output the canonical `SearchResultItem` schema:

```json
{
  "id": "uuid",
  "result_type": "page | source | section",
  "title": "Authentication Architecture",
  "slug": "authentication-architecture",
  "space_name": "Technical",
  "excerpt": "Describes the JWT token lifecycle and refresh mechanism...",
  "snippet_html": "Describes the <mark>JWT token</mark> lifecycle and refresh...",
  "matching_field": "title | content | tag",
  "rank_score": 0.892,
  "updated_at": "2026-09-20T10:00:00Z"
}
```

---

## 5. Security & Permission Invariant

Search queries execute the user's space/page visibility filters **directly in SQL** via joins against `docs.spaces` and `docs.permissions`. A restricted document never appears in search results or snippets for an unauthorized user.
