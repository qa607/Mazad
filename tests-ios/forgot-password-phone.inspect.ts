import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@fixtures/ios.fixture';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { websiteLoginData } from '@test-data/website-login.data';
import { allureLabels } from '@utils/allure-labels';
import { isEnabled, openGuestLoginForm } from './ios-test-helpers';

/**
 * Fourth guest inspection (project ios-inspect; run it by file). READ-ONLY: it records how the Forgot
 * Password PHONE field validates locally, so the permanent phone-validation tests assert what the iOS
 * app actually does instead of a rule copied from another platform. It types only synthetic values (a
 * prefix of the suite's made-up unregistered number, letters, symbols) and READS whether Send is enabled
 * and how long the field's value is afterwards. It NEVER taps Send (the screen object cannot), requests
 * nothing, logs in or out of nothing, and records no typed value: only lengths and yes/no results.
 * Output: reports/ios-inspection/forgot-password-phone-<language>.json.
 */
test.skip(
  Boolean(iosStaticProblem(process.env, { forInspection: true })),
  iosStaticProblem(process.env, { forInspection: true }),
);

const OUT_DIR = path.resolve(__dirname, '..', 'reports', 'ios-inspection');

/** Synthetic probes (never a real number). `label` is only a name for the result. */
const MADE_UP = websiteLoginData.unregisteredPhone;
const PROBES: { label: string; value: string }[] = [
  ...Array.from({ length: MADE_UP.length }, (_, i) => ({
    label: `made-up number, first ${i + 1} character(s)`,
    value: MADE_UP.slice(0, i + 1),
  })),
  { label: 'made-up number plus 1 digit (11 characters)', value: `${MADE_UP}1` },
  { label: 'made-up number plus 2 digits (12 characters)', value: `${MADE_UP}12` },
  { label: 'made-up number plus 3 digits (13 characters)', value: `${MADE_UP}123` },
  { label: '25 digits', value: '1234567890123456789012345' },
  { label: '10 Latin letters', value: 'abcdefghij' },
  { label: 'digits with 2 letters inside', value: '05a9999a99' },
  { label: 'international prefix with plus', value: `+966${MADE_UP.slice(1)}` },
  { label: 'digits separated by spaces', value: '050 999 9999' },
  { label: 'Arabic-Indic digits', value: '٠٥٠٩٩٩٩٩٩٩' },
];

for (const lang of ['en', 'ar'] as const) {
  test.describe(
    `iOS Forgot Password phone inspection (${lang})`,
    allureLabels({
      feature: 'Forgot Password',
      story: 'Guest screen inspection',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test('records the local validation of the phone field (guest, read-only)', async ({
        driver,
        iosConfig,
        appShell,
        loginScreen,
        forgotPasswordScreen,
        text,
      }) => {
        test.setTimeout(420_000);
        await restartIosApp(driver, iosConfig);
        await openGuestLoginForm(appShell, loginScreen, lang, text);
        await loginScreen.openForgotPassword(text.forgotPassword);

        const read = async () => {
          const field = await forgotPasswordScreen.onlyPhoneInput();
          const value = String((await field.getValue()) ?? '');
          return {
            valueLength: value.length,
            sendEnabled: await isEnabled(await forgotPasswordScreen.sendButton()),
          };
        };
        const probe = async (value: string) => {
          const field = await forgotPasswordScreen.onlyPhoneInput();
          await field.setValue(value);
          await forgotPasswordScreen.hideKeyboard();
          return { typedLength: value.length, ...(await read()) };
        };

        const results: Record<string, unknown>[] = [];
        // The empty field: its "value" is the placeholder text on iOS, so only its length is kept.
        results.push({ label: 'nothing typed', typedLength: 0, ...(await read()) });
        for (const p of PROBES) results.push({ label: p.label, ...(await probe(p.value)) });
        // Clearing what was typed (a Clear, not a typed value).
        await (await forgotPasswordScreen.onlyPhoneInput()).clearValue();
        await forgotPasswordScreen.hideKeyboard();
        results.push({ label: 'cleared again', typedLength: 0, ...(await read()) });

        await restartIosApp(driver, iosConfig);
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(OUT_DIR, `forgot-password-phone-${lang}.json`),
          JSON.stringify({ language: lang, build: '8.3 (1491)', results }, null, 2),
        );
        // Nothing is asserted about the rules here: this run only records them.
        expect(results.length).toBe(PROBES.length + 2);
      });
    },
  );
}
