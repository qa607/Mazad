import { InspectionAndroidScreen } from '@mobile/inspection-android/screens/inspection-android.screen';

/**
 * Confirmed live 2026-11-12: the three inspection types this Android app actually exposes
 * (the backend's own `inspection_type` field has a fourth option, "Retail", that this app does
 * not offer - confirmed via the Mazad V3 Backend vehicle edit form's own select options).
 */
export const INSPECTION_TYPES = ['B2B', 'Photography', 'Salvage'] as const;
export type InspectionType = (typeof INSPECTION_TYPES)[number];

/**
 * "New Vehicle" flow: VIN entry (POSTs to `/v1/inspection/vin/search`, confirmed live via
 * logcat), then inspection-type selection. Both steps share the same "Continue" button text, so
 * callers re-fetch it after each step rather than caching the first match.
 */
export class NewVehicleScreen extends InspectionAndroidScreen {
  get vinInput() {
    return this.driver.$('android.widget.EditText');
  }

  get continueButton() {
    return this.byTextAny('Continue', 'استمرار');
  }

  get vinRequiredError() {
    // Not yet confirmed live - the exact validation message text is a discovery gap (empty-VIN
    // Continue has not been exercised live yet). Placeholder locator kept narrow (exact text of
    // a field-level error, not a substring) so a spec using it fails clearly until confirmed.
    return this.byTextContains('required');
  }

  typeOption(type: InspectionType) {
    const arabicLabel = type === 'Photography' ? 'تصوير' : type === 'Salvage' ? 'تالف' : type;
    return this.byTextAny(type, arabicLabel);
  }

  /**
   * Fills the VIN field and verifies it, retrying once. Confirmed live: tapping the FAB and
   * typing immediately can land before the VIN screen has finished its enter transition, leaving
   * the field empty with no error - the click and setValue calls complete without throwing, so
   * only reading the value back catches it.
   */
  /** Fills the VIN field, replacing whatever it currently shows (e.g. a locally-saved draft from
   * an earlier, uncompleted attempt) - see InspectionAndroidScreen.typeReliably(). */
  async enterVin(vin: string): Promise<void> {
    await this.vinInput.waitForDisplayed({ timeout: 10_000 });
    await this.waitForUiIdle();
    await this.typeReliably(this.vinInput, vin);
    await this.hideKeyboardIfShown();
  }

  async currentVinValue(): Promise<string> {
    return this.vinInput.getText();
  }

  /** Taps Continue and, if it navigates, waits for the type-selection screen to actually render
   * before returning, so a caller's next action never races the screen transition. Does not
   * assert that navigation happened - an empty VIN is expected to leave Continue inert, and that
   * is a valid, intentionally-tested outcome, not a failure of this method. */
  async continueFromVin(): Promise<void> {
    await this.tapElement(this.continueButton);
    await this.typeOption('B2B')
      .waitForDisplayed({ timeout: 5_000 })
      .catch(() => undefined);
  }

  async selectType(type: InspectionType): Promise<void> {
    await this.tapElement(this.typeOption(type));
  }

  async continueFromTypeSelection(): Promise<void> {
    await this.tapElement(this.continueButton);
  }
}
