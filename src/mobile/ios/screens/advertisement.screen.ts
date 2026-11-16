import { parseIosSource } from '@mobile/ios/page-source';
import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/** The sheet's close button, by its accessible name (observed 2026-11-15, build 8.3 (1491)). */
export const OBSERVED_ADVERTISEMENT_CLOSE = 'closeSheet';

/**
 * Mazad iOS: the advertisement the back office publishes, opened at launch as a sheet over Home.
 * Observed on the device 2026-11-15 (iPhone 11 Pro Max, build 8.3 (1491), Arabic): a close Button
 * named OBSERVED_ADVERTISEMENT_CLOSE, then StaticTexts for the "إعلان" badge, the title and the sub
 * title, and one Button labelled with the advertisement's button text. While it is open, only the
 * sheet is in the accessibility tree.
 *
 * Every control is the ONE element of its type with its exact label (never by position or order).
 * Display, plus two taps: the advertisement's button and, for a sheet left open by an earlier
 * failed run, its close button.
 */
export class IosAdvertisementSheetScreen extends IosScreen {
  private closeSelector(): string {
    return this.buttonSelector(OBSERVED_ADVERTISEMENT_CLOSE);
  }

  /** Waits for the sheet to show the advertisement titled `title` (its ONE StaticText). */
  async waitForAdvertisement(title: string, timeout: number): Promise<void> {
    await this.only(this.staticTextSelector(title), `Advertisement: "${title}"`, timeout);
  }

  /** Every visible StaticText label of the sheet, top to bottom. */
  async visibleTexts(): Promise<string[]> {
    return parseIosSource(await this.driver.getPageSource())
      .filter((e) => e.type === 'StaticText' && e.visible && e.label)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((e) => e.label);
  }

  /** The advertisement's button: the ONE Button with this exact label (read-only). */
  async onlyButton(label: string): Promise<ReadOnlyElement> {
    return this.readOnly(
      await this.only(this.buttonSelector(label), `Advertisement: the "${label}" button`),
    );
  }

  /** Taps the advertisement's button (the ONE Button with that label); the sheet closes. */
  async tapButton(label: string): Promise<void> {
    const button = await this.only(
      this.buttonSelector(label),
      `Advertisement: the "${label}" button`,
    );
    await button.click();
    await this.driver.$(this.closeSelector()).waitForExist({ reverse: true, timeout: 15_000 });
  }

  /**
   * Closes a sheet left open (by an earlier, failed run) with its close button; does nothing when
   * none is open. Navigation only: the advertisement's button is never tapped here.
   */
  async closeIfOpen(): Promise<void> {
    const close = await this.driver.$$(this.closeSelector()).getElements();
    if (close.length !== 1) return;
    await close[0].click();
    await this.driver.$(this.closeSelector()).waitForExist({ reverse: true, timeout: 15_000 });
  }
}
