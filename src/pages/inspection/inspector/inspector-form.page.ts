import type { Locator, Page } from '@playwright/test';
import { UserFormPage } from '@pages/inspection/base/user-form.page';

/**
 * Create an Inspector (/inspector/create) and Update one (/inspector/update?id=N). Same shared
 * form as QcFormPage (see UserFormPage), plus one field QC's form does not have: a Krajee
 * star-rating widget (confirmed live 2026-11-11, optional — no error on an empty submit).
 */
export class InspectorFormPage extends UserFormPage {
  static readonly createPath = '/inspector/create';
  static readonly updatePath = '/inspector/update';

  /** The Krajee star-rating widget's hidden input (`UserCreateForm[rating]`). Optional; not
   * exercised by CRUD validation tests since it has no documented required/format rule. */
  readonly ratingInput: Locator;

  constructor(page: Page) {
    super(page, InspectorFormPage.createPath, InspectorFormPage.updatePath);
    this.ratingInput = page.locator('#usercreateform-rating');
  }
}
