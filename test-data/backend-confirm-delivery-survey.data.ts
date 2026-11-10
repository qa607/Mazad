import type { AccessProfile } from '@test-data/backend-permissions.data';

/**
 * Mazad Backend "Confirm Delivery Survey" (/backend/survey/confirm-delivery-survey/index) test
 * data. The Backend has no localization, so its UI text lives here rather than in src/locales.
 * Messages read from staging on 2026-11-10.
 */
export const confirmDeliveryText = {
  pageTitle: 'Confirm Delivery Survey',
  sidebarLabel: 'Confirm Delivery',
  createTitle: 'Create Question',
  noResults: 'No results found.',
  /** Grid header labels, in column order. */
  columnHeaders: [
    '#',
    'ID',
    'Question',
    'Question En',
    'Is Active',
    'From',
    'To',
    'Created At',
    'Updated At',
    'Actions',
  ],
  /** Labels of a question's View page, in order. */
  viewLabels: [
    'ID',
    'Question',
    'Question En',
    'From',
    'To',
    'Is Active',
    'Created At',
    'Updated At',
  ],
  /** Grid headers that sort the list. */
  sortableHeaders: ['ID', 'From', 'To', 'Created At', 'Updated At'],
  /** Required fields of the Add Question form and their messages. */
  requiredFields: {
    question: 'Question cannot be blank.',
    questionEn: 'Question En cannot be blank.',
    from: 'From cannot be blank.',
    to: 'To cannot be blank.',
  },
} as const;

/**
 * Invalid answer scales for the Add Question form, with the questions left empty so the form is
 * never accepted. Rules seen on staging: whole numbers, From 0-1, To at least 3.
 */
export const invalidScaleCases = [
  {
    name: 'letters',
    from: 'abc',
    to: 'xyz',
    errors: { from: 'From must be an integer.', to: 'To must be an integer.' },
  },
  {
    name: 'a decimal From',
    from: '1.5',
    to: '7',
    errors: { from: 'From must be an integer.' },
  },
  {
    name: 'From above 1 and To below 3',
    from: '10',
    to: '1',
    errors: { from: 'From must be no greater than 1.', to: 'To must be no less than 3.' },
  },
  {
    name: 'a negative From',
    from: '-1',
    to: '0',
    errors: { from: 'From must be no less than 0.', to: 'To must be no less than 3.' },
  },
] as const;

export const confirmDeliveryScaleRules = { minFrom: 0, maxFrom: 1, minTo: 3 } as const;

export const confirmDeliveryData = {
  unknownQuestion: 'qa-no-such-question-zz',
} as const;

/** URL patterns, matched against the full page URL. */
export const confirmDeliveryUrls = {
  list: /\/backend\/survey\/confirm-delivery-survey\/index(\?|$)/,
  listPlain: /\/backend\/survey\/confirm-delivery-survey\/index$/,
  create: /\/backend\/survey\/confirm-delivery-survey\/create$/,
  view: (id: string) => new RegExp(`/backend/survey/confirm-delivery-survey/view\\?id=${id}$`),
  update: (id: string) => new RegExp(`/backend/survey/confirm-delivery-survey/update\\?id=${id}$`),
  /** Posting an empty form here creates nothing; it is sent only to roles that must be refused. */
  createPath: '/backend/survey/confirm-delivery-survey/create',
  updatePath: (id: string) => `/backend/survey/confirm-delivery-survey/update?id=${id}`,
} as const;

/** Who can manage the survey questions, checked on staging per role (2026-11-10). */
export const confirmDeliveryAccess: Record<AccessProfile, boolean> = {
  devRoot: true,
  // To confirm: no role but Dev Root can manage the survey questions.
  auctionSupervisor: false,
  customerSupport: false,
  auctionTeam: false,
  operation: false,
  noAuctionAccess: false,
  supplier: false,
};

/** Inputs of the Add Question / Update form, by field. */
export const questionFormFields = {
  question: 'confirmdeliverysurvey-question',
  questionEn: 'confirmdeliverysurvey-question_en',
  from: 'confirmdeliverysurvey-from',
  to: 'confirmdeliverysurvey-to',
  isActive: 'confirmdeliverysurvey-is_active',
} as const;

export type QuestionFormField = keyof typeof questionFormFields;
