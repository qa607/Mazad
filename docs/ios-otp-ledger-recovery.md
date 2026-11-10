# OTP request ledger: recovery instructions

For the QA owner. The OTP request ledger (`reports/ios-account-state/otp-path-requests.jsonl`, with its
integrity anchor `otp-path-requests.head`, lock `otp-path-requests.lock` and recovery claim
`otp-path-requests.lock.recovery`) records every request that can send an OTP. Any problem with it
refuses every OTP request (fail closed). **Nothing recreates, repairs or deletes these files
automatically, and no one else may: an OTP request is an account action.** The ledger is
tamper-evident, not tamper-proof (see `src/mobile/ios/account/otp-ledger.ts`).

Technical safety limits (this suite's own: 6 requests per run, 5 seconds apart) are not backend policy
and never replace a recorded backend limit. A new ledger forgets earlier requests, so after any
recovery treat the unknown backend limits as still unconfirmed and wait before the next run; do not
assume a window has passed.

## First use: the ledger does not exist yet

"The OTP request ledger is missing ... is never recreated automatically." Run once, deliberately:
`npm run ios:otp-ledger-init`. It writes the header and the anchor, and refuses if either file exists.

## Messages and what to do

| Message contains                       | Meaning                                                                                                                  | What to do                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledger is missing`                    | The ledger file is not there (never created, or deleted)                                                                 | If the anchor file still exists, the ledger was deleted: find it (backup, trash). Do not run init (it refuses). If it cannot be found, archive the remaining files (below) and re-initialize. |
| `corrupted (... line N ...)`           | A line was edited, deleted, reordered, cut off or is not valid                                                           | Do not edit it. Archive and investigate (below). Decide with the account owner which requests really happened from the run reports before re-initializing.                                    |
| `corrupted (... integrity anchor ...)` | The anchor is missing, malformed, stale, or disagrees with the ledger (entries removed or the file replaced or restored) | Same as above. A restored backup is detected here on purpose.                                                                                                                                 |
| `locked by another running process`    | A live worker holds the ledger lock                                                                                      | Wait for it. Not an error if a run is in progress.                                                                                                                                            |
| `cannot be verified`                   | The lock's owner is on another host, or its start time cannot be read                                                    | Check that no run is active anywhere, then remove `otp-path-requests.lock` by hand.                                                                                                           |
| `lock recovery was interrupted`        | A process that was recovering a crashed worker's lock died; its claim file is left                                       | Check that no run is active, then remove `otp-path-requests.lock.recovery` and, if it is still there, `otp-path-requests.lock`.                                                               |
| `unreadable or malformed`              | The lock file is empty or damaged                                                                                        | Check that no run is active, then remove `otp-path-requests.lock` by hand.                                                                                                                    |
| `could not be recovered in time`       | Another process held the recovery claim for the whole wait                                                               | Run again; if it repeats, treat as `lock recovery was interrupted`.                                                                                                                           |

Automatic recovery exists for exactly one case: a lock whose owner process is **proven dead on this
host** (the process no longer exists, or the pid now belongs to a process with a different start time).
That lock is removed by one process at a time after re-checking it is still the same dead owner's. A
live owner's lock is never removed. It relies on a local filesystem with atomic create, link and rename
(not a network share) and on `ps`; where death cannot be proven the run is refused instead.

## Archiving a damaged ledger (never delete)

1. Make sure no run is active (`pgrep -fl playwright`).
2. Move, do not delete: `mkdir -p reports/ios-account-state/archive-<date>` and `mv` the ledger, anchor,
   lock and claim files into it.
3. Write down why, and what the run reports say was requested.
4. Only then `npm run ios:otp-ledger-init`, and only when the QA owner authorizes the next device run.
