import { BackendAccount } from '@config/credentials.config';
import { expect, test } from '@fixtures/ios.fixture';
import { iosConfirmDeliveryBlocked, iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import type { IosAccountScreen } from '@mobile/ios/screens/account.screen';
import type { IosAppShellScreen } from '@mobile/ios/screens/app-shell.screen';
import {
  type SurveyQuestion,
  surveyQuestions,
} from '@pages/backend/reports/purchase-survey-report.page';
import {
  APPROVED_DELIVERY_MISSING,
  type ApprovedDelivery,
  approvedDelivery,
  confirmDeliveryAppText,
  confirmDeliveryIosLanguages,
  confirmDeliveryTestTitles,
  inDeliveryStatus,
  newSurveyComment,
  surveyScore,
} from '@test-data/confirm-delivery.data';
import { type IosAppText, iosAppText } from '@test-data/ios-app.data';
import { GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import { firstBlocked } from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import { generateTestPassword } from '@utils/generate-password';
import {
  attachFailureEvidence,
  HOME_TABS,
  LANGUAGE_OPTIONS,
  MORE_TABS,
  SERVER_RESPONSE_TIMEOUT,
} from './ios-test-helpers';

/**
 * Delivery confirmation and the purchase survey on iOS, the same scenario as the Android suite
 * (tests/mobile/android/confirm-delivery.backoffice.spec.ts), in Arabic.
 *
 * The run's sale is one already In Delivery, named with its buyer in MAZAD_CONFIRM_DELIVERY_SALE.
 * The back office (Dev Root) checks it, reads the car's Arabic title (Global Search) and the
 * active survey questions, and gives the buyer a new password for the run (in memory only). The
 * app signs in as the buyer, confirms the delivery from My Actions (received as specified, a drawn
 * signature) and answers the survey; the back office then lists the sale as Delivered with the
 * signature and the report shows the answers. The buyer is signed out after.
 *
 * Runs only with MAZAD_ALLOW_CONFIRM_DELIVERY=true and MAZAD_ALLOW_LOGOUT=true (its own approval,
 * iosConfirmDeliveryBlocked), under every device, build and narrow-text gate. An optional update
 * dialog (App Versions iOS 8.4 above the installed 8.3, seen 2026-11-17) is closed with "Later".
 * Runs in the ios-backoffice project. Failure evidence is non-visual (attachFailureEvidence).
 */
const APPROVED = approvedDelivery();
const GATE = firstBlocked(
  iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE }),
  iosConfirmDeliveryBlocked(),
  APPROVED ? undefined : APPROVED_DELIVERY_MISSING,
);

// The back-office tab is signed in as Dev Root and the app as a customer: no trace or video.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// One device; a retry would find the sale already delivered.
test.describe.configure({ mode: 'default', retries: 0, timeout: 480_000 });

/** More, signed out: logs the current account out when one is signed in. */
async function signOut(
  appShell: IosAppShellScreen,
  accountScreen: IosAccountScreen,
  appText: IosAppText,
): Promise<void> {
  await appShell.openMore(appText.tabs.more, appText.tabs.home);
  if (await appShell.waitUntilMoreDisplayed(appText.guestPrompt, 3_000)) return;
  await accountScreen.logout(appText.logoutConfirm, appText.logoutBack);
  expect(
    await appShell.waitUntilMoreDisplayed(appText.guestPrompt, SERVER_RESPONSE_TIMEOUT),
    'More shows the guest prompt after logging out',
  ).toBe(true);
}

for (const lang of confirmDeliveryIosLanguages) {
  const text = confirmDeliveryAppText[lang];
  const appText = iosAppText(lang);
  const labels = allureLabels({
    feature: 'Delivery survey',
    story: 'Buyer confirms delivery, back office shows it',
    severity: 'critical',
    platform: 'ios',
    language: lang,
  });

  test.describe(
    `Confirm delivery and purchase survey - iOS app (${lang}) - back office`,
    { tag: [...labels.tag, '@regression', '@mutates', '@crud'], annotation: labels.annotation },
    () => {
      // Decided when the file loads: no session, sign-in or back-office change while blocked.
      test.skip(Boolean(GATE), GATE);
      test.use({ language: lang });

      test.afterEach(
        async ({ driver, appShell, accountScreen, confirmDeliveryScreen }, testInfo) => {
          await attachFailureEvidence(driver, testInfo);
          // Never leave the buyer signed in on the device.
          await confirmDeliveryScreen.dismissOptionalUpdate(text.optionalUpdateLater, 3_000);
          await signOut(appShell, accountScreen, appText);
        },
      );

      test(
        confirmDeliveryTestTitles.ios,
        { tag: '@functional' },
        async ({
          driver,
          iosConfig,
          appShell,
          accountScreen,
          loginScreen,
          guestTabsScreen,
          confirmDeliveryScreen: delivery,
          purchaseSurveyScreen: survey,
          devRootBackend,
        }) => {
          const { saleId, accountId } = APPROVED as ApprovedDelivery;
          const {
            mazadSoldListPage: sold,
            mazadDeliveredListPage: delivered,
            globalSearchPage,
            individualFormPage: buyerForm,
            confirmDeliverySurveyPage: surveyQuestionsPage,
            purchaseSurveyReportPage: report,
          } = devRootBackend;
          const comment = newSurveyComment();

          const sale =
            await test.step('the approved sale is In Delivery, bought by the approved account', async () => {
              const row = await sold.findSale(saleId, inDeliveryStatus.filter);
              if (!row) throw new Error(`Sale ${saleId} is not listed ${inDeliveryStatus.label}.`);
              expect(row.status).toBe(inDeliveryStatus.label);
              expect(row.customerId, 'buyer account').toBe(accountId);
              return row;
            });

          const carTitle =
            await test.step('the car has an Arabic title (Global Search)', async () => {
              const titles = await globalSearchPage.vehicleTitles(sale.vin);
              if (!titles) throw new Error(`Global Search does not list VIN ${sale.vin}.`);
              return titles.title;
            });

          const questions =
            await test.step('the back office has the active survey questions', async () => {
              await surveyQuestionsPage.goto();
              const active = (await surveyQuestionsPage.readRows())
                .filter((question) => question.isActive === 'Yes')
                .sort((a, b) => Number(a.id) - Number(b.id));
              expect(active.length, 'active questions').toBeGreaterThan(0);
              return active;
            });
          const scores = questions.map((question, index) => surveyScore(index, question.to));

          const buyer = await test.step('the buyer gets a new password for this run', async () => {
            await buyerForm.gotoUpdate(accountId);
            const phone = `0${await buyerForm.phoneDigits()}`;
            const password = generateTestPassword();
            await buyerForm.resetPassword(password);
            return new BackendAccount(phone, password);
          });

          await test.step('the app is signed in as the buyer', async () => {
            await restartIosApp(driver, iosConfig);
            await delivery.dismissOptionalUpdate(text.optionalUpdateLater);
            await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
            await signOut(appShell, accountScreen, appText);
            await loginScreen.openLoginForm(appText.guestPrompt, appText.entryChoiceLogin);
            await loginScreen.waitForForm();
            await loginScreen.enterDeliveryBuyerLogin(buyer.phone, buyer.password);
            // Compared as a boolean so the number never appears in the report.
            const phoneTyped = (await loginScreen.phoneDigits()) === buyer.phone.replace(/\D/g, '');
            expect(phoneTyped, 'the whole phone number is in the field').toBe(true);
            await loginScreen.submitDeliveryBuyerLogin();
            await loginScreen.phoneInput.waitForExist({
              reverse: true,
              timeout: SERVER_RESPONSE_TIMEOUT,
            });
            await loginScreen.dismissNativeSavePasswordPrompt();
            await loginScreen.dismissPromptIfPresent(appText.fingerprintPromptDismiss);
            await delivery.dismissOptionalUpdate(text.optionalUpdateLater, 5_000);
          });

          await test.step('My Actions offers the car for pickup', async () => {
            await guestTabsScreen.openTab(text.myActionsTab);
            // By title AND step: the buyer may hold another car with the same title, still unpaid.
            expect(
              await delivery.findCard(carTitle, text.pickupStep, text.pickupButton),
              `card "${carTitle}" at "${text.pickupStep}"`,
            ).toBe(true);
          });

          await test.step('the buyer confirms the delivery: received as specified, and signed', async () => {
            await delivery.openFromCard(
              carTitle,
              text.pickupStep,
              text.pickupButton,
              text.confirmButton,
            );
            await delivery.confirmDelivery(text.signHere, text.confirmButton);
            await delivery.chooseAfterDelivery(text.rateExperience);
          });

          await test.step('the survey asks the active questions, and the answers are sent', async () => {
            await survey.waitForSurvey();
            expect(await survey.questions()).toEqual([
              ...questions.map((question) => question.question.replace(/\s+/g, ' ').trim()),
              text.optionalQuestion,
            ]);
            await survey.chooseScores(scores);
            await survey.writeComment(comment, text.surveyTitle);
            await survey.send(text.sent);
            await survey.close(text.back);
          });

          await test.step('the back office lists the sale as Delivered, with the signature', async () => {
            expect(
              await sold.findSale(saleId, inDeliveryStatus.filter),
              `sale ${saleId} no longer ${inDeliveryStatus.label}`,
            ).toBeNull();
            await delivered.gotoVin(sale.vin);
            await expect(delivered.row(saleId), `sale ${saleId} in the Delivered List`).toHaveCount(
              1,
            );
            const row = await delivered.readRow(delivered.row(saleId));
            expect(row.customerId, 'buyer account').toBe(accountId);
            expect(row.actions).toContain('Signature');
          });

          await test.step('the Purchase Survey Report shows the answers', async () => {
            await report.goto();
            const answered = (await report.readRows()).find((row) => row.other === comment);
            if (!answered) throw new Error("No report row with this run's comment.");
            expect(answered.itemTitle).toBe(sale.itemTitle);
            for (const [index, question] of questions.entries()) {
              const key = (Object.keys(surveyQuestions) as SurveyQuestion[]).find(
                (k) => surveyQuestions[k].label === question.questionEn,
              );
              if (!key || key === 'other') {
                throw new Error(`No report column for "${question.questionEn}".`);
              }
              expect(answered[key], question.questionEn).toEqual({
                score: scores[index],
                outOf: question.to,
              });
            }
          });
        },
      );
    },
  );
}
