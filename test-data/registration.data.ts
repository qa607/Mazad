import type { Language } from '@typings';

/**
 * Mazad website registration test data. No value here is ever submitted: step 2 fields are only
 * typed to observe local validation/button state, never saved (see tests/website/registration.spec.ts).
 * Localized UI text lives in src/locales, read through the `t` fixture.
 */
export const registrationData = {
  /** Synthetic name, never a real person's. */
  name: 'Test Automation User',
  /** Well-formed-looking Saudi national ID/Iqama shape; not a real one. */
  idIqama: '1234567890',
  /** Well-formed Saudi mobile number shape; reused from website-login.data for consistency. */
  mobilePhone: '0509999999',
  /** Shorter than the website's own 6-character minimum used elsewhere in this suite. */
  tooShortPassword: 'abc',
  /** A password long enough to clear the known 6-character minimum, never submitted. */
  wellFormedPassword: 'Not-A-Real-Password-1',
  /** Synthetic commercial registry and tax id shapes, matching the placeholders' format only. */
  commercialRegistryNumber: '7001234567',
  taxId: '110022003300456',
} as const;

/**
 * City/Region dropdown options (Individual step 2 only), confirmed on staging 2026-11-10: the
 * same list, in the same order, in both languages (33 cities; "Riyadh" is the 6th). Only the one
 * option this suite selects is recorded — the rest are not needed and not listed.
 */
export const registrationCityOption: Record<Language, string> = {
  en: 'Riyadh',
  ar: 'الرياض',
};
