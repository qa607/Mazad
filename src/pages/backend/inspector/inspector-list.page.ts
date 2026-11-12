import type { Locator, Page } from '@playwright/test';
import {
  ReadOnlyUserListPage,
  type UserListFilters,
} from '@pages/backend/base/read-only-user-list.page';
import {
  type InspectorColumn,
  type InspectorSortableColumn,
  inspectorColumns,
  inspectorSortableColumns,
} from '@test-data/inspector.data';

export type InspectorFilters = UserListFilters;

/** One grid row as text, keyed by column header. */
export type InspectorRow = Record<InspectorColumn, string>;

/**
 * Mazad back-office Inspectors list (/backend/users/inspector/index). Read-only: rows have View
 * only, and there is no Create.
 */
export class InspectorListPage extends ReadOnlyUserListPage<InspectorColumn> {
  static readonly path = '/backend/users/inspector/index';

  constructor(page: Page) {
    super(page, 'inspector', 'InspectorSearch', inspectorColumns);
  }

  sortLink(column: InspectorSortableColumn): Locator {
    return this.sortLinkFor(inspectorSortableColumns[column]);
  }

  async sortBy(column: InspectorSortableColumn): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sortLink(column));
  }
}
