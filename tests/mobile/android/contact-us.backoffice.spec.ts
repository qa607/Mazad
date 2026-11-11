import { expect, test } from '@fixtures/mobile.fixture';
import { openContactForm } from '@mobile/open-contact-form';
import { contactTypes } from '@pages/backend/content/contact-us.page';
import { contactUsText } from '@test-data/backend-contact-us.data';
import { contactUsViewLabels, createdAtToleranceMinutes } from '@test-data/contact-us-web.data';
import { languageOptions } from '@test-data/mobile-app.data';
import {
  contactUsCategory,
  mobileContactUsText,
  newMobileContactMessage,
} from '@test-data/mobile-contact-us.data';
import { blockedBy, MOBILE_CONTACT_SUBMIT_BLOCKED } from '@utils/account-actions';
import { minutesBetween, parseRiyadhDateTime } from '@utils/date';
import type { Language } from '@typings';

// Sends a real Contact Us message from the Android app to staging, then finds it in the back
// office. Skipped when the file loads unless the QA owner has approved it for the run
// (MAZAD_ALLOW_MOBILE_CONTACT_SUBMIT=true); app traffic is not intercepted, so this approval is
// the only guard. Runs in the android-backoffice project, after backend-setup has saved the
// Dev Root session. One message per language, with the agreed synthetic values.

// The back-office tab is signed in as Dev Root: no trace or video (see website.fixture's
// devRootBackend, which attaches a masked screenshot on failure instead).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// One device, and a retry would send a second message.
test.describe.configure({ mode: 'serial', retries: 0 });

const languages: Language[] = ['en', 'ar'];

for (const lang of languages) {
  const text = mobileContactUsText[lang];

  test.describe(
    `Contact Us - Android app (${lang}) - back office`,
    { tag: ['@regression', '@mutates'] },
    () => {
      // Declared at group level, so it is decided when the file loads: no Appium session,
      // back-office sign-in or request runs while sending is not approved.
      test.skip(Boolean(MOBILE_CONTACT_SUBMIT_BLOCKED), MOBILE_CONTACT_SUBMIT_BLOCKED);

      test(
        'A message sent from the app appears in the back office Contact us list',
        { tag: '@functional', annotation: blockedBy(MOBILE_CONTACT_SUBMIT_BLOCKED) },
        async (
          { driver, appShell, helpCenterScreen, contactFormScreen: form, mazadApi, devRootBackend },
          testInfo,
        ) => {
          const message = newMobileContactMessage();
          const list = devRootBackend.contactUsPage;

          const sentAt = await test.step('send the form from the app', async () => {
            const { body } = await mazadApi.getFaqCategories(lang);
            const category = contactUsCategory(body.data);
            expect(category, 'Help Center has at least one category').toBeDefined();
            await openContactForm(
              driver,
              { appShell, helpCenter: helpCenterScreen, form },
              {
                language: lang,
                languageOptions,
                helpCenterLabel: text.helpCenter,
                categoryName: category!.name,
                contactUsLabel: text.contactUsLink,
                formTitle: text.formTitle,
              },
            );

            await form.fill(message.values);
            expect(await form.value('name'), 'name kept as entered').toBe(message.values.name);
            expect(await form.isSendEnabled(text.send)).toBe(true);
            await form.send(text.send);
            const time = Date.now();

            await testInfo.attach('app-after-send.png', {
              body: await form.screenshot(),
              contentType: 'image/png',
            });

            // Every text seen on screen while the send finished is attached as evidence.
            const { outcome, textsSeen } = await form.waitForSendOutcome(text.formTitle);
            testInfo.annotations.push({ type: 'app-send-outcome', description: outcome });
            await testInfo.attach('app-texts-after-send.json', {
              body: JSON.stringify(textsSeen, null, 2),
              contentType: 'application/json',
            });
            // Recorded 2026-11-11: the form closes and a "Thank You!" dialog opens.
            expect(outcome).toBe('closed');
            expect(textsSeen).toEqual(
              expect.arrayContaining([text.sent.title, text.sent.message, text.sent.close]),
            );
            return time;
          });

          const row = await test.step('find it in the back office by its email', async () => {
            await list.goto();
            // A login page here instead means the saved Dev Root session was rejected or expired.
            await expect(list.pageHeading).toHaveText(contactUsText.pageTitle);
            await list.searchBy('emailInput', message.values.email);
            await expect(list.rows).toHaveCount(1);
            return list.readRow(list.rows.first());
          });

          testInfo.annotations.push({
            type: 'contact-us-id',
            description: `${row.id} (${message.values.email})`,
          });

          await test.step('the row holds what was sent', () => {
            expect(row).toMatchObject({
              type: contactTypes.contact_us,
              name: message.values.name,
              email: message.values.email,
              company: contactUsText.notSet,
            });
            // The app shows "+966" beside the box, so the stored format (05…, 5… or +9665…) is
            // not assumed: the national digits after the leading 0 must be there.
            expect(row.mobile).toContain(message.values.mobile.slice(1));
            const created = parseRiyadhDateTime(row.createdAt);
            expect(created, `Created At "${row.createdAt}"`).not.toBeNaN();
            expect(minutesBetween(created, sentAt)).toBeLessThanOrEqual(createdAtToleranceMinutes);
          });

          await test.step('its View page shows the message', async () => {
            await list.gotoView(row.id);
            await expect(list.viewValue(contactUsViewLabels.id)).toHaveText(row.id);
            await expect(list.viewValue(contactUsViewLabels.message)).toHaveText(
              message.values.message,
            );
            await expect(list.viewValue(contactUsViewLabels.email)).toHaveText(
              message.values.email,
            );
          });
        },
      );
    },
  );
}
