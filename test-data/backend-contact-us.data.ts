import type { AccessProfile } from '@test-data/backend-permissions.data';

/**
 * Mazad Backend "Contact us" (/backend/contactUs/contact-us/index) test data.
 * The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const contactUsText = {
  pageTitle: 'Contact us',
  sidebarLabel: 'Contact us',
  noResults: 'No results found.',
  /** Grid header labels, in column order. */
  columnHeaders: [
    'ID',
    'Type',
    'Name',
    'Mobile Number',
    'Email',
    'Company Name',
    'Created At',
    'Actions',
  ],
  /** Labels of a message's View page, in order. */
  viewLabels: [
    'ID',
    'Type',
    'Name',
    'Mobile Number',
    'Email',
    'Company Name',
    'Message',
    'Created At',
  ],
  deleteConfirm: 'Are you sure to delete this item?',
  notSet: '(not set)',
  /** CSV export columns, in order (the message is exported though not shown in the grid). */
  csvHeaders: [
    'ID',
    'Type',
    'Name',
    'Mobile Number',
    'Email',
    'Company Name',
    'Created At',
    'Message',
  ],
} as const;

export const contactUsData = {
  /** Message ID that does not exist, for the refused delete request. */
  missingId: '0',
  unknownEmail: 'qa.nobody.zz@example.invalid',
  emailFormat: /^\S+@\S+\.\S+$/,
  pageSize: 20,
} as const;

/** URL patterns, matched against the full page URL. */
export const contactUsUrls = {
  list: /\/backend\/contactUs\/contact-us\/index(\?|$)/,
  view: (id: string) => new RegExp(`/backend/contactUs/contact-us/view\\?id=${id}$`),
  viewPath: (id: string) => `/backend/contactUs/contact-us/view?id=${id}`,
  deletePath: (id: string) => `/backend/contactUs/contact-us/delete?id=${id}`,
  csvFileName: /^Contact us \d{4}-\d{2}-\d{2}\.csv$/,
} as const;

/**
 * Who can list, view and delete messages, from each role's permissions page (2026-11-08). No
 * role grants delete on its own; Dev Root's Delete comes with its account. The delete request is
 * sent only to accounts that must be refused, with a non-existent ID.
 */
export const contactUsAccess: Record<
  AccessProfile,
  { list: boolean; view: boolean; delete: boolean }
> = {
  devRoot: { list: true, view: true, delete: true },
  auctionSupervisor: { list: true, view: true, delete: false },
  customerSupport: { list: true, view: true, delete: false },
  auctionTeam: { list: false, view: false, delete: false },
  operation: { list: false, view: false, delete: false },
  noAuctionAccess: { list: false, view: false, delete: false },
  supplier: { list: false, view: false, delete: false },
};
