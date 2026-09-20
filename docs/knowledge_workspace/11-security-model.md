# 11 - Security & Authorization Model

## 1. Core Security Principle: Pre-Retrieval Authorization Gate

A common vulnerability in RAG and search systems is "post-retrieval filtering" (retrieving documents, passing them to an LLM or ranker, and attempting to redact unauthorized data later).

**In the Knowledge Workspace, authorization is strictly enforced before data enters search indexes, graph views, or model context.**

```text
Query / Request
      │
      ▼
Authorization Filter (SQL Join with docs.spaces and docs.permissions)
      │
      ├── [Authorized IDs only] ──► Search Ranking / Graph Traversal / LLM Context
      │
      └── [Unauthorized IDs]   ──► Dropped at Database Layer
```

---

## 2. RBAC & Resource Permission Rules

### 2.1 Global Permissions
- `docs.view`: Allows viewing any document with `workspace` or `public` visibility.
- `docs.comment`: Allows posting comments on accessible documents.
- `docs.edit`: Allows creating documents and editing workspace-visible documents.
- `docs.publish`: Allows promoting internal/workspace documents to `public`.
- `docs.manage`: Administrative override for all spaces, pages, and permissions.
- `SuperAdmin`: Full bypass over all docs policies.

### 2.2 Resource Permissions (`docs.permissions`)
When a document's visibility is `selected` or `private`:
- Explicit permission entries grant access to:
  - `subject_type = 'user'` with `subject_id = :user_id`
  - `subject_type = 'role'` with `subject_id = :role_name`
  - `subject_type = 'team'` with `subject_id = :team_id`
  - `subject_type = 'department'` with `subject_id = :department_id`
- Creator and Responsible User (`responsible_user_id`) always retain full access to their spaces and pages.

---

## 3. Knowledge Graph & Backlink Isolation

- **Backlink Security**: When viewing document A, a backlink from document B is only visible if the user has permission to view document B. If document B is private, the backlink does not render and is omitted from the backlink count.
- **Graph Security**: The Graph API (`/api/v1/docs/graph/local` and `/api/v1/docs/graph/global`) filters nodes and edges using `_page_visible()` logic. Hidden nodes and edges are omitted, preventing topology discovery attacks.

---

## 4. Source & Attachment Security

1. **File Type Whitelist**:
   - Allowed attachments: PDF, PNG, JPEG, WEBP, GIF, SVG, TXT, MD, CSV, JSON, XLSX.
   - Blocked: Executables (`.exe`, `.sh`, `.bat`), HTML with script execution, scripts.
2. **SVG Image Sandboxing**:
   - SVGs are sanitized to strip `<script>`, `onload`, and inline event handlers, and rendered through sandboxed `data:image/svg+xml` elements to prevent Stored XSS.
3. **Presigned S3 URLs**:
   - MinIO S3 object access is never public; downloads require time-limited presigned URLs (15-minute expiry) issued only after verifying document access.

---

## 5. Model Context Protocol (MCP) Integration Security

The Knowledge Workspace integrates with the platform's Personal MCP server (`backend/app/mcp_server.py`):
- MCP tokens configured in `/settings/mcp` inherit the user's live RBAC permissions.
- MCP tools `pmp_docs_search`, `pmp_docs_get_page`, and `pmp_docs_create_page` enforce the token's permission subset.
- Account passwords and secret keys are never exposed to MCP clients.
