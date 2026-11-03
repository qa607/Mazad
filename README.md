# Mazad UI Automation

Playwright + TypeScript test automation for Mazad, using the Page Object Model.

## Setup

```bash
npm install
npx playwright install chromium
```

Before running tests, set `baseURL` in `config/environments/<env>.json`. Runs stop with an error until the selected environment has a valid URL.

## Running tests

| Command                               | What it does                                            |
| ------------------------------------- | ------------------------------------------------------- |
| `npm test`                            | All tests, English and Arabic, headed                   |
| `npm run test:en` / `npm run test:ar` | One language only                                       |
| `npm run test:headless`               | All tests, headless                                     |
| `TEST_ENV=staging npm test`           | Use `config/environments/staging.json` (default: `dev`) |

Local overrides go in `.env` (copy `.env.example`). Supported variables:

- `TEST_ENV`: environment name
- `BASE_URL`: overrides the file's `baseURL`
- `HEADLESS`: `true` to run headless
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

- **English only.** The Backend ignores the browser locale and has no language switch, so its expected text is in `test-data/backend-login.data.ts` rather than `src/locales`. Its specs still run in both language projects.
- **Credentials** come from `.env` only (`DEV_ROOT_PHONE`, `DEV_ROOT_PASSWORD`; see `.env.example`). Without them, the Dev Root tests are skipped.
- **Keeping credentials out of output.** Credentials are entered with `fillSecret()`, so report steps never show them. The Dev Root spec records no trace or video and masks credential fields in failure screenshots. Playwright's failure page snapshot (`error-context.md`) is turned off in `playwright.config.ts`.
- **One wrong-password attempt per execution**, to avoid locking the account. It runs in the `en` project only (set `WRONG_PASSWORD_LANGUAGE=ar` to switch) and never retries.

## Pending

- `BasePage.applyLanguage()` is a placeholder until the Mazad language-switch mechanism is confirmed.
- `dev` and `prod` `baseURL` values are empty until those Mazad URLs are available. `staging` is set.
- Confirm Mazad handles the `en-SA` locale. If not, switch the English browser locale to `en-US` in `src/locales/index.ts`.
