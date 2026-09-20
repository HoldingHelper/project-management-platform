# 12 - Performance Baseline

## 1. Existing System Measurements

Measurements taken from the current Docs implementation (`/app/docs` and `/app/docs/spaces/[spaceId]/[pageId]`):

| Operation | Baseline Measurement | Bottleneck / Observation |
|---|---|---|
| **Initial Docs Home Load (`/app/docs`)** | ~420ms | Makes 4 separate API calls (`/spaces`, `/pages`, `/recent`, `/favorites`) concurrently without caching. |
| **Document Open Time (`[pageId]`)** | ~550ms | Full page navigation; triggers complete React tree remount; loads page, comments, revisions, permissions in sequence. |
| **Search Latency (`/docs/search?q=...`)** | ~380ms | `ILIKE '%needle%'` table scan across `title`, `excerpt`, and full `content` text. Degrades linearly with corpus size. |
| **Document Save Latency** | ~480ms | Synchronous `PATCH` creates `DocRevision` in database and awaits full roundtrip; blocks user input with saving spinner. |
| **Tab / Document Switching** | N/A (No Tabs) | Requires full route transition (`next/navigation`), resulting in layout flash and unmounting editor. |
| **Database Query Count per Page View** | 5–7 SQL queries | `get_page`, `get_space`, `touch_view`, `list_permissions`, `list_comments`, `list_attachments`. |
| **Memory Usage (Chrome DevTools)** | ~48 MB DOM/JS heap | Modest heap, but lacks memory boundaries for large trees (renders all space/page DOM nodes at once). |

---

## 2. Identified Hotspots

1. **Unindexed ILIKE Text Scans**: Every keystroke in the search bar triggers an ILIKE query scanning the complete text bodies of all pages.
2. **Synchronous Save Blocking**: Edits wait for database commits and full response before releasing the editor UI.
3. **Route Destruction**: Navigating between documents destroys editor state, unsaved drafts, scroll positions, and panel selections.
4. **No Backlink Pre-computation**: Querying connections between documents requires searching text for mentions.
