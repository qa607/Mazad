import { IosScreen } from '@mobile/ios/screens/ios.screen';
import { OBSERVED_HEADER_ICONS } from '@mobile/ios/screens/guest-tabs.screen';
import { xpathLiteral } from '@utils/xpath';

/**
 * Mazad iOS app — Favorite Auctions, recorded on the device (build 8.3 (1491), stg-154, 2026-11-14).
 * Home's header heart has no accessible name, so this screen is opened from the Bids tab, whose
 * header heart is the ONE Button named "favoriteHeaderButton" (signed in or not). The screen has a
 * heading, the Live and Upcoming tabs (texts; labels served by GET /v1/configuration) and one Cell
 * per favourite car, holding the title and exactly ONE Button: its heart. A coordinate tap on that
 * heart did not register (2026-11-14); an element click does.
 */
export class IosFavouritesScreen extends IosScreen {
  private cellXpath(title: string): string {
    return `//XCUIElementTypeCell[.//XCUIElementTypeStaticText[contains(@label, ${xpathLiteral(title)})]]`;
  }

  /** The card of a favourite car, by its title. */
  card(title: string) {
    return this.driver.$(this.cellXpath(title));
  }

  /** Opens Favorite Auctions from the Bids tab's header heart. */
  async openFromBids(bidsTabLabel: string): Promise<void> {
    await (
      await this.only(this.buttonSelector(bidsTabLabel), `Tab bar: "${bidsTabLabel}"`)
    ).click();
    const name = OBSERVED_HEADER_ICONS.favorites;
    await (await this.only(this.buttonSelector(name), `Bids header: "${name}"`)).click();
  }

  async waitUntilOpen(headingLabel: string): Promise<void> {
    await this.only(
      this.staticTextSelector(headingLabel),
      `Favorites: the "${headingLabel}" heading`,
    );
  }

  async openTab(label: string): Promise<void> {
    await (
      await this.only(this.staticTextSelector(label), `Favorites: the "${label}" tab`)
    ).click();
  }

  /** Taps the heart of a favourite car, which takes it off the list. */
  async removeFavourite(title: string): Promise<void> {
    const heart = await this.only(
      `${this.cellXpath(title)}//XCUIElementTypeButton`,
      `Favorites: the heart of "${title}"`,
    );
    await heart.click();
  }
}
