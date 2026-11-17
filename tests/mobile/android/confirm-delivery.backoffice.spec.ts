import { BackendAccount } from '@config/credentials.config';
import { expect, test } from '@fixtures/mobile.fixture';
import { restartApp } from '@mobile/android.session';
import { ensureSignedOut } from '@mobile/ensure-signed-out';
import {
  type SurveyQuestion,
  surveyQuestions,
} from '@pages/backend/reports/purchase-survey-report.page';
import {
  APPROVED_DELIVERY_MISSING,
  type ApprovedDelivery,
  approvedDelivery,
  confirmDeliveryAppText,
  confirmDeliveryLanguages,
  inDeliveryStatus,
  newSurveyComment,
  surveyScore,
} from '@test-data/confirm-delivery.data';
import { languageOptions, mobileAppText } from '@test-data/mobile-app.data';
import { CONFIRM_DELIVERY_BLOCKED, firstBlocked, LOGOUT_BLOCKED } from '@utils/account-actions';
import { generateTestPassword } from '@utils/generate-password';

/**
 * Delivery confirmation and the purchase survey on Android, with the back office before and after.
 *
 * The run's sale is one already In Delivery, named with its buyer in MAZAD_CONFIRM_DELIVERY_SALE
 * ("<sale>:<account>", approved by the QA owner): a test cannot bring its own purchase that far,
 * because the buyer first pays a deposit by SADAD (see test-data/confirm-delivery.data.ts).
 * The back office (Dev Root) checks the sale and its buyer, reads the active survey questions and
 * gives the buyer a new password for this run (generated, in memory only, never printed). The app
 * signs in as the buyer, confirms the delivery from My Actions (received as specified, a drawn
 * signature) and answers the survey. The back office then lists the sale as Delivered with the
 * signature, and the Purchase Survey Report shows the answers. The buyer is signed out after.
 *
 * Runs only with MAZAD_ALLOW_CONFIRM_DELIVERY=true and MAZAD_ALLOW_LOGOUT=true. A sale is
 * confirmed once, so each run needs a new one. Runs in the android-backoffice project.
 */
const APPROVED = approvedDelivery();
const GATE = firstBlocked(
  CONFIRM_DELIVERY_BLOCKED,
  LOGOUT_BLOCKED,
  APPROVED ? undefined : APPROVED_DELIVERY_MISSING,
);

// The back-office tab is signed in as Dev Root and the app as a customer: no trace or video.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// One sale per run; a retry would find it already delivered.
test.describe.configure({ mode: 'serial', retries: 0, timeout: 420_000 });

// Decided when the file loads: no session, sign-in or back-office change while blocked.
test.skip(Boolean(GATE), GATE);

/** How long the app gets to answer a sign-in or a submitted step. */
const SERVER_RESPONSE_TIMEOUT = 20_000;

for (const lang of confirmDeliveryLanguages) {
  const text = confirmDeliveryAppText[lang];
  const loginText = mobileAppText[lang].loginFlow;

  test.describe(
    `Confirm delivery and purchase survey - Android app (${lang}) - back office`,
    { tag: ['@regression', '@mutates', '@crud'] },
    () => {
      test.afterEach(async ({ appShell, loginScreen, accountScreen }) => {
        // Never leave the buyer signed in on the device.
        await ensureSignedOut(
          appShell,
          loginScreen,
          accountScreen,
          loginText.guestPrompt,
          loginText.logoutConfirm,
        );
      });

      test(
        'A buyer confirms delivery and answers the survey, and the back office shows both',
        { tag: '@functional' },
        async ({
          driver,
          appShell,
          loginScreen,
          accountScreen,
          confirmDeliveryScreen: delivery,
          purchaseSurveyScreen: survey,
          devRootBackend,
        }) => {
          const { saleId, accountId } = APPROVED as ApprovedDelivery;
          const {
            mazadSoldListPage: sold,
            mazadDeliveredListPage: delivered,
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

          const questions =
            await test.step('the back office has the active survey questions', async () => {
              await surveyQuestionsPage.goto();
              const active = (await surveyQuestionsPage.readRows())
                .filter((question) => question.isActive === 'Yes')
                .sort((a, b) => Number(a.id) - Number(b.id));
              expect(active.length, 'active questions').toBeGreaterThan(0);
              return active;
            });
          const answers = questions.map((question, index) => ({
            score: surveyScore(index, question.to),
            from: question.from,
            to: question.to,
          }));

          const buyer = await test.step('the buyer gets a new password for this run', async () => {
            await buyerForm.gotoUpdate(accountId);
            const phone = `0${await buyerForm.phoneDigits()}`;
            const password = generateTestPassword();
            await buyerForm.resetPassword(password);
            return new BackendAccount(phone, password);
          });

          await test.step('the app is signed in as the buyer', async () => {
            await restartApp(driver);
            await appShell.waitUntilReadyClosingSheet();
            await appShell.setLanguage(lang, languageOptions);
            await ensureSignedOut(
              appShell,
              loginScreen,
              accountScreen,
              loginText.guestPrompt,
              loginText.logoutConfirm,
            );
            await loginScreen.openLoginForm(loginText.guestPrompt, loginText.entryChoiceLogin);
            await loginScreen.enterPhone(buyer.phone);
            // Compared as a boolean so the number never appears in the report.
            const phoneTyped = (await loginScreen.phoneDigits()) === buyer.phone.replace(/\D/g, '');
            expect(phoneTyped, 'the whole phone number is in the field').toBe(true);
            await loginScreen.enterPassword(buyer.password);
            await loginScreen.loginButton.click();
            await loginScreen.loginButton.waitForExist({
              reverse: true,
              timeout: SERVER_RESPONSE_TIMEOUT,
            });
            await loginScreen.dismissUpdatedTermsIfPresent();
            await loginScreen.dismissPromptIfPresent(loginText.fingerprintPromptDismiss);
          });

          await test.step('My Actions offers the car for pickup', async () => {
            await appShell.open('my_actions');
            // By title AND step: the buyer may hold another car with the same title, still unpaid.
            expect(
              await delivery.findCard(sale.itemTitle, text.pickupStep),
              `card "${sale.itemTitle}" at "${text.pickupStep}"`,
            ).toBe(true);
          });

          await test.step('the buyer confirms the delivery: received as specified, and signed', async () => {
            await delivery.openFromCard(sale.itemTitle, text.pickupStep, text.pickupButton);
            expect(await delivery.sheetTitle.getText()).toBe(text.sheetTitle);
            await delivery.confirmDelivery();
            await expect
              .poll(() => delivery.byText(text.thanks).isDisplayed(), {
                timeout: SERVER_RESPONSE_TIMEOUT,
              })
              .toBe(true);
            await delivery.chooseAfterDelivery(text.rateExperience);
          });

          await test.step('the survey asks the active questions, and the answers are sent', async () => {
            await survey.waitForSurvey(questions[0].questionEn);
            expect(await survey.questions()).toEqual([
              ...questions.map((question) => question.questionEn),
              text.optionalQuestion,
            ]);
            await survey.chooseScores(answers, text.scaleLow, text.scaleHigh);
            await survey.writeComment(comment);
            await survey.send(text.send, text.sent);
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
              if (!key || key === 'other')
                throw new Error(`No report column for "${question.questionEn}".`);
              expect(answered[key], question.questionEn).toEqual({
                score: answers[index].score,
                outOf: question.to,
              });
            }
          });
        },
      );
    },
  );
}
