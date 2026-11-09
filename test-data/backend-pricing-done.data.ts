/**
 * Mazad Backend "Pricing Done" list (/backend/auction/pricing-done/index) test data.
 * The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const pricingDoneText = {
  pageTitle: 'Pricing Done',
  noResults: 'No results found.',
  /** Grid header labels, in column order (the selection checkbox column has no label). */
  columnHeaders: [
    '#',
    '',
    'ID',
    'Auction Source',
    'Title En',
    'City',
    'VIN',
    'Status',
    'Starting Price',
    'Buy Now Price',
    'Reserve Price',
    'Starting Bid',
    'Min Increment',
    'Supplier',
    'Commission',
    'Actions',
  ],
  /** Statuses a priced vehicle can have in this list ("Updated" is offered but unused). */
  statuses: ['New', 'RePricing'],
  suspendModalTitle: 'Suspend Vehicle Reason',
  suspendReasons: [
    'The car is pending to be sold',
    'Incorrect Inspection',
    'Requested by Supplie',
    'Other Reasons',
  ],
  reasonRequired: 'Reason cannot be blank.',
  moveToUpcomingTitle: 'Are you sure?',
  moveToUpcomingMessage: 'Do you really want to back these auctions to upcoming items?',
  /** Title of the vehicle page opened by a row's View link: "View Info: <vehicle title>". */
  viewPageTitle: /^View Info: /,
  viewPageTitlePrefix: 'View Info: ',
  updatePageTitle: /^Update Info: /,
} as const;

export const pricingDoneData = {
  /** Well-formed (17-character) VIN that matches no vehicle. */
  unknownVin: 'ZZZZZZZZZZ0000000',
  /** Characters of a VIN used for the partial-VIN search. */
  partialVinLength: 8,
  /** Filter values with matches on staging (2026-11-08). */
  make: 'Toyota',
  model: 'Camry',
  year: '2024',
  titleSearch: 'Camry',
  auctionType: 'Vehicle',
  /** Supplier option label, and the name the grid shows for that supplier (11 vehicles). */
  supplierOption: /-7602 - Supplier$/,
  supplierName: 'شركة تجريبية-7602',
  /** Not a number: should match no vehicle (see the known-bug test). */
  invalidPrice: 'abc',
  pageSize: 20,
} as const;

/** URL patterns, matched against the full page URL. */
export const pricingDoneUrls = {
  list: /\/backend\/auction\/pricing-done\/index(\?|$)/,
  vehicleView: (id: string) => new RegExp(`/backend/vehicle/vehicle/view\\?id=${id}$`),
  vehicleUpdate: (id: string) => new RegExp(`/backend/vehicle/vehicle/update\\?id=${id}$`),
  moveToUpcomingEndpoint: '/vehicle/ajax/upcoming-vehicle',
} as const;
