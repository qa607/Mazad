import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import { runPageChecks } from '../support/page-checks';
import { gotoGuest } from '../support/stabilize';
import { expectPageShot } from '../support/visual-assert';

/**
 * Registration: display, layout, localization and responsive checks only. No field is ever
 * submitted and Create Account/Verify are never clicked — the same boundary as the functional
 * suite (tests/website/registration.spec.ts), which this file shares no code with by design (the
 * UI layer uses its own lightweight locators, consistent with login.ui.spec.ts).
 *
 * Step 2 needs the app's own anonymous Firebase session to render (confirmed 2026-11-10, staging
 * project `mazad-v3`); the describe block below turns on the same narrowly scoped exception as
 * the functional suite (`allowFirebaseAnonymousSignup`), cleaned up automatically per test.
 *
 * Runs across every viewport × language project in playwright.ui.config.ts (Chromium: 1440, 1280,
 * 768, 390, 360; plus two Playwright-WebKit desktop projects — NOT real Safari, see that config's
 * comment). Neither step has an approved pixel baseline yet (`npm run ui:capture` + `ui:approve`
 * are still pending for this spec): Step 1 takes a page shot that will fail until a baseline is
 * captured and approved; Step 2 only runs the structural layout/l10n/geometry checks (horizontal
 * scroll, clipping, overlap, alignment, spacing, tap-target size, RTL/LTR order), which need no
 * baseline at all.
 */

const INDIVIDUAL_FIELDS = (page: Page) => [
  page.locator('#individual-registeration-name'),
  page.locator('#individual-registeration-mobile-number'),
  page.locator('#individual-registeration-password'),
];
const COMPANY_FIELDS = (page: Page) => [
  page.locator('#company-registeration-name'),
  page.locator('#company-registeration-iqama-number'),
  page.locator('#login-mobile-number'),
  page.locator('#create-new-password-input'),
  page.locator('#company-registeration-cr-number'),
  page.locator('#company-registeration-tax-number'),
];
const createAccountButton = (page: Page) =>
  page.locator('button.submit-btn', { hasText: /.+/ }).first();

test.describe('Registration', () => {
  test('step 1 (display only)', async ({ page, language, findings, networkLog }) => {
    await gotoGuest(page, `/${language}/signup/`);
    await expect(page).toHaveURL(new RegExp(`/${language}/signup/?$`));
    await expectPageShot(page, 'signup-step-1.png');
    await runPageChecks(page, findings, {
      screen: 'signup-step-1',
      form: {
        fields: [page.locator('label[for="individual"]'), page.locator('label[for="company"]')],
        primary: page.locator('button.submit-btn'),
      },
    });
    expect(networkLog.filter((e) => e.kind === 'unexpected')).toEqual([]);
  });

  test.describe('step 2', () => {
    test.use({ allowFirebaseAnonymousSignup: true });

    for (const accountType of ['individual', 'company'] as const) {
      test(`${accountType} step 2: layout, localization and form geometry`, async ({
        page,
        language,
        findings,
        networkLog,
      }) => {
        await gotoGuest(page, `/${language}/signup/`);
        await page.locator(`label[for="${accountType}"]`).click();
        await page.locator('button.submit-btn', { hasText: /.+/ }).click();
        await page.waitForURL(new RegExp(`/signup/${accountType}/?$`));

        const fields =
          accountType === 'individual' ? INDIVIDUAL_FIELDS(page) : COMPANY_FIELDS(page);
        await runPageChecks(page, findings, {
          screen: `signup-step-2-${accountType}`,
          form: { fields, primary: createAccountButton(page) },
        });
        expect(networkLog.filter((e) => e.kind === 'unexpected')).toEqual([]);
      });
    }

    test('individual step 2: City/Region dropdown opens without breaking layout', async ({
      page,
      language,
      findings,
      networkLog,
    }) => {
      await gotoGuest(page, `/${language}/signup/`);
      await page.locator('label[for="individual"]').click();
      await page.locator('button.submit-btn', { hasText: /.+/ }).click();
      await page.waitForURL(/\/signup\/individual\/?$/);

      await page.locator('app-dropdown .dropdown-container').click();
      await page.locator('.dropdown-item').first().waitFor({ state: 'visible' });
      // The panel's own open animation briefly leaves items mid-transition; wait it out before
      // measuring, or the layout check reads transient (not real) overlapping positions.
      await page
        .locator('.ng-animating')
        .waitFor({ state: 'detached', timeout: 2000 })
        .catch(() => {});
      await page.waitForTimeout(400);
      // The open option panel must not itself cause horizontal scroll or clip at narrow viewports.
      await runPageChecks(page, findings, { screen: 'signup-step-2-individual-city-open' });
      expect(networkLog.filter((e) => e.kind === 'unexpected')).toEqual([]);
    });
  });
});
