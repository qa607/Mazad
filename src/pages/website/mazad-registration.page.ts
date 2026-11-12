import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/frontend/base/base.page';
import type { Language } from '@typings';

/**
 * Mazad customer website registration. Step 1 (account-type choice) needs nothing else; step 2
 * onward needs the app's own anonymous Firebase session (confirmed 2026-11-10, staging project
 * `mazad-v3`), allowed only by the Web registration spec's own fixture option
 * (`allowFirebaseAnonymousSignup`, see src/fixtures/website.fixture.ts and
 * src/network/request-guard.ts). This object never exposes a way to submit the final step: no
 * method clicks "Create Account" / "Verify" at the end of the form, by design.
 *
 * Step 2 fields (confirmed on staging, 2026-11-10): Individual asks for Full Name, ID/Iqama
 * Number, City/Region, Mobile Number and Password, then "Create Account". Company asks for the
 * same Personal Information fields (minus City/Region) plus Commercial Registry Number and Tax
 * ID, then "Verify" (not "Create Account" — the app's own wording differs by account type).
 * Neither step 2 form has an email field.
 *
 * City/Region (Individual only) is a custom `<app-dropdown>` component, not a `<select>` or
 * Angular Material `mat-select`: clicking `.dropdown-container` reveals a `.dropdown-content`
 * list of `.dropdown-item` elements (confirmed options include Riyadh, Jeddah, Dammam, and 30
 * others); clicking one sets `.placeholder-text` to the chosen city and closes the list.
 */
export class MazadRegistrationPage extends BasePage {
  static readonly path = '/signup';

  readonly heading: Locator;
  readonly chooseAccountTypeLabel: Locator;
  readonly personalAccountChoice: Locator;
  readonly companyAccountChoice: Locator;
  readonly nextButton: Locator;

  // Step 2 — shared "Personal Information" fields (both account types).
  readonly fullNameInput: Locator;
  readonly idIqamaInput: Locator;
  readonly mobileNumberInput: Locator;
  readonly passwordInput: Locator;

  // Step 2 — Individual only: the City/Region dropdown.
  readonly cityRegionLabel: Locator;
  readonly cityRegionTrigger: Locator;
  readonly cityRegionSelectedText: Locator;
  readonly cityRegionOptionList: Locator;

  // Step 2 — Company only.
  readonly commercialRegistryInput: Locator;
  readonly taxIdInput: Locator;

  // Step 2 — submit buttons, exposed for state inspection ONLY: nothing here ever clicks one.
  readonly createAccountButton: Locator;
  readonly companyVerifyButton: Locator;

  /** Confirmed on staging: neither step-2 form has an email field. */
  readonly emailInput: Locator;

  constructor(page: Page, language: Language) {
    super(page, language);
    this.heading = page.locator('h1.page-title');
    this.chooseAccountTypeLabel = page.locator('.individual-company-choice-title');
    // Stable ids on the radio inputs (confirmed on staging); each choice is clicked via its label.
    this.personalAccountChoice = page.locator('label[for="individual"]');
    this.companyAccountChoice = page.locator('label[for="company"]');
    this.nextButton = page.locator('button.submit-btn', { hasText: this.t('registrationNext') });

    // Step 2 ids were confirmed per account type (not shared, despite the labels reading the
    // same): Individual uses "individual-registeration-*", Company "company-registeration-*".
    this.fullNameInput = page.locator(
      '#individual-registeration-name, #company-registeration-name',
    );
    this.idIqamaInput = page.locator('#company-registeration-iqama-number');
    this.mobileNumberInput = page.locator(
      '#individual-registeration-mobile-number, #login-mobile-number',
    );
    this.passwordInput = page.locator(
      '#individual-registeration-password, #create-new-password-input',
    );
    this.cityRegionLabel = page.locator('label[for="individual-registeration-city"]');
    this.cityRegionTrigger = page.locator('app-dropdown .dropdown-container');
    this.cityRegionSelectedText = page.locator('app-dropdown .placeholder-text');
    this.cityRegionOptionList = page.locator('.dropdown-item');
    this.commercialRegistryInput = page.locator('#company-registeration-cr-number');
    this.taxIdInput = page.locator('#company-registeration-tax-number');
    this.createAccountButton = page.locator('button.submit-btn', {
      hasText: this.t('registrationCreateAccountButton'),
    });
    this.companyVerifyButton = page.locator('button.submit-btn', { hasText: this.t('verify') });
    this.emailInput = page.locator('input[type="email"]');
  }

  async goto(): Promise<void> {
    await this.open(MazadRegistrationPage.path);
  }

  async choosePersonalAccount(): Promise<void> {
    await this.personalAccountChoice.click();
  }

  async chooseCompanyAccount(): Promise<void> {
    await this.companyAccountChoice.click();
  }

  /**
   * Moves from step 1 to step 2 (Next is never a submission: it only reveals the next step's
   * fields). Requires the Firebase anonymous-session exception to be enabled for this test, and
   * an account type already chosen.
   */
  async continueToStep2(accountType: 'individual' | 'company'): Promise<void> {
    await this.nextButton.click();
    await this.page.waitForURL(new RegExp(`/signup/${accountType}/?$`));
  }

  async enterFullName(name: string): Promise<void> {
    await this.fullNameInput.fill(name);
  }

  async enterIdIqama(value: string): Promise<void> {
    await this.idIqamaInput.fill(value);
  }

  async enterMobileNumber(phone: string): Promise<void> {
    await this.mobileNumberInput.fill(phone);
  }

  async enterPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  /** Opens the City/Region dropdown (Individual only). */
  async openCityRegionDropdown(): Promise<void> {
    await this.cityRegionTrigger.click();
  }

  /** Selects the ONE open option with this exact city name; throws unless there is exactly one. */
  async selectCityRegion(city: string): Promise<void> {
    await this.openCityRegionDropdown();
    // The option list renders after a short animation; wait for it before counting.
    await this.cityRegionOptionList.first().waitFor({ state: 'visible' });
    const option = this.page.locator('.dropdown-item').getByText(city, { exact: true });
    const count = await option.count();
    if (count !== 1) {
      throw new Error(
        `City/Region: ${count} option(s) carry the exact text "${city}"; expected exactly 1.`,
      );
    }
    await option.click();
  }

  async enterCommercialRegistry(value: string): Promise<void> {
    await this.commercialRegistryInput.fill(value);
  }

  async enterTaxId(value: string): Promise<void> {
    await this.taxIdInput.fill(value);
  }
}
