import { CarCardsScreen } from '@mobile/screens/car-cards.screen';

/**
 * Mazad Android app — Favorite Auctions (Home header heart), recorded on staging (8.2.2-stage,
 * 2026-11-14): a heading, the Live and Upcoming tabs (labels served by GET /v1/configuration,
 * favorite[].tab_text) and the account's favourite cars as cards (see CarCardsScreen); a
 * signed-in account with none in a tab sees the configuration's empty state there.
 */
export class FavouritesScreen extends CarCardsScreen {
  heading(label: string) {
    return this.byText(label);
  }

  tab(label: string) {
    return this.byText(label);
  }

  /** Empty-state title or description, by its text. */
  message(text: string) {
    return this.byText(text);
  }

  async waitUntilOpen(headingLabel: string, timeout = 15_000): Promise<void> {
    await this.heading(headingLabel).waitForDisplayed({ timeout });
  }

  async openTab(label: string): Promise<void> {
    const tab = this.tab(label);
    await tab.waitForDisplayed({ timeout: 10_000 });
    await tab.click();
  }
}
