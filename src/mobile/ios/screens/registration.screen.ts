import { IOS_ACCESSIBILITY_IDS as IDS } from '@mobile/ios/ios-selectors';
import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/**
 * Registration entry (guest). NAVIGATION AND DISPLAY ONLY: this screen object can open the first
 * registration step and read it; it has no way to select an account type, type a value or tap Next,
 * so nothing can be submitted and no account or OTP request can result. Observed on the device
 * (guest inspection 2026-11-09, build 8.3 (1491), English and Arabic): the "Create a new account"
 * choice on the welcome sheet opens a "Choose Account Type" step with two unlabeled account-type
 * buttons and a "Next" button that is disabled until a type is chosen.
 *
 * Every control is the ONE element with its exact label (checked each time, never by position).
 */
export class IosRegistrationScreen extends IosScreen {
  /**
   * Taps the guest prompt on More, then the "Create a new account" choice on the welcome sheet it
   * opens (the ONE Button with that exact label). Navigation only.
   */
  async openFromGuestPrompt(promptLabel: string, createAccountLabel: string): Promise<void> {
    const prompt = await this.idOrOnly(
      IDS.appShell.guestPrompt,
      this.buttonSelector(promptLabel),
      `More: the "${promptLabel}" prompt`,
    );
    await prompt.click();
    const choice = await this.only(
      this.buttonSelector(createAccountLabel),
      `Welcome sheet: the "${createAccountLabel}" button`,
    );
    await choice.click();
  }

  /** A text of the registration step: the ONE StaticText with this exact label. */
  async onlyText(label: string) {
    return this.only(this.staticTextSelector(label), `Registration: the "${label}" text`);
  }

  /** The Next button for INSPECTION only (shown, enabled): it cannot be tapped from here. */
  async nextButton(label: string): Promise<ReadOnlyElement> {
    return this.readOnly(
      await this.only(this.buttonSelector(label), `Registration: the "${label}" button`),
    );
  }
}
