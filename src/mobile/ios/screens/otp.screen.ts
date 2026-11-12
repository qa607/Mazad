import { IOS_ACCESSIBILITY_IDS as IDS } from '@mobile/ios/ios-selectors';
import { accountContext } from '@mobile/ios/account/account-context';
import { OTP_VALIDATION_KINDS } from '@mobile/ios/account/account-preflight';
import { type ActionAuthorization, authorizeAccountAction } from '@mobile/ios/account/action-guard';
import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/**
 * OTP entry, shared by Forgot Password and the registration journey. Android shows four separate
 * fields and the website one field with four boxes; this accepts exactly those two shapes and
 * fails on anything else, rather than guessing. Confirmed live on the registration OTP screen
 * (2026-11-11, English, physical device): the Verify button carries no accessible name at all
 * (same shape as Login/Forgot Password's submit button); the field layout entered without error.
 */
export class IosOtpScreen extends IosScreen {
  heading(label: string) {
    return this.text(label);
  }

  /** Every TextField on the OTP screen (counted, never picked by position unless digit boxes). */
  get otpFields() {
    return this.allOfType('TextField');
  }

  /** The number of text fields on the OTP screen (read-only). */
  async fieldCount(): Promise<number> {
    return (await this.otpFields.getElements()).length;
  }

  /**
   * The OTP input layout, which the suite supports in exactly two shapes: ONE field for the whole code
   * ('single') or one field per digit ('per-digit', `codeLength` fields). Any other number of fields
   * throws: that layout has to be recorded and supported first, never guessed. Read-only.
   */
  async inputLayout(codeLength: number): Promise<'single' | 'per-digit'> {
    const count = await this.fieldCount();
    if (count === 1) return 'single';
    if (count === codeLength) return 'per-digit';
    throw new Error(
      `OTP: the screen has ${count} text field(s); the suite supports 1 (whole code) or ${codeLength} (one per digit).`,
    );
  }

  /**
   * Whether the resend control is offered right now (read-only: nothing here can tap it). The control is the
   * ONE Button with this exact label; a Button also carries its label as an inner text, so the text is only
   * consulted when there is no Button (a plain text link). None = not offered; a disabled Button = not
   * offered; more than one match throws (never a guess). The label comes from recorded evidence only.
   */
  async resendOffered(label: string): Promise<boolean> {
    const buttons = await this.driver.$$(this.buttonSelector(label)).getElements();
    if (buttons.length > 1) {
      throw new Error(
        `OTP: ${buttons.length} buttons carry the resend label; expected at most 1. Not choosing one.`,
      );
    }
    if (buttons.length === 1) return buttons[0].isEnabled();
    const texts = await this.driver.$$(this.staticTextSelector(label)).getElements();
    if (texts.length > 1) {
      throw new Error(
        `OTP: ${texts.length} texts carry the resend label; expected at most 1. Not choosing one.`,
      );
    }
    return texts.length === 1;
  }

  /**
   * The Verify button: the recorded id, or else the ONE Button without an accessible name (2026-11-11
   * device evidence, registration OTP screen, English: the button carries no label at all, same shape
   * as Login's Log In and Forgot Password's Send). `label` is kept for the error message only; it was
   * never the real selector once an id is missing.
   */
  private async verifyButtonElement(label: string) {
    return this.idOrOnly(
      IDS.otp.verifyButton,
      this.unlabeledButtonSelector(),
      `OTP: the "${label}" button (the only Button without an accessible name)`,
    );
  }

  /** The Verify button for INSPECTION only: it cannot be tapped from here. */
  async verifyButton(label: string): Promise<ReadOnlyElement> {
    return this.readOnly(await this.verifyButtonElement(label));
  }

  /**
   * Types the OTP: one field takes the whole code; one field per digit takes one digit each, in
   * screen order (digit boxes are inherently ordered). Any other number of fields is a failure.
   */
  async enterOtp(otp: string): Promise<void> {
    const fields = await this.otpFields.getElements();
    if (fields.length === 1) {
      await fields[0].setValue(otp);
    } else if (fields.length === otp.length) {
      for (let i = 0; i < otp.length; i++) await fields[i].setValue(otp[i]);
    } else {
      throw new Error(
        `OTP: found ${fields.length} text fields; expected 1 (whole code) or ${otp.length} (one per digit). Not guessing.`,
      );
    }
  }

  /**
   * Submits an OTP for verification: the ONLY place Verify is tapped. The central guard runs first
   * (OTP chains only: validation and negative scenarios each need their own switches and facts).
   */
  async verifyOtp(otp: string, verifyLabel: string, auth: ActionAuthorization): Promise<void> {
    authorizeAccountAction(auth, OTP_VALIDATION_KINDS, 'OTP submission', accountContext);
    await this.enterOtp(otp);
    await this.hideKeyboard();
    await (await this.verifyButtonElement(verifyLabel)).click();
  }
}
