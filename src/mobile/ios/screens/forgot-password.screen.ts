import { IOS_ACCESSIBILITY_IDS as IDS } from '@mobile/ios/ios-selectors';
import type { OtpRequestPermit } from '@mobile/ios/account/otp-permit';
import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/** The accessible name the app gives its Close button, as observed (name and label are equal). */
export const OBSERVED_CLOSE_NAME = 'navigationBarClose';

/**
 * Forgot Password, step 1 (phone). No accessibility ids are recorded yet (see IosScreen), so the
 * display-only checks use selectors the 2026-11-09 inspection showed to be unique, verified again
 * on every use (never `.first()`, an index or an ordering assumption).
 */
export class IosForgotPasswordScreen extends IosScreen {
  /** The heading: a StaticText with this exact label (presence checks; see onlyHeading). */
  heading(label: string) {
    return this.driver.$(this.staticTextSelector(label));
  }

  /** The heading, verified to be the ONE StaticText with this exact label. */
  async onlyHeading(label: string) {
    return this.only(this.staticTextSelector(label), `Forgot Password: the "${label}" heading`);
  }

  /** The phone field: the only TextField on the screen (no index). */
  get phoneInput() {
    return this.idOr(IDS.forgotPassword.phoneInput, () => this.byType('TextField'));
  }

  /** The phone field, verified to be the ONE TextField on the screen. */
  async onlyPhoneInput() {
    return this.idOrOnly(
      IDS.forgotPassword.phoneInput,
      this.typeSelector('TextField'),
      'Forgot Password: phone field (the only TextField)',
    );
  }

  /**
   * The Send button. The app gives it no id and no label, so until an id is recorded it is the
   * ONE Button on the Forgot Password screen without an accessible name (checked on every use).
   * Interim locator: docs/ios-accessibility-ids-request.md.
   */
  private async sendButtonElement() {
    return this.idOrOnly(
      IDS.forgotPassword.sendButton,
      this.unlabeledButtonSelector(),
      'Forgot Password: the Send button (the only Button without an accessible name)',
    );
  }

  /** The Send button for INSPECTION only (shown, enabled, frame): it cannot be tapped from here. */
  async sendButton(): Promise<ReadOnlyElement> {
    return this.readOnly(await this.sendButtonElement());
  }

  /**
   * The Close button (the screen has no Back button). Located by its recorded accessibility id,
   * or else by the accessible name the app gives it, `navigationBarClose`, on the ONE Button
   * with exactly that name (checked on every use, never by position). Whether that name is a
   * true identifier or only a label is an open question for the iOS team
   * (docs/ios-accessibility-ids-request.md); it is observed on both screens in both languages.
   */
  async onlyCloseButton() {
    return this.idOrOnly(
      IDS.forgotPassword.closeButton,
      `-ios predicate string:type == "XCUIElementTypeButton" AND name == ${JSON.stringify(OBSERVED_CLOSE_NAME)}`,
      'Forgot Password: the Close button',
    );
  }

  /**
   * The phone field's current value (read-only). An EMPTY field reports its placeholder text as its
   * value on iOS, so compare with the value read before typing, never with an empty string.
   */
  async phoneValue(): Promise<string> {
    return String((await (await this.onlyPhoneInput()).getValue()) ?? '');
  }

  /** Types into the phone field and hides the keyboard. Typing only: Send cannot be tapped from here. */
  async enterPhone(value: string): Promise<void> {
    await (await this.onlyPhoneInput()).setValue(value);
    await this.hideKeyboard();
  }

  /** Clears the phone field and hides the keyboard (Send cannot be tapped from here). */
  async clearPhone(): Promise<void> {
    await (await this.onlyPhoneInput()).clearValue();
    await this.hideKeyboard();
  }

  /** Taps Close (navigation only: back to Login). Nothing is submitted. */
  async close(): Promise<void> {
    await (await this.onlyCloseButton()).click();
  }

  /**
   * Requests an OTP: types the number and taps Send. The ONLY place Send is tapped. The permit is
   * consumed first (it re-checks every authorization and records the request in the ledger), so
   * without a valid, unused permit for this number nothing is typed and nothing is sent.
   */
  async requestPasswordReset(phone: string, permit: OtpRequestPermit): Promise<void> {
    permit.consume(phone);
    await (await this.onlyPhoneInput()).setValue(phone);
    await this.hideKeyboard();
    await (await this.sendButtonElement()).click();
  }
}
