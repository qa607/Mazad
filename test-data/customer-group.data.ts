import { testRecordPrefix } from '@test-data/backend-common.data';
import { uniqueDigits } from '@utils/unique';

/**
 * Mazad Backend "Customer Group" (/backend/customerGroup/customer-group/index) test data.
 * Messages, limits and behaviour were read from the staging Backend
 * (https://stg-mazad-v3-154.motory.dev) on 2026-11-09: the client validation rules in the page
 * source and the live UI, not assumed. The Backend has no localization, so its UI text lives
 * here rather than in src/locales.
 *
 * Behaviour accepted as intended (tests assert it, so a change shows up as a failure):
 * - Saving the Basic Info step (create or update) opens step 2, the group's member list.
 * - A name of only spaces counts as empty. (Spaces around a real name are kept: a known bug.)
 * - The name and notes inputs stop accepting characters at their maximum length.
 * - The name search matches part of the name, ignoring case.
 * - Only ID and No. Of Members are sortable.
 */
export const customerGroupText = {
  listTitle: 'Customer Groups',
  createTitle: 'Create Customer Group',
  viewTitle: (name: string) => `View : ${name}`,
  updateTitle: (name: string) => `Update : ${name}`,
  /** Heading of step 2, the group's member list. */
  membersHeading: 'Customer Group',
  /** Breadcrumb link from the details page back to the list. */
  breadcrumbList: 'Customer Group',
  steps: ['Basic Info', 'Customer'],
  created: 'Customer Groups has been created successfully',
  updated: 'Customer Groups has been updated successfully',
  deleted: 'Customer Groups has been deleted successfully',
  nameRequired: 'Name cannot be blank.',
  deleteConfirmMessage: 'Are you sure to delete this item?',
  noResults: 'No results found.',
  /** What the Backend shows for a group id that does not exist. */
  notFound: 'Not Found (#404)',
} as const;

/** Grid columns in display order. */
export const customerGroupColumns = ['#', 'ID', 'Name', 'No. Of Members', 'Actions'] as const;

/** Columns with a sort link, and the sort key each one puts in the URL. */
export const customerGroupSortableColumns = {
  ID: 'id',
  'No. Of Members': 'number_member',
} as const;

export type CustomerGroupSortableColumn = keyof typeof customerGroupSortableColumns;

/** Field limits from the form's validation rules (maxlength and the string validator). */
export const customerGroupLimits = {
  nameMax: 45,
  notesMax: 255,
} as const;

export interface CustomerGroupData {
  name: string;
  notes: string;
}

/** Prefix of every group this suite creates; clean-up deletes them by exact name. */
export const testCustomerGroupPrefix = `${testRecordPrefix} CG`;

/** A new, unique test group. */
export function newCustomerGroup(): CustomerGroupData {
  const stamp = uniqueDigits(7);
  return {
    name: `${testCustomerGroupPrefix} ${stamp}`,
    notes: `${testCustomerGroupPrefix} notes ${stamp}`,
  };
}

/** The changes the update test makes to a group. */
export function editedCustomerGroup(group: CustomerGroupData): CustomerGroupData {
  return { name: `${group.name} edited`, notes: `${group.notes} edited` };
}

/** Values for the form's boundary and edge cases. */
export const customerGroupEdgeCases = {
  /** Spaces only: the required rule trims, so this is an empty name. */
  whitespaceName: '     ',
  /** A unique name of exactly the maximum length. */
  longestName: (): string => `${newCustomerGroup().name} `.padEnd(customerGroupLimits.nameMax, 'x'),
  /** One character over each limit, to check the inputs stop at the limit. */
  tooLongName: 'n'.repeat(customerGroupLimits.nameMax + 1),
  tooLongNotes: 'n'.repeat(customerGroupLimits.notesMax + 1),
  /** HTML and quote characters that must be saved and shown as plain text. */
  specialCharacters: `<b>&"'</b>`,
  /** Notes that would open a dialog if the page ran them as script. */
  scriptNotes: '<script>alert(1)</script>',
  /** Spaces added around a name, which the form trims. */
  surroundingSpaces: '   ',
} as const;

/** Search values. */
export const customerGroupSearchData = {
  /** Matches no group. */
  unknownName: 'zz-no-such-group-zz',
  /** Characters of an existing name used for the partial, case-insensitive search. */
  partialLength: 4,
  /** Page size used to page through the short list one group at a time. */
  pagerPageSize: 1,
} as const;

/** URL patterns, matched against the full page URL. */
export const customerGroupUrls = {
  list: /\/backend\/customerGroup\/customer-group\/index(\?|$)/,
  /** The list with no search, sort or page in the URL. */
  unfiltered: /\/backend\/customerGroup\/customer-group\/index$/,
  create: /\/backend\/customerGroup\/customer-group\/create$/,
  update: (id: string) => new RegExp(`/backend/customerGroup/customer-group/update\\?id=${id}$`),
  view: (id: string) => new RegExp(`/backend/customerGroup/customer-group/view\\?id=${id}$`),
  /** Step 2 (member list) of a group, opened after saving the Basic Info step. */
  members: (id: string) =>
    new RegExp(`/backend/customerGroup/group-member/create\\?group_id=${id}$`),
  anyMembers: /\/backend\/customerGroup\/group-member\/create\?group_id=(\d+)$/,
  nameSearch: /CustomerGroupSearch%5Bname%5D=/,
  sortedBy: (key: string) => new RegExp(`[?&]sort=${key}(&|$)`),
} as const;
