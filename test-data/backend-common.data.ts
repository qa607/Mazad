/**
 * Values shared by every Mazad Backend list and form. The Backend has no localization, so its
 * UI text lives in test-data rather than in src/locales.
 */

/** Prefix of every record the suites create, so test records are easy to find and remove. */
export const testRecordPrefix = 'QA-AUTO';

/** Matches a list URL showing one page of results, e.g. "?page=2". */
export function listPageUrl(pageNumber: number): RegExp {
  return new RegExp(`[?&]page=${pageNumber}(&|$)`);
}

/** Matches a grid summary such as "Showing 21-40 of 422 items." for one page of results. */
export function gridSummary(from: number, to: number): RegExp {
  return new RegExp(`^Showing ${from}-${to} of [\\d,]+ items\\.$`);
}
