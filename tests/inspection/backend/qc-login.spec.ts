import { expect, test } from '@fixtures/inspection.fixture';
import { inspectionUrls } from '@test-data/inspection/inspection-login.data';
import {
  qcAccessiblePaths,
  qcForbiddenPaths,
  qcRoleText,
} from '@test-data/inspection/qc-role.data';

/**
 * Mazad Inspection backend > QC User login and permission boundaries (stg-224-inspection). Uses
 * the dedicated, persistent "QA-AUTO QC TEST" account (id 5480, see qcSession/inspectionQcTest in
 * inspection.fixture.ts) — never the disposable records QC CRUD tests create and delete, and
 * never the two real pre-existing QC records. Every QC sign-in happens in its own fresh browser
 * context (qcSession), so no test ever reuses an Admin session's cookies.
 */
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe(
  'Inspection Backend - QC User login and permissions',
  { tag: ['@regression'] },
  () => {
    test(
      'The dedicated QC test account signs in from a fresh context, after an Admin session logs out, and is recognized as QC',
      { tag: ['@smoke', '@functional'] },
      async ({
        page,
        browser,
        inspectionLoginPage,
        inspectionDashboardPage,
        qcListPage,
        inspectionAdmin,
        inspectionQcTest,
        inspectionPagesOn,
      }) => {
        await test.step('Admin confirms the dedicated QC test account exists (read-only)', async () => {
          await inspectionLoginPage.goto();
          await inspectionLoginPage.loginAs(inspectionAdmin);
          await expect(page).toHaveURL(inspectionUrls.dashboard);

          await qcListPage.goto();
          await expect(qcListPage.rows.filter({ hasText: 'QA-AUTO QC TEST' })).toHaveCount(1);
        });

        await test.step('Admin logs out', async () => {
          // The QC list page also loads dialog-yii.js (see InspectionConfirmDialog), which
          // overrides yii.confirm for the whole page, including the logout link's data-confirm —
          // so logging out must happen from the Dashboard, where that script is not loaded and
          // the native confirm() dialog InspectionDashboardPage.logout() expects is the real one.
          await inspectionDashboardPage.goto();
          await inspectionDashboardPage.logout();
          await expect(page).toHaveURL(inspectionUrls.login);
        });

        await test.step('QC signs in from a fresh browser context and is recognized as QC, not Super Admin', async () => {
          const qcContext = await browser.newContext();
          try {
            const qcPage = await qcContext.newPage();
            const { inspectionLoginPage: qcLogin, inspectionDashboardPage: qcDashboard } =
              inspectionPagesOn(qcPage);

            await qcLogin.goto();
            await qcLogin.loginAs(inspectionQcTest);

            await expect(qcPage).toHaveURL(inspectionUrls.dashboard);
            await qcDashboard.openUserMenu();
            await expect(qcDashboard.accountDetails).toContainText(qcRoleText.roleSuffix);
            await expect(qcDashboard.accountDetails).not.toContainText('Super Admin');
          } finally {
            await qcContext.close();
          }
        });
      },
    );

    test(
      "QC's sidebar has no Admin-only Users menu (QC Users / Inspectors)",
      { tag: ['@functional'] },
      async ({ qcSession, inspectionPagesOn }) => {
        const { inspectionDashboardPage } = inspectionPagesOn(qcSession);

        // By href, not link text: the sidebar's own "Reports > By Inspectors" report link
        // (/report/inspector) is legitimately present for QC and also contains the word
        // "Inspectors", so a text-only check would be a false positive.
        await expect(
          inspectionDashboardPage.sidebar.locator('a[href="/operation/index"]'),
        ).toHaveCount(0);
        await expect(
          inspectionDashboardPage.sidebar.locator('a[href="/inspector/index"]'),
        ).toHaveCount(0);
      },
    );

    test.describe('QC permission boundaries', { tag: ['@negative'] }, () => {
      for (const path of qcForbiddenPaths) {
        test(`QC gets a real server-enforced 403 opening the Admin-only ${path}`, async ({
          qcSession,
        }) => {
          await qcSession.goto(path, { waitUntil: 'domcontentloaded' });

          await expect(qcSession.getByText(qcRoleText.forbiddenDetail)).toBeVisible();
          await expect(qcSession).toHaveURL(new RegExp(`${path}$`));
        });
      }
    });

    test(
      'QC can open every page its own sidebar links to',
      { tag: ['@functional'] },
      async ({ qcSession }) => {
        for (const path of qcAccessiblePaths) {
          await qcSession.goto(path, { waitUntil: 'domcontentloaded' });

          await expect(qcSession.getByText(qcRoleText.forbiddenDetail)).toHaveCount(0);
          await expect(qcSession).not.toHaveURL(inspectionUrls.login);
        }
      },
    );
  },
);
