/**
 * Mazad Backend "Upcoming" list (/backend/auction/upcoming/index) and "Create Auction" wizard
 * test data. The Backend has no localization, so its UI text lives here rather than in
 * src/locales.
 */
export const upcomingText = {
  pageTitle: 'Upcoming',
  noResults: 'No results found.',
  /** Grid header labels, in column order (the selection checkbox column has no label). */
  columnHeaders: [
    '#',
    '',
    'ID',
    'Auction Source',
    'Title',
    'City',
    'Vin Number',
    'Starting Price',
    'Buy Now Price',
    'Reserve Price',
    'Starting Bid',
    'Min Increment',
    'Supplier',
    'Commission',
    'Actions',
  ],
  suspendModalTitle: 'Suspend Vehicle Reason',
  suspendReasons: [
    'The car is pending to be sold',
    'Incorrect Inspection',
    'Requested by Supplie',
    'Other Reasons',
  ],
  reasonRequired: 'Reason cannot be blank.',
  backToPricingDoneTitle: 'Are you sure?',
  backToPricingDoneMessage: 'Do you really want to back these items to pricing done?',
  addToAuctionTitle: 'Add To Auction',
  viewPageTitlePrefix: 'View Info: ',
  updatePageTitle: /^Update Info: /,
} as const;

export const createAuctionText = {
  pageTitle: 'Create Auction',
  /** Step-1 fields that must be filled before "Next: Select Cars", by input id. */
  requiredFieldErrors: {
    'auction-title': 'Title cannot be blank.',
    'auction-start_item_date': 'Start Date cannot be blank.',
    'auction-end_item_date': 'End Date cannot be blank.',
  },
  stepTitles: ['1 Auction Configuration', '2 Select Cars'],
  /** Step 2 before a supplier is chosen in step 1. */
  noSupplier: 'Please select a supplier from Step 1 to load vehicles.',
  /** Alert when Create Auction is pressed with no vehicle selected. */
  selectionRequiredTitle: 'Selection Required',
  selectionRequiredMessage: 'Please select at least one vehicle.',
  /** Title typed in tests that never submit; the wizard is never completed. */
  probeTitle: 'QA test - not submitted',
  /**
   * Title prefix of the auctions the round-trip test really creates (and then empties). With
   * the timestamp the test appends, it must stay within the 45-character title limit.
   */
  realAuctionTitle: 'QA Test Auction - delete',
  /** Longest title the wizard accepts, and its message for a longer one. */
  titleMaxLength: 45,
  titleTooLong: 'Title should contain at most 45 characters.',
  created: 'The auction has been created successfully.',
  movedToUpcoming: 'Items have been moved to upcoming',
  /** How far ahead the real test auction starts, so it never goes live during a run. */
  realAuctionMonthsAhead: 2,
} as const;

/** Calendar date format of the wizard's date fields. */
export const createAuctionDateFormat = /^\d{4}-\d{2}-\d{2}$/;

export const upcomingData = {
  /** Well-formed (17-character) VIN that matches no vehicle. */
  unknownVin: 'ZZZZZZZZZZ0000000',
  /** Characters of a VIN used for the partial-VIN search. */
  partialVinLength: 8,
  /** Make and model with matches on staging (2 vehicles on 2026-11-08). */
  make: 'Toyota',
  model: 'Yaris',
  auctionType: 'Vehicle',
  /** Rows on one page of the grid. */
  pageSize: 20,
} as const;

/** URL patterns, matched against the full page URL. */
export const upcomingUrls = {
  list: /\/backend\/auction\/upcoming\/index(\?|$)/,
  createAuction: /\/backend\/auction\/upcoming\/create$/,
  vehicleView: (id: string) => new RegExp(`/backend/vehicle/vehicle/view\\?id=${id}$`),
  vehicleUpdate: (id: string) => new RegExp(`/backend/vehicle/vehicle/update\\?id=${id}$`),
  backToPricingDoneEndpoint: '/auction/ajax/pricing-done-back-auction-item',
  createAuctionEndpoint: '/auction/ajax/create-auction',
} as const;
