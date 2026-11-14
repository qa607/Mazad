import { expect, test } from '@fixtures/inspection.fixture';

/**
 * Mazad Inspection backend > Report by Inspectors (/report/inspector, stg-224-inspection).
 * Read-only throughout: never creates or completes an inspection to inflate a total — only
 * observes the existing, real historical data (15 inspectors, confirmed live 2026-11-11).
 */
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const KNOWN_INSPECTOR = 'Ahmed Othman';

test.describe('Inspection Backend - Report by Inspectors', { tag: ['@regression'] }, () => {
  test(
    'The report loads with the correct title and grid',
    { tag: ['@smoke', '@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { inspectorReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();

      await expect(qcSession).toHaveTitle('Report by inspectors');
      await expect(report.grid).toBeVisible();
    },
  );

  test(
    'Filtering by inspector shows only that inspector',
    { tag: ['@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { inspectorReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();

      await report.selectInspector(KNOWN_INSPECTOR);
      await report.search();

      await expect(report.rows).toHaveCount(1);
      await expect(report.rows.first()).toContainText(KNOWN_INSPECTOR);
    },
  );

  test(
    'ALL equals B2B plus Salvage for each inspector (summary arithmetic is consistent)',
    { tag: ['@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { inspectorReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();

      const rowTexts = await report.rows.allInnerTexts();
      expect(rowTexts.length).toBeGreaterThan(0);
      for (const text of rowTexts) {
        const numbers = text
          .split('\t')
          .map((cell) => cell.trim())
          .filter((cell) => /^\d+$/.test(cell))
          .map(Number);
        // Columns, in order: row #, inspector ID, B2B count, Salvage count, ALL count (the two
        // time columns are not plain digit strings, so the digit-only filter above already
        // excludes them).
        const [, , b2b, salvage, all] = numbers;
        expect(all, `row: ${text}`).toBe(b2b + salvage);
      }
    },
  );

  test(
    'The ALL drill-down link opens the Cars report pre-filtered by that inspector, in a new tab',
    { tag: ['@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { inspectorReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();

      // Confirmed live: this link has target="_blank" — it opens a new tab, it does not
      // navigate the current page.
      const [tab] = await Promise.all([
        qcSession.context().waitForEvent('page'),
        report.allCarsDrillDownLink(KNOWN_INSPECTOR).click(),
      ]);
      await tab.waitForLoadState('domcontentloaded');
      const { carsReportPage: carsReport } = inspectionPagesOn(tab);

      // The param is submitted URL-encoded as InspectionReportSearch[inspected_by]=5434, i.e.
      // "inspected_by%5D=5434" (confirmed live), not the bare "inspected_by=5434".
      await expect(tab).toHaveURL(/inspected_by(?:%5D|\])=5434/);
      const rowTexts = await carsReport.rows.allInnerTexts();
      expect(rowTexts.length).toBeGreaterThan(0);
      for (const text of rowTexts) {
        expect(text).toContain(KNOWN_INSPECTOR);
      }
    },
  );

  test(
    'Filtering by Inactive status narrows the list (confirmed live: every inspector here is Active)',
    { tag: ['@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { inspectorReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();
      const allCount = await report.rows.count();
      expect(allCount).toBeGreaterThan(0);

      await report.selectInspectorStatus('Inactive');
      await report.search();

      const inactiveCount = await report.rows.count();
      expect(inactiveCount).toBeLessThan(allCount);
    },
  );
});
