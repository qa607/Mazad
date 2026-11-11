# iOS automation readiness review

Resolves the inconsistencies listed in `docs/ios-backend-policy-response-tracker.md`. **Documentation
and offline analysis only.** No code, switch, credential, account, policy value (including
`acceptedUnrecordedFacts` and `testAccount`) or Git state was changed; no device, Appium or staging
contact. All proposals below need the QA owner's decision before any implementation.

Reviewed: 2026-11-09. Baseline kept as is: **20 physical-device passes** (10 English, 10 Arabic), 0
failed, 48 skipped, 68 declared. Offline selfchecks (210) are never counted as device passes.

## 1. Findings

| #   | Finding                                                                                                                                                                                     | Impact                                      | Proposal (section)                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| F1  | The Forgot Password "Unregistered phone number is rejected" test submits a number to the OTP path under the run kind `unregistered-number`, which requires only `IOS_ALLOW_ACCOUNT_ACTIONS` | An OTP request is not behind its own switch | Split the kind, add a permit (3)   |
| F2  | The `MAZAD_ALLOW_*` switches that iOS also requires are not in `.env.example`; two of the `IOS_*` ones duplicate them                                                                       | Easy to enable the wrong set, or too few    | Document and align (2)             |
| F3  | `IOS_ACCOUNT_ACTIONS_PROBLEM` and `IOS_PASSWORD_RESET_PROBLEM` in `src/mobile/ios/ios.session.ts` are exported but used nowhere (the real checks are in the account preflight)              | Dead duplicate of a safety check            | Remove or wire up (2)              |
| F4  | There is **no network-level guard on the physical device** (`IOS_NETWORK_GUARD_READY` is simulator-only, and the code states no guard is possible on a device)                              | Switches and policy are the only barrier    | Say so in every approval (2)       |
| F5  | Password-rule expectations rest on the website: 6-character minimum, error text, a 5-character boundary, and a reset to the baseline password, which may equal the current one              | Expected results without backend evidence   | Block until X1 is confirmed (4)    |
| F6  | The reset test asserts automatic sign-in after saving, and dismisses a "fingerprint" prompt seen on Android                                                                                 | Website and Android behaviour used for iOS  | Block until X2(a) is confirmed (5) |
| F7  | One policy gate covers every account run kind: a plain login waits for all OTP facts                                                                                                        | Over-blocking, but not unsafe               | Per-run-kind requirements (6)      |
| F8  | All 48 skipped tests are also behind the **full text gate** (`IOS_TEXT_VERIFIED`, selectors unverified), which no policy answer opens                                                       | "Policy confirmed" will not make tests run  | Report as its own category (7)     |
| F9  | Skip reasons are stacked free-text annotations; reports show one reason and the execution report's categories overlap (fixme 12/6 counts the logout-pending tests)                          | The 48 cannot be read as 48 distinct causes | Typed categories (7)               |

## 2. Approval switches

### 2.1 Inventory (read from code; no value set or shown)

Switch state in the local `.env`: all five account switches and both dealer credential variables are
**unset**; `OTP_CODE` is set. Every name that exists in `.env` also exists in `.env.example`. The example
file does not list `MAZAD_ALLOW_OTP_REQUESTS`, `MAZAD_ALLOW_PASSWORD_RESET` or `MAZAD_ALLOW_LOGOUT`.

| Switch                       | Purpose                                                           | Where it is read                                      | In `.env.example` |
| ---------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- | ----------------- |
| `IOS_ALLOW_ACCOUNT_ACTIONS`  | Any server-calling iOS test: login attempts and OTP-path requests | `account-preflight.ts` (all five run kinds)           | yes               |
| `IOS_ALLOW_PASSWORD_RESET`   | Tests that change a shared account password                       | `account-preflight.ts` (reset chain)                  | yes               |
| `MAZAD_ALLOW_OTP_REQUESTS`   | Requesting an OTP for a registered account                        | `account-preflight.ts` (flow, reset, negative chains) | **no**            |
| `MAZAD_ALLOW_PASSWORD_RESET` | Resetting a test account password (shared with Web and Android)   | `account-preflight.ts` (reset chain)                  | **no**            |
| `MAZAD_ALLOW_LOGOUT`         | Signing a shared account out (login and reset runs end signed in) | `account-preflight.ts`, `guest-state.ts` cleanup      | **no**            |
| `IOS_TEST_DEALER_PHONE`      | Dedicated dealer account (credential, not a switch)               | `account-preflight.ts`                                | yes (name only)   |
| `IOS_TEST_DEALER_PASSWORD`   | Dedicated dealer account baseline password (credential)           | `account-preflight.ts`                                | yes (name only)   |
| `OTP_CODE`                   | The fixed staging OTP (credential-like; never printed)            | OTP chains                                            | yes               |

Run kinds, as coded, and the switches each needs:

| Run kind              | Switches required                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `unregistered-number` | `IOS_ALLOW_ACCOUNT_ACTIONS`                                                                                                             |
| `login`               | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_LOGOUT`                                                                                       |
| `otp-flow-chain`      | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`                                                                                 |
| `otp-reset-chain`     | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`, `IOS_ALLOW_PASSWORD_RESET`, `MAZAD_ALLOW_PASSWORD_RESET`, `MAZAD_ALLOW_LOGOUT` |
| `negative-chain`      | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`                                                                                 |

The guarded launch requires all five switches to be **off**. Other `IOS_*` variables are
configuration (target, UDID, bundle, WDA, staging IP), not approvals. Code-level gates changed only in
review: `IOS_DEVICE_RUNS_APPROVED` (true), `IOS_TEXT_VERIFIED`, `IOS_SELECTORS_VERIFIED` and
`IOS_NETWORK_GUARD_READY` (false).

### 2.2 Missing safeguards and proposals

1. **Document every switch** in `.env.example` (names only, empty), with a comment saying which run kind
   needs which, so the `MAZAD_ALLOW_*` set is not discoverable only from code (F2).
2. **Remove the unused `IOS_ACCOUNT_ACTIONS_PROBLEM` / `IOS_PASSWORD_RESET_PROBLEM`** exports, or make
   the preflight use them, so there is one source of truth (F3).
3. **State F4 in every approval request:** on the iPhone no request can be blocked by method or path, so
   a wrongly enabled switch lets the request go out. Approvals should name the run kind, the account
   and the maximum number of OTP requests and logins.
4. **Switch-set selfcheck:** one selfcheck that lists the switches each run kind needs, fails if a kind
   needs a switch that `.env.example` omits, and fails if a switch is read anywhere outside the
   preflight and cleanup.
5. **Record who enabled what** in the run journal header (switch names only, no values), so a run is
   traceable to an authorization.

## 3. OTP request authorization (the unregistered-number scenario)

**Why it can reach the OTP path today.** The test calls `requestPasswordReset(unregisteredPhone)`, which
types the number and taps Send. Its only gate is `UNREGISTERED_NUMBER_PROBLEM`, computed for the run
kind `unregistered-number`, whose switch list is just `IOS_ALLOW_ACCOUNT_ACTIONS`. The kind covers two
different server calls (a login attempt and an OTP-path request) under one switch set, and the screen
method itself checks nothing. The comment in the test says "no OTP is sent to anyone"; that is a
claim about the backend (Q3 per-unregistered-number scope, Q5 real SMS) with no recorded evidence. The
website test is gated the same way, so this was a copied pattern, not a new decision. It cannot run
today (policy blocks it), so nothing has been sent.

**Proposed correction (not implemented):**

1. Split the kind into `unregistered-login` (switch: `IOS_ALLOW_ACCOUNT_ACTIONS`) and
   `unregistered-otp-request` (switches: `IOS_ALLOW_ACCOUNT_ACTIONS` **and** `MAZAD_ALLOW_OTP_REQUESTS`),
   and point the Forgot Password test at the second.
2. Defence in depth at the call site: make `IosForgotPasswordScreen.requestPasswordReset(phone, permit)`
   take an `OtpRequestPermit`, an object that can only be created by a function that runs the preflight
   for an OTP-capable run kind and throws if it reports any problem. A missing or reused permit fails
   before Send is tapped; a permit is single-use and counted in the OTP ledger.
3. Selfchecks: (a) every use of `requestPasswordReset` in `tests-ios` sits under a skip derived from a
   run kind that includes `MAZAD_ALLOW_OTP_REQUESTS`; (b) no code taps the Send button outside
   `requestPasswordReset`; (c) the permit throws with each OTP switch off and with the policy open.
4. Count unregistered-number requests in the same ledger as chain OTP requests, so the limit (Q1) is
   enforced across all OTP-path requests, not per chain.

## 4. Password validation: every unverified assumption

Assumptions currently in the iOS tests, none confirmed by the backend (X1):

| #   | Assumption                                                                                             | Where                                                                 | Source of the assumption                   |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------ |
| P1  | A 3-character password (`abc`) is rejected                                                             | `forgot-password.spec.ts` (too-short step); `website-login.data.ts`   | website data                               |
| P2  | The minimum is 6, so 5 characters (`Ab1!c`, `BOUNDARY_TOO_SHORT_PASSWORD`) is rejected                 | `ios-test-helpers.ts`, same step                                      | website message and data                   |
| P3  | The rejection appears as the text "Password must be at least 6 characters" on the same screen          | `passwordTooShort` from `src/locales`                                 | shared locale text (not seen on iOS)       |
| P4  | An invalid submission saves nothing and leaves the OTP usable for the next step                        | same step, then the reset step                                        | design assumption, not evidence            |
| P5  | The baseline password (from `.env`) is a valid new password, **and** it may equal the current password | reset step (`setNewPassword(baseline)`); the reset sets new = current | design choice; backend reuse rule is in X1 |
| P6  | Arabic shows the Arabic equivalent of the P3 text                                                      | Arabic chain                                                          | locale file                                |

P5 is the most important: if the backend forbids reusing the current password, the English reset would
fail or be rejected at the end of the single OTP chain.

**Keeping these blocked until X1 is confirmed (proposal, not implemented):**

1. Add a supplementary policy block `passwordRules` with `Fact` records (value, source, approval, as for
   the other facts): minimum length, maximum length, required character types, whether the current
   password may be reused, and how a violation is shown. It is **not** one of the 14 backend facts and
   `acceptedUnrecordedFacts` is not involved.
2. Tests that use a password-rule expectation read the recorded values: the boundary lengths are
   computed from `minLength`, never from a constant, and no value comes from the website data. P1 to P6
   are marked "assumption" in the code comments until then.
3. Gate: the too-short step and the reset step require `passwordRules` to be recorded. Because a chain may
   not skip a step, propose splitting each chain into a base part (OTP step, empty OTP, correct OTP,
   empty new password: none need X1) and an X1 part (too-short, reset) that is declared only when
   `passwordRules` is recorded. The base part still uses exactly one OTP; the X1 part is dropped from the
   chain until then, so no OTP is spent on a step that cannot run. _(Decision needed: see section 8.)_
4. The English reset also needs a different new password if the backend forbids reuse; that choice
   (a second random password, then restoring the baseline) is only possible after X1 and needs its own
   approval, because it adds a second password change.
5. A selfcheck fails if a password-rule constant is imported from `website-login.data.ts` into an iOS
   test.

## 5. Password-reset completion (X2)

**Assertions that depend on X2 today:**

| Assertion                                                                                | Depends on | State                                                                           |
| ---------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| After saving, the signed-in account screen shows the logout item                         | X2(a)      | Website behaviour; blocks until X2(a) is recorded for iOS                       |
| The Face ID / "fingerprint" prompt is dismissed if it appears (`dismissPromptIfPresent`) | none (app) | Android text; unverified on iOS; needs the screen seen                          |
| Cleanup logs out after the reset                                                         | X2(a)      | Only correct if the app is signed in                                            |
| "Then login with it" (the test title)                                                    | X2(b)      | The title promises a login with the new password that the body does not perform |

**Proposal:**

1. Record the iOS-specific result as a supplementary fact `passwordReset.signsInAutomatically`
   (true or false) with source and approval. The expected end state is **derived from it**: signed in and
   logout available if true, back on Login if false. Without the fact, the reset test stays blocked and
   so does the cleanup that assumes a signed-in app.
2. Rename or correct the reset test title, because it says "then login with it" but only checks that the
   app is signed in. A real login with the new password needs the Q10 and Q11 facts and an extra login
   (X2(b)).
3. **Cannot be verified with the current setup (record the backend statement only):**
   - X2(c) other sessions invalidated: needs a second signed-in session (another device or a Web
     login) and a second account action. The setup has one iPhone and no approved second session.
   - X2(b) the old password no longer works: needs one extra, deliberately failing login; it is an
     account action counted by Q10 and must wait for the lock rules.
4. A selfcheck asserts that no test reads `passwordReset.*` expectations from the Web suite.

## 6. Policy-gate design (login separated from OTP tests)

**Today:** `accountRunProblem(kind, …)` first calls `accountPolicyProblem`, which requires **all 14**
facts, the confirmed account, and the recovery document for every kind. Everything else (switches, env
variables, journal, marker, approved chain, negative approval) is checked per kind afterwards.

**Proposal: independent requirement sets, combined per run kind by union.** A requirement may only be
added to a kind, never removed from the checks that exist today without the QA owner's decision.

| Set                       | Facts it requires (question numbers as in the clarification request)                            |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| Always (every kind)       | confirmed dedicated account (`testAccount`), recovery procedure (Q12), journal and marker clear |
| Login                     | Q10 (threshold and window, incl. unregistered numbers), Q11 (lock duration and unlock)          |
| OTP request               | Q1 (limit and period), Q2 (wait), Q3 (scope), Q5 (real SMS)                                     |
| OTP validation            | Q4 (validity), Q6 (fixed OTP rules), Q7 (attempts)                                              |
| OTP negative (wrong code) | OTP validation set plus Q8 (wrong code cancels), Q9 (counts toward lock) and the Login set      |
| Password reset            | OTP request set, OTP validation set, X1 `passwordRules`, X2 `passwordReset`, X3 (reset limits)  |

Resulting kinds (switches as in section 2, with the section 3 split):

| Run kind                               | Facts (union)                                              | Switches                                                                                        |
| -------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `unregistered-login`                   | Always, Login, Q3                                          | `IOS_ALLOW_ACCOUNT_ACTIONS`                                                                     |
| `unregistered-otp-request`             | Always, OTP request                                        | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`                                         |
| `login` (dealer, baseline password)    | Always, Login                                              | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_LOGOUT`                                               |
| `otp-flow-chain` (base steps)          | Always, OTP request, OTP validation                        | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`                                         |
| `otp-flow-chain` (X1 steps: too short) | the row above plus X1                                      | same                                                                                            |
| `negative-chain` (incorrect OTP)       | Always, OTP negative                                       | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS` plus `negativeCredentialTests` approval |
| `otp-reset-chain`                      | Always, Password reset (includes Login for cleanup safety) | all five switches                                                                               |

**Gate logic:**

```
problem(kind) =
  firstOf(
    textAndSelectorGate(kind)            // unchanged: IOS_TEXT_VERIFIED etc. / narrow scope
    factsProblem(REQUIRED_FACTS[kind])   // only the sets above; each fact still needs value, source, approver, date
    testAccountProblem()                 // unchanged, for every kind that uses an account
    envProblem(kind)                     // unchanged
    journalProblem(), markerProblem()    // unchanged
    chainApprovalProblem(kind)           // unchanged
    switchProblem(SWITCHES[kind])        // with the unregistered-otp-request split
  )
```

**Why this does not weaken a safety control:** the account confirmation, recovery procedure, switches,
journals, text gate, one-OTP-per-chain rule and negative-test approval all stay required for every kind
that had them. Only the _fact sets_ differ, and each kind still requires every fact its own calls can
hit: a login can lock an account, so Login always needs Q10 and Q11; nothing that sends an OTP can run
without the OTP request set. `acceptedUnrecordedFacts` stays `null`. A fact the kind does not need is
still tracked and can still be confirmed later; it just no longer blocks a kind that cannot be affected
by it.

**Required before implementing:** a selfcheck table that fails when a run kind's fact set is smaller than
the checks it performs (for each screen call that can reach the server, the matching set is present),
plus the existing "all blocked while anything is unrecorded" tests re-run per kind.

## 7. Test reporting: how the 48 skipped are counted

**How it is counted today.** Playwright's list shows 20 passed and 48 skipped, with no reason in the
summary. Each skipped test carries stacked annotations (skip, skip, fixme, pending-selector) and a report
shows only the first. The execution report's table (fixme 12/6, skipped 11/17) groups by the annotation
type, so a test that is policy-blocked **and** waiting for the logout ids counts as "fixme", and the
password-toggle test counts as both pending and fixme.

**Fact found while classifying (F8):** every one of the 48 also carries the full text-gate skip
(`IOS_TEXT_VERIFIED` and selectors unverified). Policy answers alone will not run any of them.

**Proposed categories** (one primary category per test by this order, plus secondary tags):

| Primary category (order of precedence) | Meaning                                                                                                                                                   | English | Arabic | Total |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ----- |
| Passed                                 | executed on the iPhone and passed                                                                                                                         | 10      | 10     | 20    |
| Failed                                 | executed and failed                                                                                                                                       | 0       | 0      | 0     |
| Intentionally excluded                 | Individual account variants (8 per language); the Arabic chain by design does not repeat the reset (1)                                                    | 8       | 9      | 17    |
| Fixme                                  | behaviour not recorded anywhere: invalid phone format (Login and Forgot), password confirmation, expired OTP, incorrect password for a registered account | 5       | 5      | 10    |
| Pending implementation                 | needs a control the app does not expose: password visibility                                                                                              | 1       | 1      | 2     |
| Policy blocked                         | account scenarios waiting for the backend facts and the account confirmation                                                                              | 10      | 9      | 19    |
| Authorization blocked                  | policy complete, switches or run approval missing                                                                                                         | 0       | 0      | 0     |

20 + 0 + 17 + 10 + 2 + 19 + 0 = 68. English 10 + 8 + 5 + 1 + 10 = 34; Arabic 10 + 9 + 5 + 1 + 9 = 34.

**Secondary tags** (a test can carry several; shown for the policy-blocked ones, which are not final
causes): authorization (switches unset): 19 of 19; logout-ids pending: English 7, Arabic 1; full text and
selector gate: all 48; account not confirmed: 19. "Authorization blocked" is 0 as a primary
category only because the policy check runs first; it becomes the visible cause the moment the policy is
complete, so the category must exist.

**Proposed mechanism (not implemented):**

1. Typed annotations instead of free-text skip reasons: a helper adds
   `{ type: 'category', description: 'policy-blocked' | 'authorization-blocked' | 'pending-implementation' | 'fixme' | 'excluded' }`
   next to each existing skip, keeping today's descriptions.
2. An offline reporting script that reads `playwright test --list --reporter=json` (and the last run's
   results) and prints the table above, including secondary tags. It runs no test and needs no device.
3. A selfcheck: the primary categories sum to the declared total, every skipped test has exactly one
   primary category, and the passed count equals the last recorded device run.
4. The execution report keeps the historical baseline (**20 passed, 0 failed, 48 skipped**) unchanged
   and gains this table as a view; the older annotation-based split stays visible as history.

## 8. Decisions needed from the QA owner

1. **F1 and the permit (section 3):** approve the kind split plus the single-use OTP permit and ledger
   for all OTP-path requests.
2. **F2, F3 (section 2.2):** approve documenting all switches in `.env.example` and removing the two
   unused exports.
3. **P5 and X1 (section 4):** is splitting chains into base and X1 parts acceptable (no OTP spent on a
   blocked step), and may a reset to a different password (then back to baseline) be considered after X1?
4. **X2 (section 5):** approve deriving the reset's end state from a recorded iOS `signsInAutomatically`
   fact, and the title correction.
5. **Gate design (section 6):** approve per-run-kind fact sets, in particular that a dealer login depends
   on Q10 to Q12 only. This is the one change that makes a run possible earlier, so it needs your
   explicit decision.
6. **Reporting (section 7):** approve the seven categories and typed annotations; the execution report
   table would then be restated, with the history kept.
7. **Text gate (F8):** the full text and selector verification is a separate step from the policy: confirm
   it should be planned as its own inspection (needs OTP and login screens, so after authorization).

Nothing above is implemented. All account flows remain blocked.

---

## 9. Implementation status (2026-11-09, after the QA owner's approval)

Implemented offline; **nothing was run on the iPhone, no Appium, no staging contact, no OTP request, no
account action.** Switches, credentials, `testAccount` and `acceptedUnrecordedFacts` are untouched
(`acceptedUnrecordedFacts` is `null`; any other value is now itself a blocking problem).

| Approved item        | What was built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. OTP authorization | Run kind split into `unregistered-login` and `unregistered-otp-request` (the latter needs `MAZAD_ALLOW_OTP_REQUESTS`). `src/mobile/ios/account/otp-permit.ts`: single-use permit, issued only after every check passes, consumed by `requestPasswordReset(phone, permit)` (the only place Send is tapped), re-checked at send time, bound to one phone and scenario, lapses after 5 minutes, written to a ledger (`reports/ios-account-state/otp-path-requests.jsonl`, no phone or code). The ledger is compared with the **recorded** limits (count, window, cooldown) before issuing; unrecorded limits or an unreadable ledger refuse. |
| 2. Switches          | `.env.example` documents all five switches by name, empty, with purpose, the operation each protects and the switches each run kind needs. The two unused exports in `ios.session.ts` were verified unreferenced and removed.                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3. Password testing  | Base OTP steps no longer depend on X1. The below-minimum step exists only when X1 (minimum length, violation behaviour) is confirmed and uses `passwordBelowMinimum(confirmedMinimum)`; the website constants (`abc`, the 5-character value, the 6-character message) are gone from the iOS tests. The reset step is only included when X1 confirms the current password may be reused. No different-password reset exists in the code; it stays a future scenario needing X1 and your approval.                                                                                                                                          |
| 4. Reset outcome     | The post-reset state is derived from `passwordReset.signsInAutomatically` (X2(a)); the Android prompt dismissal was removed (an unexpected prompt now fails the step). The step is titled "Saving the baseline password completes the reset and shows the confirmed post-reset state". Blocked until X1, X2 and X3 are recorded.                                                                                                                                                                                                                                                                                                          |
| 5. Independent gates | `accountPolicyProblems(policy, exists, now, sets)` with sets `always`, `login`, `otp-request`, `otp-validation`, `otp-negative`, `password-boundary`, `password-reset`; each run kind requires the union (`RUN_KIND_SETS`), plus the account, its switches, journals and approvals. Selfchecks prove a kind is blocked by missing facts of its own sets and by none of the others. Recorded policy never authorizes: without the switches every kind stays blocked.                                                                                                                                                                       |
| 6. Reporting         | Typed `category` and `also` annotations on every non-runnable declared test (`src/utils/test-category.ts`) and an offline report, `node scripts/ios-test-report.mjs` (runs only `--list`; counts Passed/Failed only from a `--results` file of a real run).                                                                                                                                                                                                                                                                                                                                                                               |

### Code inspection behind "a plain dealer login depends on Q10 to Q12 only"

A login is phone, password and the Log In button on every platform (Web `login`, Android `login`, iOS
`login`); none has an OTP step. Applicable backend facts: the lock rules (Q10 threshold and window, Q11
duration) and, through `always`, the recovery procedure (Q12). Not applicable: every OTP fact and the
password rules. **Limit of this inspection:** the iOS screens after a login are not yet seen. If the app
shows a gate after login (Android shows an "accept updated terms" gate, but only after a reset), the test
fails rather than accepting it automatically, because accepting changes the account; the fact set must
then be revisited.

### As-built categories (68 declared; run `node scripts/ios-test-report.mjs`)

Differs slightly from the table in section 7: by the approved precedence, the dealer login test is
**pending implementation** (logout ids) with "policy blocked" as a further cause, and the base OTP steps
are no longer waiting for logout ids.

| Category                        | English | Arabic | Total |
| ------------------------------- | ------- | ------ | ----- |
| Runnable (the 20 device passes) | 10      | 10     | 20    |
| Intentionally excluded          | 8       | 9      | 17    |
| Fixme                           | 5       | 5      | 10    |
| Pending implementation          | 2       | 2      | 4     |
| Policy blocked                  | 9       | 8      | 17    |
| Authorization blocked           | 0       | 0      | 0     |

Sum 68. Further causes recorded as `also`: text gate on all 48 non-runnable tests, authorization on 16, policy
on 2. Passed and Failed are **not** inferred from a listing: the device baseline (20 passed, 0 failed, 48
skipped) is unchanged and stays in `docs/ios-execution-report.md`.

### Second-session requirements (X2(b) and X2(c): session invalidation)

Not implemented and not runnable with the current setup. They need all of the following, each as its own
approval:

1. **A second, independent signed-in session of the same dedicated test account** (another iPhone, or a
   browser on the website, which is an additional login attempt and so counts toward Q10).
2. The first session signed in **before** the reset, the reset performed on the other, then a check that the
   first session is signed out (X2(c)), and that the **old** password is rejected while the new one works
   (X2(b), one deliberate failed login that counts toward the lock threshold).
3. Confirmed Q10 to Q12 (lock rules and recovery), X1 (a new password that differs from the old one if reuse is
   not allowed, which is the future different-password scenario), and X2 with the backend's own statement.
4. A way to observe the first session without acting on it (for example the signed-in screen of an
   already-signed-in app); none is built.

Until then X2(b) and X2(c) are recorded from the backend's written answer only, not tested.

### Verification (offline)

tsc clean, ESLint 0 errors, Prettier clean, 232 selfchecks pass (210 before; 22 added, including permit
single-use, forged, reused and lapsed permits, ledger limits, set-by-set gating, effective chains, the typed
categories and the `.env.example` documentation). Selfchecks are not device results.

### Still open

Everything blocked by missing information stays blocked: the 14 backend facts, X1 to X3, the confirmed dealer
account and its `.env` variables, the iOS developer request (not sent), the full text and selector
verification, the OTP, New Password and signed-in screens never inspected, and your device-action
authorization for each run.

---

## 10. Authorization security hardening (2026-11-09)

Implemented offline; nothing run on the device, no Appium, staging, OTP or account action. Policy
(`acceptedUnrecordedFacts` null, `testAccount` null, all facts and X1 to X3 null), switches (all unset)
and credentials (none) are untouched.

- **Ledger** (`src/mobile/ios/account/otp-ledger.ts`, standalone): durable (fsync), exclusive lock file (never
  stolen), hash-chained lines, strict validation; a missing, corrupted, cut-off, unreadable or locked ledger
  refuses. It is created once on purpose with `npm run ios:otp-ledger-init` (not yet run). Stores only
  timestamps, run id, kind, scenario and target; no phone, password or OTP.
- **Permit** (`otp-permit.ts`): consumption is synchronous and permanent after any attempt, bound to phone
  digest and scenario (frozen), 5-minute lifetime, authorization re-checked at send time, limits checked
  under the ledger lock. Technical safety limits (6 per run, 5 s spacing; this suite's own, not backend)
  are separate from recorded backend limits (only enforced when recorded; never defaulted).
- **Central guard** (`action-guard.ts`, `account-context.ts`): `login`, `verifyOtp` and `setNewPassword` call it
  before typing or tapping. The Log In, Send, Verify and Save buttons are handed out read-only; each is tapped
  in exactly one guarded method.
- **Switch matrix**: all 32 switch combinations are tested for six operations through the real screen methods.

Limits that remain: the ledger is tamper-evident, not tamper-proof (the tail can be cut or the file replaced);
a crashed process can leave `otp-path-requests.lock`, which blocks runs until the QA owner removes it; a spec
author with the raw driver could still tap, which scans and review catch but code cannot prevent; the Close,
logout and navigation taps are not guarded (not account submissions); a login has the guard, not a permit.
Selfchecks: 258 pass (offline, not device results).
