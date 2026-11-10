import type { TestInfo } from '@playwright/test';
import { inventory } from '@mobile/ios/ios-inspection';
import type { IosDriver } from '@mobile/ios/ios.session';
import { parseIosSource } from '@mobile/ios/page-source';
import type { IosAppShellScreen } from '@mobile/ios/screens/app-shell.screen';
import type { IosLoginScreen } from '@mobile/ios/screens/login.screen';
import { type IosAppText, iosAppText } from '@test-data/ios-app.data';
import type { Language } from '@typings';
import { categoryAnnotations } from '@utils/test-category';

import { IOS_ACCESSIBILITY_IDS as IDS } from '@mobile/ios/ios-selectors';

/**
 * A password ONE character shorter than the backend's CONFIRMED minimum length (X1, recorded in
 * config/ios-account-policy.ts). Never a number taken from the website. Deterministic, mixed
 * character classes, so only the length is below the rule; if the confirmed rules show other
 * constraints, the value must be revisited. Requires `minimum >= 2` (a shorter value would be empty).
 */
export function passwordBelowMinimum(minimum: number): string {
  if (!Number.isInteger(minimum) || minimum < 2) {
    throw new Error('The confirmed minimum leaves no non-empty password below it.');
  }
  const pool = 'Aa1!bC2@dE3#fG4$hI5%jK6^lM7&nO8*pQ9(';
  return pool.repeat(Math.ceil((minimum - 1) / pool.length)).slice(0, minimum - 1);
}

/** How long to wait, after saving an invalid password, before checking the screen did not change. */
export const REJECTION_SETTLE_MS = 4_000;

/** Shared by the iOS specs (not a spec file: no tests here). */
export const SERVER_RESPONSE_TIMEOUT = 20_000;
export const LANGUAGES: Language[] = ['en', 'ar'];

const LANGUAGE_OPTIONS = {
  en: iosAppText('en').languageOption,
  ar: iosAppText('ar').languageOption,
};
/** Tab labels per language: the app may start in either language, so both are always known. */
export const HOME_TABS = { en: iosAppText('en').tabs.home, ar: iosAppText('ar').tabs.home };
export const MORE_TABS = { en: iosAppText('en').tabs.more, ar: iosAppText('ar').tabs.more };
export { LANGUAGE_OPTIONS };

/**
 * Detects the app's current language (it may start in either), switches to `language` when
 * needed, requires guest state (never signs out), and opens the login form.
 */
export async function openGuestLoginForm(
  appShell: IosAppShellScreen,
  loginScreen: IosLoginScreen,
  language: Language,
  text: IosAppText,
): Promise<void> {
  await appShell.setLanguage(language, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
  await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);
  await loginScreen.openLoginForm(text.guestPrompt, text.entryChoiceLogin);
  // Waits for the form and checks it has exactly one phone and one password field.
  await loginScreen.waitForForm();
}

/**
 * Controls the app does not expose with an accessibility id (inspected 2026-11-09): tests that
 * need one are declared pending (fixme) while its id is not recorded in the selector registry,
 * and run automatically once it is. They are never located by position, index or guessed text.
 * See docs/ios-accessibility-ids-request.md.
 */
const pendingReason = (id: string, control: string) =>
  id
    ? undefined
    : `Pending: ${control} has no recorded accessibility id (docs/ios-accessibility-ids-request.md); it is not located by position or text.`;
export const PASSWORD_TOGGLE_PENDING = pendingReason(
  IDS.login.passwordVisibilityToggle,
  'the Login password visibility control',
);

/**
 * Test details that record why a test is pending: the pending-selector note and the typed
 * category (src/utils/test-category.ts), with the full text gate as a further blocker.
 */
export const pendingDetails = (reason: string | undefined, textGate?: string) =>
  reason
    ? {
        annotation: [
          { type: 'pending-selector', description: reason },
          ...categoryAnnotations({ pending: reason, textGate }),
        ],
      }
    : {};

/** Enabled state of a WebdriverIO element (Playwright's web-first assertions do not apply). */
export const isEnabled = (element: { isEnabled(): Promise<boolean> }) => element.isEnabled();

/**
 * Records a screen the first authorized OTP run reaches for the first time (the OTP step, the new-password
 * step): the page-source element list as `<name>.elements.json` (type, accessibility id, label, placeholder,
 * enabled, frame; never input values, never a screenshot). Call it BEFORE typing into the screen. It
 * turns the one OTP a chain is allowed into the inspection of those screens too. Best effort: a dead
 * session must not fail the step.
 */
/**
 * The visible-element list with every run of 4 or more digits in a label, placeholder or id replaced: a screen can
 * show the phone number the code was sent to, or the typed code as digit boxes, as plain text. Structure and
 * words stay; the digits do not.
 */
export function maskedInventory(xml: string) {
  const mask = (text: string) => text.replace(/\d{4,}/g, '[digits]');
  return inventory(parseIosSource(xml)).map((entry) => ({
    ...entry,
    accessibilityId: entry.accessibilityId === null ? null : mask(entry.accessibilityId),
    label: mask(entry.label),
    placeholder: mask(entry.placeholder),
  }));
}

export async function attachScreenEvidence(
  driver: Pick<IosDriver, 'getPageSource'>,
  testInfo: Pick<TestInfo, 'attach'>,
  name: string,
): Promise<void> {
  const xml = await driver.getPageSource().catch(() => null);
  if (!xml) return;
  await testInfo.attach(`${name}.elements.json`, {
    body: JSON.stringify(maskedInventory(xml), null, 2),
    contentType: 'application/json',
  });
}

/**
 * On failure: NON-VISUAL evidence only, never a screenshot. `failure-details.json` (test name,
 * project, status, error messages) and `visible-elements.json` (the page-source element list:
 * type, accessibility id, label, placeholder, enabled, frame; never input values), to tell a
 * defect from a wrong selector. Best effort: a dead session must not hide the original failure.
 */
export async function attachFailureEvidence(
  driver: Pick<IosDriver, 'getPageSource'>,
  testInfo: Pick<TestInfo, 'status' | 'expectedStatus' | 'title' | 'project' | 'errors' | 'attach'>,
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;
  const plain = (text: string) =>
    text
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*m/g, '')
      .slice(0, 2_000);
  await testInfo.attach('failure-details.json', {
    body: JSON.stringify(
      {
        test: testInfo.title,
        project: testInfo.project.name,
        status: testInfo.status,
        expectedStatus: testInfo.expectedStatus,
        errors: testInfo.errors.map((e) => plain(e.message ?? '')),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  const xml = await driver.getPageSource().catch(() => null);
  if (xml) {
    await testInfo.attach('visible-elements.json', {
      body: JSON.stringify(maskedInventory(xml), null, 2),
      contentType: 'application/json',
    });
  }
}
