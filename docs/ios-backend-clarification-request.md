# Request for confirmation: login, OTP and password-recovery rules (staging)

**Ready to send, NOT sent.** To: the Mazad backend team. From: QA (Motory). Environment: staging
`stg-154` only. Date sent: **\_\_\_\_** Answers wanted by: **\_\_\_\_**

## Why we are asking

QA is testing Login and Forgot Password on the iOS app. Before we send any OTP request or any login
attempt for a test account, we need the **rules the backend actually enforces**, so that we neither
lock accounts, trigger limits for real users, nor write expectations we cannot confirm. We will not
guess any of these values or copy them from the website or Android tests (those tests do not record
them either). Until a question is answered in writing, the tests that depend on it stay switched off.

This request covers staging only. We are not asking about production.

## How to answer

For **each** question (Q1 to Q14), please give all four of these. A one-line answer per item is enough.

|     | What we need                                                                  |
| --- | ----------------------------------------------------------------------------- |
| A   | **Behaviour:** what the backend does, confirmed (not "should" or "usually")   |
| B   | **Value:** the exact configured number or setting (with its unit), if any     |
| C   | **Source:** the API, service or configuration setting that defines it         |
| D   | **Owner:** the backend person or team who confirms it, and the date confirmed |

If something is **not enforced**, please say so explicitly ("there is no limit") so we can record it as a
fact. If a rule **differs between staging and production**, tell us the staging rule. If you do not
know, say "not known" rather than estimating.

Please do not include any real phone number or password in your answers.

---

## Group 1: OTP generation, expiry and resend

**Q1. How many OTP requests can be made, and over what period?** _(combines two earlier questions: the
maximum number of requests, and the length of the period they are counted in)_
When someone asks for an OTP (for example from Forgot Password), what is the maximum number of OTP
requests allowed within one period, and how long is that period? After the maximum is reached, what
does the user see, and when can they ask again?

**Q2. Waiting time between two OTP requests.**
Is there a minimum wait before a second OTP can be requested (for example before "resend")? If yes, how
many seconds? (If there is no minimum wait, please say so.)

**Q3. What the OTP limits are counted against.**
Are the limits in Q1 and Q2 counted per account (phone number), per IP address, per device, per
phone number that has no account, or a combination? Please mark each one: yes, no, or not applicable.

**Q4. How long an OTP stays valid.**
After an OTP is generated, for how many seconds does it remain valid? Does asking for a new OTP make
the previous one invalid immediately?

**Q5. Does staging send real SMS messages?**
When an OTP is requested on staging for a real-looking phone number, is an actual SMS sent? Could a
real person receive it? (This decides which phone numbers we are allowed to use.)

**Q6. The fixed staging OTP.**
Staging accepts a fixed OTP value. Does that fixed value follow the same rules as a real OTP: the same
validity period (Q4), the same attempt limit (Q7), the same effect of a wrong attempt (Q8)? If it is
exempt from any rule, which one?

## Group 2: OTP validation and failed attempts

**Q7. How many times can an OTP be entered?**
For one OTP, how many verification attempts are allowed before it stops working? What happens after the
last allowed attempt (new OTP needed, waiting time, block)?

**Q8. Does one wrong OTP cancel the code?**
If a user enters a wrong OTP once, is the correct OTP still accepted afterwards, or does the wrong
attempt invalidate the code so a new one must be requested?

**Q9. Do wrong OTPs count toward an account lock?**
Do wrong OTP entries count toward the account lockout in Group 3 (Q10 and Q11), or are OTP failures
counted separately? If separately, what are the thresholds? _(This belongs to both groups; please answer
it once, here.)_

## Group 3: Login validation and account lockout

**Q10. How many failed logins lead to a lock?**
How many failed login attempts (wrong password) cause a lock, and how long is the period in which they
are counted (for example five failures within 15 minutes)? Does an attempt with a phone number that has
no account count against anything?

**Q11. How long does a lock last, and how does it end?**
Once an account is locked by failed logins, does it unlock by itself after a period (how many
minutes), or only through manual action (by whom, and how)? Does a successful password reset also
unlock it?

## Group 4: Password recovery and reset

**Q12. Approved recovery steps if a test account is locked or rate-limited.**
If a staging test account ends up locked (Q11) or blocked from requesting OTPs (Q1 and Q2), what is the
approved way to restore it: waiting, a back-office action, a backend or database action, or a request
to your team? Please name the exact steps and who may perform them. If a written procedure already
exists, please give us its location.

_The QA register lists 14 items. Q1 to Q12 cover them all (two pairs were merged: see the mapping at the
end). X1 to X3 below are extra and not part of the register._

---

## Additional Password Reset Clarifications

**Supplementary questions X1 to X3.** These are **not** part of the original 14 items in QA's policy
register and are not needed for Q1 to Q12. They are asked here so that one reply covers the whole
password-reset flow. Please answer them in the same format (A behaviour, B value, C source, D owner).

**X1. Password complexity and validation requirements.**
What does the backend require of a new password: minimum and maximum length, required character types
(letters, digits, symbols, upper and lower case), characters that are not allowed, and whether the new
password may equal the old one? What error does the user get when a rule is broken? (The website's own
check appears to use a 6-character minimum; we want the backend's confirmed rule.)

**X2. Expected behaviour after a successful password reset.**
Please confirm what happens after the new password is saved:
(a) Is the user signed in automatically (the website does this)?
(b) Is the old password invalidated immediately?
(c) Are existing sessions on other devices invalidated or kept?

**X3. Limits or restrictions on password resets.**
Is a password reset subject to any limit beyond the OTP limits in Q1 to Q3 (for example a maximum
number of resets per account per day, or a minimum time between two resets)? If so, what are the
values, and what does the user see when the limit is reached?

---

## Overlaps and unclear points we found while preparing this

| Original item(s)                                                                 | What we did                                                                                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Maximum OTP requests + request window                                            | One question (Q1): the two values only make sense together.                                                            |
| Waiting time between requests vs. the window                                     | Kept apart (Q2): a resend wait and a total limit are different rules.                                                  |
| Lock threshold + counting window                                                 | One question (Q10), with the unregistered-number case added.                                                           |
| Lock duration + recovery                                                         | Duration is Q11. Recovery of a stuck account is Q12, so the unlock procedure is not hidden inside a "duration" answer. |
| Wrong OTP and lockout                                                            | Appears in both OTP and login topics, so it is one question (Q9) to avoid two different answers.                       |
| "Fixed OTP follows the same rules" and the three OTP-rule questions it refers to | Q6 refers to Q4, Q7 and Q8 on purpose; answering those first makes Q6 short.                                           |
| "Does staging send real SMS" (policy register #9)                                | Not a limit but a safety question; moved to the start of the OTP group because it affects which numbers we may use.    |
| "Approved recovery procedure" (policy register #14)                              | Was vague. Now asks for steps, executor and location of the document (Q12).                                            |
| Register #4 (limit scope)                                                        | Kept as Q3 but asks for a yes, no or not-applicable per scope, which the answer must be recorded as.                   |

## Mapping to the QA register (for QA's tracking)

| This request | QA register item(s)                                             |
| ------------ | --------------------------------------------------------------- |
| Q1           | #1 `otp.maxRequests`, #2 `otp.windowMinutes`                    |
| Q2           | #3 `otp.cooldownSeconds`                                        |
| Q3           | #4 `otp.limitScope`                                             |
| Q4           | #7 `otp.lifetimeSeconds`                                        |
| Q5           | #9 `otp.stagingSendsRealSms`                                    |
| Q6           | #8 `otp.fixedOtpFollowsSameRules`                               |
| Q7           | #5 `otp.verificationAttemptsPerCode`                            |
| Q8           | #6 `otp.incorrectOtpInvalidatesCode`                            |
| Q9           | #13 `login.wrongOtpCountsTowardLock`                            |
| Q10          | #10 `login.failureThreshold`, #11 `login.countingWindowMinutes` |
| Q11          | #12 `login.lockDuration`                                        |
| Q12          | #14 `recovery.procedure`                                        |

Thank you. A written reply (email or ticket) is fine; please keep the question numbers so we can record
each answer with its source and the owner who confirmed it.
