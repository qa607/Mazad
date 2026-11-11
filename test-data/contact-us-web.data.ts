import type { TranslationKey } from '@locales';
import { testRecordPrefix } from '@test-data/backend-common.data';
import type { contactUsText } from '@test-data/backend-contact-us.data';
import { websiteLoginData } from '@test-data/website-login.data';
import { digitsAsLetters, uniqueDigits } from '@utils/unique';

/**
 * Website "Contact Us" form (/<lang>/contact-us/) test data. Localized UI text (labels,
 * placeholders, errors, the success message) lives in src/locales and is read through `t`; this
 * file holds language-independent inputs. Behaviour recorded on staging (stg-154) on
 * 2026-11-10, from the live form (every request blocked while recording) and the page's code:
 * - Send stays disabled until all four fields are valid; nothing is sent before that.
 * - Errors appear when a field is left: "cannot be blank", "Incorrect Email", and the mobile
 *   rules (must start with "5" or "05", 10 digits). Valid mobiles match ^05\d{8}$; a 9-digit
 *   number starting with 5 is sent with a 0 in front.
 * - The Name field removes digits and special characters (including "-") as they are typed.
 * - A valid form is sent as POST /api/v1/contact-form/submit (form fields name, email, phone,
 *   message). On 200 the form is cleared and the success message shows for 5 seconds.
 * - Messages arrive in the back office's Contact us list as type "Contact Us", with no company.
 * - No page of the website links to Contact Us (header, footer, phone menu, Help Center,
 *   About us), so it is opened by its URL.
 *
 * Every value the form sends must match the request guard's rule (contactUsSubmitRule): the
 * QA-AUTO name and message, an @example.invalid email and the one synthetic phone number.
 * Submitted messages are kept as evidence (no clean-up), so they are easy to find by prefix.
 */

/** One message to send. `stamp` makes it unique and ties the name, email and message together. */
export interface ContactMessage {
  stamp: string;
  name: string;
  email: string;
  phone: string;
  message: string;
}

/**
 * The website tests' synthetic Saudi mobile number (no account on staging), so the request
 * guard's log flags it as the known synthetic value.
 */
export const contactUsPhone = websiteLoginData.unregisteredPhone;

/**
 * The name carries "QA AUTO" rather than the usual "QA-AUTO" because the field removes "-" and
 * digits; the stamp is written as letters for the same reason.
 */
const namePrefix = testRecordPrefix.replace('-', ' ');

/** A new, unique message. */
export function newContactMessage(): ContactMessage {
  const stamp = uniqueDigits(7);
  return {
    stamp,
    name: `${namePrefix} Contact ${digitsAsLetters(stamp)}`,
    email: `qa.contact.${stamp}@example.invalid`,
    phone: contactUsPhone,
    message: `${testRecordPrefix} Contact Us message ${stamp}. Automated test, please ignore.`,
  };
}

/**
 * Exact shapes of the values newContactMessage() produces, used by the request guard: a submit
 * with any other value (a real email, another name or phone) is blocked before it is sent.
 */
export const contactUsSubmitRule = {
  format: 'form',
  fields: {
    name: [/^QA AUTO Contact [A-J]{7}$/],
    email: [/^qa\.contact\.\d{7}@example\.invalid$/],
    phone: [contactUsPhone],
    message: [/^QA-AUTO Contact Us message \d{7}\. Automated test, please ignore\.$/],
  },
} as const;

export type ContactField = 'name' | 'email' | 'mobile' | 'message';

/** Each field left empty, and the error it shows. */
export const requiredFieldCases: readonly { field: ContactField; error: TranslationKey }[] = [
  { field: 'name', error: 'contactUsNameRequired' },
  { field: 'email', error: 'contactUsEmailRequired' },
  { field: 'mobile', error: 'contactUsMobileRequired' },
  { field: 'message', error: 'contactUsMessageRequired' },
];

/** Badly formed emails; each shows contactUsEmailInvalid. */
export const invalidEmailCases = [
  { name: 'an email with no @', input: 'qa.contact.example.invalid' },
  { name: 'an email with no domain ending', input: 'qa.contact@example' },
  { name: 'an email with a space', input: 'qa contact@example.invalid' },
] as const;

/** Mobile numbers the form refuses, typed key by key, and the error each shows. */
export const invalidMobileCases: readonly { name: string; input: string; error: TranslationKey }[] =
  [
    {
      name: 'a mobile number not starting with 5',
      input: '123',
      error: 'contactUsMobileMustStartWith5',
    },
    { name: 'a mobile number starting 06', input: '0654', error: 'contactUsMobileMustStartWith05' },
    { name: 'a mobile number that is too short', input: '05542', error: 'contactUsMobileLength' },
  ];

/** Values for the field-filtering checks. */
export const contactUsInputs = {
  /** Typed into Name: the digits and symbols are removed, the letters kept. */
  nameWithDigitsAndSymbols: 'QA-Auto 42 Tester!',
  nameAfterFiltering: 'QAAuto  Tester',
  /** Letters typed into Mobile Number are ignored. */
  lettersInMobile: 'abcdefghij',
  /** The mobile field accepts at most 10 characters. */
  tooLongMobile: '055000000012',
  mobileMaxLength: 10,
} as const;

/** URL patterns, matched against the full page URL. */
export const contactUsWebUrls = {
  form: /\/(en|ar)\/contact-us\/$/,
  submitPath: '/api/v1/contact-form/submit',
} as const;

/** Back-office View page labels the reflection test reads (the Backend has no localization). */
export const contactUsViewLabels = {
  id: 'ID',
  email: 'Email',
  message: 'Message',
} as const satisfies Record<string, (typeof contactUsText.viewLabels)[number]>;

/**
 * How far the back office's Created At may differ from the time of sending, in minutes (the
 * grid shows minutes; the back office clock and the test machine may differ slightly).
 */
export const createdAtToleranceMinutes = 3;
