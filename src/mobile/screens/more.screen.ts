import { MobileScreen } from '@mobile/screens/mobile.screen';

/**
 * Mazad Android app — the More tab (guest), recorded on staging (8.2.2-stage, 2026-11-11).
 * Jetpack Compose with no resource IDs: rows and labels are found by the text the caller passes in
 * (tapping a row's text taps the row). The Favorites/Notifications header icons and the four social
 * icons have no text, description or ID; they are only COUNTED (never tapped): the header icons are
 * the Buttons above the guest prompt, the social icons are the clickable elements between the "Follow us"
 * heading and the next heading. Rows that leave the app (Privacy Policy, Rate us) have no tap method.
 */
export class MoreScreen extends MobileScreen {
  /**
   * Any text of More itself (title, headings, row labels, the version line). More's own content
   * has no resource-id attribute; the bottom tabs' labels do, so "More"/"المزيد" matches the title only.
   */
  text(label: string) {
    return this.driver.$(`//*[@text=${JSON.stringify(label)} and not(@resource-id)]`);
  }

  async waitUntilOpen(titleLabel: string, timeout = 15_000): Promise<void> {
    await this.text(titleLabel).waitForDisplayed({ timeout });
  }

  /** Opens a row that stays inside the app (About Us, Help Center, Terms). Navigation. */
  async openInAppRow(label: string): Promise<void> {
    const row = this.text(label);
    await row.waitForDisplayed({ timeout: 10_000 });
    await row.click();
  }

  /**
   * The header icons (Favorites, Notifications): the Buttons wholly above the guest prompt's label
   * (the prompt itself is a Button too). Counted only.
   */
  async headerIconCount(guestPromptLabel: string): Promise<number> {
    const prompt = await this.text(guestPromptLabel).getLocation();
    let count = 0;
    for (const button of await this.driver
      .$$('android=new UiSelector().className("android.widget.Button")')
      .getElements()) {
      // Wholly above the prompt's label: the prompt's own Button encloses its label.
      const { y } = await button.getLocation();
      const { height } = await button.getSize();
      if (y + height <= prompt.y) count++;
    }
    return count;
  }

  /**
   * The social icons: clickable elements lying between the "Follow us" heading and the next
   * heading ("Important Links"). Counted only: tapping one would leave the app.
   */
  async socialIconCount(headingLabel: string, nextHeadingLabel: string): Promise<number> {
    const top = await this.text(headingLabel).getLocation();
    const bottom = await this.text(nextHeadingLabel).getLocation();
    let count = 0;
    for (const element of await this.driver
      .$$('android=new UiSelector().clickable(true)')
      .getElements()) {
      const { y } = await element.getLocation();
      if (y > top.y && y < bottom.y) count++;
    }
    return count;
  }

  /** The app's device ID as shown above the version line. */
  async deviceId(): Promise<string> {
    return this.driver.$('android=new UiSelector().textMatches("^[0-9a-f]{16}$")').getText();
  }

  /** Taps Copy (copies the device ID; local only). */
  async copyDeviceId(copyLabel: string): Promise<void> {
    await this.text(copyLabel).click();
  }

  /** Replaces the clipboard with `value`, so a later read proves what Copy put there. */
  async setClipboard(value: string): Promise<void> {
    await this.driver.setClipboard(Buffer.from(value).toString('base64'), 'plaintext');
  }

  async clipboard(): Promise<string> {
    return Buffer.from(await this.driver.getClipboard('plaintext'), 'base64').toString();
  }
}
