import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';
import { exactText } from '@utils/text';

/** What the Create New Version form takes. Labels as the select boxes show them. */
export interface AppVersionInput {
  /** "Mazad" or "Inspection". */
  appName: string;
  /** "Android" or "iOS". */
  deviceType: string;
  appVersion: string;
  /** "Active", "In Active" or "In Testing" (the form's default). */
  status: string;
  forceUpdate: boolean;
}

/**
 * Mazad back-office "Create New Version" form (/backend/appVersionControl/app-version-control/create).
 * App Name, Device Type and Status are select2 boxes, Force Update a bootstrap switch. The page also
 * holds Import and media forms, so the form is found by its version field. Saving goes back to the
 * list.
 */
export class AppVersionFormPage extends BackendPage {
  static readonly createPath = '/backend/appVersionControl/app-version-control/create';

  readonly pageHeading: Locator;
  readonly form: Locator;
  readonly appVersionInput: Locator;
  /** The Force Update switch (its "on" state is the bootstrap-switch-on class). */
  readonly forceUpdateSwitch: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.locator('.app-page-title .page-title-head');
    this.form = page.locator('form', { has: page.locator('#appversioncontrol-app_version') });
    this.appVersionInput = this.form.locator('#appversioncontrol-app_version');
    this.forceUpdateSwitch = this.form.locator(
      '.bootstrap-switch-id-appversioncontrol-force_update',
    );
    this.saveButton = this.form.locator('button[type="submit"]');
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto(AppVersionFormPage.createPath);
  }

  /** Picks an option of one of the form's select2 boxes, as a user does. */
  private async choose(field: string, option: string): Promise<void> {
    await this.form.locator(`.field-appversioncontrol-${field} .select2-selection`).click();
    await this.page
      .locator('.select2-container--open .select2-results__option')
      .filter({ hasText: exactText(option) })
      .click();
  }

  async isForceUpdateOn(): Promise<boolean> {
    return (
      (await this.forceUpdateSwitch.getAttribute('class'))?.includes('bootstrap-switch-on') ?? false
    );
  }

  async fill(input: AppVersionInput): Promise<void> {
    await this.choose('app_name', input.appName);
    await this.choose('device_type', input.deviceType);
    await this.appVersionInput.fill(input.appVersion);
    await this.choose('status', input.status);
    if ((await this.isForceUpdateOn()) !== input.forceUpdate) await this.forceUpdateSwitch.click();
  }

  /** Saves and waits for the page it goes to (the list). */
  async save(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.saveButton);
  }
}
