/**
 * Mazad Backend Supplier List test data. Messages and business rules were read from the
 * staging Backend on 2026-11-04 (client validation rules and the live UI), not assumed.
 */
export const supplierText = {
  listTitle: 'Suppliers',
  createTitle: 'Create Supplier',
  updateTitlePrefix: 'Update Supplier: ',
  emptyState: 'No results found.',
  createdMessage: 'Supplier created successfully.',
  required: {
    name: 'Arabic Name cannot be blank.',
    nameEn: 'English Name cannot be blank.',
    status: 'Status cannot be blank.',
    phone: 'Phone cannot be blank.',
    newPassword: 'New Password cannot be blank.',
    crNumber: 'Cr Number cannot be blank.',
    taxId: 'Tax ID cannot be blank.',
  },
  invalid: {
    phone: 'The format of Phone is invalid.',
    email: (value: string) => `Invalid email address: ${value}`,
    passwordTooShort: 'New Password should contain at least 6 characters.',
    passwordMismatch: 'The passwords do not match',
    crNumber: 'The number must start with 7 and be 10 digits long.',
    taxId: 'Tax ID must be 15 digits and start with 3',
    nameEnTooLong: 'English Name should contain at most 100 characters.',
    nameTooLong: 'Arabic Name should contain at most 100 characters.',
  },
  duplicate: {
    phone: 'Phone already exist',
    crNumber: (value: string) => `Cr Number "${value}" has already been taken.`,
  },
} as const;

/**
 * Supplier List behaviour accepted as intended (reviewed with QA on 2026-11-04). Tests assert
 * these, so a change shows up as a failure:
 * - Supplier Name / Supplier Name En are filled from the CR record and are read-only; on
 *   staging Supplier Name En holds the Arabic name.
 * - The phone filter matches the full number only; name and email filters match part of it.
 * - Phone and CR number must be unique; email and tax ID may repeat.
 * - Several emails are saved and listed comma-separated, without spaces.
 * - The duplicate phone message reads "Phone already exist".
 */

/** Grid columns in display order. */
export const supplierColumns = [
  '#',
  'ID',
  'Supplier Name En',
  'English Name',
  'Vehicles Count',
  'Status',
  'Email',
  'Buyer Commission',
  'Request Mojaz',
  'Phone',
  'Joining Date',
  'Actions',
] as const;

export type SupplierColumn = (typeof supplierColumns)[number];

/** Columns with a sort link, and the sort key each one puts in the URL. */
export const sortableColumns = { ID: 'id', Phone: 'phone', 'Joining Date': 'created_at' } as const;

export type SortableColumn = keyof typeof sortableColumns;

export const statusOptions = ['active', 'inactive'] as const;
export const yesNoOptions = ['Yes', 'No'] as const;
export const exportFormats = ['CSV', 'Excel 95 +', 'Excel 2007+'] as const;

/** Columns offered by the export column picker (its order differs from the grid). */
export const exportColumns = [
  '#',
  'ID',
  'Supplier Name En',
  'English Name',
  'Vehicles Count',
  'Status',
  'Email',
  'Phone',
  'Joining Date',
  'Buyer Commission',
  'Request Mojaz',
] as const;

export const pageSize = 20;

/** Values for search fields that must not match any supplier and must not break the page. */
export const unsafeSearchValues = [
  `' OR '1'='1`,
  '<script>alert(1)</script>',
  '%%%',
  '___',
] as const;

/** Prefix of every supplier this suite creates, so test records are easy to find. */
export const testSupplierPrefix = 'QA-AUTO';

export interface SupplierData {
  name: string;
  nameEn: string;
  status: (typeof statusOptions)[number];
  phone: string;
  email: string;
  password: string;
  crNumber: string;
  taxId: string;
}

/**
 * A new, unique test supplier. Phone, CR number and tax ID are derived from the clock so
 * repeated runs do not collide (phone and CR number must be unique).
 */
export function newTestSupplier(): SupplierData {
  const stamp = Date.now().toString().slice(-7);
  return {
    name: `${testSupplierPrefix} مورد ${stamp}`,
    nameEn: `${testSupplierPrefix} Supplier ${stamp}`,
    status: 'active',
    phone: `059${stamp}`,
    email: `qa.auto.${stamp}@example.com`,
    password: 'QaAuto#2026',
    crNumber: `7${stamp}00`,
    taxId: `3${stamp}0000003`,
  };
}

/** URL patterns, matched against the full page URL. */
export const supplierUrls = {
  list: /\/backend\/users\/supplier\/index(\?|$)/,
  create: /\/backend\/users\/supplier\/create$/,
  update: (id: string) => new RegExp(`/backend/users/supplier/update\\?id=${id}(#|$)`),
  view: (id: string) => new RegExp(`/backend/users/supplier/view\\?id=${id}$`),
  anyUpdate: /\/backend\/users\/supplier\/update\?id=(\d+)/,
} as const;
