# Workspace themes and accent colors

Settings → Appearance offers six theme styles:

- Classic: the existing workspace design.
- Frosted Glass: translucent panels and soft cool gradients, inspired by reference 1.
- Evergreen: clean panels and a prominent colored sidebar, inspired by reference 2.
- Midnight: deep navy surfaces and luminous accents, inspired by reference 3.
- Warm Glass: warm/cool ambient gradients and focused glass surfaces, inspired by reference 4.
- Minimal: quiet surfaces, rounded cards and restrained shadows, inspired by reference 5.

The selector displays only simple theme names. Reference images are not bundled
with the application. The workspace uses CSS surfaces, gradients and tokens.
Frosted Glass uses cool translucent layers; Warm Glass retains its warmer
ambient gradients. Both use stronger blur and slightly more transparent panels.
Evergreen uses a white selected navigation tab with accent-colored text, rounded
outer ends, and curved cut-outs joining the content edge. The selection mirrors
for Persian RTL. Each style supports Light, Dark and System
mode. Six independent accent choices are Blue, Purple, Emerald, Teal, Rose and
Amber. Semantic task statuses retain their meanings.

Selections preview immediately and save to the signed-in account through the
existing users/me/settings API. Failed saves restore the previous appearance.
The account choice syncs after login; per-account browser caches and a validated
before-paint script avoid flashes. System mode listens for OS appearance changes.
Existing light/dark browser choices remain supported. Notification preferences
are preserved by partial updates.

Migration t4b6c8d0e2f3 adds theme_variant and accent_color to user_settings, with
six-value checks. Display mode remains in the existing theme column. Deploy API
and frontend together and apply the migration before using the updated settings.

Verification includes theme/catalog validation, first-paint initialization,
legacy preferences, system mode, browser storage failure, per-account persistence,
notification preservation, and WCAG AA white text contrast on all six light
accent swatches. The optional scripts/verify-appearance.cjs browser check uses
explicit local test credentials, checks six styles/six accents and light/dark,
reload persistence, mobile fit, and failed-save rollback, then restores the prior
account appearance. It does not deploy or change permissions.


Initial implementation verification: API/frontend builds and TypeScript passed; 57 frontend tests,
4 backend tests, and the strict Persian translation audit passed. The isolated
Chromium check passed all 36 style/accent combinations, light/dark modes, actual
Evergreen sidebar contrast and Sprint navy surfaces, reload persistence, Persian
RTL, 390px mobile fit, and failed-save rollback. Screenshots were inspected. The
original account appearance and language were restored afterwards. Changes run
locally; production was not deployed.


Name-only refinement: removed preview assets and descriptions, simplified theme
names without changing stored IDs, increased glass transparency/blur, and added
Evergreen's rounded active-item and icon outlines. Frontend build, TypeScript,
57 regression tests and strict translation audit passed for this refinement.


Evergreen selection refinement: matched the supplied white cut-out tab reference,
replacing the earlier outlined item/icon treatment. The other styles are unchanged.


Glass intensity refinement: Frosted Glass now uses 48px blur and Warm Glass 44px
(double the previous blur). Main surface opacity is halved in both light/dark
modes. Input surfaces and text retain readable contrast; reduced-transparency
preferences still use opaque panels. Header blur participates in the theme too.


Blur adjustment: restored Frosted Glass to 24px and Warm Glass to 22px after
feedback that doubled blur was excessive; retained the more transparent panels.


Evergreen selector regression: increased its active-link selector priority so
shared active-link rules cannot override the white fill/green text. The isolated
browser test verifies English/Persian in light/dark modes, white background with
no gradient, green text, rounded leading corners and a flush content edge.
All four cases passed and their screenshots were inspected; account settings
and language were restored after the test. Frontend build/TypeScript passed.


Warm Glass checklist/progress refinement: task and project checklists use compact
rows, outlined empty boxes, glowing purple/blue completed boxes and readable
completed text. Progress indicators use a slim lavender gradient over a dark
inset track. Styling is scoped to Warm Glass; Timeline explicitly opts out, and
Gantt/timeline bars are unchanged. Checklist saving/completion behavior and
progress values are preserved.


Warm Glass completed checkboxes use a continuous purple-to-blue color range,
interpolated by item position, including intermediate violet/indigo shades rather
than alternating two fixed colors. This applies to both task/project checklists.
