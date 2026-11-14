import { expect, test } from '@fixtures/inspection-android.fixture';
import { restartInspectionAndroidApp } from '@mobile/inspection-android/inspection-android.session';
import { InspectorHomeScreen } from '@mobile/inspection-android/screens/inspector-home.screen';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

function enabledOnLastClickableAncestor(xml: string, label: string): boolean | null {
  const index = xml.lastIndexOf(`text="${label.replace(/&/g, '&amp;')}"`);
  if (index < 0) return null;
  const buttons = [
    ...xml
      .slice(0, index)
      .matchAll(/<[^>]*clickable="true"[^>]*enabled="(true|false)"[^>]*>/g),
  ];
  return buttons.at(-1)?.[1] === undefined ? null : buttons.at(-1)?.[1] === 'true';
}

test.describe('Inspection Android - Change Password screen audit', () => {
  for (const language of ['ar', 'en'] as const) {
    test(`shows required password fields and controls in ${language}`, async (
      { inspectionAndroidDriver, homeScreen },
      testInfo,
    ) => {
      test.skip(!inspectionAndroidDriver, 'Appium session unavailable.');
      const driver = inspectionAndroidDriver!;
      await restartInspectionAndroidApp(driver);
      await homeScreen.waitUntilReady();
      await homeScreen.setLanguage(language);

      const { width, height } = await driver.getWindowSize();
      const homeSource = await driver.getPageSource();
      const rtl = homeSource.includes('text="مكتملة"');
      await driver
        .action('pointer')
        .move({ x: Math.round(width * (rtl ? 0.09 : 0.91)), y: Math.round(height * 0.08) })
        .down()
        .pause(80)
        .up()
        .perform();
      await driver.pause(300);
      await homeScreen.tapText(language === 'ar' ? 'تغيير كلمة المرور' : 'Change password');
      await driver.pause(500);

      const source = await driver.getPageSource();
      const title = language === 'ar' ? 'تغيير كلمة المرور' : 'Change password';
      const button = language === 'ar' ? 'تغيير كلمة المرور' : 'Change Password';
      const labels =
        language === 'ar'
          ? ['كلمة المرور الحالية *', 'كلمة المرور الجديدة *', 'إظهار']
          : ['Current Password *', 'New Password *', 'Show'];
      expect(source).toContain(`text="${title}"`);
      for (const label of labels) expect(source).toContain(`text="${label}"`);

      expect([...source.matchAll(/<android\.widget\.EditText\b[^>]*password="true"/g)]).toHaveLength(2);
      expect((source.match(new RegExp(`text="${labels[2]}"`, 'g')) ?? []).length).toBe(2);
      expect(enabledOnLastClickableAncestor(source, button)).toBe(false);

      await testInfo.attach(`${language}-change-password-screen.png`, {
        body: Buffer.from(await driver.takeScreenshot(), 'base64'),
        contentType: 'image/png',
      });
      await testInfo.attach(`${language}-change-password-screen.xml`, {
        body: Buffer.from(source),
        contentType: 'application/xml',
      });

      const showText = language === 'ar' ? 'إظهار' : 'Show';
      const hideText = language === 'ar' ? 'إخفاء' : 'Hide';
      const toggleLabels = (xml: string) =>
        [...xml.matchAll(/\btext="([^"]+)"/g)]
          .map((match) => match[1])
          .filter((label) => [showText, hideText].includes(label));

      const tapShowAt = async (index: number) =>
        homeScreen.tapElement(
          driver.$(`android=new UiSelector().text(${JSON.stringify(showText)}).instance(${index})`),
        );
      const assertOneShown = async () => {
        const labels = toggleLabels(await driver.getPageSource());
        expect(labels.filter((label) => label === hideText)).toHaveLength(1);
        expect(labels.filter((label) => label === showText)).toHaveLength(1);
      };
      const assertBothHidden = async () => {
        const labels = toggleLabels(await driver.getPageSource());
        expect(labels.filter((label) => label === showText)).toHaveLength(2);
        expect(labels.filter((label) => label === hideText)).toHaveLength(0);
      };

      await homeScreen.tapText(showText);
      await assertOneShown();
      await homeScreen.tapText(hideText);
      await assertBothHidden();
      await tapShowAt(1); // The second field's own control.
      await assertOneShown();
      await homeScreen.tapText(hideText);
      await assertBothHidden();
    });
  }
});
