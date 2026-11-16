import { IosScreen } from '@mobile/ios/screens/ios.screen';
import { xpathLiteral } from '@utils/xpath';

/**
 * Mazad iOS app — the Home tab's car list, recorded on the device (build 8.3 (1491), stg-154,
 * 2026-11-14, English and Arabic). The "Live Auctions" / "Upcoming Auctions" tabs are texts, the
 * "Auctions" / "Cars" switch is Buttons. On Cars, each car is a Button whose label starts with
 * city, mileage and title, holding the title as a StaticText (Arabic titles have no bidi marks)
 * and exactly ONE nested Button: its heart (named "FavoriteUnSelected" while nobody has the car in
 * favourites, else named by the favourite count). Labels come from the caller (test data, API).
 */
export class IosHomeScreen extends IosScreen {
  private cardXpath(title: string): string {
    return `//XCUIElementTypeButton[.//XCUIElementTypeStaticText[contains(@label, ${xpathLiteral(title)})]]`;
  }

  /** The heart of the car card with this title (presence checks; tapFavourite() to tap it). */
  favouriteButton(title: string) {
    return this.driver.$(`${this.cardXpath(title)}//XCUIElementTypeButton`);
  }

  /** Opens a Home tab (the ONE text with that label), then its Cars list (the ONE Button). */
  async openCars(tabLabel: string, carsLabel: string): Promise<void> {
    await (
      await this.only(this.staticTextSelector(tabLabel), `Home: the "${tabLabel}" tab`)
    ).click();
    await (
      await this.only(this.buttonSelector(carsLabel), `Home: the "${carsLabel}" switch`)
    ).click();
  }

  /**
   * Drags the list up until the card's heart is on screen, clear of the header and the tab bar;
   * fails after `maxDrags`. Slow drags: a fast swipe flings the list past cards.
   */
  async scrollToCard(title: string, maxDrags = 12): Promise<void> {
    const { width, height } = await this.driver.getWindowSize();
    for (let drag = 0; drag <= maxDrags; drag++) {
      const heart = this.favouriteButton(title);
      if (await heart.isDisplayed().catch(() => false)) {
        const { y } = await heart.getLocation();
        if (y > height * 0.25 && y < height * 0.85) return;
      }
      if (drag === maxDrags) break;
      await this.driver.execute('mobile: dragFromToForDuration', {
        fromX: Math.round(width / 2),
        fromY: Math.round(height * 0.72),
        toX: Math.round(width / 2),
        toY: Math.round(height * 0.4),
        duration: 0.6,
      });
    }
    throw new Error(`Home: no car card titled "${title}" after ${maxDrags} drags.`);
  }

  /** Taps the card's heart (adds or removes the car from favourites; asks a guest to log in). */
  async tapFavourite(title: string): Promise<void> {
    await this.scrollToCard(title);
    const heart = await this.only(
      `${this.cardXpath(title)}//XCUIElementTypeButton`,
      `Home: the heart of "${title}"`,
    );
    await heart.click();
  }
}
