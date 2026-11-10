import type { Page } from '@playwright/test';

/** Column labels of the first grid on the page, in order, without the empty ones. */
export async function gridHeaders(page: Page): Promise<string[]> {
  const labels = await page.locator('.grid-view thead tr').first().locator('th').allInnerTexts();
  return labels.map((label) => label.trim()).filter(Boolean);
}

/**
 * One row of the first grid on the page as { column label: cell text }, matching cells to
 * headers by their data-col-seq attribute. The row is picked by its key, or the first row.
 * Null when there is no such row.
 */
export async function gridRowValues(
  page: Page,
  rowKey?: string,
): Promise<Record<string, string> | null> {
  return page.evaluate((key) => {
    const grid = document.querySelector('.grid-view');
    if (!grid) return null;
    const row = key
      ? grid.querySelector(`tbody tr[data-key="${key}"]`)
      : grid.querySelector('tbody tr[data-key]');
    if (!row) return null;
    const values: Record<string, string> = { key: row.getAttribute('data-key') ?? '' };
    for (const th of grid.querySelector('thead tr')?.querySelectorAll('th') ?? []) {
      const label = (th as HTMLElement).innerText.trim();
      const seq = th.getAttribute('data-col-seq');
      const cell = seq === null ? null : row.querySelector(`td[data-col-seq="${seq}"]`);
      if (label && cell) values[label] = (cell as HTMLElement).innerText.trim();
    }
    return values;
  }, rowKey);
}
