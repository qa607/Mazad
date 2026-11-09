# iOS account tests: backend policy register

Status of the 14 backend facts that `config/ios-account-policy.ts` requires before any iOS account
test may run. **All 14 are UNCONFIRMED.** No value is filled in, none is guessed, and nothing is
copied from the Web or Android suites (they record none of these either). A fact becomes confirmed only
when the backend team's written answer is transcribed into the policy file, in code review, with its
source and approver.

Last reviewed: 2026-11-09 (offline review only; no device or backend contact).

| #   | Policy key                        | Question for the backend team                                       | Status      | Needed by (tests that stay blocked)                    |
| --- | --------------------------------- | ------------------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| 1   | `otp.maxRequests`                 | Most OTP requests allowed within the window                         | Unconfirmed | every OTP chain                                        |
| 2   | `otp.windowMinutes`               | Length of that window, in minutes                                   | Unconfirmed | every OTP chain                                        |
| 3   | `otp.cooldownSeconds`             | Minimum seconds between two requests (0 = none)                     | Unconfirmed | every OTP chain, and the order of chains               |
| 4   | `otp.limitScope`                  | Counted per account, IP, device, unregistered number?               | Unconfirmed | OTP chains, unregistered-number submissions            |
| 5   | `otp.verificationAttemptsPerCode` | Verification attempts allowed per code                              | Unconfirmed | Incorrect OTP chains, correct-OTP steps                |
| 6   | `otp.incorrectOtpInvalidatesCode` | Does one wrong attempt invalidate the code?                         | Unconfirmed | Incorrect OTP chains (kept apart from the reset chain) |
| 7   | `otp.lifetimeSeconds`             | How long a code stays valid                                         | Unconfirmed | OTP chains; also "Expired OTP" (stays fixme)           |
| 8   | `otp.fixedOtpFollowsSameRules`    | Does the fixed staging OTP follow the same rules as a real code?    | Unconfirmed | every OTP step that uses `OTP_CODE`                    |
| 9   | `otp.stagingSendsRealSms`         | Does staging send a real SMS (could a real person receive it)?      | Unconfirmed | every OTP request                                      |
| 10  | `login.failureThreshold`          | Failed logins that trigger a lock                                   | Unconfirmed | wrong-password and unregistered-number login tests     |
| 11  | `login.countingWindowMinutes`     | Window in which failures are counted                                | Unconfirmed | same as 10                                             |
| 12  | `login.lockDuration`              | Lock length in minutes, or until manual unlock                      | Unconfirmed | same as 10; recovery planning                          |
| 13  | `login.wrongOtpCountsTowardLock`  | Do wrong OTPs count toward an account lock?                         | Unconfirmed | Incorrect OTP chains                                   |
| 14  | `recovery.procedure`              | The approved unlock and recovery procedure (an existing docs/\*.md) | Unconfirmed | every account test (a lock must be recoverable)        |

Also required, and not a backend fact: the confirmed dedicated synthetic dealer account (`testAccount`;
candidates 1331, 779 and 715 remain unselected), the approved OTP chains (`approvedOtpChains`), and
approval for the negative credential tests (`negativeCredentialTests`).

## Evidence that counts

- A written answer from the backend team (or an authoritative backend document), naming the value,
  the environment (`stg-154`) and the date. Source and approver go into the policy record.
- Not evidence: Web or Android test comments (for example the informal "about a minute" resend
  cooldown), observed behaviour from earlier runs, or inference from the fixed OTP.

## What stays unchanged until then

- `acceptedUnrecordedFacts` stays `null` (a selfcheck enforces it); there is no accepted-risk route.
- Every account test is skipped when its spec loads: no app launch, no hook, no request.
- Expected results for expiry, lock and rate-limit behaviour are not written; those tests stay
  `fixme` or skipped with the reason above.
