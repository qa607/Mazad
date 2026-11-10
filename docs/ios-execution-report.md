# Mazad iOS: execution report

Physical iPhone 15 Plus (`00008120-0002703C1162601E`, iOS 27.0.1), Mazad `com.motory.dealer` 8.3 (1491),
staging `stg-154`, Appium 3.8.0 with XCUITest and the preinstalled WebDriverAgent over the existing
RemoteXPC tunnel, run serially (one worker, no retries, stop on the first failure). No screenshots.

## What was executed on the device (2026-11-09)

`npm run test:ios -- --max-failures=1`: **20 passed, 0 failed**, 48 declared-but-skipped (second run, after the 16-test run the QA owner accepted). All are
read-only display, navigation and local-validation tests: only made-up values are typed, nothing is
submitted, requested or changed.

| Test                                                               | English | Arabic |
| ------------------------------------------------------------------ | ------- | ------ |
| Login form shows the phone and password fields and Forgot Password | passed  | passed |
| Login form shows the Log In button                                 | passed  | passed |
| Empty fields keep Log In disabled                                  | passed  | passed |
| Empty phone number keeps Log In disabled                           | passed  | passed |
| Empty password keeps Log In disabled                               | passed  | passed |
| Forgot Password opens from Login with the phone field              | passed  | passed |
| Close returns from Forgot Password to Login                        | passed  | passed |
| Empty phone number keeps Send disabled                             | passed  | passed |
| Filled phone and password enable Log In (not tapped)               | passed  | passed |
| A filled phone number enables Send (not tapped)                    | passed  | passed |

Each run restarts the app, detects its language (it may start in either), switches to the language
under test through More, requires the guest state, and navigates by exact labels on the one Button of
that label (checked each time; it fails rather than picking among several). The app's stored backend
setting is checked before the session and again after it (`https://stg-mazad-v3-154.motory.dev`).

Not executed: any test that submits a login, requests or verifies an OTP, resets a password or signs
out (see the blockers below). **Offline selfchecks (210) are separate from these device runs and are
not counted as device results.**

## Locators for controls without an accessibility id

- **Close**: the one Button named `navigationBarClose` (not localized).
- **Log In** (Login screen) and **Send** (Forgot Password screen): the one Button without an accessible
  name on that screen. The 2026-11-09 inspection found exactly one on each, in both languages; every
  use re-checks it and fails on none or several. Interim, until the iOS team adds ids.
- **Password show/hide**: not exposed by the app at all, so it has no locator (test pending).

## Defects found by the device runs (and fixed)

1. After a relaunch the app can show the More tab as selected while its content is another screen, so
   tapping More did nothing. `openMore` now verifies that More is really shown and re-selects Home first.
2. The unlabeled buttons report no label at all (nil), so an empty-string predicate matched nothing; the
   locator now accepts nil or empty.

## The 68 declared iOS tests (34 per language)

| State                 | English | Arabic | Why                                                                                                                                                           |
| --------------------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executed, passed      | 10      | 10     | the table above                                                                                                                                               |
| Pending a selector id | 1       | 1      | password visibility control (not exposed)                                                                                                                     |
| fixme                 | 12      | 6      | not automated (invalid phone format, password confirmation, expired OTP, wrong password) or blocked by the logout ids and the OTP and New Password inspection |
| Skipped               | 11      | 17     | account tests blocked by the unconfirmed test account; Individual account excluded; the Arabic chain does not save a password                                 |

## Account identification (done, masked, read-only)

`npm run ios:account-report` logged into the staging back office once with the Dev Root account from
`.env` (a browser on the Mac), listed every dealer whose name contains "test" (none was chosen), and
aborted every non-GET request after the login. Result: 3 active dealer accounts (IDs 1331, 779, 715),
saved masked in `reports/ios-account-report/` (git-ignored). Which of them, if any, is synthetic and
dedicated to automation is the QA owner's decision; nothing is selected automatically.

## Remaining before the account-changing flows can run

1. QA owner: confirm one dedicated synthetic dealer account from the masked report (or another), put its
   phone and baseline password in the local `.env` (`IOS_TEST_DEALER_PHONE`, `IOS_TEST_DEALER_PASSWORD`)
   and record the confirmation in `config/ios-account-policy.ts` (`testAccount`).
2. iOS team: an accessibility id for the password show/hide control; ids for Log In, Send and Close are
   still requested (interim locators above work); OTP, New Password and logout controls need inspecting.
3. Inspect the OTP, New Password and signed-in screens (needs one OTP request and one login), record
   their selectors and verify their text, then run the OTP chains, the reset and the login.

## Web and Android comparison (read-only, 2026-11-09)

- The Web and Android suites record **no** backend contract either: `APPROVED_WEB_REQUESTS` is empty
  (no OTP, login or password-reset endpoint path is recorded), and the only OTP facts in the project
  are the fixed staging OTP (`OTP_CODE`) and an informal observation of a resend cooldown of "about a
  minute" (not an approved value). OTP expiry is recorded as unconfirmed; the Individual account was
  rate-limited by earlier testing, with no recorded limit. Web and Android account tests are gated by
  the same kind of approval switches.
- So nothing in Web or Android can be reused as a verified backend policy, and nothing is copied into
  `config/ios-account-policy.ts`. The earlier "accepted unrecorded limits" entry was **removed** on the
  QA owner's instruction that unknown limits are not accepted risks (`acceptedUnrecordedFacts: null`,
  enforced by a selfcheck). The 14 backend facts and the account confirmation are all required again.
- Reused from Web/Android: scenarios and expected results, the test data (unregistered number, wrong
  password, wrong OTP, too-short password), the shared backend message texts (`src/locales`), and the
  fixed staging OTP source. Differences: iOS has a Close button (not Back); Web and Android have one
  new-password field and no confirmation, and iOS is unknown until that screen is seen.

## Prepared offline, not run (no account)

- OTP and New Password screen objects now require exactly one match for each control (or the recorded
  id) and fail otherwise; the OTP field layout accepts one field or one per digit and nothing else.
- The signed-in account screen object still needs the signed-in screen to be inspected (logout item and
  confirmation): it stays id-only and pending.
- The iOS developer request for the password show/hide id and `navigationBarClose` is ready, not sent:
  `docs/ios-developer-request.md`.
- Not added: "Invalid phone number format" and "Expired OTP" (no platform records the expected
  behaviour or the OTP lifetime; not invented).

## Run of 2026-11-09 (after the authorization hardening)

`npm run test:ios -- --max-failures=1` on the iPhone (staging `stg-154`, Appium and the user's tunnel):
**20 passed, 0 failed, 48 skipped** (7.7 minutes; English 10, Arabic 10), the same 20 tests as before. It
ran with the new restricted spec driver, the read-only submit buttons and the central guard in place, so
those changes work on the real device. No account action, OTP request or login was made. The 48 skipped
tests are blocked as listed in `docs/ios-automation-readiness-review.md` (section 7): the dealer
account and credentials, the backend facts and X1 to X3, the unset approval switches, the ledger not yet
created (`npm run ios:otp-ledger-init`, owner's step), the full text gate and missing ids. 278 offline
selfchecks pass; they are not device results.
