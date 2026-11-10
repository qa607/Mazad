# Dealer 715: readiness for the first account-action run

2026-11-09. Staging `stg-154` only. Documentation of the current state; **no account action was taken** (no login,
OTP request, registration, reset or data change; no switch set; ledger not initialized; Appium not started; no device).

## 1. Environment (names and presence only)

| Item                                      | State                                                      |
| ----------------------------------------- | ---------------------------------------------------------- |
| `IOS_TEST_DEALER_PHONE`                   | set (Dealer 715's phone, from the back office; unchanged)  |
| `IOS_TEST_DEALER_PASSWORD`                | **unset**; not generated, retrieved or invented            |
| `OTP_CODE`                                | set; equals the supplied staging value (checked as yes/no) |
| `.env` permissions                        | 0600                                                       |
| Approval switches (5)                     | all unset                                                  |
| OTP ledger                                | does not exist (your step: `npm run ios:otp-ledger-init`)  |
| `testAccount` / `acceptedUnrecordedFacts` | `null` / `null`                                            |

## 2. Account confirmation (`testAccount`): nothing is marked true

All five fields stay **unconfirmed** and `testAccount` stays `null` until you confirm each. What I can and cannot show:

| Field                     | Evidence available                                                                                                                                                    | Missing (your confirmation)                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `backOfficeRecordChecked` | The Dealers list row: role Dealer, status **active**, one row for ID 715, deposit 5,000, joined 2021-08-05, name contains `test`. The record page was **not opened**. | You (or I, if you ask) opening the record read-only and confirming it. |
| `phoneIsQaControlled`     | None. The list shows a phone, not who owns it or receives its SMS.                                                                                                    | You confirm the phone is controlled by QA.                             |
| `noRealCustomerData`      | Weak: only the name pattern. Nothing shows the account holds no real customer data.                                                                                   | You confirm it.                                                        |
| `usedOnlyByAutomation`    | None; the Web and Android suites choose the first active `test` Dealer (1331), not 715, but nothing shows 715 is unused by others.                                    | You confirm no person or other suite uses it.                          |
| `recoveryRouteConfirmed`  | None: the recovery procedure (Q12) is unanswered.                                                                                                                     | The backend's written procedure, and your confirmation that it works.  |

Also required in the record: `role: 'dealer'`, `confirmedSyntheticAndDedicated: true`, a `source` and the approver and date
(`approval: { by, on }`). Filled in `config/ios-account-policy.ts` in code review, after you confirm.

## 3. Backend answers still missing (all unanswered; the tracker has no answer received)

Not inferred from Web, Android or earlier observation. `acceptedUnrecordedFacts` stays `null`. Question numbers are those of
`docs/ios-backend-clarification-request.md`; register items in `docs/ios-backend-policy-register.md`.

| Group               | Unanswered items (exact)                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login and lockout   | Q10 failed logins that lock, and the counting window (register #10, #11); Q11 lock duration and unlock (#12); Q12 recovery of a locked or blocked account (#14)                                                     |
| OTP request         | Q1 requests allowed and the period (#1, #2); Q2 wait between requests (#3); Q3 what limits count against (#4); Q5 whether staging sends real SMS (#9)                                                               |
| OTP validation      | Q4 OTP validity (#7); Q6 whether the fixed OTP (`1111`) follows the same rules (#8); Q7 attempts per OTP (#5)                                                                                                       |
| Incorrect OTP       | Q8 whether a wrong OTP cancels the code (#6); Q9 whether wrong OTPs count toward a lock (#13), plus the login items above                                                                                           |
| Password validation | **X1** (supplementary): minimum length, whether a violation is shown on the same screen, whether the current password may be reused; character rules                                                                |
| Reset and sessions  | **X2(a)** whether the iOS app is signed in automatically after a reset (needed to know the end state); X2(b) old password invalidated; X2(c) other sessions (cannot be tested with one device); **X3** reset limits |

## 4. Prerequisites by scenario (all share: confirmed `testAccount`, recovery procedure Q12, clean journals, your run authorization)

"Selectors/text" means the iOS screen has never been inspected, so the first run of that scenario verifies it.

| Scenario (English and Arabic share one definition)                                          | Backend facts                                    | Switches                                                                                                                                | Also needed                                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Forgot Password: OTP step, empty OTP, correct OTP (`1111`), empty new password (base chain) | Q1, Q2, Q3, Q5, Q4, Q6, Q7                       | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`                                                                                 | password var; ledger; approved chain; OTP and New Password screens inspected; full text gate      |
| Incorrect OTP (own chain per language)                                                      | base chain facts + Q8, Q9, Q10, Q11              | same two                                                                                                                                | negative-test approval; chain approval                                                            |
| New password below the minimum                                                              | base chain facts + X1                            | same two                                                                                                                                | X1 steps are left out of the chain until confirmed                                                |
| Password reset to the baseline (English chain only)                                         | base chain + Q10, Q11 + X1, X2, X3               | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_OTP_REQUESTS`, `IOS_ALLOW_PASSWORD_RESET`, `MAZAD_ALLOW_PASSWORD_RESET`, `MAZAD_ALLOW_LOGOUT` | X1 reuse must be confirmed allowed; logout ids if X2(a) is true; your baseline password in `.env` |
| Dealer login and logout                                                                     | Q10, Q11 (and Q12)                               | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_LOGOUT`                                                                                       | **baseline established (below)**; signed-in screen inspected; logout ids                          |
| Unregistered number rejected (Login, Forgot Password)                                       | Login: Q10, Q11. Forgot Password: Q1, Q2, Q3, Q5 | Login: `IOS_ALLOW_ACCOUNT_ACTIONS`. Forgot Password: that plus `MAZAD_ALLOW_OTP_REQUESTS`                                               | ledger (Forgot Password)                                                                          |
| Signed-in Dealer screens (account tab, My Bids, My Actions, Notifications)                  | Q10, Q11 (a login)                               | `IOS_ALLOW_ACCOUNT_ACTIONS`, `MAZAD_ALLOW_LOGOUT`                                                                                       | the signed-in screens must be inspected first; no selector or expectation is written yet          |

**Baseline password hazard (fixed in code):** the Dealer's current password is unknown, so a login with the baseline
password can only succeed after a **completed reset to the baseline**. The guard now refuses a dealer login, and the login test
skips with an explicit reason, until a completed reset is on record in the journal (a `restored` entry). A reset earlier in the
same run counts, so the English reset chain must pass before the login test. If the X1, X2 and X3 answers are missing, the
reset step is left out of the chain, no baseline is established, and the login test is skipped, not run. If you set the account's
password by another route, tell me: the journal would have to record that, and I will not assume it.

## 5. Implementation status (offline only)

Complete: shared English/Arabic scenarios for login, Forgot Password, OTP, below-minimum and reset, incorrect OTP; account,
OTP, New Password and Dealer screen objects; central guard, permit and ledger; baseline-password guard (new); typed
categories; and a Dealer scenario structure (`tests-ios/dealer.spec.ts`: four signed-in scenarios, declared pending, per language).
Not written, by design: any selector, text or expected result for the OTP, New Password and signed-in screens, and the Dealer
scenario bodies.

Declared tests: **76** (20 runnable and passed on the device earlier, 17 excluded, 10 fixme, 12 pending implementation, 17
policy blocked). Offline checks: TypeScript, ESLint, Prettier and 282 selfchecks pass; they are not device results.

## 6. Ready for the first account-action run?

**No.** Missing, in order: your baseline password; the five confirmations; the backend answers (14 facts, X1 to X3); the ledger
init; the approval switches for the run; your authorization. After those, the first run is an inspection and verification run of
the OTP, New Password and signed-in screens, not a pass run.
