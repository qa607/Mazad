import { MobileScreen } from '@mobile/screens/mobile.screen';

/**
 * Mazad Android app — More → Help Center, recorded on staging (8.2.2-stage, 2026-11-11/12).
 * Built with Jetpack Compose: no resource IDs or test tags, so rows are found by their text,
 * which the caller passes in (category names, questions and answers come from GET /v1/faq-list or
 * from the records a test creates).
 *
 * - Help Center lists exactly the categories of GET /v1/faq-list, in the API's order.
 * - A category page shows its title, its published questions, then "Can't find your answer?" and
 *   a "Contact Us" link (the only route to the Contact Form for a guest).
 * - Tapping a question shows its answer as a text right below it; tapping it again hides it.
 */
export class HelpCenterScreen extends MobileScreen {
  /** A row or text by its visible text: a More-tab item, a category, a question, an answer. */
  item(label: string) {
    return this.byText(label);
  }

  /** Opens Help Center from the More tab (the caller has opened More). */
  async open(helpCenterLabel: string): Promise<void> {
    const row = this.item(helpCenterLabel);
    await row.waitForDisplayed({ timeout: 15_000 });
    await row.click();
  }

  /**
   * Brings a text into view when it is below the fold (long category or question lists). Does
   * nothing when there is nothing to scroll.
   */
  async scrollTo(label: string): Promise<void> {
    if (
      await this.item(label)
        .isDisplayed()
        .catch(() => false)
    )
      return;
    await this.driver
      .$(
        `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().text(${JSON.stringify(label)}))`,
      )
      .isExisting()
      .catch(() => false);
  }

  async openCategory(name: string): Promise<void> {
    await this.scrollTo(name);
    const row = this.item(name);
    await row.waitForDisplayed({ timeout: 15_000 });
    await row.click();
  }

  /** Taps a question: shows its answer, or hides it when it is shown. */
  async toggleQuestion(question: string): Promise<void> {
    await this.scrollTo(question);
    await this.item(question).click();
  }

  /** Every visible text of the screen, top to bottom (title first). */
  async visibleTexts(): Promise<string[]> {
    const xml = await this.driver.getPageSource();
    const texts: { text: string; top: number }[] = [];
    for (const match of xml.matchAll(
      /<[\w.]+ [^>]*?\btext="([^"]+)"[^>]*?bounds="\[\d+,(\d+)\]/g,
    )) {
      const attributes = match[0];
      // The bottom navigation labels are not part of the screen's content.
      if (/resource-id="[^"]*navigation/.test(attributes)) continue;
      texts.push({ text: decodeXml(match[1]), top: Number(match[2]) });
    }
    return texts.sort((a, b) => a.top - b.top).map((t) => t.text);
  }

  /** Taps "Contact Us" below a category's questions. */
  async openContactUs(linkLabel: string): Promise<void> {
    await this.scrollTo(linkLabel);
    const link = this.item(linkLabel);
    await link.waitForDisplayed({ timeout: 15_000 });
    await link.click();
  }

  /** System Back: from a category to Help Center, from Help Center to More. */
  async goBack(): Promise<void> {
    await this.driver.back();
  }
}

/** XML attribute values arrive escaped in the page source. */
function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
