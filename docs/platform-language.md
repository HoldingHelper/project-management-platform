# Platform and personal language

Language controls are available only in Settings → Language and region. The
login page, header menu, and Docs workspace no longer offer language switches.

A Super Admin selects and saves the initial platform language in Settings. Until
configured, English is the fallback. The platform default is persisted separately
from each user's nullable `locale`; a personal English or Persian selection
always takes precedence. Choosing “Use platform default” saves a null personal
locale, so future platform default changes are inherited too. Existing personal
choices are preserved. Open sessions refresh the default every 60 seconds.

The active sidebar indicator uses `inset-inline-start`: right for Persian, left
for English. Calendar and digit preferences remain personal settings.

API: GET `/auth/language-default` returns the public locale and configuration
state without caching; PATCH `/users/platform-language` accepts `en` or `fa` and
requires a live Super Admin session. Scoped MCP tokens cannot use a role bypass.
Apply migration `s3a5b7c9d1e2` and deploy API/frontend together.

Verification: build and TypeScript passed; 47 frontend tests and strict Persian
translation audit passed. 14 targeted backend tests passed, including rollback-only
PostgreSQL checks for permission denial, saved defaults, personal override reset,
and persistence. The live default is deliberately left for the Super Admin to
choose in Settings.
