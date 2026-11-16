import { MobileScreen } from '@mobile/screens/mobile.screen';

/**
 * Mazad Android app — the advertisement the back office publishes, opened at launch as a bottom
 * sheet over Home (recorded on 8.2.2-stage, 2026-11-15). Its content is Compose without resource
 * IDs: an "إعلان" badge, the title, the sub title and one button, plus a close icon. Texts are
 * found by the exact text the caller expects (from the back office), inside the sheet only.
 */
export class AdvertisementSheetScreen extends MobileScreen {
  /** The Material bottom sheet holding the advertisement. */
  get sheet() {
    return this.byId('design_bottom_sheet');
  }

  /** A text of the sheet, by its exact text. */
  text(text: string) {
    return this.sheet.$(`android=new UiSelector().text(${JSON.stringify(text)})`);
  }

  /** Waits for the sheet to show the advertisement titled `title`. */
  async waitForAdvertisement(title: string, timeout: number): Promise<void> {
    // The sheet first: a lookup inside it fails at once while it does not exist yet.
    await this.sheet.waitForDisplayed({ timeout });
    await this.text(title).waitForDisplayed({ timeout: 10_000 });
  }

  /** Whether the sheet shows the advertisement titled `title` within `timeout`. */
  async showsWithin(title: string, timeout: number): Promise<boolean> {
    try {
      await this.waitForAdvertisement(title, timeout);
      return true;
    } catch {
      return false;
    }
  }

  /** Every text of the sheet, top to bottom. */
  async texts(): Promise<string[]> {
    const views = await this.sheet
      .$$('android=new UiSelector().className("android.widget.TextView")')
      .getElements();
    const texts: string[] = [];
    for (const view of views) texts.push((await view.getText()).trim());
    return texts.filter(Boolean);
  }

  /** Taps the advertisement's button (by its label) and waits for the sheet to close. */
  async tapButton(label: string): Promise<void> {
    await this.text(label).click();
    await this.sheet.waitForExist({ reverse: true, timeout: 15_000 });
  }
}
