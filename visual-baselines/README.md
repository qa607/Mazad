# Visual baselines (website UI layer)

Screenshots for the guest-only UI design, text-layout and localization layer
(`playwright.ui.config.ts`, `ui-tests/`). Phase 1 covers the Mazad website only, in English and
Arabic, in Chromium at 1440x900, 1280x720, 768x1024 (desktop/tablet), and 390x844 and 360x800
(phone emulation, saved at CSS size).

## Folders

| Folder                 | In git | Written by                                        |
| ---------------------- | ------ | ------------------------------------------------- |
| `approved/`            | yes    | only `npm run ui:approve`, run by a person        |
| `candidates/<run-id>/` | no     | `npm run ui:capture`                              |
| `reports/ui/<run>/`    | no     | every UI run: HTML, JSON, Allure, traces, results |

Paths: `<folder>/<project>/<platform>/<name>.png`, for example
`approved/web-ar-390/darwin/home.png`. Baselines are platform-specific.

## Modes (`VISUAL_MODE`)

- `check` (default): compares against `approved/` and never writes. A missing baseline fails.
- `capture`: writes every screenshot to a new `candidates/<run-id>/`; refuses an existing folder.
- `noise`: compares a new run against an earlier capture (`VISUAL_BASE_RUN=<run-id>`), to
  measure run-to-run differences. Never writes.

The mode is read from environment variables only. `-u`/`--update-snapshots`, Playwright UI mode
and editor runs change the update mode, so the snapshot guard fails those runs.

## Approving

1. Review the candidates (and the report's findings) for layout and for personal data such as
   names, phone numbers, plates or VINs.
2. In your own terminal: `npm run ui:approve -- --run <run-id> web-en-1440/darwin/home.png ...`
3. Type the confirmation. Existing baselines are replaced only with `--replace`.
4. Each approval is recorded in `approved/MANIFEST.json`. Review with `git diff`.

The script refuses in CI, under an AI agent and without an interactive terminal.

## Guest guard

Every test runs in a guest browser context that allows only GET/HEAD to staging and a short list
of static, font and cookie-banner hosts, plus three image paths on S3
(`s3.eu-central-1.amazonaws.com` + `/app-auctions.motory.com/`,
`/v3-auction-common.motory.com/makes/`, `/v3-auction-common.motory.com/supplier-profile/`;
https GET/HEAD only). Redirect hops
are checked against the same rules before the browser follows them. Analytics, Firebase sign-up and tokens, and Firestore
are blocked as expected. Every other request is unexpected: a GET to a host not on the list, any
other method, any request to an API path with server-side effects, and any WebSocket. It is
blocked and logged, the test fails, and the run halts (every later test fails at once). Guest
page views still reach staging as GET traffic.

## Scope (Phase 1)

- In scope: the website **Login** and **Forgot Password** views only (`ui-tests/web/login.ui.spec.ts`):
  login view, password visibility, forgot-password view, navigation back to Login, and an
  observation of what browser Back does from Forgot Password (recorded for product review).
- Display and navigation only. The phone field stays empty; Login and Send are asserted
  disabled and never clicked. The only typing is the approved dummy value `Visual-Check-1` in
  the password field (`ui-tests/support/dummy-input.ts`), to check show/hide.
- Excluded from the run (files kept, not run): home, auctions list, auction group, car details,
  registration and site-chrome specs in `ui-tests/web/`. Also out of scope: Android (until a
  request-monitoring method is approved), and any login, registration, OTP, password-reset or
  account action.
- Localization checks are structural (`lang`/`dir`, raw keys, other-language interface text);
  there is no approved expected text yet. Findings marked `review` need a human decision.
- Layout rules: clipping, truncation, wrapping, overlap, off-screen text, RTL direction and
  drawn images that failed to load. Form geometry: form fits the viewport and controls do not
  overlap (errors); shared edges, label alignment, spacing, tap targets (WCAG 2.2 SC 2.5.8, including its spacing
  exception) and the reading
  direction of field parts (review).
