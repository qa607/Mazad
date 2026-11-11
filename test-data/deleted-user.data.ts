import { uniqueDigits } from '@utils/unique';
import { testRecordPrefix } from '@test-data/backend-common.data';

/**
 * Mazad Backend > Users > Individual, Dealers and Deleted Users: deleting customers, the
 * Deleted Users list, and who may delete. Messages and rules were read from the staging Backend
 * on 2026-11-10, not assumed.
 *
 * Every customer a test deletes is a QA-AUTO user made by that test. Deleted users stay in
 * Deleted Users for good (there is no restore or purge), so each run adds a few QA-AUTO rows.
 *
 * Create Individual never saves on staging (its validation asks for a hidden "User" field and
 * the form returns with no message), so test individuals are created as dealers and converted
 * with the Dealers list's "Convert user type" action.
 */
export const deletedUserText = {
  deletedUsersTitle: 'Deleted Users',
  individualsTitle: 'INDIVIDUAL',
  dealersTitle: 'Dealers',
  emptyState: 'No results found.',
  deleteConfirmation: 'Are you sure to delete this item?',
  individualDeleted: 'Individual has been deleted successfully',
  dealerDeleted: 'Dealer has been deleted successfully',
  convertQuestion: (name: string) =>
    `This account for ${name} will convert the type to Individual.`,
  converted: 'Conversion process has been completed successfully.',
  forbidden: 'Forbidden (#403)',
  userTypePlaceholder: 'User Type',
} as const;

/** Customer sections that offer Delete, with their list path and flash message. */
export const customerSections = {
  individual: {
    label: 'Individual',
    path: '/backend/users/individual/index',
    deletedMessage: deletedUserText.individualDeleted,
    /** Value of the Deleted Users "User Type" filter, and how the grid shows the type. */
    userType: { value: 'individual_customer', shown: 'Individual' },
    deleteRoute: '/users/individual/delete',
  },
  dealer: {
    label: 'Dealers',
    path: '/backend/users/dealer/index',
    deletedMessage: deletedUserText.dealerDeleted,
    userType: { value: 'company_customer', shown: 'Dealer' },
    deleteRoute: '/users/dealer/delete',
  },
} as const;
export type CustomerSection = keyof typeof customerSections;

/** Labels of the Deleted Users search form, in order. */
export const deletedUserFilterLabels = [
  'Phone',
  'Arabic Name',
  'English Name',
  'Email',
  'Relation Rep Name',
  'Ref Number (TXN_ID)',
  'User Type',
  'Joining Date',
] as const;

/** Deleted Users grid columns in display order. There is no Actions column. */
export const deletedUserColumns = [
  '#',
  'ID',
  'Arabic Name',
  'English Name',
  'Phone',
  'Email',
  'User Type',
  'Relation Rep Name',
  'Joining Date',
] as const;
export type DeletedUserColumn = (typeof deletedUserColumns)[number];

/** Sortable columns and their sort keys. */
export const deletedUserSortableColumns = { ID: 'id', 'Joining Date': 'created_at' } as const;
export type DeletedUserSortableColumn = keyof typeof deletedUserSortableColumns;

/** Rows per page of the default list. */
export const defaultPageSize = 20;

/**
 * Roles used by the permission tests. Auction Supervisor has Delete on Individual and Dealers
 * (its two delete permissions are unticked and ticked back during the run, as approved on
 * 2026-11-10). Data Analysis can open both lists but has no Delete and no Deleted Users.
 */
export const permissionRoles = {
  withDelete: 'Auction Supervisor',
  withoutDelete: 'Data Analysis',
} as const;

/** Text filter values that must not break the page (an emoji answers 500, see the report). */
export const unusualFilterValues = [
  { name: 'a single quote', value: "O'Brien" },
  { name: 'a percent sign', value: '%' },
  { name: 'SQL-like text', value: "' OR 1=1 --" },
  { name: 'a script tag', value: '<script>alert(1)</script>' },
] as const;

export const noMatchName = 'zzqq-no-such-deleted-user';

export interface CustomerData {
  name: string;
  nameEn: string;
  phone: string;
  email: string;
  password: string;
  /** Dealer profile National ID (required on the dealer form). */
  nationalId: string;
}

/** A new, unique QA-AUTO customer; `kind` only shapes the names. */
export function newTestCustomer(kind: CustomerSection): CustomerData {
  const stamp = uniqueDigits(6);
  const isDealer = kind === 'dealer';
  return {
    name: `${testRecordPrefix} ${isDealer ? 'تاجر' : 'فرد'} ${stamp}`,
    nameEn: `${testRecordPrefix} ${isDealer ? 'Dealer' : 'Individual'} ${stamp}`,
    phone: `${isDealer ? '0592' : '0591'}${stamp}`,
    email: `qa.auto.${kind}.${stamp}@example.com`,
    password: 'QaAuto#2026',
    nationalId: `10${stamp}${isDealer ? '22' : '11'}`,
  };
}

/** Whether a row is a QA-AUTO test customer. */
export function isTestCustomer(row: { 'English Name': string }): boolean {
  return row['English Name'].startsWith(testRecordPrefix);
}

/** City picked on the dealer form (any city works). */
export const testCityId = '76';

export const deletedUserUrls = {
  deletedUsers: /\/backend\/users\/deleted-user\/index(\?|$)/,
  individuals: /\/backend\/users\/individual\/index(\?|$)/,
  dealers: /\/backend\/users\/dealer\/index(\?|$)/,
} as const;
