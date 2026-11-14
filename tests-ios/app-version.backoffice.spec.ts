import { expect, test } from '@fixtures/ios.fixture';
import { iosForceUpdateBlocked, iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import {
  appVersionTestTitles,
  forceUpdateRow,
  forceUpdateVersion,
  iosForceUpdateDialogText,
} from '@test-data/app-version.data';
import { GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { allureLabels } from '@utils/allure-labels';
import { blockedBy, firstBlocked } from '@utils/account-actions';
import type { Language } from '@typings';
import { attachFailureEvidence, HOME_TABS, LANGUAGE_OPTIONS, MORE_TABS } from './ios-test-helpers';

/**
 * App version control on the iOS app, the same scenario as the Android suite
 * (tests/mobile/android/app-version.backoffice.spec.ts): the back office (as Dev Root) adds an iOS
 * app version above the installed build with Force Update on, the app shows its update dialog at
 * the next launch, then the version is deleted in the back office and the app opens normally again.
 * Runs in the ios-backoffice project, after its back-office sign-in, in Arabic only.
 *
 * While the row exists EVERY staging iOS app shows the dialog, so the test keeps that window short
 * and runs only with MAZAD_ALLOW_FORCE_UPDATE=true (its own approval, iosForceUpdateBlocked), under
 * every device, build and narrow-text gate the other iOS tests need. In the app it only navigates
 * (language) and reads: the dialog's Update button is never tapped. The row is deleted by the test
 * itself, and by the appVersionCleanup fixture after the test if a step failed first. Failure
 * evidence is non-visual (attachFailureEvidence).
 */
const GATE = firstBlocked(
  iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE }),
  iosForceUpdateBlocked(),
);

// One device, one test at a time; a retry would open another force-update window.
test.describe.configure({ mode: 'default', retries: 0 });

/** How long the app gets after a launch to show (or not show) the update dialog. */
const VERSION_CHECK_TIMEOUT = 20_000;

/** Arabic only on iOS (QA owner, 2026-11-14): one force-update window per run. */
const IOS_LANGUAGES: (keyof typeof iosForceUpdateDialogText & Language)[] = ['ar'];

for (const lang of IOS_LANGUAGES) {
  const text = iosForceUpdateDialogText[lang];
  const { deviceType, input } = forceUpdateVersion.ios;
  const labels = allureLabels({
    feature: 'App Version Control',
    story: 'Force update from the back office',
    severity: 'critical',
    platform: 'ios',
    language: lang,
  });

  test.describe(
    `App version control - iOS app (${lang}) - back office`,
    { tag: [...labels.tag, '@regression', '@mutates'], annotation: labels.annotation },
    () => {
      // Decided when the file loads: no session, app launch or back-office change while blocked.
      test.skip(Boolean(GATE), GATE);
      test.use({ language: lang });

      test.afterEach(async ({ driver }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
      });

      test(
        appVersionTestTitles.forceUpdate,
        { tag: '@functional', annotation: blockedBy(GATE) },
        async ({
          driver,
          iosConfig,
          appShell,
          forceUpdateScreen,
          devRootBackend,
          appVersionCleanup,
        }) => {
          test.setTimeout(300_000);
          const { appVersionListPage: list, appVersionFormPage: form } = devRootBackend;

          await test.step('app: opens normally, in the test language', async () => {
            await restartIosApp(driver, iosConfig);
            // Switched now: the update dialog would block the More tab.
            await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
            await restartIosApp(driver, iosConfig);
            await appShell.waitUntilReady(HOME_TABS);
            expect(
              await forceUpdateScreen.appearsWithin(text.update, VERSION_CHECK_TIMEOUT),
              'no update dialog before the version is added',
            ).toBe(false);
          });

          const rowId =
            await test.step(`back office: add iOS ${input.appVersion} with Force Update`, async () => {
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
            await restartIosApp(driver, iosConfig);
            expect(
              await forceUpdateScreen.appearsWithin(text.update, VERSION_CHECK_TIMEOUT),
              'the update dialog appears',
            ).toBe(true);
            expect(await (await forceUpdateScreen.onlyText(text.title)).isDisplayed()).toBe(true);
            expect(await (await forceUpdateScreen.onlyText(text.description)).isDisplayed()).toBe(
              true,
            );
            expect(await (await forceUpdateScreen.updateButton(text.update)).isDisplayed()).toBe(
              true,
            );
          });

          await test.step('back office: delete the version', async () => {
            await list.gotoFiltered(deviceType, input.appVersion);
            await list.deleteRow(rowId);
            await list.gotoFiltered(deviceType, input.appVersion);
            await expect(list.row(rowId)).toHaveCount(0);
          });

          await test.step('app: opens normally again', async () => {
            await restartIosApp(driver, iosConfig);
            await appShell.waitUntilReady(HOME_TABS);
            expect(
              await forceUpdateScreen.appearsWithin(text.update, VERSION_CHECK_TIMEOUT),
              'no update dialog once the version is deleted',
            ).toBe(false);
          });
        },
      );
    },
  );
}
