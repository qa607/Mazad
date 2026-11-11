import { MobileScreen } from '@mobile/screens/mobile.screen';

/**
 * Mazad Android registration. Confirmed on staging, 2026-11-10/11: the guest-prompt bottom sheet,
 * "Create a new account", the account-type screen, and both Step 2 forms (Personal and Company).
 *
 * The account-type screen's heading/card labels, and most Step 2 field labels (Full Name,
 * ID/Iqama, Mobile Number, Password, City/Region, Tax ID, the submit buttons), read identically
 * to the website's own `t()` strings (confirmed in English and Arabic) — see individual getters
 * below for which key each one matches. Text that does NOT match the website is kept out of
 * `t()` entirely and lives in `test-data/mobile-app.data.ts` `registrationFlow` instead: the
 * Step 2 screen headings and section headings, the Commercial Registry label (the app adds
 * "(The 700 Number)" in English where the website's `registrationCrNumberLabel` does not), the
 * City/Region placeholder (app: "Select from the list"; website: "Select City/ Region"), the
 * mobile-verification hint and the fuller password note — none of these exist in `src/locales` at
 * all today. Required fields show their label suffixed with " *"; getters below return the bare
 * label only, so callers compare with `toContain()`, not `toBe()`.
 *
 * City/Region opens a native bottom sheet (search box + `recycler_items` list; confirmed 33
 * cities, same list/order as the website); every row reuses the SAME resource id
 * (`text_view_phone_number_label`, an app view-binding quirk, not ours to fix), so rows are
 * found by exact text only, the same way the website selects by exact text.
 *
 * `submitCreateAccount()`/`submitVerify()` and the OTP step DO submit and create a real account —
 * confirmed on staging 2026-11-11 (Individual only; Company needs a Nafath identity-verification
 * step this suite cannot complete, see docs/mobile-registration-progress.md). Callers must gate
 * them behind `ACCOUNT_CREATION_BLOCKED`/`OTP_REQUEST_BLOCKED` (src/utils/account-actions.ts), the
 * same way login.screen.ts's login/OTP methods are gated at the spec level, not here. Every other
 * method/getter on this screen remains state-inspection only, as before.
 *
 * Confirmed field-format behavior, 2026-11-11 (consistent across every text field on both
 * forms, not just password — confirmed business behavior, not a defect): the submit button only
 * requires a field to be non-empty; it does not check minimum length or shape client-side. Each
 * field DOES enforce a maximum length via an input filter (ID/Iqama and Mobile Number: 10 digits;
 * Commercial Registry Number: 10 digits; Tax ID: 20 digits) — typing past it is silently
 * truncated, never rejected. No email field exists on either form (`emailFieldCount()`).
 */
export class MazadRegistrationScreen extends MobileScreen {
  /** The "More" tab's guest prompt (shared with login; same bottom sheet). */
  guestPrompt(promptLabel: string) {
    return this.byText(promptLabel);
  }

  /** Entry bottom-sheet choice ("Create a new account"), found by its text. */
  createAccountChoice(createAccountLabel: string) {
    return this.byText(createAccountLabel);
  }

  /** Taps the guest prompt, then "Create a new account" in the bottom sheet it opens. */
  async openFromGuestPrompt(promptLabel: string, createAccountLabel: string): Promise<void> {
    const prompt = this.guestPrompt(promptLabel);
    await prompt.waitForDisplayed({ timeout: 15_000 });
    await prompt.click();
    const choice = this.createAccountChoice(createAccountLabel);
    await choice.waitForDisplayed({ timeout: 15_000 });
    await choice.click();
  }

  // Account-type selection screen (confirmed resource IDs, 2026-11-10).
  get accountTypeHeading() {
    return this.byId('text_view_title');
  }

  get personalAccountChoice() {
    return this.byId('layout_individual_account');
  }

  get companyAccountChoice() {
    return this.byId('layout_dealer_account');
  }

  /**
   * The card's own label. `personalAccountChoice`/`companyAccountChoice` are the clickable
   * containers (confirmed empty of their own text via getText()); the text lives in these child
   * TextViews instead (also confirmed resource IDs, 2026-11-10).
   */
  get personalAccountLabel() {
    return this.byId('text_view_individual');
  }

  get companyAccountLabel() {
    return this.byId('text_view_dealer');
  }

  get nextButton() {
    return this.byId('button_next');
  }

  async choosePersonalAccount(): Promise<void> {
    await this.personalAccountChoice.click();
  }

  async chooseCompanyAccount(): Promise<void> {
    await this.companyAccountChoice.click();
  }

  async isNextEnabled(): Promise<boolean> {
    return this.nextButton.isEnabled();
  }

  /** Moves from account-type selection to Step 2 for whichever type was already chosen. */
  async continueToStep2(): Promise<void> {
    await this.nextButton.click();
  }

  // Step 2 — screen chrome (no stable resource id; found by its own expected text).
  /** Toolbar title: "Create Personal/Company Account". */
  screenHeading(expectedText: string) {
    return this.byText(expectedText);
  }

  // Step 2 — "Personal Information" section (shared shape; only the heading's id differs
  // between the two forms, see personalInfoHeadingOnCompanyForm below).
  get personalInfoHeadingOnPersonalForm() {
    return this.byId('text_view_title');
  }

  get fullNameInput() {
    return this.byId('edit_text_full_name');
  }

  get iqamaInput() {
    return this.byId('edit_text_iqama_number');
  }

  get mobileInput() {
    return this.byId('edit_text_phone_number');
  }

  get passwordInput() {
    return this.byId('edit_text_password');
  }

  get fullNameLabel() {
    return this.byId('text_view_full_name_label');
  }

  get iqamaLabel() {
    return this.byId('text_view_iqama_number_label');
  }

  get mobileLabel() {
    return this.byId('text_view_phone_number_label');
  }

  get passwordLabel() {
    return this.byId('text_view_password_label');
  }

  /** Not in `t()`: app-only copy, see test-data/mobile-app.data.ts registrationFlow. */
  get passwordNote() {
    return this.byId('text_view_password_note');
  }

  /** Not in `t()`: app-only copy (found by its own text; no resource id). */
  mobileVerificationHint(expectedText: string) {
    return this.byText(expectedText);
  }

  async enterFullName(name: string): Promise<void> {
    await this.fullNameInput.setValue(name);
  }

  async enterIqama(value: string): Promise<void> {
    await this.iqamaInput.setValue(value);
  }

  async enterMobile(localNumber: string): Promise<void> {
    await this.mobileInput.setValue(localNumber);
  }

  async enterPassword(password: string): Promise<void> {
    await this.passwordInput.setValue(password);
  }

  // Step 2 — Personal only: City/Region and submit.
  get cityLabel() {
    return this.byId('text_view_city_label');
  }

  get cityInput() {
    return this.byId('edit_text_city');
  }

  get createAccountButton() {
    return this.byId('button_create_account');
  }

  /** Opens the City/Region bottom sheet (tapping the read-only `cityInput` trigger). */
  async openCityPicker(): Promise<void> {
    await this.cityInput.click();
  }

  /**
   * Opens the City/Region bottom sheet and taps the ONE row with this exact text. Every row
   * reuses the same resource id (an app quirk, see the class doc comment), so rows are matched
   * by exact text only, same as the website.
   */
  /** The ONE city-picker row with this exact text (see the class doc comment on why). */
  cityOption(city: string) {
    return this.byText(city);
  }

  async selectCity(city: string): Promise<void> {
    await this.openCityPicker();
    const option = this.cityOption(city);
    await option.waitForDisplayed({ timeout: 15_000 });
    await option.click();
  }

  async isCreateAccountEnabled(): Promise<boolean> {
    return this.createAccountButton.isEnabled();
  }

  // Step 2 — Company only: "Personal Information" heading here has a different id than on the
  // Personal form, plus "Company Information", Commercial Registry, Tax ID and Verify.
  get personalInfoHeadingOnCompanyForm() {
    return this.byId('text_view_individual_label');
  }

  get companyInfoHeading() {
    return this.byId('text_view_dealer_label');
  }

  get commercialRegistryInput() {
    return this.byId('edit_text_commercial_registry_number');
  }

  /** Not in `t()` in English (the app adds "(The 700 Number)"); see class doc comment. */
  get commercialRegistryLabel() {
    return this.byId('text_view_commercial_registry_number_label');
  }

  get taxIdInput() {
    return this.byId('edit_text_dealer_tax_id');
  }

  get taxIdLabel() {
    return this.byId('text_view_dealer_tax_number_label');
  }

  get verifyButton() {
    return this.byId('button_verify_account');
  }

  async enterCommercialRegistry(value: string): Promise<void> {
    await this.commercialRegistryInput.setValue(value);
  }

  async enterTaxId(value: string): Promise<void> {
    await this.taxIdInput.setValue(value);
  }

  async isVerifyEnabled(): Promise<boolean> {
    return this.verifyButton.isEnabled();
  }

  /** How many elements on screen look like an email field (none expected; see the class doc). */
  async emailFieldCount(): Promise<number> {
    const fields = this.driver.$$('android=new UiSelector().resourceIdMatches(".*email.*")');
    return fields.length;
  }

  // Registration OTP step (same resource ids as MazadLoginScreen's OTP screen — the app reuses
  // one OTP component site-wide, confirmed 2026-11-11) and final submission. Gated at the spec
  // level, not here — see the class doc comment.
  get registrationOtpInputs() {
    return [
      this.byId('edit_text_one'),
      this.byId('edit_text_two'),
      this.byId('edit_text_three'),
      this.byId('edit_text_four'),
    ];
  }

  get registrationOtpVerifyButton() {
    return this.byId('button_verify');
  }

  async enterRegistrationOtp(otp: string): Promise<void> {
    const inputs = this.registrationOtpInputs;
    for (let i = 0; i < otp.length && i < inputs.length; i++) {
      await inputs[i].setValue(otp[i]);
    }
  }

  async isRegistrationOtpVerifyEnabled(): Promise<boolean> {
    return this.registrationOtpVerifyButton.isEnabled();
  }

  /** Submits the registration OTP (Personal or Company). Creates/confirms an account on success. */
  async verifyRegistrationOtp(otp: string): Promise<void> {
    await this.enterRegistrationOtp(otp);
    await this.registrationOtpVerifyButton.click();
  }

  /** Taps Create Account (Personal). Submits the form and, with a correct OTP next, creates an account. */
  async submitCreateAccount(): Promise<void> {
    await this.createAccountButton.click();
  }

  /** Taps Verify (Company). Company registration needs a Nafath step this suite cannot complete. */
  async submitVerify(): Promise<void> {
    await this.verifyButton.click();
  }

  /** Any visible text on the registration flow (success message, OTP error, dialog buttons). */
  message(expectedText: string) {
    return this.byText(expectedText);
  }

  /** "Continue" button on the success screen, found by its own text. */
  continueButton(expectedText: string) {
    return this.byText(expectedText);
  }
}
