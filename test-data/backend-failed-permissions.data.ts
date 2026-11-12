import type { BackendRole } from '@config/credentials.config';

/**
 * Expected back-office access to the Failed List, per role, read from each role's permissions
 * page on staging (Roles → View Permission) on 2026-11-11. Only roles with a test account in
 * .env can be signed in; the others are skipped. Dev Root holds every permission and is NOT a
 * Super Admin login test.
 *
 * Known on that date: Operation, Finance and Marketing hold none of these routes; Customer
 * Support only the Failed Invoice list and the Failed report export; Auction Team the list,
 * Upload Invoice and the report export; Auction Supervisor all of them.
 */
export const failedAccessPaths = {
  list: '/backend/auction/failed/index',
  create: '/backend/auction/failed/create',
  invoiceList: '/backend/invoice/failed-invoice/index',
  pricingUpdate: '/backend/vehicle/pricing/update?id=0',
} as const;

export type FailedAccessPage = keyof typeof failedAccessPaths;

/**
 * Read-only requests that a role without the permission must be refused (HTTP 403). They use a
 * non-existent item (id 0) and are only ever sent for roles that must be refused, so they never
 * touch a real record.
 */
export const failedDeniedProbes = {
  directSaleForm: {
    label: 'Direct Sale form',
    path: '/backend/auction/ajax/direct-sale-auction-form?item_id=0&list_name=failed',
  },
  uploadInvoiceForm: {
    label: 'Upload Invoice form',
    path: '/backend/invoice/ajax/upload-failed-invoice?id=0&list_name=failed',
  },
  pricingUpdate: { label: 'Pricing update form', path: failedAccessPaths.pricingUpdate },
} as const;

export type FailedDeniedProbe = keyof typeof failedDeniedProbes;

interface ExpectedFailedAccess {
  label: string;
  pages: readonly FailedAccessPage[];
  /** Denied probes this role must be refused. */
  refused: readonly FailedDeniedProbe[];
}

const everyProbe = Object.keys(failedDeniedProbes) as FailedDeniedProbe[];

export const expectedFailedAccess: Record<'devRoot' | BackendRole, ExpectedFailedAccess> = {
  devRoot: {
    label: 'root (Dev Root)',
    pages: ['list', 'create', 'invoiceList'],
    refused: [],
  },
  auctionSupervisor: {
    label: 'Auction Supervisor',
    pages: ['list', 'create', 'invoiceList'],
    refused: [],
  },
  // Holds the list, Upload Invoice and /vehicle/pricing/update, but not Create, Direct Sale or
  // the Failed Invoice list.
  auctionTeam: {
    label: 'Auction Team',
    pages: ['list'],
    refused: ['directSaleForm'],
  },
  // The Failed Invoice list only.
  customerSupport: {
    label: 'Customer Support',
    pages: ['invoiceList'],
    refused: everyProbe,
  },
  operation: { label: 'operation', pages: [], refused: everyProbe },
  noAuctionAccess: { label: 'Marketing (no auction access)', pages: [], refused: everyProbe },
  supplier: { label: 'Supplier (supplierAdmin)', pages: [], refused: everyProbe },
};

/** HTTP status for a route the signed-in role may not use. */
export const failedForbiddenStatus = 403;

/** Permission routes the Failed List actions rely on (as the role permission page titles them). */
export const failedPermissionRoutes = {
  index: '/auction/failed/index',
  directSale: 'direct-sale-auction',
  rePricing: 're-pricing-field-auction',
  uploadInvoice: 'upload-failed-invoice',
  viewInvoice: 'view-failed-invoice',
  invoiceIndex: '/invoice/failed-invoice/index',
  create: '/auction/failed/create',
  addToAuction: 'add-to-auction-failed',
} as const;
