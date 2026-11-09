import type { Locator, Page } from '@playwright/test';
import { BackendPage } from '@pages/backend/backend.page';

/** Back office vehicle details (/backend/vehicle/vehicle/view?id=<vehicleId>). Read-only. */
export class MazadVehicleViewPage extends BackendPage {
  static readonly path = '/backend/vehicle/vehicle/view';

  readonly heading: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.locator('.app-page-title .page-title-head');
  }

  async goto(vehicleId: number): Promise<void> {
    await this.page.goto(`${MazadVehicleViewPage.path}?id=${vehicleId}`);
  }
}
