import { uniqueDigits } from '@utils/unique';
import { testRecordPrefix } from '@test-data/backend-common.data';

/**
 * Mazad Backend > Users > Suppliers > Companies test data. Messages and rules were read from the
 * staging Backend on 2026-11-10 (the live UI and its server validation), not assumed.
 *
 * Findings the business chose to ignore (2026-11-10) are deliberately not asserted: the CR
 * number has no format or uniqueness rule, the tax number takes any 1-20 digits, the name
 * filters do not trim spaces, a deleted company's View and Update pages still open, and
 * required fields carry no asterisk.
 */
export const supplierCompanyText = {
  listTitle: 'Companies',
  createTitle: 'New Company',
  /** The edit page title is this prefix and the company's English name (the View title is that name alone). */
  updateTitlePrefix: 'Update : ',
  emptyState: 'No results found.',
  supplierPlaceholder: 'Select Supplier ...',
  deleteConfirmation: 'Are you sure you want to delete this item?',
  createdMessage: 'Company has been created.',
  savedMessage: 'Company has been saved.',
  deletedMessage: 'Company has been deleted.',
  linkedToAuctions:
    'You cannot delete this company because it is linked with one or more auctions.',
  required: {
    name: 'Company Name Ar cannot be blank.',
    nameEn: 'Company Name En cannot be blank.',
    supplier: 'Supplier cannot be blank.',
    crNumber: 'Commercial Registration Number cannot be blank.',
    taxNumber: 'Tax Number cannot be blank.',
    workingHours: 'Working Hours cannot be blank.',
    workingHoursEn: 'Working Hours En cannot be blank.',
    warehouseName: 'Warehouse Name Ar cannot be blank.',
    warehouseNameEn: 'Warehouse Name En cannot be blank.',
    locationLink: 'Location Link cannot be blank.',
    warehousePhone: 'Phone Number cannot be blank.',
  },
  invalid: {
    email: 'Email is not a valid email address.',
    phone: 'The format of Phone Number is invalid.',
    locationLink: 'Location Link is not a valid URL.',
    workingHoursEnTooLong: 'Working Hours En should contain at most 255 characters.',
  },
} as const;

/** Labels of the search form, in order. */
export const companyFilterLabels = ['Supplier', 'Company Name Ar', 'Company Name En'] as const;

/** Grid columns in display order (the Actions column is left out). */
export const companyColumns = ['#', 'Supplier Name', 'Company Name Ar', 'Company Name En'] as const;
export type CompanyColumn = (typeof companyColumns)[number];

/** Row actions, in order. */
export const companyRowActions = ['View', 'Update', 'Delete'] as const;

/** Rows per page of the default list. */
export const defaultPageSize = 20;
/**
 * Page size used to read the whole list. Pages of 5 sorted by ID load reliably; several larger
 * pages answer 502 Bad Gateway (see the known bug in supplier-company-list.spec.ts).
 */
export const readPageSize = 5;

export const companyExportFormats = ['CSV', 'Excel 95 +', 'Excel 2007+'] as const;

/** Header of the CSV export, in order. */
export const companyExportHeader = [
  'ID',
  'Supplier Name',
  'Company Name Ar',
  'Company Name En',
  'Email',
  'Commercial Registration Number',
  'Tax Number',
  'Working Hours',
  'Phone Number',
  'Created At',
  'Updated At',
] as const;

/** Text filter values that must not break the page. */
export const unusualFilterValues = [
  { name: 'a single quote', value: "O'Brien" },
  { name: 'a percent sign', value: '%' },
  { name: 'an underscore', value: '_' },
  { name: 'SQL-like text', value: "' OR 1=1 --" },
  { name: 'a script tag', value: '<script>alert(1)</script>' },
  { name: '500 characters', value: 'a'.repeat(500) },
  { name: 'an emoji', value: '😀' },
] as const;

/** A filter value no company matches. */
export const noMatchName = 'zzqq-no-such-company';
/** A supplier ID that does not exist. */
export const unknownSupplierId = '99999999';
/** An ID no company has. */
export const unknownCompanyId = '99999999';

/** Supplier the test companies are created under: the QA-AUTO test supplier. */
export const testSupplierId = '45784';
/** How that supplier's name shows in the grid's Supplier Name column. */
export const testSupplierName = 'شركة تجريبية-';

export interface WarehouseData {
  name: string;
  nameEn: string;
  locationLink: string;
  phone: string;
}

export interface CompanyData {
  supplierId: string;
  name: string;
  nameEn: string;
  email: string;
  phone: string;
  crNumber: string;
  taxNumber: string;
  workingHours: string;
  workingHoursEn: string;
  warehouses: WarehouseData[];
}

/** A new, unique QA-AUTO test company with two warehouses. */
export function newTestCompany(): CompanyData {
  const stamp = uniqueDigits(7);
  return {
    supplierId: testSupplierId,
    name: `${testRecordPrefix} شركة اختبار ${stamp}`,
    nameEn: `${testRecordPrefix} Test Company ${stamp}`,
    email: `qa.auto.company.${stamp}@example.com`,
    phone: `0598${stamp.slice(-6)}`,
    crNumber: `7${stamp}00`,
    taxNumber: `3${stamp}000000`,
    workingHours: '٨ ص - ٥ م',
    workingHoursEn: '8 AM - 5 PM',
    warehouses: [
      {
        name: 'مستودع الرياض',
        nameEn: 'Riyadh Warehouse',
        locationLink: 'https://maps.google.com/?q=24.7136,46.6753',
        phone: `0597${stamp.slice(-6)}`,
      },
      {
        name: 'مستودع جدة',
        nameEn: 'Jeddah Warehouse',
        locationLink: 'https://maps.google.com/?q=21.4858,39.1925',
        phone: `0596${stamp.slice(-6)}`,
      },
    ],
  };
}

/** Form inputs the create form must refuse, with the error each one shows. */
export function invalidCompanyCases(valid: CompanyData): {
  name: string;
  data: Partial<CompanyData>;
  error: string;
}[] {
  const { invalid, required } = supplierCompanyText;
  const warehouse = valid.warehouses[0];
  return [
    { name: 'an invalid email', data: { email: 'not-an-email' }, error: invalid.email },
    {
      name: 'an email over 100 characters',
      data: { email: `${'a'.repeat(95)}@example.com` },
      error: invalid.email,
    },
    { name: 'a company phone with letters', data: { phone: '05abc12345' }, error: invalid.phone },
    { name: 'a too short company phone', data: { phone: '05123' }, error: invalid.phone },
    {
      name: 'Working Hours En over 255 characters',
      data: { workingHoursEn: 'h'.repeat(256) },
      error: invalid.workingHoursEnTooLong,
    },
    {
      name: 'a location link without http(s)',
      data: { warehouses: [{ ...warehouse, locationLink: 'maps.google.com/x' }] },
      error: invalid.locationLink,
    },
    {
      name: 'a warehouse phone with letters',
      data: { warehouses: [{ ...warehouse, phone: 'abc' }] },
      error: invalid.phone,
    },
    { name: 'names of only spaces', data: { name: '   ', nameEn: '   ' }, error: required.nameEn },
  ];
}

/** Inputs whose length or characters are limited while typing (nothing is saved). */
export const typingLimits = [
  {
    name: 'Tax Number drops letters',
    field: 'taxNumber',
    typed: '3AB4',
    kept: '34',
  },
  {
    name: 'Tax Number stops at 20 digits',
    field: 'taxNumber',
    typed: '3'.repeat(21),
    kept: '3'.repeat(20),
  },
  {
    name: 'Commercial Registration Number stops at 50 characters',
    field: 'crNumber',
    typed: '7'.repeat(51),
    kept: '7'.repeat(50),
  },
  {
    name: 'Company Name Ar stops at 255 characters',
    field: 'name',
    typed: 'ش'.repeat(256),
    kept: 'ش'.repeat(255),
  },
  {
    name: 'Company Name En stops at 255 characters',
    field: 'nameEn',
    typed: 'A'.repeat(256),
    kept: 'A'.repeat(255),
  },
] as const;

/**
 * Whether a row is a QA-AUTO test company. The CRUD spec adds and deletes one while the other
 * specs run in parallel, so read-only checks leave these rows out of their comparisons.
 */
export function isTestCompany(row: { name: string; nameEn: string }): boolean {
  return row.name.startsWith(testRecordPrefix) || row.nameEn.startsWith(testRecordPrefix);
}

/** URL patterns, matched against the full page URL. */
export const supplierCompanyUrls = {
  list: /\/backend\/company\/company\/index(\?|$)/,
  create: /\/backend\/company\/company\/create$/,
  update: /\/backend\/company\/company\/update\?id=\d+$/,
} as const;
