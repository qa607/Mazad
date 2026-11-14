import type { Locator } from '@playwright/test';
import { BackendListPage } from '@pages/backend/base/backend-list.page';

/**
 * Parent of the Mazad V3 Backend's own "Inspections" sidebar lists (Waiting for QC, Ongoing,
 * QC Completed, Awaiting, Completed — not the separate Inspection app). Each row's title is a
 * link to `/vehicle/vehicle/update`, alongside explicit View/Update/Delete action links
 * (confirmed live: `a[title="View"]` / `a[title="Update"]`, the same convention the auction
 * lists use).
 */
export abstract class InspectionStatusListPage extends BackendListPage {
  rowViewLink(row: Locator): Locator {
    return row.locator('a[title="View"]');
  }

  rowUpdateLink(row: Locator): Locator {
    return row.locator('a[title="Update"]');
  }
}
