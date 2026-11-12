import type { ContactFormField } from '@mobile/screens/contact-form.screen';
import { testRecordPrefix } from '@test-data/backend-common.data';
import { contactUsPhone } from '@test-data/contact-us-web.data';
import type { Language } from '@typings';
import type { FaqCategory } from '@typings/mazad';
import { digitsAsLetters, uniqueDigits } from '@utils/unique';

/**
 * Mazad Android app "Contact Form" test data. Recorded on staging (stg-154), app 8.2.2-stage,
 * on an emulator (Android 17, 2026-11-11), from the live screens and the app's own string
 * resources. Nothing was sent while recording.
 *
 * Where it is: More → Help Center → any category → "Can't find your answer?" → Contact Us.
 * A guest's More tab has no Contact Us row. The app also has a "Sell on Mazad" form type, but
 * no guest screen opens it (a "Selling on Mazad" Help Center category seen before the backend switch was FAQ only), so only Contact Us
 * is covered.
 *
 * How it differs from the website form (contact-us-web.data.ts):
 * - No inline errors at all: leaving a box empty or typing a bad email or mobile shows nothing.
 * - Send turns on as soon as all four boxes have text. The email and mobile formats are not
 *   checked by the app before sending.
 * - Mobile Number has a fixed "+966" beside it, ignores letters and takes at most 10 characters.
 *   Name drops digits and symbols, as on the website.
 * - It posts to the same endpoint as the website (v1/contact-form/submit, type contact_us).
 *
 * Backend: the app keeps its own backend setting (hidden menu, long press on More). The 8.2.2-stage
 * build defaults to mazad-v3.motory.dev, which resolves to the same internal IP as stg-154 but is
 * another environment: a send on 2026-11-11 before the switch never reached stg-154's back office.
 * The Android session now sets and verifies stg-154 before any test (src/mobile/ensure-app-backend.ts).
 *
 * Messages sent by the approved send test use the agreed synthetic values: a "QA AUTO" name,
 * a qa.mobile.<runId>@example.invalid email, the website tests' synthetic phone and a QA-AUTO
 * message. They are kept as evidence (no clean-up).
 */

/** Text the app shows on the way to and on the form (not served by the API). */
export const mobileContactUsText: Record<
  Language,
  {
    helpCenter: string;
    cantFindAnswer: string;
    contactUsLink: string;
    formTitle: string;
    whatsapp: string;
    intro: string;
    labels: Record<ContactFormField, string>;
    placeholders: Record<ContactFormField, string>;
    mobilePrefix: string;
    send: string;
    /**
     * Confirmation dialog after a successful send: the form closes and this dialog opens over the
     * category page. App text (string resources thank_you, we_will_contact_you_as_soon_as_possible,
     * close); English seen on the emulator 2026-11-11, Arabic from the same resources.
     */
    sent: { title: string; message: string; close: string };
  }
> = {
  en: {
    helpCenter: 'Help Center',
    cantFindAnswer: 'Can’t find your answer?',
    contactUsLink: 'Contact Us',
    formTitle: 'Contact Form',
    whatsapp: 'Contact Us via WhatsApp',
    intro: 'Or enter your information & we’ll contact you',
    labels: { name: 'Name', email: 'E-mail', mobile: 'Mobile Number', message: 'Message' },
    placeholders: {
      name: 'Enter your name',
      email: 'Enter your email',
      mobile: 'e.g. 0554235678',
      message: 'Enter your message',
    },
    mobilePrefix: '+966',
    send: 'Send',
    sent: {
      title: 'Thank You!',
      message: 'We will contact you as soon as possible',
      close: 'Close',
    },
  },
  ar: {
    helpCenter: 'مركز المساعدة',
    cantFindAnswer: 'لم تجد إجابة على استفسارك؟',
    contactUsLink: 'تواصل معنا',
    formTitle: 'نموذج الاتصال',
    whatsapp: 'تواصل معنا عبر واتساب',
    intro: 'أو أدخل معلوماتك وسنتواصل معك',
    labels: { name: 'الاسم', email: 'البريد الإلكتروني', mobile: 'رقم الجوال', message: 'الرسالة' },
    placeholders: {
      name: 'أدخل الاسم',
      email: 'أدخل البريد الإلكتروني',
      mobile: 'مثال: 0554235678',
      message: 'أدخل رسالتك',
    },
    mobilePrefix: '+966',
    send: 'أرسل',
    sent: { title: 'شكراً لك!', message: 'سيتم التواصل معك في أقرب وقت', close: 'إغلاق' },
  },
};

/** One message to send from the app. `runId` ties the name, email and message together. */
export interface MobileContactMessage {
  runId: string;
  values: Record<ContactFormField, string>;
}

/** "QA AUTO", not "QA-AUTO": the Name box drops "-" and digits (the run ID is spelled in letters). */
const namePrefix = testRecordPrefix.replace('-', ' ');

/** A new, unique message with the agreed synthetic values. */
export function newMobileContactMessage(): MobileContactMessage {
  const runId = uniqueDigits(7);
  return {
    runId,
    values: {
      name: `${namePrefix} Mobile ${digitsAsLetters(runId)}`,
      email: `qa.mobile.${runId}@example.invalid`,
      mobile: contactUsPhone,
      message: `${testRecordPrefix} Android Contact Us message ${runId}. Automated test, please ignore.`,
    },
  };
}

/**
 * Values that fill the form without sending it (the validation tests never press Send). The
 * email and mobile follow the synthetic rules anyway, in case Send is ever pressed by mistake.
 */
export const draftValues: Record<ContactFormField, string> = {
  name: `${namePrefix} Draft`,
  email: 'qa.mobile.draft@example.invalid',
  mobile: contactUsPhone,
  message: `${testRecordPrefix} draft, not sent.`,
};

/** Each box left empty in an otherwise full form: Send stays off. */
export const emptyFieldCases: readonly ContactFormField[] = ['name', 'email', 'mobile', 'message'];

/** Values for the box-filtering checks. */
export const mobileContactInputs = {
  nameWithDigitsAndSymbols: 'QA-Auto 42 Tester!',
  nameAfterFiltering: 'QAAuto  Tester',
  /** Letters mixed into Mobile Number are dropped, the digits kept. */
  mobileWithLetters: 'abc5d5',
  mobileWithLettersAfterFiltering: '55',
  /** Typed key by key: the box stops at 10 characters. */
  tooLongMobile: '055000000012',
  mobileMaxLength: 10,
} as const;

/**
 * The Help Center category used to reach the form: the last one the API lists, skipping test
 * records (other suites create and remove temporary QA-AUTO categories, which may be gone by the
 * time the app loads its list).
 */
export function contactUsCategory(categories: readonly FaqCategory[]): FaqCategory | undefined {
  return categories.filter((c) => !c.name.startsWith(testRecordPrefix)).at(-1);
}
