import type { Locator, Page } from '@playwright/test';

/**
 * The Backend's date fields (Krajee / bootstrap datepicker). A typed date is cleared when the
 * field loses focus, so a day is picked from the calendar, as a user does.
 */
export class DatePicker {
  constructor(private readonly page: Page) {}

  /** Opens the field's calendar, moves `monthsAhead` months forward and picks the day. */
  async pick(field: Locator, monthsAhead: number, day: number): Promise<void> {
    await field.click();
    const calendar = this.page.locator('.datepicker-dropdown:visible .datepicker-days');
    for (let month = 0; month < monthsAhead; month++) await calendar.locator('th.next').click();
    await calendar
      .locator('td.day:not(.old):not(.new)', { hasText: new RegExp(`^${day}$`) })
      .click();
  }
}
