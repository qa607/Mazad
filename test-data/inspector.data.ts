/**
 * Mazad Backend > Users > Inspectors test data. Read from the staging Backend (stg-154) on
 * 2026-11-11, from the live UI, the Permissions list and the Roles pages, not assumed.
 *
 * Inspectors are vehicle inspection accounts. The Backend only lists them and shows each one:
 * the Permissions list has /users/inspector/index, /users/inspector/view and /users/inspector/*
 * only, the list has no Create button, rows have View only, the View page has no Update or
 * Delete, and /create and /update?id= answer 404 even for a real inspector. So inspectors are
 * created and changed outside the Backend; the suites only read the real ones (23 on staging).
 *
 * The server still has a Delete action (a POST to /users/inspector/delete answers "The requested
 * page does not exist." for an unknown ID, as a working delete route does, and "Missing required
 * parameters: id" without one). It is not offered anywhere in the UI, and there is no test
 * inspector to delete, so the suites never call it.
 *
 * No role (operation roles, superAdmin, supplier roles) has a /users/inspector route ticked, not
 * even through a wildcard; only Dev Root opens the page. Other accounts are sent to the Backend
 * Home page (as on the QC page) and see no inspector data.
 *
 * An emoji in a text filter answers 500 (a Database Exception), the same issue the business
 * chose to ignore on the other Users pages, so it is not asserted.
 */
export const inspectorText = {
  listTitle: 'Inspector',
  /** Breadcrumb link back to the list on the View page. */
  viewBreadcrumbParent: 'Inspector',
  viewSection: "Inspector Information's",
  emptyState: 'No results found.',
  statusPlaceholder: 'Choose Status',
  /** Heading of the Backend Home page, where accounts without inspector permission are sent. */
  homeTitle: 'Mazad V3',
  notFound: 'Not Found (#404)',
  exportConfirmation: 'The CSV export file will be generated for download.',
} as const;

/** Labels of the search form, in order. */
export const inspectorFilterLabels = [
  'Phone',
  'Arabic Name',
  'English Name',
  'Email',
  'Status',
] as const;

/** Grid columns in display order (the Actions column is left out). */
export const inspectorColumns = [
  '#',
  'ID',
  'Arabic Name',
  'English Name',
  'Status',
  'Email',
  'Phone',
  'Created At',
] as const;
export type InspectorColumn = (typeof inspectorColumns)[number];

/** Sortable columns and their sort keys. */
export const inspectorSortableColumns = {
  ID: 'id',
  Phone: 'phone',
  'Created At': 'created_at',
} as const;
export type InspectorSortableColumn = keyof typeof inspectorSortableColumns;

export const inspectorStatuses = ['active', 'inactive'] as const;

/** Row actions, in order: View only (no Update, no Delete). */
export const inspectorRowActions = ['View'] as const;

/** Labels of the View page's read-only fields, in order. */
export const inspectorViewLabels = [
  'English Name',
  'Arabic Name',
  'Status',
  'Email',
  'Phone',
  'Created At',
  'Updated At',
] as const;

export const inspectorExportFormats = ['CSV', 'Excel 95 +', 'Excel 2007+'] as const;
/** Header of the CSV export: the grid columns. */
export const inspectorExportHeader = inspectorColumns;

/** Rows per page of the default list. */
export const defaultPageSize = 20;
/** Query that shows every inspector on one page. */
export const allOnOnePage = { 'per-page': '200' } as const;

/** Text filter values that must not break the page (an emoji answers 500, ignored). */
export const unusualFilterValues = [
  { name: 'a single quote', value: "O'Brien" },
  { name: 'a percent sign', value: '%' },
  { name: 'an underscore', value: '_' },
  { name: 'SQL-like text', value: "' OR 1=1 --" },
  { name: 'a script tag', value: '<script>alert(1)</script>' },
  { name: '500 characters', value: 'a'.repeat(500) },
] as const;

/** A filter value no inspector matches. */
export const noMatchName = 'zzqq-no-such-inspector';
/** An ID no inspector has. */
export const unknownInspectorId = '99999999';

/**
 * Operation roles used for the access checks: none has a /users/inspector route. Marketing has
 * the fewest permissions; Auction Supervisor is among the most and has the inspection lists.
 */
export const rolesWithoutInspectorAccess = ['Marketing', 'Auction Supervisor'] as const;

/** URL patterns, matched against the full page URL. */
export const inspectorUrls = {
  list: /\/backend\/users\/inspector\/index(\?|$)/,
  view: (id: string) => new RegExp(`/backend/users/inspector/view\\?id=${id}$`),
  login: /\/backend\/authentication\/login/,
  /** The Backend Home page. */
  home: /\/backend\/(site\/index)?$/,
} as const;

/** Paths of the inspector pages for one record, as an unauthorised user would open them. */
export const inspectorPagePaths = (id: string) => [
  '/backend/users/inspector/index',
  `/backend/users/inspector/view?id=${id}`,
];

/** Pages the app does not have for inspectors (GET only), with the record ID to use. */
export const missingInspectorPages = (id: string) => [
  { name: 'Create', path: 'create' },
  { name: 'Update', path: `update?id=${id}` },
];
