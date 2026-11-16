import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/frontend/base/base.page';
import type { Language } from '@typings';

/**
 * Website "Ended Auctions" (/<lang>/auctions/): one card per ended auction (name and date),
 * newest first, nine per page with pagination below. A card opens the auction's page.
 */
export class EndedAuctionsPage extends BasePage {
  static readonly path = '/auctions/';

  readonly heading: Locator;
  readonly auctionCards: Locator;
  /** Auction names on the cards, in order. */
  readonly auctionNames: Locator;
  readonly pagination: Locator;

  constructor(page: Page, language: Language) {
    super(page, language);
    // The page has a second h1.page-title further down ("Search By City").
    this.heading = page.locator('h1.page-title').first();
    this.auctionCards = page.locator('a.category-card-container');
    this.auctionNames = this.auctionCards.locator('.info-title');
    this.pagination = page.locator('app-pagination .pagination').first();
  }

  async goto(): Promise<void> {
    await this.open(EndedAuctionsPage.path);
  }
}
