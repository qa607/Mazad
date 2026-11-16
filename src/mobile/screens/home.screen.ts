import { CarCardsScreen } from '@mobile/screens/car-cards.screen';

/**
 * Mazad Android app — the Home tab, recorded on staging (8.2.2-stage, 2026-11-14): a header (logo,
 * Favorites and Notifications buttons), the "Live Auctions" / "Upcoming Auctions" tabs, the
 * "Auctions" / "Cars" switch and the list. After a restart or a language change the list shows
 * Auctions (auction groups); Cars shows one card per car (see CarCardsScreen). Labels come from
 * the caller (test data).
 */
export class HomeScreen extends CarCardsScreen {
  /** A Home tab ("Live Auctions", "Upcoming Auctions") or the Auctions/Cars switch, by label. */
  label(text: string) {
    return this.byText(text);
  }

  /**
   * The header's Favorites (heart) button. It has no text, description or ID: it is the first
   * clickable element of the header row, the row right above the tabs. Compose keeps that order
   * in Arabic too (only the drawing is mirrored), so the same lookup works in both languages.
   */
  favouritesButton(liveTabLabel: string) {
    return this.driver.$(
      `//android.view.View[following-sibling::android.view.View[1][.//android.widget.TextView[@text=${JSON.stringify(liveTabLabel)}]]]/android.view.View[@clickable="true"][1]`,
    );
  }

  /** Opens a Home tab, then the Cars list of that tab. */
  async openCars(tabLabel: string, carsLabel: string): Promise<void> {
    for (const text of [tabLabel, carsLabel]) {
      const element = this.label(text);
      await element.waitForDisplayed({ timeout: 15_000 });
      await element.click();
    }
  }

  /** Opens Favorite Auctions from the header. */
  async openFavourites(liveTabLabel: string): Promise<void> {
    const button = this.favouritesButton(liveTabLabel);
    await button.waitForDisplayed({ timeout: 15_000 });
    await button.click();
  }
}
