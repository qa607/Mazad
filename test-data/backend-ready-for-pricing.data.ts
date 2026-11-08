/**
 * Mazad Backend "Ready For Pricing" list (/backend/auction/ready-for-pricing/index) test data.
 * The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const readyForPricingText = {
  pageTitle: 'Ready For Pricing',
  noResults: 'No results found.',
  /** Grid header labels, in column order (the selection checkbox column has no label). */
  columnHeaders: [
    '#',
    '',
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
  suspendModalTitle: 'Suspend Vehicle Reason',
  /** Reasons offered when suspending ("Inactive supplier" is set by the system only). */
  suspendReasons: [
    'The car is pending to be sold',
    'Incorrect Inspection',
    'Requested by Supplie',
    'Other Reasons',
  ],
  reasonRequired: 'Reason cannot be blank.',
  suspended: 'Items have been Suspended',
} as const;

export const readyForPricingData = {
  /** Well-formed (17-character) VIN that matches no vehicle. */
  unknownVin: 'ZZZZZZZZZZ0000000',
  /** Filter values with matches on staging (2026-11-08). */
  city: 'Riyadh',
  year: '2023',
  titleSearch: 'Corolla',
  /**
   * Reason the round-trip test suspends with. The Suspended Vehicles spec never uses this
   * group, so the two specs can run at the same time without touching each other's vehicles.
   */
  roundTripReason: 'The car is pending to be sold',
  pageSize: 20,
} as const;

/** URL patterns, matched against the full page URL. */
export const readyForPricingUrls = {
  list: /\/backend\/auction\/ready-for-pricing\/index(\?|$)/,
} as const;
