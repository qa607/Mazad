import { InspectionAndroidScreen } from '@mobile/inspection-android/screens/inspection-android.screen';
import { isAncestorButtonEnabled } from '@mobile/inspection-android/accessibility-xml';

/**
 * Inspector login (Inspection Android). Confirmed live 2026-11-14: the app's own session can
 * expire (observed after it had been signed in across many earlier test runs via `noReset`), at
 * which point a cold launch lands here instead of Home - so this screen is reachable both as a
 * deliberate navigation target and as a fallback the fixture must handle on its own.
 *
 * Mobile Number + Password (English/Arabic toggle, EN by default). Confirmed via
 * config/credentials.config.ts's own doc comment that the Inspection backend account shape is
 * "mobile number and a 4-digit PIN" - this screen's own field is labelled "Password", so the PIN
 * value is what's typed into it.
 *
 * This screen's accessibility tree is otherwise empty of text (confirmed live: a bare
 * getPageSource() right after a cold app launch, before this screen finishes composing, returns
 * only a ProgressBar with no labels at all - allow several seconds for it to render before reading
 * anything here, unlike the rest of this app's screens which compose near-instantly).
 *
 * Both input fields are the kind of value that must never appear in a report, log line, or thrown
 * error (a real mobile number, even for a dedicated test account, and its PIN) - entered with
 * typeSecretReliably(), never typeReliably().
 */
export class InspectorLoginScreen extends InspectionAndroidScreen {
  get mobileNumberInput() {
    return this.driver.$(
      'android=new UiSelector().className("android.widget.EditText").instance(0)',
    );
  }

  get passwordInput() {
    return this.driver.$(
      'android=new UiSelector().className("android.widget.EditText").instance(1)',
    );
  }

  /** "Log in" (English) or "تسجيل الدخول" (Arabic) - confirmed live 2026-11-15 this screen's own
   * language can already be Arabic on arrival (e.g. right after a log-out that happened while the
   * app's language was set to Arabic), so an English-only locator intermittently times out here
   * even though the screen is genuinely ready - see byTextAny()'s own doc comment. */
  get loginButton() {
    return this.byTextAny('Log in', 'تسجيل الدخول');
  }

  get englishOption() {
    return this.byText('English');
  }

  get arabicOption() {
    return this.byTextContains('العرب');
  }

  async waitUntilReady(timeout = 15_000): Promise<void> {
    await this.loginButton.waitForDisplayed({ timeout });
  }

  /** True when the "Log in" button's own clickable ancestor reads as enabled - read the same way
   * as Basic Info's Save & Continue (see isAncestorButtonEnabled's doc comment). Checks both
   * language labels since the page source at this point may be in either. */
  async isLoginEnabled(): Promise<boolean> {
    const xml = await this.driver.getPageSource();
    return (
      isAncestorButtonEnabled(xml, 'Log in') === true ||
      isAncestorButtonEnabled(xml, 'تسجيل الدخول') === true
    );
  }

  /** Enters the mobile number (without the "+966" prefix, which is a fixed part of the field, not
   * typed text) and the password/PIN, then taps "Log in". Does not wait for or assert the result -
   * the caller (a screen-specific waitUntilReady(), e.g. InspectorHomeScreen's) does that, since a
   * valid attempt navigates away from this screen entirely. */
  async login(mobileNumber: string, password: string): Promise<void> {
    // Confirmed live: despite the field showing a separate, fixed "+966" prefix, it still rejects
    // a number typed without its own leading "0" ("Mobile number must start with '05'" - the
    // field's own placeholder, "e.g. 0554235678", confirms this). Stored account numbers
    // (config/credentials.config.ts) are in the other, more common local-number-without-leading-
    // zero shape, so one is added here if not already present, rather than changing the stored
    // account shape project-wide for this one screen's quirk.
    const localNumber = mobileNumber.startsWith('0') ? mobileNumber : `0${mobileNumber}`;
    const mobileOk = await this.typeSecretReliably(this.mobileNumberInput, localNumber);
    await this.hideKeyboardIfShown();
    // Length comparison, not exact text: confirmed live the password field's own getText() always
    // returns bullet characters ("••••"), never the real typed value - see typeSecretReliably()'s
    // doc comment.
    const passwordOk = await this.typeSecretReliably(this.passwordInput, password, {
      isMatch: (current, value) => current.length === value.length,
    });
    await this.hideKeyboardIfShown();
    if (!mobileOk || !passwordOk) {
      throw new Error('Could not type the login credentials into their fields.'); // Never the values themselves.
    }
    await this.waitForUiIdle();
    await this.tapElement(this.loginButton);
  }
}
