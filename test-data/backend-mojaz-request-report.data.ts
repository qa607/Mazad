/**
 * Mazad Backend "Request Mojaz" report (/backend/report/mojaz-request/index) test data.
 * The Backend has no localization, so its UI text lives here rather than in src/locales.
 */
export const mojazRequestText = {
  pageTitle: 'Request Mojaz',
  sidebarLabel: 'Request Mojaz',
  noResults: 'No results found.',
  /** Grid header labels, in column order. */
  columnHeaders: [
    '#',
    'Title',
    'Vin Number',
    'Customer Name',
    'Customer Phone',
    'Mojaz Ar',
    'Mojaz En',
    'Status',
    'Creation Date',
    'Updated At',
  ],
  /** Column headers of the CSV export, in order ("Creation Date " has a trailing space). */
  csvHeaders: [
    'Title',
    'Vin Number',
    'Customer Name',
    'Customer Phone',
    'Mojaz Ar',
    'Mojaz En',
    'Status',
    'Creation Date ',
    'Updated At',
  ],
} as const;

export const mojazRequestData = {
  /** Well-formed (17-character) VIN that matches no vehicle. */
  unknownVin: 'ZZZZZZZZZZ0000000',
  partialVinLength: 8,
  /** Saudi mobile numbers as stored: 10 digits starting with 05. */
  phoneFormat: /^05\d{8}$/,
  pageSize: 20,
} as const;

/** URL patterns, matched against the full page URL. */
export const mojazRequestUrls = {
  list: /\/backend\/report\/mojaz-request\/index(\?|$)/,
  /** Generated reports are PDFs stored on S3. */
  reportPdf: /^https:\/\/s3\.[a-z0-9-]+\.amazonaws\.com\/.+\.pdf$/,
  csvFileName: /^Request Mojaz \d{4}-\d{2}-\d{2}\.csv$/,
} as const;
