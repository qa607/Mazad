# Request to the Mazad iOS developers: two accessibility questions

**Ready to send, NOT sent.** The QA owner decides when and how. Written for: the Mazad iOS
developers (`com.motory.dealer` 8.3 (1491), staging). The full table of other controls is in
`docs/ios-accessibility-ids-request.md`.

Hello, we are automating Login and Forgot Password on the iPhone app and need two answers. In
both cases we looked at the app's accessibility tree on a physical iPhone, in English and Arabic.
Nothing was submitted.

## 1. Password show/hide control (Login screen)

The Login screen has a password field, but its accessibility tree contains **no element for a
show/hide control**. The Android app has one.

- Does this build have a show/hide control on Login? (Yes/No)
- If yes: it is not reachable by accessibility, which also affects VoiceOver. Please expose it as a
  button with an `accessibilityIdentifier` (we propose `login_password_visibility_button`) and a
  localized label ("Show password" / "Hide password", or the Arabic equivalents).
- If no: please confirm the iOS app is not meant to have one, so we can mark that scenario "not
  applicable on iOS" instead of pending.

## 2. `navigationBarClose` (Login and Forgot Password)

The Close button reports the name `navigationBarClose` as both its accessible name and its label, in
English and in Arabic (so it is not localized).

- Is `navigationBarClose` an **`accessibilityIdentifier`** you set, or only a default label (for
  example derived from an image or asset name)?
- If it is only a label, please add an identifier (we propose `navigation_close_button`) and a
  localized label ("Close" / "إغلاق"). Until we hear back, our tests find it by the exact name
  `navigationBarClose` and fail if more than one button has it.

## Also useful (same answer can cover them)

- The Log In button (Login) and the Send button (Forgot Password) have **no identifier and no
  label**. Is that intended? We propose `login_submit_button` and `forgot_password_send_button`
  with localized labels.
- Which build will contain any change, so we can add it to our list of approved builds?

Thank you.
