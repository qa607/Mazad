import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/frontend/base/base.page';
import type { Language } from '@typings';

/**
 * Website page of one car (/<lang>/car/<item id>/). The website cannot bid: a car of an ended
 * auction says when its auction was held ("Auction was held on 10/01/2027"), and the page only
 * offers the app ("Get the App").
 */
export class CarDetailsPage extends BasePage {
  readonly heading: Locator;
  /** The countdown line; for an ended auction it reads "Auction was held on <date>". */
  readonly auctionTime: Locator;
  readonly getTheAppLink: Locator;

  constructor(page: Page, language: Language) {
    super(page, language);
    this.heading = page.locator('h1.car-title');
    this.auctionTime = page.locator('.countdown-part').first();
    this.getTheAppLink = page
      .locator('a, button')
      .filter({ hasText: this.t('getTheApp') })
      .first();
  }
}
