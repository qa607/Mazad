import { expect, test } from '@fixtures/ios.fixture';
import { ACCOUNT_TEST_POLICY } from '@config/ios-account-policy';
import {
  RESEND_WAIT_MARGIN_SECONDS,
  rejectedPasswordPlan,
} from '@mobile/ios/account/account-preflight';
import {
  chainDefinition,
  type OtpChain,
  type OtpChainId,
  STEP,
} from '@mobile/ios/account/otp-chain';
import { maskPhone } from '@mobile/ios/account/recovery-journal';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { GUEST_FORM_TEST_TITLES, GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { OBSERVED_OTP_SCREEN_TEXT } from '@test-data/ios-otp-screen.data';
import { OBSERVED_PHONE_INPUT as PHONE_INPUT } from '@test-data/ios-phone-input.data';
import { websiteLoginData } from '@test-data/website-login.data';
import { allureLabels } from '@utils/allure-labels';
import { categoryAnnotations, type Causes } from '@utils/test-category';
import {
  accountJournal,
  chainEffective,
  chainFor,
  chainProblem,
  cleanupAccountState,
  INDIVIDUAL_EXCLUDED_REASON,
  isSignedInNow,
  issueOtpPermit,
  markResetRestored,
  markValidOtpEntered,
  requireGuestAtStart,
  RUN_ID,
  runCauses,
  withPasswordAttemptJournal,
} from './ios-account-helpers';
import {
  attachFailureEvidence,
  attachScreenEvidence,
  isEnabled,
  LANGUAGES,
  openGuestLoginForm,
  passwordBelowMinimum,
  REJECTION_SETTLE_MS,
  SERVER_RESPONSE_TIMEOUT,
} from './ios-test-helpers';

/**
 * Mazad iOS Forgot Password. Scenarios follow the web and Android suites; one file covers both
 * languages. All gates are declaration-level, so blocked tests run no hook and no fixture.
 *
 * OTP-dependent tests run as OTP CHAINS: one serial group per chain on one app session, sharing
 * exactly ONE OTP request (src/mobile/ios/account/otp-chain.ts, docs/ios-login-forgot-password-flow-plan.md).
 * - Serial only, no retries; the chain stops at its first failure.
 * - One OTP per chain, never reused; the English and Arabic chains are separate.
 * - English chain  (dealer-en-reset): OTP step, OTP layout, resend blocked, empty OTP, resend offered, correct
 *   OTP, new-password layout, empty new password, below-minimum password, rejected password, complete reset
 *   (to the account's known baseline password). Steps whose recorded policy or screen text is missing are
 *   declared but not run, and no OTP is spent on them.
 * - Arabic chain   (dealer-ar-flow): the same, without the final save.
 * - Incorrect OTP  (dealer-en-incorrect-otp, dealer-ar-incorrect-otp): its own OTP each.
 * After a chain ends (pass or fail) the app is returned to guest state.
 * The Individual account is excluded.
 */
test.describe.configure({ mode: 'serial' });
// The suite may load once every gate except the FULL text gate is open: the narrow text gate
// (test-data/ios-verified-text.ts) covers only the guest display test below. Every other test is
// skipped at declaration while IOS_TEXT_VERIFIED is closed.
const SUITE_PROBLEM = iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE });
const OTHER_TESTS_PROBLEM = iosStaticProblem();
test.skip(Boolean(SUITE_PROBLEM), SUITE_PROBLEM);

/** How long an invalid attempt is watched: three times the window every server response is given elsewhere. */
const ATTEMPT_CONFIRM_MS = 3 * SERVER_RESPONSE_TIMEOUT;

/**
 * After an INVALID attempt: the new-password step must stay on screen for the whole confirmation window. A
 * save navigates away, so the heading disappearing is the positive sign that the value was ACCEPTED; a window
 * as long as the one every server response is given elsewhere in this suite is what "rejected" rests on, never
 * the assumption that the backend validates. Throws when the step was left.
 */
async function confirmNotSaved(
  driver: { pause(ms: number): Promise<void> },
  screen: { heading(label: string): { isDisplayed(): Promise<boolean> } },
  headingLabel: string,
): Promise<void> {
  const end = Date.now() + ATTEMPT_CONFIRM_MS;
  const stillThere = async () => {
    if (!(await screen.heading(headingLabel).isDisplayed())) {
      throw new Error(
        'The new-password step was left after an invalid attempt: the value may have been ACCEPTED and saved.',
      );
    }
  };
  await driver.pause(REJECTION_SETTLE_MS);
  do {
    await stillThere();
    await driver.pause(2_000);
  } while (Date.now() < end);
  // One last look at the end of the window: a save that came back late shows here, not in the loop.
  await stillThere();
}

/** What a chain's steps need besides the chain object (kept out of the test signatures). */
const UNREGISTERED_OTP_EXCLUDED_REASON =
  'Excluded by the QA owner for this milestone: only the valid and invalid OTP test cases are used; an unregistered-number request would spend one of the 4 OTP requests allowed before OTP sending is blocked for 24 hours.';

/** What the chain's tests carry in reports (typed categories, see src/utils/test-category.ts). */
function chainCauses(id: OtpChainId): Causes {
  return {
    ...runCauses(chainEffective(id).kind, id),
    textGate: OTHER_TESTS_PROBLEM,
  };
}

/**
 * One OTP chain: a serial group of tests sharing one OTP request. Declares the tests in the
 * chain's order; each runs its own assertions through chain.step(), which enforces the order and
 * stops the chain after a failure. Cleanup (guest state, journal) runs once the chain has ended.
 *
 * Only the steps the recorded policy allows are in the chain (chainEffective): the base steps never
 * depend on the password rules; the below-minimum step needs X1 and the reset step needs X1, X2 and
 * X3. A step that is not allowed is still declared, as a skipped test with its reason, and no OTP is
 * spent on it. Every OTP request needs a single-use permit (src/mobile/ios/account/otp-permit.ts).
 */
/* eslint-disable playwright/no-standalone-expect -- the step bodies run inside tests, declared by declareStep */
function declareOtpChain(id: OtpChainId, lang: 'en' | 'ar') {
  const chain: OtpChain = chainFor(id);
  const effective = chainEffective(id);
  const problem = chainProblem(id);
  const annotation = categoryAnnotations(chainCauses(id));

  /** Declares a step: a test in the chain, or a skipped test with the reason when it is excluded. */
  const declareStep = (title: string, body: Parameters<typeof test>[2]) => {
    const pendingText = effective.pending.find((p) => p.step === title);
    if (pendingText) {
      test.skip(
        title,
        {
          annotation: categoryAnnotations({
            pending: pendingText.reason,
            textGate: OTHER_TESTS_PROBLEM,
          }),
        },
        () => undefined,
      );
      return;
    }
    const excluded = effective.excluded.find((e) => e.step === title);
    if (excluded) {
      test.skip(
        title,
        {
          annotation: categoryAnnotations({
            policy: excluded.reason,
            textGate: OTHER_TESTS_PROBLEM,
          }),
        },
        () => undefined,
      );
      return;
    }
    test(title, { annotation }, body);
  };

  test.describe(() => {
    test.describe.configure({ mode: 'serial', retries: 0 });
    test.skip(Boolean(problem), problem);

    test.afterEach(async ({ driver, iosConfig, appShell, accountScreen }, testInfo) => {
      // A step that timed out never reached the chain's own failure handling: end the chain here, so the
      // cleanup below still runs (and a journal entry it left open stays open for the QA owner).
      if (!chain.ended && testInfo.status === 'timedOut') {
        chain.failStep(testInfo.title, 'the test timed out');
      }
      if (!chain.ended) return; // Later steps continue on the same session.
      await cleanupAccountState(driver, iosConfig, appShell, accountScreen, {
        signInExpected: chain.def.resetsPassword,
      });
      if (chain.def.resetsPassword && chain.failure === undefined) markResetRestored();
    });

    if (id === 'dealer-en-incorrect-otp' || id === 'dealer-ar-incorrect-otp') {
      test(
        STEP.incorrectOtp,
        { annotation },
        async (
          {
            driver,
            iosConfig,
            appShell,
            loginScreen,
            forgotPasswordScreen,
            otpScreen,
            accountScreen,
            text,
            iosDealerAccount,
          },
          testInfo,
        ) => {
          await chain.step(STEP.incorrectOtp, async () => {
            await restartIosApp(driver, iosConfig);
            await requireGuestAtStart(appShell, accountScreen);
            await openGuestLoginForm(appShell, loginScreen, lang, text);
            await loginScreen.openForgotPassword(text.forgotPassword);
            // The permit is issued first: without every authorization nothing is requested.
            const permit = issueOtpPermit(effective.kind, id, iosDealerAccount.phone, id);
            await chain.requestOtp(() =>
              forgotPasswordScreen.requestPasswordReset(iosDealerAccount.phone, permit),
            );
            await otpScreen
              .heading(text.otpVerificationHeading)
              .waitForDisplayed({ timeout: SERVER_RESPONSE_TIMEOUT });
            // The OTP screen as it is, before anything is typed (its layout was never seen on iOS).
            await attachScreenEvidence(driver, testInfo, 'otp-screen');
            await chain.enterOtp(() =>
              otpScreen.verifyOtp(websiteLoginData.wrongOtp, text.verifyButton, {
                kind: effective.kind,
                chainId: id,
              }),
            );
            await expect
              .poll(() => otpScreen.text(text.incorrectOtp).isDisplayed(), {
                timeout: SERVER_RESPONSE_TIMEOUT,
              })
              .toBe(true);
            // Still on the OTP step: a wrong code does not change the password.
            expect(await otpScreen.heading(text.otpVerificationHeading).isDisplayed()).toBe(true);
          });
        },
      );
      return;
    }

    declareStep(
      STEP.otpStep,
      async (
        {
          driver,
          iosConfig,
          appShell,
          loginScreen,
          forgotPasswordScreen,
          otpScreen,
          accountScreen,
          text,
          iosDealerAccount,
        },
        testInfo,
      ) => {
        await chain.step(STEP.otpStep, async () => {
          await restartIosApp(driver, iosConfig);
          await requireGuestAtStart(appShell, accountScreen);
          await openGuestLoginForm(appShell, loginScreen, lang, text);
          await loginScreen.openForgotPassword(text.forgotPassword);
          // The chain's ONE OTP request, with its single-use permit.
          const permit = issueOtpPermit(effective.kind, id, iosDealerAccount.phone, id);
          await chain.requestOtp(() =>
            forgotPasswordScreen.requestPasswordReset(iosDealerAccount.phone, permit),
          );
          // What the app shows right after Send (a loading state, if it has one): evidence only.
          await attachScreenEvidence(driver, testInfo, 'after-send');
          await otpScreen
            .heading(text.otpVerificationHeading)
            .waitForDisplayed({ timeout: SERVER_RESPONSE_TIMEOUT });
          expect(await otpScreen.heading(text.otpVerificationHeading).isDisplayed()).toBe(true);
          // The OTP screen as it is, before anything is typed (its layout was never seen on iOS).
          await attachScreenEvidence(driver, testInfo, 'otp-screen');
        });
      },
    );

    // Read-only: the OTP input must be one of the two shapes the suite can fill (one field for the whole
    // code, or one per digit). Nothing is typed. If the layout is something else, the correct-OTP step could
    // not enter the code either, so the chain stops here and the attached evidence shows the real layout.
    declareStep(STEP.otpLayout, async ({ otpScreen, otpCode }, testInfo) => {
      await chain.step(STEP.otpLayout, async () => {
        const layout = await otpScreen.inputLayout(otpCode.length);
        testInfo.annotations.push({ type: 'otp-layout', description: layout });
      });
    });

    // Cooldown, read-only and with no request: checks only that NO control with the recorded iOS label is
    // offered (absent or disabled) while the recorded cooldown runs. It needs the recorded cooldown and the
    // recorded label (taken from the first run's OTP-screen evidence); until both are recorded it is not run.
    // A wrong reading of the unrecorded control would end the chain after its OTP was spent, which is why the
    // label is only ever recorded from evidence.
    declareStep(STEP.resendBlocked, async ({ otpScreen }) => {
      await chain.step(STEP.resendBlocked, async () => {
        const label = OBSERVED_OTP_SCREEN_TEXT[lang].resendControl;
        if (!label) throw new Error('The iOS resend control label is not recorded.');
        expect(await otpScreen.resendOffered(label), 'resend while the cooldown runs').toBe(false);
      });
    });

    declareStep(STEP.emptyOtp, async ({ otpScreen, text }) => {
      await chain.step(STEP.emptyOtp, async () => {
        expect(await isEnabled(await otpScreen.verifyButton(text.verifyButton))).toBe(false);
      });
    });

    // Cooldown over, read-only and with no request: a control with the recorded label is offered again (the
    // suite only checks that it is offered, it never taps it). The wait follows the RECORDED cooldown.
    declareStep(STEP.resendOffered, async ({ otpScreen }) => {
      await chain.step(STEP.resendOffered, async () => {
        const label = OBSERVED_OTP_SCREEN_TEXT[lang].resendControl;
        const cooldown = ACCOUNT_TEST_POLICY.otp.cooldownSeconds?.value;
        if (!label) throw new Error('The iOS resend control label is not recorded.');
        if (typeof cooldown !== 'number') throw new Error('The OTP cooldown is not recorded.');
        test.setTimeout((cooldown + RESEND_WAIT_MARGIN_SECONDS) * 1000);
        await expect
          .poll(() => otpScreen.resendOffered(label), {
            message: 'resend after the cooldown',
            timeout: (cooldown + 30) * 1000,
            intervals: [2_000],
          })
          .toBe(true);
      });
    });

    declareStep(
      STEP.correctOtp,
      async ({ driver, otpScreen, newPasswordScreen, otpCode, text }, testInfo) => {
        await chain.step(STEP.correctOtp, async () => {
          // The OTP is entered once; the chain never reuses it.
          await chain.enterOtp(() =>
            otpScreen.verifyOtp(otpCode, text.verifyButton, { kind: effective.kind, chainId: id }),
          );
          // What the app shows right after Verify (a loading state, if it has one): evidence only.
          await attachScreenEvidence(driver, testInfo, 'after-verify');
          await newPasswordScreen
            .heading(text.newPasswordHeading)
            .waitForDisplayed({ timeout: SERVER_RESPONSE_TIMEOUT });
          expect(await newPasswordScreen.heading(text.newPasswordHeading).isDisplayed()).toBe(true);
          // The app accepted the valid OTP: record it, which resets the count of requests without one.
          markValidOtpEntered(id);
          // The new-password screen as it is, before anything is typed (never seen on iOS).
          await attachScreenEvidence(driver, testInfo, 'new-password-screen');
        });
      },
    );

    // Read-only: the web and Android screens have ONE password field and no confirmation field; the iOS
    // screen was never seen. Exactly ONE SECURE field is what the rest of the chain can fill. Two would mean
    // a confirmation field: its locators and the mismatch scenario must be recorded first, never guessed.
    // Other (plain) text fields are only counted as evidence: the attached new-password-screen list shows them.
    declareStep(STEP.newPasswordLayout, async ({ newPasswordScreen }, testInfo) => {
      await chain.step(STEP.newPasswordLayout, async () => {
        const fields = await newPasswordScreen.passwordFieldCount();
        const others = await newPasswordScreen.otherTextFieldCount();
        testInfo.annotations.push({ type: 'new-password-fields', description: String(fields) });
        testInfo.annotations.push({
          type: 'new-password-other-text-fields',
          description: String(others),
        });
        expect(
          fields,
          'secure password fields on the new-password screen (the suite supports exactly one)',
        ).toBe(1);
      });
    });

    declareStep(STEP.emptyPassword, async ({ newPasswordScreen, text }) => {
      await chain.step(STEP.emptyPassword, async () => {
        expect(
          await isEnabled(await newPasswordScreen.saveAndLoginButton(text.saveAndLoginButton)),
        ).toBe(false);
      });
    });

    // X1 step: only in the chain when the backend's minimum length and violation behaviour are
    // confirmed. The value tried is ONE character below the CONFIRMED minimum, never a number taken
    // from the website, and the expected result is the confirmed one (the step is not left).
    declareStep(
      STEP.shortPassword,
      async ({ driver, newPasswordScreen, text, iosDealerAccount }) => {
        await chain.step(STEP.shortPassword, async () => {
          const minimum = ACCOUNT_TEST_POLICY.passwordRules.minLength?.value;
          if (typeof minimum !== 'number') throw new Error('X1 minimum length is not recorded.');
          // The backend's rule is not trusted: the attempt is journaled first and only closed as "unchanged"
          // after the step is observed to stay on screen (see confirmNotSaved).
          await withPasswordAttemptJournal(
            iosDealerAccount.phone,
            'below-minimum password',
            async () => {
              await newPasswordScreen.setNewPassword(
                passwordBelowMinimum(minimum),
                text.saveAndLoginButton,
                { kind: effective.kind, chainId: id },
                'invalid-attempt',
              );
              await confirmNotSaved(driver, newPasswordScreen, text.newPasswordHeading);
            },
          );
        });
      },
    );

    // Rejected passwords, each an invalid attempt that must leave the step on screen with nothing saved: the
    // account's current password when the backend CONFIRMED it rejects reuse, and the examples the backend
    // owner confirmed (both come from the recorded policy, never from another platform).
    declareStep(
      STEP.rejectedPassword,
      async ({ driver, newPasswordScreen, text, iosDealerAccount }) => {
        await chain.step(STEP.rejectedPassword, async () => {
          const plan = rejectedPasswordPlan(ACCOUNT_TEST_POLICY);
          const candidates = [
            ...(plan.currentPassword ? [iosDealerAccount.password] : []),
            ...plan.examples,
          ];
          if (!candidates.length) throw new Error('No rejected password is confirmed.');
          // Every candidate is watched for the whole confirmation window, so the test needs that long.
          test.setTimeout(candidates.length * (ATTEMPT_CONFIRM_MS + 30_000) + 60_000);
          // Journaled first, closed as "unchanged" only after every candidate was observed to be rejected.
          await withPasswordAttemptJournal(
            iosDealerAccount.phone,
            'rejected-password candidates',
            async () => {
              for (const candidate of candidates) {
                await newPasswordScreen.setNewPassword(
                  candidate,
                  text.saveAndLoginButton,
                  { kind: effective.kind, chainId: id },
                  'invalid-attempt',
                );
                await confirmNotSaved(driver, newPasswordScreen, text.newPasswordHeading);
              }
            },
          );
        });
      },
    );

    if (chainDefinition(id).resetsPassword) {
      test.describe('password reset', () => {
        declareStep(
          STEP.completeReset,
          async (
            { driver, newPasswordScreen, loginScreen, appShell, text, iosDealerAccount },
            testInfo,
          ) => {
            await chain.step(STEP.completeReset, async () => {
              // Recorded BEFORE the save: an interrupted run leaves an open entry that blocks the
              // next account run until the QA owner has checked the account.
              accountJournal.begin(RUN_ID, maskPhone(iosDealerAccount.phone));
              // The reset goes to the account's known baseline password (from .env). This step is
              // only in the chain when the backend confirmed that the current password may be reused.
              await newPasswordScreen.setNewPassword(
                iosDealerAccount.password,
                text.saveAndLoginButton,
                { kind: effective.kind, chainId: id },
                'save',
              );
              // What the app shows right after Save (a loading state, if it has one): evidence only.
              await attachScreenEvidence(driver, testInfo, 'after-save');
              // The save is positively observed when the step is LEFT (a rejected value stays on it). It is
              // recorded as applied BEFORE the end state is judged, so a save that went through but ended in an
              // unexpected state stays an open 'applied' entry for the QA owner, never a plain failure; a step
              // that never left stays 'pending' (unknown) and this assertion fails.
              await expect
                .poll(() => newPasswordScreen.heading(text.newPasswordHeading).isDisplayed(), {
                  message: 'the new-password step is left after Save',
                  timeout: SERVER_RESPONSE_TIMEOUT,
                })
                .toBe(false);
              accountJournal.mark(RUN_ID, 'applied');
              // The expected end state is the CONFIRMED iOS result (X2(a)), not the website's or
              // Android's. An unexpected prompt is not dismissed: the assertion below fails.
              if (ACCOUNT_TEST_POLICY.passwordReset.signsInAutomatically?.value === true) {
                await expect
                  .poll(() => isSignedInNow(appShell, text), {
                    timeout: SERVER_RESPONSE_TIMEOUT,
                  })
                  .toBe(true);
              } else {
                await loginScreen.waitForForm();
              }
            });
          },
        );
      });
    }
  });
}

/* eslint-enable playwright/no-standalone-expect */

for (const lang of LANGUAGES) {
  test.describe(
    `iOS forgot password (${lang})`,
    allureLabels({
      feature: 'Forgot Password',
      story: 'Forgot Password',
      severity: 'critical',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test.afterEach(async ({ driver }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
      });

      // Display and single-submission tests: a fresh app with Forgot Password open for each test.
      test.describe(() => {
        test.beforeEach(async ({ driver, iosConfig, appShell, loginScreen, text }) => {
          await restartIosApp(driver, iosConfig);
          await openGuestLoginForm(appShell, loginScreen, lang, text);
          await loginScreen.openForgotPassword(text.forgotPassword);
        });

        // iOS has a Close button, not a Back button (inspected 2026-11-09), so the Web/Android
        // "back returns to Login" scenario does not exist here as written. This test covers what
        // the screen shows; the Close behavior has its own pending test below.
        // Display only: types nothing, submits nothing. The heading is the ONE StaticText with its
        // label and the phone field the ONE TextField (checked, never picked by order).
        test(GUEST_FORM_TEST_TITLES[1], async ({ forgotPasswordScreen, text }) => {
          expect(
            await (await forgotPasswordScreen.onlyHeading(text.resetPasswordHeading)).isDisplayed(),
          ).toBe(true);
          expect(await (await forgotPasswordScreen.onlyPhoneInput()).isDisplayed()).toBe(true);
        });

        // Close returned to Login in both languages in the 2026-11-09 inspection. Navigation only:
        // nothing is typed or submitted. Close is the ONE Button with the app's accessible name
        // `navigationBarClose` (see IosForgotPasswordScreen.onlyCloseButton).
        test(GUEST_FORM_TEST_TITLES[2], async ({ forgotPasswordScreen, loginScreen, text }) => {
          await (await forgotPasswordScreen.onlyCloseButton()).click();
          await loginScreen.waitForForm();
          expect(
            await (await loginScreen.onlyForgotPasswordLink(text.forgotPassword)).isDisplayed(),
          ).toBe(true);
        });

        // Local validation (nothing is submitted). The Send button is the ONE Button of the screen
        // without an accessible name (interim, until it has an id).
        test(GUEST_FORM_TEST_TITLES[7], async ({ forgotPasswordScreen }) => {
          expect(await isEnabled(await forgotPasswordScreen.sendButton())).toBe(false);
        });

        // The enabled side: a made-up (unregistered) number is typed, Send is checked and NEVER
        // tapped, so no OTP request is made.
        test(GUEST_FORM_TEST_TITLES[9], async ({ forgotPasswordScreen }) => {
          await (
            await forgotPasswordScreen.onlyPhoneInput()
          ).setValue(websiteLoginData.unregisteredPhone);
          await forgotPasswordScreen.hideKeyboard();
          expect(await isEnabled(await forgotPasswordScreen.sendButton())).toBe(true);
        });

        // The phone field's local behaviour, as OBSERVED on the device (test-data/ios-phone-input.data.ts).
        // Only synthetic values are typed; Send is only READ (never tapped), so no request is made. An empty
        // field reports its placeholder as its value, so "stays empty" means "equals the value read before".
        test(GUEST_FORM_TEST_TITLES[16], async ({ forgotPasswordScreen: screen }) => {
          const empty = await screen.phoneValue();
          for (const value of [PHONE_INPUT.letters, PHONE_INPUT.arabicIndicDigits]) {
            await screen.enterPhone(value);
            expect(await screen.phoneValue(), 'the field stays empty').toBe(empty);
            expect(await isEnabled(await screen.sendButton()), 'Send').toBe(false);
          }
        });

        test(GUEST_FORM_TEST_TITLES[17], async ({ forgotPasswordScreen: screen }) => {
          for (const typed of PHONE_INPUT.withNonDigits) {
            await screen.enterPhone(typed);
            expect(await screen.phoneValue(), 'only the digits are kept').toBe(
              typed.replace(/\D/g, ''),
            );
            expect(await isEnabled(await screen.sendButton()), 'Send').toBe(true);
          }
        });

        test(GUEST_FORM_TEST_TITLES[18], async ({ forgotPasswordScreen: screen }) => {
          for (const { typed, keptLength } of PHONE_INPUT.tooLong) {
            await screen.enterPhone(typed);
            expect(await screen.phoneValue(), 'the first digits are kept').toBe(
              typed.slice(0, keptLength),
            );
          }
        });

        test(GUEST_FORM_TEST_TITLES[19], async ({ forgotPasswordScreen: screen }) => {
          const empty = await screen.phoneValue();
          await screen.enterPhone(PHONE_INPUT.complete);
          expect(await isEnabled(await screen.sendButton()), 'Send with a number').toBe(true);
          await screen.clearPhone();
          expect(await screen.phoneValue(), 'the field is empty again').toBe(empty);
          expect(await isEnabled(await screen.sendButton()), 'Send once cleared').toBe(false);
        });

        // The app does no length check before Send: one digit is enough. What the backend answers to an
        // incomplete number is a server response and is covered by the pending scenario below.
        test(GUEST_FORM_TEST_TITLES[20], async ({ forgotPasswordScreen: screen }) => {
          await screen.enterPhone(PHONE_INPUT.singleDigit);
          expect(await isEnabled(await screen.sendButton())).toBe(true);
        });

        // Recovery: what was typed is not kept when the screen is closed and opened again. Only a synthetic
        // number is typed and nothing is sent; an empty field reports a value read BEFORE typing.
        test(
          GUEST_FORM_TEST_TITLES[21],
          async ({ forgotPasswordScreen: screen, loginScreen, text }) => {
            const empty = await screen.phoneValue();
            await screen.enterPhone(PHONE_INPUT.complete);
            expect(await isEnabled(await screen.sendButton()), 'Send with a number').toBe(true);
            await screen.close();
            await loginScreen.waitForForm();
            await loginScreen.openForgotPassword(text.forgotPassword);
            expect(await screen.phoneValue(), 'the field is empty again').toBe(empty);
            expect(await isEnabled(await screen.sendButton()), 'Send after reopening').toBe(false);
          },
        );

        // Everything below needs text beyond the narrow gate: declared skipped (no hook, no
        // fixture, no app action) while the full IOS_TEXT_VERIFIED gate is closed.
        test.describe(() => {
          test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM);

          const fixmeAnnotation = (reason: string) => ({
            annotation: categoryAnnotations({ fixme: reason, textGate: OTHER_TESTS_PROBLEM }),
          });

          test.fixme(
            'Invalid phone number format',
            fixmeAnnotation(
              'the iOS app enables Send from one digit (observed); what happens when Send is tapped with an incomplete number was not observed, tapping it may be an OTP-path request, and no platform records the answer',
            ),
            () => {
              // Not invented: see the observed local rules in test-data/ios-phone-input.data.ts.
            },
          );

          test.fixme(
            'Password confirmation mismatch',
            fixmeAnnotation(
              'web and Android have no confirmation field; the iOS layout is recorded by the new-password layout step of the first authorized run, and a confirmation field needs its own recorded locators',
            ),
            () => {
              // Not applicable on web and Android; unknown on iOS until the layout is recorded.
            },
          );

          test.fixme(
            'Expired OTP is rejected',
            fixmeAnnotation(
              'needs an OTP that really expires: the OTP lifetime (Q4) is unconfirmed, the fixed staging OTP was reported not to follow the same rules (Q6; which rules is open), whether staging sends real SMS is unanswered (Q5) and real codes are not allowed, and it would need two more OTP chains beyond the approved four and the run budget',
            ),
            () => {
              // Not automated: see docs/ios-login-forgot-password-flow-plan.md (expired OTP).
            },
          );

          test.fixme(
            'Resend sends a new OTP',
            fixmeAnnotation(
              'a resend is a second OTP request inside one chain: the approved structure is exactly one request per chain, the reported limit is 4 requests, and the resend control is not recorded; it needs resend chains approved by the QA owner',
            ),
            () => {
              // Not automated: the cooldown steps above only read the resend control, they never tap it.
            },
          );

          test.fixme(
            'OTP input rejects letters and incomplete codes',
            fixmeAnnotation(
              'the iOS OTP input rules are not recorded on any platform, and typing a code into the field may submit it by itself, so a code is only typed by the guarded Verify step',
            ),
            () => {
              // Not automated: typing outside the guarded step could submit an OTP.
            },
          );

          test.fixme(
            'A loading indicator is shown while a request is in flight',
            fixmeAnnotation(
              'no loading behaviour is recorded on any platform; the first authorized run attaches after-send, after-verify and after-save evidence to define it',
            ),
            () => {
              // Not automated: evidence first, then an expected result.
            },
          );

          test.fixme(
            'Leaving the OTP or new-password step returns to a known screen',
            fixmeAnnotation(
              'no Back or Close control of the OTP or new-password screens has been seen on iOS; the otp-screen and new-password-screen evidence records them',
            ),
            () => {
              // Not automated: the controls and the destination are not recorded.
            },
          );

          test.fixme(
            'A reset to a different password restores the baseline afterwards',
            fixmeAnnotation(
              'only needed if the backend rejects reusing the current password: it changes the account password and restores it with a second OTP request (docs/ios-login-forgot-password-flow-plan.md); blocked until reuse is confirmed and separately approved',
            ),
            () => {
              // Not implemented by design: see the plan.
            },
          );

          test.skip(
            'OTP request limit blocks further requests',
            {
              annotation: categoryAnnotations({
                excluded:
                  'Deliberately exceeding the backend OTP limit would block further OTP sending for 24 hours (reported; the scope, per device, is not fully stated: Q3 and Q11) and the recovery procedure is unrecorded (Q12); the suite limit of 3 requests in a row without a valid OTP forbids it by design',
                textGate: OTHER_TESTS_PROBLEM,
              }),
            },
            () => {
              // Excluded: no scenario may exceed the backend request limit.
            },
          );

          // QA owner decision (2026-11-09): only the valid and invalid OTP test cases are used, because
          // sending more than 4 OTPs blocks OTP sending for 24 hours. An unregistered-number request is
          // an OTP-path request and would spend one of the 4, so it is excluded from this milestone.
          test.describe('server calls', () => {
            test.skip(true, UNREGISTERED_OTP_EXCLUDED_REASON);

            test(
              'Unregistered phone number is rejected',
              {
                annotation: categoryAnnotations({
                  excluded: UNREGISTERED_OTP_EXCLUDED_REASON,
                  textGate: OTHER_TESTS_PROBLEM,
                }),
              },
              () => {
                // Excluded: no unregistered-number OTP request is made in this milestone.
              },
            );
          });
        });
      });

      // OTP chains: no per-test app restart; the chain keeps one session and one OTP.
      test.describe(() => {
        test.skip(Boolean(OTHER_TESTS_PROBLEM), OTHER_TESTS_PROBLEM);

        test.describe('server calls', () => {
          test.describe('dealer account (OTP-dependent)', () => {
            declareOtpChain(lang === 'en' ? 'dealer-en-reset' : 'dealer-ar-flow', lang);

            if (lang === 'ar') {
              // The Arabic chain does not save a password (the reset is covered once, in English).
              test.describe('password reset', () => {
                test.skip(
                  true,
                  'Not part of the Arabic chain: the password reset is covered once, in the English chain.',
                );

                test(
                  STEP.completeReset,
                  {
                    annotation: categoryAnnotations({
                      excluded:
                        'Not part of the Arabic chain: the password reset is covered once, in the English chain.',
                      textGate: OTHER_TESTS_PROBLEM,
                    }),
                  },
                  () => {
                    // Declared for the title only.
                  },
                );
              });
            }

            // Incorrect OTP: its own chain and OTP (a wrong attempt may burn the OTP).
            declareOtpChain(
              lang === 'en' ? 'dealer-en-incorrect-otp' : 'dealer-ar-incorrect-otp',
              lang,
            );
          });

          // The Individual account is excluded by the QA owner: declared, never run.
          test.describe('individual account (OTP-dependent)', () => {
            test.skip(true, INDIVIDUAL_EXCLUDED_REASON);

            for (const title of [
              STEP.otpStep,
              STEP.otpLayout,
              STEP.resendBlocked,
              STEP.correctOtp,
              STEP.emptyOtp,
              STEP.resendOffered,
              STEP.incorrectOtp,
              STEP.newPasswordLayout,
              STEP.shortPassword,
              STEP.rejectedPassword,
              STEP.emptyPassword,
            ]) {
              test(
                title,
                {
                  annotation: categoryAnnotations({
                    excluded: INDIVIDUAL_EXCLUDED_REASON,
                    textGate: OTHER_TESTS_PROBLEM,
                  }),
                },
                () => {
                  // Excluded: no Individual account is used by iOS automation.
                },
              );
            }

            test.describe('password reset', () => {
              test(
                STEP.completeReset,
                {
                  annotation: categoryAnnotations({
                    excluded: INDIVIDUAL_EXCLUDED_REASON,
                    textGate: OTHER_TESTS_PROBLEM,
                  }),
                },
                () => {
                  // Excluded: no Individual account is used by iOS automation.
                },
              );
            });
          });
        });
      });
    },
  );
}
