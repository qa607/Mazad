import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@fixtures/ios.fixture';
import { inventory } from '@mobile/ios/ios-inspection';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { type IosElement, parseIosSource, redactInputValues } from '@mobile/ios/page-source';
import { allureLabels } from '@utils/allure-labels';
import { HOME_TABS, LANGUAGE_OPTIONS, MORE_TABS } from './ios-test-helpers';

/**
 * Third guest inspection (project ios-inspect; run it by file). READ-ONLY and NAVIGATION ONLY: from the
 * My Bids tab (guest) it taps the two header icons, one at a time, and records what each screen shows.
 * The icons carry accessible names the first inspection saw on this tab (favoriteHeaderButton,
 * hasNotificationsIcon); each is located as the ONE Button with exactly that name, never by position.
 * It never taps a login or create-account button, never types a value, never submits, and does not sign
 * in or out. After each screen the app is restarted to a known state.
 * Output: reports/ios-inspection/guest-notifications-favorites-<language>.json and the page sources.
 */
test.skip(
  Boolean(iosStaticProblem(process.env, { forInspection: true })),
  iosStaticProblem(process.env, { forInspection: true }),
);

const OUT_DIR = path.resolve(__dirname, '..', 'reports', 'ios-inspection');
const ICONS = [
  { screen: 'notifications', name: 'hasNotificationsIcon' },
  { screen: 'favorites', name: 'favoriteHeaderButton' },
] as const;
const ICON = (name: string) =>
  `-ios predicate string:type == "XCUIElementTypeButton" AND (label == ${JSON.stringify(name)} OR name == ${JSON.stringify(name)})`;

const visible = (els: IosElement[]) => els.filter((e) => e.visible);
const labelsOf = (els: IosElement[], type: string) =>
  visible(els)
    .filter((e) => e.type === type)
    .map((e) => e.label || e.name || e.value)
    .filter(Boolean);

for (const lang of ['en', 'ar'] as const) {
  test.describe(
    `iOS guest notifications and favorites inspection (${lang})`,
    allureLabels({
      feature: 'Guest tabs',
      story: 'Guest screen inspection',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test('records the guest Notifications and Favorites screens (read-only)', async ({
        screenDriver: driver,
        iosConfig,
        appShell,
        guestTabsScreen,
        text,
      }, testInfo) => {
        test.setTimeout(300_000);
        const captured: Record<string, unknown> = { language: lang, build: '8.3 (1491)' };
        for (const icon of ICONS) {
          await restartIosApp(driver, iosConfig);
          await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
          await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);
          await guestTabsScreen.openTab(text.bidsTab);
          await driver.pause(1200);
          const matches = await driver.$$(ICON(icon.name)).getElements();
          if (matches.length !== 1) {
            captured[icon.screen] = {
              reached: false,
              reason: `${matches.length} matching Buttons`,
            };
            continue;
          }
          await matches[0].click();
          await driver.pause(1500);
          const xml = await driver.getPageSource();
          await testInfo.attach(`${icon.screen}.xml`, {
            body: redactInputValues(xml),
            contentType: 'application/xml',
          });
          const els = parseIosSource(xml);
          captured[icon.screen] = {
            reached: true,
            icon: icon.name,
            staticTexts: labelsOf(els, 'StaticText'),
            buttons: labelsOf(els, 'Button'),
            textFields: visible(els).filter((e) => e.type === 'TextField').length,
            inventory: inventory(visible(els)),
          };
        }
        await restartIosApp(driver, iosConfig);
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(OUT_DIR, `guest-notifications-favorites-${lang}.json`),
          JSON.stringify(captured, null, 2),
        );
        // Nothing is asserted about the content here: this run only records the screens.
        expect(Object.keys(captured).length).toBeGreaterThan(2);
      });
    },
  );
}
