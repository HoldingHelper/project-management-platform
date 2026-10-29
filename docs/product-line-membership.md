# Product Line membership

Product Line create/edit forms support searching active people by name or email,
adding several people, and removing selected people before saving. The Product
Line owner is always an implicit member. Existing product-management permissions
continue to control who may edit these memberships.

Project invitations are limited to active members of that project's Product Line.
The creator must also belong to the selected Product Line, and moving a project
to another line validates all its existing project members. Tasks and reviewers
may be assigned only to active project members; backlog tasks remain unassigned.
The same service checks protect REST, MCP, GraphQL, tickets, and AI generation.

Remove task assignments/reviews before removing project membership, then remove
project memberships before removing Product Line membership. A rejected change
does not silently remove assignments or memberships. Legacy task assignments are
left intact and can be explicitly cleared in the task editor.

Migration o9c1d3e5f7a8 creates projects.product_members and preserves existing project
members as members of the corresponding Product Lines. Apply Alembic migrations
before running the new API. No production data was changed during development.

Verification:
- Frontend TypeScript, existing frontend tests, strict translation audit, and build.
- Backend membership unit tests and existing project/MCP regression tests.
- Opt-in PostgreSQL regression test (all created records rolled back):
  PMP_MEMBERSHIP_DB_TESTS=1 python -m pytest tests/integration/test_product_membership.py -q

Local verification completed:
- 79 targeted backend tests passed, including the PostgreSQL rollback workflow,
  ticket/AI eligibility checks, roster access restrictions, and MCP regressions.
- 43 frontend tests passed; frontend production build and TypeScript passed.
- Strict translation audit reports zero missing messages.
- Browser verified search by email, unsaved add/remove selections, both Product
  Line forms, filtered project invitations, and filtered task/reviewer choices.
- The broader unit suite had 248 passes and one existing GraphQL diagram mock
  failure. That failure also reproduces with the unchanged HEAD version of
  product_access.py; it is unrelated to the membership predicate.
- Local Alembic revision: o9c1d3e5f7a8. Production was not deployed.
