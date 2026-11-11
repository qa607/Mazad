import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { exactText } from '@utils/text';

/** Grid columns, by their data-col-seq attribute. */
const column = {
  number: 0,
  officeName: 1,
  officeNameEn: 2,
  status: 3,
  actions: 4,
} as const;

/**
 * Traffic Offices list (/backend/trafficOffice/traffic-office/index, Global Settings >
 * Traffic Office): search by Office Name, Office Name En and Status, the offices grid with a
 * status dropdown and View / Update actions per row (both open a new tab), Export All and
 * Create Traffic Office. The grid has no Delete action: offices are deleted from their View
 * page (TrafficOfficeViewPage). Rows are keyed by office ID.
 */
export class TrafficOfficeListPage extends BackendListPage {
  static readonly path = '/backend/trafficOffice/traffic-office/index';
  private static readonly form = 'TrafficOfficeSearch';

  readonly createButton: Locator;
  /** Labels of the search form fields, in display order. */
  readonly filterLabels: Locator;
  readonly officeNameSearchInput: Locator;
  readonly officeNameEnSearchInput: Locator;
  /**
   * Selected Status filter (or its placeholder). Its text also holds select2's "×" clear
   * button once an option is picked, so the selection is read from its title attribute.
   */
  readonly statusFilterValue: Locator;

  // Grid
  readonly officeNameCells: Locator;
  readonly officeNameEnCells: Locator;
  /** Each row's status dropdown (value "publish" or "un-publish"). */
  readonly statusSelects: Locator;

  // Export
  readonly exportAllButton: Locator;
  /** Formats in the open Export All menu (CSV, Excel ...). */
  readonly exportFormats: Locator;

  constructor(page: Page) {
    super(page, TrafficOfficeListPage.path, 'default-id');
    this.createButton = this.searchForm.locator(
      'a[href="/backend/trafficOffice/traffic-office/create"]',
    );
    this.filterLabels = this.searchForm.locator('.form-row label');
    this.officeNameSearchInput = this.searchForm.locator('#trafficofficesearch-office_name');
    this.officeNameEnSearchInput = this.searchForm.locator('#trafficofficesearch-office_name_en');
    this.statusFilterValue = this.filterValue('trafficofficesearch-status');

    this.officeNameCells = this.columnCells(column.officeName);
    this.officeNameEnCells = this.columnCells(column.officeNameEn);
    // Every row's dropdown has the same id ("trafficoffice-status"), so they are found by class.
    this.statusSelects = this.columnCells(column.status).locator('select.traffic-office-status');

    const exportGroup = this.grid.locator('.kv-grid-toolbar .btn-group', {
      has: page.locator('a[data-format]'),
    });
    this.exportAllButton = exportGroup.locator('> button.dropdown-toggle');
    this.exportFormats = exportGroup.locator('.dropdown-menu.show a[data-format]');
  }

  /** Opens the list with search parameters, e.g. { office_name_en: 'Qassim' }. */
  async gotoSearch(query: Partial<Record<'office_name' | 'office_name_en' | 'status', string>>) {
    const params = new URLSearchParams(
      Object.entries(query).map(([field, value]) => [
        `${TrafficOfficeListPage.form}[${field}]`,
        value,
      ]),
    );
    await this.page.goto(`${TrafficOfficeListPage.path}?${params.toString()}`);
  }

  /** Rows whose Office Name En is exactly this text. */
  rowsNamedEn(officeNameEn: string): Locator {
    return this.rows.filter({
      has: this.page.locator(`td[data-col-seq="${column.officeNameEn}"]`, {
        hasText: exactText(officeNameEn),
      }),
    });
  }

  officeNameCell(row: Locator): Locator {
    return this.rowCell(row, column.officeName);
  }

  officeNameEnCell(row: Locator): Locator {
    return this.rowCell(row, column.officeNameEn);
  }

  statusSelect(row: Locator): Locator {
    return this.rowCell(row, column.status).locator('select.traffic-office-status');
  }

  /** The action links of a row (View, Update), in display order. */
  actionLinks(row: Locator): Locator {
    return this.rowCell(row, column.actions).locator('a');
  }

  viewLink(id: string): Locator {
    return this.row(id).locator(`a[href$="/traffic-office/view?id=${id}"]`);
  }

  updateLink(id: string): Locator {
    return this.row(id).locator(`a[href$="/traffic-office/update?id=${id}"]`);
  }

  /** The status of each row on the current page ("publish" or "un-publish"), in grid order. */
  async statusValues(): Promise<string[]> {
    return this.statusSelects.evaluateAll((selects) =>
      selects.map((select) => (select as HTMLSelectElement).value),
    );
  }

  async searchByOfficeName(officeName: string): Promise<void> {
    await this.officeNameSearchInput.fill(officeName);
    await this.search();
  }

  async searchByOfficeNameEn(officeNameEn: string): Promise<void> {
    await this.officeNameEnSearchInput.fill(officeNameEn);
    await this.search();
  }

  /** Picks a Status filter option ("Publish" or "Unpublish") and searches. */
  async filterByStatus(status: string): Promise<void> {
    await this.selectFilterOption('field-trafficofficesearch-status', status);
    await this.search();
  }

  async openExportMenu(): Promise<void> {
    await this.exportAllButton.click();
  }

  /** Opens Create Traffic Office and waits for the form. */
  async openCreateForm(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.createButton);
  }

  /** IDs of the offices whose Office Name En is exactly this, found with the Office Name En search. */
  async idsOfOfficesNamedEn(officeNameEn: string): Promise<string[]> {
    await this.gotoSearch({ office_name_en: officeNameEn });
    return this.rowsNamedEn(officeNameEn).evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-key') ?? ''),
    );
  }
}
