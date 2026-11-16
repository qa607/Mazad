import { expect, test } from '@fixtures/inspection-android.fixture';
import {
  getSelectedAndroidInputMethod,
  restartInspectionAndroidApp,
  withArabicUnicodeIme,
} from '@mobile/inspection-android/inspection-android.session';
import { InspectorHomeScreen } from '@mobile/inspection-android/screens/inspector-home.screen';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

function buttonEnabled(xml: string, label: string): boolean | null {
  const index = xml.lastIndexOf(`text="${label.replace(/&/g, '&amp;')}"`);
  if (index < 0) return null;
  const clickable = [
    ...xml
      .slice(0, index)
      .matchAll(/<[^>]*clickable="true"[^>]*enabled="(true|false)"[^>]*>/g),
  ];
  const value = clickable.at(-1)?.[1];
  return value === undefined ? null : value === 'true';
}

test.describe('Inspection Android - Change Password keyboard resume', () => {
  test.setTimeout(120_000);

  for (const language of ['en', 'ar'] as const) {
    test(`accepts non-submitted field input and toggles visibility in ${language}`, async ({
      inspectionAndroidDriver,
    }) => {
      test.skip(!inspectionAndroidDriver, 'Appium session unavailable.');
      const driver = inspectionAndroidDriver!;
      if (language === 'en') {
        const samsungIme = 'com.samsung.android.honeyboard/.service.HoneyBoardService';
        expect(getSelectedAndroidInputMethod()).toBe(samsungIme);
        await withArabicUnicodeIme(async () => {
          await Promise.resolve();
          expect(getSelectedAndroidInputMethod()).toBe('io.appium.settings/.UnicodeIME');
        });
        expect(getSelectedAndroidInputMethod()).toBe(samsungIme);
        await expect(
          withArabicUnicodeIme(async () => {
            await Promise.resolve();
            expect(getSelectedAndroidInputMethod()).toBe('io.appium.settings/.UnicodeIME');
            throw new Error('synthetic note-input failure');
          }),
        ).rejects.toThrow('synthetic note-input failure');
        expect(getSelectedAndroidInputMethod()).toBe(samsungIme);
      }
      await restartInspectionAndroidApp(driver);

      const home = new InspectorHomeScreen(driver);
      const initial = await driver.getPageSource();
      if (initial.includes('text="Log in"') || initial.includes('text="تسجيل الدخول"')) {
        test.skip(true, 'App is signed out; no credentials are attempted in the keyboard-only audit.');
      }
      await home.waitUntilReady();
      await home.setLanguage(language);

      const { width, height } = await driver.getWindowSize();
      const homeXml = await driver.getPageSource();
      const rtl = homeXml.includes('text="قيد الفحص"');
      await driver
        .action('pointer')
        .move({ x: Math.round(width * (rtl ? 0.09 : 0.91)), y: Math.round(height * 0.08) })
        .down()
        .pause(80)
        .up()
        .perform();
      await driver.pause(250);
      await home.tapText(language === 'ar' ? 'تغيير كلمة المرور' : 'Change password');

      const fields = driver.$$('android=new UiSelector().className("android.widget.EditText")');
      const fieldCount = await fields.length;
      expect(fieldCount).toBe(2);
      const show = language === 'ar' ? 'إظهار' : 'Show';
      const hide = language === 'ar' ? 'إخفاء' : 'Hide';
      const submitLabel = language === 'ar' ? 'تغيير كلمة المرور' : 'Change Password';
      expect(buttonEnabled(await driver.getPageSource(), submitLabel)).toBe(false);

      for (let index = 0; index < fieldCount; index++) {
        // Compose text fields have previously ignored pointer-center taps while accessibility
        // element.click() successfully focuses them, so use the native element action here.
        await fields[index].click();
        await driver.waitUntil(() => driver.isKeyboardShown(), {
          timeout: 3_000,
          timeoutMsg: 'Android keyboard did not become visible after focusing a password field.',
        });
        expect(await driver.isKeyboardShown()).toBe(true);
        // Synthetic strings only; type both scripts into each field and never submit.
        for (const value of ['Test1234', 'اختبار١٢٣٤']) {
          // eslint-disable-next-line no-control-regex -- deliberate ASCII-only range check.
          if (/^[\x00-\x7F]*$/.test(value)) {
            for (const char of value) await driver.keys([char]);
          } else {
            // UiAutomator2 ACTION_SET_TEXT injects Unicode text into this native password
            // field while leaving Samsung Keyboard selected (unlike session-level Unicode IME).
            await fields[index].setValue(value);
          }
          await driver.pause(250);
          if (value === 'Test1234') {
            // Only one required field is populated at this point; do not submit.
            expect(buttonEnabled(await driver.getPageSource(), submitLabel)).toBe(false);
          }
          const showButton = driver.$(
            `android=new UiSelector().text(${JSON.stringify(show)}).instance(${index})`,
          );
          await home.tapElement(showButton);
          const shownLabels = (await driver.getPageSource()).match(
            new RegExp(`text="${hide}"`, 'g'),
          ) ?? [];
          expect(shownLabels).toHaveLength(1);
          // Android's accessibility node stays password-masked even after Show; verify it retains
          // the expected number of characters and the control enters its visible state.
          expect((await fields[index].getText()).length).toBe([...value].length);
          await home.tapText(hide);
          expect((await fields[index].getText()).length).toBe([...value].length);
          expect(await driver.isKeyboardShown()).toBe(true);

          // Visibility controls can take input focus; refocus the field before clearing.
          await fields[index].click();
          await driver.waitUntil(() => driver.isKeyboardShown(), { timeout: 3_000 });
          for (let i = 0; i < [...value].length; i++) await driver.pressKeyCode(67);
          expect((await fields[index].getText()).length).toBe(0);
        }
        await home.hideKeyboardIfShown();
      }

      // Assert the form remains open and required after clearing test input; never submit it.
      const finalXml = await driver.getPageSource();
      expect(finalXml).toContain(language === 'ar' ? 'تغيير كلمة المرور' : 'Change password');
      expect(buttonEnabled(finalXml, submitLabel)).toBe(false);
    });
  }
});
