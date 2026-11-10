/**
 * Mazad Backend "Auction Closed Report" (/backend/report/auction-closed-report/index) test data.
 * The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const auctionClosedText = {
  pageTitle: 'Auction Closed Report',
  sidebarLabel: 'Auction Closed',
  noResults: 'No results found.',
  /** Grid header labels, in column order (the expand column has no label). */
  columnHeaders: [
    'ID',
    '',
    'Auction title',
    'Statistic Count',
    'View',
    'Viewer',
    'Bids',
    'Start Date',
    'End Date',
  ],
  exportConfirm: 'The CSV export file will be generated for download.',
  /** Column headers of the CSV export, in order. */
  csvHeaders: [
    'Auction title',
    'Item Count',
    'Sold Count',
    'Failed Count',
    'Direct Sale Count',
    'Buy Now Count',
    'No Bid Count',
    'View Count',
    'View Count Before Auction',
    'View Count During Auction',
    'Viewer Count',
    'Viewer Count Before Auction',
    'Viewer Count During Auction',
    'Bid Count',
    'Bidder Count',
    'Start Date',
    'End Date',
  ],
} as const;

export const auctionClosedData = {
  /**
   * Auctions created by tests/backend/auction-live.spec.ts: one vehicle, no bids, so each closed
   * with Item 1, Failed 1, No Bid 1. Their vehicles belong to supplier 782.
   */
  liveTestTitlePrefix: 'QA Live Test -',
  liveTestSupplierOption: /^\s*شركة تجريبية-782 - Supplier\s*$/,
  /** A supplier with closed auctions that never had a QA live-test vehicle. */
  otherSupplierOption: /^\s*شركة تجريبية-141 - Supplier\s*$/,
  pageSize: 20,
} as const;

/** URL patterns, matched against the full page URL. */
export const auctionClosedUrls = {
  list: /\/backend\/report\/auction-closed-report\/index(\?|$)/,
  csvFileName: /^Auction Closed Report \d{4}-\d{2}-\d{2}\.csv$/,
} as const;
