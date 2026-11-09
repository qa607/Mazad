import { testRecordPrefix } from '@test-data/backend-common.data';
import { uniqueDigits } from '@utils/unique';

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
  yes: 'Yes',
  no: 'No',
  /** Text a dropdown shows before an option is picked. */
  placeholders: {
    status: 'Choose Status',
    /** Commission and Request Mojaz filters. */
    all: 'All',
  },
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
export const yesNoOptions = [supplierText.yes, supplierText.no] as const;
export const exportFormats = ['CSV', 'Excel 95 +', 'Excel 2007+'] as const;

/** Export formats that download a spreadsheet, with the file extension each one gives. */
export const spreadsheetExports = [
  { format: 'Excel 95 +', extension: 'xls' },
  { format: 'Excel 2007+', extension: 'xlsx' },
] as const;

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

/** Columns a CSV export always contains, and the one the column-picker test unselects. */
export const csvExport = {
  requiredColumns: ['ID', 'English Name', 'Status', 'Email', 'Phone'],
  unselectedColumn: 'Email',
  keptColumn: 'Phone',
} as const;

export const pageSize = 20;

/** Formats of the values shown in the grid and on the details page. */
export const supplierFormats = {
  id: /^\d+$/,
  count: /^\d+$/,
  phone: /^0\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  dateTime: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
  /** Buyer Commission column: "No" or an amount. */
  commission: /^(No|[\d,]+(\.\d+)?)$/,
  commissionAmount: /^[\d,]+(\.\d+)?$/,
} as const;

/** Edit form tabs in display order. Before the first save only the first one is available. */
export const supplierTabs = [
  'Basic Information',
  'Auction Info',
  'Inspection Locations',
  'Email Templates',
  'Commission',
] as const;

/** Supplier Config switches on the Create form (true = on). */
export const supplierSwitchDefaults = {
  purchasingRequest: false,
  insurance: true,
  addUser: true,
  declarationReceipt: true,
  insuranceSupplier: false,
  canEditReservedPrice: false,
  requestMojaz: false,
  postponeInvoice: false,
} as const;

/** Switches the CRUD test turns on when it creates its supplier. */
export const createdSupplierSwitches = [
  'requestMojaz',
  'canEditReservedPrice',
  'purchasingRequest',
] as const;

/** Labels of the read-only fields on the supplier details page. */
export const supplierDetailLabels = {
  nameEn: 'English Name',
  name: 'Arabic Name',
  status: 'Status',
  phone: 'Phone',
  email: 'Email',
  crNumber: 'Cr Number',
  taxId: 'Tax ID',
  supplierName: 'Supplier Name',
  supplierNameEn: 'Supplier Name En',
  requestMojaz: 'Request Mojaz',
  canEditReservedPrice: 'Can Edit Reserved Price',
  purchasingRequest: 'Used cars purchasing request (CASH)',
  insuranceSupplier: 'Insurance Supplier',
  postponeInvoice: 'Postpone Invoice',
  insurance: 'Insurance',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
} as const;

/** Longest English or Arabic name the form accepts. */
export const maxNameLength = 100;

/** Values for single-field checks on the Create Supplier form. */
export const supplierFormData = {
  validNameEn: `${testRecordPrefix} Name`,
  longestNameEn: 'x'.repeat(maxNameLength),
  longestName: 'م'.repeat(maxNameLength),
  multipleEmails: 'qa.one@example.com, qa.two@example.com',
  shortPassword: '12345',
  password: 'QaAuto#2026',
  mismatchedPassword: 'QaAuto#2027',
  invalidCrNumber: '8123456789',
} as const;

/** Values the Create Supplier form rejects, with the message shown under the field. */
export const invalidSupplierFieldCases = [
  { name: 'too short phone', field: 'phone', input: '12345', error: supplierText.invalid.phone },
  {
    name: 'letters in phone',
    field: 'phone',
    input: 'abcdefghij',
    error: supplierText.invalid.phone,
  },
  {
    name: 'email without @',
    field: 'email',
    input: 'not-an-email',
    error: supplierText.invalid.email('not-an-email'),
  },
  {
    name: 'CR number not starting with 7',
    field: 'crNumber',
    input: '8123456789',
    error: supplierText.invalid.crNumber,
  },
  {
    name: 'CR number with 9 digits',
    field: 'crNumber',
    input: '712345678',
    error: supplierText.invalid.crNumber,
  },
  {
    name: 'CR number with letters',
    field: 'crNumber',
    input: '71234567ab',
    error: supplierText.invalid.crNumber,
  },
  {
    name: 'tax ID not starting with 3',
    field: 'taxId',
    input: '123456789012345',
    error: supplierText.invalid.taxId,
  },
  {
    name: 'tax ID with 14 digits',
    field: 'taxId',
    input: '31234567890123',
    error: supplierText.invalid.taxId,
  },
  {
    name: 'English Name over 100 characters',
    field: 'nameEn',
    input: 'x'.repeat(maxNameLength + 1),
    error: supplierText.invalid.nameEnTooLong,
  },
  {
    name: 'Arabic Name over 100 characters',
    field: 'name',
    input: 'م'.repeat(maxNameLength + 1),
    error: supplierText.invalid.nameTooLong,
  },
] as const;

/** Search values for the Supplier List filters. */
export const supplierSearchData = {
  /** A well-formed phone with no supplier. */
  unknownPhone: '0000000000',
  /** Filters that each match no supplier. */
  noMatch: [
    { name: 'Non-existing phone', filters: { phone: '0000000000' } },
    { name: 'Non-existing English Name', filters: { nameEn: 'zz-no-such-supplier-zz' } },
    { name: 'Non-existing email', filters: { email: 'no-such-supplier@nowhere.invalid' } },
    { name: 'Phone with letters', filters: { phone: 'abcdef' } },
  ],
  /** A value for every filter, to check that Reset clears them all. */
  everyFilter: {
    phone: '05',
    nameEn: 'a',
    email: '@',
    status: 'active',
    commission: 'No',
    requestMojaz: 'No',
  },
} as const;

/** Values for search fields that must not match any supplier and must not break the page. */
export const unsafeSearchValues = [
  `' OR '1'='1`,
  '<script>alert(1)</script>',
  '%%%',
  '___',
] as const;

/** Prefix of every supplier this suite creates, so test records are easy to find. */
export const testSupplierPrefix = testRecordPrefix;

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
 * A new, unique test supplier. Phone, CR number and tax ID must be unique, so they are built
 * from uniqueDigits() (see src/utils/unique.ts) and follow the form's rules: a Saudi mobile
 * (05 + 8 digits), a CR number of 10 digits starting with 7, and a tax ID of 15 digits
 * starting with 3.
 */
export function newTestSupplier(): SupplierData {
  const stamp = uniqueDigits(7);
  return {
    name: `${testSupplierPrefix} مورد ${stamp}`,
    nameEn: `${testSupplierPrefix} Supplier ${stamp}`,
    status: 'active',
    phone: `059${stamp}`,
    email: `qa.auto.${stamp}@example.com`,
    password: supplierFormData.password,
    crNumber: `7${stamp}00`,
    taxId: `3${stamp}0000003`,
  };
}

/** The changes the CRUD test makes when it edits its supplier. */
export function editedSupplier(created: SupplierData) {
  return {
    name: `${created.name} معدل`,
    nameEn: `${created.nameEn} Edited`,
    email: created.email.replace('@', '.edited@'),
    status: 'inactive',
  } as const;
}

/** What the details page shows for the supplier the CRUD test creates, keyed by label. */
export function expectedSupplierDetails(data: SupplierData): Record<string, string> {
  const label = supplierDetailLabels;
  const { yes, no } = supplierText;
  return {
    [label.nameEn]: data.nameEn,
    [label.name]: data.name,
    [label.status]: data.status,
    [label.phone]: data.phone,
    [label.email]: data.email,
    [label.crNumber]: data.crNumber,
    [label.taxId]: data.taxId,
    [label.requestMojaz]: yes,
    [label.canEditReservedPrice]: yes,
    [label.purchasingRequest]: yes,
    [label.insuranceSupplier]: no,
    [label.postponeInvoice]: no,
    [label.insurance]: yes,
  };
}

/** URL patterns, matched against the full page URL. */
export const supplierUrls = {
  list: /\/backend\/users\/supplier\/index(\?|$)/,
  create: /\/backend\/users\/supplier\/create$/,
  update: (id: string) => new RegExp(`/backend/users/supplier/update\\?id=${id}(#|$)`),
  view: (id: string) => new RegExp(`/backend/users/supplier/view\\?id=${id}$`),
  anyUpdate: /\/backend\/users\/supplier\/update\?id=(\d+)/,
  sortedBy: (key: string) => new RegExp(`sort=${key}(&|$)`),
  statusFilter: (status: string) => new RegExp(`SupplierSearch%5Bstatus%5D=${status}`),
} as const;
