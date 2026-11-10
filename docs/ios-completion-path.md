# iOS suite: path to completion

2026-11-09. One page of what is done, what blocks each scenario, and exactly who must act next. No account action was
taken; Appium and the iPhone were not used. This replaces further status documents: update it, do not add another.

## 1. Counts, reconciled

| View                                    | Total | Passed                                             | Failed | Not run                                     |
| --------------------------------------- | ----- | -------------------------------------------------- | ------ | ------------------------------------------- |
| Historical device baseline (2026-11-09) | 68    | **20**                                             | **0**  | 48 skipped                                  |
| Declared inventory now (`--list`)       | 80    | 20 (the same tests, last run before the additions) | 0      | 60 not run: the 48, plus **12 added since** |

The 12 added since the baseline are declared structure only, never run: 8 Dealer signed-in scenarios (4 shared scenarios,
English and Arabic) and 4 Registration scenarios (2 shared, English and Arabic). Nothing newly added has been executed.
Current categories of the 80: runnable 20, excluded 17, fixme 10, pending implementation 16, policy blocked 17
(`node scripts/ios-test-report.mjs`). Offline selfchecks (282) are separate and are never counted as device passes.

## 2. Scenario status

| Scenario (English and Arabic share one definition)                | State                                          | What blocks it, exactly                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest Login and Forgot Password display and local validation      | **Done, passed on the device** (20 tests)      | nothing                                                                                                                                                                                                                                                                    |
| Forgot Password: OTP request, validation (`1111`), empty OTP      | Written, blocked                               | Q1 to Q7; Dealer password and confirmations; switches; ledger; chain approval; OTP screen never inspected                                                                                                                                                                  |
| Incorrect OTP                                                     | Written, blocked                               | the above plus Q8, Q9, Q10, Q11; negative-test approval                                                                                                                                                                                                                    |
| New Password: empty, below minimum                                | Empty written; below-minimum written, X1-gated | New Password screen never inspected; X1                                                                                                                                                                                                                                    |
| Password reset to the baseline                                    | Written, X-gated                               | X1 (reuse allowed), X2(a), X3; baseline password; five switches; logout ids                                                                                                                                                                                                |
| Dealer login and logout                                           | **Not policy-blocked** (corrected 2026-11-10)  | Nothing in `config/ios-account-policy.ts` or `.env`: `testAccount`, `login.failureThreshold` ('none') and `currentPasswordVerified` are recorded, Q12/Q10/Q11 are not required by the `login` run kind (OTP-only), and both switches are on. Not yet executed on a device. |
| Dealer account tab, My Bids, My Actions, Notifications            | **Declared only (pending)**                    | signed-in screens never inspected: no verified selector, text or expected result exists, none is invented                                                                                                                                                                  |
| Registration (open form; submit)                                  | **Declared only (pending)**                    | the form was never opened; Arabic label unknown; submitting creates an account and has no run kind, policy or approved data                                                                                                                                                |
| Individual account scenarios                                      | Written, **excluded** (17)                     | Individual 45779 is unapproved (synthetic and dedicated use unconfirmed) and the exclusion is still in force                                                                                                                                                               |
| Admin                                                             | Not an iOS flow                                | Admin is the back office (Dev Root, Web). No iOS Admin scenario is defined: tell me what you want tested                                                                                                                                                                   |
| Regular User                                                      | Not defined                                    | If you mean the Individual account, see above; otherwise define it                                                                                                                                                                                                         |
| Password show/hide                                                | Pending                                        | the app does not expose the control (iOS developer request not sent)                                                                                                                                                                                                       |
| Invalid phone format, expired OTP, password confirmation mismatch | Fixme                                          | no platform records the expected result; not invented                                                                                                                                                                                                                      |

## 3. Dealer 715 confirmation checklist (nothing is marked true; `testAccount` is `null`)

Five separate questions. I mark one true only after your explicit approval **and** the evidence you name.

| #   | Question                                | Current evidence                                                                                                                          | Still unknown                                                             | Who confirms                                                                         |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Back-office Dealer 715 record checked   | Dealers-list row only: role Dealer, status active, deposit 5,000, joined 2021-08-05, name contains `test`. The record page was not opened | What the record itself shows (owner, notes, contact, linked data)         | You, after opening the record in the back office (or asking me to open it read-only) |
| 2   | Phone number is QA-controlled           | The phone is on the account and in `.env`. Q5 (does staging send a real SMS) is **unanswered**, so an OTP request may text this number    | Who owns and can read that number; whether it is a real person's          | You (QA owns the number)                                                             |
| 3   | Account contains no real customer data  | Name pattern `test` only                                                                                                                  | Whether the profile, deposit or history belong to a real business         | You, from the back-office record                                                     |
| 4   | Account is dedicated to automation      | Web and Android pick Dealer 1331, not 715                                                                                                 | Whether any person or other suite uses 715                                | You                                                                                  |
| 5   | Account recovery procedure is confirmed | Nothing: Q12 is unanswered                                                                                                                | How an OTP block (24 hours) or a wrong password is recovered, and by whom | Backend team in writing, then you confirm it works                                   |

Also recorded with the confirmations: your approver name and the date.

## 4. Outstanding questions for the backend and iOS teams (none answered in writing; your own statements are noted, and Q5 is not one of them)

Backend team, written, for staging. The suite's own safety limits (at most 3 OTP requests in a row without a valid OTP, at
least 60 seconds apart) stay test-only safeguards and are **not** backend policy. A successful reset must require a valid OTP.

| Topic                                    | Question                                                                                                                                                                                                      | What we have                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| OTP validity and counting period         | **Q4** how long an OTP stays valid. **Q1** the period the OTP requests are counted in                                                                                                                         | Your statement: blocks at 4 sent, locked 24 hours. Validity and period not given  |
| OTP request scope and fixed OTP          | **Q3** what the limit counts against besides the device. **Q6** what "no" means for the fixed OTP `1111` (which rules it is exempt from). **Q5** whether staging sends a real SMS (unanswered; assume it may) | Device only; Q6 unclear                                                           |
| OTP attempts and lock behavior           | **Q7** attempts per OTP. **Q8** a wrong OTP cancels the code. **Q9** wrong OTPs count toward a lock. **Q10** failed logins that lock. **Q11** what is blocked and for how long                                | Your statements: no limit on entering, no, no, none, OTP sending blocked 24 hours |
| Account and OTP recovery                 | **Q12** how an OTP block or a locked account is recovered, and by whom                                                                                                                                        | Nothing                                                                           |
| Password minimum, maximum and characters | **X1** maximum length, allowed or required character types, whether a violation is shown on the same screen                                                                                                   | Minimum 6 characters only (your statement)                                        |
| Password reuse                           | **X1** whether the new password may equal the current one                                                                                                                                                     | Nothing                                                                           |
| Session invalidation after reset         | **X2(b)** old password stops working. **X2(c)** other sessions                                                                                                                                                | Reset logs the user in (your statement)                                           |
| Reset limits                             | **X3** limits on resets                                                                                                                                                                                       | None (your statement)                                                             |

iOS team: the password show/hide control (not exposed in the Login accessibility tree); whether `navigationBarClose` is an
identifier or only a label; ids for Log In, Send and Close if possible; whether the New Password screen has a confirmation field.
The selector and navigation behavior of the OTP, New Password and signed-in screens is **observed by the first run**, not asked.

## 5. Authorization checklist (four lists)

**A. Account confirmations only you can give**

- The five answers in section 3, with your approver name and date.
- Permission to record your own statements (section 4, "what we have") in the policy file as QA-owner-approved facts, with your
  statement as the source. Recording is a separate step from answering.

**B. Answers that must come from the teams** (you do not verify these)

- Everything in section 4 marked as missing: Q4, Q1 period, Q3 other scopes, Q6, Q12, X1 maximum and characters, reuse, X2(b),
  X2(c); and the iOS team's replies.

**C. Technical actions you must authorize explicitly**

- Initialize the OTP ledger (`npm run ios:otp-ledger-init`), by you or by me on your word.
- Set the five approval switches, by name, for the first run.
- The first run itself (staging, physical iPhone, Dealer 715, English), and later each further run.
- Setting `testAccount` and recording policy facts.

**D. Possible without account access (done or available now)**

- Done: all scenario code, screen objects, the central guard, the OTP permit and ledger, the OTP throttling limits (3 in a row
  without a valid OTP, 60 seconds apart), the baseline-password guard, typed reports, the generated baseline password in `.env`.
- Available: guest display and local-validation reruns on the device (no OTP, no login), if you want them rerun first.
- Not possible without an account action: the OTP, New Password and signed-in screens, selectors, text, logout ids.

## 6. First English run: the exact sequence (not executed; each step waits for its authorization)

Preconditions: items A and C above; Appium started by me for this run and stopped at its end.

1. **Preflight (no account action):** verify `.env` (phone, password, OTP value present), switches as authorized, staging only,
   journals clear, the app's stored backend is staging, installed build on the approved list. Any failure stops the run.
2. **Ledger:** you initialize it (or authorize me). The run refuses to request an OTP while it is missing or damaged.
3. **Request one OTP** (1 of the 3 allowed in a row): Login, Forgot Password, the phone (Dealer 715), Send. A single-use permit is
   issued first and recorded in the ledger. 60 seconds minimum since any earlier request.
4. **Inspect the OTP screen:** record heading, fields, Verify button, labels (no value recorded). Verify is disabled when empty.
5. **Enter the supplied staging OTP once.** The expected result is the New Password screen; a valid OTP is required. On success the
   ledger records a valid-OTP marker (which resets the request count). A wrong result stops the chain; nothing is retried.
6. **Inspect the New Password screen:** heading, field(s), Save button, whether a confirmation field exists. Empty password keeps
   Save disabled. The below-minimum check runs only when X1's minimum, display and reuse are recorded.
7. **Reset Dealer 715 to the generated baseline** (the only password change). The journal records the entry **before** the save
   and marks it applied. The password is never printed.
8. **Verify the signed-in state:** the app is signed in (your statement; confirmed by observation). If it is not, the step fails
   and is reported; nothing is accepted automatically (no updated-terms or prompt is dismissed).
9. **Inspect the signed-in screen:** record the account area, the logout item and its confirmation (labels and ids).
10. **Logout** only if `MAZAD_ALLOW_LOGOUT` is authorized and its selectors were just observed; then verify the guest state.
11. **Cleanup and report:** the app is returned to the guest state, the journal entry is marked restored, Appium is stopped,
    and the report lists device results (passed, failed, skipped, blocked) separately from offline checks.

Then, in the same authorized window, the Arabic chain, the incorrect-OTP chains, the Dealer login with the baseline (allowed
because a completed reset is on record), and the full local validation set, within the OTP limits above.

Estimate once A and C are given: first run about 45 minutes; fixes 1 to 2 hours; full English and Arabic run 20 to 30 minutes.

## 7. New information: Dealer 715 record viewed read-only (2026-11-09)

One back-office session (Dev Root login, GET only, **0 write requests**, no action button clicked), masked. This is evidence, not
confirmation; nothing is marked true.

- **Record:** Dealers list, status **active**, not on hold, documents reviewed = yes, created 2021-08-05, **last updated
  2026-10-21 18:46** (a recent change; consistent with a test password reset, not proof). Remaining insurance amount 0. City set.
- **Filled:** Arabic and English names, phone, national ID, company name (Arabic and English), legal company, work phone.
- **Empty:** email, IBAN, CR number, mobile phone number, relation rep name, address fields, uploaded documents, and all three
  comment fields (no note says "test account").
- **What it does not show:** who owns the phone, or whether the names, national ID and company are invented. The name contains
  `test` (the only indication). Confirmations 2, 3 and 4 therefore stay yours; confirmation 1 is now evidenced.

**Minimum written backend answers for the first valid reset** (what the code requires for the English reset chain; your own
statements cover Q1 count, Q2, Q7, Q10, X2(a), X3 and can be recorded once you approve):

1. **Q12** recovery of an OTP block or locked account, and who does it.
2. **Q5** whether staging sends a real SMS (Awaiting Answer).
3. **Q4** how long an OTP stays valid.
4. **Q1** the period the 4 requests are counted in.
5. **Q3** whether the limit is also counted per account, IP or number (only device is stated).
6. **Q6** what "no" means for the fixed OTP `1111`.
7. **X1** whether the new password may equal the current one (the first reset does not depend on it, repeat runs do).

**iOS: nothing can be inspected further without an account action.** The guest Login and Forgot Password screens are done. Still
unseen, each needing the first run: the OTP screen (one field or four, the Verify label, the incorrect-OTP message), the New
Password screen (heading, field, Save and Login label, whether a confirmation field exists, error texts), what the app shows after
the reset (signed-in screen, any one-time prompt), and the account area with the logout item and its confirmation. No iOS
developer answer blocks the first run; selectors are located by exact label and fail loudly if wrong.

## 8. Selected Dealer changed to <selected-dealer-id> (2026-11-09); Dealer 715 is no longer the active account

`.env` now selects Dealer **<selected-dealer-id>** (ID and the back-office phone; password **unset**: Dealer 715's generated password was archived
under a name no code reads, and no password is verified for <selected-dealer-id>). Dealer 715's readiness records above are kept as history.
The Login and Logout tests use the same shared English and Arabic scenarios; nothing else changed in them.

**Read-only back-office evidence for <selected-dealer-id>** (one session, GET only, 0 writes; masked, not a confirmation):

- The record for the configured ID carries the owner-supplied name (Arabic and English name fields are identical and match).
- Status **active**, but **"Is Hold": "Hold by system"**; documents reviewed: **no**; remaining insurance 1,800 (deposit 13,200);
  created 2026-08-06; **last updated today (2026-11-09 20:26)**, so something changed the record today.
- **Filled:** email, IBAN, national ID, CR number, representative name, company names and all address fields.
  **Empty:** work and mobile phone numbers, uploaded documents, all comment fields (nothing says "test account").
- **Reading:** the filled IBAN, CR number and address look like a **real business profile**, not invented QA data, and the account
  is on a system hold. This is the opposite of the evidence for "no real customer data" and "dedicated to automation". The owner
  decides; I record nothing as confirmed.

**New code (offline):** a Dealer login is allowed only after a completed reset to the baseline **or** a recorded owner statement
(`testAccount.currentPasswordVerified`, with source, approver and date) that the `.env` password is the account's current password.
Nothing is recorded; the real policy still holds `testAccount: null`.

**Owner decision (2026-11-09), confirmed, not to be asked again:** Dealer **<selected-dealer-id>** was created by the QA owner specifically for
testing and is approved for the staging iOS automation. No other Dealer is to be used. Company name for back-office comparisons:
the exact Arabic text `[name masked]` in both name fields (no translation or transliteration); it matched read-only and is
never entered in the app or written in executable code.

What this settles and what it does not (nothing in `config/ios-account-policy.ts` is changed yet; `testAccount` stays `null`):

- Settled by the statement, for the record to be written when you approve: _no real customer data_ and _dedicated to automation_
  (you created it for that), and _back-office record checked_ (evidence in this section).
- Still open for `testAccount`: _phone is QA-controlled_ (not stated) and _recovery route confirmed_ (needs Q12).
- Still open for the first Login run: the password is **unset** (not invented); the account shows **"Hold by system"** and
  unreviewed documents in the back office, which may affect what the app allows after login; switches; Q10 and Q12 in writing.

**Owner confirmations (2026-11-09), recorded here, not yet in the policy file:**

- Dealer <selected-dealer-id>'s phone number is **QA-controlled and intended for testing** (confirmed by the QA owner).
- The password in `.env` is the one the QA owner supplied and is the account's current password (stated by the owner).
- **Authorized and enabled in `.env`:** `IOS_ALLOW_ACCOUNT_ACTIONS` and `MAZAD_ALLOW_LOGOUT`. The other three switches stay disabled.
- **The first device run is authorized, but is held:** Q10 and Q12 stay Awaiting Answer until the backend answers in writing, and
  the run does not start before that. With Q10, Q12 and `testAccount` unrecorded, the central guard refuses the Dealer login even
  with both switches on; it is not bypassed.

**Correction (2026-11-10):** the paragraph above describes the state at the moment it was written, later in the same
session `testAccount` (confirmed synthetic and dedicated, with `currentPasswordVerified: true`) and `login.failureThreshold`
('none') were recorded in `config/ios-account-policy.ts`, as the owner's own statements with source and approval, for the
Login/Logout milestone only. Verified now (`playwright test --list`, declaration only, no device): the `login` run kind's
policy set (`RUN_KIND_SETS.login = ['always', 'login']`) does not include `recovery.procedure` (Q12) at all — that fact
gates only the OTP-dependent run kinds, confirmed by the passing selfcheck "the recovery procedure (Q12) is required by
the OTP flows only, never by a Login/Logout run" (`ui-tests/selfcheck/ios-readiness.selfcheck.spec.ts`). So the claim that
the central guard still refuses the Dealer login is now incorrect: `"Dealer login signs in and logout returns to the guest
state"` (EN and AR, `tests-ios/login.spec.ts`) carries no policy or authorization skip annotation. It has not been executed
on a device; only its declaration-time gating was checked.
