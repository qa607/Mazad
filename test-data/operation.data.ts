import { uniqueDigits } from '@utils/unique';
import { testRecordPrefix } from '@test-data/backend-common.data';

/**
 * Mazad Backend > Users > Operations test data. Messages and rules were read from the staging
 * Backend on 2026-11-10 (the live UI and its server validation), not assumed.
 *
 * Operations are back-office staff accounts. Staging has real ones, plus role test accounts
 * ("QA Operation", "QA Marketing", ...) used by the permission specs. The suites only read
 * those; every record a test creates, edits or deletes is a QA-AUTO operation made by that test.
 *
 * The page offers no Delete action (grid or View page), although the server's delete route
 * works. Tests delete their own records through that route (POST, as the page scripts would).
 *
 * Findings the business chose to ignore (2026-11-10) are deliberately not asserted as bugs: the
 * missing Delete action (asserted as the current behaviour), HTML in the English Name running in
 * the View breadcrumb, an emoji filter answering 500, a deleted operation's View/Update pages
 * still opening, and the export writing phones as 9665xxxxxxxx.
 */
export const operationText = {
  listTitle: 'Operations',
  createTitle: 'Create operation',
  /** The edit page title is this prefix and the Arabic name; the View title is the English name. */
  updateTitlePrefix: 'Update operation: ',
  formSection: "Operation Information's",
  emptyState: 'No results found.',
  statusPlaceholder: 'Choose Status',
  rolePlaceholder: 'Choose Role',
  createdMessage: 'Operation has been created successfully.',
  updatedMessage: 'Operation has been updated successfully.',
  deletedMessage: 'Operation has been deleted successfully',
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
    ccManager: (value: string) => `Invalid email address: ${value}`,
  },
  duplicate: {
    phone: 'Phone already exist',
    email: (value: string) => `Email "${value}" has already been taken.`,
  },
} as const;

/** Labels of the search form, in order. */
export const operationFilterLabels = [
  'Arabic Name',
  'English Name',
  'Phone',
  'Email',
  'Status',
] as const;

/** Grid columns in display order (the Actions column is left out). */
export const operationColumns = [
  '#',
  'ID',
  'Arabic Name',
  'English Name',
  'Status',
  'Email',
  'Phone',
  'Job Title',
  'Auto Assign Users',
  'Created At',
] as const;
export type OperationColumn = (typeof operationColumns)[number];

/** Sortable columns and their sort keys. */
export const operationSortableColumns = {
  ID: 'id',
  Phone: 'phone',
  'Created At': 'created_at',
} as const;
export type OperationSortableColumn = keyof typeof operationSortableColumns;

export const operationStatuses = ['active', 'inactive'] as const;
export type OperationStatus = (typeof operationStatuses)[number];

/** Roles offered by the Operation Role dropdown ("Job Title" in the grid), in order. */
export const operationRoles = [
  'Assistant Auction Supervisor',
  'Auction Supervisor',
  'Auction Team',
  'Content',
  'Customer Support',
  'Data Analysis',
  'Director',
  'Finance',
  'Logistics',
  'Marketing',
  'UI/UX',
] as const;
export type OperationRole = (typeof operationRoles)[number];

/** Row actions, in order. There is no Delete. */
export const operationRowActions = ['View', 'Update'] as const;

/** Labels of the create and edit form, in order. */
export const operationFormLabels = [
  'Arabic Name',
  'English Name',
  'Operation Role',
  'Status',
  'Phone',
  'Email',
  'CC Manager',
  'New Password',
  'Confirm the new password',
] as const;

/** Labels of the View page's read-only fields, in order. */
export const operationViewLabels = [
  'English Name',
  'Arabic Name',
  'Operation Role',
  'Status',
  'Email',
  'Phone',
  'CC Manager',
  'Created At',
  'Updated At',
] as const;

export const operationExportFormats = ['CSV', 'Excel 95 +', 'Excel 2007+'] as const;
/** Header of the CSV export, in order. */
export const operationExportHeader = [
  '#',
  'ID',
  'Arabic Name',
  'English Name',
  'Status',
  'Email',
  'Phone',
  'Job Title',
  'Created At',
] as const;

/** Rows per page of the default list. */
export const defaultPageSize = 20;
/** Large enough to show every operation on one page. */
export const allOnOnePage = 200;
/** CC Manager accepts at most this many characters while typing. */
export const ccManagerMaxLength = 1024;

/** Text filter values that must not break the page (an emoji answers 500, ignored). */
export const unusualFilterValues = [
  { name: 'a single quote', value: "O'Brien" },
  { name: 'a percent sign', value: '%' },
  { name: 'an underscore', value: '_' },
  { name: 'SQL-like text', value: "' OR 1=1 --" },
  { name: 'a script tag', value: '<script>alert(1)</script>' },
  { name: '500 characters', value: 'a'.repeat(500) },
] as const;

/** A filter value no operation matches. */
export const noMatchName = 'zzqq-no-such-operation';
/** An ID no operation has. */
export const unknownOperationId = '99999999';

export interface OperationData {
  name: string;
  nameEn: string;
  /** Empty string: no role. */
  role: OperationRole | '';
  status: OperationStatus;
  phone: string;
  email: string;
  /** Comma-separated emails; empty for none. */
  ccManager: string;
  password: string;
}

/** A new, unique QA-AUTO operation (phone and email must be unique across all users). */
export function newTestOperation(): OperationData {
  const stamp = uniqueDigits(6);
  return {
    name: `${testRecordPrefix} عمليات ${stamp}`,
    nameEn: `${testRecordPrefix} Operation ${stamp}`,
    // Marketing has the fewest permissions; it cannot even open the Operations pages.
    role: 'Marketing',
    status: 'active',
    phone: `0597${stamp}`,
    email: `qa.auto.op.${stamp}@example.com`,
    ccManager: 'qa.manager1@example.com, qa.manager2@example.com',
    password: 'QaAuto#2026',
  };
}

/** Form inputs the create form must refuse, with the error each one shows. */
export function invalidOperationCases(valid: OperationData): {
  name: string;
  data: Partial<OperationData>;
  confirm?: string;
  error: string;
}[] {
  const { invalid, required } = operationText;
  return [
    { name: 'an invalid email', data: { email: 'not-an-email' }, error: invalid.email },
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
    {
      name: 'a CC Manager that is not an email',
      data: { ccManager: 'not-an-email' },
      error: invalid.ccManager('not-an-email'),
    },
    {
      name: 'a CC Manager list with one bad email',
      data: { ccManager: 'qa.manager1@example.com, bad' },
      error: invalid.ccManager('bad'),
    },
  ];
}

/**
 * Whether a row is a QA-AUTO test operation. The CRUD and access specs add and delete these
 * while the other specs run in parallel, so read-only checks leave them out of comparisons.
 */
export function isTestOperation(row: { 'English Name': string }): boolean {
  return row['English Name'].startsWith(testRecordPrefix);
}

/** URL patterns, matched against the full page URL. */
export const operationUrls = {
  list: /\/backend\/users\/operation\/index(\?|$)/,
  create: /\/backend\/users\/operation\/create$/,
  update: /\/backend\/users\/operation\/update\?id=\d+$/,
  login: /\/backend\/authentication\/login/,
} as const;
