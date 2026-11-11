import { testRecordPrefix } from '@test-data/backend-common.data';
import { uniqueDigits } from '@utils/unique';

/**
 * Mazad Backend "Traffic Offices" (Global Settings > Traffic Office,
 * /backend/trafficOffice/traffic-office/index) test data. Labels, messages and limits were read
 * from the staging Backend (stg-154) on 2026-11-11: the live UI and the form's client
 * validation rules. The Backend has no localization, so its UI text lives here.
 *
 * Behaviour accepted as intended (tests assert it, so a change shows up as a failure):
 * - Office Name (Arabic) and Office Name En are required, at most 100 characters each.
 * - Saving a new or edited office opens its View page, whose heading is the Office Name En.
 * - A new office is published and listed first.
 * - The name searches match part of the value, ignoring case.
 * - The grid has View and Update actions (both open a new tab) and no Delete; an office is
 *   deleted from its View page, after the browser's own confirm().
 * - The list has 19 offices (2026-11-11), so no pager; no column is sortable.
 */

export const trafficOfficeText = {
  /** Sidebar item under Global Settings (singular, unlike the page title). */
  sidebarParent: 'Global Settings',
  sidebarLabel: 'Traffic Office',
  listTitle: 'Traffic Offices',
  createTitle: 'Create Traffic Office',
  createButton: 'Create Traffic Office',
  updateTitle: (nameEn: string) => `Update: ${nameEn}`,
  officeNameRequired: 'Office Name cannot be blank.',
  officeNameEnRequired: 'Office Name En cannot be blank.',
  deleteConfirm: 'Are you sure you want to delete this item?',
  noResults: 'No results found.',
  /** Status filter placeholder. */
  statusPlaceholder: 'Status',
} as const;

/** Grid header labels, in display order. */
export const trafficOfficeColumns = [
  '#',
  'Office Name',
  'Office Name En',
  'Status',
  'Actions',
] as const;

/** Search form labels, in display order. */
export const trafficOfficeFilters = ['Office Name', 'Office Name En', 'Status'] as const;

/** Row actions of the grid, in display order. */
export const trafficOfficeRowActions = ['View', 'Update'] as const;

/** Formats offered by Export All. */
export const trafficOfficeExportFormats = ['CSV', 'Excel 95 +', 'Excel 2007+'] as const;

/** Status filter options: label and the value each row's status dropdown holds. */
export const trafficOfficeStatuses = [
  { label: 'Publish', value: 'publish' },
  { label: 'Unpublish', value: 'un-publish' },
] as const;

/** Labels of the View page, in display order. */
export const trafficOfficeViewLabels = [
  'ID',
  'Office Name',
  'Office Name En',
  'Status',
  'Created At',
  'Updated At',
] as const;

export const trafficOfficeLimits = { nameMax: 100 } as const;

export interface TrafficOfficeData {
  /** Arabic name. */
  officeName: string;
  officeNameEn: string;
}

/** Prefix of every office this suite creates; clean-up deletes them by exact Office Name En. */
export const testTrafficOfficePrefix = `${testRecordPrefix} TO`;

/** A new, unique office: "QA-AUTO TO 1234567 مكتب" / "QA-AUTO TO 1234567 Office". */
export function newTrafficOffice(): TrafficOfficeData {
  const stamp = uniqueDigits(7);
  return {
    officeName: `${testTrafficOfficePrefix} ${stamp} مكتب`,
    officeNameEn: `${testTrafficOfficePrefix} ${stamp} Office`,
  };
}

/** The changes the update test makes to an office. */
export function editedTrafficOffice(office: TrafficOfficeData): TrafficOfficeData {
  return { officeName: `${office.officeName} معدل`, officeNameEn: `${office.officeNameEn} edited` };
}

/** Search values. */
export const trafficOfficeSearchData = {
  unknownName: 'zz-no-such-office-zz',
  /**
   * Part of a test office's Office Name En in another letter case, from "TO" to the end
   * ("to 1234567 office"): unique to that office and still a partial, case-changed match.
   */
  partialNameEn: (nameEn: string): string => nameEn.slice(nameEn.indexOf('TO')).toLowerCase(),
  /** Part of a test office's Arabic name: its stamp and the Arabic word. */
  partialName: (name: string): string => name.slice(name.indexOf('TO ') + 3),
} as const;

/** The Ajax "index" box: it toggles this route (the grid's status dropdown). */
const ajaxStatusRoute = '/trafficOffice/ajax/update-traffic-office';

/**
 * Traffic Office permissions a role needs for full access, as titled on the role's permission
 * page (/backend/access/role/view-permission?id=<role>). The "*" wildcards are not used: they
 * would grant more than these.
 *
 * The Ajax "index" box (name trafficOffice/ajax_index) toggles ajaxStatusRoute, but after a
 * reload it does not always show whether the role has that route: on 2026-11-11 it showed
 * ticked right after the server replied "permission removed", in other runs unticked. The team
 * accepts this as intended behaviour, so its state is judged by the server's reply only; the
 * five Traffic-Office boxes show their real state.
 */
export const trafficOfficePermissions = {
  role: 'superAdmin',
  routes: [
    ajaxStatusRoute,
    '/trafficOffice/traffic-office/create',
    '/trafficOffice/traffic-office/delete',
    '/trafficOffice/traffic-office/index',
    '/trafficOffice/traffic-office/update',
    '/trafficOffice/traffic-office/view',
  ],
  ajaxStatusRoute,
  /** Routes whose checkbox shows whether the role has them. */
  displayedRoutes: [
    '/trafficOffice/traffic-office/create',
    '/trafficOffice/traffic-office/delete',
    '/trafficOffice/traffic-office/index',
    '/trafficOffice/traffic-office/update',
    '/trafficOffice/traffic-office/view',
  ],
} as const;

/** Replies of the permission page's toggle request. */
export const permissionReplies = {
  added: 'permission added',
  removed: 'permission removed',
} as const;

/** URL patterns, matched against the full page URL. */
export const trafficOfficeUrls = {
  list: /\/backend\/trafficOffice\/traffic-office\/index$/,
  create: /\/backend\/trafficOffice\/traffic-office\/create$/,
  update: (id: string) => new RegExp(`/backend/trafficOffice/traffic-office/update\\?id=${id}$`),
  view: (id: string) => new RegExp(`/backend/trafficOffice/traffic-office/view\\?id=${id}$`),
  anyView: /\/backend\/trafficOffice\/traffic-office\/view\?id=(\d+)$/,
} as const;
