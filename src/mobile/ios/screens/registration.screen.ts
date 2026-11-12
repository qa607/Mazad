import type { OtpRequestPermit } from '@mobile/ios/account/otp-permit';
import { IOS_ACCESSIBILITY_IDS as IDS } from '@mobile/ios/ios-selectors';
import { parseIosSource } from '@mobile/ios/page-source';
import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/**
 * Registration (guest). Observed on the device (guest inspection 2026-11-09, build 8.3 (1491),
 * English and Arabic): the "Create a new account" choice on the welcome sheet opens a "Choose
 * Account Type" step with two unlabeled account-type buttons and a "Next" button that is disabled
 * until a type is chosen.
 *
 * Individual ("Personal") Step 2 and its City/Region picker (registration-E2E-journey inspection,
 * 2026-11-11, build 8.3 (1491), English, physical device): the FIRST (leftmost) of the two
 * unlabeled account-type buttons opens "Create Personal Account" with 5 fields (Full Name,
 * ID/ Iqama Number, Mobile Number, Password, City/ Region) and a "Create Account" button, both
 * initially disabled/empty. None of these controls has an accessibility id or its own label
 * either; Full Name/ID/Mobile/Password are located by their exact placeholder text (the only
 * stable, visible text they carry), and City/Region and Create Account by tapButtonContainingText
 * (see ios.screen.ts): neither the class-chain nor the XPath descendant-matching dialects this
 * driver supports could locate a Button by a child StaticText's label, so the coordinate tap on
 * the Button whose frame contains that label's frame is the documented interim locator for this
 * shape (tests-ios/registration-account-type.inspect.ts has the raw page-source evidence). The
 * City/Region control opens a search sheet listing cities as plain labeled StaticTexts (no picker
 * wheel), selected the same way as any other labeled text. Company/Dealer Step 2 has not been
 * inspected and is out of scope: only the Individual account is handled here.
 *
 * Every control is the ONE element with its exact label or placeholder (checked each time, never
 * by position), except where this comment says otherwise.
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

  /**
   * Taps Next on the account-type step. Local UI navigation only (the step only ENABLES Next;
   * this method does not request an OTP or an account, so it needs no account-action guard).
   */
  async tapNext(label: string): Promise<void> {
    await this.button(label).click();
  }

  /**
   * Taps the account-type button at `index`, among the two unlabeled Buttons of the choose-account-
   * type step (2026-11-09 guest inspection; see the class doc comment). LOCAL UI ONLY: selecting a
   * type sends nothing to the backend (it only enables Next), so this needs no account-action guard.
   * `index` is chosen from the page source BEFORE calling this (see tests-ios/registration-*.inspect.ts
   * for how the two were told apart); this method never guesses by assuming a fixed meaning for 0/1.
   */
  async selectAccountTypeButton(index: number): Promise<void> {
    const buttons = await this.driver.$$(this.unlabeledButtonSelector()).getElements();
    if (buttons.length < 2) {
      throw new Error(
        `Registration: expected at least 2 unlabeled account-type buttons, found ${buttons.length}.`,
      );
    }
    const button = buttons[index];
    if (!button) {
      throw new Error(`Registration: no unlabeled account-type button at index ${index}.`);
    }
    await button.click();
  }

  /** The FIRST (leftmost) account-type button: "Create Personal Account" (confirmed 2026-11-11). */
  async selectPersonalAccountType(): Promise<void> {
    await this.selectAccountTypeButton(0);
  }

  // --- Individual ("Personal") Step 2: fields by their exact placeholder text. ---

  /**
   * Taps to focus, clears, then types: back-to-back setValue() calls across fields were observed
   * (2026-11-11) to leak characters into the wrong, previously-focused field; an explicit tap and
   * clear before each one gives every field a clean, focused state of its own.
   */
  private async typeInto(selector: string, value: string): Promise<void> {
    const field = this.driver.$(selector);
    await field.click();
    await field.clearValue();
    await field.setValue(value);
  }

  async enterFullName(fullNamePlaceholder: string, value: string): Promise<void> {
    await this.typeInto(this.placeholderSelector('TextField', fullNamePlaceholder), value);
  }

  async enterIqama(iqamaPlaceholder: string, value: string): Promise<void> {
    await this.typeInto(this.placeholderSelector('TextField', iqamaPlaceholder), value);
  }

  async enterMobile(mobilePlaceholder: string, value: string): Promise<void> {
    await this.typeInto(this.placeholderSelector('TextField', mobilePlaceholder), value);
  }

  async enterPassword(passwordPlaceholder: string, value: string): Promise<void> {
    await this.typeInto(this.placeholderSelector('SecureTextField', passwordPlaceholder), value);
  }

  /** Opens the City/Region picker sheet. Local UI only: no backend call. */
  async openCityPicker(cityFieldLabel: string): Promise<void> {
    await this.tapButtonContainingText(cityFieldLabel, 'Registration: City/Region');
  }

  /** Selects a city in the opened picker sheet: the ONE labeled StaticText with this exact name. */
  async selectCity(cityName: string): Promise<void> {
    await (
      await this.only(this.staticTextSelector(cityName), `City/Region: "${cityName}"`)
    ).click();
  }

  /**
   * Selects whichever city the sheet lists FIRST (its table starts at y > 190; 2026-11-11
   * inspection, both languages): the test needs only "a valid city is selected", never a specific
   * one, and the list's exact membership and order are not recorded. Throws if no row is found.
   */
  async selectFirstCity(): Promise<void> {
    // The sheet's own Search field may have taken focus (and the keyboard with it), which would
    // shift which rows are visible by the time the page source below is read.
    await this.hideKeyboard();
    // The sheet's list can still be animating in or loading when this runs right after the tap
    // that opened it; poll briefly rather than reading the page source exactly once.
    const end = Date.now() + 10_000;
    let first: ReturnType<typeof parseIosSource>[number] | undefined;
    do {
      const elements = parseIosSource(await this.driver.getPageSource());
      first = elements.find((e) => e.visible && e.type === 'StaticText' && e.y > 190);
      if (first) break;
      await this.driver.pause(300);
    } while (Date.now() < end);
    if (!first) throw new Error('City/Region picker: no city row found.');
    await (
      await this.only(this.staticTextSelector(first.label), `City/Region: "${first.label}"`)
    ).click();
  }

  /** Whether Create Account is enabled right now (read-only: it cannot be tapped from here). */
  async createAccountEnabled(createAccountLabel: string): Promise<boolean> {
    return this.buttonContainingTextEnabled(createAccountLabel, 'Registration: Create Account');
  }

  /**
   * Submits Step 2: the ONLY place Create Account is tapped, and the ONLY way to reach it is a
   * valid, single-use OTP request permit bound to `phone` (see otp-permit.ts; the same pattern as
   * forgot-password.screen.ts's requestPasswordReset) — this tap is what sends the registration
   * OTP request to the number just typed above. The permit is consumed BEFORE anything is tapped,
   * so a missing, reused, lapsed, wrongly bound or no-longer-authorized permit refuses and types
   * and taps nothing.
   */
  async submitCreateAccount(
    createAccountLabel: string,
    phone: string,
    permit: OtpRequestPermit,
  ): Promise<void> {
    permit.consume(phone);
    await this.hideKeyboard();
    await this.tapButtonContainingText(createAccountLabel, 'Registration: Create Account');
  }

  /**
   * Dismisses the "Your account has been successfully created!" confirmation screen shown after
   * registration OTP verification (2026-11-11 device evidence, English): its own Close button has
   * the name "navigationBarClose", and its ONE other control is a Button with no accessible name
   * at all. Local UI only (no backend call). A no-op when this screen is not shown (any other
   * screen with exactly one unlabeled Button would be a false match, so this also requires the
   * Close button to be present).
   */
  async dismissSuccessScreenIfShown(): Promise<void> {
    const hasClose = await this.driver
      .$('-ios predicate string:type == "XCUIElementTypeButton" AND name == "navigationBarClose"')
      .isExisting()
      .catch(() => false);
    if (!hasClose) return;
    const buttons = await this.driver.$$(this.unlabeledButtonSelector()).getElements();
    if (buttons.length === 1) await buttons[0].click();
  }
}
