import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/**
 * Mazad iOS app — the update dialog shown at launch when the back office lists a newer iOS version
 * of the app (App Versions) with Force Update on. READ ONLY: its Update button opens the App Store,
 * so it is only ever inspected here, never tapped. Its texts are found by the exact labels the
 * caller passes in (test data), each as the ONE element with that label.
 */
export class IosForceUpdateScreen extends IosScreen {
  /** Whether the dialog appears within `timeout` ms (waits the whole time for a "no"). */
  async appearsWithin(updateLabel: string, timeout: number): Promise<boolean> {
    return this.button(updateLabel)
      .waitForDisplayed({ timeout })
      .then(
        () => true,
        () => false,
      );
  }

  /** The ONE text with this exact label (the dialog's title or message). */
  async onlyText(label: string) {
    return this.only(this.staticTextSelector(label), `Update dialog: the "${label}" text`);
  }

  /** The dialog's Update button, for inspection only: it cannot be tapped from here. */
  async updateButton(label: string): Promise<ReadOnlyElement> {
    return this.readOnly(
      await this.only(this.buttonSelector(label), `Update dialog: the "${label}" button`),
    );
  }
}
