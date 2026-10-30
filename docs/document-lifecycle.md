# Document retention and publication

Draft / On Publish → Published → Archived.

Drafts remain editable under existing access rules. Publication locks the
document content and metadata, including revision restores, reordering, tags,
links and attachments. Publishing preserves visibility; it does not make private
or project documentation public. Published documents can never return to draft,
including after restoration.

Only the original author or a Super Admin may archive a document. Responsibility,
product ownership, project management, Company Manager, C-level, docs.manage and
other broad permissions do not grant archive rights to someone else's document.
Archived documents are invisible to all regular users, including their authors.
Only Super Admins can browse the Archived documents section and restore records.
Restoration preserves the previous state: published stays read-only, and an
archived draft returns to draft.

Deletion controls and REST routes for Docs pages, uploaded documents, research
sources and chat messages are removed. Internal legacy deletion entry points
deny every caller, including Super Admins. PostgreSQL retention triggers block
physical deletion and message soft deletion, including indirect cascades.
Deleting a product, project or task that retains documents/messages is blocked.

Archive visibility is enforced for page lists, direct reads, search, autocomplete,
links, revisions, comments, attachments, downloads, public pages, graphs and
page/source AI retrieval. Authenticated file downloads replace new presigned
document links. Previously downloaded copies or already-issued external storage
URLs cannot be recalled; pre-existing signed storage links expire on their
original schedule (the prior default was one hour). New lifecycle events refetch
connected clients, and document/public responses avoid server caching.

Migrations:
- p0d2e4f6a8b9: archive provenance, retention, publication/attachment protection;
  existing internal pages become drafts, and existing published pages stay locked.
- q1e3f5a7b9c0: immutable comparison excludes the generated search vector and
  protects publication provenance during archive/restore.

Local verification includes transactional PostgreSQL lifecycle/retention tests
(all test data rolls back), universal role denial tests, removed-route tests,
frontend tests, TypeScript/build and the translation audit. Production deployment
is separate; no existing user document was published, archived or deleted to test
the feature.

Verification results:
- Frontend production build and TypeScript passed; all 43 frontend tests passed.
- Strict translation audit: zero missing messages.
- Backend broad run: 231 passed, with the previously reproduced GraphQL diagram
  mock failure remaining. The final focused retention/lifecycle run passed all
  35 checks, including the PostgreSQL workflow, public access, attachment
  immutability, archive provenance, role restrictions, and removed API routes.
- Browser confirmed a draft has Edit/Publish, while a published page has disabled
  editing controls, a read-only status, Archive, and no Delete. The Super Admin
  archive browser is available. No existing document was transitioned for QA.
- Local migration head is q1e3f5a7b9c0; local API/frontend are running.


## Creating documents without global editing

Internal staff roles have a separate `docs.create` permission. This permits new
private or inherited-visibility drafts in workspace/public spaces, and the author
can edit their own drafts. It does not grant editing of other users' drafts.
Private spaces still require a space edit grant; managed upload workspaces retain
their product/task authorization. Clients, guests, view-only users, and scoped MCP
tokens without creation/edit/manage permission cannot create pages.

Migration `r2f4a6b8c0d1` adds the permission to existing internal roles that still
have `docs.view`; customized roles and removed Docs access are preserved. Fresh
roles receive the new default permission. The new-document form lists authorized
destinations and shows API errors inline. Apply the migration and deploy both API
and frontend together.

Verification: 15 targeted backend tests, including rollback-only PostgreSQL tests
for Developer, QA, CLevel, and ProjectManager draft creation/saving, plus access
and document lifecycle restrictions; 46 frontend tests and TypeScript passed.


Document authors can publish their own editable drafts without global
`docs.publish`. The lifecycle API and publish action use the same authorization
check. Other users still need publisher permission and draft edit access; scoped
MCP tokens must include creation/edit/manage permission to publish the author's
own draft, or an explicit publish grant. Publication preserves visibility and
makes the document immutable.
