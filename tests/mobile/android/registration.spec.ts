import { expect, test } from '@fixtures/mobile.fixture';
import { restartApp } from '@mobile/android.session';
import { ensureSignedOut } from '@mobile/ensure-signed-out';
import type { MazadRegistrationScreen } from '@mobile/screens/registration.screen';
import { mobileAppText } from '@test-data/mobile-app.data';
// Reused as-is from the Web registration suite (tests/website/registration.spec.ts): the field
// shapes and the City/Region option are synthetic values, not website-specific, and the app's
// Mobile Number field expects the same locally-formatted number the website does.
import { registrationCityOption, registrationData } from '@test-data/registration.data';
import { allureLabels } from '@utils/allure-labels';
import type { Language } from '@typings';

// Same shared device/Appium session as login.spec.ts and forgot-password.spec.ts: must not run
// concurrently with them (run this project with --workers=1).
test.describe.configure({ mode: 'serial' });

/**
 * Registration (Android): account-type selection and Step 2 (Personal and Company), confirmed on
 * staging 2026-11-10/11. Entry is the same bottom sheet as Login (More tab's guest prompt →
 * "Create a new account"; see MazadRegistrationScreen). Expected text that reads identically to
 * the website is read from `t()` (account-type heading/cards, most Step 2 field labels, both
 * submit buttons); app-only text (Step 2 screen/section headings, the mobile-verification hint,
 * the fuller password note, the City/Region placeholder, and the Commercial Registry label, which
 * differs from the website's English string) lives in `mobileAppText.registrationFlow` instead —
 * see the class doc comment on MazadRegistrationScreen for the full reasoning.
 *
 * Reuses `test-data/registration.data.ts` from the Web suite as-is (synthetic values, not
 * website-specific) and `MazadRegistrationScreen` for all locators (no raw selector in this file).
 *
 * Deliberately stops at Step 2 field state: no submit button is ever clicked, no OTP is requested
 * or verified, and no account is created.
 *
 * Password length and the submit button (confirmed business decision, 2026-11-11): both forms'
 * submit button may enable with a password shorter than 6 characters, even though the screen's
 * own note recommends 6+ — this is accepted Android behavior, not a defect, and differs
 * deliberately from the website (which does enforce it client-side). See
 * docs/android-registration-progress.md for full status.
 */
const languages: Language[] = ['en', 'ar'];

/** Opens registration and advances to Step 2 for the given account type. Never submits. */
async function openStep2(
  registrationScreen: MazadRegistrationScreen,
  text: (typeof mobileAppText)[Language],
  accountType: 'individual' | 'company',
): Promise<void> {
  await registrationScreen.openFromGuestPrompt(
    text.loginFlow.guestPrompt,
    text.loginFlow.entryChoiceCreateAccount,
  );
  if (accountType === 'individual') {
    await registrationScreen.choosePersonalAccount();
  } else {
    await registrationScreen.chooseCompanyAccount();
  }
  await registrationScreen.continueToStep2();
}

const PERSONAL_FIELDS = ['fullName', 'iqama', 'mobile', 'password', 'city'] as const;
type PersonalField = (typeof PERSONAL_FIELDS)[number];

/** Fills every Personal Step 2 field except `skip`, if given. Never submits. */
async function fillPersonalFields(
  registrationScreen: MazadRegistrationScreen,
  city: string,
  skip?: PersonalField,
  password: string = registrationData.wellFormedPassword,
): Promise<void> {
  if (skip !== 'fullName') await registrationScreen.enterFullName(registrationData.name);
  if (skip !== 'iqama') await registrationScreen.enterIqama(registrationData.idIqama);
  if (skip !== 'mobile') await registrationScreen.enterMobile(registrationData.mobilePhone);
  if (skip !== 'password') await registrationScreen.enterPassword(password);
  if (skip !== 'city') await registrationScreen.selectCity(city);
}

const COMPANY_FIELDS = ['fullName', 'iqama', 'mobile', 'password', 'cr', 'taxId'] as const;
type CompanyField = (typeof COMPANY_FIELDS)[number];

/** Fills every Company Step 2 field except `skip`, if given. Never submits. */
async function fillCompanyFields(
  registrationScreen: MazadRegistrationScreen,
  skip?: CompanyField,
  password: string = registrationData.wellFormedPassword,
): Promise<void> {
  if (skip !== 'fullName') await registrationScreen.enterFullName(registrationData.name);
  if (skip !== 'iqama') await registrationScreen.enterIqama(registrationData.idIqama);
  if (skip !== 'mobile') await registrationScreen.enterMobile(registrationData.mobilePhone);
  if (skip !== 'password') await registrationScreen.enterPassword(password);
  if (skip !== 'cr') {
    await registrationScreen.enterCommercialRegistry(registrationData.commercialRegistryNumber);
  }
  if (skip !== 'taxId') await registrationScreen.enterTaxId(registrationData.taxId);
}

/**
 * Format-boundary cases confirmed on staging, 2026-11-11: every numeric Step 2 field enforces a
 * maximum length via an input filter (typing past it is silently truncated), but none enforces a
 * minimum length or shape client-side — confirmed business behavior, consistent with the
 * password finding above, not a defect per field. National ID/Iqama and Mobile Number are shared
 * by both forms; Commercial Registry Number and Tax ID are Company-only.
 *
 * Mobile Number is asserted with `toBeLessThanOrEqual(maxLength)`, not `toHaveLength`, unlike the
 * other fields: it has a live formatting TextWatcher (confirmed by repeated probing) whose exact
 * truncation point races WebdriverIO's synthetic fast typing and varies run to run (9, 10, even 1
 * character observed for the same over-long input) — an automation-timing artifact of the app's
 * own live formatter, not a business rule, so only the upper bound is asserted.
 */
interface FormatBoundaryCase {
  label: string;
  maxLength: number;
  exactTruncation: boolean;
  enter: (registrationScreen: MazadRegistrationScreen, value: string) => Promise<void>;
  readBack: (registrationScreen: MazadRegistrationScreen) => Promise<string>;
}

const SHARED_FORMAT_CASES: readonly FormatBoundaryCase[] = [
  {
    label: 'ID/Iqama',
    maxLength: 10,
    exactTruncation: true,
    enter: (s, v) => s.enterIqama(v),
    readBack: (s) => s.iqamaInput.getText(),
  },
  {
    label: 'Mobile Number',
    maxLength: 10,
    exactTruncation: false,
    enter: (s, v) => s.enterMobile(v),
    readBack: (s) => s.mobileInput.getText(),
  },
];

const COMPANY_ONLY_FORMAT_CASES: readonly FormatBoundaryCase[] = [
  {
    label: 'Commercial Registry Number',
    maxLength: 10,
    exactTruncation: true,
    enter: (s, v) => s.enterCommercialRegistry(v),
    readBack: (s) => s.commercialRegistryInput.getText(),
  },
  {
    label: 'Tax ID',
    maxLength: 20,
    exactTruncation: true,
    enter: (s, v) => s.enterTaxId(v),
    readBack: (s) => s.taxIdInput.getText(),
  },
];

for (const lang of languages) {
  const text = mobileAppText[lang];

  test.describe(
    `Android registration - account type (${lang})`,
    allureLabels({
      feature: 'Registration',
      story: 'Account-type selection',
      severity: 'normal',
      platform: 'android',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

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

      test.beforeEach(async ({ driver, appShell, loginScreen, accountScreen }) => {
        await restartApp(driver);
        await appShell.waitUntilReady();
        await appShell.setLanguage(lang, {
          en: mobileAppText.en.languageOption,
          ar: mobileAppText.ar.languageOption,
        });
        await ensureSignedOut(
          appShell,
          loginScreen,
          accountScreen,
          text.loginFlow.guestPrompt,
          text.loginFlow.logoutConfirm,
        );
      });

      test('Opening registration shows the account-type screen with Next disabled', async ({
        registrationScreen,
        t,
      }) => {
        await registrationScreen.openFromGuestPrompt(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceCreateAccount,
        );

        expect(await registrationScreen.accountTypeHeading.getText()).toBe(t('chooseAccountType'));
        expect(await registrationScreen.personalAccountLabel.getText()).toBe(
          t('personalAccountChoice'),
        );
        expect(await registrationScreen.companyAccountLabel.getText()).toBe(
          t('companyAccountChoice'),
        );
        expect(await registrationScreen.isNextEnabled()).toBe(false);
      });

      test('Selecting Personal enables Next', async ({ registrationScreen }) => {
        await registrationScreen.openFromGuestPrompt(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceCreateAccount,
        );

        await registrationScreen.choosePersonalAccount();
        expect(await registrationScreen.isNextEnabled()).toBe(true);
      });

      test('Selecting Company enables Next', async ({ registrationScreen }) => {
        await registrationScreen.openFromGuestPrompt(
          text.loginFlow.guestPrompt,
          text.loginFlow.entryChoiceCreateAccount,
        );

        await registrationScreen.chooseCompanyAccount();
        expect(await registrationScreen.isNextEnabled()).toBe(true);
      });

      test.describe('step 2', () => {
        const city = registrationCityOption[lang];

        test('Personal Step 2 shows the expected fields, Create Account disabled when empty', async ({
          registrationScreen,
          t,
        }) => {
          await openStep2(registrationScreen, text, 'individual');

          expect(
            await registrationScreen
              .screenHeading(text.registrationFlow.screenHeadingPersonal)
              .isDisplayed(),
          ).toBe(true);
          expect(await registrationScreen.personalInfoHeadingOnPersonalForm.getText()).toBe(
            text.registrationFlow.personalInfoSectionHeading,
          );
          expect(await registrationScreen.fullNameLabel.getText()).toContain(
            t('registrationFullNameLabel'),
          );
          expect(await registrationScreen.iqamaLabel.getText()).toContain(
            t('registrationIdIqamaLabel'),
          );
          expect(await registrationScreen.mobileLabel.getText()).toContain(
            t('registrationMobileNumberLabel'),
          );
          expect(
            await registrationScreen
              .mobileVerificationHint(text.registrationFlow.mobileVerificationHint)
              .isDisplayed(),
          ).toBe(true);
          expect(await registrationScreen.passwordLabel.getText()).toContain(
            t('registrationPasswordLabel'),
          );
          expect(await registrationScreen.passwordNote.getText()).toBe(
            text.registrationFlow.passwordNote,
          );
          expect(await registrationScreen.cityLabel.getText()).toContain(
            t('registrationCityRegionLabel'),
          );
          expect(await registrationScreen.cityInput.getText()).toBe(
            text.registrationFlow.cityPlaceholder,
          );
          expect(await registrationScreen.createAccountButton.getText()).toBe(
            t('registrationCreateAccountButton'),
          );
          expect(await registrationScreen.isCreateAccountEnabled()).toBe(false);
          expect(await registrationScreen.emailFieldCount()).toBe(0);
        });

        test('Personal Step 2: City/Region picker opens, lists the expected city and selects it', async ({
          registrationScreen,
        }) => {
          await openStep2(registrationScreen, text, 'individual');

          await registrationScreen.openCityPicker();
          const option = registrationScreen.cityOption(city);
          expect(await option.isDisplayed()).toBe(true);

          await option.click();
          expect(await registrationScreen.cityInput.getText()).toBe(city);
        });

        test('Personal Step 2: filling every field, including City/Region, enables Create Account', async ({
          registrationScreen,
        }) => {
          await openStep2(registrationScreen, text, 'individual');

          await fillPersonalFields(registrationScreen, city);
          expect(await registrationScreen.isCreateAccountEnabled()).toBe(true);
        });

        // Accepted business behavior (confirmed 2026-11-11, both languages): unlike the website,
        // Android's Create Account does not enforce the password-note's 6-character recommendation
        // client-side — a short password enables it the same as a well-formed one. Not a defect.
        test('Personal Step 2: a too-short password still enables Create Account (by design)', async ({
          registrationScreen,
        }) => {
          await openStep2(registrationScreen, text, 'individual');

          await fillPersonalFields(
            registrationScreen,
            city,
            undefined,
            registrationData.tooShortPassword,
          );
          expect(await registrationScreen.isCreateAccountEnabled()).toBe(true);
        });

        for (const format of SHARED_FORMAT_CASES) {
          test(`Personal Step 2: ${format.label} accepts a 1-character value and truncates past ${format.maxLength} characters (by design)`, async ({
            registrationScreen,
          }) => {
            await openStep2(registrationScreen, text, 'individual');
            await fillPersonalFields(registrationScreen, city);

            await format.enter(registrationScreen, '1');
            expect(await registrationScreen.isCreateAccountEnabled()).toBe(true);

            await format.enter(registrationScreen, '1'.repeat(format.maxLength + 10));
            const truncated = await format.readBack(registrationScreen);
            if (format.exactTruncation) {
              expect(truncated).toHaveLength(format.maxLength);
            } else {
              expect(truncated.length).toBeLessThanOrEqual(format.maxLength);
            }
          });
        }

        for (const field of PERSONAL_FIELDS) {
          test(`Personal Step 2: ${field} left empty keeps Create Account disabled`, async ({
            registrationScreen,
          }) => {
            await openStep2(registrationScreen, text, 'individual');

            await fillPersonalFields(registrationScreen, city, field);
            expect(await registrationScreen.isCreateAccountEnabled()).toBe(false);
          });
        }

        test('Personal Step 2: back returns to account-type selection with Personal still chosen', async ({
          registrationScreen,
          driver,
        }) => {
          await openStep2(registrationScreen, text, 'individual');

          await driver.back();
          expect(await registrationScreen.isNextEnabled()).toBe(true);
        });

        test('Company Step 2 shows the expected fields, Verify disabled when empty', async ({
          registrationScreen,
          t,
        }) => {
          await openStep2(registrationScreen, text, 'company');

          expect(
            await registrationScreen
              .screenHeading(text.registrationFlow.screenHeadingCompany)
              .isDisplayed(),
          ).toBe(true);
          expect(await registrationScreen.personalInfoHeadingOnCompanyForm.getText()).toBe(
            text.registrationFlow.personalInfoSectionHeading,
          );
          expect(await registrationScreen.companyInfoHeading.getText()).toBe(
            text.registrationFlow.companyInfoSectionHeading,
          );
          expect(await registrationScreen.commercialRegistryLabel.getText()).toBe(
            text.registrationFlow.commercialRegistryLabel + ' *',
          );
          expect(await registrationScreen.taxIdLabel.getText()).toContain(
            t('registrationTaxIdLabel'),
          );
          expect(await registrationScreen.verifyButton.getText()).toBe(t('verify'));
          expect(await registrationScreen.isVerifyEnabled()).toBe(false);
          expect(await registrationScreen.emailFieldCount()).toBe(0);
        });

        test('Company Step 2: filling every field enables Verify (never clicked)', async ({
          registrationScreen,
        }) => {
          await openStep2(registrationScreen, text, 'company');

          await fillCompanyFields(registrationScreen);
          expect(await registrationScreen.isVerifyEnabled()).toBe(true);
        });

        // Accepted business behavior (confirmed 2026-11-11, both languages): same as Personal
        // Step 2 above — Android's Verify does not enforce the password-note's 6-character
        // recommendation client-side. Not a defect.
        test('Company Step 2: a too-short password still enables Verify (by design)', async ({
          registrationScreen,
        }) => {
          await openStep2(registrationScreen, text, 'company');

          await fillCompanyFields(registrationScreen, undefined, registrationData.tooShortPassword);
          expect(await registrationScreen.isVerifyEnabled()).toBe(true);
        });

        for (const format of [...SHARED_FORMAT_CASES, ...COMPANY_ONLY_FORMAT_CASES]) {
          test(`Company Step 2: ${format.label} accepts a 1-character value and truncates past ${format.maxLength} characters (by design)`, async ({
            registrationScreen,
          }) => {
            await openStep2(registrationScreen, text, 'company');
            await fillCompanyFields(registrationScreen);

            await format.enter(registrationScreen, '1');
            expect(await registrationScreen.isVerifyEnabled()).toBe(true);

            await format.enter(registrationScreen, '1'.repeat(format.maxLength + 10));
            const truncated = await format.readBack(registrationScreen);
            if (format.exactTruncation) {
              expect(truncated).toHaveLength(format.maxLength);
            } else {
              expect(truncated.length).toBeLessThanOrEqual(format.maxLength);
            }
          });
        }

        for (const field of COMPANY_FIELDS) {
          test(`Company Step 2: ${field} left empty keeps Verify disabled`, async ({
            registrationScreen,
          }) => {
            await openStep2(registrationScreen, text, 'company');

            await fillCompanyFields(registrationScreen, field);
            expect(await registrationScreen.isVerifyEnabled()).toBe(false);
          });
        }
      });
    },
  );
}
