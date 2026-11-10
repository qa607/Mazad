import type { AccessProfile } from '@test-data/backend-permissions.data';

/**
 * Mazad Backend "Car Cancellations" (/backend/requestCancellation/car-cancellation/index) test
 * data. The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const carCancellationText = {
  pageTitle: 'Car Cancellations',
  sidebarLabel: 'Car',
  noResults: 'No results found.',
  /** Grid header labels, in column order. */
  columnHeaders: [
    'Request Id',
    'Customer Name',
    'Mobile Number',
    'Title',
    'Vin Number',
    'Plate Number',
    'Reason',
    'Reason Text',
    'Status',
    'Supplier',
    'Item Status',
    'Request Date',
    'Updated At',
  ],
  customerTypes: ['Individual', 'Dealer'],
  /** A listed reason, its filter label, and the "Other" reason. */
  reason: 'I am no longer interested in the car.',
  otherReason: 'Other',
  notSet: '(not set)',
  itemStatuses: ['sold', 'failed'],
} as const;

export const carCancellationData = {
  /** Supplier with cancellation requests on staging (2 on 2026-11-09). */
  supplierOption: /^\s*شركة تجريبية-782 - Supplier\s*$/,
  supplierName: 'شركة تجريبية-782',
  partialVinLength: 8,
  unknownVin: 'ZZZZZZZZZZ0000000',
} as const;

/** URL patterns, matched against the full page URL. */
export const carCancellationUrls = {
  list: /\/backend\/requestCancellation\/car-cancellation\/index(\?|$)/,
  customer: /\/backend\/users\/(individual|dealer)\/view\?id=\d+$/,
  vehicle: /\/backend\/vehicle\/vehicle\/view\?id=\d+$/,
} as const;

/**
 * Who can open Car Cancellations, from each role's permissions page (2026-11-08). The decision
 * requests are sent only for roles that must be refused, with a non-existent ID: for an allowed
 * role they could change a real request or move a vehicle to Failed.
 */
export const carCancellationAccess: Record<
  AccessProfile,
  { page: boolean; decide: boolean; moveToFailed: boolean }
> = {
  devRoot: { page: true, decide: true, moveToFailed: true },
  auctionSupervisor: { page: true, decide: true, moveToFailed: true },
  customerSupport: { page: true, decide: true, moveToFailed: true },
  // To confirm: Auction Team cannot open the page, yet its role allows the decision request.
  auctionTeam: { page: false, decide: true, moveToFailed: false },
  operation: { page: false, decide: false, moveToFailed: false },
  noAuctionAccess: { page: false, decide: false, moveToFailed: false },
  supplier: { page: false, decide: false, moveToFailed: false },
};

/** The two decision requests, with input that matches no request or vehicle. */
export const cancellationActions = {
  decide: {
    label: 'Decide a cancellation (Decline)',
    method: 'POST' as const,
    path: '/backend/requestCancellation/ajax/request-cancellation/',
    form: { type: 'cancel-car', id: '0', user_id: '0', value: 'decline', option_status: '' },
  },
  // A GET that changes data (moves a vehicle to Failed), so it is open to CSRF: reported for an
  // application fix (POST + CSRF token). Never send it for a role that is allowed, even with
  // item_id=0.
  moveToFailed: {
    label: 'Move the vehicle to Failed (Approve)',
    method: 'GET' as const,
    path: '/backend/requestCancellation/ajax/move-to-failed/?item_id=0',
    form: null,
  },
} as const;

/** Request statuses: filter value and dropdown label. */
export const cancellationStatuses = {
  pending: 'Pending',
  approve: 'Approve',
  decline: 'Decline',
} as const;

export type CancellationStatus = keyof typeof cancellationStatuses;
