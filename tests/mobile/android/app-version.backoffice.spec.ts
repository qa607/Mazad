import { expect, test } from '@fixtures/mobile.fixture';
import { restartApp } from '@mobile/android.session';
import {
  appVersionTestTitles,
  forceUpdateDialogText,
  forceUpdateRow,
  forceUpdateVersion,
} from '@test-data/app-version.data';
import { languageOptions } from '@test-data/mobile-app.data';
import { blockedBy, FORCE_UPDATE_BLOCKED } from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import type { Language } from '@typings';

// App version control: the back office (as Dev Root) adds an Android app version above the
// installed build with Force Update on, the app shows its update dialog at the next launch, then
// the version is deleted in the back office and the app opens normally again. Runs in the
// android-backoffice project, after backend-setup has saved the Dev Root session.
//
// While the row exists EVERY staging Android app gets the update dialog, so the test keeps that
// window short (about a minute) and runs only when approved for the run
// (MAZAD_ALLOW_FORCE_UPDATE=true). The row is deleted by the test itself, and by the
// appVersionCleanup fixture after the test if a step failed first.

// The back-office tab is signed in as Dev Root: no trace or video (devRootBackend attaches a
// masked screenshot on failure instead); the device screenshot is attached by afterEach.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// One device, one test at a time; a retry would open another force-update window.
test.describe.configure({ mode: 'default', retries: 0 });

/** How long the app gets after a launch to show (or not show) the update dialog. */
const VERSION_CHECK_TIMEOUT = 20_000;

const languages: Language[] = ['en', 'ar'];

for (const lang of languages) {
  const text = forceUpdateDialogText[lang];
  const { deviceType, input } = forceUpdateVersion.android;
  const labels = allureLabels({
    feature: 'App Version Control',
    story: 'Force update from the back office',
    severity: 'critical',
    platform: 'android',
    language: lang,
  });

  test.describe(
    `App version control - Android app (${lang}) - back office`,
    { tag: [...labels.tag, '@regression', '@mutates'], annotation: labels.annotation },
    () => {
      // Decided when the file loads: no Appium session or back-office change while not approved.
      test.skip(Boolean(FORCE_UPDATE_BLOCKED), FORCE_UPDATE_BLOCKED);

      test.afterEach(async ({ driver }, testInfo) => {
        if (testInfo.status === testInfo.expectedStatus) return;
        const screenshot = await driver.takeScreenshot().catch(() => null);
        if (screenshot) {
          await testInfo.attach('device screenshot', {
            body: Buffer.from(screenshot, 'base64'),
            contentType: 'image/png',
          });
        }
      });

      test(
        appVersionTestTitles.forceUpdate,
        { tag: '@functional', annotation: blockedBy(FORCE_UPDATE_BLOCKED) },
        async ({ driver, appShell, forceUpdateScreen, devRootBackend, appVersionCleanup }) => {
          test.setTimeout(240_000);
          const { appVersionListPage: list, appVersionFormPage: form } = devRootBackend;

          await test.step('app: opens normally, in the test language', async () => {
            await restartApp(driver);
            await appShell.waitUntilReady();
            await appShell.dismissAnnouncement();
            // Switched now: the update dialog would block the More tab.
            await appShell.setLanguage(lang, languageOptions);
            await restartApp(driver);
            await appShell.waitUntilReady();
            expect(
              await forceUpdateScreen.appearsWithin(VERSION_CHECK_TIMEOUT),
              'no update dialog before the version is added',
            ).toBe(false);
          });

          const rowId =
            await test.step(`back office: add Android ${input.appVersion} with Force Update`, async () => {
              appVersionCleanup.track(deviceType, input.appVersion);
              await form.gotoCreate();
              await form.fill(input);
              expect(await form.isForceUpdateOn(), 'Force Update is switched on').toBe(true);
              await form.save();
              await list.gotoFiltered(deviceType, input.appVersion);
              const rows = await list.readRows();
              expect(rows, 'exactly one row with this device type and version').toHaveLength(1);
              expect(rows[0]).toMatchObject({
                deviceType,
                appVersion: input.appVersion,
                ...forceUpdateRow,
              });
              return rows[0].id;
            });

          await test.step('app: shows the update dialog at launch', async () => {
            await restartApp(driver);
            expect(
              await forceUpdateScreen.appearsWithin(VERSION_CHECK_TIMEOUT),
              'the update dialog appears',
            ).toBe(true);
            // The dialog can show before its text is filled in: each text is waited for.
            const shows = (
              element: { getText(): Promise<string> },
              expected: string,
              what: string,
            ) => expect.poll(() => element.getText(), { message: what }).toBe(expected);
            await shows(forceUpdateScreen.title, text.title, 'dialog title');
            await shows(forceUpdateScreen.description, text.description, 'dialog description');
            await shows(forceUpdateScreen.updateButton, text.update, 'Update button');
          });

          await test.step('back office: delete the version', async () => {
            await list.gotoFiltered(deviceType, input.appVersion);
            await list.deleteRow(rowId);
            await list.gotoFiltered(deviceType, input.appVersion);
            await expect(list.row(rowId)).toHaveCount(0);
          });

          await test.step('app: opens normally again', async () => {
            await restartApp(driver);
            await appShell.waitUntilReady();
            expect(
              await forceUpdateScreen.appearsWithin(VERSION_CHECK_TIMEOUT),
              'no update dialog once the version is deleted',
            ).toBe(false);
          });
        },
      );
    },
  );
}
