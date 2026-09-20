# September 2026 feature update

This update brings the reusable web, API, and mobile functionality into the public platform while retaining its MIT license, independent history, and self-hosted configuration.

## Included

- Docs spaces, hierarchical pages, publishing, revisions, anchored comments, uploads, diagrams, and links to project work.
- Sprint planning, ticket mode, task partitions, ordering, multi-assignee editing, and authenticated task creation.
- Administrator-editable role permissions enforced by the API, with protected SuperAdmin behavior and preserved custom role grants.
- Permission-scoped, revocable MCP tokens, discoverable agent instructions, and GraphQL.
- Optional Calendar, GitHub, Telegram, WhatsApp, and workflow integrations.
- Mobile task, chat, Docs, profile, notification, and biometric-login screens.
- Public documentation and navigation, responsive layout corrections, contrast fixes, and configurable bootstrap credentials.
- Missing-import fixes for the calendar reminder worker, presence status typing, and music cache typing.

## Upgrade

Back up the database and object storage. Retain `.env` and Docker volumes, then rebuild the stack. The API runs Alembic migrations on startup. For manual installs, run `alembic upgrade head` and `python scripts/seed_db.py` from `backend` with your configured environment.

Existing `SEED_ADMIN_*` variables are accepted; `INITIAL_ADMIN_*` variables take precedence. The seeder preserves existing users and administrator-customized permissions. Optional integration variables are shown in `backend/.env.example` and forwarded by Compose. MCP tools use the public `pmp_` prefix and resources use `pmp://`.

## Validation and limits

- 125 backend tests, 19 frontend unit tests, and 41 Playwright browser tests passed. Seven browser cases were skipped by credential/device conditions. Production web build, frontend TypeScript, mobile TypeScript, undefined-name lint checks, and diff whitespace checks passed.
- PostgreSQL clean install, upgrade from the previous public migration head, idempotent seeding, and authenticated API smoke checks verified against disposable local databases.
- Web dependencies audited with no reported vulnerabilities after compatible updates.
- Mobile remains on Expo SDK 52. Compatible dependency fixes were applied, but 26 npm advisories remain (14 moderate, 11 high, 1 critical). Resolving all advisories requires a coordinated Expo/React Native upgrade. Native compilation, signing, push notifications, and physical-device behavior were not verified.
- Docker Compose configuration validated; container execution was unavailable because the local Docker daemon was stopped.
- External OAuth, messaging providers, and AI generation require operator credentials and were not exercised against live services.

Organization deployment workflows, signing assets, internal account presets, private environment files, and private Git history are not included.
