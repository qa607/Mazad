/**
 * Mazad Backend > Users > QC test data. Read from the staging Backend (stg-154) on 2026-11-10,
 * from the live UI and the Roles page, not assumed.
 *
 * QC accounts are quality-control inspectors. The Backend only lists them and shows each one:
 * the app has the routes /users/qc/index and /users/qc/view (plus /users/qc/*) and no create,
 * update or delete, so QC accounts are created outside the Backend. Staging has 2 real QC
 * accounts; the suites only read them. By the user's decision (2026-11-10) the suites test
 * reading only and never request create, update or delete routes.
 *
 * No operation role (Marketing ... Auction Supervisor) has any /users/qc route ticked; only
 * Dev Root opens the page; other accounts are sent to the Backend Home page (not a 403 as on the
 * Operations or Super Admins pages) and see no QC data. A QC account must not be able to sign in
 * to the Backend.
 *
 * An emoji in a text filter answers 500 (a Database Exception), the same issue the business
 * chose to ignore on the other Users pages, so it is not asserted.
 */
export const qcText = {
  listTitle: 'QC',
  /** Breadcrumb link back to the list on the View page (spelled "Qc" there). */
  viewBreadcrumbParent: 'Qc',
  /** Heading of the View page's section (shared with the Inspectors page). */
  viewSection: "Inspector Information's",
  emptyState: 'No results found.',
  statusPlaceholder: 'Choose Status',
  /** Heading of the Backend Home page, where accounts without QC permission are sent. */
  homeTitle: 'Mazad V3',
  notFound: 'Not Found (#404)',
  exportConfirmation: 'The CSV export file will be generated for download.',
} as const;

/** Labels of the search form, in order. */
export const qcFilterLabels = ['Phone', 'Arabic Name', 'English Name', 'Email', 'Status'] as const;

/** Grid columns in display order (the Actions column is left out). */
export const qcColumns = [
  '#',
  'ID',
  'Arabic Name',
  'English Name',
  'Status',
  'Email',
  'Phone',
  'Created At',
] as const;
export type QcColumn = (typeof qcColumns)[number];

/** Sortable columns and their sort keys. */
export const qcSortableColumns = {
  ID: 'id',
  Phone: 'phone',
  'Created At': 'created_at',
} as const;
export type QcSortableColumn = keyof typeof qcSortableColumns;

export const qcStatuses = ['active', 'inactive'] as const;

/** Row actions, in order: View only (no Update, no Delete). */
export const qcRowActions = ['View'] as const;

/** Labels of the View page's read-only fields, in order. */
export const qcViewLabels = [
  'English Name',
  'Arabic Name',
  'Status',
  'Email',
  'Phone',
  'Created At',
  'Updated At',
] as const;

export const qcExportFormats = ['CSV', 'Excel 95 +', 'Excel 2007+'] as const;
/** Header of the CSV export: the grid columns. */
export const qcExportHeader = qcColumns;

/** Text filter values that must not break the page (an emoji answers 500, ignored). */
export const unusualFilterValues = [
  { name: 'a single quote', value: "O'Brien" },
  { name: 'a percent sign', value: '%' },
  { name: 'SQL-like text', value: "' OR 1=1 --" },
  { name: 'a script tag', value: '<script>alert(1)</script>' },
] as const;

/** A filter value no QC account matches. */
export const noMatchName = 'zzqq-no-such-qc';
/** An ID no QC account has. */
export const unknownQcId = '99999999';

/**
 * Operation roles used for the access checks: none of them has a /users/qc route. Marketing has
 * the fewest permissions and Auction Supervisor among the most.
 */
export const rolesWithoutQcAccess = ['Marketing', 'Auction Supervisor'] as const;

/** URL patterns, matched against the full page URL. */
export const qcUrls = {
  list: /\/backend\/users\/qc\/index(\?|$)/,
  view: (id: string) => new RegExp(`/backend/users/qc/view\\?id=${id}$`),
  login: /\/backend\/authentication\/login/,
  /** The Backend Home page. */
  home: /\/backend\/(site\/index)?$/,
} as const;

/** Paths of the QC pages for one record, as a signed-out or unauthorised user would open them. */
export const qcPagePaths = (id: string) => [
  '/backend/users/qc/index',
  `/backend/users/qc/view?id=${id}`,
];
