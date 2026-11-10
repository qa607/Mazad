/**
 * Back office Sold List expectations, recorded from staging (2026-11-04).
 * Sold vehicles themselves are not fixed here: tests read existing sold auctions at run time
 * (or the one in MAZAD_SOLD_AUCTION_ID) and never create sales.
 */
export const soldListText = {
  pageTitle: 'Sold Auctions',
  columnGroups: [
    'Auction Info',
    'Sale Info',
    'Customer Info',
    'Item Info',
    'Statistics',
    'Prices',
    'Date',
    'Actions',
  ],
  emptyResult: 'No results found.',
  /** "Showing 1-20 of 1,164 items." */
  summary: /^Showing \d+-\d+ of [\d,]+ items?\.$/,
  pageSize: 20,
  /** A well-formed VIN that matches no vehicle. */
  unknownVin: 'NOVIN000000000000',
} as const;

/** Statuses of the ERP Mazad Car that mean the car has been sold. */
export const erpSoldStatuses: readonly string[] = ['Sold', 'Invoiced'];

/** Allowed difference between amounts in SAR (VAT rounding in the ERP). */
export const amountTolerance = 0.01;

/** Optional override: follow this sold auction across systems instead of the newest ones. */
export const soldAuctionOverride = process.env.MAZAD_SOLD_AUCTION_ID
  ? Number(process.env.MAZAD_SOLD_AUCTION_ID)
  : null;

/** How many recent sold auctions the cross-system check follows by default. */
export const crossSystemSampleSize = Number(process.env.MAZAD_SOLD_SAMPLE_SIZE || 3);
