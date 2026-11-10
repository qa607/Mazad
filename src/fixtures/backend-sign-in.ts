import type { Browser, BrowserContext, Page } from '@playwright/test';
import { BackendAccount } from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import type { BackendPages } from '@fixtures/test.fixture';

/** Result of a sign-in in a fresh, signed-out browser. */
export interface FreshSignIn {
  /** null when the sign-in succeeded, otherwise the error the login page shows. */
  error: string | null;
  /** The tab, signed in or not; close `context` when done. */
  tab: Page;
  context: BrowserContext;
}

/**
 * Signs in to the Backend in a new, signed-out browser context, for checks that need another
 * account (a test admin, a deleted or inactive one). The credentials are typed without
 * appearing in reports.
 */
export async function signInFresh(
  browser: Browser,
  pagesOn: (tab: Page) => BackendPages,
  phone: string,
  password: string,
): Promise<FreshSignIn> {
  const context = await browser.newContext({
    baseURL: envConfig.baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const tab = await context.newPage();
  const { mazadLoginPage: login } = pagesOn(tab);
  await login.goto();
  await Promise.all([tab.waitForEvent('load'), login.loginAs(new BackendAccount(phone, password))]);
  const signedIn = !(await login.form.isVisible());
  const errors = [
    ...(await login.phoneError.allInnerTexts()),
    ...(await login.passwordError.allInnerTexts()),
  ]
    .map((error) => error.trim())
    .filter(Boolean)
    .join(' ');
  return { error: signedIn ? null : errors, tab, context };
}

/** Signs in in a fresh browser and closes it; returns null on success, else the error shown. */
export async function signInError(
  browser: Browser,
  pagesOn: (tab: Page) => BackendPages,
  phone: string,
  password: string,
): Promise<string | null> {
  const { error, context } = await signInFresh(browser, pagesOn, phone, password);
  await context.close();
  return error;
}
