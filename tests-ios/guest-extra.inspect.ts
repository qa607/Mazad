import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@fixtures/ios.fixture';
import { inventory, type InventoryEntry } from '@mobile/ios/ios-inspection';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { type IosElement, parseIosSource, redactInputValues } from '@mobile/ios/page-source';
import { mobileAppText } from '@test-data/mobile-app.data';
import { allureLabels } from '@utils/allure-labels';
import { HOME_TABS, LANGUAGE_OPTIONS, MORE_TABS } from './ios-test-helpers';

/**
 * Second guest inspection (project ios-inspect; run it by file). READ-ONLY and NAVIGATION ONLY:
 * it records the registration entry and form, and the guest My Bids, My Actions and Notifications
 * screens, in both languages. It never types a value, submits a form, logs in or out, requests an
 * OTP, resets a password or taps a submit button. It only taps: the guest prompt, the registration
 * choice, form fields (to focus them), a password show/hide control if one exists, Close, labeled
 * tab-bar buttons and the Home tab. Android labels are used only as search HINTS and are reported as
 * unverified; nothing is recorded as a verified selector automatically.
 * Output: reports/ios-inspection/guest-extra-<language>.json and attachments (page sources with
 * input values redacted, screenshots).
 */
test.skip(
  Boolean(iosStaticProblem(process.env, { forInspection: true })),
  iosStaticProblem(process.env, { forInspection: true }),
);

const OUT_DIR = path.resolve(__dirname, '..', 'reports', 'ios-inspection');
const CLOSE_NAME = 'navigationBarClose';
const BUTTON = (label: string) =>
  `-ios predicate string:type == "XCUIElementTypeButton" AND label == ${JSON.stringify(label)}`;

const visible = (els: IosElement[]) => els.filter((e) => e.visible);
const labelsOf = (els: IosElement[], type: string) =>
  visible(els)
    .filter((e) => e.type === type)
    .map((e) => e.label || e.name || e.value)
    .filter(Boolean);

for (const lang of ['en', 'ar'] as const) {
  test.describe(
    `iOS guest extra inspection (${lang})`,
    allureLabels({
      feature: 'Registration',
      story: 'Guest screen inspection',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test('records registration, My Bids, My Actions and Notifications (guest, read-only)', async ({
        screenDriver: driver,
        iosConfig,
        appShell,
        text,
      }, testInfo) => {
        test.setTimeout(420_000);
        const hints = mobileAppText[lang];
        const captured: Record<string, unknown> = {};
        const snap = async (name: string) => {
          const xml = await driver.getPageSource();
          await testInfo.attach(`${name}.xml`, {
            body: redactInputValues(xml),
            contentType: 'application/xml',
          });
          await testInfo.attach(`${name}.png`, {
            body: Buffer.from(await driver.takeScreenshot(), 'base64'),
            contentType: 'image/png',
          });
          return parseIosSource(xml);
        };
        const entries = (els: IosElement[]): InventoryEntry[] => inventory(visible(els));
        const settle = () => driver.pause(1200);

        await restartIosApp(driver, iosConfig);
        const startLanguage = await appShell.waitUntilReady(HOME_TABS);
        await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
        await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);

        // ---- Guest navigation. The tab bar is the row of labeled Buttons level with the Home and More
        // tabs (their labels are verified). After each screen the app is restarted to a known state,
        // so a screen without a tab bar cannot strand the run.
        const backHome = async () => {
          await restartIosApp(driver, iosConfig);
          await appShell.waitUntilReady(HOME_TABS);
          await settle();
        };
        await backHome();
        const { height } = await driver.getWindowSize();
        const homeEls = await snap('home');
        const homeTab = visible(homeEls).find(
          (e) => e.type === 'Button' && (e.label || e.name) === text.tabs.home,
        );
        const moreTab = visible(homeEls).find(
          (e) => e.type === 'Button' && (e.label || e.name) === text.tabs.more,
        );
        const tabRow = homeTab
          ? visible(homeEls).filter(
              (e) =>
                e.type === 'Button' &&
                (e.label || e.name) &&
                Math.abs(e.y - homeTab.y) <= 3 &&
                Math.abs(e.height - homeTab.height) <= 3,
            )
          : [];
        const tabLabels = tabRow.map((e) => e.label || e.name);
        const tabResults: Record<string, unknown> = {};
        for (const label of tabLabels) {
          if (label === text.tabs.home || label === text.tabs.more) continue;
          const matches = await driver.$$(BUTTON(label)).getElements();
          if (matches.length !== 1) {
            tabResults[label] = { tested: false, reason: `${matches.length} matching Buttons` };
            continue;
          }
          await matches[0].click();
          await settle();
          const els = await snap(`tab-${tabLabels.indexOf(label)}`);
          tabResults[label] = {
            tested: true,
            androidHint: [hints.bottomNav.my_bids, hints.bottomNav.my_actions].includes(label)
              ? 'matches the Android tab label (hint only)'
              : 'no Android counterpart',
            staticTexts: labelsOf(els, 'StaticText'),
            buttons: labelsOf(els, 'Button'),
            inventory: entries(els),
          };
          await backHome();
        }
        captured.tabBar = {
          homeTabFound: Boolean(homeTab),
          moreTabFound: Boolean(moreTab),
          labels: tabLabels,
          screens: tabResults,
        };

        // Header icons on Home: unlabeled Buttons (a heart and a bell with a dot are visible in the
        // screenshot). They are identified only by that visual evidence, tapped one at a time for
        // inspection (by frame, never by a guessed label), and each screen is read for what it is.
        const headerIcons = visible(homeEls)
          .filter((e) => e.type === 'Button' && !(e.label || e.name) && e.y < height * 0.2)
          .sort((a, b) => a.x - b.x);
        const headerResults: Record<string, unknown>[] = [];
        for (const [index, icon] of headerIcons.entries()) {
          await driver.performActions([
            {
              type: 'pointer',
              id: 'finger1',
              parameters: { pointerType: 'touch' },
              actions: [
                {
                  type: 'pointerMove',
                  duration: 0,
                  x: Math.round(icon.x + icon.width / 2),
                  y: Math.round(icon.y + icon.height / 2),
                },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration: 80 },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ]);
          await settle();
          const els = await snap(`header-icon-${index}`);
          headerResults.push({
            frame: [icon.x, icon.y, icon.width, icon.height],
            staticTexts: labelsOf(els, 'StaticText'),
            buttons: labelsOf(els, 'Button'),
            inventory: entries(els),
          });
          await backHome();
        }
        captured.headerIcons = {
          count: headerIcons.length,
          note: 'Unlabeled Buttons at the top of Home, ordered left to right. Which is Notifications is read from the screen each opens.',
          screens: headerResults,
        };

        // ---- Registration: More -> guest prompt -> the entry sheet.
        await appShell.openMore(text.tabs.more, text.tabs.home);
        await appShell.guestPrompt(text.guestPrompt).click();
        await settle();
        const sheetEls = await snap('welcome-sheet');
        const sheetButtons = visible(sheetEls).filter(
          (e) => e.type === 'Button' && (e.label || e.name) && (e.label || e.name) !== CLOSE_NAME,
        );
        const sheetLabels = sheetButtons.map((e) => e.label || e.name);
        const hintLabel = hints.loginFlow.entryChoiceCreateAccount;
        let registerLabel = sheetLabels.find((l) => l === hintLabel);
        let identifiedBy = 'exact label equal to the Android label (hint)';
        if (!registerLabel) {
          const others = sheetLabels.filter((l) => l !== text.entryChoiceLogin);
          if (others.length === 1) {
            registerLabel = others[0];
            identifiedBy =
              'by elimination: the only labeled Button of the sheet other than the Log In choice (NOT confirmed as registration until the form shows)';
          }
        }
        captured.welcomeSheet = {
          buttons: sheetLabels,
          androidRegisterHint: hintLabel,
          registerLabel: registerLabel ?? null,
          identifiedBy: registerLabel ? identifiedBy : 'not identified',
          inventory: entries(sheetEls),
        };
        if (!registerLabel) {
          captured.registrationForm = {
            reached: false,
            reason: 'No registration choice could be identified on the sheet.',
          };
        } else {
          const choice = await driver.$$(BUTTON(registerLabel)).getElements();
          expect(choice.length, 'exactly one registration choice').toBe(1);
          await choice[0].click();
          await settle();
          const formEls = await snap('registration-form');
          const before = new Set(labelsOf(formEls, 'StaticText'));
          const fields = {
            textFields: visible(formEls).filter((e) => e.type === 'TextField').length,
            secureFields: visible(formEls).filter((e) => e.type === 'SecureTextField').length,
          };
          // Focus each field (no typing) and look for messages that appear.
          const fieldEls = await driver
            .$$('-ios class chain:**/XCUIElementTypeTextField')
            .getElements();
          const secureEls = await driver
            .$$('-ios class chain:**/XCUIElementTypeSecureTextField')
            .getElements();
          for (const field of [...fieldEls, ...secureEls]) {
            await field.click();
            await driver.pause(300);
            if (await driver.isKeyboardShown().catch(() => false)) {
              await driver.hideKeyboard().catch(() => undefined);
            }
          }
          const afterEls = await snap('registration-form-after-focus');
          const newTexts = labelsOf(afterEls, 'StaticText').filter((t) => !before.has(t));
          const required = visible(afterEls)
            .filter((e) =>
              /\*|required|مطلوب|إلزامي/i.test(`${e.label} ${e.placeholder} ${e.name}`),
            )
            .map((e) => ({ type: e.type, label: e.label, placeholder: e.placeholder }));

          // Show/hide: a Button level with a secure field. Tapped once and back; nothing is typed.
          const secure = visible(afterEls).find((e) => e.type === 'SecureTextField');
          const toggleCandidates = secure
            ? visible(afterEls).filter(
                (e) =>
                  e.type === 'Button' &&
                  Math.abs(e.y + e.height / 2 - (secure.y + secure.height / 2)) < secure.height &&
                  (e.x >= secure.x + secure.width - 80 || e.x + e.width <= secure.x + 80),
              )
            : [];
          captured.passwordToggle = {
            secureFieldPresent: Boolean(secure),
            candidates: toggleCandidates.map((e) => ({
              label: e.label,
              name: e.name,
              frame: [e.x, e.y, e.width, e.height],
            })),
            conclusion: toggleCandidates.length
              ? 'A Button sits level with the password field; see the inventory for its name.'
              : 'No Button level with the password field: the control is not exposed (or absent).',
          };

          // Close / back.
          const closes = visible(afterEls).filter(
            (e) => e.type === 'Button' && (e.name === CLOSE_NAME || e.label === CLOSE_NAME),
          );
          const backs = visible(afterEls).filter(
            (e) => e.type === 'Button' && /back|رجوع|عودة/i.test(`${e.label} ${e.name}`),
          );
          let closeResult: Record<string, unknown> = {
            closeButtons: closes.length,
            backButtons: backs.length,
          };
          if (closes.length === 1) {
            await driver.$(`~${CLOSE_NAME}`).click();
            await settle();
            const afterClose = await snap('after-registration-close');
            closeResult = {
              ...closeResult,
              tapped: CLOSE_NAME,
              afterStaticTexts: labelsOf(afterClose, 'StaticText'),
              afterButtons: labelsOf(afterClose, 'Button'),
            };
          }
          captured.registrationForm = {
            reached: true,
            fields,
            staticTexts: labelsOf(formEls, 'StaticText'),
            buttons: labelsOf(formEls, 'Button'),
            inventory: entries(formEls),
            afterFocusNewTexts: newTexts,
            requiredIndicators: required,
            close: closeResult,
          };
        }

        const report = { language: lang, startLanguage, ...captured };
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(OUT_DIR, `guest-extra-${lang}.json`),
          `${JSON.stringify(report, null, 2)}\n`,
        );
        await testInfo.attach('guest-extra.json', {
          body: JSON.stringify(report, null, 2),
          contentType: 'application/json',
        });
        // Leave the app on a fresh start, signed out, with nothing submitted.
        await restartIosApp(driver, iosConfig);
      });
    },
  );
}
