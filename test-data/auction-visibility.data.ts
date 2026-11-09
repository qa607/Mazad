/** Auction sections a supplier can open, with the name of each section's search form. */
export const auctionSections = [
  { name: 'Ready For Pricing', slug: 'ready-for-pricing', form: 'ReadyForPricingSearch' },
  { name: 'Pricing Done', slug: 'pricing-done', form: 'PricingDoneSearch' },
  { name: 'Live', slug: 'live', form: 'LiveSearch' },
  { name: 'Upcoming', slug: 'upcoming', form: 'UpcomingSearch' },
  { name: 'Awaiting', slug: 'awaiting', form: 'AwaitingSearch' },
] as const;

export type AuctionSection = (typeof auctionSections)[number];

/**
 * Financial information a supplier must not see: reserve price, commission and Motory or
 * administrative fees, in English or Arabic.
 */
export const restrictedFinancialText =
  /reserve|commission|admin(istrative)?\s*fee|motory\s*fee|administrative expenses|عمولة|رسوم|سعر الاحتياط/i;

/** What a refused vehicle page says when it is answered with 200 instead of an error status. */
export const refusedPageText = /not found|forbidden|not allowed|does not exist/i; // e.g. "The requested page does not exist." (HTTP 200)
