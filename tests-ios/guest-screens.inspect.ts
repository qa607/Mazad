import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@fixtures/ios.fixture';
import { backendEvidenceProblem } from '@mobile/ios/ios-guard';
import {
  classifyScreen,
  guestScreenTexts,
  inspectScreen,
  NOT_INSPECTED_SELECTORS,
  proposeAppShellSelectors,
  NOT_INSPECTED_TEXTS,
  proposeForgotPasswordSelectors,
  proposeLoginSelectors,
  type ScreenInspection,
} from '@mobile/ios/ios-inspection';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { parseIosSource, redactInputValues } from '@mobile/ios/page-source';
import { iosAppText } from '@test-data/ios-app.data';
import { allureLabels } from '@utils/allure-labels';
import { HOME_TABS, LANGUAGE_OPTIONS, MORE_TABS } from './ios-test-helpers';

/**
 * First guest-screen inspection (project ios-inspect, run only when selected explicitly).
 * For each language: opens More (guest), the login choice, the login form and Forgot Password,
 * and records accessibility identifiers, labels, visible text, missing and ambiguous selectors.
 * Nothing is typed, submitted or requested. Output: reports/ios-inspection/<language>.json, plus
 * attachments (page sources with input values redacted), to fill src/mobile/ios/ios-selectors.ts
 * and confirm test-data/ios-app.data.ts in code review. Nothing is recorded automatically.
 * Same gates as every iOS run except "text verified" (verifying the text is its purpose).
 */
test.skip(
  Boolean(iosStaticProblem(process.env, { forInspection: true })),
  iosStaticProblem(process.env, { forInspection: true }),
);

const OUT_DIR = path.resolve(__dirname, '..', 'reports', 'ios-inspection');
/**
 * The Close button's accessible name as OBSERVED in the 2026-11-09 inspection (its name and label
 * are both this string). Used only to probe where Close leads; it is not recorded as a verified
 * accessibility id (src/mobile/ios/ios-selectors.ts stays empty until reviewed).
 */
const OBSERVED_CLOSE_NAME = 'navigationBarClose';

for (const lang of ['en', 'ar'] as const) {
  test.describe(
    `iOS guest screens inspection (${lang})`,
    allureLabels({
      feature: 'Login',
      story: 'Guest screen inspection',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test('records Login and Forgot Password selectors and text', async ({
        screenDriver: driver,
        iosConfig,
        iosGuard,
        appShell,
        loginScreen,
        forgotPasswordScreen,
        text,
      }, testInfo) => {
        const source = async (name: string) => {
          const xml = await driver.getPageSource();
          await testInfo.attach(`${name}.xml`, {
            body: redactInputValues(xml),
            contentType: 'application/xml',
          });
          return parseIosSource(xml);
        };

        await restartIosApp(driver, iosConfig);
        // The app may start in either language: detect it, document the More screen it starts
        // on when a switch is needed, then switch to the requested language.
        const startLanguage = await appShell.waitUntilReady(HOME_TABS);
        let moreBeforeSwitch: ScreenInspection | undefined;
        let moreDisplayedBeforeSwitch: boolean | undefined;
        if (startLanguage !== lang) {
          await appShell.openMore(MORE_TABS[startLanguage], HOME_TABS[startLanguage]);
          // Capture only once More is really displayed (its guest prompt is on screen).
          moreDisplayedBeforeSwitch = await appShell.waitUntilMoreDisplayed(
            iosAppText(startLanguage).guestPrompt,
          );
          moreBeforeSwitch = inspectScreen(
            await source(`more-before-language-switch-${startLanguage}`),
            [],
            guestScreenTexts(iosAppText(startLanguage)).more,
          );
        }
        await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
        await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);
        const expected = guestScreenTexts(text);
        const moreEls = await source('more');
        const more = inspectScreen(moreEls, proposeAppShellSelectors(moreEls, text), expected.more);

        // The same two taps as loginScreen.openLoginForm, with the choice screen recorded between.
        const prompt = appShell.guestPrompt(text.guestPrompt);
        await prompt.click();
        const choice = loginScreen.text(text.entryChoiceLogin);
        await choice.waitForDisplayed({ timeout: 15_000 });
        const loginChoice = inspectScreen(await source('login-choice'), [], expected.loginChoice);
        await choice.click();

        await loginScreen.phoneInput.waitForDisplayed({ timeout: 15_000 });
        const loginEls = await source('login');
        const login = inspectScreen(
          loginEls,
          proposeLoginSelectors(loginEls, text),
          expected.login,
        );

        await loginScreen.openForgotPassword(text.forgotPassword);
        await forgotPasswordScreen
          .heading(text.resetPasswordHeading)
          .waitForDisplayed({ timeout: 15_000 });
        const forgotEls = await source('forgot-password');
        const forgot = inspectScreen(
          forgotEls,
          proposeForgotPasswordSelectors(forgotEls, text),
          expected.forgotPassword,
        );

        // Where does Close lead? Probed last (it leaves the screen), found by the observed name,
        // never by position. The result is documented, not assumed.
        const closeButtons = parseIosSource(await driver.getPageSource()).filter(
          (e) =>
            e.visible &&
            e.type === 'Button' &&
            (e.name === OBSERVED_CLOSE_NAME || e.label === OBSERVED_CLOSE_NAME),
        );
        let closeBehavior: Record<string, unknown>;
        if (closeButtons.length !== 1) {
          closeBehavior = {
            tested: false,
            reason: `${closeButtons.length} visible Button(s) named "${OBSERVED_CLOSE_NAME}" (expected exactly 1)`,
          };
        } else {
          await driver.$(`~${OBSERVED_CLOSE_NAME}`).click();
          let after: ReturnType<typeof classifyScreen> = {
            screen: 'forgot-password',
            evidence: [],
          };
          for (let i = 0; i < 10 && after.screen === 'forgot-password'; i++) {
            await driver.pause(500);
            after = classifyScreen(parseIosSource(await driver.getPageSource()), text);
          }
          const afterInspection = inspectScreen(await source('after-close'), [], {});
          closeBehavior = {
            tested: true,
            tappedName: OBSERVED_CLOSE_NAME,
            from: 'forgot-password',
            after: after.screen,
            evidence: after.evidence,
            note:
              after.screen === 'forgot-password'
                ? 'Still on Forgot Password 5 s after the tap: Close had no visible effect.'
                : 'Observed once in this language; not yet reviewed.',
            inventory: afterInspection.inventory,
          };
        }

        const screens: Record<string, ScreenInspection> = {
          more,
          loginChoice,
          login,
          forgotPassword: forgot,
        };
        const all = Object.values(screens);
        const report = {
          language: lang,
          startLanguage,
          languageSwitched: startLanguage !== lang,
          bundleId: iosConfig.bundleId,
          build: `${iosConfig.approvedBuild.version} (${iosConfig.approvedBuild.build})`,
          target: iosConfig.target,
          summary: {
            selectorsWithoutId: all
              .flatMap((s) => s.selectors)
              .filter((p) => p.found && !p.accessibilityId)
              .map((p) => p.key),
            unlabeledButtons: Object.entries(screens).flatMap(([name, s]) =>
              s.unlabeledButtons.map(
                (b) =>
                  `${name}: Button, no id and no label, enabled=${b.enabled}, frame ${b.frame.join(',')}`,
              ),
            ),
            selectorsNotFound: all
              .flatMap((s) => s.selectors)
              .filter((p) => !p.found)
              .map((p) => p.key),
            ambiguousSelectors: all
              .flatMap((s) => s.selectors)
              .filter((p) => p.ambiguous)
              .map((p) => `${p.key} (${p.candidates} candidates)`),
            textsNotFound: all
              .flatMap((s) => s.texts)
              .filter((t) => !t.found)
              .map((t) => t.key),
            duplicateIds: Object.entries(screens).flatMap(([name, s]) =>
              s.duplicateIds.map((id) => `${name}: ${id}`),
            ),
            notInspectedSelectors: NOT_INSPECTED_SELECTORS,
            notInspectedTexts: NOT_INSPECTED_TEXTS,
          },
          closeBehavior,
          ...(moreBeforeSwitch
            ? {
                moreBeforeLanguageSwitch: {
                  displayed: moreDisplayedBeforeSwitch,
                  ...moreBeforeSwitch,
                },
              }
            : {}),
          screens,
        };
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(path.join(OUT_DIR, `${lang}.json`), JSON.stringify(report, null, 2));
        await testInfo.attach(`inspection-${lang}.json`, {
          body: JSON.stringify(report, null, 2),
          contentType: 'application/json',
        });

        // Simulator runs: the app's traffic must have reached the staging host through the guard.
        expect(iosGuard && backendEvidenceProblem(iosGuard)).toBeFalsy();

        // The inspection succeeds when the screens were reached; missing items are reported.
        expect(login.selectors.find((s) => s.key === 'login.phoneInput')?.found).toBe(true);
        expect(forgot.selectors.find((s) => s.key === 'forgotPassword.phoneInput')?.found).toBe(
          true,
        );
      });
    },
  );
}
