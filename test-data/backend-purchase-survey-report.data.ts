/**
 * Mazad Backend "Purchase Survey Report" (/backend/report/purchase-survey-report/index) test
 * data. The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const purchaseSurveyText = {
  pageTitle: 'Purchase Survey Report',
  sidebarLabel: 'Purchase Survey',
  noResults: 'No results found.',
  /** Grid header labels, in column order. */
  columnHeaders: [
    '#',
    'Customer Type',
    'Customer Name',
    'Item Title',
    'Question',
    'Supplier',
    'Created At',
  ],
  customerTypes: ['Individual', 'Dealer'],
  /** Score range messages shown under the From / To fields. */
  toBelowFrom: 'To Answer must be greater than or equal to "From Answer".',
  fromBlank: 'From Answer cannot be blank.',
} as const;

export const purchaseSurveyData = {
  /** Highest score of each scored question ("6/7", "8/10"). Lowest is 1. */
  maxScore: { easeOfUse: 7, satisfaction: 7, recommend: 10 },
  /** Score ranges the filter tests use: a single top score, and the low end of a 1-10 scale. */
  topEaseOfUse: '7',
  lowRecommendFrom: '0',
  lowRecommendTo: '3',
  /** An inverted range (from above to) and a non-numeric bound, for the validation gaps. */
  invertedFrom: '5',
  invertedTo: '2',
  nonNumeric: 'abc',
  pageSize: 20,
} as const;

/** URL patterns, matched against the full page URL. */
export const purchaseSurveyUrls = {
  list: /\/backend\/report\/purchase-survey-report\/index(\?|$)/,
} as const;
