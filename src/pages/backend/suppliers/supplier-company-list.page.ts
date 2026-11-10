import type { Download, Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';
import { exactText } from '@utils/text';
import { selectedOption } from '@utils/widgets';
import { readPageSize } from '@test-data/supplier-company.data';

export interface CompanyFilters {
  /** Supplier ID (the value of a Supplier option). */
  supplierId?: string;
  /** "Company Name Ar" filter. */
  name?: string;
  /** "Company Name En" filter. */
  nameEn?: string;
}

/** One grid row. */
export interface CompanyRow {
  id: string;
  number: string;
  supplier: string;
  name: string;
  nameEn: string;
  /** False when the company is linked to auctions and its Delete is blocked. */
  deletable: boolean;
}

/** One option of the Supplier filter. */
export interface SupplierOption {
  id: string;
  label: string;
}

const filterParams: Record<keyof CompanyFilters, string> = {
  supplierId: 'user_id',
  name: 'name',
  nameEn: 'name_en',
};

/** Mazad back-office Companies list (/backend/company/company/index). */
export class SupplierCompanyListPage extends BackendListPage {
  static readonly path = '/backend/company/company/index';

  /** Flash message after a save or delete. Unlike other pages it has no role="alert". */
  readonly flashMessage: Locator;
  readonly createButton: Locator;
  readonly filterLabels: Locator;
  readonly supplierFilter: Locator;
  readonly supplierSelect: Locator;
  readonly nameFilter: Locator;
  readonly nameEnFilter: Locator;
  readonly sortLinks: Locator;

  readonly exportMenuToggle: Locator;
  readonly exportFormatLinks: Locator;
  readonly exportColumnsToggle: Locator;
  /** In-page "Confirmation" dialog, shown before an export and before a delete. */
  readonly confirmDialog: ConfirmDialog;

  constructor(page: Page) {
    super(page, SupplierCompanyListPage.path, 'default-id');
    this.flashMessage = page.locator('.alert-success');
    this.createButton = page.locator('a[href="/backend/company/company/create"]');
    this.filterLabels = this.searchForm.locator('label');
    this.supplierFilter = page.locator('.field-companysearch-user_id');
    this.supplierSelect = page.locator('#companysearch-user_id');
    this.nameFilter = page.locator('#companysearch-name');
    this.nameEnFilter = page.locator('#companysearch-name_en');
    this.sortLinks = this.columnHeaders.locator('a[data-sort]');

    this.exportMenuToggle = page.getByRole('button', { name: 'Export All' });
    this.exportFormatLinks = page.locator('.dropdown-menu.show a');
    this.exportColumnsToggle = page.locator('button[title="Select columns to export"]');
    this.confirmDialog = new ConfirmDialog(page);
  }

  /**
   * Opens the list, optionally filtered and with other query parameters (sort, page, per-page).
   * Returns the HTTP status of the page.
   */
  async open(filters: CompanyFilters = {}, query: Record<string, string> = {}): Promise<number> {
    const params = new URLSearchParams(query);
    for (const key of Object.keys(filters) as (keyof CompanyFilters)[]) {
      const value = filters[key];
      if (value !== undefined) params.set(`CompanySearch[${filterParams[key]}]`, value);
    }
    const search = params.toString();
    const response = await this.page.goto(search ? `${this.listPath}?${search}` : this.listPath);
    return response?.status() ?? 0;
  }

  /**
   * Picks a supplier by ID. Several suppliers share a label on staging, so the option is set by
   * value through Select2's jQuery API instead of by clicking a label.
   */
  async selectSupplier(supplierId: string): Promise<void> {
    await this.supplierSelect.evaluate((select, id) => {
      type JQuery = (element: Element) => { val: (v: string) => { trigger: (e: string) => void } };
      (window as unknown as { jQuery: JQuery }).jQuery(select).val(id).trigger('change');
    }, supplierId);
  }

  /**
   * Opens this list from the sidebar. Its link is found by URL: matching the text "Companies"
   * would also hit "Delivery Companies".
   */
  async openFromSidebarLink(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sidebarLink);
  }

  /** Picks a supplier by clicking its label in the Select2 dropdown, as a user would. */
  async chooseSupplier(label: string): Promise<void> {
    await this.selectFilterOption('field-companysearch-user_id', label);
  }

  async fillFilters(filters: CompanyFilters): Promise<void> {
    if (filters.supplierId !== undefined) await this.selectSupplier(filters.supplierId);
    if (filters.name !== undefined) await this.nameFilter.fill(filters.name);
    if (filters.nameEn !== undefined) await this.nameEnFilter.fill(filters.nameEn);
  }

  /** Fills the filters and clicks Search, waiting for the filtered page to load. */
  async searchBy(filters: CompanyFilters): Promise<void> {
    await this.fillFilters(filters);
    await this.search();
  }

  /** Runs the search by pressing Enter in a text filter. */
  async searchWithEnter(filter: Locator): Promise<void> {
    await this.waitForPageLoadAfter(() => filter.press('Enter'));
  }

  /** Text shown by the Supplier dropdown (the selection or the placeholder). */
  selectedSupplier(): Locator {
    return selectedOption(this.supplierFilter);
  }

  /** Options of the Supplier filter, without the placeholder. */
  async supplierOptions(): Promise<SupplierOption[]> {
    return this.supplierSelect.locator('option').evaluateAll((options) =>
      options
        .map((option) => ({
          id: (option as HTMLOptionElement).value,
          // Some labels hold double spaces, e.g. "<name>  - Supplier".
          label: (option.textContent ?? '').replace(/\s+/g, ' ').trim(),
        }))
        .filter((option) => option.id),
    );
  }

  /** Every row on the current page. */
  async readRows(): Promise<CompanyRow[]> {
    return this.rows.evaluateAll((rows) =>
      rows.map((row) => {
        const cells = [...row.querySelectorAll('td')].map((cell) =>
          (cell as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
        );
        const deleteLink = row.querySelector('a[href*="/company/company/delete"]');
        return {
          id: row.getAttribute('data-key') ?? '',
          number: cells[0],
          supplier: cells[1],
          name: cells[2],
          nameEn: cells[3],
          deletable: !!deleteLink && !deleteLink.classList.contains('prevent-delete-item'),
        };
      }),
    );
  }

  /**
   * Every company matching the filters, read page by page in small pages sorted by ID, then
   * returned newest first.
   */
  async readAllRows(filters: CompanyFilters = {}): Promise<CompanyRow[]> {
    const all: CompanyRow[] = [];
    for (let pageNumber = 1; pageNumber <= 200; pageNumber++) {
      const status = await this.open(filters, {
        sort: 'id',
        'per-page': String(readPageSize),
        page: String(pageNumber),
      });
      if (status !== 200) throw new Error(`List page ${pageNumber} answered HTTP ${status}.`);
      all.push(...(await this.readRows()));
      if ((await this.summary.count()) === 0) break;
      const { to, total } = await this.summaryCounts();
      if (to >= total) break;
    }
    return all.sort((a, b) => Number(b.id) - Number(a.id));
  }

  /**
   * Titles of a row's action links. The blocked Delete link of a company linked to auctions has
   * no title, so it is named from its URL.
   */
  async rowActions(id: string): Promise<string[]> {
    return this.row(id)
      .locator('td a')
      .evaluateAll((links) =>
        links.map(
          (link) =>
            link.getAttribute('title') ||
            (link.getAttribute('href')?.includes('/delete') ? 'Delete' : ''),
        ),
      );
  }

  actionLink(id: string, action: 'view' | 'update' | 'delete'): Locator {
    return this.row(id).locator(`a[href="/backend/company/company/${action}?id=${id}"]`);
  }

  /** Clicks a row's Delete icon, which opens the in-page confirmation. */
  async clickDelete(id: string): Promise<void> {
    await this.actionLink(id, 'delete').click();
    await this.confirmDialog.okButton.waitFor();
  }

  /** Clicks the Delete icon of a company linked to auctions, which shows a blocking popup. */
  async clickBlockedDelete(id: string): Promise<void> {
    await this.actionLink(id, 'delete').click();
    await this.resultAlert.waitFor();
  }

  async closeResultAlert(): Promise<void> {
    await this.resultAlertOkButton.click();
    await this.resultAlert.waitFor({ state: 'hidden' });
  }

  /** Deletes a company through its row's Delete action and its confirmation. */
  async deleteCompany(id: string): Promise<void> {
    await this.clickDelete(id);
    await this.confirmDialog.confirmAndWaitForPageLoad();
  }

  /** Header texts in display order, with line breaks collapsed. */
  async headerTexts(): Promise<string[]> {
    return (await this.columnHeaders.allInnerTexts()).map((text) =>
      text.replace(/\s+/g, ' ').trim(),
    );
  }

  /** Clicks Next and returns the HTTP status of the page it loads. */
  async goToNextPageStatus(): Promise<number> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().resourceType() === 'document' && r.request().method() === 'GET',
      ),
      this.nextPage.locator('a').click(),
    ]);
    await this.page.waitForLoadState();
    return response.status();
  }

  /** Opens Export All and picks a format, which opens the confirmation. */
  async startExport(format: string): Promise<void> {
    await this.exportMenuToggle.click();
    await this.exportFormatLinks.filter({ hasText: exactText(format) }).click();
    await this.confirmDialog.okButton.waitFor();
  }

  /** Exports the list in a format, confirming the prompt, and returns the downloaded file. */
  async exportAs(format: string): Promise<Download> {
    await this.startExport(format);
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.confirmDialog.okButton.click(),
    ]);
    return download;
  }

  /** Starts collecting uncaught script errors of this tab; returns a function giving them. */
  trackScriptErrors(): () => string[] {
    const errors: string[] = [];
    this.page.on('pageerror', (error) => errors.push(error.message));
    return () => errors;
  }

  /** HTTP status of a company page (view or update) opened directly by URL. */
  async companyPageStatus(action: 'view' | 'update', id: string): Promise<number> {
    const response = await this.page.request.get(`/backend/company/company/${action}?id=${id}`);
    return response.status();
  }

  /** Width of the page's content and of the window, to detect horizontal scrolling. */
  async pageWidths(): Promise<{ content: number; window: number }> {
    return this.page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      window: window.innerWidth,
    }));
  }
}
