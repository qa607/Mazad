import type { Locator, Page } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';
import { ConfirmDialog } from '@pages/backend/components/confirm-dialog.component';

export interface CustomerFilters {
  phone?: string;
  /** "Arabic Name" filter. */
  name?: string;
  /** "English Name" filter. */
  nameEn?: string;
  email?: string;
}

const filterParams: Record<keyof CustomerFilters, string> = {
  phone: 'phone',
  name: 'name',
  nameEn: 'name_en',
  email: 'email',
};

/**
 * Parent of the Individual and Dealers lists: a search form, a grid with per-row actions and a
 * Delete that asks for confirmation in the in-page dialog.
 */
export abstract class CustomerListPage extends BackendListPage {
  /** Flash message after a delete. Unlike other pages it has no role="alert". */
  readonly flashMessage: Locator;
  readonly phoneFilter: Locator;
  readonly confirmDialog: ConfirmDialog;

  protected constructor(
    page: Page,
    listPath: string,
    /** Prefix of the search form's field names, e.g. "IndividualSearch". */
    private readonly searchModel: string,
    /** Route segment of the section, e.g. "individual". */
    protected readonly section: string,
  ) {
    super(page, listPath, 'default-id');
    this.flashMessage = page.locator('.alert-success');
    this.phoneFilter = page.locator(`#${searchModel.toLowerCase()}-phone`);
    this.confirmDialog = new ConfirmDialog(page);
  }

  /** Opens the list, optionally filtered. Returns the HTTP status of the page. */
  async open(filters: CustomerFilters = {}): Promise<number> {
    const params = new URLSearchParams();
    for (const key of Object.keys(filters) as (keyof CustomerFilters)[]) {
      const value = filters[key];
      if (value !== undefined) params.set(`${this.searchModel}[${filterParams[key]}]`, value);
    }
    const search = params.toString();
    const response = await this.page.goto(search ? `${this.listPath}?${search}` : this.listPath);
    return response?.status() ?? 0;
  }

  /** Opens this list from the sidebar link. */
  async openFromSidebarLink(): Promise<void> {
    await this.clickAndWaitForPageLoad(this.sidebarLink);
  }

  /** A row's Delete link (absent when the user may not delete). */
  deleteLink(id: string): Locator {
    return this.row(id).locator(`a[href="/backend/users/${this.section}/delete?id=${id}"]`);
  }

  /** Every Delete link on the current page. */
  get deleteLinks(): Locator {
    return this.rows.locator(`a[href*="/users/${this.section}/delete"]`);
  }

  /** Phone numbers of the rows on the current page (the column is found by its header). */
  async phones(): Promise<string[]> {
    const headers = (await this.columnHeaders.allInnerTexts()).map((h) => h.trim());
    const index = headers.indexOf('Phone');
    if (index < 0) throw new Error(`No Phone column in ${headers.join(', ')}`);
    return this.rows.evaluateAll(
      (rows, i) => rows.map((row) => (row.children[i] as HTMLElement).innerText.trim()),
      index,
    );
  }

  /** Titles of a row's action links, e.g. ["View", "Update", "Delete"]. */
  async rowActions(id: string): Promise<string[]> {
    return this.row(id)
      .locator('td a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('title') ?? ''));
  }

  /** Clicks a row's Delete icon, which opens the in-page confirmation. */
  async clickDelete(id: string): Promise<void> {
    await this.deleteLink(id).click();
    await this.confirmDialog.okButton.waitFor();
  }

  /** Deletes a user through its row's Delete action and its confirmation. */
  async deleteUser(id: string): Promise<void> {
    await this.clickDelete(id);
    await this.confirmDialog.confirmAndWaitForPageLoad();
  }

  /**
   * Sends what the Delete link sends (POST with the page's CSRF token), for checking that the
   * server refuses users without the permission. Returns the HTTP status.
   */
  async postDelete(id: string): Promise<number> {
    return this.postAction(`/backend/users/${this.section}/delete?id=${id}`);
  }

  /** HTTP status of the delete URL opened with GET, as by typing it in the address bar. */
  async getDeleteStatus(id: string): Promise<number> {
    const response = await this.page.request.get(`/backend/users/${this.section}/delete?id=${id}`, {
      maxRedirects: 0,
    });
    return response.status();
  }

  /** HTTP status of a user's View or Update page opened directly by URL. */
  async userPageStatus(action: 'view' | 'update', id: string): Promise<number> {
    const response = await this.page.request.get(
      `/backend/users/${this.section}/${action}?id=${id}`,
    );
    return response.status();
  }
}
