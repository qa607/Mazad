import { InspectionAndroidScreen } from '@mobile/inspection-android/screens/inspection-android.screen';
import { rowActionBounds } from '@mobile/inspection-android/accessibility-xml';

/**
 * Inspector Home (Inspection Android, signed-in landing screen): a vehicle-under-inspection list
 * with "In Progress / Completed / Not Sent" tabs and a floating "+" action that starts a new
 * vehicle. Confirmed live 2026-11-12: like the rest of this app, the FAB has no resource-id or
 * content-desc, so it is located by its fixed bottom-right position rather than text (it carries
 * no text either).
 *
 * Each tab lists one row per vehicle - confirmed live 2026-11-14 that every row starts with a
 * "VIN Number" label (used to scope a row's own action button - see rowActionBounds()) - with its
 * own action:
 *   In Progress: "Continue Inspection" (reopens Basic Info/Essentials & Body/Photos where left)
 *   Completed:   "Edit Inspection" and "Sign & Complete" (opens the signing bottom sheet - see
 *                SigningScreen)
 *   Not Sent:    "Send Inspection" per row, plus a single "Send All" action for the whole tab -
 *                confirmed live this is where a signed inspection actually uploads (POST
 *                /v1/inspection/save, confirmed live via logcat); signing alone does not sync it.
 * These lists accumulate real entries across every run on this shared device (every synthetic
 * vehicle this project's own automation has ever created and not sent stays visible) - every
 * action here is therefore scoped to one specific VIN's own row, never "whichever button is
 * first", once more than one vehicle can plausibly be present.
 */
export class InspectorHomeScreen extends InspectionAndroidScreen {
  get completedTab() {
    return this.byTextAny('Completed', 'مكتملة');
  }

  get inProgressTab() {
    return this.byTextAny('In Progress', 'قيد الفحص');
  }

  get notSentTab() {
    return this.byTextAny('Not Sent', 'غير مرسلة');
  }

  get emptyStateMessage() {
    return this.byText('There are no vehicles under inspection');
  }

  get sendAllButton() {
    return this.byText('Send All');
  }

  async waitUntilReady(timeout = 15_000): Promise<void> {
    await this.completedTab.waitForDisplayed({ timeout });
  }

  /** Switches the app's own language setting from Home without changing Android system locale. */
  async setLanguage(language: 'en' | 'ar'): Promise<void> {
    const targetLabels =
      language === 'en'
        ? ['In Progress', 'Completed', 'Not Sent']
        : ['قيد الفحص', 'مكتملة', 'غير مرسلة'];
    const source = await this.driver.getPageSource();
    if (targetLabels.every((label) => source.includes(`text="${label}"`))) return;

    await this.tapLanguageMenuButton();
    const option = this.byTextContains(language === 'en' ? 'English' : 'العربية');
    await option.waitForDisplayed({ timeout: 10_000 });
    await this.tapElement(option);
    await this.driver.pause(1_000);
    // The drawer stays open while the app changes language; Android back dismisses it without
    // depending on whether its header control moved from the LTR edge to the RTL edge.
    await this.driver.back();
    await this.byTextAny(
      targetLabels[1],
      language === 'en' ? 'مكتملة' : 'Completed',
    ).waitForDisplayed({
      timeout: 10_000,
    });
  }

  private async tapLanguageMenuButton(): Promise<void> {
    const { width, height } = await this.driver.getWindowSize();
    for (const horizontalPosition of [0.91, 0.088]) {
      await this.driver
        .action('pointer')
        .move({ x: Math.round(width * horizontalPosition), y: Math.round(height * 0.079) })
        .down()
        .pause(80)
        .up()
        .perform();
      await this.driver.pause(300);
      const source = await this.driver.getPageSource();
      if (source.includes('text="English"') || source.includes('text="العربية"')) return;
    }
    throw new Error('Could not open the Home language drawer from either supported header edge.');
  }

  /**
   * Starts a new vehicle via the bottom-right FAB. Confirmed live: fixed position regardless of
   * list content, bottom-right of a 1080x2340 screen; a resolution-relative tap would be more
   * robust on a different device, but this project automates one real device (Galaxy S25 Ultra,
   * 1080x2340) so the fixed position is accurate and avoids guessing at an unlabeled element.
   */
  async startNewVehicle(): Promise<void> {
    const { width, height } = await this.driver.getWindowSize();
    const source = await this.driver.getPageSource();
    const isRtl = source.includes('text="قيد الفحص"') || source.includes('text="مكتملة"');
    await this.driver
      .action('pointer')
      .move({
        x: Math.round(width * (isRtl ? 0.115 : 0.885)),
        y: Math.round(height * 0.929),
      })
      .down()
      .pause(80)
      .up()
      .perform();
  }

  /** Taps a specific vehicle's own action button within whichever tab is currently open, scrolling
   * it into view first. Throws (naming both the VIN and the button) if that row or that row's
   * button cannot be found, rather than silently tapping nothing. */
  private async tapRowAction(vin: string, buttonText: string): Promise<void> {
    await this.scrollToText(vin);
    const xml = await this.driver.getPageSource();
    const bounds = rowActionBounds(xml, vin, buttonText);
    if (!bounds) {
      throw new Error(`Could not find "${buttonText}" in ${vin}'s own row.`);
    }
    const x = Math.round((bounds.x1 + bounds.x2) / 2);
    const y = Math.round((bounds.y1 + bounds.y2) / 2);
    await this.driver.action('pointer').move({ x, y }).down().pause(80).up().perform();
    await this.driver.pause(500);
  }

  /** Whether `vin` currently has its own row in whichever tab is open (does not switch tabs
   * itself - call after openCompletedTab()/openInProgressTab()/openNotSentTab()). */
  async isVinListed(vin: string): Promise<boolean> {
    await this.waitForUiIdle();
    const xml = await this.driver.getPageSource();
    return xml.includes(`text="${vin}"`);
  }

  /** Polls (does not switch tabs itself) until `vin` no longer has a row in whichever tab is open,
   * or `timeout` elapses. Needed after sendInspection()/sendAll(): confirmed live (2026-11-14) the
   * actual upload (POST /v1/inspection/save) and the list's own refresh take noticeably longer than
   * the short post-tap settle pause used elsewhere in this screen - a fixed pause there flaked, while
   * the upload itself always completed correctly a few seconds later. */
  async waitUntilVinNotListed(vin: string, timeout = 30_000): Promise<void> {
    await this.driver.waitUntil(async () => !(await this.isVinListed(vin)), {
      timeout,
      timeoutMsg: `"${vin}" is still listed after ${timeout}ms.`,
      interval: 1_000,
    });
  }

  async openInProgressTab(): Promise<void> {
    await this.tapElement(this.inProgressTab);
    await this.driver.pause(500);
  }

  async openCompletedTab(): Promise<void> {
    await this.tapElement(this.completedTab);
    await this.driver.pause(500);
  }

  async openNotSentTab(): Promise<void> {
    await this.tapElement(this.notSentTab);
    await this.driver.pause(500);
  }

  /** In Progress tab: reopens `vin`'s own in-progress vehicle where it was left off. */
  async continueInspection(vin: string): Promise<void> {
    await this.openInProgressTab();
    await this.tapRowAction(vin, 'Continue Inspection');
  }

  /** Completed tab: opens `vin`'s own "Sign & Complete" bottom sheet - see SigningScreen. */
  async openSignAndComplete(vin: string): Promise<void> {
    await this.openCompletedTab();
    await this.tapRowAction(vin, 'Sign & Complete');
  }

  /** Not Sent tab: taps `vin`'s own "Send Inspection" action (uploads just this one vehicle). */
  async sendInspection(vin: string): Promise<void> {
    await this.openNotSentTab();
    await this.tapRowAction(vin, 'Send Inspection');
  }

  /** Not Sent tab: taps "Send All" (uploads every not-yet-sent vehicle at once). */
  async sendAll(): Promise<void> {
    await this.openNotSentTab();
    await this.tapElement(this.sendAllButton);
    await this.driver.pause(500);
  }
}
