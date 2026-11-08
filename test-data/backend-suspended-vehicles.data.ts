/**
 * Mazad Backend "Suspended Vehicles" list (/backend/auction/suspend/index) test data.
 * The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const suspendedVehiclesText = {
  pageTitle: 'Suspended Vehicles',
  noResults: 'No results found.',
  activateConfirmTitle: 'Are you sure?',
  activateConfirmMessage: 'Do you really want to activate these records?',
  /** Success alert after activating, from the activate endpoint's response. */
  changesSaved: 'Changes have been saved',
  /** Grid header labels, in column order (the selection checkbox column has no label). */
  columnHeaders: [
    '#',
    '',
    'ID',
    'Auction Source',
    'Title En',
    'VIN',
    'Vehicle Count',
    'Plate number',
    'Make',
    'Model',
    'Year',
    'Color',
    'Suspend Reason',
    'Supplier',
    'Actions',
  ],
} as const;

export const suspendedVehiclesData = {
  /** Well-formed (17-character) VIN that matches no vehicle. */
  unknownVin: 'ZZZZZZZZZZ0000000',
  /** Small reason group used by the read-only filter test (16 vehicles on 2026-11-05). */
  filterReason: 'Incorrect Inspection',
  /**
   * Reason group the activation test takes a vehicle from: the largest group whose vehicles
   * can be activated (357 on 2026-11-05). Vehicles suspended for "Inactive supplier" cannot be
   * activated. The label is spelled "Supplie" on staging; the pattern also accepts the fix.
   */
  activationReason: /^Requested by Supplier?$/,
  pageSize: 20,
} as const;

/** URL patterns, matched against the full page URL. */
export const suspendedVehiclesUrls = {
  list: /\/backend\/auction\/suspend\/index(\?|$)/,
  activateEndpoint: '/auction/ajax/activate-auction-item',
} as const;
