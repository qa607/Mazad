# Mobile registration automation: progress (Android + iOS)

2026-11-11. One page of what is done, what is blocked, and why, across both platforms. Replaces
`docs/android-registration-progress.md` (superseded, same content plus iOS and the uniqueness
investigation). Update this file as work continues; do not add a second status document.

## 1. Coverage matrix

| Layer                                            | Android Personal   | Android Company  | iOS Personal | iOS Company |
| ------------------------------------------------ | ------------------ | ---------------- | ------------ | ----------- |
| UI — entry → account type                        | Done (EN+AR)       | Done (EN+AR)     | Blocked      | Blocked     |
| UI — Step 2 field inventory                      | Done (EN+AR)       | Done (EN+AR)     | Blocked      | Blocked     |
| UI — required-field negative                     | Done (EN+AR)       | Done (EN+AR)     | Blocked      | Blocked     |
| UI — password length (accepted behavior)         | Done (EN+AR)       | Done (EN+AR)     | Blocked      | Blocked     |
| UI — format boundaries (max-length, min-length)  | Done (EN+AR)       | Done (EN+AR)     | Blocked      | Blocked     |
| UI — positive (fill enables submit)              | Done (EN+AR)       | Done (EN+AR)     | Blocked      | Blocked     |
| UI — navigation/back                             | Done (Personal)    | —                | Blocked      | Blocked     |
| UI — submission / OTP / account creation         | **Done (E2E, EN)** | Blocked (Nafath) | Blocked      | Blocked     |
| UI — Forgot Password + Login (post-registration) | **Done (EN)**      | n/a              | Blocked      | Blocked     |
| CR/Tax uniqueness validation                     | Blocked            | Blocked          | Blocked      | Blocked     |
| API / Swagger                                    | Blocked            | Blocked          | Blocked      | Blocked     |
| Database verification                            | Blocked            | Blocked          | Blocked      | Blocked     |

**Android: 56/56 UI tests pass** (`tests/mobile/android/registration.spec.ts`; see run log,
2026-11-11). One run hit a transient Appium/emulator infra timeout (`Timed out waiting for the
root AccessibilityNodeInfo`) after the emulator had been running ~19h at pegged CPU; killing and
relaunching it fresh (`npm run emulator:start`, no snapshot ever saved) resolved it. One test
needed a correction after investigation (Mobile Number's own live formatter races WebdriverIO's
synthetic typing — an automation-timing artifact, not a business rule; see §2).

**iOS: 0 tests run — fully blocked**, see §4. Nothing was implemented or guessed for iOS.

---

## 2. Android — completed

- Entry point: More tab → guest prompt → "Create a new account" (`MazadRegistrationScreen`).
- Account-type selection screen: heading, both cards, Next button state.
- Step 2 field inventory for both account types, both languages: every label, hint, placeholder
  and button text confirmed against the live app (not guessed). App-only strings live in
  `test-data/mobile-app.data.ts` (`registrationFlow`); website-shared strings are read from `t()`
  — see the class doc comment in `src/mobile/screens/registration.screen.ts` for exactly which is
  which, including two documented wording differences from the website (Commercial Registry
  label, City/Region placeholder). No email field on either form (`emailFieldCount()` asserts 0).
- Required-field validation: every required field on both forms, left empty one at a time, keeps
  the submit button disabled (data-driven loop).
- Positive flow: filling every required field (including City/Region) enables the submit button
  on both forms — never clicked.
- City/Region picker: opens, lists the expected option, selects it, closes, updates the field —
  native bottom sheet whose rows all share one resource id (app quirk), matched by exact text.
- Navigation: device back-button from Step 2 returns to account-type selection with the prior
  choice retained and Next still enabled.
- **Accepted business behavior** (confirmed by the QA owner, 2026-11-11, not a defect): the submit
  button on both forms enables with a password as short as 3 characters, even though the screen's
  own note recommends 6+. Deliberate difference from the website (which enforces the minimum
  client-side). Tested as expected, positive behavior.
- **Format boundaries, confirmed consistent with the password decision** (same client-side
  design across the whole form, not isolated per field): ID/Iqama, Mobile Number, Commercial
  Registry Number and Tax ID all accept a 1-character value without disabling the submit button
  (no client-side minimum length/shape check), and each enforces a maximum length via an input
  filter — ID/Iqama and Mobile Number: 10 digits; Commercial Registry Number: 10 digits; Tax ID:
  20 digits. Mobile Number's maximum is asserted as an upper bound (`≤ 10`), not an exact length,
  because its live formatting TextWatcher races WebdriverIO's fast synthetic typing and produced
  different truncation lengths (9, 10, even 1 character) across repeated runs of the identical
  input — confirmed to be an automation-timing artifact of the app's own formatter, not a
  business rule, by direct repeated probing.
- **Full registration → Forgot Password → Login E2E journey (Individual, authorized 2026-11-11),
  executed live twice** (once Arabic, once English) and recorded:
  - Personal registration needs only the mobile OTP (`1111`) — confirmed to reach "Your account
    has been successfully created!" with no further identity step. Company/Dealer is different:
    it requires **Nafath** identity verification after OTP (a government ID app), which this suite
    cannot complete and must never attempt to bypass — confirmed blocked, not worked around (see
    §4-equivalent note below; this was hit and stopped at cleanly during the CR/Tax investigation
    before this journey work started).
  - Both created accounts verified **server-side** in the back office (Users → Individuals,
    searched by name): phone `0539665607` (ID 45941) and `0539714403`, both "Joining Date"
    2026-11-11, both `Status: waiting transfer` / `Verified: No` despite the app showing a normal
    signed-in state — an observation, not a confirmed defect (not investigated further: what
    flips that backend status was out of scope here).
  - Forgot Password (same OTP) → new password → login with the new password: all confirmed, both
    languages, both accounts.
  - Credentials recorded in gitignored `.env` (`ANDROID_TEST_INDIVIDUAL_PHONE/PASSWORD/IQAMA`),
    read via `getAndroidTestIndividual()` (config/credentials.config.ts, same pattern as
    `IOS_TEST_DEALER_*`). Passwords are never logged; `.env`'s stored value goes stale every time
    the committed reset test runs (by design — see its own in-file note) and is not meant to be
    trusted without re-checking.
  - Committed as `tests/mobile/android/registration-e2e.spec.ts`: one stateful "Forgot Password +
    login" test against the recorded account (English only — reusing it, not re-registering), plus
    4 new negative tests (Empty OTP / Incorrect OTP, EN+AR) against the registration OTP screen
    itself, each using a fresh unused phone that never completes (so no new account is created by
    the regression suite). A new approval switch, `MAZAD_ALLOW_ACCOUNT_CREATION`
    (`src/utils/account-actions.ts`), was added for symmetry with the existing OTP/password-reset
    switches, following the same "blocked unless approved for this run" convention — not currently
    required by the committed suite (it creates no new accounts), but documents the boundary for
    any future registration-submitting test.
  - 56/56 existing `registration.spec.ts` tests re-run green after these changes (no regressions).
    Dealer `forgot-password.spec.ts` re-spot-checked (its non-gated tests) — unaffected.

### In progress / pending (safe to continue independently)

- Deeper format rules beyond length (e.g. does the backend eventually reject a non-numeric-shaped
  ID, a mobile number not starting with "05", a CR number not starting with "7"?) are unknown
  client-side — the app accepts any digits up to the max length, per above. Answering this needs
  either Swagger/API access (blocked, §4) or an actual submission (forbidden by your boundary).
- A side-by-side Android/website copy-difference reference could be promoted out of the class doc
  comment if useful; not done, not necessary yet.
- What the backend "waiting transfer" / "Verified: No" status means and what (if anything) clears
  it — not investigated, flagged above as an observation only.

---

## 3. CR / Tax uniqueness validation — BLOCKED (both platforms, both account types, both languages)

Investigated per your request; nothing was typed into a device, nothing was submitted, no account
was created, no database or backend record was touched.

**What exists in the repo:**

- No Swagger file and no database schema/entity documentation exists anywhere in this project
  (same finding as the earlier API/DB investigation).
- `src/network/web-approved-requests.ts` (`APPROVED_WEB_REQUESTS`) is empty — the customer
  Registration endpoint, on either platform, has never been recorded or approved for calling.
- The **only** existing CR/Tax duplicate-prevention precedent in this codebase belongs to a
  **different business entity**: the Backend → Suppliers module
  (`test-data/supplier.data.ts`, confirmed with QA 2026-11-04). It documents real rules there —
  "Phone and CR number must be unique; email and tax ID may repeat", format rules ("must start
  with 7 and be 10 digits long" for CR, "15 digits and start with 3" for Tax ID), and a duplicate
  message (`Cr Number "${value}" has already been taken.`). **This is informative context, not
  evidence for customer Registration** (Personal/Company account creation): Suppliers are a
  separate back-office entity, very likely a different database table with its own validation
  path, and I have no evidence the two share a uniqueness domain. Treating them as interchangeable
  without verification would be exactly the kind of assumption you told me not to make.
- No fixture, test-data file or config anywhere records a known-existing, already-approved CR
  Number or Tax ID for an account created through the customer Registration flow specifically.
  `DirectoryAccount` (the existing dedicated test Dealer/Individual account lookup used by Login
  tests) only tracks `id`, `phone` and `status` — it was never built to read CR Number/Tax ID off
  an account's record.

**Why every scenario is BLOCKED, not attempted:**

| #   | Scenario                                                          | Platform                             | Result                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Existing CR number rejected                                       | Android/iOS, Personal/Company, EN/AR | BLOCKED — no approved existing CR number identifier available                                                                                                                                                                                                                                                                                                                |
| 2   | Existing Tax number rejected                                      | Android/iOS, Personal/Company, EN/AR | BLOCKED — same reason                                                                                                                                                                                                                                                                                                                                                        |
| 3   | Same CR number across account types                               | Android/iOS, EN/AR                   | BLOCKED — same reason                                                                                                                                                                                                                                                                                                                                                        |
| 4   | Same Tax number across account types                              | Android/iOS, EN/AR                   | BLOCKED — same reason                                                                                                                                                                                                                                                                                                                                                        |
| 5   | When duplicate validation fires (typing/blur/button/backend-only) | Android/iOS                          | BLOCKED — cannot test without a real duplicate value to type                                                                                                                                                                                                                                                                                                                 |
| 6   | Validation message + language                                     | Android/iOS, EN/AR                   | BLOCKED — same reason                                                                                                                                                                                                                                                                                                                                                        |
| 7   | Valid, unused identifiers accepted client-side                    | Android                              | **Not blocked** — already covered: a fresh, synthetic CR/Tax shape (`registrationData.commercialRegistryNumber`/`taxId`) enables Verify in the existing format-boundary and positive-flow tests (§2). This only proves "no client-side rejection of a well-formed, presumably-unused value" — it says nothing about uniqueness, since client state never checks the backend. |

**What would unblock this**, in order of how directly it answers the question:

1. **You tell me a specific CR Number/Tax ID you know is already registered in staging** (from
   either an existing Company registration account, or confirmation that a Supplier record's CR
   number IS in the same uniqueness domain as Registration) — I would then test it read-only
   (type it, observe field/button/message state, never submit) exactly as scoped.
2. **Approval to extend `MazadUserDirectoryPage`/add a Dealer-detail read** to look up the already
   in-this-suite, already-approved dedicated test Dealer account's CR Number/Tax ID off the
   back-office admin UI (read-only, no mutation) — small code addition, not yet done.
3. **Swagger/API access**, which would state the uniqueness rule directly instead of needing a
   live probe at all.

I did not pick option 2 or guess a value on my own judgment, since both still touch account data
beyond what you'd explicitly scoped for this step; flagging for your choice instead.

---

## 4. iOS — BLOCKED, nothing implemented

**The blocker:** no Mazad app build exists on any iOS Simulator. Checked every installed
simulator (`xcrun simctl listapps <udid>` across all iPhone/iPad runtimes) — none has
`com.motory.dealer` or any Mazad-related bundle installed. `docs/ios-uitest-build-requirements.md`
(written earlier, unchanged) documents exactly the build QA still needs from the app team
(simulator arm64 build, proxy-routable traffic, pinning off) — it was never delivered.

**Important discrepancy worth flagging:** my own notes from 2026-11-08 record that the iOS plan
was explicitly changed to the **physical device** at that time ("PLAN CHANGE: the user switched
to the physical iPhone 15 Plus... and dropped the simulator route (no new simulators)"), with the
whole effort frozen pending a real build and a NetBird DNS fix, and three invariants including
"never let the guarded-launch command become a general-purpose gate bypass." Your instructions
this session say the opposite — simulator only, never the physical device. I'm not resolving this
conflict myself; I'm surfacing it so you can tell me which is current. Either way, the outcome for
_this_ session is the same: no simulator build exists, so nothing can run regardless of which
plan is current, and I did not touch the physical device.

`src/mobile/ios/screens/registration.screen.ts` already exists, and is deliberately minimal: it
can open the registration entry and read Step 1 text, but has no way to choose an account type,
type a field, or tap anything — "NAVIGATION AND DISPLAY ONLY... nothing can be submitted." This
was a prior deliberate design choice (2026-11-09), not something I built this session, and I did
not extend it, since there is no build to verify any extension against.

**Nothing else was attempted**: no simulator was booted for this app, no certificate was
installed, no pinning was bypassed, no physical device was touched.

**What would unblock this:** the app team delivering the simulator build per
`docs/ios-uitest-build-requirements.md`, or your explicit confirmation that the physical-device
plan is actually still current (in which case the "simulator only" instruction for this session
would need to be revisited with you, since no simulator path exists today).

---

## 5. Files touched this session

- `src/mobile/screens/registration.screen.ts` (Android Step 2 POM)
- `src/fixtures/mobile.fixture.ts` (+5 lines: `registrationScreen` fixture)
- `test-data/mobile-app.data.ts` (+`registrationFlow` block, EN/AR)
- `tests/mobile/android/registration.spec.ts` (new)
- `docs/mobile-registration-progress.md` (this file; supersedes `docs/android-registration-progress.md`)

No iOS file was changed. Nothing was committed or pushed.

---

## 6. iOS Registration -> Forgot Password -> login E2E journey (2026-11-11)

Explicitly authorized, scoped journey (its own run kinds and switch, `config/ios-account-policy.ts`
unchanged): register a new Individual account on the physical iPhone, verify by OTP, log out, reset
the password via Forgot Password, and log in with the new password. Build 8.3 (1491), backend
`stg-mazad-v3-154`.

**Implemented and verified live:**

- `IosRegistrationScreen` extended with real Personal/Individual Step 2 interaction (fields by
  placeholder, City/Region and Create Account by a documented coordinate-tap fallback — neither
  control has an accessibility id or its own label, and neither the class-chain nor XPath
  descendant-matching dialects this driver supports could locate a Button by a child StaticText's
  label; see `tests-ios/registration-account-type.inspect.ts` for the raw evidence).
- Three new `AccountRunKind`s (`registration-otp-request`, `registration-password-reset`,
  `registration-login`) and their own switch, `IOS_ALLOW_REGISTRATION_E2E_JOURNEY` (default
  `false`), kept separate from every existing permit.
- Three real bugs found and fixed via live device runs: a stale-coordinate bug in the City/Region
  tap (the keyboard shifting the layout after typing Password), a field cross-contamination bug
  (fast back-to-back `setValue()` calls leaked characters into the wrong field; fixed with an
  explicit tap+clear+type per field), and iOS's own native "Save Password?" Keychain prompt was
  not being dismissed, blocking the OTP screen underneath.
- After these fixes: account-type selection, Step 2 field entry, City/Region selection, and Create
  Account submission all confirmed working live, end to end, navigating correctly off Step 2.

**Test case: OTP maximum-attempts (negative, confirmed) — see detail below.**
**Test case: OTP verification with `1111` (positive) — pending, blocked by the above.**

### TC — [Mazad iOS] Registration — Display OTP Maximum Attempts Blocked Screen

- Test Type: Negative / Backend validation. Platform: iOS. Environment: Staging. Build: 8.3 (1491).
  Priority: High. Status: Observed — Backend Blocked.
- Preconditions: app installed on the physical iPhone; Individual registration completed through
  City/Region and Create Account with a newly generated phone number that had never previously
  requested an OTP; the backend OTP request limit had already been reached for the applicable
  device/IP/session scope (from this same debugging session's earlier attempts).
- Steps: open the app -> Registration -> Individual/Personal -> complete all mandatory fields ->
  select a City/Region -> tap Create Account -> reach the OTP verification screen -> observe the
  backend response.
- Expected: the app displays the backend's maximum-attempts restriction, states the remaining
  cooldown, does not proceed with OTP verification, and no alternative phone number or automation
  workaround is attempted.
- Actual: the backend returned **"You've reached the maximum attempts, try again after 23 hours :
  53 minutes : 34 seconds"**, shown on the OTP screen for a brand-new phone number that had never
  requested an OTP before.
- Evidence: 2026-11-11, ~14:29 UTC; expected cooldown expiry ~2026-11-12, ~14:23 UTC. The
  restriction applies beyond an individual phone number (a never-used number was blocked
  immediately); the exact backend scope (device, IP, session, or a combination) is unconfirmed.
- **Re-confirmed ~14:39 UTC the same day**, on a second, different, never-used phone number: same
  message, remaining time "23 hours : 43 minutes : 34 seconds" (~10 minutes less than the first
  check) — one continuous, shared cooldown, not reset per attempt and not scoped to a single
  phone number. No OTP input field or enabled Verify button is shown in this state; `1111` cannot
  be entered.
- Outcome: **Blocked by a real backend OTP rate limit.** The run stopped rather than bypassing it.
- Notes: keep as its own negative test case, not an iOS registration UI defect. The backend team /
  QA owner should confirm `otp.limitScope`, `otp.maxRequests` and the cooldown policy in
  `config/ios-account-policy.ts` (still `null`/unrecorded as of this session). Re-execute the
  journey after the cooldown expires.

### TC — [Mazad iOS] Registration — OTP Verification Using Fixed Test OTP (positive, PASSED 2026-11-11)

- Preconditions: registration form completed; OTP verification screen displayed; staging backend
  (updated to `https://stg-mazad-v3-224.motory.dev`, 2026-11-11) accepts the test OTP `1111`.
- Steps: complete Individual registration -> reach the OTP screen -> enter `1111` -> tap Verify ->
  observe the backend response -> verify the resulting registration state.
- Actual: **PASSED** on the new backend. The max-attempts block recorded against the OLD backend
  (`stg-mazad-v3-154`) did not carry over: OTP `1111` was accepted on the first attempt against
  `stg-mazad-v3-224`, confirming the two are independent staging deployments for this purpose.
  The Verify button, and the New Password screen's Save/Login button, both carry no accessible
  name at all (fixed in `otp.screen.ts` / `new-password.screen.ts` to locate them the same way as
  every other submit button in this app). A "Your account has been successfully created!"
  confirmation screen appears after registration OTP verification (its own Close button plus one
  unlabeled dismiss button); the new-password screen also showed an iOS-native "Suggested strong
  password" AutoFill popup that was found to swallow every tap aimed at the Save button underneath
  until its own "Dismiss" control was tapped first — both are now handled.

## 7. Full journey result (2026-11-11, build 8.3 (1491), backend `stg-mazad-v3-224`)

| Flow                    | English  | Arabic                                                         |
| ----------------------- | -------- | -------------------------------------------------------------- |
| Individual Registration | **Pass** | Pass (shared Step 2 layout check only, non-mutating; see note) |
| OTP verification        | **Pass** | N/A (not duplicated)                                           |
| Forgot Password         | **Pass** | N/A (not duplicated)                                           |
| Password reset          | **Pass** | N/A (not duplicated)                                           |
| Final login             | **Pass** | N/A (not duplicated)                                           |

Arabic coverage is the shared, non-mutating Personal Step 2 layout check only (per the explicit
"do not duplicate test cases" / "do not create unnecessary additional accounts" scope): it never
registers a second account. The full mutating journey (registration -> OTP -> logout -> Forgot
Password -> reset OTP -> new password -> final login) ran once, in English, end to end, and every
step passed live on the physical iPhone.
