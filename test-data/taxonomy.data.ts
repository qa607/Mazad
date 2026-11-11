import { testRecordPrefix } from '@test-data/backend-common.data';
import { escapeRegExp } from '@utils/text';
import { uniqueDigits } from '@utils/unique';

/**
 * Mazad Backend "Taxonomy" (Global Settings > Taxonomy, /backend/taxonomy/taxonomy/index) test
 * data. Messages, limits and behaviour were read from the staging Backend
 * (https://stg-mazad-v3-154.motory.dev) on 2026-11-10: the client validation rules in the page
 * source and the live UI, not assumed. The Backend has no localization, so its UI text lives
 * here rather than in src/locales.
 *
 * The Taxonomy page lists the vocabulary types (Makes, Colors, Cities, ...). Each type has its
 * own list of terms, all stored in one Taxonomy model with a required Title (Arabic) and
 * Title En of at most 150 characters; some types add fields (Hex, Logo, Description).
 *
 * Behaviour accepted as intended (tests assert it, so a change shows up as a failure):
 * - Saving a term (create or update) returns to the type's list with a success message.
 * - A new term is added active.
 * - A value of only spaces counts as empty.
 * - The title inputs stop accepting characters at their maximum length.
 * - The title searches match part of the value, ignoring case.
 * - Only ID, Active, Created At and Updated At are sortable.
 * - Delete asks for confirmation: the grid with the in-page dialog, the details page with the
 *   browser's own confirm() (different wording, both accepted as intended).
 */

/** A taxonomy type: its key in URLs (?type=) and its name in the UI. */
export interface TaxonomyType {
  key: string;
  label: string;
}

/** The type whose terms the CRUD tests create and delete: a short list with no extra fields. */
export const crudTaxonomyType = {
  key: 'failed_auctions_reasons',
  label: 'Failed Auctions Reasons',
} as const satisfies TaxonomyType;

/** A long type (92 terms on 2026-11-10), for the read-only sorting and paging tests. */
export const pagedTaxonomyType = { key: 'make', label: 'Makes' } as const satisfies TaxonomyType;

/** Types on the Taxonomy page, in display order. */
export const taxonomyTypeNames = [
  'Makes',
  'Models',
  'Fuel Types',
  'Body Types',
  'Roof Types',
  'No. of Doors',
  'No. of Air Bags',
  'No. of Seats',
  'Break Types',
  'Transmission',
  'Colors',
  'Cities',
  'Cylinder',
  'Gear Box',
  'Charging Voltage',
  'Vehicle Usage',
  'Failed Auctions Reasons',
  'Suspend Vehicle Reason',
  'Paw Reject File Reason',
  'Why an Entry Fee',
] as const;

export const taxonomyText = {
  typesTitle: 'List All Types',
  /** First breadcrumb item of the Taxonomy pages, linking to the types page. */
  breadcrumbRoot: 'Taxonomies',
  createTitle: (typeLabel: string) => `Create ${typeLabel}`,
  updateTitle: (titleEn: string) => `Update Taxonomy: ${titleEn}`,
  created: 'Taxonomy has been created successfully.',
  updated: 'Taxonomy has been updated successfully.',
  /** No message is shown today (known bug); this is the pattern the other messages follow. */
  deleted: /Taxonomy has been deleted successfully\.?/,
  titleRequired: 'Title cannot be blank.',
  titleEnRequired: 'Title En cannot be blank.',
  /** In-page confirmation of the grid's Delete action. */
  gridDeleteConfirm: 'Are you sure to delete this item?',
  /** Browser confirm() of the details page's Delete button. */
  detailsDeleteConfirm: 'Are you sure you want to delete this item?',
  noResults: 'No results found.',
  activeYes: 'Yes',
} as const;

/** Grid columns of a type's term list (types without a logo or hex), in display order. */
export const taxonomyColumns = [
  '#',
  'ID',
  'Title',
  'Title En',
  'Active',
  'Created At',
  'Updated At',
  'Actions',
] as const;

/** Columns with a sort link, and the sort key each one puts in the URL. */
export const taxonomySortableColumns = {
  ID: 'id',
  Active: 'status',
  'Created At': 'created_at',
  'Updated At': 'updated_at',
} as const;

export type TaxonomySortableColumn = keyof typeof taxonomySortableColumns;

/** Options of the Status filter, and the URL value each one sends. */
export const taxonomyStatusFilters = [
  { label: 'Active', value: '1', active: true },
  { label: 'Inactive', value: '0', active: false },
] as const;

/** Field limits from the form's validation rules (maxlength and the string validator). */
export const taxonomyLimits = {
  titleMax: 150,
  /** Default page size of a term list. */
  pageSize: 20,
} as const;

export interface TaxonomyTermData {
  /** Arabic title. */
  title: string;
  titleEn: string;
}

/** Prefix of every term this suite creates; clean-up deletes them by exact Title En. */
export const testTaxonomyPrefix = `${testRecordPrefix} TX`;

/** A new, unique test term. */
export function newTaxonomyTerm(): TaxonomyTermData {
  const stamp = uniqueDigits(7);
  return {
    title: `${testTaxonomyPrefix} ${stamp} سبب`,
    titleEn: `${testTaxonomyPrefix} ${stamp} Reason`,
  };
}

/** The changes the update test makes to a term. */
export function editedTaxonomyTerm(term: TaxonomyTermData): TaxonomyTermData {
  return { title: `${term.title} معدل`, titleEn: `${term.titleEn} edited` };
}

/** Values for the form's boundary and edge cases. */
export const taxonomyEdgeCases = {
  /** Spaces only: the required rule trims, so this is an empty value. */
  whitespace: '     ',
  /** A unique term whose titles are exactly the maximum length. */
  longestTerm: (): TaxonomyTermData => {
    const term = newTaxonomyTerm();
    return {
      title: `${term.title} `.padEnd(taxonomyLimits.titleMax, 'x'),
      titleEn: `${term.titleEn} `.padEnd(taxonomyLimits.titleMax, 'x'),
    };
  },
  /** One character over the limit, to check the inputs stop at the limit. */
  tooLongTitle: 'n'.repeat(taxonomyLimits.titleMax + 1),
  /** HTML and quote characters that must be saved and shown as plain text. */
  specialCharacters: `<b>&"'</b>`,
  /** A title that would open a dialog if the page ran it as script. */
  script: '<script>alert(1)</script>',
} as const;

/** Search values. */
export const taxonomySearchData = {
  /** Matches no term. */
  unknownTitle: 'zz-no-such-term-zz',
  /**
   * Part of a test term's Title En in other letter case: from "TX" to the end, lower-cased
   * ("tx 1234567 reason"), so it is unique to that term and still a partial, case-changed match.
   */
  partialTitleEn: (titleEn: string): string => titleEn.slice(titleEn.indexOf('TX')).toLowerCase(),
} as const;

/** URL patterns, matched against the full page URL. */
export const taxonomyUrls = {
  /** The types page, with no query. */
  types: /\/backend\/taxonomy\/taxonomy\/index$/,
  /** A type's term list with no search, sort or page (opened as /taxonomy or /taxonomy/index). */
  list: (type: string) =>
    new RegExp(`/backend/taxonomy/taxonomy(/index)?\\?type=${escapeRegExp(type)}$`),
  /** A type's term list with any search, sort or page. */
  anyList: (type: string) =>
    new RegExp(`/backend/taxonomy/taxonomy(/index)?\\?.*\\btype=${escapeRegExp(type)}(&|$)`),
  create: (type: string) =>
    new RegExp(`/backend/taxonomy/taxonomy/create\\?type=${escapeRegExp(type)}$`),
  update: (id: string) => new RegExp(`/backend/taxonomy/taxonomy/update\\?id=${id}$`),
  view: (id: string) => new RegExp(`/backend/taxonomy/taxonomy/view\\?id=${id}$`),
  titleEnSearch: /TaxonomySearch%5Btitle_en%5D=/,
  statusFilter: (value: string) => new RegExp(`TaxonomySearch%5Bstatus%5D=${value}(&|$)`),
  sortedBy: (key: string) => new RegExp(`[?&]sort=${key}(&|$)`),
} as const;
