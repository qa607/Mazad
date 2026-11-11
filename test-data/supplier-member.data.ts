import { uniqueDigits } from '@utils/unique';
import { testRecordPrefix } from '@test-data/backend-common.data';

/**
 * Mazad Backend > Users > Suppliers > Supplier Members test data. Messages and rules were read
 * from the staging Backend on 2026-11-09 (the live UI and its server validation), not assumed.
 *
 * Findings the business chose to ignore (2026-11-09) are deliberately not asserted: member
 * URLs opening non-member users, a 500 for emoji in filters, the 966 phone format in exports,
 * the View page labels, a deleted member's View page, and small UI issues.
 */
export const supplierMemberText = {
  listTitle: 'Supplier members',
  createTitle: 'Create Supplier member',
  /** The edit page title is this prefix and the member's Arabic name. */
  updateTitlePrefix: 'Update Supplier member: ',
  emptyState: 'No results found.',
  statusPlaceholder: 'Choose Status',
  deleteConfirmation: 'Are you sure to delete this item?',
  deletedMessage: 'Supplier Member has been deleted successfully',
  inactiveLogin: 'Inactive user please contact administrator.',
  required: {
    parent: 'Supplier Name cannot be blank.',
    name: 'Arabic Name cannot be blank.',
    nameEn: 'English Name cannot be blank.',
    status: 'Status cannot be blank.',
    phone: 'Phone cannot be blank.',
    newPassword: 'New Password cannot be blank.',
  },
  invalid: {
    email: 'Email is not a valid email address.',
    phone: 'The format of Phone is invalid.',
    phoneTooLong: 'Phone should contain at most 15 characters.',
    passwordTooShort: 'New Password should contain at least 6 characters.',
    passwordMismatch: 'The passwords do not match',
    nameEnTooLong: 'English Name should contain at most 100 characters.',
    nameTooLong: 'Arabic Name should contain at most 100 characters.',
  },
  duplicate: {
    phone: 'Phone already exist',
    email: (value: string) => `Email "${value}" has already been taken.`,
  },
} as const;

/** Labels of the search form, in order. */
export const memberFilterLabels = [
  'Phone',
  'Arabic Name',
  'English Name',
  'Email',
  'Status',
] as const;

/** Grid columns in display order (the Actions column is left out). */
export const memberColumns = [
  '#',
  'ID',
  'Supplier Name En',
  'Arabic Name',
  'English Name',
  'Status',
  'Email',
  'Phone',
  'Created At',
] as const;
export type MemberColumn = (typeof memberColumns)[number];

/** Sortable columns and their sort keys. */
export const memberSortableColumns = {
  ID: 'id',
  Phone: 'phone',
  'Created At': 'created_at',
} as const;
export type MemberSortableColumn = keyof typeof memberSortableColumns;

export const memberStatuses = ['active', 'inactive'] as const;
export type MemberStatus = (typeof memberStatuses)[number];

/** Row actions of an active member, in order (the permissions link has no title). */
export const memberRowActions = ['View', 'Update', 'Delete', 'Permission'] as const;

/** Sections of a member's permissions page. */
export const permissionSections = [
  'Auction',
  'Inspection',
  'Invoice',
  'Report',
  'Users',
  'Vehicle',
] as const;

export const memberExportFormats = [
  { format: 'CSV', extension: 'csv' },
  { format: 'Excel 95 +', extension: 'xls' },
  { format: 'Excel 2007+', extension: 'xlsx' },
] as const;

/** Rows per page used by the paging tests (the list has few members on staging). */
export const pagingSize = 5;
/** Large enough to show every member on one page. */
export const allOnOnePage = 200;

/** Text filter values that must not break the page (emoji is a known, ignored 500). */
export const unusualFilterValues = [
  { name: 'a single quote', value: "O'Brien" },
  { name: 'a percent sign', value: '%' },
  { name: 'an underscore', value: '_' },
  { name: 'SQL-like text', value: "' OR 1=1 --" },
  { name: 'a script tag', value: '<script>alert(1)</script>' },
  { name: 'a backslash', value: '\\' },
  { name: '500 characters', value: 'a'.repeat(500) },
] as const;

/** A filter value no member matches. */
export const noMatchName = 'zzqq-no-such-member';

/** Main supplier the test members are created under: the QA-AUTO test supplier. */
export const testParentSupplierId = '45784';

export interface SupplierMemberData {
  parentId: string;
  name: string;
  nameEn: string;
  status: MemberStatus;
  phone: string;
  email: string;
  password: string;
}

/** A new, unique test member (phone and email must be unique). */
export function newTestMember(): SupplierMemberData {
  const stamp = uniqueDigits(6);
  return {
    parentId: testParentSupplierId,
    name: `${testRecordPrefix} عضو ${stamp}`,
    nameEn: `${testRecordPrefix} Member ${stamp}`,
    status: 'active',
    phone: `0597${stamp}`,
    email: `qa.auto.member.${stamp}@example.com`,
    password: 'QaAuto#2026',
  };
}

/** Form inputs the create form must refuse, with the error each one shows. */
export function invalidMemberCases(valid: SupplierMemberData): {
  name: string;
  data: Partial<SupplierMemberData>;
  confirm?: string;
  error: string;
}[] {
  const { invalid, required } = supplierMemberText;
  return [
    { name: 'an invalid email', data: { email: 'not-an-email' }, error: invalid.email },
    {
      name: 'a too long email',
      data: { email: `${'a'.repeat(248)}@example.com` },
      error: invalid.email,
    },
    { name: 'a short phone', data: { phone: '05123' }, error: invalid.phone },
    { name: 'a phone with letters', data: { phone: '05abc12345' }, error: invalid.phone },
    { name: 'a phone not starting with 05', data: { phone: '0123456789' }, error: invalid.phone },
    { name: 'a too long phone', data: { phone: '05123456789012' }, error: invalid.phoneTooLong },
    { name: 'a short password', data: { password: '1' }, error: invalid.passwordTooShort },
    {
      name: 'a mismatching confirmation',
      data: {},
      confirm: `${valid.password}x`,
      error: invalid.passwordMismatch,
    },
    { name: 'an empty confirmation', data: {}, confirm: '', error: invalid.passwordMismatch },
    {
      name: 'an English Name over 100 characters',
      data: { nameEn: 'A'.repeat(101) },
      error: invalid.nameEnTooLong,
    },
    {
      name: 'an Arabic Name over 100 characters',
      data: { name: 'ع'.repeat(101) },
      error: invalid.nameTooLong,
    },
    { name: 'names of only spaces', data: { name: '   ', nameEn: '   ' }, error: required.nameEn },
  ];
}

/**
 * Whether a row is a QA-AUTO test member. The CRUD spec adds and deletes one while the other
 * specs run in parallel, so read-only checks leave these rows out of their comparisons.
 */
export function isTestMember(row: { 'English Name': string }): boolean {
  return row['English Name'].startsWith(testRecordPrefix);
}

/** URL patterns, matched against the full page URL. */
export const supplierMemberUrls = {
  list: /\/backend\/users\/supplier-member\/index(\?|$)/,
  create: /\/backend\/users\/supplier-member\/create$/,
} as const;
