import { expect, test } from '@fixtures/mobile.fixture';
import { installedAndroidVersion } from '@mobile/android-app-info';
import { restartApp } from '@mobile/android.session';
import { languageOptions, mobileAppText } from '@test-data/mobile-app.data';
import { testRecordPrefix } from '@test-data/backend-common.data';
import {
  deviceIdPattern,
  externalLinks,
  inAppPages,
  moreIconCounts,
  moreText,
  versionLine,
} from '@test-data/mobile-more.data';
import type { Language } from '@typings';

// One device and one Appium session: the file runs in order (run the android project with
// --workers=1). Every test starts from a fresh app on More in its language. Nothing here leaves the
// app: Privacy Policy, Rate us and the social icons are checked for presence only.
test.describe.configure({ mode: 'serial' });

const languages: Language[] = ['en', 'ar'];
const otherLanguage = (lang: Language): Language => (lang === 'en' ? 'ar' : 'en');

for (const lang of languages) {
  const text = moreText[lang];
  const app = mobileAppText[lang];

  test.describe(`More - Android app (${lang})`, { tag: '@regression' }, () => {
    test.beforeEach(async ({ driver, appShell, moreScreen }) => {
      await restartApp(driver);
      await appShell.waitUntilReady();
      await appShell.dismissAnnouncement();
      await appShell.setLanguage(lang, languageOptions);
      await appShell.dismissAnnouncement();
      await appShell.open('more');
      await moreScreen.waitUntilOpen(text.title);
    });

    test(
      'Shows every section and link, with More selected',
      { tag: ['@smoke', '@ui'] },
      async ({ appShell, moreScreen: more }) => {
        const shown = [
          text.title,
          app.loginFlow.guestPrompt,
          text.settings,
          text.language,
          languageOptions.en,
          languageOptions.ar,
          text.socialHeading,
          text.importantLinks,
          ...Object.values(text.rows),
          text.copy,
        ];
        for (const label of shown) {
          expect.soft(await more.text(label).isDisplayed(), label).toBe(true);
        }
        expect(await appShell.isSelected('more')).toBe(true);
        expect(await appShell.isSelected('home')).toBe(false);
      },
    );

    test(
      'Shows the header icons and the four social media icons',
      { tag: '@ui' },
      async ({ moreScreen: more }) => {
        // Presence only: the icons have no label or ID, and the social ones leave the app.
        expect(await more.headerIconCount(app.loginFlow.guestPrompt)).toBe(moreIconCounts.header);
        expect(await more.socialIconCount(text.socialHeading, text.importantLinks)).toBe(
          moreIconCounts.social,
        );
      },
    );

    test(
      'Lists the links that leave the app without opening them',
      { tag: '@ui' },
      async ({ moreScreen: more }) => {
        // Privacy Policy opens the external browser and Rate us the store: never tapped.
        for (const link of externalLinks) {
          expect(await more.text(text.rows[link]).isDisplayed(), link).toBe(true);
        }
      },
    );

    for (const page of inAppPages) {
      test(
        `Opens ${page === 'aboutUs' ? 'About Us' : 'Terms & Conditions'} inside the app, and Back returns to More`,
        { tag: '@functional' },
        async ({ moreScreen: more, staticPageScreen: staticPage }) => {
          await more.openInAppRow(text.rows[page]);
          await staticPage.waitUntilOpen(text.pageTitles[page]);
          expect(await staticPage.isContentShown(), 'page content').toBe(true);
          expect(await staticPage.backButton(text.back).isDisplayed()).toBe(true);

          await staticPage.goBack(text.back);
          await more.waitUntilOpen(text.title);
          expect(await more.text(text.importantLinks).isDisplayed()).toBe(true);
        },
      );
    }

    test(
      'Opens Help Center with its categories',
      { tag: '@functional' },
      async ({ moreScreen: more, helpCenterScreen, mazadApi }) => {
        // Categories are served by the API; temporary QA-AUTO ones from other suites are skipped.
        const { body } = await mazadApi.getFaqCategories(lang);
        const categories = body.data.filter((c) => !c.name.startsWith(testRecordPrefix));
        expect(categories.length, 'Help Center categories').toBeGreaterThan(0);

        await more.openInAppRow(text.rows.helpCenter);
        for (const category of categories) {
          await expect
            .poll(() => helpCenterScreen.item(category.name).isDisplayed(), {
              message: category.name,
            })
            .toBe(true);
        }
      },
    );

    test(
      'Shows the installed app version',
      { tag: '@functional' },
      async ({ moreScreen: more }) => {
        const expected = versionLine(lang, await installedAndroidVersion());
        expect(await more.text(expected).isDisplayed(), expected).toBe(true);
      },
    );

    test(
      'Copy puts the shown device ID on the clipboard',
      { tag: '@functional' },
      async ({ moreScreen: more }) => {
        const deviceId = await more.deviceId();
        expect(deviceId).toMatch(deviceIdPattern);

        await more.setClipboard('not copied yet');
        await more.copyDeviceId(text.copy);

        await expect.poll(() => more.clipboard()).toBe(deviceId);
      },
    );

    test(
      'Switching the language changes More and the tabs, and survives a restart',
      { tag: '@functional' },
      async ({ driver, appShell, moreScreen: more }) => {
        const other = otherLanguage(lang);

        await test.step(`switch to ${other}`, async () => {
          await appShell.setLanguage(other, languageOptions);
          await appShell.open('more');
          await more.waitUntilOpen(moreText[other].title);
          expect(await more.text(moreText[other].importantLinks).isDisplayed()).toBe(true);
          expect(await appShell.tabLabel('more')).toBe(mobileAppText[other].bottomNav.more);
        });

        await test.step('restart the app: the language is kept', async () => {
          await restartApp(driver);
          await appShell.waitUntilReady();
          await appShell.dismissAnnouncement();
          expect(await appShell.tabLabel('home')).toBe(mobileAppText[other].bottomNav.home);
          await appShell.open('more');
          await more.waitUntilOpen(moreText[other].title);
        });
        // The next test's setup sets its own language again.
      },
    );

    test.fixme(
      'Signed-in More shows the account and Log out',
      {
        tag: '@functional',
        annotation: {
          type: 'out-of-scope',
          description:
            'Signed-in state is out of scope for now (QA owner, 2026-11-11): needs an approved account.',
        },
      },
      () => {
        // Declared only.
      },
    );
  });
}
