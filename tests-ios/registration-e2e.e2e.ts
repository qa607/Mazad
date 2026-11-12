import { expect, test } from '@fixtures/ios.fixture';
import { accountContext, RUN_ID } from '@mobile/ios/account/account-context';
import type { AccountRunKind } from '@mobile/ios/account/account-preflight';
import { issueOtpRequestPermit, recordValidOtpEntered } from '@mobile/ios/account/otp-permit';
import { ACCOUNT_STATE_DIR, maskPhone } from '@mobile/ios/account/recovery-journal';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { allureLabels } from '@utils/allure-labels';
import { generateTestPassword } from '@utils/generate-password';
import { uniqueDigits } from '@utils/unique';
import { isSignedInNow } from './ios-account-helpers';
import {
  attachFailureEvidence,
  attachScreenEvidence,
  HOME_TABS,
  LANGUAGE_OPTIONS,
  MORE_TABS,
} from './ios-test-helpers';

/**
 * iOS registration -> logout -> Forgot Password -> reset -> login E2E journey, for ONE Individual
 * account this run creates for itself at runtime. Explicitly authorized (Full Authorization —
 * Mazad iOS Registration and Forgot Password E2E Journey, 2026-11-11): its own switch
 * (IOS_ALLOW_REGISTRATION_E2E_JOURNEY), its own run kinds (account-preflight.ts), kept separate
 * from every other iOS permit. config/ios-account-policy.ts is unchanged by this journey.
 *
 * The phone and password are generated HERE, at run time, held only in local variables, and never
 * written to .env, source, a screenshot or a log: every attachment in this file goes through
 * attachScreenEvidence/attachFailureEvidence (maskedInventory masks any run of 4+ digits, which
 * covers the phone and the OTP), and the only phone form that may reach the final report is
 * maskPhone(). The passwords are never attached or logged at all.
 *
 * NAFATH: if Nafath (or any unexpected mandatory identity verification) appears at any point, the
 * run stops immediately (nafathCheck, called after every screen transition) — no identity is ever
 * selected, no Verify/Continue is tapped, no code is generated, retrieved or waited out, and the
 * scenario is reported BLOCKED, never retried via another registration attempt.
 *
 * Only this one mutating test runs, in English. Arabic repeats the SHARED, non-mutating Step 2
 * layout only (tests-ios/registration-account-type.inspect.ts already recorded its field text
 * read-only); it never registers a second account, by design (not duplicated here).
 */
const SUITE_PROBLEM = iosStaticProblem(process.env, { forInspection: true });
test.skip(Boolean(SUITE_PROBLEM), SUITE_PROBLEM);
test.skip(
  process.env.IOS_ALLOW_REGISTRATION_E2E_JOURNEY !== 'true',
  'Blocked: IOS_ALLOW_REGISTRATION_E2E_JOURNEY is not "true" (the registration E2E journey is off by default).',
);
test.describe.configure({ mode: 'serial' });

export class NafathEncountered extends Error {
  constructor() {
    super(
      'BLOCKED - Nafath identity verification required. Stopped immediately: no identity was ' +
        'selected, nothing was tapped, no code was generated, retrieved or waited out. Not retried.',
    );
    this.name = 'NafathEncountered';
  }
}

/** Stops the run immediately if Nafath (or its Arabic name) appears anywhere on the current screen. */
async function nafathCheck(driver: { getPageSource(): Promise<string> }): Promise<void> {
  const xml = await driver.getPageSource();
  if (/nafath|نفاذ/i.test(xml)) throw new NafathEncountered();
}

const PERMIT_DEPS = { ledgerDir: ACCOUNT_STATE_DIR, runId: RUN_ID };

/** This journey's own permits: the registration request is unregistered, the reset request registered. */
function issueRegistrationPermit(kind: AccountRunKind, scenario: string, phone: string) {
  return issueOtpRequestPermit({
    kind,
    scenario,
    phone,
    target: kind === 'registration-otp-request' ? 'unregistered' : 'registered',
    deps: { ctx: accountContext(), ...PERMIT_DEPS },
  });
}

test.describe(
  'iOS registration E2E journey (en)',
  allureLabels({
    feature: 'Registration',
    story: 'Registration -> Forgot Password -> login journey',
    severity: 'critical',
    platform: 'ios',
    language: 'en',
  }),
  () => {
    test.use({ language: 'en' });

    test('Registers an Individual account, resets its password via Forgot Password, and logs in with the new one', async ({
      screenDriver: driver,
      iosConfig,
      appShell,
      registrationScreen,
      otpScreen,
      loginScreen,
      forgotPasswordScreen,
      newPasswordScreen,
      accountScreen,
      text,
      otpCode,
    }, testInfo) => {
      test.setTimeout(300_000);
      // Generated at run time only; never persisted, attached or logged. maskPhone() is the only
      // form of the phone that may reach a report.
      const phone = `05${uniqueDigits(8)}`;
      const iqama = `1${uniqueDigits(9)}`;
      const fullName = 'Test Automation User';
      const initialPassword = generateTestPassword();
      const newPassword = generateTestPassword();

      try {
        await restartIosApp(driver, iosConfig);
        await appShell.setLanguage('en', LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
        // A previous run of this SAME journey can leave its own throwaway account signed in (the
        // registration journey auto-signs in on success); logging it out here is safe because
        // only this journey's own account is ever reached this way, never the shared dealer one.
        if (await isSignedInNow(appShell, text)) {
          await accountScreen.logout(text.logoutConfirm, text.logoutBack);
        }
        await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);

        // --- Step 1: account type ---
        await registrationScreen.openFromGuestPrompt(text.guestPrompt, text.createAccountChoice);
        await (
          await registrationScreen.onlyText(text.chooseAccountType)
        ).waitForDisplayed({
          timeout: 15_000,
        });
        await nafathCheck(driver);
        await registrationScreen.selectPersonalAccountType();
        await registrationScreen.tapNext(text.registrationNext);

        // --- Step 2: Individual fields ---
        await (
          await registrationScreen.onlyText(text.personalStep2Heading)
        ).waitForDisplayed({
          timeout: 15_000,
        });
        await nafathCheck(driver);
        await registrationScreen.enterFullName(text.fullNamePlaceholder, fullName);
        await registrationScreen.enterIqama(text.iqamaPlaceholder, iqama);
        await registrationScreen.enterMobile(text.mobilePlaceholder, phone);
        await registrationScreen.enterPassword(
          text.registrationPasswordPlaceholder,
          initialPassword,
        );
        await registrationScreen.openCityPicker(text.cityRegionPlaceholder);
        await registrationScreen.selectFirstCity();
        await attachScreenEvidence(driver, testInfo, 'step2-filled');
        // Confirms the form actually validated (city really selected, etc.) before an OTP permit
        // is spent on a tap that a still-disabled button would silently swallow.
        await expect
          .poll(() => registrationScreen.createAccountEnabled(text.createAccountButton), {
            timeout: 10_000,
            message: 'Create Account enabled',
          })
          .toBe(true);

        // --- Submit: one registration OTP request ---
        const registerPermit = issueRegistrationPermit(
          'registration-otp-request',
          `registration-e2e-register-${RUN_ID}`,
          phone,
        );
        await registrationScreen.submitCreateAccount(
          text.createAccountButton,
          phone,
          registerPermit,
        );
        await driver.pause(2_000);
        await nafathCheck(driver);
        await appShell.dismissNativeSavePasswordPrompt();
        await attachScreenEvidence(driver, testInfo, 'after-create-account-tap');

        // --- Registration OTP screen: confirms Step 2 was actually LEFT (its own 3 TextFields
        // would otherwise satisfy a bare fieldCount() > 0 check without proving any navigation).
        // The heading may already be gone by the time this runs (onlyText() would then throw,
        // since there is nothing left to wait on) — either way counts as "left". ---
        try {
          await (
            await registrationScreen.onlyText(text.personalStep2Heading)
          ).waitForDisplayed({ timeout: 20_000, reverse: true });
        } catch {
          // Already gone (onlyText found 0), or it disappeared while waiting: both are "left Step 2".
        }
        await expect
          .poll(async () => otpScreen.fieldCount(), {
            timeout: 20_000,
            message: 'registration OTP screen',
          })
          .toBeGreaterThan(0);
        await nafathCheck(driver);
        await appShell.dismissNativeSavePasswordPrompt();
        await attachScreenEvidence(driver, testInfo, 'registration-otp-screen');
        await otpScreen.verifyOtp(otpCode, text.verifyButton, {
          kind: 'registration-otp-request',
          ctx: accountContext(),
        });
        recordValidOtpEntered({
          scenario: `registration-e2e-register-${RUN_ID}`,
          target: 'unregistered',
          deps: PERMIT_DEPS,
        });
        await driver.pause(2_000);
        await nafathCheck(driver);
        await appShell.dismissNativeSavePasswordPrompt();
        await attachScreenEvidence(driver, testInfo, 'after-registration-otp-verify');
        // "Your account has been successfully created!" confirmation screen (2026-11-11 device
        // evidence): dismiss it before checking for the tab bar underneath.
        await registrationScreen.dismissSuccessScreenIfShown();
        await driver.pause(1_000);
        await nafathCheck(driver);
        await attachScreenEvidence(driver, testInfo, 'after-success-screen-dismissed');

        // --- Registration success: the app signs the new account in --- (a generous timeout:
        // isSignedInNow's own internal waits can take up to ~45s on a single failing attempt,
        // which must fit within this budget for expect.poll to retry at all).
        await expect
          .poll(() => isSignedInNow(appShell, text), {
            timeout: 60_000,
            message: 'signed in after registration',
          })
          .toBe(true);

        // --- Log out ---
        await accountScreen.logout(text.logoutConfirm, text.logoutBack);
        await expect
          .poll(() => isSignedInNow(appShell, text), {
            timeout: 15_000,
            message: 'guest after logout',
          })
          .toBe(false);

        // --- Forgot Password: request an OTP for the number just registered ---
        await loginScreen.openLoginForm(text.guestPrompt, text.entryChoiceLogin);
        await loginScreen.waitForForm();
        await loginScreen.openForgotPassword(text.forgotPassword);
        await (
          await forgotPasswordScreen.onlyHeading(text.resetPasswordHeading)
        ).waitForDisplayed({
          timeout: 15_000,
        });
        await nafathCheck(driver);
        await forgotPasswordScreen.enterPhone(phone);
        const resetPermit = issueRegistrationPermit(
          'registration-password-reset',
          `registration-e2e-reset-${RUN_ID}`,
          phone,
        );
        await forgotPasswordScreen.requestPasswordReset(phone, resetPermit);
        await driver.pause(2_000);
        await nafathCheck(driver);
        await attachScreenEvidence(driver, testInfo, 'after-forgot-password-send');

        // --- Reset OTP screen: confirms Forgot Password was actually LEFT first (it also has
        // one TextField, which would otherwise satisfy fieldCount() > 0 without any navigation).
        // Same as above: the heading may already be gone (then onlyHeading() throws), which is
        // also "left". ---
        try {
          await (
            await forgotPasswordScreen.onlyHeading(text.resetPasswordHeading)
          ).waitForDisplayed({ timeout: 20_000, reverse: true });
        } catch {
          // Already gone, or it disappeared while waiting: both are "left Forgot Password".
        }
        await expect
          .poll(async () => otpScreen.fieldCount(), {
            timeout: 20_000,
            message: 'reset OTP screen',
          })
          .toBeGreaterThan(0);
        await nafathCheck(driver);
        await attachScreenEvidence(driver, testInfo, 'reset-otp-screen');
        await otpScreen.verifyOtp(otpCode, text.verifyButton, {
          kind: 'registration-password-reset',
          ctx: accountContext(),
        });
        recordValidOtpEntered({
          scenario: `registration-e2e-reset-${RUN_ID}`,
          target: 'registered',
          deps: PERMIT_DEPS,
        });
        await driver.pause(2_000);
        await nafathCheck(driver);
        await attachScreenEvidence(driver, testInfo, 'after-reset-otp-verify');

        // --- New password ---
        await (await newPasswordScreen.newPasswordInput()).waitForDisplayed({ timeout: 15_000 });
        await newPasswordScreen.setNewPassword(
          newPassword,
          text.saveAndLoginButton,
          { kind: 'registration-password-reset', ctx: accountContext() },
          'save',
        );
        await driver.pause(2_000);
        await nafathCheck(driver);
        await newPasswordScreen.dismissPromptIfPresent(text.fingerprintPromptDismiss);
        await appShell.dismissNativeSavePasswordPrompt();
        // A "Password changed" confirmation screen, same shape as registration's success screen
        // (one named Close button, one other unlabeled Button), may equally block the tab bar here.
        await registrationScreen.dismissSuccessScreenIfShown();
        await driver.pause(1_000);
        await nafathCheck(driver);
        await attachScreenEvidence(driver, testInfo, 'after-password-save');

        // --- The reset is expected to sign the app in automatically: confirm, then log out again ---
        await expect
          .poll(() => isSignedInNow(appShell, text), {
            timeout: 60_000,
            message: 'signed in after reset',
          })
          .toBe(true);
        await accountScreen.logout(text.logoutConfirm, text.logoutBack);
        await expect
          .poll(() => isSignedInNow(appShell, text), {
            timeout: 15_000,
            message: 'guest before login check',
          })
          .toBe(false);

        // --- Explicit login verification with the NEW password ---
        await loginScreen.openLoginForm(text.guestPrompt, text.entryChoiceLogin);
        await loginScreen.waitForForm();
        await loginScreen.login(phone, newPassword, {
          kind: 'registration-login',
          ctx: accountContext(),
        });
        await driver.pause(1_000);
        await nafathCheck(driver);
        await appShell.dismissNativeSavePasswordPrompt();
        await expect
          .poll(() => isSignedInNow(appShell, text), {
            timeout: 20_000,
            message: 'signed in with the new password',
          })
          .toBe(true);
        await attachScreenEvidence(driver, testInfo, 'final-login-success');
      } catch (error) {
        if (error instanceof NafathEncountered) {
          testInfo.annotations.push({ type: 'blocked', description: error.message });
        }
        await attachFailureEvidence(driver, testInfo);
        throw error;
      } finally {
        await testInfo.attach('masked-phone-reference.txt', { body: maskPhone(phone) });
      }
    });
  },
);

/**
 * Arabic: the SHARED, non-mutating Step 2 layout only (navigation and field presence, read-only,
 * same as tests-ios/registration-account-type.inspect.ts) — never a second registration, so the
 * account-mutating journey above is not duplicated. Stops before City/Region, Create Account or
 * any OTP request.
 */
test.describe(
  'iOS registration Step 2 layout (ar, shared, non-mutating)',
  allureLabels({
    feature: 'Registration',
    story: 'Personal Step 2 layout (Arabic, read-only)',
    severity: 'normal',
    platform: 'ios',
    language: 'ar',
  }),
  () => {
    test.use({ language: 'ar' });

    test('Shows the expected Personal Step 2 fields and placeholders', async ({
      screenDriver: driver,
      iosConfig,
      appShell,
      registrationScreen,
      accountScreen,
      text,
    }) => {
      await restartIosApp(driver, iosConfig);
      await appShell.setLanguage('ar', LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
      // The English journey test can leave its own throwaway account signed in (see its own
      // comment on the same check); safe to log out here for the same reason.
      if (await isSignedInNow(appShell, text)) {
        await accountScreen.logout(text.logoutConfirm, text.logoutBack);
      }
      await appShell.requireGuest(text.tabs.more, text.tabs.home, text.guestPrompt);

      await registrationScreen.openFromGuestPrompt(text.guestPrompt, text.createAccountChoice);
      await (
        await registrationScreen.onlyText(text.chooseAccountType)
      ).waitForDisplayed({
        timeout: 15_000,
      });
      await nafathCheck(driver);
      await registrationScreen.selectPersonalAccountType();
      await registrationScreen.tapNext(text.registrationNext);
      await (
        await registrationScreen.onlyText(text.personalStep2Heading)
      ).waitForDisplayed({
        timeout: 15_000,
      });
      await nafathCheck(driver);

      expect(
        await (await registrationScreen.onlyText(text.personalStep2Heading)).isDisplayed(),
      ).toBe(true);
      expect(await (await registrationScreen.onlyText(text.cityRegionLabel)).isDisplayed()).toBe(
        true,
      );
    });
  },
);
