# Mazad iOS: full Login and Forgot Password flows on the physical iPhone

Revised plan (2026-11-09). **Nothing in this plan has been executed or enabled.** No account
lookup, OTP request, login, password reset, logout or test run has happened for it. All five
account-action switches (`IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`,
`IOS_ALLOW_PASSWORD_RESET`, `MAZAD_ALLOW_PASSWORD_RESET`, `MAZAD_ALLOW_LOGOUT`) stay unset.
Staging only (`stg-154`). Synthetic, dedicated test accounts only.

## 0. Credential rule

- Credentials come from **environment variables in `.env` only**, never hardcoded. Shell and CI
  variables are not read for credentials (the existing credential loader already works this way).
- Secrets are never printed, logged, attached to reports or put in test titles. Secret-holding
  values use the existing redacting wrapper classes.
- The Appium server records typed text in its own request log. The plan therefore starts Appium
  with a log filter (`--log-filters`, supported by the installed Appium 3.8) that masks the
  `value` of text-entry requests, and with the log file readable only by the owner. This must be
  verified once with a harmless fake value before any real secret is typed.

Proposed variables (names are proposals; **no iOS-specific secret exists today**):

| Variable                              | Meaning                                                           |
| ------------------------------------- | ----------------------------------------------------------------- |
| `IOS_TEST_DEALER_PHONE`               | Phone of the confirmed dedicated dealer test account              |
| `IOS_TEST_DEALER_PASSWORD`            | That account's known password ("P1"): the account's baseline      |
| `OTP_CODE`                            | The fixed staging OTP (exists today)                              |
| `DEV_ROOT_PHONE`, `DEV_ROOT_PASSWORD` | Only for the one-time account identification report (exist today) |

## 1. Test account identification (read-only report; not run)

- The current tests pick the **first active account** whose name contains `TEST_ACCOUNT_NAME_FILTER`
  ("test"). That is **not** accepted as proof of a synthetic account, and the plan removes it:
  accounts will be named explicitly through `.env` after you confirm them. The tests will then
  not log into the back office at all.
- **Report design (needs approval to run):** list **every** back-office match (not just the
  first), for the dealer and the individual list, with: internal ID, status, role, **masked name**
  (first character, then asterisks, plus the length) and **masked phone** (country code, first
  digit and last two digits only). Written to `reports/ios-account-report/<time>.json`
  (git-ignored). No writes to the back office.
- **Requires a Dev Root login to the staging back office** (a browser on the Mac, using
  `DEV_ROOT_PHONE` / `DEV_ROOT_PASSWORD` from `.env`). That login and the lookup are **not
  performed**. They wait for your explicit approval.
- Nothing proceeds until **you confirm that a specific account is synthetic and dedicated to
  automation**. If you can confirm the account without the back office, the Dev Root login is not
  needed.

## 2. Password handling (no "reset and discard")

Principle: **every account has one known baseline password (P1) in `.env`, and a failed test can
always get the account back to P1.**

- A normal login test uses P1 from `.env` directly. **It needs no OTP and no reset.**
- A reset test never throws a password away. Before it submits, it writes a **run journal**:
  `reports/ios-secrets/<runId>.json` (folder mode 0700, file mode 0600, inside the git-ignored
  `reports/`), holding the role, the masked phone, the state (`pending`, `applied`, `restored`)
  and, only if the new password differs from P1, that new password ("P2"). The journal is never
  attached to reports, never printed, never committed, and is deleted after a verified restore.
  (A macOS Keychain entry is a stronger alternative; the file is the simpler default.)
- **Preferred reset target is P1 itself.** If the backend accepts re-using the old password, a
  reset leaves the account unchanged and no P2 exists. Whether it does is **unknown** and is
  tested in the reset phase. If it is rejected, the reset uses a generated P2 and the test ends by
  **restoring P1** (one more OTP request).
- **Invalid password attempts are journaled too.** The below-minimum and rejected-password steps never trust
  the backend's rule: before the first attempt the run journals an `invalid-password-attempts` entry
  (`pending`, masked phone, no password). It becomes `restored` ("account observed unchanged") only after the
  new-password step stayed on screen for the whole server-response window, and `applied` ("a password MAY have
  been saved") if the step was left or the attempt did not finish. An attempts entry is never evidence of the
  baseline, and an open one blocks every later account run until the QA owner checks the account and closes it.
- **Recovery after a failure or interruption** (a journal in state `pending` or `applied`):
  1. The next run refuses to start any account test until recovery is done.
  2. Recovery goes through **Forgot Password, then OTP, then sets P1**. This works whatever the
     current password is, so it needs **no blind login attempts** and cannot lock the account.
     Cost: one OTP request.
  3. For `pending` (it is unknown whether Save was tapped), one optional login with P1 can
     replace the reset; it is one wrong-password attempt at worst. Your choice.
  4. The journal is marked `restored` and the secret deleted.
     If OTP requests are rate-limited at that moment, recovery waits for the cooldown. A back-office
     or admin password reset is a possible second route but is **unverified**.

## 3. OTP strategy (the 16 requests per run are withdrawn)

An OTP request is needed only when a new OTP must exist. Observation steps do not need their own.

| Case                                         | Needs its own OTP request?                                  | Why                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A registered phone opens the OTP step (D1)   | No: it is step 1 of any chain                               | Observation only                                                                          |
| Empty OTP keeps Verify disabled (D3)         | No                                                          | Observation, nothing is submitted                                                         |
| Correct OTP opens the new-password step (D2) | No: same chain                                              | Consumes the OTP, so nothing may reuse it afterwards                                      |
| Empty new password keeps Save disabled (D6)  | No: same chain                                              | Observation                                                                               |
| Too-short new password is rejected (D5)      | No: same chain, **if** the screen stays usable (unverified) | An invalid submission                                                                     |
| Complete reset (D7)                          | No: the end of the same chain                               | The one final submission                                                                  |
| **Incorrect OTP is rejected (D4)**           | **Yes: independent**                                        | A wrong attempt may burn the OTP or attempt counter; the backend's behavior is unverified |
| Expired OTP (F6)                             | Yes (needs waiting)                                         | Stays `fixme`: expiry time unknown                                                        |
| Another language                             | One chain per language                                      | Messages and screens must be seen in each language                                        |
| Another account                              | Yes                                                         | Individual account excluded (rate-limited)                                                |

- **OTPs are never reused.** One OTP is entered once. Sequential assertions within one request are
  not reuse.
- **Proposed total for the whole program:** inspection 1 to 2 requests (English, then Arabic),
  one chain per language 2 (English chain includes the reset), negative OTP 2 (one per language,
  last), restore 0 or 1. **About 6 to 7 requests overall**, instead of 16 per run. A routine
  repeat run would use 2 (the chains), plus 2 for the negative case.
- **Chaining changes the tests' structure:** D1, D3, D2, D6, D5, D7 become one serial group that
  keeps the same app session (no app restart between its steps). Titles stay; each step still
  asserts its own result; serial mode skips the rest after a failure. This needs your approval
  before it is built.
- **Rate limits are unknown.** The backend's limit (per account, per time window) is needed from
  the staging backend team. The plan adds a request ledger (timestamps in the run journal) that
  refuses an OTP request when the stated limit would be exceeded.

## 4. Test isolation: signed-in leak and cleanup (design only)

The leak: the successful-login tests end signed in, and a signed-in app fails `requireGuest`, so
the next test and every test after a mid-flow failure fail with the wrong reason.

Design: a **guest-state guarantee**, run at the start and the end of every account test.

1. **Check.** After the app is relaunched, More is shown. A guest prompt means guest state.
2. **If signed in:** sign out through the app (More, logout item, confirmation), **only when
   `MAZAD_ALLOW_LOGOUT` is on**. If it is off, the run **stops with "app is signed in, sign out
   manually"** and skips everything after it (no cascade of misleading failures).
3. **After every test, pass or fail:** an `afterEach` runs the same guarantee. If cleanup itself
   fails, a halt file marks the run dirty; later tests skip with that reason (like the web guard).
4. **After an interrupted run** (Ctrl-C, crash, Appium or WebDriverAgent dies): no hook runs, so
   the **next run's preflight** (a) refuses to start while a recovery journal is open (section 2)
   and (b) signs out first if the app is still signed in.
5. The app cannot be reset or reinstalled (not allowed), and its session survives a relaunch, so
   **signing out through the UI is the only way back to guest state.**

**Status: not implemented.** The cleanup needs the logout item and its confirmation, which are on
the signed-in screen that has never been inspected. Writing it now would mean guessing selectors.
The state machine itself can be built offline, with its selectors required from the registry
(failing clearly while empty), and selfchecked with a fake app, once you approve.

## 5. Missing iOS inspection (nothing launched for this plan)

**Missing identifiers (to request from the iOS team; `docs/ios-accessibility-ids-request.md`):**
Login "Log In" button (no id, no label), Login password show/hide control (not exposed),
Forgot Password "Send" button (no id, no label), the Close button (`navigationBarClose`: id or
label?). Recommended, not blocking: tab bar, guest prompt, fields, links, welcome-sheet buttons,
six unlabeled buttons on More.

**Three screens never inspected:**

| Screen                 | What is needed                                                                                                   | What it takes                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| OTP step               | OTP field(s) (count and type), Verify button, heading text, incorrect-OTP message                                | **One OTP request**                                     |
| New Password step      | Password field(s) (is there a confirmation field?), "Save and Login" button, "too short" message, Face ID prompt | **One OTP request** and a correct OTP; stop before Save |
| Signed-in More/account | Logout item and its confirmation, signed-in tab states                                                           | **A login** (Log In id and a known password, no OTP)    |

**Separation:**

- **Read-only, no OTP, no login:** what is already done (guest screens). Still possible: a
  re-inspection when the ids arrive, the More screen just before a language switch, and local
  validation behavior (typing a phone number and watching Send enable, nothing submitted).
- **Needs an OTP:** the OTP step and the New Password step.
- **Needs a login, not an OTP:** the signed-in screen. Its first run ends with the app signed
  in, so **you sign out manually once**, then the logout selectors are recorded and the cleanup
  can be built.

## 6. Execution phases

| Phase                                                     | Tests                                                                         | Approval needed                                                                                                  | Account                         | Switches                                                                                                   | Expected state changes                                                   | Risks                                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **0. Prerequisites**                                      | none run                                                                      | Your approval for the Dev Root lookup; your confirmation of the account; the iOS ids; backend rate-limit numbers | none                            | none                                                                                                       | none                                                                     | Account not synthetic; ids never arrive                                                                        |
| **1. Read-only**                                          | L1, F1 (4 runs)                                                               | Your go (they launch Mazad)                                                                                      | none                            | none                                                                                                       | App restarts; app language may switch; nothing is typed                  | Low                                                                                                            |
| **2. Local validation**                                   | L2 to L6, F2, F3                                                              | Ids recorded and reviewed; your go                                                                               | none                            | none                                                                                                       | None on the server; text typed locally and not submitted                 | Typed text reaches the Appium log (filter first)                                                               |
| **3. Unregistered-number submissions**                    | L9 (invalid login), F7 (unregistered Send)                                    | `IOS_ALLOW_ACCOUNT_ACTIONS`; text verified                                                                       | None (a number with no account) | `IOS_ALLOW_ACCOUNT_ACTIONS`                                                                                | Server calls only; throttling counters                                   | The number may have become registered (then Send would message a real person): verify it is unregistered first |
| **4. Login-required inspection, then successful login**   | Inspection of the signed-in screen; L10-lite (login with P1)                  | Known P1 in `.env`; Log In id; your go                                                                           | Dedicated dealer                | `IOS_ALLOW_ACCOUNT_ACTIONS`; `MAZAD_ALLOW_LOGOUT` for cleanup                                              | Signs in; the first run ends signed in (manual sign-out)                 | A wrong P1 counts as a failed login: one attempt, stop on first failure                                        |
| **5. OTP inspection**                                     | OTP step and New Password step, English then Arabic                           | Your approval of exactly 1 to 2 OTP requests                                                                     | Dedicated dealer                | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`                                                    | An OTP is requested; no password is saved                                | Rate limit; an SMS may reach the phone behind the account                                                      |
| **6. OTP chains without saving (Arabic)**                 | D1, D3, D2, D6, D5 (Arabic)                                                   | Chained-test restructure approved; cleanup built                                                                 | Dedicated dealer                | as phase 5                                                                                                 | None persisted                                                           | Chain steps depend on each other                                                                               |
| **7. Password reset and login with the updated password** | D7 (English chain end) then login with the resulting password                 | Journal and recovery built; your explicit go                                                                     | Dedicated dealer                | `IOS_ALLOW_PASSWORD_RESET`, `MAZAD_ALLOW_PASSWORD_RESET`, `MAZAD_ALLOW_OTP_REQUESTS`, `MAZAD_ALLOW_LOGOUT` | Password changes (to P1 or to P2, then restored to P1); signs in and out | Failure midway: recovery needed; rate limit                                                                    |
| **8. Negative credentials, last**                         | D4 incorrect OTP (both languages); L8 wrong password for a registered account | Separate approval each                                                                                           | Dedicated dealer                | as phase 5 (D4); `IOS_ALLOW_ACCOUNT_ACTIONS` (L8)                                                          | Failed-attempt counters                                                  | **Account lock.** L8 stays `fixme` unless the backend gives the lock threshold and an unlock route             |

**Recommended order:** 0, then 1, then 2 (once ids exist), then 3, then 4 (including the manual
sign-out, then the cleanup is built and reviewed offline), then 5, then 6, then 7, and 8 last or
never. Every account phase stops at the first failure, never retries, and starts with the
recovery-journal check.

## 7. Questions that need an answer

1. Approve the **Dev Root account report** (section 1), or confirm the dedicated account yourself?
2. Is the dedicated dealer account's phone and baseline password available for `.env`, or should
   it be set up first with one controlled reset?
3. What are the **backend OTP and login rate limits and lock thresholds**, and is there an
   admin way to reset a locked account or a password?
4. Approve the **chained-test structure** (section 3) and the **guest-state guarantee** (section 4)?
5. Is the Individual account to stay excluded?

## 8. Implemented offline (2026-11-09): nothing enabled, nothing run

Approved by the QA owner and built without launching the app, Appium, an OTP, a login, a logout or
a reset. The Dev Root account report and lookup are **not** executed. The Individual account is
excluded. All five approval switches and every iOS gate that is closed stays closed.

**Policy gate.** `config/ios-account-policy.ts` is empty on purpose. No account test (unregistered
number, login, OTP chain, reset) can run until every value below is recorded as its own record,
each with its **source, approver and approval date**. A plain yes or no is recorded as true or
false; "unknown" stays unrecorded and blocks. No default is invented.

- **OTP:** maximum requests and window; cooldown between requests; what the limit is counted per
  (account, IP, device, unregistered number); verification attempts per code; whether an incorrect
  OTP invalidates the code; OTP lifetime; whether the fixed staging OTP follows the same rules;
  whether staging sends real SMS.
- **Login:** failure threshold and counting window; account-lock duration (or
  "until-manual-unlock"); whether wrong OTP attempts count toward a lock.
- **Recovery:** the approved recovery and unlock procedure (an existing `docs/*.md` file).
- **Test account:** confirmed synthetic and dedicated (dealer), with five evidence confirmations
  and the QA owner's approval.
- **Approvals (none by default):** the OTP chain ids and the incorrect-OTP / wrong-password tests.

The dealer account itself comes from `.env` only (`IOS_TEST_DEALER_PHONE`,
`IOS_TEST_DEALER_PASSWORD`, plus the fixed staging `OTP_CODE`), never from the back office.

**OTP coverage by chain: exactly one OTP request per chain, never reused.** The English and Arabic
chains are separate. Each is one serial group on one app session, with no retries; a failure stops
the chain. After a chain ends (pass or fail) the app is returned to guest state.

| Chain                     | Language | One OTP request covers these tests, in order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dealer-en-reset`         | English  | A registered phone opens the OTP step; The OTP screen shows an input the suite supports; Resend is not offered while the cooldown runs; Empty OTP keeps Verify disabled; Resend is offered again once the cooldown has passed; The correct OTP opens the new-password step; The new-password screen shows the one password field the suite supports; Empty new password keeps Save and Login disabled; A new password below the confirmed minimum length is rejected; A new password the backend rejects is not saved; Saving the baseline password completes the reset and shows the confirmed post-reset state |
| `dealer-ar-flow`          | Arabic   | A registered phone opens the OTP step; The OTP screen shows an input the suite supports; Resend is not offered while the cooldown runs; Empty OTP keeps Verify disabled; Resend is offered again once the cooldown has passed; The correct OTP opens the new-password step; The new-password screen shows the one password field the suite supports; Empty new password keeps Save and Login disabled; A new password below the confirmed minimum length is rejected; A new password the backend rejects is not saved                                                                                            |
| `dealer-en-incorrect-otp` | English  | Incorrect OTP is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `dealer-ar-incorrect-otp` | Arabic   | Incorrect OTP is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

- The read-only steps (OTP layout, the two resend-cooldown observations, the new-password layout) cost no
  OTP request. The two resend steps need the recorded cooldown and the iOS resend label
  (`test-data/ios-otp-screen.data.ts`), and stay declared and pending until both are recorded. The
  rejected-password step needs the confirmed X1 facts and either a confirmed ban on reusing the current
  password or the optional `passwordRules.rejectedExamples`; otherwise it is left out and no OTP is spent on it.
- The Arabic "Complete reset" test is declared but skipped: the password reset is covered once, in
  English, and goes to the account's known baseline password from `.env` (no second password).
- Maximum OTP requests if every chain is approved: 4 per full run (the two incorrect-OTP chains
  are separate approvals and carry an account-lock risk).
- Not automated: the expired-OTP test (expiry time unknown) and the wrong-password test (lock risk).

**Guest-state cleanup.** After every account test the app is relaunched and checked (More shows
the guest prompt). It signs out only when `MAZAD_ALLOW_LOGOUT` is on; otherwise it reports "not
guest", leaves the app untouched and writes `reports/ios-account-state/APP-NOT-GUEST.json`, which
blocks the next account run until a later start check confirms guest state. The cleanup cannot
request an OTP, log in or reset a password. The logout item and its confirmation are located only
by accessibility ids that are not recorded yet (the signed-in screen was never inspected), so the
cleanup fails clearly until they are.

**Recovery journal.** `reports/ios-account-state/journal-<run>.json` (folder 0700, file 0600, never
committed) records only the masked phone and the state `pending`, `applied`, `restored` or `closed`.
It holds no password, no OTP and no full phone number. It is written before the reset is saved. An
open (`pending` or `applied`) or unreadable entry blocks every account run, including after an
interrupted run. Only the QA owner closes an entry (`closeByOwner`, no automatic caller).
