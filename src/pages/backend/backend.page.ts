import type { Page } from '@playwright/test';

/**
 * Parent of Mazad Backend page objects. The Backend has no localization, so unlike
 * BasePage there is no language or translator. Locators and actions live in subclasses.
 */
export abstract class BackendPage {
  constructor(protected readonly page: Page) {}
}
