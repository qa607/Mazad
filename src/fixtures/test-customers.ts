import type { Browser, Page } from '@playwright/test';
import { DEV_ROOT_SESSION_FILE } from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import type { BackendPages } from '@fixtures/test.fixture';
import {
  type CustomerData,
  type CustomerSection,
  newTestCustomer,
  testCityId,
} from '@test-data/deleted-user.data';

type PagesOn = (tab: Page) => BackendPages;

export interface TestCustomer extends CustomerData {
  kind: CustomerSection;
  id: string;
}

/** Runs `work` in a Dev Root tab of its own browser context, closed afterwards. */
export async function asDevRoot<T>(
  browser: Browser,
  pagesOn: PagesOn,
  work: (pages: BackendPages) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({
    baseURL: envConfig.baseURL,
    storageState: DEV_ROOT_SESSION_FILE,
  });
  try {
    return await work(pagesOn(await context.newPage()));
  } finally {
    await context.close();
  }
}

/**
 * Creates a QA-AUTO customer as Dev Root. Every customer starts as a dealer; an individual is
 * then converted with "Convert user type", because Create Individual never saves on staging.
 */
export async function createTestCustomer(
  browser: Browser,
  pagesOn: PagesOn,
  kind: CustomerSection,
): Promise<TestCustomer> {
  const customer = newTestCustomer(kind);
  return asDevRoot(
    browser,
    pagesOn,
    async ({ dealerFormPage, dealerListPage, individualListPage }) => {
      await dealerFormPage.gotoCreate();
      await dealerFormPage.fill(customer, testCityId);
      await dealerFormPage.save();
      await dealerListPage.open({ phone: customer.phone });
      let [id] = await dealerListPage.rowIds();
      if (!id) throw new Error(`Test dealer ${customer.phone} was not created.`);
      if (kind === 'individual') {
        await dealerListPage.convertToIndividual(id);
        await individualListPage.open({ phone: customer.phone });
        [id] = await individualListPage.rowIds();
        if (!id)
          throw new Error(`Test customer ${customer.phone} was not converted to Individual.`);
      }
      return { ...customer, kind, id };
    },
  );
}

/**
 * Deletes, as Dev Root, any of these QA-AUTO customers still listed in Individual or Dealers
 * (cleanup after a failed step). Deleted customers stay in Deleted Users.
 */
export async function deleteTestCustomers(
  browser: Browser,
  pagesOn: PagesOn,
  customers: TestCustomer[],
): Promise<void> {
  await asDevRoot(browser, pagesOn, async ({ individualListPage, dealerListPage }) => {
    for (const customer of customers) {
      for (const list of [individualListPage, dealerListPage]) {
        await list.open({ phone: customer.phone });
        for (const id of await list.rowIds()) {
          if (customer.nameEn.startsWith('QA-AUTO')) await list.deleteUser(id);
        }
      }
    }
  });
}
