# Holding Operating System rollout

This repository now contains the first implementation vertical slice of the 25 September 2026 holding refactor. It is an additive migration: legacy Product, Project, Department, Team, task, milestone, and Docs routes keep working while the new organization graph becomes the canonical scope and authorization boundary for migrated projects.

## Delivered foundation

- `org` domain: Holding, Venture, Function, Program, Project, Shared Initiative, Milestone, Workstream, Team, Task, and Doc Space nodes backed by PostgreSQL `ltree`.
- Scoped memberships, dated allocations, venture walls, confidentiality propagation, subtree moves with access-diff confirmation, last-owner protection, and ACL version invalidation.
- `authz` policy-as-code with one `authorize()`/`explain()` engine. Standard access inherits downward; Restricted access requires an explicit grant; Board access is limited to board/owner or explicit grants. Migrated project REST, MCP, collaboration, and WebSocket checks enter this boundary.
- Strategy spine: one versioned Vision per scope, Objectives, Key Results, and Check-ins, plus schema foundations for initiative links, decisions, and risks.
- Work foundation: functional workstreams, cross-scope Requests, and accept-to-task workflow.
- Knowledge foundation: node-bound spaces, page confidentiality/publish level/template flags, and explicit page/space share storage.
- Holding UI: scope switcher, cockpit, venture home, function request hub, and organization graph editor.
- Compatibility backfill from Products to Ventures, Departments to Functions, Projects/Teams/Milestones/Docs spaces to nodes, global SuperAdmin to holding owner, legacy project roles to scoped roles, and matching task partitions to functional workstreams.

## Required deployment sequence

1. Back up Postgres and restore it into an isolated rehearsal environment.
2. Run the read-only ambiguity report:

   ```bash
   cd backend
   DEBUG=false python scripts/backfill_holding_graph.py
   ```

   Exit code `2` means task partitions, duplicate Product names, or orphan Projects need an operator decision. No rows are changed.

3. Review the inferred defaults below. Resolve unmatched task partitions by creating/renaming Departments before the migration, or map them manually afterward.
4. Run `DEBUG=false alembic upgrade head` against the rehearsal copy.
5. Read back node counts, membership grants, restricted scopes, project `org_node_id` values, Docs `node_id` values, and task venture/function/workstream columns.
6. Test with at least four accounts: holding owner, venture member, contractor, and auditor. A restricted project must return 404 to the latter three unless explicitly granted.
7. Only after rehearsal evidence is approved, back up production and repeat the exact migration.

Rollback removes the new schemas and compatibility columns, but a database restore is the preferred production rollback once users have written strategy, memberships, or requests.

## Inferred defaults requiring product-owner confirmation

- A legacy Product becomes a Venture. Programs remain optional children.
- Central and venture-local Functions are both supported; legacy Departments become central Functions.
- Cross-venture dependency visibility defaults to `ghost`.
- Authorization is Postgres-native; the policy boundary remains replaceable by OpenFGA later.
- Budgets remain the existing manually maintained Project values; no accounting integration is introduced.
- External roles exist in policy, but no external share-link UI is enabled by this slice.

## Still required before calling the 24-week plan complete

The attached plan is intentionally larger than one release. The following remain explicit later-phase work, not implied completion:

- Re-run the referenced security audit and close every Critical/High with live evidence. The audit artifact was not present in this checkout.
- Migrate every remaining legacy list/search/notification/GraphQL resolver to query-time `visible_nodes()` filtering; dual-run old/new decisions for at least two weeks.
- Complete Decision/Risk CRUD, objective roll-ups, milestone RAG projection, roadmap/Gantt bands, allocation heatmaps, and policy simulator UI.
- Complete Knowledge shares/templates/publish approvals, ACL-aware search index, access-diff move UI, restricted references, and expiring external links.
- Complete ghost dependency serialization, task move wizard, venture split/archive wizards, and member/allocation administration UI.
- Add outbox processing and cockpit materialized projections, board-pack/weekly-update generators, approval flows, mobile scope switching, and full GraphQL/MCP parity.
- Rehearse migration on production-shaped data, load-test the cockpit at the plan's stated scale, and conduct the red-team access matrix.

## Verification recorded for this slice

- Backend: `135 passed`.
- Frontend: TypeScript passed; `19 passed`; production build passed; the mocked holding → venture → function flow passed on phone, tablet, and desktop with zero Axe violations or horizontal overflow.
- Alembic: the new revision renders successfully in offline PostgreSQL SQL mode. Live migration was not run because no Docker/Postgres service was available in this workspace.
