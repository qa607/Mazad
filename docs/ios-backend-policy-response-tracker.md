# iOS: backend policy response tracker

Tracks the backend team's answers to `docs/ios-backend-clarification-request.md` (Q1 to Q12, plus
supplementary X1 to X3). The 14 policy-register items are in `docs/ios-backend-policy-register.md`
(unchanged). **No answer has been received. Nothing here is prefilled**, and no value, default or
assumption is recorded. Environment: staging `stg-154` only.

Created: 2026-11-09 (documentation only; no device, Appium, staging or backend contact; the request
has not been sent).

## Baseline that must not change

Physical iPhone (2026-11-09): **20 passed** (10 English, 10 Arabic), **0 failed**, **48 skipped**, 68
tests declared. Offline selfchecks (210) are reported separately and are never counted as device
passes. All account flows remain blocked. See `docs/ios-execution-report.md`.

## Statuses

| Status                  | Meaning                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| Awaiting Answer         | Not answered yet (the starting state of every row)                             |
| Partially Answered      | Some of the four required items (A to D) or some sub-parts are answered        |
| Needs Clarification     | An answer exists but fails a validation rule below (QA names which one)        |
| Confirmed               | Passes every validation rule below; recorded in the policy file in code review |
| Rejected / Not Enforced | The backend states the rule is not enforced or the behaviour does not exist    |

## Answer-validation rules

QA evaluates each answer against these rules. An answer is **Confirmed** only if **all** hold:

1. **Explicit behaviour.** It states what the backend does, as a fact ("is", "does not"), not
   "should", "usually", "around" or "as in production". Every sub-part of the question is answered
   (for example all four scopes in Q3, all three parts of X2).
2. **Exact value and unit.** Where the question has a number or setting, the exact configured value is
   given with its unit (seconds, minutes, count, yes/no, scope). Ranges, estimates and "about" fail.
3. **Verifiable source.** The API, service or configuration setting that defines it is named (a config
   key, a code location, a ticket or a backend document) so QA can point to it. "Ask X" or "it works
   like that" fails.
4. **Accountable owner.** A named backend owner (person or team) confirms it, with the date. A forwarded
   or second-hand answer fails until the owner confirms it.
5. **Staging explicit.** The answer says it is the **staging (`stg-154`)** behaviour and states any
   difference from production. If the answer is for production only, or silent about staging, it fails.
   QA never uses production values for staging.

Handling:

- Fails any rule: **Needs Clarification**; QA writes which rule failed and what is missing.
- Some parts answered, others not: **Partially Answered**.
- The backend says there is no limit or the behaviour does not exist: **Rejected / Not Enforced**. This
  is a recorded fact (for example "no cooldown" is recorded as 0), still with source, owner and
  staging statement (rules 3 to 5).
- Never filled from the website or Android tests, from earlier observations, from the fixed OTP's
  behaviour, or from an informal message.
- **Confirmed does not run anything.** It lets QA transcribe the value, with its source and approver,
  into `config/ios-account-policy.ts` in code review. Separately, account tests still need the
  dedicated synthetic account, the approved chains and the QA owner's device-action authorization.

## Tracker

Fields per row: **Answer received** (summary, plus date), **Value and unit**, **Source**, **Backend
owner**, **Staging vs production**, **QA validation** (rules 1 to 5, each pass or fail). Every cell
below is empty on purpose.

| ID  | Topic                                   | Register item(s)                | Status             | Answer                                                                                               | Value and unit | Source | Owner | Staging vs production | QA validation                  |
| --- | --------------------------------------- | ------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- | -------------- | ------ | ----- | --------------------- | ------------------------------ |
| Q1  | OTP request limit and period            | #1 maxRequests, #2 window       | Partially Answered | OTP blocks at 4 sent (period not stated)                                                             |                |        |       |                       | Needs backend source and owner |
| Q2  | Wait between OTP requests               | #3 cooldownSeconds              | Partially Answered | User must wait 60 (unit not stated, read as seconds) between OTP requests                            |                |        |       |                       | Needs backend source and owner |
| Q3  | What OTP limits are counted against     | #4 limitScope                   | Partially Answered | Per device (other scopes not stated)                                                                 |                |        |       |                       | Needs backend source and owner |
| Q4  | OTP validity period                     | #7 lifetimeSeconds              | Awaiting Answer    | Not answered: the owner corrected that Q4 is NOT ignored; a successful reset still needs a valid OTP |                |        |       |                       | Needs backend source and owner |
| Q5  | Does staging send real SMS              | #9 stagingSendsRealSms          | Awaiting Answer    |                                                                                                      |                |        |       |                       | Not started                    |
| Q6  | Fixed staging OTP follows same rules    | #8 fixedOtpFollowsSameRules     | Partially Answered | No; 1111 is the OTP for staging only, production ignored                                             |                |        |       |                       | Needs backend source and owner |
| Q7  | OTP verification attempts               | #5 attemptsPerCode              | Partially Answered | No limit on entering the OTP                                                                         |                |        |       |                       | Needs backend source and owner |
| Q8  | Wrong OTP cancels the code              | #6 incorrectInvalidates         | Partially Answered | No (a wrong OTP does not cancel the code)                                                            |                |        |       |                       | Needs backend source and owner |
| Q9  | Wrong OTPs count toward account lock    | #13 wrongOtpCountsToward        | Partially Answered | No (wrong OTPs do not count toward a lock)                                                           |                |        |       |                       | Needs backend source and owner |
| Q10 | Failed logins that lead to a lock       | #10 threshold, #11 window       | Awaiting Answer    | Owner statement only, not a backend answer: failed logins do not lock                                |                |        |       |                       | Needs backend source and owner |
| Q11 | Lock duration and how it ends           | #12 lockDuration                | Partially Answered | Lock after sending more than 4 OTPs; locked for 24 hours                                             |                |        |       |                       | Needs backend source and owner |
| Q12 | Recovery of a locked or blocked account | #14 recovery.procedure          | Awaiting Answer    |                                                                                                      |                |        |       |                       | Not started                    |
| X1  | Password complexity and validation      | supplementary (not in register) | Partially Answered | Minimum 6 characters only (nothing else stated)                                                      |                |        |       |                       | Needs backend source and owner |
| X2  | Behaviour after a successful reset      | supplementary (not in register) | Partially Answered | "No" (which of automatic sign-in, old password, other sessions is not stated)                        |                |        |       |                       | Needs backend source and owner |
| X3  | Limits on password resets               | supplementary (not in register) | Partially Answered | No (no extra reset limits)                                                                           |                |        |       |                       | Needs backend source and owner |

Sub-parts to track when an answer arrives (so "Partially Answered" is precise): Q1 count and period and
what the user sees; Q3 each of account, IP, device, unregistered number; Q4 validity and whether a new OTP
voids the old one; Q7 attempts and the state after the last one; Q10 count, period and unregistered numbers;
Q11 automatic or manual unlock and whether a reset unlocks; Q12 steps, executor and document location;
X1 length, character types, same-as-old and error; X2 (a) automatic sign-in, (b) old password, (c) other
sessions; X3 limit values and user message.

## Automation readiness (reviewed offline, nothing executed or implemented)

### A. Covered by the 20 passing physical-device tests (per language, 10 each)

Login: form shows phone, password and Forgot Password; Log In button shown; Log In disabled with empty
fields, empty phone, empty password; Log In enabled when both are filled (never tapped).
Forgot Password: opens from Login with the phone field; Close returns to Login; Send disabled with an empty
phone; Send enabled with a filled phone (never tapped). These need no backend policy and no account.

### B. Blocked or pending scenarios (24 per language) and what they depend on

Two levels of dependency apply:

1. **Gate (all account scenarios).** Until the policy file records **all 14 facts** and the confirmed account,
   every account scenario is skipped when its spec loads (no app launch, no request). Q1 to Q12 therefore
   all gate everything in section B at once.
2. **Behaviour (what the expected result or the run order rests on).** Listed per scenario below.

| Scenario (EN and AR unless noted)                      | Behaviour depends on                                 | Dealer account            | Device-action authorization and switches (as coded)                                                                                                                  | Other prerequisites                                        |
| ------------------------------------------------------ | ---------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Unregistered phone number is rejected (Forgot)         | Q1 to Q3, Q5                                         | No                        | Submits a number: `IOS_ALLOW_ACCOUNT_ACTIONS`                                                                                                                        | policy gate                                                |
| Invalid credentials rejected (Login, unregistered)     | Q3, Q10                                              | No                        | Login attempt: `IOS_ALLOW_ACCOUNT_ACTIONS`                                                                                                                           | policy gate; expected message is Web/Android text          |
| A registered phone opens the OTP step                  | Q1 to Q3, Q5                                         | Yes                       | OTP request: `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`                                                                                                 | approved chain; OTP screen never inspected                 |
| Empty OTP keeps Verify disabled                        | Q1 to Q3 (to reach the step)                         | Yes                       | same chain, no extra request                                                                                                                                         | OTP screen selectors                                       |
| The correct OTP opens the new-password step            | Q4, Q6, Q7                                           | Yes                       | same chain                                                                                                                                                           | `OTP_CODE`; New Password screen never inspected            |
| Empty new password keeps Save and Login disabled       | Q4, Q6                                               | Yes                       | same chain                                                                                                                                                           | New Password selectors                                     |
| A too-short new password is rejected                   | Q4, Q6, **X1**                                       | Yes                       | same chain                                                                                                                                                           | see inconsistency 3                                        |
| Incorrect OTP is rejected (own chain, EN and AR)       | Q7, Q8, Q9, Q10, Q11, Q12                            | Yes                       | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS` plus `negativeCredentialTests` approval                                                                      | account-lock risk; recovery (Q12) must exist               |
| Complete reset, then log in with the new password (EN) | Q1 to Q4, Q6, **X1, X2, X3**                         | Yes                       | OTP request, password reset: `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`, `IOS_ALLOW_PASSWORD_RESET`, `MAZAD_ALLOW_PASSWORD_RESET`, `MAZAD_ALLOW_LOGOUT` | baseline password restore; logout ids; see inconsistency 4 |
| Complete reset (AR)                                    | n/a: the Arabic chain stops before saving a password | Yes                       | skipped by design                                                                                                                                                    |                                                            |
| Successful login (dealer), then logout                 | Gate only (and Q11 if locked)                        | Yes                       | Login and sign-out: `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_LOGOUT`                                                                                                | signed-in screen never inspected; logout ids pending       |
| Incorrect password for a registered account (fixme)    | Q10, Q11, Q12                                        | Yes                       | login attempts: `IOS_ALLOW_ACCOUNT_ACTIONS` plus `negativeCredentialTests`                                                                                           | needs the lock threshold before any run                    |
| Expired OTP is rejected (fixme)                        | Q4                                                   | Yes                       | OTP request, then waiting                                                                                                                                            | only if Q4 is confirmed and the wait is acceptable         |
| Invalid phone number format (fixme)                    | none of Q1 to Q12 or X1 to X3                        | No                        | none if local, otherwise a submission                                                                                                                                | needs a product rule for the format (not asked yet)        |
| Password confirmation mismatch (fixme)                 | none                                                 | Yes (to reach the screen) | same chain                                                                                                                                                           | only if iOS has a confirmation field (unknown)             |
| Password visibility toggles (pending)                  | none                                                 | No                        | none (local)                                                                                                                                                         | iOS developer request (`docs/ios-developer-request.md`)    |
| Individual-account variants of the OTP and login tests | n/a                                                  | Individual account        | **excluded** by the QA owner                                                                                                                                         | not run                                                    |

All rows needing a dealer account use the **dedicated synthetic dealer account**, which is not confirmed
(candidates stay unselected; credentials come from `.env` only). Every row with a switch also needs the
QA owner's explicit device-action authorization for that run.

### C. Supplementary tests to add only after X1 to X3 are Confirmed (not implemented)

- **X1:** new-password rule scenarios from the confirmed rules: below and at the minimum length, over the
  maximum, missing character types, disallowed characters, same as the old password; error text in
  English and Arabic. The existing too-short test is re-based on the confirmed minimum.
- **X2:** (a) the app signs in after a successful reset (or does not); (b) the old password stops working
  (needs a login attempt, so it needs the lock rules Q10 and Q11 first); (c) other sessions: not
  testable with one device, record the backend statement only.
- **X3:** record the confirmed limit only. No scenario that repeats resets to reach a limit is planned.

## Inconsistencies found (documentation and code review, nothing changed)

1. **Two switch families.** An account run needs both `IOS_ALLOW_*` and `MAZAD_ALLOW_*` switches (per run
   kind, table in section B). `.env.example` documents only the two `IOS_ALLOW_*` switches, so the
   `MAZAD_ALLOW_*` ones are visible only in code. My earlier reply said "the two account-action
   switches"; that was incomplete.
2. **Unregistered-number run needs fewer switches than it implies.** The Forgot Password
   "Unregistered phone number is rejected" scenario submits a number to the OTP path but needs only
   `IOS_ALLOW_ACCOUNT_ACTIONS`, not `MAZAD_ALLOW_OTP_REQUESTS` (the website scenario is also not behind
   the OTP switch). Q3 (unregistered-number scope) and Q5 (real SMS) decide whether it should be.
3. **Too-short password boundary rests on the website.** The existing steps use `abc` and a 5-character
   value (`BOUNDARY_TOO_SHORT_PASSWORD`), assuming a 6-character minimum taken from the website. The
   backend rule is X1 and is unconfirmed.
4. **Reset flow asserts automatic sign-in.** The iOS complete-reset scenario expects the app to be signed in
   after saving (Web behaviour). Whether iOS or the backend does that is X2(a), unconfirmed.
5. **Policy gate is all-or-nothing.** Even a plain login (no OTP) is blocked until the OTP facts (Q1 to
   Q9) are confirmed, because the policy file requires every fact for every account run kind. That is
   conservative; whether login-only runs should depend only on Q10 to Q12 is a QA owner decision (needs a
   code change; not made).
6. **Test counts differ by view.** 68 declared, 20 passed, 48 skipped is the whole listing (34 per
   language). The skipped total includes pending and fixme tests, not only policy-blocked ones; the
   per-language split (pending 1, fixme 12 English and 6 Arabic, skipped 11 and 17) is in the execution report.

No other contradiction found between the clarification request, the register and the execution report.

## Update 2026-11-09: implementation of the approved readiness changes

Implemented offline, see section 9 of `docs/ios-automation-readiness-review.md`. Effects on this tracker:
the run kind `unregistered-number` no longer exists (it is `unregistered-login` and `unregistered-otp-request`);
the below-minimum and reset steps now wait for X1 (and X2, X3 for the reset) instead of using website values;
and each run kind requires only the fact sets that apply to it (so a plain dealer login depends on Q10 to Q12 and
the account, not on Q1 to Q9). No answer has been received and every row above is still Awaiting Answer.

## Update 2026-11-09 (Dealer 715)

No answer has been received; every row above is still Awaiting Answer. The exact unanswered items per scenario group, and
the prerequisites per scenario, are in `docs/ios-dealer-715-readiness.md`.

## Answers received from the QA owner (2026-11-09)

Given in a message of 14 lines, read in order as Q1 to Q11 and X1 to X3. **Q12 (recovery of a locked or blocked account)
has no answer.** They are recorded as **Partially Answered**, not Confirmed: no backend source (API or configuration) and
no confirming backend owner is named, and several parts are open. Nothing was written to `config/ios-account-policy.ts`.

Open points per answer: Q1 the period the 4 requests are counted in; Q2 the unit (seconds assumed); Q3 whether account, IP
and unregistered number are also counted (only device is stated); Q4 is NOT waived (owner correction 2026-11-09: a successful reset still needs a valid OTP), so the OTP validity period is still required; Q6 what "No" means for the fixed OTP (exempt from which rules); Q7 and Q10 "no limit" and "none"
need a way to be recorded (the policy accepts only numbers today); Q11 the lock is triggered by OTP requests, not failed
logins, and who or what unlocks it; X1 maximum length, character types, reuse of the current password and whether a
violation shows on the same screen; X2 which of its three parts; Q12 missing.

## Corrections from the QA owner (2026-11-09)

- **Q4 is not ignored.** The OTP must still be valid for a successful reset; the validity period is still required.
- The limit of 3 OTP requests in a row without a valid OTP is a **separate throttling rule** of this suite (a margin under the
  reported block at 4); it is not a substitute for any answer.
- X2: the owner states that **a password reset signs the user in** (read as X2(a) true); X2(b) and X2(c) are not stated.
- The owner cannot verify backend policies himself; written answers are for the backend and iOS teams to give.

## Correction (2026-11-09): Q5 is NOT answered

Whether staging sends a real SMS (Q5) is **Awaiting Answer**. It must stay open until the backend confirms it in writing or
there is explicit verified evidence. An earlier note in this tracker and in `docs/ios-completion-path.md` attributed "no real SMS"
to the QA owner; that attribution was a misreading and is withdrawn. Until Q5 is answered, assume an OTP request may send a real SMS
to the phone on the account.

## Status note (2026-11-09, Login and Logout milestone)

Q10 (failed-login lock behavior) and Q12 (recovery) are both **Awaiting Answer** until the backend answers in writing. The QA owner's
earlier spoken statement for Q10 ("none") is kept as a note, is not recorded as a backend fact, and is not used by the policy file.
