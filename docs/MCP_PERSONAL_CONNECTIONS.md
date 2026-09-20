# Personal MCP Connections

Project Management Platform exposes a remote Model Context Protocol endpoint so Codex, Claude,
Cursor, and other MCP clients can work with the same authenticated application
surface visible to the connected Platform user.

## Connection model

Users configure connections at `/settings/mcp`.

1. The signed-in user chooses a token name, expiry (1–365 days), and a subset
   of their current permissions.
2. The API returns a `pmp_mcp_…` secret once. Only its SHA-256 hash is stored.
3. The copied MCP JSON sends that secret in the `Authorization: Bearer` header.
4. Every MCP request resolves the owning active account and intersects the
   token permission subset with the user's live RBAC permissions.
5. Domain authorization then filters project membership, task access, and Docs
   visibility. Revoked, expired, and inactive-user tokens fail closed. A token
   with no selected application permissions exposes identity and `SKILL.md`
   only, with no project, task, Docs, integration, or automation tools.

Account passwords are never accepted by the MCP endpoint and must never be put
in agent configuration.

## Endpoints

All routes are under `/api/v1`:

- `POST /mcp` — authenticated Streamable HTTP JSON-RPC requests.
- `GET /mcp` — authenticated Streamable HTTP event stream negotiation.
- `GET /mcp/sse` — authenticated legacy SSE compatibility endpoint.
- `GET /mcp/setup` — signed-in web-user setup metadata.
- `GET|POST /mcp/tokens` — list or generate the signed-in user's tokens.
- `DELETE /mcp/tokens/{token_id}` — immediately revoke an owned token.
- `GET /mcp/skill.md` — signed-in preview/download of the dynamic skill.

Production: `http://localhost:8000/api/v1/mcp`

Development: use the endpoint shown on the dev `/settings/mcp` page, which is
derived from that deployment's API base URL.

## Client configuration

The UI produces the final configuration with the one-time token inserted. The
generic remote MCP form is:

```json
{
  "mcpServers": {
    "project-management-platform": {
      "type": "http",
      "url": "http://localhost:8000/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer pmp_mcp_REDACTED"
      }
    }
  }
}
```

Never commit a real configuration containing the token. If a token is exposed,
revoke it in `/settings/mcp` and generate a replacement.

## Agent discovery

The MCP server advertises these resources during `resources/list`:

- `pmp://agent/SKILL.md` — connected identity, safety rules, effective
  permissions, available tools, ticket workflow, and read-before-write guidance.
- `pmp://account/context.json` — user ID, roles, effective token permissions,
  and available tool names.
- `pmp://api/openapi.json` — the authenticated JSON API paths and schemas that
  can be called through `pmp_api_request`.

The `initialize` response instructs the client to read `SKILL.md`. The resource
is generated for the authenticated token, so it never documents tools outside
that token's current access.

## Authorization invariants

- Token permissions are an upper bound, never an additional grant.
- Live role removal takes effect on the next MCP request.
- SuperAdmin role bypass is disabled inside scoped MCP principals; explicit
  effective permission codes remain authoritative.
- `tools/list` omits unavailable tools and `tools/call` rejects direct attempts.
- Every live permission is represented by `pmp_api_request`. It dispatches only
  below `/api/v1`, uses a two-minute internal delegated JWT containing the
  token's effective permission intersection, and explicitly disables role
  bypass. Authentication, MCP-token management, public anonymous routes, and
  the raw delegated credential are never exposed through the tool.
- Common project, sprint, task, Docs, and attachment workflows also have typed
  first-class tools. The general API tool covers the remaining authenticated
  JSON endpoints so the MCP catalog cannot silently lag behind new UI features.
- Docs tools call Docs services so private/selected/team/department visibility is
  preserved.
- Project and task tools call resource authorization before reads or mutations.
- Project overview returns visible sprint UUIDs, while the task-write-scoped
  people/team search resolves assignment and ticket-recipient UUIDs without
  exposing other users' permissions.
- Ticket creation uses the normal task service, so active team expansion and
  dashboard notifications are identical to the web app.
- WhatsApp and automation tools require `system.manage_settings` and should be
  invoked only after explicit user intent because they can cause side effects.

## Operations and incident response

- Tokens expire after at most 365 days; 90 days is the UI default.
- A user may hold at most 20 active MCP tokens.
- The raw token is never logged or returned after creation.
- `last_used_at` supports connection review from the UI.
- Revoking a token is immediate; client retries receive HTTP 401.
- Deactivating a user immediately invalidates all that user's MCP tokens.
