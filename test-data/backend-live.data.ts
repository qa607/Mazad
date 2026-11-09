/**
 * Mazad Backend "Live Auctions" list (/backend/auction/live/index) test data.
 * The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const liveText = {
  pageTitle: 'Live Auctions',
  noResults: 'No results found.',
  /** Grid header labels, in column order (the selection checkbox column has no label). */
  columnHeaders: ['#', '', 'Auction', 'Item Info', 'Statistics', 'Prices', 'Date', 'Actions'],
  disableConfirm: 'Are you sure you want to disable it?',
  biddersTitle: 'Bidding Details',
  supplierTitle: 'Detailed information about the owner',
  reservePriceTitle: 'Update Price',
  updateAuctionTitle: 'Update Auction:',
  extendTitle: 'Extend Auction',
  viewPageTitle: 'Auction View (Live)',
} as const;

export const liveData = {
  /** Well-formed (17-character) VIN that matches no vehicle. */
  unknownVin: 'ZZZZZZZZZZ0000000',
  partialVinLength: 6,
} as const;

/** Endpoints of the Live actions, to prove that closing a dialog sends nothing. */
export const liveEndpoints = {
  /** Disable Auction sends the vehicle back to Pricing Done. */
  disable: '/auction/ajax/pricing-done-back-auction-item',
  reservePrice: '/auction/ajax/update-reserve-price',
  updateAuction: '/auction/ajax/update-auction-live',
  extend: '/auction/ajax/extend-auction',
  autoExtend: '/auction/ajax/save-auto-extend',
  // Dialog content is loaded from these (GET).
  bidders: 'view-bidders',
  supplier: 'view-clickable-supplier',
  reservePriceDialog: 'update-reserve-price',
  updateAuctionDialog: 'update-auction-live',
} as const;

/** URL patterns, matched against the full page URL. */
export const liveUrls = {
  list: /\/backend\/auction\/live\/index(\?|$)/,
  view: (itemId: string) => new RegExp(`/backend/auction/live/view\\?id=${itemId}$`),
} as const;
