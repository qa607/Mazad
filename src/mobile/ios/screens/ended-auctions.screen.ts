import { IosScreen } from '@mobile/ios/screens/ios.screen';

/** An ended auction card is a Button labelled "<name>, <date>" ("مزاد تنافسي 373, 10/01/2027"). */
const AUCTION_CARD_LABEL = /^(.+), \d{2}\/\d{2}\/\d{4}$/;

/**
 * Ended auctions in the iOS app, observed on the device 2026-11-14 (build 8.3 (1491), Arabic).
 * NAVIGATION AND DISPLAY ONLY: Home ends with an "Ended Auctions" button that opens a grid of ended
 * auctions (newest first); an auction's page ("Auction Details") shows its status and one Button
 * per car ("<city>, <mileage>, <use>, <title>, <date>"); a car's page says when its auction was
 * held. Nothing here bids, signs in or submits.
 *
 * Every control is the ONE element with its label (checked each time, never by position or order).
 */
export class IosEndedAuctionsScreen extends IosScreen {
  /** Scrolls Home down to the ONE "Ended Auctions" button and taps it (navigation). */
  async openFromHome(label: string, maxSwipes = 8): Promise<void> {
    for (let swipe = 0; swipe <= maxSwipes; swipe++) {
      const buttons = await this.driver.$$(this.buttonSelector(label)).getElements();
      if (buttons.length === 1 && (await buttons[0].isDisplayed())) {
        await buttons[0].click();
        return;
      }
      await this.driver.execute('mobile: swipe', { direction: 'up' });
    }
    throw new Error(`Home: no single "${label}" button after ${maxSwipes} swipes.`);
  }

  /** Names of the ended auction cards shown, in reading order. */
  async auctionNames(): Promise<string[]> {
    const names: string[] = [];
    for (const button of await this.allOfType('Button').getElements()) {
      const match = AUCTION_CARD_LABEL.exec((await button.getAttribute('label')) ?? '');
      if (match) names.push(match[1]);
    }
    return names;
  }

  /** Taps the ONE card of the auction with this name (navigation). */
  async openAuction(name: string): Promise<void> {
    const selector = `-ios predicate string:type == "XCUIElementTypeButton" AND label BEGINSWITH ${JSON.stringify(`${name}, `)}`;
    await (await this.only(selector, `Ended auctions: the "${name}" card`)).click();
  }

  /** Taps the ONE car Button of the open auction whose label holds this car title (navigation). */
  async openCar(title: string): Promise<void> {
    const selector = `-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS ${JSON.stringify(`, ${title}, `)}`;
    await (await this.only(selector, `Auction details: the "${title}" car`)).click();
  }

  /** A text of the screen: the ONE StaticText with this exact label. */
  async onlyText(label: string) {
    return this.only(this.staticTextSelector(label), `Ended auctions: the "${label}" text`);
  }

  /** The ONE StaticText that starts with `prefix` (e.g. "Auction was held on" on a car's page). */
  async onlyTextStartingWith(prefix: string) {
    const selector = `-ios predicate string:type == "XCUIElementTypeStaticText" AND label BEGINSWITH ${JSON.stringify(prefix)}`;
    return this.only(selector, `Car: the text starting "${prefix}"`);
  }
}
