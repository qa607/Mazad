import type { Page } from '@playwright/test';
import { expect, test as base } from '@playwright/test';
import {
  getInspectionAdminAccount,
  getInspectionInspectorTestAccount,
  getInspectionQaAccount,
  getInspectionQcTestAccount,
  INSPECTION_ADMIN_MISSING_REASON,
  INSPECTION_INSPECTOR_TEST_MISSING_REASON,
  INSPECTION_QA_MISSING_REASON,
  INSPECTION_QC_TEST_MISSING_REASON,
  type InspectionAccount,
} from '@config/credentials.config';
import { InspectionLoginPage } from '@pages/inspection/auth/inspection-login.page';
import { InspectionDashboardPage } from '@pages/inspection/dashboard/inspection-dashboard.page';
import { QcListPage } from '@pages/inspection/qc/qc-list.page';
import { QcFormPage } from '@pages/inspection/qc/qc-form.page';
import { QcViewPage } from '@pages/inspection/qc/qc-view.page';
import { InspectorListPage } from '@pages/inspection/inspector/inspector-list.page';
import { InspectorFormPage } from '@pages/inspection/inspector/inspector-form.page';
import { InspectorViewPage } from '@pages/inspection/inspector/inspector-view.page';
import { WaitingForQcListPage } from '@pages/inspection/vehicle/waiting-for-qc-list.page';
import { VehicleViewPage } from '@pages/inspection/vehicle/vehicle-view.page';
import { VehicleEditPage } from '@pages/inspection/vehicle/vehicle-edit.page';
import { VehicleInspectionPage } from '@pages/inspection/vehicle/vehicle-inspection.page';
import { CarsReportPage } from '@pages/inspection/reports/cars-report.page';
import { InspectorReportPage } from '@pages/inspection/reports/inspector-report.page';
import { inspectionUrls } from '@test-data/inspection/inspection-login.data';

interface InspectionPages {
  inspectionLoginPage: InspectionLoginPage;
  inspectionDashboardPage: InspectionDashboardPage;
  waitingForQcListPage: WaitingForQcListPage;
  vehicleViewPage: VehicleViewPage;
  vehicleEditPage: VehicleEditPage;
  vehicleInspectionPage: VehicleInspectionPage;
  carsReportPage: CarsReportPage;
  inspectorReportPage: InspectorReportPage;
}

/** Binds the Inspection page objects to an arbitrary Page, for a fresh browser context opened
 * within a test (e.g. to sign in as a different account without the current session's cookies). */
function createInspectionPages(page: Page): InspectionPages {
  return {
    inspectionLoginPage: new InspectionLoginPage(page),
    inspectionDashboardPage: new InspectionDashboardPage(page),
    waitingForQcListPage: new WaitingForQcListPage(page),
    vehicleViewPage: new VehicleViewPage(page),
    vehicleEditPage: new VehicleEditPage(page),
    vehicleInspectionPage: new VehicleInspectionPage(page),
    carsReportPage: new CarsReportPage(page),
    inspectorReportPage: new InspectorReportPage(page),
  };
}

/**
 * Fixtures for the Mazad Inspection backend (stg-224-inspection): a separate Yii2 application on
 * its own domain, so this extends @playwright/test directly rather than test.fixture.ts/
 * website.fixture.ts — reusing those would install the main Backend's request guard and account
 * lookups, which are scoped to the main site's host and would wrongly block every Inspection
 * request. This backend has no localization (confirmed 2026-11-11, same as the main Backend), so
 * there is no language option here.
 */
interface InspectionFixtures {
  inspectionLoginPage: InspectionLoginPage;
  inspectionDashboardPage: InspectionDashboardPage;
  qcListPage: QcListPage;
  qcFormPage: QcFormPage;
  qcViewPage: QcViewPage;
  /**
   * Deletes QC users created during a test, by id, once it ends (whether it passed or failed).
   * Tests call qcCleanup.track(id) right after creating a record; never used for the two
   * pre-existing QC records.
   */
  qcCleanup: { track: (id: string) => void };
  inspectorListPage: InspectorListPage;
  inspectorFormPage: InspectorFormPage;
  inspectorViewPage: InspectorViewPage;
  /**
   * Deletes Inspectors created during a test, by id, once it ends (whether it passed or failed).
   * Tests call inspectorCleanup.track(id) right after creating a record; never used for the real
   * pre-existing Inspectors or the dedicated persistent test account.
   */
  inspectorCleanup: { track: (id: string) => void };
  /** The Inspection Admin (Super Admin) account from .env. Tests using it are skipped when unset. */
  inspectionAdmin: InspectionAccount;
  /**
   * A staging Inspection account with QA-level access, for permission checks. Not yet available
   * (as of this module's first milestone): tests using it are skipped until it is set in .env.
   */
  inspectionQa: InspectionAccount;
  /** The dedicated, persistent "QA-AUTO QC TEST" QC User account (id 5480). Tests using it are
   * skipped when unset. */
  inspectionQcTest: InspectionAccount;
  /** The dedicated, persistent "QA-AUTO INSPECTOR TEST" Inspector account (id 5485). Tests using
   * it are skipped when unset. */
  inspectionInspectorTest: InspectionAccount;
  /** Binds the Inspection page objects to an arbitrary Page (see createInspectionPages). */
  inspectionPagesOn: (page: Page) => InspectionPages;
  /**
   * A Page signed in as the dedicated QC test account, in its own fresh browser context (no
   * Admin session cookies). The context is closed once the test ends. Skipped when
   * inspectionQcTest is unset.
   */
  qcSession: Page;
}

export const test = base.extend<InspectionFixtures>({
  inspectionLoginPage: async ({ page }, use) => {
    await use(new InspectionLoginPage(page));
  },
  inspectionDashboardPage: async ({ page }, use) => {
    await use(new InspectionDashboardPage(page));
  },
  qcListPage: async ({ page }, use) => {
    await use(new QcListPage(page));
  },
  qcFormPage: async ({ page }, use) => {
    await use(new QcFormPage(page));
  },
  qcViewPage: async ({ page }, use) => {
    await use(new QcViewPage(page));
  },
  qcCleanup: async ({ qcListPage }, use) => {
    const ids = new Set<string>();
    await use({ track: (id) => ids.add(id) });
    for (const id of ids) {
      await qcListPage.goto();
      const row = qcListPage.row(id);
      if (await row.count()) await qcListPage.startDeleteAndConfirm(row);
    }
  },
  inspectorListPage: async ({ page }, use) => {
    await use(new InspectorListPage(page));
  },
  inspectorFormPage: async ({ page }, use) => {
    await use(new InspectorFormPage(page));
  },
  inspectorViewPage: async ({ page }, use) => {
    await use(new InspectorViewPage(page));
  },
  inspectorCleanup: async ({ inspectorListPage }, use) => {
    const ids = new Set<string>();
    await use({ track: (id) => ids.add(id) });
    for (const id of ids) {
      await inspectorListPage.goto();
      const row = inspectorListPage.row(id);
      if (await row.count()) await inspectorListPage.startDeleteAndConfirm(row);
    }
  },
  // eslint-disable-next-line no-empty-pattern
  inspectionAdmin: async ({}, use, testInfo) => {
    const account = getInspectionAdminAccount();
    testInfo.skip(!account, INSPECTION_ADMIN_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
  // eslint-disable-next-line no-empty-pattern
  inspectionQa: async ({}, use, testInfo) => {
    const account = getInspectionQaAccount();
    testInfo.skip(!account, INSPECTION_QA_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
  // eslint-disable-next-line no-empty-pattern
  inspectionQcTest: async ({}, use, testInfo) => {
    const account = getInspectionQcTestAccount();
    testInfo.skip(!account, INSPECTION_QC_TEST_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
  // eslint-disable-next-line no-empty-pattern
  inspectionInspectorTest: async ({}, use, testInfo) => {
    const account = getInspectionInspectorTestAccount();
    testInfo.skip(!account, INSPECTION_INSPECTOR_TEST_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
  // eslint-disable-next-line no-empty-pattern
  inspectionPagesOn: async ({}, use) => {
    await use(createInspectionPages);
  },
  qcSession: async ({ browser, inspectionQcTest, inspectionPagesOn }, use) => {
    const context = await browser.newContext();
    const qcPage = await context.newPage();
    const { inspectionLoginPage } = inspectionPagesOn(qcPage);
    await inspectionLoginPage.goto();
    await inspectionLoginPage.loginAs(inspectionQcTest);
    // Logging in has no explicit navigation wait of its own (see InspectionLoginPage.submit), so
    // the next action a test takes could otherwise race the login's own in-flight navigation.
    await qcPage.waitForURL(inspectionUrls.dashboard);
    await use(qcPage);
    await context.close();
  },
});

export { expect };
