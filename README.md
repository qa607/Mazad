# Mazad UI Automation

Playwright + TypeScript test automation for Mazad, using the Page Object Model.

## Setup

```bash
npm install
npx playwright install chromium
```

Before running tests, set `baseURL` in `config/environments/<env>.json`. Runs stop with an error until the selected environment has a valid URL.

## Running tests

| Command                               | What it does                                                   |
| ------------------------------------- | -------------------------------------------------------------- |
| `npm test`                            | All tests (website in English and Arabic, back office), headed |
| `npm run test:en` / `npm run test:ar` | Customer website, one language only                            |
| `npm run test:backend`                | Back office only                                               |
| `npm run test:headless`               | All tests, headless                                            |
| `TEST_ENV=staging npm test`           | Use `config/environments/staging.json` (default: `dev`)        |

Local overrides go in `.env` (copy `.env.example`). Supported variables:

- `TEST_ENV`: environment name
- `BASE_URL`: overrides the file's `baseURL`
- `HEADLESS`: `true` to run headless
- `SLOW_MO`: milliseconds to pause before each browser action, to watch a headed run (e.g. `SLOW_MO=700 npx playwright test <spec> --workers=1 --headed`)
- `CI`: `true` for headless, 2 retries, 1 worker, and `test.only` is rejected

Local runs use 2 parallel workers.

### Production protection

Runs against production are blocked, both by `TEST_ENV=prod` and by any `BASE_URL` whose host matches `prod.json`. To run intentionally, pass the flag on the command line for that run:

```bash
ALLOW_PRODUCTION=true TEST_ENV=prod npm test
```

`ALLOW_PRODUCTION` is ignored in `.env` files, so production can't be left unlocked by accident.

## Reports

| Command                                          | Output                                               |
| ------------------------------------------------ | ---------------------------------------------------- |
| `npx playwright show-report`                     | Playwright HTML report (`playwright-report/`)        |
| `npm run allure:generate && npm run allure:open` | Allure report from `allure-results/` (Java required) |

JUnit XML is written to `reports/junit.xml` for CI.

## Project layout

```
config/
  environments/     one JSON file per environment (baseURL, no secrets)
  env.config.ts     loads and validates the selected environment
src/
  pages/            page objects: locators and actions only (extend BasePage)
  fixtures/         extended `test` providing language, translator and page objects
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
- **Sign in once per run.** The `backend-setup` project (`tests/backend/auth.setup.ts`) logs in as Dev Root once and saves the session to `.auth/dev-root.json` (gitignored: it is a live session cookie). The `backend` project depends on it, so it runs first automatically, even when you run a single spec. Specs that only need to be signed in use `test.use({ signedInAs: 'devRoot' })`. The login specs keep starting signed out, since they test the login itself.
- **Suspended Vehicles** (`tests/backend/suspended-vehicles.spec.ts`, `/backend/auction/suspend/index`): read-only checks of the grid, search, filters, reset, paging and the activate confirmation, plus one round-trip test (no retries): it activates a suspended vehicle from the "Requested by Supplie" reason group, checks that it moved to **Ready For Pricing**, then suspends it again with the same reason, so staging ends as it started. If the test fails midway, its `afterEach` re-suspends the vehicle. Vehicles suspended for "Inactive supplier" cannot be activated. The file's tests run in order in one worker so the activation never races the read-only checks.
- **Ready For Pricing** (`tests/backend/ready-for-pricing.spec.ts`, `/backend/auction/ready-for-pricing/index`): read-only checks of the grid, VIN/title search, city and year filters, year sorting, reset, paging, bulk Suspend and the suspend modal validation, plus a round trip (no retries) that suspends the oldest vehicle with "The car is pending to be sold", checks it in the Suspended list, then activates it back into Ready For Pricing. Both list page objects share `BackendListPage`.
- **Pricing Done** (`tests/backend/pricing-done.spec.ts`, `/backend/auction/pricing-done/index`): read-only checks of the grid and row actions, VIN (full and partial), title and starting-price search, make/model (Model stays disabled until a make is chosen), year, supplier, auction type and status filters, reset, Starting Price sorting, paging, bulk selection and select-all, the View/Update links, the suspend modal validation and cancelling "Move to upcoming". Nothing is submitted, so the file changes no data. Known bug (`test.fail()`): a non-numeric Starting Price filter (e.g. `abc`) is treated as 0 and lists the unpriced vehicles instead of none.
- **Upcoming** (`tests/backend/upcoming.spec.ts`, `/backend/auction/upcoming/index`): read-only checks of the grid, toolbar and row actions, VIN (full and partial) and title search, make/model, year, supplier and type filters, reset, Starting Price sorting, bulk selection and select-all, the View/Update links, the suspend modal validation, cancelling "Back to pricing done", closing "Add to Auction", and the Create Auction wizard (opens at its configuration step; Next with empty fields shows the 3 required-field errors and sends nothing). Rows are keyed by upcoming-item ID, not vehicle ID (`UpcomingPage.rowVehicleId()` gives the vehicle). Pricing Done and Upcoming share `AuctionListPage`. Known bug (`test.fail()`): the Title filter matches nothing, whatever is typed.
- **Running the specs together:** each round trip uses its own reason group, and the read-only tests avoid comparing list totals, so the two specs can run in parallel.
- **Create Auction** (`tests/backend/create-auction.spec.ts`, `/backend/auction/upcoming/create`): the two-step wizard. Step 1: opens with Select Cars locked, required-field errors on an empty Next, Featured Auction shows its extra settings, the calendar fills dates as yyyy-mm-dd, Cancel returns to Upcoming. Step 2: asks for a supplier when none is chosen, lists the chosen supplier's priced upcoming vehicles (taken from the Upcoming list at run time), VIN filter and Reset, Select All, Car Source Upcoming/Failed, Back to Configuration keeps the entries, and Create Auction with no vehicle selected is refused, and titles over 45 characters are refused. One round-trip test really creates an auction with one vehicle (starting two months ahead) and moves the vehicle back to Upcoming. Known gap (`test.fail()`): step 1 accepts an end date before the start date.
- **Auction lifecycle, real live auction** (`tests/backend/auction-live.spec.ts`): moves a priced Pricing Done vehicle to Upcoming, creates an auction starting three minutes later, and follows it through Awaiting, Live and, with no bids, Failed. Wizard auctions are Price Offering, which has no Auto Extend switch, so it ends exactly on time. **Each run permanently uses up one Pricing Done vehicle** (it ends in Failed with a `#F` mark) and is visible to staging customers for three minutes, so it is skipped unless asked for: `RUN_LIVE_AUCTION=true npx playwright test tests/backend/auction-live.spec.ts --project=backend` (about 7 minutes, never retried). If it fails before going live, it returns the vehicle to Pricing Done.
- **Permissions** (`tests/backend/permissions.spec.ts`): for each role, checks which of Ready For Pricing, Pricing Done, Upcoming and Suspended Vehicles it can open (HTTP 200, or 403 when denied), that the sidebar links only to those, and that the server accepts or rejects (403) the Suspend, Move to upcoming, Back to pricing done, Create auction and Activate requests. The requests use a non-existent ID or an empty form, so nothing changes on staging. The two irreversible deletes on the Suspended list (bulk delete, delete vehicle) are only sent for roles that must be refused, never for allowed ones. The expected access per role lives in `test-data/backend-permissions.data.ts`, taken from the roles' permission pages on 2026-11-08; entries marked "To confirm" need a business decision.
  - **Role accounts:** Dev Root (role `root`) always runs. Each other role needs its own staging account with only that role, set in `.env` as `ROLE_<NAME>_PHONE` / `ROLE_<NAME>_PASSWORD` (see `.env.example`). `backend-setup` signs in once per configured role and saves the session to `.auth/role-<name>.json`; roles with no account are skipped. Specs use `test.use({ signedInAs: '<role>' })`.
- **Known bug (Suspended, Ready For Pricing, Pricing Done):** the default order is unstable, so some vehicles repeat across pages and others never appear. The tests for it are marked `test.fail()`; remove that once the bug is fixed.

## Pending

- `BasePage.applyLanguage()` is a placeholder until the Mazad language-switch mechanism is confirmed.
- `dev` and `prod` `baseURL` values are empty until those Mazad URLs are available. `staging` is set.
- Confirm Mazad handles the `en-SA` locale. If not, switch the English browser locale to `en-US` in `src/locales/index.ts`.
