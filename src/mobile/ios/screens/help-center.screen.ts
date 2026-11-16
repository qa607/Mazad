import { parseIosSource } from '@mobile/ios/page-source';
import { IosScreen, type ReadOnlyElement } from '@mobile/ios/screens/ios.screen';

/**
 * The top-bar Back button's accessible name, observed on the device 2026-11-11 (build 8.3 (1491))
 * in ENGLISH only: in Arabic the same button has no accessible name, so Back is not used there.
 * Kept here, like OBSERVED_HEADER_ICONS, rather than in the (still empty) id registry.
 */
export const OBSERVED_BACK_BUTTON_EN = 'navigationBarBack';

/**
 * Mazad iOS: More → Help Center → a category (FAQs). NAVIGATION AND DISPLAY ONLY. Observed on the
 * device 2026-11-11 (iPhone 11 Pro Max, build 8.3 (1491), English and Arabic):
 * - Help Center is a Button on More; the categories, a category's questions, "Can't find your
 *   answer?" and "Contact Us" are StaticTexts with exact labels (names and questions come from
 *   GET /v1/faq-list or from the records a test creates);
 * - the top-bar Back button has an accessible name in English only (OBSERVED_BACK_BUTTON_EN).
 *
 * Every control is the ONE element of its type with its exact label (never by position or order).
 */
export class IosHelpCenterScreen extends IosScreen {
  /** More → Help Center (the ONE Button with that label). Navigation. */
  async openHelpCenter(label: string): Promise<void> {
    const row = await this.only(this.buttonSelector(label), `More: the "${label}" row`);
    await row.click();
  }

  /** A Help Center category (the ONE StaticText with that label). Navigation. */
  async openCategory(name: string): Promise<void> {
    const row = await this.only(this.staticTextSelector(name), `Help Center: "${name}"`);
    await row.click();
  }

  /** Taps a question (the ONE StaticText with that label): shows or hides its answer. */
  async toggleQuestion(question: string): Promise<void> {
    const row = await this.only(this.staticTextSelector(question), `FAQ: "${question}"`);
    await row.click();
  }

  /**
   * The top-bar Back button: the ONE Button named OBSERVED_BACK_BUTTON_EN. English only (in Arabic
   * it has no accessible name, so this fails there instead of guessing).
   */
  async goBack(): Promise<void> {
    const back = await this.only(
      this.buttonSelector(OBSERVED_BACK_BUTTON_EN),
      'Help Center: the top-bar Back button',
    );
    await back.click();
  }

  /** A text of the screen: the ONE StaticText with this exact label. */
  async onlyText(label: string): Promise<ReadOnlyElement> {
    return this.readOnly(
      await this.only(this.staticTextSelector(label), `Help Center: "${label}"`),
    );
  }

  /**
   * How many VISIBLE StaticTexts carry this exact label right now (0 = not shown; never waits). A
   * collapsed answer stays in the tree with visible="false" and a height of 1 (observed
   * 2026-11-12), so presence alone does not mean shown.
   */
  async shownCount(label: string): Promise<number> {
    return parseIosSource(await this.driver.getPageSource()).filter(
      (e) => e.type === 'StaticText' && e.visible && e.label === label,
    ).length;
  }

  /** Every visible StaticText label, top to bottom (the screen title first). */
  async visibleTexts(): Promise<string[]> {
    return parseIosSource(await this.driver.getPageSource())
      .filter((e) => e.type === 'StaticText' && e.visible && e.label)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((e) => e.label);
  }
}
