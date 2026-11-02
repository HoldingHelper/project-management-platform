# Telegram Bot Module Guide for Project Management Platform (PMP)

## 1. Overview and Architecture

The Telegram Bot is an integrated, native module within the Project Management Platform (PMP) backend (`backend/app/modules/telegram`). It empowers users to manage PMP conversationally in **Persian (Farsi)** and **English**, executing project management operations directly through existing domain services, models, permissions, events, and database infrastructure.

### Core Architecture & Philosophy

1. **Native Part of PMP**: Lives directly inside `backend/app/modules/telegram` within the modular monolith.
2. **Zero MCP Dependency**: MCP is developed and run separately. The Telegram bot interacts natively with PMP services without MCP tools or transports.
3. **Zero Business Logic Duplication**: Handlers never perform raw database queries or direct mutations. All domain operations strictly delegate to existing PMP services (`projects.service`, `collaboration.service`, `docs.service`, `analytics.service`, etc.).
4. **Live Authoritative RBAC**: Permissions are **never** stored statically at connection time, inside deep links, or in Telegram state. On every user action (text, command, or callback query), the bot reconstructs the user's active `CurrentUser` context and checks live PMP permissions. If an admin revokes a permission in PMP, the Telegram bot immediately enforces that revocation without requiring reconnection.
5. **Dynamic UI & Server-Side Defense**: Inline menus and keyboards dynamically adapt to the user's active capabilities. Server-side authorization independently verifies every action, ensuring forged requests or hidden UI taps are rejected.
6. **Resource-Level Scoping**: Users can only discover, view, or modify projects and tasks to which they have explicit access (membership, assignment, or organization-wide view permissions).

```
Telegram Client (Farsi / English)
       │
       ▼
Webhook API Router (/api/v1/integrations/telegram/webhook) OR Dedicated Worker
       │
       ▼
aiogram 3.x Dispatcher & Middlewares
       │
       ▼
Authentication & Identity Resolution (resolve_telegram_user -> Live CurrentUser)
       │
       ▼
TelegramCapabilityService (Derives live UserCapabilities from PMP RBAC)
       │
       ▼
Intent Parsing (Deterministic Regex/Keywords -> Structured LLM fallback)
       │
       ▼
Entity Resolver (Resource-scoped resolution for Projects, Sprints, Tasks, Users, Teams)
       │
       ▼
Command Executor (Enforces server-side permissions -> Invokes PMP Domain Services)
       │
       ├── projects.service (create_task, update_task_status, create_sprint_batch, etc.)
       ├── collaboration.service (create_comment, upload_file)
       ├── docs.service & diagram_generator (search_docs, render_diagram_svg)
       └── analytics.service (get_executive_kpis)
       │
       ▼
Event Bus (TaskAssigned, TaskStatusChanged) -> In-App Notifications & Audit Logs
       │
       ▼
HTML Formatted Response + Dynamic Permission-Aware Inline Keyboards
```

---

## 2. Configuration & Environment Variables

Add the following environment variables to your `.env` or deployment configuration:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | string | `None` | Telegram Bot token obtained from [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_BOT_USERNAME` | string | `None` | Username of the Telegram bot (e.g. `pmp_assistant_bot`). |
| `TELEGRAM_BOT_ENABLED` | bool | `True` | Master toggle to enable or disable the Telegram integration. |
| `TELEGRAM_WEBHOOK_SECRET`| string | `None` | Secret token verified against `X-Telegram-Bot-Api-Secret-Token`. |
| `TELEGRAM_WEBHOOK_URL` | string | `None` | Public HTTPS URL for webhook delivery. |
| `TELEGRAM_POLLING_ENABLED`| bool | `False`| Runs aiogram long-polling worker when set to `True`. |
| `TELEGRAM_DEFAULT_LANGUAGE`| string | `fa` | Default fallback language (`fa` for Persian, `en` for English). |
| `TELEGRAM_STATE_TTL_SECONDS`| int | `900` | Expiration time for conversation state and confirmation tokens (15 min). |

---

## 3. Account Linking & Security Model

To protect against unauthorized access and privilege escalation, account linking follows a secure cryptographic workflow:

### Secure Handshake Flow

1. **User requests connection in PMP Web UI**:
   - The user opens **Settings > Integrations > Telegram** and clicks **Connect Telegram Bot**.
   - The backend (`POST /api/v1/integrations/telegram/link-code`) creates a single-use, 32-character cryptographically secure token (`secrets.token_hex(16)`), valid for 15 minutes.
   - The backend constructs and returns a deep link:
     `https://t.me/<bot_username>?start=<opaque_token>`
   - **Zero Sensitive Data Exposure**: The deep link contains only the opaque connection token. No passwords, JWTs, user UUIDs, roles, or permissions are ever exposed in the URL.
2. **User opens Telegram**:
   - Clicking the link launches Telegram and delivers `/start <opaque_token>` to the bot.
   - The bot validates the token:
     - Token must exist in `integrations.user_telegram_connections`.
     - Token must not be expired (`auth_link_expires_at > utcnow()`).
     - Token must not have been used or revoked (anti-replay check).
3. **Identity Binding**:
   - The bot links the **immutable numeric Telegram chat ID** to the authenticated PMP `user_id`.
   - Telegram username is stored strictly as optional display metadata and is never used as authorization identity.
   - Any prior conflicting association with that Telegram chat ID is cleanly detached.
   - The token is immediately consumed and invalidated (`conn.auth_link_code = f"used_{secrets.token_hex(8)}"`).
4. **Dynamic Menu Display**:
   - The bot immediately resolves the connected user's active permissions, generates a dynamic permission-aware main menu, and greets the user in Persian or English.
5. **Disconnect Flow**:
   - **From PMP Web UI**: User clicks **Disconnect Telegram Bot** (`DELETE /api/v1/integrations/telegram`).
   - **From Telegram**: User sends `/disconnect`.
   - Disconnecting immediately sets `is_connected=False`, clears the chat ID, revokes pending tokens (`revoked_...`), and terminates all further bot interactions until reconnected.

---

## 4. Live RBAC & Dynamic Capabilities

Permissions are derived dynamically using `TelegramCapabilityService` on every incoming update.

### Capabilities Matrix

| Capability | PMP Required Permission | UI Menu Button | Server-Side Enforcement |
| :--- | :--- | :--- | :--- |
| **Create Project** | `projects.create` | `[ 🏢 ساخت پروژه ]` | Rejects with 403 Forbidden |
| **View Projects** | `projects.view_all` / `projects.view_assigned` | `[ 📁 پروژه‌ها ]` | Rejects with 403 Forbidden |
| **Manage Project** | `projects.manage_all` / `projects.manage_assigned` | Project Edit button | Rejects with 403 Forbidden |
| **Project Members**| `projects.manage_users` | Member management | Rejects with 403 Forbidden |
| **Create Sprint** | `phases.manage_all` / `phases.manage_team` | New sprint action | Rejects with 403 Forbidden |
| **View Sprints** | `phases.view` / `phases.manage_all` | `[ 🚀 اسپرینت فعلی ]` | Rejects with 403 Forbidden |
| **Create Task** | `tasks.manage_all` / `tasks.edit_assigned` | `[ ➕ تسک جدید ]` | Rejects with 403 Forbidden |
| **View Tasks** | `tasks.view` / `tasks.edit_assigned` | `[ 📋 تسک‌های من ]` | Rejects with 403 Forbidden |
| **Assign Task** | `tasks.assign` / `tasks.manage_all` | Task Assign button | Rejects with 403 Forbidden |
| **Edit Task Details** | `tasks.manage_all` / `tasks.edit_assigned` (if assigned) | Task details update | Rejects with 403 Forbidden |
| **Change Status** | Contributor or Manager | Status transition buttons | Rejects with 403 Forbidden |
| **Add Comment** | `tasks.comment` | Comment button | Rejects with 403 Forbidden |
| **Upload File** | `tasks.upload_files` | File upload attachment | Rejects with 403 Forbidden |
| **Create Ticket** | `tasks.view` + `tasks.manage_all` | `[ 🎫 ثبت تیکت ]` | Rejects with 403 Forbidden |
| **Milestones** | `milestones.manage` | Milestone commands | Rejects with 403 Forbidden |
| **Search Docs** | `docs.view` | `[ 📚 مستندات ]` | Rejects with 403 Forbidden |
| **View Analytics** | `reports.view` / `analytics.view_org` | `[ 📊 گزارش و آمار ]` | Rejects with 403 Forbidden |

### Dynamic UI Updates
- If a user's role is updated in PMP (e.g. promoting Developer to Project Manager, or removing `projects.create`), their Telegram UI immediately adapts on the next interaction or `/menu` command without reconnecting.
- Hidden UI elements are strictly backed by server-side verification: even if an unauthorized user attempts to trigger an action via natural language or forged callback query, the server rejects the request.

---

## 5. Supported Operations & Examples

### Projects
- **Create Project**:
  - `پروژه به نام Atlas بساز`
  - `Create a project named Atlas`
- **View Project Status**:
  - `وضعیت پروژه Atlas را بگو`
  - `Show project Atlas status`
- **List Projects**:
  - `پروژه‌ها` یا `/projects`
  - `Show projects`
- **Update Description**:
  - `توضیحات پروژه Atlas را به سامانه یکپارچه تغییر بده`
  - `Update project Atlas description to Unified Platform`

### Sprints
- **Batch Creation (Strict 3, 7, 14-Day Durations)**:
  - `۵ اسپرینت ۷ روزه برای Atlas از دوشنبه بعد بساز`
  - `Create 5 seven-day sprints for Atlas starting next Monday`
  - *Note: PMP strictly enforces 3, 7, and 14-day sprint cycles. Non-standard durations are rejected.*
- **List Sprints**:
  - `اسپرینت‌های پروژه Atlas`
  - `List sprints for Atlas`
- **View Current Sprint**:
  - `اسپرینت فعلی`
  - `Current sprint status`
- **Move Task to Backlog or Sprint**:
  - `این تسک را به بکلاگ ببر` / `Move this task to the backlog`
  - `تسک 142 را به اسپرینت 4 ببر` / `Move task 142 to Sprint 4`

### Tasks
- **Create Task**:
  - `برای پروژه PMP یک تسک برای رفع مشکل لاگین بساز و به علی بده`
  - `Create a task called 'Fix login redirect' in the current sprint`
  - `یک تسک به نام Refactor auth بساز` (Bot prompts interactively if project is missing)
- **Assign / Reassign Task**:
  - `تسک 142 را به علی و سارا بده`
  - `Assign task 142 to Reza and Sara`
  - `بده به علی` (Contextual follow-up)
- **Change Task Status**:
  - `تسک 142 را Done کن` / `Change task 142 to In Progress`
  - Interactive inline buttons: `[🔵 Ready]`, `[🟡 In Progress]`, `[✅ Done]`
- **Set Deadline / Due Date**:
  - `ددلاینش را سه‌شنبه بگذار`
  - `Set its deadline to next Tuesday`
  - Supports Persian and English relative dates (`فردا`, `پس‌فردا`, `۳ روز دیگر`, `دوشنبه`, `tomorrow`, `next Monday`).
- **Set Priority**:
  - `اولویتش را High کن` / `Set its priority to High` (P0, P1, P2, P3)
- **Labels & Checklists**:
  - `لیبل‌های backend و urgent را اضافه کن` / `Add the labels backend and urgent`
  - `چک‌لیست اضافه کن: تست واحد، بررسی عملکرد` / `Add a checklist`
- **Comments**:
  - `روی تسک 142 کامنت بگذار: بررسی شد و آماده تست است`
  - `Add a comment to task 142: Ready for QA`
- **Search & Filter Tasks**:
  - `تسک‌های من` یا `/mytasks` / `Show my tasks`
  - `تسک‌های علی را نشان بده` / `Show Ali's tasks`
  - `تسک‌های عقب‌افتاده` / `Show overdue tasks`
  - `تسک‌های تیم بکند` / `Tasks assigned to the backend team`
  - `پیدا کردن تسک لاگین` / `Find the task about login`

### Tickets
- **Create Ticket**:
  - `یک تیکت برای تیم QA بساز`
  - `Create a ticket for the QA team`

### Documentation & Diagrams
- **Search Docs**:
  - `جستجوی داکیومنت درباره احراز هویت` / `Search docs for authentication`
- **Architecture Diagrams**:
  - `یک دیاگرام C4 برای سیستم احراز هویت رسم کن` / `Create a flowchart diagram for data pipeline`
  - Generates valid SVG diagrams via `docs.diagram_generator` and sends them as downloadable Telegram files.

### File Attachments
- **Send Document or Photo**:
  - Uploading a document or photo automatically attaches it to the currently active task context via `collaboration.service.upload_file` and MinIO/S3 object storage, strictly validating permissions and file size ($\le 25\text{MB}$).

---

## 6. Dockerized Deployment & Execution Modes

The Telegram Bot uses the project's standard Dockerized pattern. No standalone local Python environment or `.python312` folder is required.

### Docker Compose Configuration

The bot service is defined in `compose.yaml`:

```yaml
  telegram-bot:
    image: project-management-platform-api:local
    build: ./backend
    command: ["python", "-m", "app.modules.telegram.worker"]
    environment:
      <<: *api-environment
      INIT_ADMIN_ON_STARTUP: "false"
      RUN_MIGRATIONS_ON_STARTUP: "false"
      SEED_ON_STARTUP: "false"
      TELEGRAM_POLLING_ENABLED: "true"
      TELEGRAM_BOT_ENABLED: "true"
    volumes:
      - api-logs:/app/var/logs
    depends_on:
      api:
        condition: service_started
```

### Running with Docker

```bash
# Build and start all services including telegram-bot
docker compose up --build -d

# View bot logs
docker compose logs -f telegram-bot
```

### Mode A: Webhook (Production Standard)
In production environments behind an HTTPS reverse proxy (e.g. Nginx, Traefik, or Ingress):
1. Configure `TELEGRAM_WEBHOOK_URL="https://your-domain.com/api/v1/integrations/telegram/webhook"`
2. Set `TELEGRAM_WEBHOOK_SECRET="<secure-random-token>"`
3. FastAPI automatically registers the webhook with Telegram on startup.
4. Incoming updates are authenticated via the `X-Telegram-Bot-Api-Secret-Token` header.

### Mode B: Standalone Polling Worker (Development / Dedicated Container)
Runs the dedicated worker container via `compose.yaml` or directly inside the backend container:
```bash
docker compose exec api python -m app.modules.telegram.worker
```

---

## 7. Testing & Verification

The Telegram Bot module includes full unit test coverage verifying linking, dynamic RBAC, permissions, and entity scoping:

```bash
cd backend
DEBUG=false .venv/bin/pytest tests/unit/test_telegram_*.py
```

Covered suites:
- `test_telegram_permissions.py`: Connection token generation, token expiration, replay prevention, dynamic main menu updates, server-side RBAC enforcement, and resource-level scoping.
- `test_telegram_security.py`: Single-use link codes, account association, and CurrentUser resolution.
- `test_telegram_dates.py`: Persian and English weekday, relative time, and digit conversions.
- `test_telegram_parser.py`: Deterministic intent matching across all domain actions.
- `test_telegram_state.py`: Multi-turn state management, bounded TTL, and anti-replay confirmation tokens.
- `test_telegram_executor.py`: CommandExecutor routing, sprint duration validation (3/7/14 days), and RBAC error handling.
- `test_telegram_handlers.py`: aiogram router handlers, slash commands, text messages, and inline callbacks.
