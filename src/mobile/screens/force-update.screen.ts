import { MobileScreen } from '@mobile/screens/mobile.screen';

/**
 * Mazad Android app — the update dialog shown at launch when the back office lists a newer
 * version of the app (App Versions), recorded on staging (8.2.2-stage, 2026-11-14): a title, a
 * description and one Update button (no Close or Later), over the Home screen. The Update button
 * opens the store, so it is only read here, never tapped. Expected text comes from the caller.
 */
export class ForceUpdateScreen extends MobileScreen {
  get title() {
    return this.byId('text_view_title');
  }

  get description() {
    return this.byId('text_view_description');
  }

  /** The dialog's only button. Read only: tapping it leaves the app for the store. */
  get updateButton() {
    return this.byId('text_view_update_button');
  }

  /** Whether the dialog is on screen (its Update button is shown). */
  async isShown(): Promise<boolean> {
    return this.updateButton.isDisplayed();
  }

  /**
   * Whether the dialog appears within `timeout` ms. The app checks its version after launch, so a
   * "no dialog" answer is only given after waiting the whole time.
   */
  async appearsWithin(timeout: number): Promise<boolean> {
    return this.updateButton.waitForDisplayed({ timeout }).then(
      () => true,
      () => false,
    );
  }
}
