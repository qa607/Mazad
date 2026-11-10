import type { Locator } from '@playwright/test';

/** Approved fixed value for the password-visibility check. Not a credential. */
export const DUMMY_PASSWORD = 'Visual-Check-1';

/** The only field the UI layer may type into. */
const PASSWORD_FIELD_ID = 'login-password';

/**
 * Types the approved dummy value into the website login password field, and nothing else.
 * Refuses any other element. It never submits: the caller keeps the phone field empty and
 * asserts that Login stays disabled.
 */
export async function typeDummyPassword(field: Locator): Promise<void> {
  const id = await field.getAttribute('id');
  const type = await field.getAttribute('type');
  if (id !== PASSWORD_FIELD_ID || type !== 'password') {
    throw new Error(
      `typeDummyPassword only types into #${PASSWORD_FIELD_ID} (type=password); got #${id} (type=${type}).`,
    );
  }
  // eslint-disable-next-line no-restricted-syntax -- approved exception: dummy value, password field only, never submitted
  await field.fill(DUMMY_PASSWORD);
}
