# Mazad iOS: accessibility identifiers requested from the iOS team

**DRAFT: not sent.** For: the Mazad iOS development team. From: QA automation. The QA owner decides
when and how this is sent.

We are automating the guest Login and Forgot Password screens on the iOS app
(`com.motory.dealer` 8.3 (1491), physical iPhone, staging; inspected 2026-11-09 in English and
Arabic; nothing was typed or submitted). Several controls cannot be located reliably. This note lists
what we saw and what we would like the app to expose.

## Questions

1. **`navigationBarClose`:** the Close button on Login and Forgot Password reports the name
   `navigationBarClose` as both its accessible name and its label (in English and in Arabic, so it
   is not localized). **Is `navigationBarClose` a true `accessibilityIdentifier`, or only an
   `accessibilityLabel` (or a default derived from an image or asset name)?** If it is only a
   label, can the button get a real identifier (we propose `navigation_close_button`) and a
   localized label ("Close" / "إغلاق")?
2. **Log In and Send buttons:** on Login and on Forgot Password the main button has **no
   identifier and no label** (it is disabled until the form is filled; its text is not exposed).
   Is that intended? Can they get an identifier and a localized label?
3. **Password show/hide control:** the Login screen shows no element for it. Does the control
   exist in this build, and how is it exposed to accessibility?
4. **Delivery:** when identifiers are added, which build (version and number) will contain them, so
   we can add that build to our approved list? Will the identifiers be the same in staging and other
   builds?

## Status of these findings

Nothing below is verified or in use by our automation yet. The "Recommended ID" column is a proposal.
Our tests do not locate these controls by position, index or guessed text: tests that need a
**blocking** control stay pending until its identifier exists.

## Finding: the app exposes almost no accessibility identifiers

Only three identifiers were seen on the guest screens (`PopoverDismissRegion`,
`WelcomeMazadLogoAr`, `welcomeImage`), and none belongs to a control the tests use. Everything else
is found only by its visible, language-specific label, or not at all.

## Requested identifiers

Identifiers should be language-independent, stable, and set as `accessibilityIdentifier` (not as the
visible label). Controls that currently have **no label at all** also need a localized
`accessibilityLabel` (this is also a VoiceOver defect).

| Screen                 | Control                                                                                                               | Observed (2026-11-09)                                                                                                                                                                                   | Recommended ID                                                                      | Priority               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------- |
| Login                  | **Log In button**                                                                                                     | Button with **no id and no label**, disabled while the form is empty; "Log In" appears only as the screen title (StaticText)                                                                            | `login_submit_button` + label "Log In" / "تسجيل الدخول"                             | **Blocking**           |
| Login                  | **Password show/hide control**                                                                                        | **Not exposed at all** (no element in the password row)                                                                                                                                                 | `login_password_visibility_button` + label ("Show password" / "Hide password")      | **Blocking**           |
| Forgot Password        | **Send button**                                                                                                       | Button with **no id and no label**, disabled while the phone is empty; the expected text "Send" / "أرسل" does not appear anywhere                                                                       | `forgot_password_send_button` + label "Send" / "أرسل"                               | **Blocking**           |
| Login, Forgot Password | **Close button**                                                                                                      | Button named `navigationBarClose` in both languages (accessible name and label are both this string; not localized; it is unclear whether it is an identifier or a label)                               | `navigation_close_button` as identifier, plus a localized label ("Close" / "إغلاق") | **Blocking**           |
| Login                  | Phone field                                                                                                           | TextField, placeholder only                                                                                                                                                                             | `login_phone_field`                                                                 | High                   |
| Login                  | Password field                                                                                                        | SecureTextField, placeholder only                                                                                                                                                                       | `login_password_field`                                                              | High                   |
| Login                  | Forgot password link                                                                                                  | Button, label "Forgot your password?" / "هل نسيت كلمة المرور؟"                                                                                                                                          | `login_forgot_password_button`                                                      | High                   |
| Forgot Password        | Phone field                                                                                                           | TextField, placeholder only                                                                                                                                                                             | `forgot_password_phone_field`                                                       | High                   |
| Forgot Password        | Heading                                                                                                               | StaticText "Reset Password" / "إعادة تعيين كلمة المرور"                                                                                                                                                 | `forgot_password_title`                                                             | Medium                 |
| Tab bar                | Home tab                                                                                                              | Button, label "Home" / "الرئيسية"                                                                                                                                                                       | `tab_home`                                                                          | High                   |
| Tab bar                | More tab                                                                                                              | Button, label "More" / "المزيد"                                                                                                                                                                         | `tab_more`                                                                          | High                   |
| More (guest)           | Login / Create account prompt                                                                                         | Button, label "Login/ Create an account" / "تسجيل الدخول/ إنشاء حساب"                                                                                                                                   | `more_guest_login_prompt`                                                           | High                   |
| More                   | Language options                                                                                                      | Found by their text ("English" / "العربية")                                                                                                                                                             | `more_language_option_english`, `more_language_option_arabic`                       | High                   |
| Welcome sheet          | Log In and Create-account buttons                                                                                     | Buttons, labels "Log In" / "تسجيل الدخول" and "Create new account". The Log In button and the text inside it carry the same label, so a label alone matches two elements (we select the Button by type) | `welcome_login_button`, `welcome_register_button`                                   | High                   |
| More                   | **Six buttons with no id and no label** (two at the top of the screen, four 48 x 48 buttons in a row, probably icons) | Unlabeled                                                                                                                                                                                               | An id and a localized label each                                                    | Medium (accessibility) |

Not inspected yet (needs an OTP request or a login, which are not approved): the OTP screen (fields,
Verify button), the New Password screen (field, Save button), the signed-in More screen (Logout and
its confirmation). Ids for these will be requested after those screens are inspected.

## Observed behavior to confirm (not assumed)

- **Close on Forgot Password:** tapped once in each language during the inspection; both times the app
  showed the **Login** screen (password field and "Forgot your password?" link visible). We accept
  this provisionally (observed once per language); please tell us if Close is meant to do something
  else. Forgot Password has no Back button, only Close. The automation now finds Close by its exact
  name `navigationBarClose` (one Button, checked on every run) and the test passes in both languages;
  a real identifier is still requested (see question 1).
- **Language switching:** the app starts in the language it was last used in. From More, the other
  language's option switched the app and returned to the Home tab, in both directions.

## What the automation will do with the ids

Once the ids exist in a build and are reviewed, they are recorded in the selector registry in code
review. The four **blocking** controls then become usable, and the tests that need them (Log In
disabled states, password visibility, Send disabled, Close, and everything that starts with Send or
Log In) stop being pending and run. Until then they are declared pending (fixme) with this note as
the reason.
