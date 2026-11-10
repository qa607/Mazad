# iOS recovery journal: manual recovery procedure (QA owner)

Written for the QA owner who runs the iOS account tests. The journal files live in
`reports/ios-account-state/journal-*.json` (git-ignored, owner-only). They hold a masked phone, a state and a
short note: never a password, an OTP or a full phone number. **While any entry is `pending` or `applied`, every
iOS account run is refused.** Only a person closes an entry; no test, helper or script run by a test ever does.

## 1. The entries and what they mean

| Entry id ends with  | Written by                                                                                | States                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `<run>` (no suffix) | the reset step, before it taps Save                                                       | `pending` → `applied` → `restored`                       |
| `-attempts-<n>`     | the below-minimum / rejected-password steps, before the first invalid attempt             | `pending` → `restored` (observed unchanged) or `applied` |
| `-late-signin`      | the cleanup, when the app was found signed in after invalid attempts that looked rejected | `applied`                                                |

- `pending`: it is **unknown** whether the password was saved (the run died, timed out, or never finished
  watching). Treat it as "maybe changed".
- `applied`: a save was **seen** (the new-password step was left), or the attempt did not finish, or a signed-in
  app was found afterwards. Treat it as "probably changed".
- `restored` and `closed` are finished. A `restored` **attempts** entry means only "the step stayed on screen
  for 60 seconds and the app was guest afterwards"; it is never evidence of the baseline password.
- A `-late-signin` entry exists because a save that came back later than the watch window signs the app in (X2(a)).
  If the sign-in did not happen (or X2(a) is unconfirmed), a very late save cannot be detected: the window is
  bounded, not proof.

## 2. Procedure (do not skip steps)

1. **Stop.** Make sure no run is active: `pgrep -fl playwright` prints nothing. Do not start another run.
2. **Read the entries:** `npm run ios:journal -- list`. Note each open entry's id, state, masked phone, dates and note.
   An `UNREADABLE` line means a damaged file: do not edit or delete it; archive it (move, never delete) and
   resolve it before anything else.
3. **Identify the account.** The masked phone is the dedicated Dealer test account from `.env`. If it is a
   different account, stop and ask the owner of that account.
4. **Find out what the account's password is now.** Choose one route (each is a separate authorization):
   - **A. Reset to the baseline (preferred, always works).** Forgot Password → OTP → set the `.env` baseline
     password. It needs one OTP request (the OTP and password-reset switches, the OTP ledger limits and a
     recovery run kind). It works whatever the current password is, so no blind login is needed.
   - **B. One login with the `.env` password (only when `pending` and nothing suggests a change).** One attempt;
     if it works the baseline is intact. If it fails, do **not** retry: use route A.
   - **C. Back-office check or reset (unverified route).** Only if the backend owner confirms it exists.
5. **Make sure the app is signed out** on the iPhone (More → Log out). An `APP-NOT-GUEST.json` marker is separate:
   it clears itself after a later start check confirms the guest state.
6. **Close the entry only after the account is verified**, naming yourself and what you checked:
   `npm run ios:journal -- close <entry-id> --by "<your name>" --note "<what you verified>"`.
   It accepts only a `pending` or `applied` entry and refuses a missing name or an empty note.
7. **A completed reset to the baseline is the only evidence of the baseline.** If you changed or verified the
   password by hand and the policy does not record `currentPasswordVerified`, record it in
   `config/ios-account-policy.ts` (your own reviewed step) before running a Dealer login.

## 3. Never

- Never delete, rename, edit or "repair" a journal file or the OTP ledger by hand. Archive (move) and write down why.
- Never close an entry without checking the account, and never close `applied` on the strength of "it probably
  did not save".
- Never run two OTP-capable runs at the same time on one checkout.

The OTP ledger has its own procedure: `docs/ios-otp-ledger-recovery.md`.
