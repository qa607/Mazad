import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@fixtures/ios.fixture';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { parseIosSource, redactInputValues, type IosElement } from '@mobile/ios/page-source';
import { allureLabels } from '@utils/allure-labels';
import { HOME_TABS, LANGUAGE_OPTIONS, MORE_TABS } from './ios-test-helpers';

/**
 * Read-only inspection of the registration flow's account-type step and the Individual (Personal)
 * Step 2 form, in both languages. Project ios-inspect, run only when selected explicitly. NOTHING
 * is typed, submitted or requested here: selecting an account type and a city are local UI state
 * (no backend call), and this stops BEFORE tapping Create Account, so no OTP is ever requested and
 * no account is ever created by this file. Output: reports/ios-inspection/registration-<language>.json,
 * used to design the interactive registration screen object methods and the real E2E journey.
 */
test.skip(
  Boolean(iosStaticProblem(process.env, { forInspection: true })),
  iosStaticProblem(process.env, { forInspection: true }),
);

const OUT_DIR = path.resolve(__dirname, '..', 'reports', 'ios-inspection');

/** Every visible StaticText and Button, with frame, for manual/automatic correlation. */
function inventory(elements: IosElement[]) {
  return elements
    .filter((e) => e.visible && (e.type === 'StaticText' || e.type === 'Button'))
    .map((e) => ({
      type: e.type,
      label: e.label,
      name: e.name,
      enabled: e.enabled,
      frame: [e.x, e.y, e.width, e.height],
    }));
}

/** Other input-ish controls on a form step (fields, pickers, switches), for the Step 2 inventory. */
function fieldInventory(elements: IosElement[]) {
  return elements
    .filter(
      (e) =>
        e.visible &&
        ['TextField', 'SecureTextField', 'Other', 'Picker', 'PickerWheel', 'Switch'].includes(
          e.type,
        ),
    )
    .map((e) => ({
      type: e.type,
      label: e.label,
      name: e.name,
      placeholder: e.placeholder,
      enabled: e.enabled,
      frame: [e.x, e.y, e.width, e.height],
    }));
}

for (const lang of ['en', 'ar'] as const) {
  test.describe(
    `iOS registration account-type and Step 2 inspection (${lang})`,
    allureLabels({
      feature: 'Registration',
      story: 'Account-type and Step 2 inspection',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test('records the two account-type buttons and the Personal Step 2 field layout', async ({
        screenDriver: driver,
        iosConfig,
        appShell,
        registrationScreen,
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
        const startLanguage = await appShell.waitUntilReady(HOME_TABS);
        await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
        await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);

        await registrationScreen.openFromGuestPrompt(text.guestPrompt, text.createAccountChoice);
        await registrationScreen
          .onlyText(text.chooseAccountType)
          .then((el) => el.waitForDisplayed({ timeout: 15_000 }));
        const accountTypeStep = await source('account-type-step');

        // Tap the FIRST (leftmost) account-type button: "Create Personal Account" (confirmed in
        // English, 2026-11-11). Position, not label: both are unlabeled in every language.
        await registrationScreen.selectAccountTypeButton(0);
        const afterSelectFirst = await source('account-type-step-after-select-0');
        await registrationScreen.tapNext(text.registrationNext);
        const step2 = await source('step-2-after-selecting-0');

        // City/Region: an unlabeled Button that opens a search sheet. tapButtonContainingText's
        // approach (coordinate tap on the Button whose frame contains a known child label) is
        // exercised here directly against the raw elements, since this file is read-only (it never
        // calls the screen object's own gated/typed methods for Step 2, only navigation ones).
        const cityHint = step2.find(
          (e) => e.visible && e.type === 'StaticText' && e.y > 700 && e.y < 740,
        );
        const cityButtonEl = cityHint
          ? step2.find(
              (e) =>
                e.visible &&
                e.type === 'Button' &&
                e.x <= cityHint.x &&
                e.y <= cityHint.y &&
                e.x + e.width >= cityHint.x + cityHint.width &&
                e.y + e.height >= cityHint.y + cityHint.height,
            )
          : undefined;
        if (!cityButtonEl) throw new Error('City/Region: could not locate the opener button.');
        await driver
          .action('pointer')
          .move({
            x: Math.round(cityButtonEl.x + cityButtonEl.width / 2),
            y: Math.round(cityButtonEl.y + cityButtonEl.height / 2),
          })
          .down()
          .pause(50)
          .up()
          .perform();
        await driver.pause(1_000);
        const cityPicker = await source('city-picker-opened');

        // Select the FIRST listed city (language-independent: never a hardcoded city name).
        const firstCity = cityPicker.find((e) => e.visible && e.type === 'StaticText' && e.y > 190);
        if (!firstCity) throw new Error('City/Region picker: no city row found.');
        await driver
          .$(
            `-ios predicate string:type == "XCUIElementTypeStaticText" AND label == ${JSON.stringify(firstCity.label)}`,
          )
          .click();
        await driver.pause(500);
        const step2AfterCity = await source('step-2-after-city-selected');

        const report = {
          startLanguage,
          accountTypeStep: {
            inventory: inventory(accountTypeStep),
            all: accountTypeStep.filter((e) => e.visible),
          },
          afterSelectingButton0: { inventory: inventory(afterSelectFirst) },
          step2AfterButton0: {
            textInventory: inventory(step2),
            fieldInventory: fieldInventory(step2),
            all: step2.filter((e) => e.visible),
          },
          cityPickerOpened: { all: cityPicker.filter((e) => e.visible) },
          step2AfterCitySelected: {
            selectedCity: firstCity.label,
            all: step2AfterCity.filter((e) => e.visible),
          },
        };
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(OUT_DIR, `registration-${lang}.json`),
          JSON.stringify(report, null, 2),
        );
        await testInfo.attach(`inspection-registration-${lang}.json`, {
          body: JSON.stringify(report, null, 2),
          contentType: 'application/json',
        });

        expect(
          report.accountTypeStep.inventory.filter((e) => e.type === 'Button').length,
        ).toBeGreaterThanOrEqual(2);
      });
    },
  );
}
