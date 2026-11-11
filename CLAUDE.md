# CLAUDE.md

Mazad UI test automation: TypeScript + Playwright, strict Page Object Model, data-driven,
multi-language (EN LTR / AR RTL) on Desktop and Mobile. Same architecture and standards as the
Motory project. `README.md` covers setup, commands and environment variables; this file holds the
rules every change must follow.

## Before you commit

- `npm run check` must pass (TypeScript, ESLint, Prettier). Lint enforces several rules below.
- Never run against production. `config/env.config.ts` blocks it; do not work around it.
- Work on a feature branch (`test/<area>`), never directly on `main`.

## Layout and path aliases

| Folder                          | Holds                                                             | Alias          |
| ------------------------------- | ----------------------------------------------------------------- | -------------- |
| `config/`                       | environment loading, credentials (`.env` only)                    | `@config/*`    |
| `src/pages/frontend/`           | customer website page objects; `base/` holds `BasePage`           | `@pages/*`     |
| `src/pages/backend/`            | back-office page objects, one folder per feature (below)          | `@pages/*`     |
| `src/pages/backend/base/`       | `BackendPage`, `BackendListPage` (every Backend page extends one) | `@pages/*`     |
| `src/pages/backend/components/` | reusable parts shared by Backend pages (dialogs, grids)           | `@pages/*`     |
| `src/fixtures/`                 | extended `test`: options, translator, page-object fixtures        | `@fixtures/*`  |
| `src/locales/`                  | `en.ts` / `ar.ts` UI strings                                      | `@locales`     |
| `src/types/`                    | shared types                                                      | `@typings`     |
| `src/utils/`                    | generic helpers, no app knowledge                                 | `@utils/*`     |
| `test-data/`                    | static input data and expected values, one file per feature       | `@test-data/*` |
| `tests/<area>/`                 | specs and assertions only, `<feature>.spec.ts`                    | n/a            |

Always import through the aliases, never with long relative paths.

## Strict Page Object Model

**Page objects (`src/pages/**`)**

- Expose `readonly` locators (assigned in the constructor) and `async` action methods. Nothing else.
- **Never assert.** Importing `expect` in `src/pages` is a lint error. Return values or locators and
  let the test assert.
- No test data inside page objects: values arrive as method parameters.
- Navigation uses paths relative to `baseURL` (`goto()`); never hardcode hosts.
- Locator priority: `data-testid` → role + accessible name → stable id/attribute → CSS.
  Text locators only through `this.t('key')` (website) and never literal English.
- No `page.waitForTimeout()`. Wait on a locator, URL, response or load event.
- Shared behaviour goes up into a base class (`BasePage`, `BackendPage`, `BackendListPage`) or a
  component object, not copied between pages.
- One class per file, named `<feature>.page.ts` / `<Feature>Page`, in the folder of its feature
  (`src/pages/backend/customer-group/customer-group-list.page.ts`). Backend feature folders:
  `auth`, `dashboard`, `auctions`, `suppliers`, `access`, `customer-group`, `taxonomy`,
  `traffic-office`.

**Fixtures (`src/fixtures/**`)**

- Every page object a spec uses is provided as a fixture; specs never call `new SomePage(page)`.
- Register new page objects in the relevant fixture file. Auth/session setup lives in fixtures or
  `*.setup.ts`, never in specs.

**Specs (`tests/**`)**

- Import `test` and `expect` from `@fixtures/...`, never from `@playwright/test` (lint-enforced).
- Specs hold assertions and flow only: no raw locators (`page.locator(...)`) and no selectors.
  If a spec needs one, add it to the page object.
- Use web-first assertions (`await expect(locator).toBeVisible()`), not manual polling.
- Each test is independent and can run alone and in parallel. A test that changes data restores
  it (or uses a `QA-AUTO` prefixed record) and runs with `retries: 0` when a retry is unsafe.
- Group with `test.describe('<Feature> - <area>')`; titles describe behaviour, not steps.
- Wrap meaningful sequences in `test.step()` so reports read as a scenario.

## Data-driven testing

- Inputs and expected values live in `test-data/<feature>.data.ts`, exported `as const`.
- Record where expected messages came from (date, environment) in the data file's doc comment.
- Parameterise with a loop over a data table, giving each case a unique title:

  ```ts
  for (const { name, input, error } of invalidPhoneCases) {
    test(`Rejects ${name}`, { tag: ['@functional', '@negative'] }, async ({ loginPage }) => {
      await loginPage.submitPhone(input);
      await expect(loginPage.phoneError).toHaveText(error);
    });
  }
  ```

- Generated values (unique phones, names) come from helpers in `src/utils`, never `Math.random()`
  inline in a spec.
- No credentials, tokens or personal data in `test-data/`. Secrets come from `.env` only and are
  typed with `fillSecret()` so they never appear in reports.

## Tag conventions

Tags use Playwright's `tag` option (not text in the title) so they filter with `--grep`:

```ts
test('Signs in with valid credentials', { tag: ['@smoke', '@functional'] }, async (...) => {});
test.describe('Supplier List', { tag: '@regression' }, () => {});
```

| Tag                              | Meaning                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `@smoke`                         | Critical path, fast, read-only. Runs on every PR. Keep the set small.        |
| `@functional`                    | Feature behaviour (positive flows, filters, sorting, CRUD).                  |
| `@negative`                      | Validation and error handling (invalid input, permissions).                  |
| `@regression`                    | Full suite membership; applied at `describe` level.                          |
| `@ui`                            | Layout/visual checks: direction, alignment, responsive behaviour.            |
| `@crud`                          | Create/read/update(/delete) flow of a Backend record (pair with `@mutates`). |
| `@mutates`                       | Creates or changes server data; must clean up and must not retry blindly.    |
| `@known-bug`                     | Covers an open defect (pair with `test.fail()` and a ticket reference).      |
| `@desktop-only` / `@mobile-only` | Skips the test on the other device projects.                                 |

Every test carries at least one type tag (`@smoke`, `@functional`, `@negative` or `@ui`).
Run a subset with `npx playwright test --grep @smoke` or exclude with `--grep-invert @mutates`.

## Multi-language (EN LTR / AR RTL)

Applies to the **customer website**. The Backend (back office) has no localization: its specs run
once in the `backend` project, extend `BackendPage`, and keep their UI text in `test-data/`.

- Every website spec runs in both languages through the `en` and `ar` projects. Write one test, not
  one per language.
- Expected text comes from `t('key')` (fixture) or `this.t('key')` (page object). Never compare
  against a literal string in either language.
- Add each new key to `src/locales/en.ts` **and** `ar.ts`; `ar.ts` is type-checked against `en.ts`,
  so a missing Arabic key fails `npm run typecheck`.
- Direction: assert `dir` (`ltr` / `rtl`, from `LANGUAGES[language].dir`) on `<html>` for each page
  type. Do not assert left/right positions directly; compare against the expected direction.
- Arabic numbers may render as Eastern Arabic numerals (١٢٣). Normalise with a `src/utils` helper
  before comparing numbers, prices (SAR) or dates.
- Locale is `en-SA` / `ar-SA`, timezone `Asia/Riyadh`; do not override them per test.
- Language switching goes through `BasePage.open()` / `applyLanguage()` only.

## Desktop and Mobile

- Target matrix: `{en, ar} × {Desktop Chrome, Pixel 7}` for the website; the Backend runs on
  Desktop Chrome only.
- Page objects stay device-agnostic. Where mobile differs (hamburger menu, bottom sheets), expose a
  single action (`openMenu()`) that handles both, using `this.page.viewportSize()` or an `isMobile`
  option, rather than separate mobile page objects.
- Use `@desktop-only` / `@mobile-only` tags instead of `if (isMobile) test.skip()` scattered in specs.

## Sensitive data in reports

Signed-in Backend specs turn off trace and video and attach a masked failure screenshot instead,
because those artifacts capture the account header. Keep that pattern for any spec signed in with a
real account. Saved sessions (`.auth/`) are live cookies and must stay gitignored.
