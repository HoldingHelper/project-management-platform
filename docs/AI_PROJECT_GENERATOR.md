# AI Project Generator

Project Managers and Team Leads can generate a full project plan from a filled Markdown brief.

## Template

Download the user-facing template from:

```text
GET /api/v1/projects/ai-template
```

Users should fill required sections and write `none` for optional sections they do not want to provide. Blank optional sections are treated as `none`; the system prompt tells the model not to invent missing business facts.

Users can also paste shared Google Sheets URLs in the context sections. The backend reads public/shared sheets through CSV export and appends that content to the AI brief before generation. Sheets must be shared so anyone with the link can view them; private sheets return a validation error.

## Workflow

The backend stores the internal system prompt at:

```text
backend/app/modules/projects/prompts/system/project_generator.md
```

The LangGraph workflow nodes are:

- `parse_input`
- `load_google_sheets_context`
- `validate_input`
- `generate_draft`
- `validate_output`
- `resolve_assignees`
- `review_gate` for regeneration
- `persist`

Generation returns a draft `generation_run` first. Confirmation commits the project, phase, tasks, dependencies, prompt object key, and summary object key.

## Configuration

Set these in backend `.env` or deployment secrets:

```bash
OPENAI_API_KEY=...
PROJECT_AI_MODEL=gpt-5.5
PROJECT_AI_TEMPERATURE=0.2
PROJECT_AI_MAX_TOKENS=12000
PROJECT_AI_TIMEOUT_SECONDS=90
PROJECT_AI_MAX_SCHEMA_RETRIES=2
PROJECT_AI_MAX_API_RETRIES=3
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=...
LANGCHAIN_PROJECT=pmp-project-generator
```

Secrets must not be committed.

GitHub Actions `DEV` environment must define:

- Secrets: `OPENAI_API_KEY`, `LANGSMITH_API_KEY`
- Optional vars: `PROJECT_AI_MODEL`, `PROJECT_AI_TEMPERATURE`, `PROJECT_AI_MAX_TOKENS`, `PROJECT_AI_TIMEOUT_SECONDS`, `PROJECT_AI_MAX_SCHEMA_RETRIES`, `PROJECT_AI_MAX_API_RETRIES`, `LANGCHAIN_TRACING_V2`, `LANGCHAIN_ENDPOINT`, `LANGCHAIN_PROJECT`

## Access

Generation endpoints require existing project/task management permissions granted to `ProjectManager`, `TeamLead`, `CompanyManager`, or `SuperAdmin`.
