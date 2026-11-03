import type { Locator } from '@playwright/test';

/**
 * Enters a secret into an input without it appearing in reports. Playwright titles fill()
 * steps `Fill "<value>"` in the HTML and Allure reports, while evaluate() steps are titled
 * "Evaluate" with no arguments. Traces still record evaluate() arguments, so specs that use
 * this must turn tracing off.
 */
export async function fillSecret(input: Locator, value: string): Promise<void> {
  await input.waitFor({ state: 'visible' });
  await input.evaluate((element, secret) => {
    const field = element as HTMLInputElement;
    field.focus();
    field.value = secret;
    // Let client-side validation see the change, as it would for typing.
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
