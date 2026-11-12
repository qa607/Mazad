import type { Locator, Page } from '@playwright/test';
import {
  ReadOnlyUserListPage,
  type UserListFilters,
} from '@pages/backend/base/read-only-user-list.page';
import {
  type QcColumn,
  type QcSortableColumn,
  qcColumns,
  qcSortableColumns,
} from '@test-data/qc.data';

export type QcFilters = UserListFilters;

/** One grid row as text, keyed by column header. */
export type QcRow = Record<QcColumn, string>;

/** Mazad back-office QC list (/backend/users/qc/index). Read-only: rows have View only. */
export class QcListPage extends ReadOnlyUserListPage<QcColumn> {
  static readonly path = '/backend/users/qc/index';

  constructor(page: Page) {
    super(page, 'qc', 'QcSearch', qcColumns);
  }

  sortLink(column: QcSortableColumn): Locator {
    return this.sortLinkFor(qcSortableColumns[column]);
  }

  async sortBy(column: QcSortableColumn): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sortLink(column));
  }

  /** HTTP status of a QC View page opened directly by URL. */
  async viewPageStatus(id: string): Promise<number> {
    return this.routeStatus(`view?id=${id}`);
  }
}
