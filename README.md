# Project Management Platform

A self-hosted, full-stack workspace for planning projects, coordinating teams, and tracking delivery. It combines portfolio views, task workflows, collaboration, analytics, and optional AI-assisted project generation in one modular application.

## Features

- Project portfolios, milestones, phases, dependencies, subtasks, and Gantt timelines
- Role-based access control, invitations, teams, departments, and user profiles
- Comments, file attachments, notifications, activity feeds, and real-time chat
- Personal, team-performance, and executive analytics
- Optional AI generation of structured project plans from briefs and spreadsheets
- Optional Google Drive integration and synchronized music rooms
- Dark/light themes and responsive, accessibility-tested interfaces

## Stack

- Frontend: Next.js 16, React 19, TypeScript, TanStack Query, Recharts
- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL, Redis
- Storage: S3-compatible object storage (MinIO locally)
- Realtime: WebSockets with a Redis Pub/Sub backplane

## Quick start with Docker

Requirements: Docker Engine with Compose v2.

```bash
cp .env.example .env
docker compose up --build
```

Open the application at <http://localhost:3000>. The API documentation is at <http://localhost:8000/docs> and the MinIO console is at <http://localhost:9001>.

The local seed account is:

```text
Email: admin@example.com
Password: ChangeMe123!
```

These credentials and every value in `.env.example` are development defaults. Change them before exposing any service outside your machine.

## Local development without Docker

Start PostgreSQL, Redis, and an S3-compatible service, then configure each app:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
python scripts/seed_db.py
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

## Optional integrations

AI project generation is disabled until `OPENAI_API_KEY` is configured. Google Drive features require OAuth credentials and a Fernet key; see [AI project generator](docs/AI_PROJECT_GENERATOR.md) and [music streaming architecture](docs/MUSIC_STREAMING_ARCHITECTURE.md) for details.

## Testing

```bash
cd backend
pytest
ruff check .

cd ../frontend
npm run build
npm run test:e2e
```

## Security

Do not use the example credentials in production. Production startup validates the JWT, database, object-storage, and seed-admin defaults. Please report vulnerabilities using the process in [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and pull-request expectations.

## License

Released under the [MIT License](LICENSE). Copyright © 2026 Ali Eskandarian.
