import { IOS_ACCESSIBILITY_IDS as IDS } from '@mobile/ios/ios-selectors';
import { accountContext } from '@mobile/ios/account/account-context';
import { PASSWORD_ATTEMPT_KINDS, PASSWORD_SAVE_KINDS } from '@mobile/ios/account/account-preflight';
import { type ActionAuthorization, authorizeAccountAction } from '@mobile/ios/account/action-guard';
import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/**
 * Forgot Password, step 3 (new password). Web and Android have a single new-password field and
 * no confirmation field; a confirmation field is only added here if the iOS app has one. The
 * screen has never been seen on iOS (it needs a real OTP), so each control is the ONE match, or
 * the lookup fails.
 */
export class IosNewPasswordScreen extends IosScreen {
  heading(label: string) {
    return this.text(label);
  }

  /** The number of password fields (secure text fields) on the screen (read-only). */
  async passwordFieldCount(): Promise<number> {
    return (await this.driver.$$(this.typeSelector('SecureTextField')).getElements()).length;
  }

  /** The number of plain text fields (not secure) on the screen: evidence of the layout only (read-only). */
  async otherTextFieldCount(): Promise<number> {
    return (await this.driver.$$(this.typeSelector('TextField')).getElements()).length;
  }

  /** The new-password field: the recorded id, or else the ONE SecureTextField. */
  async newPasswordInput() {
    return this.idOrOnly(
      IDS.newPassword.passwordInput,
      this.typeSelector('SecureTextField'),
      'New Password: the password field (the only SecureTextField)',
    );
  }

  /** The Save and Login button: the recorded id, or else the ONE Button with exactly this label. */
  private async saveButtonElement(label: string) {
    return this.idOrOnly(
      IDS.newPassword.saveAndLoginButton,
      this.buttonSelector(label),
      `New Password: the "${label}" button`,
    );
  }

  /** The Save and Login button for INSPECTION only: it cannot be tapped from here. */
  async saveAndLoginButton(label: string): Promise<ReadOnlyElement> {
    return this.readOnly(await this.saveButtonElement(label));
  }

  /**
   * Submits a new password: the ONLY place Save is tapped. The central guard runs first. `intent`
   * decides which run kinds may do it: an invalid attempt (nothing is saved) may be made by a chain
   * that stops before saving or by a reset chain; SAVING a password needs a reset chain, with its
   * five switches.
   */
  async setNewPassword(
    password: string,
    saveLabel: string,
    auth: ActionAuthorization,
    intent: 'invalid-attempt' | 'save',
  ): Promise<void> {
    if (intent !== 'invalid-attempt' && intent !== 'save') {
      throw new Error('Password submission refused: the intent is missing.');
    }
    authorizeAccountAction(
      auth,
      intent === 'save' ? PASSWORD_SAVE_KINDS : PASSWORD_ATTEMPT_KINDS,
      intent === 'save' ? 'Password save' : 'Invalid password attempt',
      accountContext,
    );
    await (await this.newPasswordInput()).setValue(password);
    await this.hideKeyboard();
    await (await this.saveButtonElement(saveLabel)).click();
  }

  /** Dismisses a one-time prompt (e.g. "enable Face ID login") by its button text, if shown. */
  async dismissPromptIfPresent(label: string): Promise<void> {
    const button = this.button(label);
    if (await button.isExisting()) await button.click();
  }
}
