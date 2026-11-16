import type { Locator, Page } from '@playwright/test';
import { BasePage } from '@pages/frontend/base/base.page';
import type { Language } from '@typings';

/**
 * Website "Live & Upcoming Auctions" (/<lang>/live-auctions/). Below the live and upcoming lists
 * it has a "Latest Ended Auctions" section: the newest ended auctions and an "All Ended Auctions"
 * link to the full list (/<lang>/auctions/).
 */
export class LiveAuctionsPage extends BasePage {
  static readonly path = '/live-auctions/';

  readonly endedSection: Locator;
  readonly endedSectionTitle: Locator;
  readonly allEndedAuctionsLink: Locator;
  /** Names of the auctions in the "Latest Ended Auctions" section, in order. */
  readonly endedAuctionNames: Locator;

  constructor(page: Page, language: Language) {
    super(page, language);
    this.endedSection = page.locator('.past-auction-container');
    this.endedSectionTitle = this.endedSection.locator('.past-auction-title');
    this.allEndedAuctionsLink = this.endedSection.locator('a.all-finished-auctions-link');
    this.endedAuctionNames = this.endedSection.locator('a.category-card-container .info-title');
  }

  async goto(): Promise<void> {
    await this.open(LiveAuctionsPage.path);
  }
}
