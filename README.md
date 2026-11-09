# Mazad UI Automation

Playwright + TypeScript test automation for Mazad, using the Page Object Model.

## Setup

```bash
npm install
npx playwright install chromium
```

Before running tests, set `TEST_ENV` to an approved staging environment (currently `stg-154`). Runs stop with an error until it is set; there is no default.

## Running tests

| Command                               | What it does                                                   |
| ------------------------------------- | -------------------------------------------------------------- |
| `npm test`                            | All tests (website in English and Arabic, back office), headed |
| `npm run test:en` / `npm run test:ar` | Customer website, one language only                            |
| `npm run test:backend`                | Back office only                                               |
| `npm run test:integration`            | App API and cross-system checks (back office, API, ERP)        |
| `npm run test:android`                | Mazad Android app through Appium (see Mobile below)            |
| `npm run test:headless`               | All tests, headless                                            |
| `TEST_ENV=stg-154 npm test`           | Use the approved staging environment `stg-154` (no default)    |

Local overrides go in `.env` (copy `.env.example`). Supported variables:

- `TEST_ENV`: approved staging environment id (required; a file `config/environments/<id>.json`)
- `BASE_URL` / `ERP_URL`: optional; may only repeat the selected environment's approved URLs
- `HEADLESS`: `true` to run headless
- `CI`: `true` for headless, 2 retries, 1 worker, and `test.only` is rejected

Local runs use 2 parallel workers.

### Staging only (production permanently blocked)

All automation (website, back office, Android, iOS) runs against approved staging environments only:

- Each approved environment is one reviewed file, `config/environments/<id>.json` (`baseURL`, optional `erpURL` with `erpStatus`). Adding a file is the only way to approve another staging environment; switching is explicit with `TEST_ENV=<id>`.
- Production cannot be enabled: there is no override flag, `TEST_ENV` names containing `prod` (or `live`, `prd`) are refused, and blocked hosts (`config/staging-environments.ts`) are refused anywhere.
- `BASE_URL` / `ERP_URL` must equal the approved origins exactly; other hosts, IP addresses, schemes, ports, credentials and paths are refused.
- iOS: every approved build is tied to one environment (`TEST_ENV` must match), and the app's stored backend setting is checked before and after a device run. That is the stored setting only: it does not prove which server the app contacts.

Still unverified (do not assume they cannot change the app's backend): Firebase Remote Config, DebugSwift, deep links and push notifications.

## Reports

| Command                                          | Output                                               |
| ------------------------------------------------ | ---------------------------------------------------- |
| `npx playwright show-report`                     | Playwright HTML report (`playwright-report/`)        |
| `npm run allure:generate && npm run allure:open` | Allure report from `allure-results/` (Java required) |

JUnit XML is written to `reports/junit.xml` for CI.

## Project layout

```
config/
  environments/     one JSON file per APPROVED staging environment (baseURL, no secrets)
  staging-environments.ts  staging-only rules: selection, blocked names and hosts
  env.config.ts     loads the selected environment (TEST_ENV, required)
  credentials.config.ts  test accounts, read from .env only and redacted when printed
src/
  api/              API service classes: Mazad app API (guest reads), ERP (read-only)
  mobile/           Appium session and Android screen objects (no assertions)
  pages/            page objects: locators and actions only (extend BasePage / BackendPage)
  fixtures/         extended `test`: page objects, back office session, API/ERP clients; mobile.fixture.ts for the app
  locales/          en.ts / ar.ts UI strings; ar.ts is type-checked against en.ts
  types/            shared types
  utils/            generic helpers
test-data/          static test input data
tests/              specs and assertions, grouped by feature
```

## Conventions

- **Saudi market only.** Browser locales are `ar-SA` and `en-SA`, the timezone is `Asia/Riyadh`, and prices are in SAR. Arabic pages may show Eastern Arabic numerals (١٢٣).
- **One test, two languages.** Each spec runs in the `en` and `ar` projects. Use `t('key')` from the fixture for expected text, never literal strings.
- **Page objects** expose locators and actions. They never assert: importing `expect` in `src/pages` is a lint error.
- **Locators** prefer language-neutral attributes (`data-testid`, roles, ids). Where text is unavoidable, use `this.t('key')`.
- **Navigation** uses paths relative to `baseURL`. Never hardcode URLs.
- Import `test` and `expect` from `@fixtures/test.fixture`, not from `@playwright/test`. This is enforced by lint in `tests/`.
- Before committing: `npm run check` (TypeScript, ESLint, Prettier).
- Node version: see `.nvmrc` (Node 24).

## Backend (back office)

Login tests for the back office live in `tests/backend/`, with page objects in `src/pages/backend/`.

- **No localization.** The Backend has no Arabic UI or language switch. Its specs run once, in their own `backend` project (`npm run test:backend`), not in the `en`/`ar` language projects. Backend page objects extend `BackendPage`, which has no language or translator, and their UI text lives in `test-data/backend-login.data.ts` rather than `src/locales`.
- **Credentials** come from `.env` only (`DEV_ROOT_PHONE`, `DEV_ROOT_PASSWORD`; see `.env.example`). Without them, the Dev Root tests are skipped.
- **Keeping credentials out of output.** Credentials are entered with `fillSecret()`, so report steps never show them. The Dev Root spec records no trace or video and masks credential fields in failure screenshots. Playwright's failure page snapshot (`error-context.md`) is turned off in `playwright.config.ts`.
- **One wrong-password attempt per execution**, to avoid locking the account: the test runs once and never retries.

## Sold List across systems

The Sold flow is checked in three places, each with its own project:

- **Back office** (`tests/backend/sold-list.spec.ts`): the Sold List page, its search, filters, pagination and vehicle link. Runs signed in as Dev Root in a read-only session: every request that is not a GET (except logout) is blocked, and row actions such as "Failed" are never used.
- **App API and cross-system** (`tests/integration/`): the guest API behind the app's My Bids and Auctions tabs, in English and Arabic, and a check that follows recent sold vehicles through the back office, the API and the ERP (Mazad Car, sales and commission invoices, sales order). Mismatches name the system, e.g. `[ERP] selling price …`. Set `MAZAD_SOLD_AUCTION_ID` to follow one auction. A JSON record of the IDs and amounts compared (no personal data) is attached to the report.
- **Android app** (`tests/mobile/android/`): Home, Bids, Actions and Notifications, in English and Arabic, with expected text taken from the API's configuration where it exists.

Nothing in these suites creates, edits or deletes data. The ERP client can only read (and log in and out). Known application defects are marked with `test.fail` and a description, so they show as expected failures until they are fixed.

## Mobile (Android)

- Needs an Android device or emulator with the Mazad staging app installed (`com.app.motory.dealer.staging`), and an Appium 3 server with the UiAutomator2 driver.
- Set `APPIUM_URL` in `.env` (default `http://127.0.0.1:4723`). If Appium is not reachable, the mobile tests are skipped with that reason rather than failed.
- The app is started with `noReset`: nothing is reinstalled or cleared. The specs switch the app language themselves (More → Language).
- Logged-in checks need a buyer account (`MAZAD_BUYER_PHONE`, `MAZAD_BUYER_PASSWORD`); without one they are skipped.
- One device per run: the mobile spec runs in serial mode.

### Emulator and NetBird

Staging is reachable only through the NetBird VPN. NetBird's DNS resolves the staging host to an internal IP, while public DNS returns an endpoint that rejects the request (403). The Android emulator does not use NetBird's DNS on its own, so start it with:

```bash
npm run emulator:start   # NetBird connected first
npm run emulator:check   # any time, e.g. before npm run test:android
```

- `emulator:start` finds NetBird's DNS server (from `scutil --dns`) and checks that it resolves staging to an internal IP and also resolves public names. It then launches the AVD in a window, cold-booted with `-dns-server <NetBird DNS> -no-snapshot-load -no-snapshot-save`, so saved snapshots and AVD settings are never changed. If the AVD is already running, it is not relaunched; it is checked instead.
- By default (`EMULATOR_DNS_MODE=require`) nothing is launched when NetBird DNS cannot be verified. Set `ANDROID_AVD` and `EMULATOR_DNS_MODE` in `.env` (see `.env.example`). The log is written to `reports/emulator-<AVD>.log`.
- `emulator:check` is read-only. It compares how the Mac and the emulator resolve the staging host and checks the emulator clock.
- If NetBird disconnects while the emulator runs, the emulator loses all DNS. Reconnect NetBird, or restart the emulator (`adb -s <serial> emu kill`, then `npm run emulator:start`).
- An emulator started from Android Studio's Device Manager does not use NetBird DNS. When the Mac reaches staging through the VPN but the device resolves it to the public endpoint, the Android tests are skipped with that reason instead of failing.

## UI design and localization (website)

A separate, guest-only layer for visual regression, text layout and localization checks of the
Mazad website, in English and Arabic. It has its own config (`playwright.ui.config.ts`) and specs
(`ui-tests/`), and never runs with the functional tests. Full details: `visual-baselines/README.md`.

| Command                                                                | What it does                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run ui:selfcheck`                                                 | Tests the layer's own guards (local pages only, no staging)  |
| `npm run ui:check`                                                     | Compares against approved baselines; never writes them       |
| `npm run ui:capture`                                                   | Writes candidates to `visual-baselines/candidates/<run-id>/` |
| `VISUAL_BASE_RUN=<run-id> npm run ui:noise`                            | Compares a new run against a capture run, to measure noise   |
| `npm run ui:approve -- --run <run-id> <project>/<platform>/<file>.png` | Copies named candidates into `approved/` (interactive only)  |
| `npm run ui:report -- reports/ui/<run>/html`                           | Opens a UI run's HTML report                                 |

UI output goes only to `reports/ui/<run>/`, so functional reports are never touched.

## Pending

- Logged-in app checks (My Bids → Won, My Actions for a won car) need a buyer test account with a won auction.
- iOS needs a staging build of the app; the device has the production app.

- `BasePage.applyLanguage()` is a placeholder until the Mazad language-switch mechanism is confirmed.
- `dev` and `prod` `baseURL` values are empty until those Mazad URLs are available. `staging` is set.
- Confirm Mazad handles the `en-SA` locale. If not, switch the English browser locale to `en-US` in `src/locales/index.ts`.
