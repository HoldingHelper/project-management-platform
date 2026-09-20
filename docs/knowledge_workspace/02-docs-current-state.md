# 02 - Docs Current State

## 1. Domain Entities & Database Schema (`docs` schema)

The current documentation system is defined in `backend/app/modules/docs/models.py` within the `docs` PostgreSQL schema:

| Table | Primary Key | Key Attributes | Relationships |
|---|---|---|---|
| `docs.spaces` | `id` (UUID) | `name`, `slug` (unique), `description`, `icon`, `category` (Technical, Marketing, Operations, Platform, Business, Designs), `responsible_user_id`, `visibility` (public, workspace, private, admins, selected), `position`, `created_by` | 1-to-many `DocPage` (cascade delete) |
| `docs.pages` | `id` (UUID) | `space_id` (FK), `parent_page_id` (FK self-referential), `title`, `slug`, `excerpt`, `content` (Text), `content_json` (JSONB), `status` (draft, internal, published), `visibility` (inherit, public, workspace, private, admins, selected), `responsible_user_id`, `position`, `youtube_url`, `seo_title`, `seo_description`, `created_by`, `updated_by` | Belongs to `DocSpace`, self-referential tree hierarchy (`parent`), 1-to-many `DocRevision`, `DocAttachment`, `DocLink`, `DocComment` |
| `docs.permissions` | `id` (UUID) | `resource_type` (space/page), `resource_id` (UUID), `subject_type` (user/role/team/department), `subject_id` (string), `permission` (view/comment/edit/manage) | Unique constraint on `(resource_type, resource_id, subject_type, subject_id, permission)` |
| `docs.revisions` | `id` (UUID) | `page_id` (FK), `revision_number` (int), `title`, `content`, `content_json`, `created_by`, `created_at` | Unique on `(page_id, revision_number)` |
| `docs.favorites` | `(user_id, page_id)` | `created_at` | Composite PK |
| `docs.views` | `(user_id, page_id)` | `viewed_at` | Composite PK for recent tracking |
| `docs.attachments`| `id` (UUID) | `page_id` (FK), `file_name`, `file_url`, `mime_type`, `uploaded_by`, `storage_key`, `size_bytes` | MinIO storage or external URL |
| `docs.links` | `id` (UUID) | `page_id` (FK), `entity_type` (project/task/team/user), `entity_id` (UUID) | Links documents to project entities |
| `docs.comments` | `id` (UUID) | `page_id` (FK), `author_user_id`, `body`, `selection_start`, `selection_end`, `selected_text` | Text range anchored comments |

---

## 2. API Endpoints Surface (`/api/v1/docs/`)

The router in `backend/app/modules/docs/router.py` exposes:

### Spaces
- `GET /api/v1/docs/spaces`: List spaces visible to the user, optionally filtered by `category`.
- `POST /api/v1/docs/spaces`: Create a new documentation space.
- `GET /api/v1/docs/spaces/{id}`: Get space metadata and its page tree.
- `PATCH /api/v1/docs/spaces/{id}`: Update space name, description, category, visibility, or owner.

### Pages
- `GET /api/v1/docs/pages`: List page summaries (filtered by `space_id` or `category`).
- `POST /api/v1/docs/spaces/{space_id}/pages`: Create a new page under a space (optional `parent_page_id`).
- `GET /api/v1/docs/pages/{id}`: Retrieve full page details, content, and record a view in `docs.views`.
- `PATCH /api/v1/docs/pages/{id}`: Update page title, markdown content, visibility, metadata, parent, and position. Creates a new `DocRevision`.
- `POST /api/v1/docs/pages/{id}/move`: Reorder or re-parent a page with cycle detection.
- `DELETE /api/v1/docs/pages/{id}`: Delete page.
- `POST /api/v1/docs/pages/{id}/publish` & `/unpublish`: Change public publishing status.
- `POST /api/v1/docs/pages/{id}/favorite`: Toggle user favorite status.

### Revisions, Permissions, Attachments, Links, Comments
- `GET /api/v1/docs/pages/{id}/revisions`: List revision history.
- `POST /api/v1/docs/pages/{id}/revisions/{rev_id}/restore`: Restore historical content.
- `GET /api/v1/docs/pages/{id}/permissions` & `PUT`: Read and replace resource access grants.
- `GET /api/v1/docs/pages/{id}/attachments` & `POST`: List and add/upload attachments.
- `GET /api/v1/docs/attachments/{id}/download`: Get presigned S3 download URL.
- `GET /api/v1/docs/pages/{id}/links` & `POST` / `DELETE`: Link page to a Project, Task, or Team.
- `GET /api/v1/docs/entity-links/{type}/{id}`: Reverse lookup: pages linked to a given project/task.
- `GET /api/v1/docs/pages/{id}/comments` & `POST`: List and create anchored inline comments.

### Public Endpoints
- `GET /api/v1/docs/public/navigation`: Public hierarchical tree of published spaces and pages.
- `GET /api/v1/docs/public/{category}/{slug}`: Fetch published page by category and slug.
- `GET /api/v1/docs/public/shared/{id}`: Fetch published page by ID.
- `GET /api/v1/docs/public/search`: Simple search across published documentation.

---

## 3. Frontend Architecture

### Routes
1. `/app/docs`: Private Docs home dashboard (`InternalDocsHome` in `page.tsx`). Shows category filters, search input, recently opened pages, favorite pages, and spaces grid.
2. `/app/docs/spaces/[spaceId]/[pageId]`: Document page editor/viewer (`DocSpacePageClient.tsx`).
3. `/docs/[category]/[slug]`: Public documentation page (`PublicDocsLayout` + `MarkdownPreview`).
4. `/docs/shared/[pageId]`: Public shared document viewer.

### Component Structure
- `AppShell`: Checks `pathname.startsWith("/app/docs")` and renders `DocsSidebar` in place of the standard team navigation.
- `DocsSidebar`: Renders spaces and nested page trees with HTML5 drag-and-drop re-parenting and ordering.
- `DocSpacePageClient`:
  - Split between `write` and `preview` tabs.
  - In `write`, uses a standard `<TextArea>` with basic slash command inserts (`## `, `- [ ] `, `> `, ```` ````).
  - In `preview`, renders `MarkdownPreview` (custom line-by-line regex parser for headings, lists, quotes, checklists, code blocks, and SVG diagrams).
  - Secondary slide-out panels for Comments, Revision History, Access Rules, Entity Links, and Attachments.

---

## 4. Current Search Architecture
- `search_pages` in `backend/app/modules/docs/repository.py`:
  ```python
  needle = f"%{query.strip()}%"
  stmt = select(DocPage).where(or_(DocPage.title.ilike(needle), DocPage.excerpt.ilike(needle), DocPage.content.ilike(needle)))
  ```
- Issues:
  - No ranking or relevance scoring.
  - No linguistic stemming or tokenization.
  - No vector similarity or semantic understanding.
  - Scans entire text columns with `ILIKE %...%`, which cannot utilize standard B-Tree indexes.
