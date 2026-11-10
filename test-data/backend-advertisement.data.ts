import type { AccessProfile } from '@test-data/backend-permissions.data';

/**
 * Mazad Backend "Advertisements" (/backend/advertisement/advertisement/index) test data.
 * The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const advertisementText = {
  pageTitle: 'Advertisements',
  sidebarLabel: 'Advertisement',
  createTitle: 'Create Advertisement',
  noResults: 'No results found.',
  /** Grid header labels, in column order (the actions column has no label). */
  columnHeaders: [
    'Id',
    'Title',
    'Title En',
    'Click Count',
    'Is Published',
    'Created At',
    'Updated At',
    '',
  ],
  /** Labels of an advertisement's View page, in order. */
  viewLabels: [
    'Id',
    'Title',
    'Title En',
    'Sub Title',
    'Sub Title En',
    'Btn Text',
    'Btn Text En',
    'Btn Link',
    'Btn Link En',
    'Link Type',
    'Image',
    'Image En',
    'Platform',
    'Color',
    'Is Published',
    'Click Count',
    'End Date',
    'Created At',
    'Updated At',
    'Deleted',
  ],
  /** Required fields of the Create form and their messages, by input id. */
  requiredFields: {
    'advertisement-title': 'Title cannot be blank.',
    'advertisement-title_en': 'Title En cannot be blank.',
    'advertisement-sub_title': 'Sub Title cannot be blank.',
    'advertisement-sub_title_en': 'Sub Title En cannot be blank.',
    'advertisement-btn_text': 'Btn Text cannot be blank.',
    'advertisement-btn_text_en': 'Btn Text En cannot be blank.',
    'advertisement-btn_link': 'Btn Link cannot be blank.',
    'advertisement-btn_link_en': 'Btn Link En cannot be blank.',
    'advertisement-link_type': 'Link Type cannot be blank.',
    'advertisement-end_date': 'End Date cannot be blank.',
  },
  /** An end date the database could not store as a real date. */
  invalidDate: '0000-00-00',
} as const;

/** URL patterns, matched against the full page URL. */
export const advertisementUrls = {
  list: /\/backend\/advertisement\/advertisement\/index(\?|$)/,
  create: /\/backend\/advertisement\/advertisement\/create$/,
  view: (id: string) => new RegExp(`/backend/advertisement/advertisement/view\\?id=${id}$`),
  update: (id: string) => new RegExp(`/backend/advertisement/advertisement/update\\?id=${id}$`),
  /** The list's Is Published switch posts here. */
  publishEndpoint: '/backend/advertisement/ajax/update-is-published',
} as const;

/**
 * Who can manage advertisements, from each role's permissions page (2026-11-08). The publish
 * request is sent only to roles that must be refused, with an ID that does not exist.
 */
export const advertisementAccess: Record<AccessProfile, boolean> = {
  devRoot: true,
  auctionSupervisor: true,
  customerSupport: false,
  auctionTeam: false,
  operation: false,
  // To confirm: Marketing has no access to advertisements.
  noAuctionAccess: false,
  supplier: false,
};
