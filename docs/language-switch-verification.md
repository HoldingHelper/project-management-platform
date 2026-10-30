# Language-switch verification — 29 October 2026

Status: the local English/Persian switch is verified. The production release is not complete.

## Verified locally

- English and Persian can be selected in Docs, the profile menu and Settings. The login page also supports an anonymous browser choice.
- Refresh preserves the selected language. HTML responses render English as `en/ltr` with “Welcome back” and Persian as `fa/rtl` with “خوش آمدید” before hydration.
- Logout retains the browser choice. Signing in from an English login screen restores the saved Persian account preference and returns to the previous Settings section.
- Switching language preserves open document text, the active `view=my` task filter, and unsaved form input. The test email draft was cleared without saving.
- Arrow-key tab selection and focus follow RTL in Persian and LTR in English. The task filter was restored after testing.
- The mobile Docs switch fits at 390px without horizontal overflow; document content remains unchanged. Markdown source uses automatic text direction with a LTR code gutter.
- No browser warnings or errors were observed in the final check. The viewport was restored to its normal size, and the account was left in Persian.
- Strict binding audit: 1,886 messages, 1,844 translated, 42 intentionally neutral, zero missing bound messages.
- TypeScript checks, all 43 frontend tests, the production frontend build and `git diff --check` passed.

## Gaps fixed in this check

- React state updaters no longer perform cookie or DOM side effects. Locale restoration happens before persistence, and language/direction synchronization happens before paint.
- Static HTML with a mismatched saved locale is hidden until cookie restoration completes; matching SSR HTML remains visible. Invalid or blocked cookies do not leave the app hidden. Bootstrap behavior is unit tested; the real static hosting deployment still needs validation.
- A signed-in change must be confirmed by the profile response. An older API that omits or ignores the locale field produces a save error rather than pretending the account preference persisted.
- Calendar and digit preferences restore independently even when account language is unset. Missing or invalid preference fields preserve browser defaults.
- Date/time style presets no longer conflict with the formatter's default date fields.
- Shared textareas and the Docs source editor handle mixed Persian/English text; tab navigation also moves focus correctly.

## Production blocker and release limits

A read-only call through the production MCP to `/users/me` returned HTTP 200 but contained no `locale`, `calendar` or `numbering_system` fields. Production account-language persistence therefore cannot be confirmed and is not ready to be called complete. Deploy the backend preference migration/API and frontend localization changes together, then repeat the live checks on production. No production data or deployment was changed during this verification.

The catalog audit covers explicit translation bindings, not every legacy or dynamic string. Native Persian copy review, remaining legacy text, exhaustive role/accessibility review and static hosting verification remain release acceptance checks. User-authored titles, documents, file names, identifiers and content intentionally remain unchanged.
