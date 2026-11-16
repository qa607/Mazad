import { MobileScreen } from '@mobile/screens/mobile.screen';
import { xpathLiteral } from '@utils/xpath';

/**
 * Parent of the Android screens that list car cards (Home > Cars, Favorite Auctions). Recorded on
 * staging (8.2.2-stage, 2026-11-14): Jetpack Compose with no resource IDs or descriptions.
 * - A card is the clickable element that holds the car's title. Arabic titles are wrapped in
 *   bidi marks (U+202B ... U+202C), so a card is matched on its title as contained text; the
 *   title comes from GET /v1/auction/list in the app's language.
 * - Its favourite (heart) button is the only clickable element nested in the card (on the
 *   photo's top corner). It holds the favourite count once that is above 0. Whether the heart is
 *   filled is not exposed, so callers check the Favorite Auctions list (or the API) instead.
 */
export abstract class CarCardsScreen extends MobileScreen {
  private cardXpath(title: string): string {
    return `//android.view.View[@clickable="true"][./android.widget.TextView[contains(@text, ${xpathLiteral(title)})]]`;
  }

  /** The card of a car, by its title. */
  card(title: string) {
    return this.driver.$(this.cardXpath(title));
  }

  /** The card's favourite (heart) button. */
  favouriteButton(title: string) {
    return this.driver.$(`${this.cardXpath(title)}//android.view.View[@clickable="true"]`);
  }

  /**
   * Swipes the list up until the card's heart is on screen; fails after `maxSwipes`. Swipes are
   * slow (a fast one flings the list past cards), and the heart is looked for while the list
   * settles after each one.
   */
  async scrollToCard(title: string, maxSwipes = 12): Promise<void> {
    const heart = this.favouriteButton(title);
    const { width, height } = await this.driver.getWindowSize();
    for (let swipe = 0; swipe <= maxSwipes; swipe++) {
      const shown = await heart.waitForDisplayed({ timeout: 2_000 }).then(
        () => true,
        () => false,
      );
      if (shown) return;
      if (swipe === maxSwipes) break;
      await this.driver.execute('mobile: swipeGesture', {
        left: Math.round(width * 0.1),
        top: Math.round(height * 0.45),
        width: Math.round(width * 0.8),
        height: Math.round(height * 0.35),
        direction: 'up',
        percent: 0.6,
        speed: 1_500,
      });
    }
    throw new Error(`No car card titled "${title}" after ${maxSwipes} swipes.`);
  }

  /** Taps the card's heart (adds or removes the car from favourites; asks a guest to log in). */
  async tapFavourite(title: string): Promise<void> {
    await this.scrollToCard(title);
    await this.favouriteButton(title).click();
  }
}
