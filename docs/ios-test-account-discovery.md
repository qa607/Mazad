# iOS test account discovery (staging, read-only)

2026-11-09, staging `stg-154` only. **Candidates for the QA owner's approval. Nothing is selected, logged
into or used.** No password, token or full phone number appears here or in the saved report
(`reports/ios-account-report/2026-11-09T15-15-35-827Z.json`, git-ignored, masked, mode 0600).

## How it was done

The project's existing approved route: `npm run ios:account-report` makes **one login to the staging back
office with the Dev Root admin account** (that login is the only way the back office can be read), then
only GET requests (list searches); every other write request is aborted (0 were attempted). It opens or
edits no record. No test account was logged into, no OTP requested or submitted, no registration, no
password reset. Search words: `test`, `qa`, `demo`, `automation` (substring matches on the name).
Dealer IDs 1331, 779 and 715 were excluded before listing (only their count is recorded).

## Dealer: no eligible candidate

After the exclusions, the dealer list holds **3 other matches**, all for the broad word `qa` only (none
for `test`, `demo` or `automation`):

| ID    | Status           | Registered (masked name) | Joined     | Why not eligible                         |
| ----- | ---------------- | ------------------------ | ---------- | ---------------------------------------- |
| 40187 | waiting transfer | company name, 25 chars   | 2026-05-09 | not active; looks like a real business   |
| 2256  | waiting transfer | 9-character name         | 2022-06-26 | not active; no sign it is a test account |
| 674   | waiting transfer | 12-character name        | 2021-07-20 | not active; no sign it is a test account |

**There is no dealer test account to propose.** A dealer would have to be created or designated by you
(in the back office or by the backend team), or the search widened by a word you know it carries.

## Individual: one plausible candidate, others weaker

Eligible means active. Nine individuals match a stronger word (`test` or `automation`); the list also holds
197 weak `qa` substring matches that I did not consider.

| ID           | Status           | Masked name               | Verified | Registration | Joined            | Assessment                                                                                                                              |
| ------------ | ---------------- | ------------------------- | -------- | ------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **45779**    | **active**       | 4 characters (`t**t`)     | No       | Deposit      | 2026-10-21        | **Best candidate.** The name is 4 characters starting and ending with "t" (very likely literally "test"), recent, active, not verified. |
| 45777        | waiting transfer | same 4-character name     | No       | Deposit      | 2026-10-08        | Same name as 45779 but not active; probably an earlier test account.                                                                    |
| 45771        | waiting transfer | same 4-character name     | No       | Deposit      | 2026-09-28        | Same; not active.                                                                                                                       |
| 45789        | **inactive**     | 19 characters (`Q...r`)   | No       | Deposit      | 2026-11-04        | Matches **both** `qa` and `automation`: looks designated for automation, but inactive (cannot be used unless you reactivate it).        |
| 43601, 40444 | inactive         | 5 and 14 characters       | No       | not set      | 2026-07 / 2026-05 | Inactive.                                                                                                                               |
| 7946         | active           | 22 characters             | **Yes**  | Deposit      | 2024-04-16        | Active but verified, older and long name: could be a real customer containing "test". Not recommended.                                  |
| 5450         | active           | 12 characters             | **Yes**  | Deposit      | 2023-07-10        | Same concern.                                                                                                                           |
| 3038         | active           | 8 characters (`T******S`) | **Yes**  | Deposit      | 2022-08-09        | Same concern.                                                                                                                           |

**Candidate: Individual ID 45779.** The back office cannot prove an account is synthetic or dedicated: that
needs your confirmation (or the backend team's). Nothing in the list shows an owner, only a name, status,
registration type and join date.

## Credentials

- The local `.env` has **no credentials for any Dealer or Individual account**: `IOS_TEST_DEALER_PHONE`,
  `IOS_TEST_DEALER_PASSWORD` and any buyer variables are unset (names only were checked). It has the Dev Root
  admin credentials (used only for this discovery) and `OTP_CODE`.
- **No account password is known anywhere in the project.** The Web and Android suites find accounts in the
  back office and set a password by Forgot Password; iOS would do the same, so the first reset sets the baseline
  password you put in `.env`.
- Supplied staging OTP: **`1111`** (given by you, 2026-11-09). Recorded as a supplied test value only. It is
  **not** a policy fact: whether it follows the same rules as a real OTP (`otp.fixedOtpFollowsSameRules`), how
  long it is valid and its attempt limits are still unconfirmed. I did not compare it with the `OTP_CODE` in
  `.env` and did not request or submit any OTP.

## Restrictions and missing information

- The Individual account is **currently excluded from iOS automation by your earlier decision**
  (`INDIVIDUAL_EXCLUDED_REASON`, 17 declared tests); using 45779 needs you to lift that. The Android and Web
  suites recorded an Individual account rate-limited by earlier testing (no recorded limit); it is not known
  whether 45779 was that account.
- The same blockers apply to any account: the 14 backend facts and X1 to X3, the `testAccount` confirmation, the
  approval switches, the ledger (`npm run ios:otp-ledger-init`, yours), the iOS credentials in `.env`, and your
  run authorization.
- Whether the "Verified: No" state of 45779 limits any app feature (for example bidding) is unknown.

## iOS scenarios each account could support (once approved and unblocked)

| Account          | Supports                                                                                                                                                                                                 | Cannot support                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Dealer: none     | The iOS suite's dealer scenarios (successful login and logout, Forgot Password chains, incorrect OTP, the reset) are written for a dealer and cannot run                                                 | all of them                                                                                          |
| Individual 45779 | Login (successful, then logout), Forgot Password to the OTP step, correct and incorrect OTP, below-minimum password, the reset (after X1 to X3). The existing Individual tests are declared and excluded | Dealer-only features; anything needing a verified account (unknown); the dealer scenarios as written |

## Decision needed

1. Approve Individual **45779** as the designated test account (or name another), and say whether it is synthetic and
   dedicated; and lift the Individual exclusion if you want it used.
2. Provide or designate a **Dealer** test account: none exists among the matches.
3. Say whether the report may be widened (more search words) to look for a dealer.

---

## Update: Dealer discovery without a name filter (2026-11-09, read-only)

The owner lifted the Dealer restriction (any suitable existing Dealer; 1331, 779 and 715 may be considered; no
name filter). One back-office login (Dev Root, admin), then only GET list pages (0 writes attempted); masked
report `reports/ios-account-report/2026-11-09T16-16-10-357Z.json`. No test account was used, no OTP requested
(the supplied staging OTP `1111` is recorded only; it is not a policy fact), no password reset, no data changed.

**All 729 Dealers were read** (37 list pages): **160 active**, 70 verifying, 490 waiting transfer, 6 inactive,
3 blocked. Of the 160 active: 159 have a deposit above 0 (74 with "Deposit 5,000", 67 with 5,000 plus a
10,000 promissory, the rest 3,000 to 15,000); joined 2021: 14, 2022: 10, 2023: 11, 2024: 22, 2025: 26,
2026: 77. The list does not show a "verified" or "registration type" value for Dealers.

**What identifies a test account:** only the name. The three IDs the owner had excluded are the only Dealers
whose names contain `test`; all three are **active** with "Deposit 5,000, Promissory 0":

| ID   | Status | Joined     | Deposit / promissory | Masked phone |
| ---- | ------ | ---------- | -------------------- | ------------ |
| 1331 | active | 2021-12-13 | 5,000 / 0            | `0*******66` |
| 779  | active | 2021-08-23 | 5,000 / 0            | `0*******77` |
| 715  | active | 2021-08-05 | 5,000 / 0            | `0*******11` |

The other 157 active Dealers have no sign of being test accounts and must be assumed to be **real businesses**:
a password reset on one of them would lock out its owner, and an OTP request could send a real SMS (whether
staging sends real SMS, Q5, is unconfirmed). They are not proposed.

**Important:** the Web and Android suites choose their Dealer as the _first active account whose name contains
`test`_ (`findActiveAccount`), which is the first of the three (1331, listed first). iOS using the same account
would share its password and sign-in state with those suites. Using **715** (or 779) avoids that collision.

### Intended account, and what a run may change (for approval before any account action)

- **Intended Dealer: 715** (alternative 779; 1331 only if you accept sharing it with Web and Android).
- **What the tests may change on that account:**
  1. **Its password**: the reset chain sets it to the baseline password you put in `.env`; the first reset
     defines it, since no password is known (a dealer with a different current password is locked out until then).
  2. **Its sign-in state**: logins and the reset sign it in; cleanup signs it out.
  3. **OTP requests**: each request may send an SMS to the phone number on the account (Q5 unconfirmed) and
     counts toward unknown backend limits (Q1 to Q4); incorrect-OTP and wrong-password tests may count toward a lock
     (Q9 to Q11).
  4. Nothing else: no profile, deposit, bids or other account data is written by the planned scenarios.
     Whether the app shows a one-time gate after login or a reset (for example updated terms) is unknown; if it does,
     the test fails and does not accept it.
- **Credentials:** none exist for it in `.env` and no password is known. I have not written any credential or
  selected an account in the policy (`testAccount` is `null`).

### Dealer coverage prepared (English and Arabic through shared scenarios, no duplicates)

Already written and blocked only by the account, policy, switches and ledger: successful login with logout,
Forgot Password to the OTP step, empty OTP, correct OTP, empty and below-minimum new password (after X1), the
reset (after X1 to X3), incorrect OTP (own chain). Dealer-specific screens (account tab, my bids, my actions,
notifications; the Android suite has these screens) cannot be written until the signed-in iOS screens are
inspected after the first authorized login.

---

## Dealer 715 configured (2026-11-09; no account action)

Owner approved **Dealer 715** as the dedicated iOS Dealer (1331 and 779 are not used). Done with one read-only
back-office session (`npm run ios:dealer-config`, Dev Root login, GET list pages only, 0 write requests attempted):

- Verified in the staging **Dealers** list: role Dealer, status **active**, exactly one row with this ID.
- Wrote **only** `IOS_TEST_DEALER_PHONE` to the local `.env` (file mode kept at 0600). The phone was never printed,
  attached or saved elsewhere. `IOS_TEST_DEALER_PASSWORD` is **unset** (no password was invented or retrieved).
- `OTP_CODE` in `.env` equals the supplied staging value `1111` (checked as a yes/no only; it was not changed).
- Not done, by design: `testAccount` stays `null` (it needs the owner's five confirmations: back-office record checked,
  phone QA-controlled, no real customer data, used only by automation, recovery route confirmed, with approver and date,
  in `config/ios-account-policy.ts`); no switch set; ledger not initialized; `acceptedUnrecordedFacts` null.

Nothing was submitted, requested or changed on the account.
