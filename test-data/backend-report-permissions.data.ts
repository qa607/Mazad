import type { AccessProfile } from '@test-data/backend-permissions.data';

/**
 * Expected access to the Report pages, per role. Taken from each role's permissions page on
 * staging (2026-11-08) and confirmed by signing in with each role's test account (2026-11-09).
 * To confirm: this records observed behaviour; the business owner must sign off on the matrix
 * (review of PR #16) so a permission bug is not encoded as expected.
 */

/** The Report pages, in sidebar order. */
export const reportPages = {
  sales: { label: 'Sales', path: '/backend/report/sold-report/index' },
  failed: { label: 'Failed', path: '/backend/report/failed-report/index' },
  auctionClosed: { label: 'Auction Closed', path: '/backend/report/auction-closed-report/index' },
  purchaseSurvey: {
    label: 'Purchase Survey',
    path: '/backend/report/purchase-survey-report/index',
  },
  supplierVehicle: {
    label: 'Supplier Vehicle',
    path: '/backend/report/supplier-vehicle-report/index',
  },
  vehicles: { label: 'Vehicles', path: '/backend/report/item-report/index' },
  powerBi: { label: 'Power BI', path: '/backend/report/power-bi/index' },
  mojazRequest: { label: 'Request Mojaz', path: '/backend/report/mojaz-request/index' },
} as const;

export type ReportPage = keyof typeof reportPages;

const allReports = Object.keys(reportPages) as ReportPage[];

export const expectedReportAccess: Record<AccessProfile, readonly ReportPage[]> = {
  devRoot: allReports,
  auctionSupervisor: allReports,
  customerSupport: [
    'sales',
    'failed',
    'auctionClosed',
    'supplierVehicle',
    'vehicles',
    'mojazRequest',
  ],
  auctionTeam: ['sales', 'failed', 'mojazRequest'],
  operation: [],
  noAuctionAccess: [],
  // A supplier opens three reports, each limited to its own vehicles and auctions.
  supplier: ['sales', 'failed', 'auctionClosed'],
};

/** The reports a supplier opens, with the search-form name of their supplier filter. */
export const supplierReports = [
  { report: 'sales', form: 'SoldReportViewSearch' },
  { report: 'failed', form: 'FailedReportViewSearch' },
  { report: 'auctionClosed', form: 'AuctionItemClosedSearch' },
] as const;

/**
 * Other suppliers whose data the SUPPLIER_PHONE account must never see. The account's own ID comes
 * from SUPPLIER_ID in .env (getSupplierAccountId), so it always matches the signed-in supplier.
 */
export const otherSupplierIds = ['141', '782'] as const;
