import { InspectionAndroidScreen } from '@mobile/inspection-android/screens/inspection-android.screen';
import { isAncestorButtonEnabled } from '@mobile/inspection-android/accessibility-xml';

/**
 * The "Sign & Complete Inspection" bottom sheet (confirmed live 2026-11-14), opened from a
 * Completed-tab vehicle's own "Sign & Complete" action (see InspectorHomeScreen). Shows the
 * vehicle's own VIN and inspection type for confirmation, a blank signature canvas under a
 * "Signature" label, "Clear", and "Finish Inspection".
 *
 * "Finish Inspection" starts disabled and only enables once a signature has been drawn - confirmed
 * live via isAncestorButtonEnabled() (the same Compose-a11y-safe mechanism used everywhere else in
 * this app; the button's own visual state cannot be trusted). Tapping "Finish Inspection" moves
 * the vehicle from the Completed tab to Not Sent - confirmed live this does NOT itself upload
 * anything; Not Sent's own "Send Inspection"/"Send All" is the step that actually does (see
 * InspectorHomeScreen's doc comment).
 */
export class SigningScreen extends InspectionAndroidScreen {
  get signatureLabel() {
    return this.byText('Signature');
  }

  get clearButton() {
    return this.byText('Clear');
  }

  get finishInspectionButton() {
    return this.byText('Finish Inspection');
  }

  async isFinishEnabled(): Promise<boolean> {
    return isAncestorButtonEnabled(await this.driver.getPageSource(), 'Finish Inspection') === true;
  }

  /**
   * Draws a single horizontal stroke across the signature canvas - the area between the "Signature"
   * label and the Clear/Finish button row, found geometrically since the canvas itself carries no
   * text, bounds or other identifying attribute in the accessibility tree at all (confirmed live: no
   * node exists in that gap). Confirmed live this app does not validate the drawing's shape or
   * extent, only that something was drawn: isFinishEnabled() flips true immediately after any stroke.
   *
   * Must stay at a fixed y (purely horizontal): any stroke with vertical movement - a two-segment
   * zig-zag, or even a single diagonal down -> move -> up - was confirmed live (2026-11-14) to
   * sometimes be swallowed by the surrounding bottom sheet's own drag-to-dismiss gesture instead of
   * reaching the canvas, silently closing the whole Sign & Complete sheet rather than drawing
   * anything (the sheet has no dedicated canvas node to scope the gesture to - see above - so a
   * vertical drag has nothing stopping it from being read as "drag the sheet down"). A purely
   * horizontal stroke at one fixed y was confirmed live to register as a signature every time.
   */
  async drawSignature(): Promise<void> {
    const labelY = (await this.signatureLabel.getLocation()).y;
    const clearY = (await this.clearButton.getLocation()).y;
    const midY = Math.round((labelY + 60 + clearY - 20) / 2);
    await this.driver
      .action('pointer')
      .move({ x: 150, y: midY })
      .down()
      .pause(50)
      .move({ duration: 250, x: 900, y: midY })
      .up()
      .perform();
    await this.driver.pause(500);
  }

  async clear(): Promise<void> {
    await this.tapElement(this.clearButton);
    await this.driver.pause(300);
  }

  /** Taps "Finish Inspection" - the caller should confirm isFinishEnabled() first (a signature
   * must already be drawn). */
  async finish(): Promise<void> {
    await this.tapElement(this.finishInspectionButton);
    await this.driver.pause(2_000);
  }
}
