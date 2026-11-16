import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/frontend/base/base.page';
import type { Language } from '@typings';

/**
 * Website page of one auction (/<lang>/auctions/<slug>/, e.g. at-competitive-bidding-373): its
 * name, status ("Ended Auction" once it has ended), counters (Cars, Views) and one card per car.
 * A car card opens the car's page.
 */
export class AuctionDetailsPage extends BasePage {
  readonly heading: Locator;
  readonly status: Locator;
  /** The number under the "Cars" counter. */
  readonly carsCount: Locator;
  readonly carCards: Locator;
  readonly carTitles: Locator;

  constructor(page: Page, language: Language) {
    super(page, language);
    this.heading = page.locator('h1.card-title');
    this.status = page.locator('.mazad-status-text');
    this.carsCount = page
      .locator('.count-text-wrapper', {
        has: page.locator('.count-text', { hasText: this.t('auctionCarsCount') }),
      })
      .locator('.count-number');
    this.carCards = page.locator('a.vehicle-card-container');
    this.carTitles = this.carCards.locator('h2.auction-title');
  }
}
