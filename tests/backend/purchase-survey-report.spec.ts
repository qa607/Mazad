import { expect, test } from '@fixtures/test.fixture';
import type { SurveyRow } from '@pages/backend/reports/purchase-survey-report.page';
import {
  purchaseSurveyData,
  purchaseSurveyText,
  purchaseSurveyUrls,
} from '@test-data/backend-purchase-survey-report.data';

// Report > Purchase Survey (/backend/report/purchase-survey-report/index): buyers' answers to
// the post-purchase survey (three scores and an optional free-text answer). Read-only. Filter
// values are taken from the rows listed at the time; customer names stay out of test titles.

test.use({ signedInAs: 'devRoot', trace: 'off', video: 'off', screenshot: 'off' });

const { maxScore } = purchaseSurveyData;

test.describe('Backend - Purchase Survey report', () => {
  test.beforeEach(async ({ page, purchaseSurveyReportPage }) => {
    await purchaseSurveyReportPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(purchaseSurveyUrls.list);
  });

  test('Report shows the heading, filters and the survey answers grid', async ({
    page,
    purchaseSurveyReportPage: report,
  }) => {
    await expect(page).toHaveTitle(purchaseSurveyText.pageTitle);
    await expect(report.pageHeading).toHaveText(purchaseSurveyText.pageTitle);
    await expect(report.breadcrumbCurrent).toHaveText(purchaseSurveyText.pageTitle);
    await expect(report.sidebarLink).toHaveText(purchaseSurveyText.sidebarLabel);

    await expect(report.fromAnswerInput).toBeEditable();
    await expect(report.toAnswerInput).toBeEditable();
    await expect(report.searchButton).toBeEnabled();
    await expect(report.exportAllButton).toBeVisible();

    await expect(report.columnHeaders).toHaveText([...purchaseSurveyText.columnHeaders]);
    await expect(report.summary).toHaveText(
      new RegExp(`^Showing 1-${purchaseSurveyData.pageSize} of [\\d,]+ items\\.$`),
    );
  });

  test.describe('answers (every survey on the first page)', () => {
    test('Each survey has all three scores, within their scales', async ({
      purchaseSurveyReportPage: report,
    }) => {
      const rows = await report.readRows();

      const outOfRange = (row: SurveyRow) =>
        (['easeOfUse', 'satisfaction', 'recommend'] as const).filter((question) => {
          const answer = row[question];
          return (
            !answer ||
            answer.outOf !== maxScore[question] ||
            answer.score < 1 ||
            answer.score > maxScore[question]
          );
        });
      const broken = rows
        .map((row) => ({ survey: row.key, questions: outOfRange(row) }))
        .filter((entry) => entry.questions.length > 0);
      expect(broken).toEqual([]);
    });

    test('Surveys are listed newest first', async ({ purchaseSurveyReportPage: report }) => {
      const dates = (await report.readRows()).map((row) => row.createdAt);

      expect(dates).toEqual([...dates].sort().reverse());
    });
  });

  test.describe('filters', () => {
    test('Customer Type splits the surveys into Individual and Dealer', async ({
      purchaseSurveyReportPage: report,
    }) => {
      const total = await report.totalCount();
      let sum = 0;

      for (const type of purchaseSurveyText.customerTypes) {
        await test.step(type, async () => {
          await report.filterByCustomerType(type);

          await expect(report.customerTypeValue).toContainText(type);
          const types = (await report.readRows()).map((row) => row.customerType);
          expect(types.filter((shown) => shown !== type)).toEqual([]);
          sum += await report.totalCount();
        });
      }

      expect(sum, 'Individual + Dealer surveys').toBe(total);
    });

    test('Supplier shows only that supplier’s surveys', async ({
      purchaseSurveyReportPage: report,
    }) => {
      const [first] = await report.readRows();

      await report.filterBySupplier(new RegExp(`^\\s*${first.supplier} - Supplier\\s*$`));

      await expect(report.supplierValue).toContainText(first.supplier);
      const suppliers = (await report.readRows()).map((row) => row.supplier);
      expect(suppliers.filter((shown) => shown !== first.supplier)).toEqual([]);
      await expect(report.row(first.key)).toHaveCount(1);
    });

    test('Item title shows only surveys of that item', async ({
      purchaseSurveyReportPage: report,
    }) => {
      const [first] = await report.readRows();

      await report.filterByItemTitle(first.itemTitle);

      const titles = (await report.readRows()).map((row) => row.itemTitle);
      expect(titles.length).toBeGreaterThan(0);
      expect(titles.filter((shown) => shown !== first.itemTitle)).toEqual([]);
    });

    test('Customer name shows only that customer’s surveys', async ({
      purchaseSurveyReportPage: report,
    }) => {
      const [first] = await report.readRows();

      await report.filterByCustomerName(first.customerName);

      await expect(report.row(first.key)).toHaveCount(1);
      const names = (await report.readRows()).map((row) => row.customerName);
      expect(names.filter((shown) => shown !== first.customerName)).toEqual([]);
    });

    test('A score range on one question keeps only scores in that range', async ({
      purchaseSurveyReportPage: report,
    }) => {
      await test.step(`Ease of use from ${purchaseSurveyData.topEaseOfUse} to ${purchaseSurveyData.topEaseOfUse}`, async () => {
        await report.filterByAnswer(
          'easeOfUse',
          purchaseSurveyData.topEaseOfUse,
          purchaseSurveyData.topEaseOfUse,
        );
        const scores = (await report.readRows()).map((row) => row.easeOfUse?.score);
        expect(scores.length).toBeGreaterThan(0);
        expect(scores.filter((score) => score !== Number(purchaseSurveyData.topEaseOfUse))).toEqual(
          [],
        );
      });

      await test.step(`Recommend from ${purchaseSurveyData.lowRecommendFrom} to ${purchaseSurveyData.lowRecommendTo}`, async () => {
        await report.reset();
        await report.filterByAnswer(
          'recommend',
          purchaseSurveyData.lowRecommendFrom,
          purchaseSurveyData.lowRecommendTo,
        );
        const scores = (await report.readRows()).map((row) => row.recommend?.score ?? -1);
        expect(scores.length).toBeGreaterThan(0);
        expect(scores.filter((score) => score > Number(purchaseSurveyData.lowRecommendTo))).toEqual(
          [],
        );
      });
    });

    test('The "Other" question shows only surveys with a free-text answer', async ({
      purchaseSurveyReportPage: report,
    }) => {
      const total = await report.totalCount();

      await report.filterByAnswer('other');

      expect(await report.totalCount()).toBeLessThan(total);
      const others = (await report.readRows()).map((row) => row.other);
      expect(others.filter((text) => text === '')).toEqual([]);
    });

    test('An inverted score range is refused before searching', async ({
      page,
      purchaseSurveyReportPage: report,
    }) => {
      await report.enterAnswerFilter(
        'easeOfUse',
        purchaseSurveyData.invertedFrom,
        purchaseSurveyData.invertedTo,
      );

      await report.searchButton.click();

      await expect(report.toAnswerError).toHaveText(purchaseSurveyText.toBelowFrom);
      // The form is not sent: the address keeps no filter.
      await expect(page).toHaveURL(/\/backend\/report\/purchase-survey-report\/index$/);
    });

    test('A non-numeric score is refused with a fitting message', async ({
      page,
      purchaseSurveyReportPage: report,
    }) => {
      await report.enterAnswerFilter(
        'easeOfUse',
        purchaseSurveyData.nonNumeric,
        purchaseSurveyData.topEaseOfUse,
      );

      await report.searchButton.click();

      // It is refused (the form is not sent) ...
      await expect(report.fromAnswerError).not.toHaveText('');
      await expect(page).toHaveURL(/\/backend\/report\/purchase-survey-report\/index$/);
      // ... but, known gap (found 2026-11-09), the message reads "From Answer cannot be blank."
      // although the field holds "abc". Remove test.fail() once it says the value is not a number.
      test.fail(true, 'Known gap: a non-numeric score is reported as blank.');
      await expect(report.fromAnswerError).not.toHaveText(purchaseSurveyText.fromBlank);
    });

    test('Reset clears the filters', async ({ page, purchaseSurveyReportPage: report }) => {
      const total = await report.totalCount();
      await report.filterByCustomerType('Dealer');
      expect(await report.totalCount()).toBeLessThan(total);

      await report.reset();

      await expect(page).toHaveURL(/\/backend\/report\/purchase-survey-report\/index$/);
      expect(await report.totalCount()).toBe(total);
    });
  });

  test('Page 2 shows the next 20 surveys', async ({ page, purchaseSurveyReportPage: report }) => {
    const firstPageIds = await report.rowIds();

    await report.goToPage(2);

    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(report.summary).toHaveText(/^Showing 21-40 of [\d,]+ items\.$/);
    const secondPageIds = await report.rowIds();
    expect(secondPageIds.filter((id) => firstPageIds.includes(id))).toEqual([]);
  });

  test('Export CSV answers without a server error', async ({
    purchaseSurveyReportPage: report,
  }) => {
    // Known bug (found 2026-11-09): Export All > CSV > Ok answers HTTP 500 and shows an "Error"
    // page instead of downloading the file (the Auction Closed report exports fine). Remove
    // test.fail() once the export works.
    test.fail(true, 'Known bug: the Purchase Survey CSV export answers HTTP 500.');

    const response = await report.requestCsvExport();

    expect(response.status(), 'export HTTP status').toBe(200);
  });
});
