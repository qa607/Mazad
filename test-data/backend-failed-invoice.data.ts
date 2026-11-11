import type { BackendRole } from '@config/credentials.config';

/**
 * Failed Invoice list (/backend/invoice/failed-invoice/index) test data. Read from the staging
 * Backend on 2026-11-11 with Dev Root. The list holds exactly one invoice: the one uploaded by
 * approved transaction T2 (item 15137). Tests only read it; nothing is uploaded, replaced or
 * updated here. Because there is one record, nothing in this file claims multi-record or
 * multi-page coverage.
 */
export const failedInvoiceRecord = {
  itemId: '15137',
  vehicleId: '12255',
  vin: 'LSJA36E35LZ027565',
  /** Item Title as the grid shows it (vehicle name and year). */
  title: 'MG 5 2020',
  /** The vehicle name without the year: this is what the Item Title filter matches (DC-07). */
  titleWithoutYear: 'MG 5',
  /** Supplier as the grid shows it; its ID is 5136. */
  supplier: 'شركة تجريبية-5136',
  supplierId: '5136',
  type: 'Vehicle',
  customer: 'Al-Imtiaz Motors Company',
  /** Text typed in the customer search, and a text that finds no customer. */
  customerSearch: 'Imt',
  actions: ['View Invoice', 'Update Supplier Invoice'],
} as const;

export const failedInvoiceText = {
  pageTitle: 'Failed Invoice',
  noResults: 'No results found.',
  columnHeaders: ['ID', 'Type', 'Customer', 'Vin Number', 'Item Title', 'Supplier Name', 'Actions'],
  updateDialogTitle: 'Upload Invoice',
  fileRequired: 'Invoice cannot be blank.',
  extensionError: /Only files with these extensions are allowed\s*:\s*PNG, JPG, JPEG & PDF/,
} as const;

export const failedInvoiceData = {
  /** Rows on one page of the grid. */
  pageSize: 20,
  partialVinLength: 8,
  partialTitle: 'MG',
  unknownVin: 'ZZZZZZZZZZ0000000',
  unknownTitle: 'zzzz-no-such-title',
  unknownCustomerSearch: 'zzzzqqqq',
} as const;

/** Where a signed-in role is expected to land, taken from each role's permissions page (2026-11-11). */
export interface ExpectedInvoiceAccess {
  label: string;
  /** Holds /invoice/failed-invoice/index. */
  listOpens: boolean;
  /** Holds view-failed-invoice. */
  viewInvoice: boolean;
  /** Holds upload-failed-invoice (the permission behind "Update Supplier Invoice"). */
  updateSupplierInvoice: boolean;
}

export const expectedInvoiceAccess: Record<
  'superAdmin' | Exclude<BackendRole, 'supplier'>,
  ExpectedInvoiceAccess
> = {
  superAdmin: {
    label: 'Super Admin',
    listOpens: true,
    viewInvoice: true,
    updateSupplierInvoice: true,
  },
  auctionSupervisor: {
    label: 'Auction Supervisor',
    listOpens: true,
    viewInvoice: true,
    updateSupplierInvoice: true,
  },
  // Holds only upload-failed-invoice: it cannot open the list, so it never sees the action.
  auctionTeam: {
    label: 'Auction Team',
    listOpens: false,
    viewInvoice: false,
    updateSupplierInvoice: true,
  },
  // Holds only the list: rows are visible, no action is offered.
  customerSupport: {
    label: 'Customer Support',
    listOpens: true,
    viewInvoice: false,
    updateSupplierInvoice: false,
  },
  operation: {
    label: 'operation',
    listOpens: false,
    viewInvoice: false,
    updateSupplierInvoice: false,
  },
  noAuctionAccess: {
    label: 'Marketing (no auction access)',
    listOpens: false,
    viewInvoice: false,
    updateSupplierInvoice: false,
  },
};

/** The popup behind "Update Supplier Invoice" (a read-only request for a form, nothing is saved). */
export const updateInvoiceFormPath = (itemId: string) =>
  `/backend/invoice/ajax/upload-failed-invoice?id=${itemId}&list_name=failed_supplier_invoice`;

export const forbiddenStatus = 403;
