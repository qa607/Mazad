import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

/**
 * Mazad back-office Roles (/backend/access/role/index) and a role's permission page
 * (/backend/access/role/view-permission?id=Role). Each permission is a checkbox titled with its
 * route; clicking it saves immediately, there is no Save button.
 */
export class RolePermissionsPage extends BackendPage {
  static readonly listPath = '/backend/access/role/index';

  readonly nameFilter: Locator;
  readonly searchButton: Locator;
  readonly roleRows: Locator;
  readonly createRoleButton: Locator;
  readonly roleNameInput: Locator;
  readonly saveRoleButton: Locator;
  readonly deleteRoleButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nameFilter = page.locator('#authitemsearch-name');
    this.searchButton = page.locator('#w0 button[type="submit"]');
    this.roleRows = page.locator('table tbody tr[data-key]');
    this.createRoleButton = page.locator('a[href="/backend/access/role/create"]');
    this.roleNameInput = page.locator('#authitem-name');
    this.saveRoleButton = page.locator('form#w0 button[type="submit"]');
    this.deleteRoleButton = page.locator('a.btn', { hasText: 'Delete' });
  }

  async gotoList(): Promise<void> {
    await this.page.goto(RolePermissionsPage.listPath);
  }

  async searchRole(name: string): Promise<void> {
    await this.nameFilter.fill(name);
    await Promise.all([this.page.waitForURL(/AuthItemSearch/), this.searchButton.click()]);
  }

  roleRow(name: string): Locator {
    return this.roleRows.filter({ hasText: name });
  }

  /** The role row's permissions icon (opens view-permission). */
  permissionsIcon(name: string): Locator {
    return this.roleRow(name).locator('a[href*="/access/role/view-permission"]');
  }

  /** The role row's view icon. */
  viewIcon(name: string): Locator {
    return this.roleRow(name).locator('a[href*="/access/role/view?"]');
  }

  async createRole(name: string): Promise<void> {
    await this.gotoList();
    await this.createRoleButton.click();
    await this.roleNameInput.fill(name);
    await Promise.all([
      this.page.waitForURL(/\/access\/role\/(index|view)/),
      this.saveRoleButton.click(),
    ]);
  }

  /** Deletes a role with its row's delete icon and confirms the in-page "Are you sure" dialog. */
  async deleteRole(name: string): Promise<void> {
    await this.gotoList();
    await this.searchRole(name);
    await this.roleRow(name).locator('a[href*="/access/role/delete"]').click();
    const confirm = this.page.locator('.modal.show', { hasText: 'Are you sure' });
    await confirm.locator('button', { hasText: 'Ok' }).click();
    await this.page.waitForLoadState('load');
  }

  /**
   * Opens a role's permissions with its row icon. The icon opens a new tab; this reads that
   * tab's URL, closes it and continues in this tab, so a video stays in one recording.
   */
  async openPermissionsFromList(role: string): Promise<void> {
    const tab = await this.openInNewTab(this.permissionsIcon(role));
    const url = tab.url();
    await tab.close();
    await this.page.goto(url);
  }

  async gotoPermissions(role: string): Promise<void> {
    await this.page.goto(`/backend/access/role/view-permission?id=${encodeURIComponent(role)}`);
  }

  /** The checkbox for a permission route, e.g. "/users/supplier/create". */
  permission(route: string): Locator {
    return this.page.locator(`input.checkboxPermission[title="${route}"]`);
  }

  /** Routes ticked on the open role permission page, sorted (to record and compare a role). */
  async checkedPermissions(): Promise<string[]> {
    const routes = await this.page
      .locator('input.checkboxPermission:checked')
      .evaluateAll((boxes) => boxes.map((box) => box.getAttribute('title') ?? ''));
    return routes.sort();
  }

  /** Clicks a permission checkbox and waits for the change to be saved. */
  async togglePermission(route: string): Promise<void> {
    await Promise.all([
      this.page.waitForResponse((r) => r.url().includes('/access/role/permission')),
      this.permission(route).click(),
    ]);
  }
}
