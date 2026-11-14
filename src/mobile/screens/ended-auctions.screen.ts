import { MobileScreen } from '@mobile/screens/mobile.screen';

/** Direction marks the app puts around names ("\u202Bمزاد تنافسي 373\u202C"). */
const DIRECTION_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const DATE = /^\d{2}\/\d{2}\/\d{4}$/;

/** XPath string literal for text without double quotes (names, labels). */
const literal = (text: string) => JSON.stringify(text);

/**
 * Mazad Android app — ended auctions, recorded on 8.2.2-stage (2026-11-14). Home ends with an
 * "Ended Auctions" button (below the live list); it opens a grid of ended auctions (name and
 * date per card, newest first). An auction's page shows its status ("Ended Auction"), counters
 * and one card per car; a car's page says when its auction was held. The screens are Compose
 * without IDs, so parts are found by the text the caller passes (test data).
 */
export class EndedAuctionsScreen extends MobileScreen {
  /** Scrolls Home down to the "Ended Auctions" button and opens the list. */
  async openFromHome(buttonLabel: string, maxSwipes = 12): Promise<void> {
    const button = this.byText(buttonLabel);
    for (let swipe = 0; !(await button.isDisplayed()); swipe++) {
      if (swipe >= maxSwipes) throw new Error(`No "${buttonLabel}" button at the end of Home.`);
      await this.swipeUp();
    }
    await button.click();
  }

  /** Names on the ended auction cards shown, in order (direction marks removed). */
  async auctionNames(): Promise<string[]> {
    const names: string[] = [];
    for (const text of await this.driver
      .$$('//android.view.View[@clickable="true"]//android.widget.TextView')
      .getElements()) {
      const value = ((await text.getText()) ?? '').replace(DIRECTION_MARKS, '').trim();
      if (value && !DATE.test(value)) names.push(value);
    }
    return names;
  }

  /** The card of one auction, by its name. */
  auctionCard(name: string) {
    return this.driver.$(
      `//android.view.View[@clickable="true"][.//android.widget.TextView[contains(@text, ${literal(name)})]]`,
    );
  }

  /** The first car card of an auction's page (cards show the mileage, e.g. "169,212 كم"). */
  firstCarCard(mileageUnit: string) {
    return this.driver.$(
      `//android.view.View[@clickable="true"][.//android.widget.TextView[contains(@text, ${literal(` ${mileageUnit}`)})]]`,
    );
  }

  /** A text that starts with `prefix`, e.g. "Auction was held on" on a car's page. */
  textStartingWith(prefix: string) {
    return this.driver.$(`android=new UiSelector().textStartsWith(${JSON.stringify(prefix)})`);
  }

  private async swipeUp(): Promise<void> {
    const { width, height } = await this.driver.getWindowSize();
    await this.driver.execute('mobile: swipeGesture', {
      left: Math.round(width * 0.1),
      top: Math.round(height * 0.25),
      width: Math.round(width * 0.8),
      height: Math.round(height * 0.5),
      direction: 'up',
      percent: 0.8,
      speed: 2500,
    });
  }
}
