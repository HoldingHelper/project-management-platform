# English and Persian UI

The local app supports `en` (LTR) and `fa` (RTL). Language names are shown without flags in login, the profile menu, Settings, and Docs. Settings also offers independent Gregorian/Solar Hijri calendar and Latin/Persian digit choices. Defaults remain English, Gregorian and Latin digits.

## Preference ownership and rendering

A signed-in account preference wins over an explicit browser choice; an account without a language preference uses the browser choice, then English. `identity.users.locale`, `calendar`, and `numbering_system` are returned with the normal login/refresh user payload. A signed-in change uses the existing authenticated `/users/me/profile` endpoint; it cannot update another user's preferences or grant roles. No extra preference fetch is added to login.

Non-secret, validated `pmp.locale`, `pmp.calendar`, and `pmp.numbering_system` cookies restore browser preferences for a year. The Next.js server reads them to render `html[lang][dir]` and matching translations. The provider changes presentation without navigation, query invalidation, or form remounts. Logout retains browser preference. On another device, account preference is applied when the normal session response arrives.

Static exports generate English HTML. A validated locale-cookie bootstrap sets language/direction before paint and hides mismatched HTML until the provider restores the browser locale. Matching server-rendered pages remain visible. The bootstrap and blocked-cookie cases are covered by tests; validate the actual static hosting deployment separately before shipping. The current Compose runtime uses server rendering. The HTTP HTML cache policy is `no-store`; never cache locale-dependent HTML across users without varying on the locale.

## Adding UI copy

English message text is the stable message ID and English fallback. Add the Persian value to `frontend/src/lib/i18n/fa.json` in the same change. Do not change an English ID without updating its translation and usages.

Use `useI18n().t("Save changes")` for string props and `<LocalizedText message="Save changes" />` for JSX. Interpolate complete sentences, for example `t("Good day, {name}", { name })`; preserve placeholder names in Persian. `plural()` selects forms with `Intl.PluralRules`. Do not concatenate translated sentence fragments for new features.

Translate only authored interface copy and fixed system enum labels. Never translate saved names, user descriptions, comments, document bodies, labels, file names, IDs, URLs, API enum values or sorting keys. For shared `Select`, explicitly opt a fixed list into `translateOptions`, or mark an individual static option `translateLabel: true`. User-supplied options stay unchanged, even when their name coincides with a translated status.

Use `intl.date()`, `intl.number()`, `LocalizedDate`, and `LocalizedRelativeTime` to format display values. Calendar/digit choices never change ISO date input values, UTC storage, comparisons, numeric calculations, API payloads, or chart coordinates. Pass explicit number options for currencies, units, or required precision. Time axes remain LTR. Date inputs use the browser's native Gregorian input; the selected calendar controls display, not data entry.

Use logical inline/block spacing and `text-align: start`. Keep code, URLs, email, numeric identifiers and shortcuts isolated in LTR, and use `dir="auto"` for user input. Do not mirror playback icons, logos or time axes. Persian uses locally hosted Vazirmatn, licensed under SIL OFL 1.1; keep `public/fonts/Vazirmatn-OFL.txt` with the font.

## Verification

Run `npm run i18n:audit`, `npm run typecheck`, `npm test`, `npx --no-install tsx --test src/lib/i18n/*.test.ts`, and `npm run build`. The audit writes `src/lib/i18n/inventory.json` and fails on uncatalogued literals passed to translation bindings. `neutral.json` explicitly lists names, shortcuts and code tokens intentionally left unchanged. This is binding coverage, not proof that every legacy/dynamic string has been extracted; review screens and runtime metadata as well. Never add ordinary English copy to the neutral list to silence failures.

CI runs the strict catalog audit, type checking, existing tests, explicit localization tests, and build. Core tests cover fallback, placeholders, calendar/digit formatting, cookie validation, pluralization, problem details, and preservation of user-supplied dropdown names and submitted enum values. Backend tests validate supported preference values and prevent privilege fields from being accepted through preference updates.

Manual checks: switch while editing a draft; refresh; log out and back in with an opposite anonymous language choice; inspect Holding, tasks, project creation and Docs at 320px, 390px, tablet and desktop widths. Verify RTL inspector tabs, returning to Holding/main menu, keyboard labels, file controls, long names and mixed-direction content. Do not upload or delete user documents to test presentation.

## Terminology

| English | Persian |
| --- | --- |
| Holding | هلدینگ |
| Product line | خط محصول |
| Project | پروژه |
| Task | کار |
| Sprint | اسپرینت |
| Partition | حوزه کاری |
| Checklist | چک‌لیست |
| Connected documents | اسناد مرتبط |
| Workspace | فضای کاری |
| Assignee | مسئول |
| Blocker | مانع |

## Release follow-up

The implementation is running in the local Compose environment. The Docs implementation plan tracks verified work and remaining acceptance checks. Native Persian copy review, exhaustive role/screen review, static-export first-paint behavior, and production deployment/verification are separate remaining release checks. Unknown API problem details deliberately retain their original explanation after a translated summary; missing catalog entries safely fall back to English. Existing English/user-authored documentation is not machine translated.

## Language-switch verification — 29 October 2026

The production MCP /users/me response does not currently include locale, calendar or numbering_system, so production persistence is not yet verified or complete. A signed-in selector now requires the profile response to confirm each requested preference before applying it; older API responses cannot silently masquerade as saved preferences. Backend and frontend localization changes must be deployed together.

The provider keeps React state updates pure, restores browser cookies before persisting them, and synchronizes language/direction before paint. RTL arrow-key tab movement follows visual direction and moves focus. Shared textareas choose direction from their content, while the Markdown source pane keeps its code gutter in LTR. Date/time style presets are supported without conflicting default fields.
