import { accountContext } from '@mobile/ios/account/account-context';
import { type ActionAuthorization, authorizeAccountAction } from '@mobile/ios/account/action-guard';
import { LOGIN_KINDS } from '@mobile/ios/account/account-preflight';
import { iosFavouritesBlocked } from '@mobile/ios/ios-preflight';
import { IOS_ACCESSIBILITY_IDS as IDS } from '@mobile/ios/ios-selectors';
import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/**
 * Mazad iOS login form. Business behaviour mirrors the recorded web and Android flows. No
 * accessibility ids are recorded yet (see IosScreen), so the display-only flow uses selectors the
 * 2026-11-09 inspection showed to be unique (an exact label on one element type, or the only
 * field of its type), and checks that uniqueness each time it runs. Expected text is passed in
 * by the caller (test-data/ios-app.data.ts), never hardcoded here.
 */
export class IosLoginScreen extends IosScreen {
  /**
   * The phone number field: the only TextField on the form (no index). Plain getter for callers
   * that already verified the form with waitForForm(); use onlyPhoneInput() to verify as it goes.
   */
  get phoneInput() {
    return this.idOr(IDS.login.phoneInput, () => this.byType('TextField'));
  }

  /** The password field while hidden: the only SecureTextField on the form (no index). */
  get passwordInput() {
    return this.idOr(IDS.login.passwordInput, () => this.byType('SecureTextField'));
  }

  /**
   * The password field while shown in plain text. Not located by position (it would be "the
   * second text field"): only by a recorded accessibility id.
   */
  get passwordInputShown() {
    return this.requireId(IDS.login.passwordInputShown, 'Login: password field while shown');
  }

  /** The phone field, verified to be the ONE TextField on the screen. */
  async onlyPhoneInput() {
    return this.idOrOnly(
      IDS.login.phoneInput,
      this.typeSelector('TextField'),
      'Login: phone field (the only TextField)',
    );
  }

  /** The password field, verified to be the ONE SecureTextField on the screen. */
  async onlyPasswordInput() {
    return this.idOrOnly(
      IDS.login.passwordInput,
      this.typeSelector('SecureTextField'),
      'Login: password field (the only SecureTextField)',
    );
  }

  /** Waits for the login form and verifies it has exactly one phone and one password field. */
  async waitForForm(): Promise<void> {
    await this.onlyPhoneInput();
    await this.onlyPasswordInput();
  }

  /**
   * The Log In button. The app gives it no id and no label, so until an id is recorded it is
   * the ONE Button on the Login screen without an accessible name (checked on every use: none or
   * several fail). Interim locator: docs/ios-accessibility-ids-request.md.
   */
  private async loginButtonElement() {
    return this.idOrOnly(
      IDS.login.loginButton,
      this.unlabeledButtonSelector(),
      'Login: the Log In button (the only Button without an accessible name)',
    );
  }

  /** The Log In button for INSPECTION only (shown, enabled, frame): it cannot be tapped from here. */
  async loginButton(): Promise<ReadOnlyElement> {
    return this.readOnly(await this.loginButtonElement());
  }

  /** The Forgot Password link: a Button with this exact label (the only one on the form). */
  async onlyForgotPasswordLink(label: string) {
    return this.idOrOnly(
      IDS.login.forgotPasswordLink,
      this.buttonSelector(label),
      `Login: the "${label}" link`,
    );
  }

  /**
   * The show/hide password control. Not exposed by the app (inspected 2026-11-09): located only
   * by a recorded accessibility id, never by position.
   */
  get passwordVisibilityToggle() {
    return this.requireId(IDS.login.passwordVisibilityToggle, 'Login: password visibility control');
  }

  /**
   * Taps the guest prompt on More, then the "Log In" choice on the sheet it opens. Each is the
   * ONE Button with that exact label: on the sheet, "Log In" also labels a text inside the
   * button, so the Button type is part of the selector (never `.first()` or an index).
   */
  async openLoginForm(promptLabel: string, loginChoiceLabel: string): Promise<void> {
    const prompt = await this.idOrOnly(
      IDS.appShell.guestPrompt,
      this.buttonSelector(promptLabel),
      `More: the "${promptLabel}" prompt`,
    );
    await prompt.click();
    const choice = await this.only(
      this.buttonSelector(loginChoiceLabel),
      `Welcome sheet: the "${loginChoiceLabel}" button`,
    );
    await choice.click();
  }

  /**
   * The welcome sheet's "Log In" choice, for presence checks. The sheet opens from More's guest
   * prompt and from guest-only actions (a car card's heart).
   */
  loginChoice(label: string) {
    return this.button(label);
  }

  /** Taps the welcome sheet's "Log In" choice (the ONE Button with that label), then waits for the form. */
  async chooseLogin(loginChoiceLabel: string): Promise<void> {
    const choice = await this.only(
      this.buttonSelector(loginChoiceLabel),
      `Welcome sheet: the "${loginChoiceLabel}" button`,
    );
    await choice.click();
    await this.waitForForm();
  }

  /** The digits in the phone field, so a caller can check the whole number went in. */
  async phoneDigits(): Promise<string> {
    return ((await (await this.onlyPhoneInput()).getAttribute('value')) ?? '').replace(/\D/g, '');
  }

  /**
   * Submits a login for the favourites tests ONLY, under their own approval (iosFavouritesBlocked:
   * IOS_ALLOW_FAVOURITES), not the account-run guard used by login(): without it nothing is typed
   * or tapped. One attempt; the caller checks the phone went in before calling submitLogin.
   */
  async enterFavouritesLogin(phone: string, password: string): Promise<void> {
    const blocked = iosFavouritesBlocked();
    if (blocked) throw new Error(blocked);
    await this.enterPhone(phone);
    await this.enterPassword(password);
  }

  /** Taps Log In after enterFavouritesLogin(), under the same approval. */
  async submitFavouritesLogin(): Promise<void> {
    const blocked = iosFavouritesBlocked();
    if (blocked) throw new Error(blocked);
    await this.hideKeyboard();
    await (await this.loginButtonElement()).click();
  }

  /** Dismisses a one-off prompt by its dismiss Button's exact label, if shown (e.g. biometrics). */
  async dismissPromptIfPresent(label: string): Promise<void> {
    const button = this.button(label);
    if (await button.isExisting().catch(() => false)) await button.click();
  }

  async enterPhone(phone: string): Promise<void> {
    await (await this.onlyPhoneInput()).setValue(phone);
  }

  async enterPassword(password: string): Promise<void> {
    await (await this.onlyPasswordInput()).setValue(password);
  }

  /**
   * Submits a login: the ONLY place the Log In button is tapped. The central guard runs first, so
   * without every authorization (confirmed policy facts and synthetic account, and the iOS and Mazad
   * switches for this run kind) nothing is typed and nothing is tapped.
   */
  async login(phone: string, password: string, auth: ActionAuthorization): Promise<void> {
    authorizeAccountAction(auth, LOGIN_KINDS, 'Login submission', accountContext);
    await this.enterPhone(phone);
    await this.enterPassword(password);
    await this.hideKeyboard();
    await (await this.loginButtonElement()).click();
  }

  async openForgotPassword(label: string): Promise<void> {
    await (await this.onlyForgotPasswordLink(label)).click();
  }
}
