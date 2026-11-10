/**
 * What a supplier (its own account, role supplierAdmin) sees of prices in the auction lists,
 * compared with Dev Root. Taken from staging on 2026-11-09 with supplier 38236. A supplier sees
 * "Supplier Price" (what it receives) where Dev Root sees "Reserve Price" and "Commission".
 */

/** Grid column headers per list, as the supplier sees them (in order, empty labels skipped). */
export const supplierColumns = {
  readyForPricing: {
    label: 'Ready For Pricing',
    path: '/backend/auction/ready-for-pricing/index',
    headers: [
      '#',
      'ID',
      'Auction Source',
      'Title En',
      'VIN',
      'Plate Number En',
      'City',
      'Year',
      'Grade En',
      'Exterior Color',
      'Supplier',
      'Odometer',
      'Actions',
    ],
  },
  pricingDone: {
    label: 'Pricing Done',
    path: '/backend/auction/pricing-done/index',
    headers: [
      '#',
      'ID',
      'Auction Source',
      'Title En',
      'City',
      'VIN',
      'Status',
      'Starting Price',
      'Buy Now Price',
      'Supplier Price',
      'Starting Bid',
      'Min Increment',
      'Supplier',
      'Actions',
    ],
  },
  upcoming: {
    label: 'Upcoming',
    path: '/backend/auction/upcoming/index',
    headers: [
      '#',
      'ID',
      'Auction Source',
      'Title',
      'City',
      'Vin Number',
      'Starting Price',
      'Buy Now Price',
      'Supplier Price',
      'Starting Bid',
      'Min Increment',
      'Supplier',
      'Actions',
    ],
  },
  awaiting: {
    label: 'Awaiting',
    path: '/backend/auction/awaiting/index',
    headers: [
      '#',
      'Auction ID',
      'Auction Source',
      'Auction Type',
      'Bidding Type',
      'Auction Title',
      'Title',
      'City',
      'Vin Number',
      'Number Of Cars',
      'Start Date',
      'End Date',
      'Starting Price',
      'Buy Now Price',
      'Supplier Price',
      'Supplier',
      'Actions',
    ],
  },
} as const;

export type SupplierList = keyof typeof supplierColumns;

/** Price columns only Dev Root (staff) sees. A supplier must never see these. */
export const staffOnlyPriceColumns = ['Reserve Price', 'Commission'] as const;

/** Price column only the supplier sees: what it receives for the vehicle. */
export const supplierOnlyPriceColumn = 'Supplier Price';

/** Price columns both see, which must show the same value for the same vehicle. */
export const sharedPriceColumns = [
  'Starting Price',
  'Buy Now Price',
  'Starting Bid',
  'Min Increment',
] as const;

/** Lists with one combined "Prices" cell per row (Live, Waiting Approval). */
export const combinedPriceLists = {
  live: { label: 'Live', path: '/backend/auction/live/index', gridId: 'live' },
  waitingApproval: {
    label: 'Waiting Approval',
    path: '/backend/auction/waiting-approval/index',
    gridId: 'live',
  },
} as const;

/** Wording inside a combined "Prices" cell that only staff may see. */
export const staffOnlyPriceText = /Reserve Price|Commission|Administrative Expenses/;

/** Lists a supplier cannot open at all (HTTP 403). */
export const supplierForbiddenLists = [
  { label: 'Suspended Vehicles', path: '/backend/auction/suspend/index' },
  { label: 'Failed', path: '/backend/auction/failed/index' },
  { label: 'Sold', path: '/backend/auction/sold/index' },
  { label: 'Delivered', path: '/backend/auction/delivered/index' },
] as const;

/** The supplier's Auctions menu, in order. */
export const supplierAuctionMenu = [
  'Ready For Pricing',
  'Pricing Done',
  'Upcoming',
  'Awaiting List',
  'Live List',
  'Waiting Approval',
] as const;
