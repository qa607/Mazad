# QA Report: Website Registration Page

| Item         | Detail                                                                   |
| ------------ | ------------------------------------------------------------------------ |
| Page         | Website registration, `/en/signup/` and `/ar/signup/`                    |
| Environment  | Staging stg-154 (`https://stg-mazad-v3-154.motory.dev`)                  |
| Date         | 2026-11-12                                                               |
| Tested by    | Qusai (QA), with Claude Code                                             |
| Type         | Manual and exploratory end-to-end testing; no automated tests were added |
| OTP          | Staging test code `1111` only, as instructed                             |
| Out of scope | Security testing (excluded by the QA owner), Android and iOS apps        |

## Summary

Registration works end to end in English and Arabic, for both Personal and Company accounts. A user can
choose an account type, fill the form, verify the mobile number with the OTP, and land on the home page
signed in. The data is saved correctly in the back office, and the new account can sign in with its
password. Duplicate mobile numbers and ID/Iqama numbers are refused with clear messages.

**11 issues were logged: 1 Medium, 9 Low, and 1 withdrawn after a re-check (bug 8).** None blocks
registration. Most are cases where the browser accepts a value that the server then refuses, or
wording problems.

| Severity                   | Count | Bugs                        |
| -------------------------- | ----- | --------------------------- |
| Critical                   | 0     |                             |
| High                       | 0     |                             |
| Medium                     | 1     | 1                           |
| Low                        | 9     | 2, 3, 4, 5, 6, 7, 9, 10, 11 |
| Withdrawn (not reproduced) | 1     | 8                           |

All test accounts created during testing used `QA AUTO` names and synthetic numbers, and **all of them
were deleted** from the back office afterwards. Mobile and ID numbers in the screenshots belong to
those deleted test accounts. No real customer data or passwords appear in this report.

## Scope

**Tested**

- Step 1: choosing the account type (Personal or Company).
- The Personal form: Full Name, ID/Iqama Number, City/Region, Mobile Number, Password.
- The Company form: Full Name, ID/Iqama Number, Mobile Number, Password, Commercial Registry Number,
  Tax ID.
- Validation: required fields, invalid formats, length limits, special characters, spaces.
- Duplicate mobile numbers and duplicate ID/Iqama numbers.
- The OTP step: verify, resend after the timer, Edit Mobile Number, refresh and Back.
- End to end: account created, data saved in the back office, sign-in with the new account, where
  the user lands after registration.
- Arabic (RTL) and English (LTR), and the layout at phone width (390 px).

**Not tested, and why**

| Area                                     | Reason                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Incorrect OTP                            | Only the code `1111` may be entered (testing instruction).                                                  |
| OTP expiry                               | Staging uses a fixed code: `1111` was still accepted 10 minutes after it was sent, so expiry can't be seen. |
| Company partner verification (Nafath)    | External government identity check; it can't be completed on staging.                                       |
| Terms checkbox, Confirm Password, Cancel | Not present on the page (current design). The only way out is the Mazad logo, which links home.             |
| SMS delivery                             | Staging returns the fixed code; no real SMS was checked.                                                    |
| Security cases                           | Excluded by the QA owner for this round.                                                                    |

## How registration works

1. `/signup/`: choose **Personal Account** or **Company Account**; **Next** is disabled until one is
   chosen.
2. **Personal** (`/signup/individual/`): Full Name, ID/Iqama, City/Region (33 cities), Mobile (+966),
   Password, then **Create Account**. **Company** (`/signup/company/`): Full Name, ID/Iqama, Mobile,
   Password, Commercial Registry Number, Tax ID, then **Verify**.
3. The account is created at this point (status _inactive_) and the OTP screen opens: 4 boxes, **Edit
   Mobile Number**, a 1-minute resend timer and **Verify**.
4. After the OTP:
   - **Personal:** "Your account has been successfully created!". **Continue** goes to the home page,
     signed in (status _waiting transfer_).
   - **Company:** "Mobile number verified successfully!". **Continue** goes to **Select a partner**,
     whose identity is verified through Nafath (status _verifying_).

## Test results

**54 scenarios: 43 passed, 10 failed (bugs 1–7 and 9–11), 1 withdrawn (bug 8).** Some rows cover
several inputs (for example, every empty required field).

| #   | Area         | Scenario                                                                                     | Result            |
| --- | ------------ | -------------------------------------------------------------------------------------------- | ----------------- |
| 1   | Account type | Both account types are offered; Next is disabled until one is chosen                         | Pass              |
| 2   | Account type | Personal and Company each open their own form                                                | Pass              |
| 3   | Required     | Each empty required field shows "… cannot be blank" (Personal and Company)                   | Pass              |
| 4   | Full Name    | Digits and symbols are blocked while typing                                                  | Pass              |
| 5   | Full Name    | Spaces only counts as blank                                                                  | Pass              |
| 6   | Full Name    | Arabic letters accepted                                                                      | Pass              |
| 7   | Full Name    | More than 100 characters                                                                     | Fail (bug 2)      |
| 8   | Full Name    | Leading, trailing and double spaces                                                          | Fail (bug 4)      |
| 9   | ID/Iqama     | Fewer than 10 digits: "must be 10 digits"                                                    | Pass              |
| 10  | ID/Iqama     | Not starting with 1 or 2: "must start with 1 or 2"                                           | Pass              |
| 11  | ID/Iqama     | Input stops at 10 digits                                                                     | Pass              |
| 12  | ID/Iqama     | Letters typed in the field                                                                   | Fail (bug 6)      |
| 13  | City         | 33 cities listed; Create Account disabled until a city is chosen                             | Pass              |
| 14  | City         | A message when City is missing                                                               | Fail (bug 5)      |
| 15  | Mobile       | Fewer than 10 digits: "must be 10 digits"                                                    | Pass              |
| 16  | Mobile       | Not starting with 05: "must start with "05""                                                 | Pass              |
| 17  | Mobile       | Letters removed; input stops at 10 digits                                                    | Pass              |
| 18  | Mobile       | 9-digit number `5xxxxxxxx`                                                                   | Fail (bug 1)      |
| 19  | Password     | Fewer than 6 characters refused; exactly 6 accepted; spaces removed                          | Pass              |
| 20  | Password     | Show / Hide switches the field between hidden and visible                                    | Pass              |
| 21  | Password     | Hint and error wording agree                                                                 | Fail (bug 9)      |
| 22  | Company      | Invalid CR and Tax ID refused by the server with clear messages                              | Pass              |
| 23  | Company      | CR and Tax ID checked while typing                                                           | Fail (bug 3)      |
| 24  | Company      | Valid company registration and OTP: "Mobile number verified successfully!"                   | Pass              |
| 25  | Company      | Continue opens Select a partner (Nafath)                                                     | Pass              |
| 26  | Company      | Company account can sign in                                                                  | Pass              |
| 27  | Duplicates   | Mobile of a verified account: "An account has already been created using this number…"       | Pass              |
| 28  | Duplicates   | Mobile of an unfinished (unverified) account: same message                                   | Pass              |
| 29  | Duplicates   | Existing ID/Iqama: "The ID / Iqama number you entered already exists…"                       | Pass              |
| 30  | OTP          | OTP screen shows the number, Edit Mobile Number, timer and Verify                            | Pass              |
| 31  | OTP          | Verify is disabled until all 4 digits are entered                                            | Pass              |
| 32  | OTP          | `1111` verifies the account (Personal, Company, Arabic)                                      | Pass              |
| 33  | OTP          | Resend appears only after the 1-minute timer                                                 | Pass              |
| 34  | OTP          | Resend sends a new code, restarts the timer, and `1111` then works                           | Pass              |
| 35  | OTP          | Timer and message wording                                                                    | Fail (bug 10)     |
| 36  | Edit Mobile  | Too short or not starting with 05: blocked with a message                                    | Pass              |
| 37  | Edit Mobile  | A number already registered: refused                                                         | Pass              |
| 38  | Edit Mobile  | A new number updates the same account (no extra account), then `1111` completes registration | Pass              |
| 39  | Edit Mobile  | Entering the current number again                                                            | Fail (bug 11)     |
| 40  | End to end   | Account created; back office shows the correct name, mobile, ID/Iqama, city and type         | Pass              |
| 41  | End to end   | After Continue the user is on the home page, signed in, and stays signed in after refresh    | Pass              |
| 42  | End to end   | The new account signs in with its password                                                   | Pass              |
| 43  | End to end   | An unfinished account: signing in brings up the OTP screen to finish                         | Pass              |
| 44  | End to end   | A signed-in user opening `/signup/` is sent to the home page                                 | Pass              |
| 45  | Navigation   | Back and Forward on the form clear the entered data (normal browser behaviour)               | Pass              |
| 46  | Navigation   | Refresh on the OTP screen                                                                    | Fail (bug 7)      |
| 47  | Arabic       | Page is RTL with Arabic labels and placeholders                                              | Pass              |
| 48  | Arabic       | Browser messages in Arabic                                                                   | Pass              |
| 49  | Arabic       | Server messages in Arabic (duplicate ID)                                                     | Pass              |
| 50  | Arabic       | Full registration in Arabic                                                                  | Pass              |
| 51  | Layout       | Phone width (390 px), English: no sideways scrolling                                         | Pass              |
| 52  | Layout       | Phone width (390 px), Arabic: no sideways scrolling, RTL                                     | Pass              |
| 53  | Layout       | Desktop layout and alignment (1280 px)                                                       | Pass              |
| 54  | Password     | Toggle label wording ("Show password" / "Hide text")                                         | Withdrawn (bug 8) |

## Bugs

Each bug's status is **Open: for Team Leader review**.

### Bug 1 (Medium): the form accepts a 9-digit mobile number that the server rejects

- **Steps**
  1. Open `/en/signup/`, choose Personal Account, click Next.
  2. Fill valid data, with Mobile Number `500000901` (9 digits, no leading 0).
  3. Click Create Account.
- **Actual:** the form shows no error and enables Create Account. The server then refuses it with
  "Mobile Number must start with "05"".
- **Expected:** the form and the server follow the same rule. Either the form refuses the 9-digit format
  before submitting, or the server accepts it, since the "+966" prefix shown invites it.
- **Evidence:** [form accepts it](screenshots/bug-01-nine-digit-mobile-form.png),
  [server refuses it](screenshots/bug-01-nine-digit-mobile-server-error.png)

### Bug 2 (Low): no length limit on Full Name, and the server's message names a field that isn't on the form

- **Steps:** on the Personal form, type a Full Name of 300 characters, fill the rest, and submit.
- **Actual:** the form accepts any length. The server refuses it with "**Arabic Name** should contain at
  most 100 characters." There is no Arabic Name field on the form.
- **Expected:** input limited to 100 characters, and a message that refers to "Full Name".
- **Evidence:** [screenshot](screenshots/bug-02-name-over-100.png)

### Bug 3 (Low): Company CR and Tax ID aren't checked while typing

- **Steps:** on the Company form, enter Commercial Registry Number `123` and Tax ID `123` with
  everything else valid.
- **Actual:** Verify is enabled. The errors ("The number must start with 7 and be 10 digits long.",
  "Tax ID must be 15 digits and start with 3") only appear after the server answers.
- **Expected:** checked while typing, like the other fields, with Verify disabled until they are valid.
- **Evidence:** [screenshot](screenshots/bug-03-company-cr-tax.png)

### Bug 4 (Low): spaces in Full Name are saved as typed

- **Steps:** register with the Full Name `"  QA AUTO  Spaces  "` (spaces before, between and after),
  then complete the OTP.
- **Actual:** the name is saved exactly as typed. The registration and OTP answers both return
  `"name":"  QA AUTO  Spaces …  "`.
- **Expected:** leading and trailing spaces trimmed, and repeated spaces collapsed to one.
- **Evidence:** recorded from the server's answers during the test run (no visible difference in a
  screenshot).

### Bug 5 (Low): City is required, but no message says so

- **Steps:** fill every Personal field except City/Region.
- **Actual:** Create Account stays disabled, with no message explaining why.
- **Expected:** a message such as "City/ Region cannot be blank", like the other required fields.
- **Evidence:** [screenshot](screenshots/bug-05-city-no-message.png)

### Bug 6 (Low): letters typed in ID/Iqama stay visible, but the message says "cannot be blank"

- **Steps:** type `abcdefghij` in ID/Iqama Number.
- **Actual:** the letters stay in the field, and the message says "ID/ Iqama Number cannot be blank".
- **Expected:** letters are blocked, as in the Mobile field, or the message says "digits only".
- **Evidence:** [screenshot](screenshots/bug-06-09-id-letters-password-wording.png)

### Bug 7 (Low): refreshing on the OTP screen loses the step, but the account already exists

- **Steps**
  1. Submit a valid Personal form. The OTP screen opens, and the account is already created as
     _inactive_.
  2. Refresh the page (or go Back).
  3. Register again with the same mobile number.
- **Actual:**
  - After the refresh, the user gets an empty form with no way back to the OTP step.
  - Registering again is refused: "An account has already been created using this number, try logging
    in".
  - The registration can only be finished by signing in, which then shows the OTP screen.
- **Expected:** the user returns to the OTP step after a refresh, or the page clearly explains how to
  finish verifying.
- **Evidence:** [after refresh and Back](screenshots/bug-07-after-refresh-and-back.png),
  [registering again is refused](screenshots/06-duplicate-phone-unfinished.png)

### Bug 8 (Withdrawn): password toggle wording

- **Originally logged:** the toggle's text read "Show password" and then "Hide text".
- **Re-check:** the button's actual text is **"Show"**, then **"Hide"**, in English (and «إظهار» /
  «إخفاء» in Arabic), which is consistent. The original reading was a test-tool artefact.
- **Status:** withdrawn, kept here for transparency. No action needed.
- **Evidence:** [toggle after Show is clicked](screenshots/bug-08-password-toggle-hide.png)

### Bug 9 (Low): password hint says "digits", but the error says "characters"

- **Steps:** look at the hint under Password, then type `abc`.
- **Actual:** the hint says "Password must be at least 6 **digits**". The error says "Password must be
  at least 6 **characters**", and letters are allowed.
- **Expected:** the hint says "characters".
- **Evidence:** [screenshot](screenshots/bug-06-09-id-letters-password-wording.png)

### Bug 10 (Low): wording on the OTP screen

- **Actual** (text shown on the OTP screen during the test run):
  - **English:** "Get a new one after **01 minutes**".
  - **Arabic:** "يرجى إدخال الرمز **التي** تم إرساله إلى الرقم …". The timer reads
    "اطلب رمز جديد بعد **00 ثانية : 01 دقيقة**" (seconds before minutes).
- **Expected:**
  - **English:** "Get a new one after 1 minute" (or "01:00").
  - **Arabic:** "الرمز **الذي** تم إرساله", and a timer in the order minutes, then seconds.
- **Evidence:** the wording above was copied from the screen during the run. The timer shows "01
  minutes" only during the first second, and the screenshots were taken later
  ([OTP screen](screenshots/04-otp-screen.png) shows the same line at 59 seconds).

### Bug 11 (Low): Edit Mobile Number with the current number gives a misleading message

- **Steps:** on the OTP screen, click Edit Mobile Number, enter the same number the code was sent to,
  and click Continue.
- **Actual:** "An account has already been created using this number, try logging in", although it is
  the user's own number.
- **Expected:** a message such as "This is already your mobile number", or the code is simply sent
  again.
- **Evidence:** the same message appears for any registered number:
  [screenshot](screenshots/07-edit-mobile-registered-number.png).

## Screenshots of passing flows

| Flow                              | Screenshots                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account type                      | [English](screenshots/01-account-type-en.png), [Arabic](screenshots/01-account-type-ar.png)                                                                                              |
| Forms                             | [Personal](screenshots/02-personal-form.png), [Company](screenshots/02-company-form.png), [City list](screenshots/02-city-dropdown.png)                                                  |
| Personal registration, end to end | [filled](screenshots/03-personal-filled.png), [OTP screen](screenshots/04-otp-screen.png), [OTP entered](screenshots/04-otp-entered.png), [success](screenshots/05-personal-success.png) |
| Duplicates                        | [mobile](screenshots/06-duplicate-phone.png), [unfinished account's mobile](screenshots/06-duplicate-phone-unfinished.png), [ID/Iqama](screenshots/06-duplicate-id.png)                  |
| Edit Mobile Number and Resend     | [Edit Mobile Number](screenshots/07-edit-mobile.png), [Resend available](screenshots/08-resend-available.png), [code accepted after 10 minutes](screenshots/08-otp-after-10-minutes.png) |
| Company                           | [valid form](screenshots/09-company-valid.png), [verified](screenshots/09-company-success.png), [Select a partner (Nafath)](screenshots/09-company-partner-nafath.png)                   |
| Arabic                            | [messages](screenshots/10-arabic-messages.png), [success](screenshots/10-arabic-success.png)                                                                                             |
| Phone width                       | [English](screenshots/11-mobile-width-en.png), [Arabic](screenshots/11-mobile-width-ar.png)                                                                                              |

## Test data

- 12 test accounts were registered (11 Personal, 1 Company), each with a `QA AUTO` name, a synthetic
  `0500…` mobile and a synthetic ID/Iqama number.
- All 12 were deleted from the back office (Users → Individuals / Dealers) after testing.
- No existing users were changed.
- The extra evidence screenshots for bugs 1, 5, 6, 8 and 9 were taken afterwards without creating any
  account: bug 1's submit is refused by the server, and the others never submit.
