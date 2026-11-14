import { expect, test } from '@fixtures/inspection.fixture';
import { designatedVehicle } from '@test-data/inspection/waiting-for-qc.data';

/**
 * Mazad Inspection backend > Report by Cars (/report/inspection, stg-224-inspection). Read-only
 * throughout: this report has no per-row navigation link at all (confirmed live 2026-11-11 — the
 * only available action is CSV/Excel export), so there is nothing to "view" or edit here.
 */
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Inspection Backend - Report by Cars', { tag: ['@regression'] }, () => {
  test(
    'The report loads with the correct title and grid',
    { tag: ['@smoke', '@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { carsReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();

      await expect(qcSession).toHaveTitle('Report by cars');
      await expect(report.grid).toBeVisible();
      await expect(report.summary).toBeVisible();
      await expect(report.pagination).toBeVisible();
    },
  );

  test(
    'No row offers a view/edit action — export is the only available action',
    { tag: ['@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { carsReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();

      await expect(report.rows.first().locator('a')).toHaveCount(0);
      await expect(report.exportMenuToggle).toBeVisible();
    },
  );

  test.describe('Filters', { tag: ['@functional'] }, () => {
    test('Inspector filters to exactly that inspector’s rows', async ({
      qcSession,
      inspectionPagesOn,
    }) => {
      const { carsReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();

      await report.selectInspector('Ahmed Othman');
      await report.search();

      const counts = await report.summaryCounts();
      expect(counts.total).toBe(1285); // matches the Inspector Report's own "ALL" total for him.
      const rowTexts = await report.rows.allInnerTexts();
      for (const text of rowTexts) expect(text).toContain('Ahmed Othman');
    });

    test('An unknown VIN (not 17 characters) shows no results, handled correctly', async ({
      qcSession,
      inspectionPagesOn,
    }) => {
      const { carsReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();

      // Deliberately not 17 characters — see the dedicated defect test below for why.
      await report.vinInput.fill('NOVIN0000000NOTREAL');
      await report.search();

      await expect(report.summary).toHaveCount(0);
      await expect(report.emptyMessage).toBeVisible();
    });

    test('Reset restores the unfiltered report', async ({ qcSession, inspectionPagesOn }) => {
      const { carsReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();
      const unfiltered = (await report.summaryCounts()).total;

      await report.selectInspector('Ahmed Othman');
      await report.search();
      expect((await report.summaryCounts()).total).toBe(1285);

      await report.reset();

      expect((await report.summaryCounts()).total).toBe(unfiltered);
    });

    test(
      'VIN filter should narrow to the one matching vehicle (currently broken for 17-character VINs)',
      { tag: ['@known-bug'] },
      async ({ qcSession, inspectionPagesOn }) => {
        // Known defect, confirmed live 2026-11-11 (see this milestone's defect report): a full,
        // real 17-character VIN is silently ignored by this filter — the unfiltered total comes
        // back instead, with no error. A 16-character VIN (one character removed) filters
        // correctly, isolating the defect to inputs of exactly 17 characters (the real VIN
        // length). Remove test.fail() once the backend fixes this.
        test.fail(true, 'Known defect: the VIN filter is silently ignored for a 17-character VIN.');

        const { carsReportPage: report } = inspectionPagesOn(qcSession);
        await report.goto();

        await report.vinInput.fill(designatedVehicle.vin);
        await report.search();

        const counts = await report.summaryCounts();
        expect(counts.total).toBe(1);
        await expect(report.rows.first()).toContainText(designatedVehicle.vin);
      },
    );
  });

  test(
    'Exporting as CSV should download a file (currently does nothing at all)',
    { tag: ['@known-bug'] },
    async ({ qcSession, inspectionPagesOn }) => {
      // Known defect, confirmed live 2026-11-11 (see this milestone's defect report): clicking
      // the real CSV export link produces zero network activity — no request, no new tab, no
      // download — not a Playwright/selector issue (confirmed: the dropdown opens correctly and
      // the link is clicked directly by its real id, #w1-csv). Remove test.fail() once fixed.
      test.fail(true, 'Known defect: the CSV/Excel export buttons on this report do nothing.');

      const { carsReportPage: report } = inspectionPagesOn(qcSession);
      await report.goto();
      await report.selectInspector('Ahmed Othman');
      await report.search();

      // Short explicit timeout: the point is to fail deterministically within the test body
      // (status "failed", matching test.fail()'s expectation) rather than via the whole test's
      // 30s timeout (status "timedOut", which test.fail() does not treat as an expected failure).
      const download = await report.exportAs('CSV', 5000);

      expect(download.suggestedFilename()).toMatch(/\.csv$/i);
    },
  );
});
