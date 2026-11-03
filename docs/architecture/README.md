# Project editing boundary

The project detail route composes the existing edit modal, document picker and
upload controls. ProjectMembersFields owns membership drafts and their API
synchronization; ProjectSprintsFields owns sprint drafts and their API updates.
Both depend on the projects API client and shared UI primitives, never on route
internals. The edit modal coordinates Save changes; closing without saving
resets the drafts. The backend remains the authority for product membership,
project administrator access, assignments and sprint date validation.

Documentation linking and uploads continue through the Docs/collaboration API
clients. Existing files remain visible while further files can be queued.
Membership saves compare against current server membership before applying a
diff, and completed sprint updates are removed from the pending draft. A retry
therefore preserves completed work after a partial failure.

The vertical verification boundary is opening Edit project, adding/removing a
member, changing a sprint, attaching a document, saving and reopening. Run
`npx tsc --noEmit --incremental false` and the focused
`e2e/project-sprints-doc-links.spec.ts` Playwright tests from frontend. Project
planned start can be edited and the planned end is derived from sprint durations;
existing sprint dates are not moved automatically.

Verification on the local production frontend: build and TypeScript passed;
34 existing frontend tests passed. Six Playwright scenarios passed across phone,
tablet and desktop using intercepted API fixtures. They cover saving/reopening,
member addition/removal, sprint dates and duration, retained Docs links, file
uploads, cancellation and upload retries without duplicate mutations. The edit
modal passed scoped axe checks in all three viewports. Browser checks do not
exercise live backend authorization or storage; existing backend APIs were
reused without changes.

## Entity change history

EntityHistory is the shared read-only presentation for project and task changes.
The projects HTTP adapter authorizes normal project/task read access before
calling the public Analytics history service. Analytics owns the append-only
log and enriches actor names through Identity's public summary service. The
entity response omits request IP and correlation metadata.

The core audit interceptor captures committed ORM scalar changes. Explicit
parent audit targets route member, assignee, label, checklist, sprint, milestone,
comment, file and Docs-link mutations to their owning project's/task's stream.
The membership SQL insert queues its change explicitly in the same audit
pipeline. Unchanged assignees/labels are retained rather than deleted/reinserted.
New related records are captured after flush so generated IDs/defaults are valid;
rollback clears pending entries. Worker processes register the same audit stream.
Existing asynchronous audit persistence is retained.

Regression coverage: tests/integration/test_entity_history.py runs against local
PostgreSQL with all fixtures rolled back. It covers field diffs and actor names,
persisting/querying audit events, membership and assignment edits, checklists,
Docs links/file versions, unchanged saves, and failed transaction rollback.
Unit tests check project/task access and exclusion of request metadata. The
Playwright history scenarios check both entity pages, old/new values, actor and
creation entries, responsive overflow and accessibility using API fixtures.
Historical changes never captured by the application cannot be reconstructed.

History verification result: the original relation-audit regression and both
history rendering checks failed before the change. Afterward, 50 targeted backend
checks passed together, plus the additional PostgreSQL Docs/file-version check.
All four history browser scenarios passed on desktop/phone, including scoped axe
checks and screenshots. Both builds passed. The running local API advertises
both history endpoints and rejects anonymous access with HTTP 401. Database
fixtures were rolled back; browser history data was intercepted.
