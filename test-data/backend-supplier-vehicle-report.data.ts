/**
 * Mazad Backend "Supplier Vehicle Report" (/backend/report/supplier-vehicle-report/index) test
 * data. The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const supplierVehicleText = {
  pageTitle: 'Supplier Vehicle Report',
  sidebarLabel: 'Supplier Vehicle',
  /** Grid header labels, in column order. */
  columnHeaders: [
    'Supplier Name',
    'Supplier Status',
    'Count All',
    'Count Auction',
    'Count Inspection',
    'Count Suspended',
    'Auction Details',
    'Inspection Details',
  ],
  /** Column headers of the CSV export, in order. */
  csvHeaders: [
    'Supplier Name',
    'Count All',
    'Count Auction',
    'Count Inspection',
    'Count Suspended',
    'Count Ready For Pricing',
    'Count Pricing Done',
    'Count Upcoming',
    'Count Awaiting',
    'Count Live',
    'Count Sold',
    'Count Failed',
    'Count Under Review',
    'Count Inspection Awaiting',
    'Count Inspection Ongoing',
    'Count Inspection Completed',
    'Count Inspection Waiting Qc',
    'Count Inspection Qc Completed',
  ],
} as const;

/**
 * Auction lists whose total for one supplier must equal the report's count for that stage, with
 * each list's search-form name.
 */
export const stageLists = [
  {
    stage: 'Ready For Pricing',
    path: '/backend/auction/ready-for-pricing/index',
    form: 'ReadyForPricingSearch',
  },
  { stage: 'Pricing Done', path: '/backend/auction/pricing-done/index', form: 'PricingDoneSearch' },
  { stage: 'Upcoming', path: '/backend/auction/upcoming/index', form: 'UpcomingSearch' },
  { stage: 'Awaiting', path: '/backend/auction/awaiting/index', form: 'AwaitingSearch' },
  { stage: 'Failed', path: '/backend/auction/failed/index', form: 'FailedListViewSearch' },
] as const;

export const suspendedList = {
  path: '/backend/auction/suspend/index',
  form: 'SuspendSearch',
} as const;

export const liveList = { path: '/backend/auction/live/index', form: 'LiveSearch' } as const;

/** URL patterns, matched against the full page URL. */
export const supplierVehicleUrls = {
  list: /\/backend\/report\/supplier-vehicle-report\/index(\?|$)/,
  csvFileName: /^Supplier Vehicle Report \d{4}-\d{2}-\d{2}\.csv$/,
} as const;

/** Stage labels of the report's detail cells (staging, 2026-11-09). */
/** Labels of the Auction Details cell, in order. */
export const auctionStages = [
  'Pending Bulk',
  'Ready For Pricing',
  'Pricing Done',
  'Upcoming',
  'Awaiting',
  'Live',
  'Sold',
  'Failed',
] as const;

/** Labels of the Inspection Details cell, in order. */
export const inspectionStages = [
  'Under Review',
  'Awaiting',
  'Ongoing',
  'Completed',
  'Waiting for QC',
  'QC Completed',
] as const;

export type AuctionStage = (typeof auctionStages)[number];
export type InspectionStage = (typeof inspectionStages)[number];
