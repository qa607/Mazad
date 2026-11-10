/**
 * Mazad Backend "Vehicles Report" (/backend/report/item-report/index) test data.
 * The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const vehiclesReportText = {
  pageTitle: 'Vehicles Report',
  sidebarLabel: 'Vehicles',
  noResults: 'No results found.',
  /** Grid header labels, in column order (the expand column has no label). */
  columnHeaders: ['', 'Item', 'Count Auction', 'Fees & Commissions', 'Mojaz Profit'],
  notSold: 'This vehicle is not sold',
  /** Lines of the Fees & Commissions cell for a sold vehicle. */
  soldFeeLabels: ['Customer Commission', 'Administrative Fees', 'Supplier Commission'],
  exportDone: 'Download file have been successfully',
} as const;

export const vehiclesReportData = {
  /** Well-formed (17-character) VIN that matches no vehicle. */
  unknownVin: 'ZZZZZZZZZZ0000000',
  partialVinLength: 8,
  /**
   * A vehicle whose auction history is known: auction-live.spec.ts put it in two auctions that
   * both ended with no bids (it shows "#F2" in the lists), so it entered 2 auctions, unsold.
   */
  knownVehicle: {
    vin: 'RS2LP3459RWP00729',
    supplier: 'شركة تجريبية-782',
    countAuction: 2,
  },
  make: 'Toyota',
  year: '2020',
  titleSearch: 'Camry',
  supplierOption: /^\s*شركة تجريبية-782 - Supplier\s*$/,
  supplierName: 'شركة تجريبية-782',
  /** Search-form field of the VIN filter, as it appears in the report's address. */
  vinFilter: 'ItemReportSearch[vin_number]',
  /** Traces of server internals an error page must never show: PHP file paths, stack frames. */
  serverInternals: /Stack trace|\.php(:\d+| on line)|#\d+ \/|\/var\/www\//i,
} as const;

/** URL patterns, matched against the full page URL. */
export const vehiclesReportUrls = {
  list: /\/backend\/report\/item-report\/index(\?|$)/,
  /** The report with no filter in its address (after Reset). */
  listUnfiltered: /\/backend\/report\/item-report\/index$/,
  exportFile: /^\/backend\/export\/vehicle-report-\d{4}-\d{2}-\d{2}\.xlsx$/,
  exportFileName: /^vehicle-report-\d{4}-\d{2}-\d{2}\.xlsx$/,
} as const;
