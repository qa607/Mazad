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
- `SLOW_MO`: milliseconds to pause before each browser action, to watch a headed run (e.g. `SLOW_MO=700 npx playwright test <spec> --workers=1 --headed`)
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

| Command                                          | Output                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `npx playwright show-report`                     | Playwright HTML report (`playwright-report/`)                                |
| `npm run allure:generate && npm run allure:open` | Allure report from `allure-results/` (Java required)                         |
| `npm run allure:clean`                           | Delete old `allure-results/` before a run, so the report shows only that run |
| `npm run test:customer-group`                    | Run only the Customer Group specs (signs in first)                           |

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
  mobile/           Appium session and Android/iOS screen objects (no assertions)
  pages/            page objects: locators and actions only
    frontend/base/  BasePage for the customer website
    website/        customer-website page objects (login, ...)
    backend/        BackendPage and BackendListPage in base/, shared parts in components/,
                    then one folder per feature (auth, suppliers, customer-group, ...)
  fixtures/         extended `test`: page objects, back office session, API/ERP clients;
                    mobile.fixture.ts / ios.fixture.ts / website.fixture.ts for the app and website
  locales/          en.ts / ar.ts UI strings; ar.ts is type-checked against en.ts
  types/            shared types
  utils/            generic helpers
test-data/          static test input data
tests/              specs and assertions: tests/backend/<feature>.spec.ts
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

Back-office specs live in `tests/backend/` (one `<feature>.spec.ts` each), with page objects in `src/pages/backend/<feature>/` and the shared base classes in `src/pages/backend/base/`.

- **No localization.** The Backend has no Arabic UI or language switch. Its specs run once, in their own `backend` project (`npm run test:backend`), not in the `en`/`ar` language projects. Backend page objects extend `BackendPage`, which has no language or translator, and their UI text lives in `test-data/backend-login.data.ts` rather than `src/locales`.
- **Credentials** come from `.env` only (`DEV_ROOT_PHONE`, `DEV_ROOT_PASSWORD`; see `.env.example`). Without them, the Dev Root tests are skipped.
- **Keeping credentials out of output.** Credentials are entered with `fillSecret()`, so report steps never show them. The Dev Root spec records no trace or video and masks credential fields in failure screenshots. Playwright's failure page snapshot (`error-context.md`) is turned off in `playwright.config.ts`.
- **One wrong-password attempt per execution**, to avoid locking the account: the test runs once and never retries.
- **Sign in once per run.** The `backend-setup` project (`tests/backend/auth.setup.ts`) logs in as Dev Root once and saves the session to `.auth/dev-root.json` (gitignored: it is a live session cookie). The `backend` project depends on it, so it runs first automatically, even when you run a single spec. Specs that only need to be signed in use `test.use(devRootSession)` from `@fixtures/test.fixture`: it signs in through the saved session and turns off trace, video and automatic screenshots, and the automatic `maskedFailureScreenshot` fixture then attaches a failure screenshot with account details masked. The login specs keep starting signed out, since they test the login itself; a `describe` can switch back with `test.use({ signedInAs: 'none' })`.
- **Page objects in specs** always come from fixtures. For a tab opened by a row action, use the `pagesOn(tab)` fixture (e.g. `pagesOn(tab).supplierViewPage`).
- **Suspended Vehicles** (`tests/backend/suspended-vehicles.spec.ts`, `/backend/auction/suspend/index`): read-only checks of the grid, search, filters, reset, paging and the activate confirmation, plus one round-trip test (no retries): it activates a suspended vehicle from the "Requested by Supplie" reason group, checks that it moved to **Ready For Pricing**, then suspends it again with the same reason, so staging ends as it started. If the test fails midway, its `afterEach` re-suspends the vehicle. Vehicles suspended for "Inactive supplier" cannot be activated. The file's tests run in order in one worker so the activation never races the read-only checks.
- **Ready For Pricing** (`tests/backend/ready-for-pricing.spec.ts`, `/backend/auction/ready-for-pricing/index`): read-only checks of the grid, VIN/title search, city and year filters, year sorting, reset, paging, bulk Suspend and the suspend modal validation, plus a round trip (no retries) that suspends the oldest vehicle with "The car is pending to be sold", checks it in the Suspended list, then activates it back into Ready For Pricing. Both list page objects share `BackendListPage`.
- **Pricing Done** (`tests/backend/pricing-done.spec.ts`, `/backend/auction/pricing-done/index`): read-only checks of the grid and row actions, VIN (full and partial), title and starting-price search, make/model (Model stays disabled until a make is chosen), year, supplier, auction type and status filters, reset, Starting Price sorting, paging, bulk selection and select-all, the View/Update links, the suspend modal validation and cancelling "Move to upcoming". Nothing is submitted, so the file changes no data. Known bug (`test.fail()`): a non-numeric Starting Price filter (e.g. `abc`) is treated as 0 and lists the unpriced vehicles instead of none.
- **Upcoming** (`tests/backend/upcoming.spec.ts`, `/backend/auction/upcoming/index`): read-only checks of the grid, toolbar and row actions, VIN (full and partial) and title search, make/model, year, supplier and type filters, reset, Starting Price sorting, bulk selection and select-all, the View/Update links, the suspend modal validation, cancelling "Back to pricing done", closing "Add to Auction", and the Create Auction wizard (opens at its configuration step; Next with empty fields shows the 3 required-field errors and sends nothing). Rows are keyed by upcoming-item ID, not vehicle ID (`UpcomingPage.rowVehicleId()` gives the vehicle). Pricing Done and Upcoming share `AuctionListPage`. Known bug (`test.fail()`): the Title filter matches nothing, whatever is typed.
- **Running the specs together:** each round trip uses its own reason group, and the read-only tests avoid comparing list totals, so the two specs can run in parallel.
- **Create Auction** (`tests/backend/create-auction.spec.ts`, `/backend/auction/upcoming/create`): the two-step wizard. Step 1: opens with Select Cars locked, required-field errors on an empty Next, Featured Auction shows its extra settings, the calendar fills dates as yyyy-mm-dd, Cancel returns to Upcoming. Step 2: asks for a supplier when none is chosen, lists the chosen supplier's priced upcoming vehicles (taken from the Upcoming list at run time), VIN filter and Reset, Select All, Car Source Upcoming/Failed, Back to Configuration keeps the entries, and Create Auction with no vehicle selected is refused, and titles over 45 characters are refused. One round-trip test really creates an auction with one vehicle (starting two months ahead) and moves the vehicle back to Upcoming. Another sets the vehicle's supplier to Price Offering (Update Supplier, Auction Info tab), checks the new auction takes that bidding type, then moves the vehicle back and restores the supplier: an auction's bidding type comes from its supplier, not from the wizard. Known gap (`test.fail()`): step 1 accepts an end date before the start date.
- **Auction lifecycle, real live auction** (`tests/backend/auction-live.spec.ts`): sets the vehicle's supplier to Price Offering (restored right after the auction is created), moves a priced Pricing Done vehicle to Upcoming, creates an auction starting three minutes later, and follows it through Awaiting, Live and, with no bids, Failed. Price Offering auctions have no Auto Extend switch, so it ends exactly on time. **Each run permanently uses up one Pricing Done vehicle** (it ends in Failed with a `#F` mark) and is visible to staging customers for three minutes, so it is skipped unless asked for: `RUN_LIVE_AUCTION=true npx playwright test tests/backend/auction-live.spec.ts --project=backend` (about 7 minutes, never retried). If it fails before going live, it returns the vehicle to Pricing Done.
- **Live Auctions** (`tests/backend/live.spec.ts`, `/backend/auction/live/index`): read-only, since the rows are real running auctions created by other people. Grid and View on every row, VIN (full and partial) and unknown VIN, Title (it searches the vehicle title, not the auction title), Bidding Type and Auction Type filters, supplier filter, Reset (it reloads only the grid, via PJAX), the Auto Extend switch on Standard auctions only, and the Disable, Bidders, owner, price, update-auction and Extend Auction dialogs, each opened and closed with nothing sent. Values come from the rows live at run time, so at least one live auction is needed.
- **Waiting Approval** (`tests/backend/waiting-approval.spec.ts`, `/backend/auction/waiting-approval/index`, titled "Under Review Auctions"): read-only, since the rows are real auctions waiting for a decision. Grid and the Accept/Decline/Failed/bidders actions on every row, VIN (full, partial, unknown), Title (vehicle title), Bidding Type, auction and supplier filters, Reset, sorting by total bids, the Accept and Decline confirmations (they repeat the row's net prices with and without VAT), the Failed penalty dialog and the Bidding Details dialog, each opened and closed with nothing sent, and the vehicle and failure-mark links (a vehicle under review opens read-only: its edit link redirects to View). Values come from the rows listed at run time, so at least one auction under review is needed.
- **Supplier price columns** (`tests/backend/supplier-prices.spec.ts`): signed in as a supplier's own account (role supplierAdmin, `SUPPLIER_PHONE` / `SUPPLIER_PASSWORD` in `.env`, also signed in once per run as the `supplier` role). Checks the exact columns of Ready For Pricing, Pricing Done, Upcoming and Awaiting: the supplier sees **Supplier Price** where staff see **Reserve Price** and **Commission**, and the prices both see (Starting Price, Buy Now, Starting Bid, Min Increment) match Dev Root's for the same vehicle. Live and Waiting Approval rows must show no reserve price, commission or fees; Suspended, Failed, Sold and Delivered answer 403; the supplier's Auctions menu has six lists. Read-only. Value checks are skipped when the supplier has no vehicle in that list.
- **Auction Closed report** (`tests/backend/auction-closed-report.spec.ts`, `/backend/report/auction-closed-report/index`, Report > Auction Closed): read-only. Grid and headers; on every auction of the first page the counts add up (Items = Sold + Failed, No Bid ≤ Failed, Views and Viewers = Before + During, Viewers ≤ Views, Bidders ≤ Bids); the QA live-test auctions show Item 1, Failed 1, No Bid 1 and no bids; auction title, supplier and start/end date-range filters; Reset; paging; and the CSV export (same 17 columns, one line per auction, first line equal to the first row). Known bug (`test.fail()`): some auctions show an end date before their start date. The auction-specific tests are skipped when no QA live-test auction is on the first page.
- **Purchase Survey report** (`tests/backend/purchase-survey-report.spec.ts`, `/backend/report/purchase-survey-report/index`, Report > Purchase Survey): read-only. Grid and headers; every survey on the first page has its three scores within their scales (ease of use and satisfaction out of 7, recommend out of 10) and the list is newest first; Customer Type (Individual + Dealer = all), supplier, item title, customer name, question score range and "Other" filters; the score-range validation (an inverted range is refused before searching); Reset; paging. Known gaps (`test.fail()`): "abc" as a score is reported as "cannot be blank", and the CSV export answers HTTP 500. Item titles are stored with double spaces, so the title filter types the first words and picks the full match.
- **Supplier Vehicle report** (`tests/backend/supplier-vehicle-report.spec.ts`, `/backend/report/supplier-vehicle-report/index`, Report > Supplier Vehicle): read-only. Grid and headers (Supplier Status starts on Active); for every active supplier Count Auction and Count Inspection are the sums of their stages; for the supplier with the most vehicles, the Ready For Pricing, Pricing Done, Upcoming, Awaiting, Failed and Suspended counts equal those lists' totals filtered to that supplier; Supplier Status (All = Active + Inactive), Have Inspection, Have Auction and supplier filters; Count All sorting; CSV export (18 columns, one line per supplier, first line equal to the first row). Known bugs (`test.fail()`): Count All is above Auction + Inspection + Suspended for some suppliers, and the Live count is above the Live list's.
- **Vehicles report** (`tests/backend/vehicles-report.spec.ts`, `/backend/report/item-report/index`, Report > Vehicles): grid and headers; every listed vehicle entered at least one auction; sold vehicles list Customer Commission, Administrative Fees and Supplier Commission; the auction-live test vehicle shows Count Auction 2, unsold; VIN (full, part, unknown), plate, title, make, year and supplier filters; Reset; Count Auction sorting; Excel export after a search (one vehicle, so the export stays small). Known bugs (`test.fail()`): Export from a report opened with one filter in its address answers HTTP 500 with the server's file path and stack trace; and **exported files are public**: `/backend/export/vehicle-report-<date>.xlsx` answers HTTP 200 to a signed-out request. Never export with no filter at all here: it builds a file of every vehicle.
- **Request Mojaz report** (`tests/backend/mojaz-request-report.spec.ts`, `/backend/report/mojaz-request/index`, Report > Request Mojaz): read-only; the grid holds customer names and phones, which never appear in test titles. Each status (Pending, Generated, Not Found, Failed) lists only itself and together they cover all requests; Generated requests link both PDF reports (S3, opening as `application/pdf`), Pending and Failed link none; phones are 10-digit Saudi mobiles; Updated At is never before Creation Date; VIN (full, part, unknown), customer phone, customer name and creation-date filters; Reset; sorting by both dates; CSV export (one line per request).
- **Report permissions** (`tests/backend/report-permissions.spec.ts`): for each role (root, Auction Supervisor, Customer Support, Auction Team, operation, Marketing, supplier), which of the 8 Report pages it can open (200, or 403 when denied) and that the sidebar's Report menu lists exactly those. For the supplier, each report it opens (Sales, Failed, Auction Closed) lists as many rows as Dev Root sees for that supplier, and another supplier's ID in the address changes nothing. Expected access lives in `test-data/backend-report-permissions.data.ts`. Known gap (`test.fail()`): the supplier's Supplier filter lists every other supplier's name.
- **Car Cancellations** (`tests/backend/car-cancellation.spec.ts`, `/backend/requestCancellation/car-cancellation/index`, Request Cancellation > Car): read-only; no request's status is ever changed (Approve on a car moves the vehicle to Failed). Pending + Approve + Decline cover every request; a decided request's status is locked; a declined request leaves the vehicle sold; newest first; Updated At never before the request date; request ID, VIN, title, customer type (Individual + Dealer = all), supplier and reason filters; Reset; sorting; customer and vehicle links. Permissions per role: who opens the page, the sidebar link, and the server refusing the decision and Move-to-Failed requests (sent only to roles that must be refused, with a non-existent ID). Known gap (`test.fail()`): "Other" reasons show "(not set)". To confirm: Auction Team cannot open the page, yet its role allows the decision request.
- **Contact us** (`tests/backend/contact-us.spec.ts`, `/backend/contactUs/contact-us/index`, Global Settings > Contact us): read-only; a delete is only opened and cancelled (its confirmation is a page dialog, not a browser one). Contact Us + Sell On Mazad cover every message; Sell On Mazad messages name a company and Contact Us ones do not; newest first; every message has an email, View and Delete; ID, phone, email, name and company filters; Reset; sorting; View shows the message; the CSV export holds one record per message, read with `parseCsv` since messages contain line breaks. Permissions per role: who lists and views messages, the sidebar link, Delete hidden where not allowed, and the server refusing a delete (sent only to accounts that must be refused, with ID 0). No role grants delete on its own; Dev Root's comes with its account.
- **Advertisements** (`tests/backend/advertisement.spec.ts`, `/backend/advertisement/advertisement/index`, Content > Advertisement): read-only; the Is Published switch is never touched (it changes what customers see), Update is opened without saving, and Create is only submitted empty (the server refuses it, so nothing is created). Every ad has View, Update and a publish switch; Updated At never before Created At; ID, title and platform filters (Both + Mobile + Web = all); Reset; Click Count sorting; View matches the list; Update opens filled in; Create lists the 10 required fields. Permissions per role: the list, View, Update and Create pages, the sidebar link, and the server refusing the publish request (sent only to roles that must be refused, with ID 0). Known (`test.fail()`): an ad's end date is `0000-00-00`; the Platform filter lists "All" twice. To confirm: Marketing has no access to advertisements.
- **Confirm Delivery Survey** (`tests/backend/confirm-delivery-survey.spec.ts`, `/backend/survey/confirm-delivery-survey/index`, Survey > Confirm Delivery): read-only; Update is opened without saving and Add Question is only submitted while invalid (blocked in the browser, nothing sent). Every question has View and Update (no Delete), both languages and a valid answer scale; at least one is active; Arabic/English filters, case-insensitive, no results, Reset; sortable headers, ID and To sorting; View and Update match the list; required fields and invalid scales (letters, decimal, From above 1, To below 3, negative); Cancel adds nothing. Permissions per role: the list, View, Update and Add Question pages, the sidebar link, and the server refusing create/update (empty form and ID 0, sent only to refused roles). To confirm: only Dev Root can manage the questions.
- **Permissions** (`tests/backend/permissions.spec.ts`): for each role, checks which of Ready For Pricing, Pricing Done, Upcoming and Suspended Vehicles it can open (HTTP 200, or 403 when denied), that the sidebar links only to those, and that the server accepts or rejects (403) the Suspend, Move to upcoming, Back to pricing done, Create auction and Activate requests. The requests use a non-existent ID or an empty form, so nothing changes on staging. The two irreversible deletes on the Suspended list (bulk delete, delete vehicle) are only sent for roles that must be refused, never for allowed ones. The expected access per role lives in `test-data/backend-permissions.data.ts`, taken from the roles' permission pages on 2026-11-08; entries marked "To confirm" need a business decision.
  - **Role accounts:** Dev Root (role `root`) always runs. Each other role needs its own staging account with only that role, set in `.env` as `ROLE_<NAME>_PHONE` / `ROLE_<NAME>_PASSWORD` (see `.env.example`). `backend-setup` signs in once per configured role and saves the session to `.auth/role-<name>.json`; roles with no account are skipped. Specs use `test.use({ signedInAs: '<role>' })`.
- **Known bugs** are tagged `@known-bug` and marked `test.fail(true, '<ticket>: ...')`, so the run passes while the bug exists and fails once it is fixed (then remove `test.fail()`). Tickets not yet filed use `BUG-PENDING`. Open: the unstable default order of the Suspended, Ready For Pricing and Pricing Done lists (vehicles repeat across pages, others never appear), PRM-02 and PRM-03 (`tests/backend/supplier-permission-bugs.spec.ts`), the Pricing Done Starting Price filter, the Upcoming Title filter, the Create Auction end-date check, and four Customer Group defects (`tests/backend/customer-group.spec.ts`).
- **Tags:** every test has a type tag (`@smoke`, `@functional`, `@negative`, `@ui`) and every `describe` has `@regression`; see `CLAUDE.md` for the full list. Example: `npm run test:backend -- --grep @smoke`, or `--grep-invert @mutates` for a read-only run.

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
