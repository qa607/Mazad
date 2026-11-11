import { uniqueDigits } from '@utils/unique';
import { testRecordPrefix } from '@test-data/backend-common.data';

/**
 * Mazad Backend > Users > Super Admins test data. Messages and rules were read from the staging
 * Backend on 2026-11-10 (the live UI and its server validation), not assumed.
 *
 * Staging has four real Super Admins (staff accounts). The suites only read them; every record
 * a test creates, edits or deletes is a QA-AUTO admin made by that test.
 *
 * Super Admins get the superAdmin role, which has no /users/admin/* or /access/role/*
 * permission: only Dev Root (root) manages admins. The access spec asserts that rule.
 *
 * Findings the business chose to ignore (2026-11-10) are deliberately not asserted: HTML in the
 * English Name runs in the View/Update breadcrumb, a deleted admin's open session keeps working,
 * a deleted admin's email stays taken, an emoji filter answers 500, a deleted admin's View page
 * still opens, and the export writes phones as 9665xxxxxxxx.
 */
export const superAdminText = {
  listTitle: 'Admins',
  sidebarLabel: 'Super Admins',
  createTitle: 'Create Admin',
  /** The edit page title is this prefix and the admin's English name. */
  updateTitlePrefix: 'Update Admin: ',
  formSection: "Admin Information's",
  emptyState: 'No results found.',
  statusPlaceholder: 'Choose Status',
  deleteConfirmation: 'Are you sure to delete this item?',
  createdMessage: 'Admin has been created successfully.',
  updatedMessage: 'Admin has been updated successfully.',
  deletedMessage: 'Admin has been deleted successfully',
  forbidden: 'Forbidden (#403)',
  inactiveLogin: 'Inactive user please contact administrator.',
  wrongLogin: 'Incorrect username or password.',
  required: {
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
export const adminFilterLabels = [
  'Phone',
  'Arabic Name',
  'English Name',
  'Email',
  'Status',
] as const;

/** Grid columns in display order (the Actions column is left out). */
export const adminColumns = [
  '#',
  'ID',
  'Arabic Name',
  'English Name',
  'Status',
  'Email',
  'Phone',
  'Created At',
] as const;
export type AdminColumn = (typeof adminColumns)[number];

/** Sortable columns and their sort keys. */
export const adminSortableColumns = {
  ID: 'id',
  Phone: 'phone',
  'Created At': 'created_at',
} as const;
export type AdminSortableColumn = keyof typeof adminSortableColumns;

export const adminStatuses = ['active', 'inactive'] as const;
export type AdminStatus = (typeof adminStatuses)[number];

/** Row actions, in order. */
export const adminRowActions = ['View', 'Update', 'Delete'] as const;

/** Labels of the View page's read-only fields, in order. */
export const adminViewLabels = [
  'English Name',
  'Arabic Name',
  'Status',
  'Email',
  'Phone',
  'Created At',
  'Updated At',
] as const;

export const adminExportFormats = ['CSV', 'Excel 95 +', 'Excel 2007+'] as const;

/** Rows per page used by the paging tests (staging has only a handful of admins). */
export const pagingSize = 2;
/** Large enough to show every admin on one page. */
export const allOnOnePage = 100;

/**
 * Text filter values that must not break the page. An emoji answers HTTP 500 (ignored,
 * 2026-11-10, same behaviour as Supplier Members), so it is left out here.
 */
export const unusualFilterValues = [
  { name: 'a single quote', value: "O'Brien" },
  { name: 'a percent sign', value: '%' },
  { name: 'an underscore', value: '_' },
  { name: 'SQL-like text', value: "' OR 1=1 --" },
  { name: 'a script tag', value: '<script>alert(1)</script>' },
  { name: '500 characters', value: 'a'.repeat(500) },
] as const;

/** A filter value no admin matches. */
export const noMatchName = 'zzqq-no-such-admin';
/** An ID no admin has. */
export const unknownAdminId = '99999999';

export interface SuperAdminData {
  name: string;
  nameEn: string;
  status: AdminStatus;
  phone: string;
  email: string;
  password: string;
}

/** A new, unique QA-AUTO admin (phone and email must be unique across all users). */
export function newTestAdmin(): SuperAdminData {
  const stamp = uniqueDigits(6);
  return {
    name: `${testRecordPrefix} مشرف ${stamp}`,
    nameEn: `${testRecordPrefix} Admin ${stamp}`,
    status: 'active',
    phone: `0599${stamp}`,
    email: `qa.auto.admin.${stamp}@example.com`,
    password: 'QaAuto#2026',
  };
}

/** Form inputs the create form must refuse, with the error each one shows. */
export function invalidAdminCases(valid: SuperAdminData): {
  name: string;
  data: Partial<SuperAdminData>;
  confirm?: string;
  error: string;
}[] {
  const { invalid, required } = superAdminText;
  return [
    { name: 'an invalid email', data: { email: 'not-an-email' }, error: invalid.email },
    {
      name: 'an email over 255 characters',
      data: { email: `${'a'.repeat(244)}@example.com` },
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
 * Whether a row is a QA-AUTO test admin. The CRUD and access specs add and delete these while
 * the other specs run in parallel, so read-only checks leave them out of their comparisons.
 */
export function isTestAdmin(row: { 'English Name': string }): boolean {
  return row['English Name'].startsWith(testRecordPrefix);
}

/** URL patterns, matched against the full page URL. */
export const superAdminUrls = {
  list: /\/backend\/users\/admin\/index(\?|$)/,
  create: /\/backend\/users\/admin\/create$/,
  update: /\/backend\/users\/admin\/update\?id=\d+$/,
  login: /\/backend\/authentication\/login/,
} as const;
