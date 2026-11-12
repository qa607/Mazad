import type { Browser, Page } from '@playwright/test';
import { SUPPLIER_MISSING_REASON, getSupplierAccount } from '@config/credentials.config';
import { signInFresh } from '@fixtures/backend-sign-in';
import { type BackendPages, expect, test } from '@fixtures/test.fixture';
import { asDevRoot } from '@fixtures/test-customers';
import type { ConfigPage } from '@pages/backend/config/config.page';
import {
  configSettings,
  configText as text,
  configUrls,
  rolesWithoutConfigAccess,
  steadySettings,
} from '@test-data/config.data';
import { type OperationData, newTestOperation } from '@test-data/operation.data';

/**
 * Mazad Backend > Global Settings > Config: who can open the page and save a setting. No role
 * has a /config route, so only Dev Root can. Each save attempt sends the setting's current
 * value (read as Dev Root), so even a wrongly accepted save would change nothing; the stored
 * values are checked afterwards. The operations are QA-AUTO records created and deleted here.
 */

// Real accounts sign in here: no trace or video, and only the masked failure screenshot.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

type PagesOn = (tab: Page) => BackendPages;
type States = Record<string, 'ON' | 'OFF'>;

/**
 * Every setting's stored state, read as Dev Root. Pass `steadyOnly` to leave out Can Fail Item,
 * which the save tests may flip at the same moment.
 */
async function storedStates(browser: Browser, pagesOn: PagesOn, steadyOnly = false) {
  return asDevRoot(browser, pagesOn, async ({ configPage }) => {
    await configPage.goto();
    const states: States = {};
    for (const setting of steadyOnly ? steadySettings : configSettings) {
      states[setting] = await configPage.storedState(setting);
    }
    return states;
  });
}

/**
 * Checks a signed-in account gets 403 for the page and for a save of every setting (sent with
 * its current value), and that no setting changed.
 */
async function expectConfigRefused(
  tab: Page,
  configPage: ConfigPage,
  browser: Browser,
  pagesOn: PagesOn,
) {
  const before = await storedStates(browser, pagesOn);
  expect(await configPage.goto()).toBe(403);
  await expect(tab).toHaveTitle(text.forbidden);
  await expect(configPage.switchInputs).toHaveCount(0);
  for (const setting of configSettings) {
    const result = await configPage.saveSetting(setting, before[setting] === 'ON' ? '1' : '0');
    expect(result.status, `save of ${setting}`).toBe(403);
  }
  const steady = (states: States) => Object.fromEntries(steadySettings.map((s) => [s, states[s]]));
  expect(await storedStates(browser, pagesOn, true)).toEqual(steady(before));
}

async function createOperation(browser: Browser, pagesOn: PagesOn, role: OperationData['role']) {
  const operation: OperationData = { ...newTestOperation(), role };
  const id = await asDevRoot(browser, pagesOn, async ({ operationFormPage, operationListPage }) => {
    await operationFormPage.gotoCreate();
    await operationFormPage.fill(operation);
    await operationFormPage.save();
    await operationListPage.open({ phone: operation.phone });
    return (await operationListPage.rowIds())[0];
  });
  if (!id) throw new Error(`Test operation ${operation.phone} was not created.`);
  return { ...operation, id };
}

test.describe('Config - access', { tag: ['@regression'] }, () => {
  test(
    'A signed-out visitor is sent to the login page, and a save is not accepted',
    { tag: ['@negative'] },
    async ({ page, browser, pagesOn, configPage }) => {
      const before = await storedStates(browser, pagesOn, true);
      await configPage.goto();
      await expect(page).toHaveURL(configUrls.login);

      for (const setting of steadySettings) {
        const result = await configPage.saveSetting(setting, before[setting] === 'ON' ? '1' : '0');
        expect(result.status, `save of ${setting}`).toBe(302);
      }
      expect(await storedStates(browser, pagesOn, true)).toEqual(before);
    },
  );

  test(
    'A supplier account cannot open the page or save a setting',
    { tag: ['@negative'] },
    async ({ browser, pagesOn }) => {
      const supplier = getSupplierAccount();
      test.skip(!supplier, SUPPLIER_MISSING_REASON);
      const signIn = await signInFresh(browser, pagesOn, supplier!.phone, supplier!.password);
      expect(signIn.error).toBeNull();

      const { configPage } = pagesOn(signIn.tab);
      await expectConfigRefused(signIn.tab, configPage, browser, pagesOn);
      await signIn.context.close();
    },
  );
});

test.describe('Config - access of operation accounts', { tag: ['@regression', '@mutates'] }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  const operations: (OperationData & { id: string })[] = [];

  test.afterAll(async ({ browser, pagesOn }) => {
    await asDevRoot(browser, pagesOn, async ({ operationListPage: list }) => {
      for (const operation of operations) {
        await list.open({ phone: operation.phone });
        for (const row of await list.readRows()) {
          if (row['English Name'] === operation.nameEn) await list.deleteById(row.ID);
        }
      }
    });
  });

  for (const role of rolesWithoutConfigAccess) {
    test(
      `An operation with the ${role} role cannot open the page or save a setting`,
      { tag: ['@negative'] },
      async ({ browser, pagesOn }) => {
        test.setTimeout(90_000);
        const operation = await createOperation(browser, pagesOn, role);
        operations.push(operation);
        const signIn = await signInFresh(browser, pagesOn, operation.phone, operation.password);
        expect(signIn.error).toBeNull();

        const { configPage } = pagesOn(signIn.tab);
        await expectConfigRefused(signIn.tab, configPage, browser, pagesOn);
        await signIn.context.close();
      },
    );
  }
});
