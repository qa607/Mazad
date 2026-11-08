import type { Locator, Page } from '@playwright/test';

/**
 * Backend form widgets. The Backend renders dropdowns with Select2 (the real <select> is
 * hidden) and Yes/No checkboxes with Bootstrap Switch, so they are driven through their UI.
 */

/** Picks an option of the Select2 dropdown inside `field` by its exact text. */
export async function selectOption(page: Page, field: Locator, text: string): Promise<void> {
  await field.locator('.select2-selection').click();
  await page
    .locator('.select2-container--open .select2-results__option')
    .getByText(text, { exact: true })
    .click();
}

/** The text a Select2 dropdown inside `field` currently shows. */
export function selectedOption(field: Locator): Locator {
  return field.locator('.select2-selection__rendered');
}

/**
 * Matches the text a Select2 dropdown shows for an option. Dropdowns that can be cleared put a
 * "×" clear button in front of the selected option.
 */
export function shownOption(text: string): RegExp {
  return new RegExp(`^(×\\s*)?${text}$`);
}

/** Sets the Bootstrap Switch backed by the checkbox with this id, clicking it only when needed. */
export async function setSwitch(page: Page, checkboxId: string, on: boolean): Promise<void> {
  const checkbox = page.locator(`#${checkboxId}`);
  if ((await checkbox.isChecked()) !== on) {
    await page.locator(`.bootstrap-switch-id-${checkboxId}`).click();
  }
}
