import { MobileScreen } from '@mobile/screens/mobile.screen';

/**
 * Mazad Android app — More → Help Center, recorded on staging (8.2.2-stage, 2026-11-11).
 * Built with Jetpack Compose: no resource IDs or test tags, so rows are found by their text,
 * which the caller passes in (category names come from GET /v1/faq-list).
 *
 * This is the only route to the Contact Form for a guest: More has no Contact Us row when
 * signed out, and every category's question list ends with "Can't find your answer?" and a
 * "Contact Us" link.
 */
export class HelpCenterScreen extends MobileScreen {
  /** A row by its visible text: a More-tab item, a category or a link. */
  item(label: string) {
    return this.byText(label);
  }

  /** Opens Help Center from the More tab (the caller has opened More). */
  async open(helpCenterLabel: string): Promise<void> {
    const row = this.item(helpCenterLabel);
    await row.waitForDisplayed({ timeout: 15_000 });
    await row.click();
  }

  async openCategory(name: string): Promise<void> {
    const row = this.item(name);
    await row.waitForDisplayed({ timeout: 15_000 });
    await row.click();
  }

  /** Taps the "Contact Us" link below a category's questions. */
  async openContactUs(linkLabel: string): Promise<void> {
    const link = this.item(linkLabel);
    await link.waitForDisplayed({ timeout: 15_000 });
    await link.click();
  }
}
