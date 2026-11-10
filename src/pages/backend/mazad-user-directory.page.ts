import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/base/backend.page';

export type AccountRole = 'individual' | 'dealer';

/** A back-office account found by name search. Phone is needed to drive login; no other PII is read. */
export interface DirectoryAccount {
  id: number;
  phone: string;
  status: string;
}

const LIST_CONFIG: Record<AccountRole, { path: string; searchModel: string }> = {
  individual: { path: '/backend/users/individual/index', searchModel: 'IndividualSearch' },
  dealer: { path: '/backend/users/dealer/index', searchModel: 'DealerSearch' },
};

/**
 * Back office Individuals and Dealers lists (Users → Individuals / Dealers), used only to find
 * a dedicated test account by name instead of hardcoding a phone number. Read-only: it searches
 * and reads rows; it never opens, edits or deletes a user record.
 */
export class MazadUserDirectoryPage extends BackendPage {
  readonly rows: Locator;
  readonly summary: Locator;

  constructor(page: Page) {
    super(page);
    this.rows = page.locator('table tbody tr');
    this.summary = page.locator('.summary');
  }

  async goto(role: AccountRole): Promise<void> {
    await this.page.goto(LIST_CONFIG[role].path, { waitUntil: 'domcontentloaded' });
  }

  /** Searches by name (Arabic or English name column matches a "contains" filter). */
  async searchByName(role: AccountRole, name: string): Promise<void> {
    const { path, searchModel } = LIST_CONFIG[role];
    const url = `${path}?${encodeURIComponent(`${searchModel}[name]`)}=${encodeURIComponent(name)}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  /** Reads every row on the current page as {header label: cell text}, direct children only. */
  private async readRows(): Promise<Record<string, string>[]> {
    const headers = await this.page
      .locator('table thead tr')
      .first()
      .locator(':scope > th')
      .allTextContents();
    const labels = headers.map((h) => h.trim());
    return this.rows.evaluateAll(
      (trs, cols) =>
        trs.map((tr) => {
          const cells = [...tr.querySelectorAll(':scope > td')].map(
            (td) => td.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          );
          return Object.fromEntries(cols.map((label, i) => [label, cells[i] ?? '']));
        }),
      labels,
    );
  }

  /**
   * EVERY account whose name contains `namePattern`, across all result pages (at most 10), as the
   * raw {column: cell} rows. For the masked iOS account report only: callers must mask the
   * name and phone before showing, saving or attaching anything. Read-only.
   */
  async listCandidates(
    role: AccountRole,
    namePattern: string,
    maxPages = 10,
  ): Promise<Record<string, string>[]> {
    await this.searchByName(role, namePattern);
    const all: Record<string, string>[] = [];
    for (let page = 1; page <= maxPages; page++) {
      if (page > 1) {
        await this.page.goto(`${LIST_CONFIG[role].path}?page=${page}`, {
          waitUntil: 'domcontentloaded',
        });
      }
      const rows = await this.readRows();
      if (rows.length === 0) break; // past the last page
      all.push(...rows);
      if ((await this.page.locator('.pagination a').count()) === 0) break;
    }
    return all;
  }

  /**
   * First active account whose name contains `namePattern`, across all result pages.
   * Returns null if none is active (e.g. only inactive/blocked test fixtures match).
   */
  async findActiveAccount(
    role: AccountRole,
    namePattern: string,
  ): Promise<DirectoryAccount | null> {
    await this.searchByName(role, namePattern);
    for (let page = 1; page <= 10; page++) {
      if (page > 1)
        await this.page.goto(`${LIST_CONFIG[role].path}?page=${page}`, {
          waitUntil: 'domcontentloaded',
        });
      const rows = await this.readRows();
      const active = rows.find((r) => r.Status?.toLowerCase() === 'active' && r.ID && r.Phone);
      if (active) return { id: Number(active.ID), phone: active.Phone, status: active.Status };
      const pagination = await this.page.locator('.pagination a').count();
      if (pagination === 0) break;
    }
    return null;
  }
}
