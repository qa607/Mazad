/**
 * Mazad Backend "Under Review Auctions" list (/backend/auction/waiting-approval/index) test data.
 * The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const waitingApprovalText = {
  pageTitle: 'Under Review Auctions',
  sidebarLabel: 'Waiting Approval',
  noResults: 'No results found.',
  /** Grid header labels, in column order. */
  columnHeaders: ['#', 'Auction', 'Item Info', 'Statistics', 'Prices', 'Date', 'Actions'],
  confirmTitle: 'Are you sure?',
  acceptMessage: 'Are you sure you want to Accept this price?',
  declineMessage: 'Are you sure you want to Decline this price?',
  failedTitle: 'Failed',
  biddersTitle: 'Bidding Details',
} as const;

export const waitingApprovalData = {
  /** Well-formed (17-character) VIN that matches no vehicle. */
  unknownVin: 'ZZZZZZZZZZ0000000',
  partialVinLength: 6,
} as const;

/** Endpoints of the three decisions, to prove that closing a dialog sends nothing. */
export const waitingApprovalEndpoints = {
  accept: '/auction/ajax/accept-waiting-approve-auction',
  decline: '/auction/ajax/decline-waiting-approve-auction',
  failed: '/auction/ajax/failed-waiting-approval',
} as const;

/** URL patterns, matched against the full page URL. */
export const waitingApprovalUrls = {
  list: /\/backend\/auction\/waiting-approval\/index(\?|$)/,
  vehicleView: (vehicleId: string) =>
    new RegExp(`/backend/vehicle/vehicle/view\\?id=${vehicleId}$`),
  failedReport: /\/backend\/report\/failed-report\/index\?FailedReportViewSearch%5Bvin_number%5D=/,
} as const;
