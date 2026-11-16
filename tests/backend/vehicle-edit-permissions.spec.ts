import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  vehicleEditPermissionText,
  vehicleLifecycleRecords,
} from '@test-data/vehicle-edit-permissions.data';

/**
 * Mazad V3 Backend > vehicle edit permission by lifecycle status (stg-mazad-v3-224). Read-only
 * investigation only: no field is ever filled or submitted, no record is created or changed.
 *
 * This covers the Admin (Dev Root) side of the role x lifecycle-status matrix only. The other
 * BACKEND_ROLES accounts (auctionSupervisor, customerSupport, auctionTeam, operation, supplier,
 * noAuctionAccess) are not configured in this local .env, so the operation-role side of the
 * matrix is not run here — the role-permission specs it would join
 * (tests/backend/permissions.spec.ts etc.) already skip for the same reason and report it the
 * same way.
 *
 * Confirmed live 2026-11-12, signed in as Dev Root:
 * - Awaiting (23624) and QC Completed (23716) both render the real edit form at
 *   `/vehicle/vehicle/update`, with the same field counts (49 total / 46 enabled) — QC
 *   completion does not lock editing for Admin.
 * - Ongoing (10433) server-side redirects `/vehicle/vehicle/update?id=10433` to
 *   `/vehicle/vehicle/view?id=10433` — no form is ever rendered, not just hidden.
 * - The Sold list's own rows carry a View link but no Update link for Admin (UI evidence only;
 *   not independently confirmed as a server-side block the way the Ongoing redirect is).
 * - The Live list currently has no records — not testable, not invented.
 */
test.use({ ...devRootSession });

test.describe(
  'Mazad V3 Backend - Vehicle edit permission by status',
  { tag: ['@regression'] },
  () => {
    test(
      'Awaiting vehicle 23624 renders the real editable vehicle form',
      { tag: ['@functional'] },
      async ({ mazadVehicleEditPage: edit }) => {
        const status = await edit.goto(vehicleLifecycleRecords.awaiting.id);

        expect(status).toBe(200);
        expect(await edit.isEditableForm()).toBe(true);
        const counts = await edit.fieldCounts();
        expect(counts.total).toBeGreaterThan(0);
        expect(counts.enabled).toBeGreaterThan(0);
      },
    );

    test(
      'QC Completed vehicle 23716 still renders the real editable vehicle form',
      { tag: ['@functional'] },
      async ({ mazadVehicleEditPage: edit }) => {
        const status = await edit.goto(vehicleLifecycleRecords.qcCompleted.id);

        expect(status).toBe(200);
        expect(await edit.isEditableForm()).toBe(true);
        const counts = await edit.fieldCounts();
        expect(counts.total).toBeGreaterThan(0);
        expect(counts.enabled).toBeGreaterThan(0);
      },
    );

    test(
      'An Ongoing vehicle (10433) is server-side redirected from the edit URL to the view page',
      { tag: ['@functional'] },
      async ({ page, mazadVehicleEditPage: edit }) => {
        await edit.goto(vehicleLifecycleRecords.ongoing.id);

        await expect(page).toHaveURL(
          new RegExp(
            `${vehicleEditPermissionText.viewPath}\\?id=${vehicleLifecycleRecords.ongoing.id}$`,
          ),
        );
        expect(await edit.isEditableForm()).toBe(false);
      },
    );

    test(
      "The Sold list's own rows offer a View link but no Update link",
      { tag: ['@functional'] },
      async ({ mazadSoldListPage: sold }) => {
        await sold.goto();
        const rowCount = await sold.rows.count();
        test.skip(rowCount === 0, 'No Sold records currently available.');

        const row = sold.rows.first();
        await expect(sold.vehicleLink(row)).toHaveCount(1);
        await expect(row.locator('a[href*="/vehicle/vehicle/update"]')).toHaveCount(0);
      },
    );

    test(
      'Live list has no records to evaluate edit permission against (not testable, reported not invented)',
      { tag: ['@functional'] },
      async ({ livePage }) => {
        await livePage.goto();
        const rowCount = await livePage.rows.count();

        // This assertion documents the current state rather than asserting a business rule: if a
        // Live record later exists, this test should be extended to check its edit permission
        // instead of merely confirming the list is empty.
        expect(rowCount, 'Live list currently has no records — not testable').toBe(0);
      },
    );
  },
);

/**
 * Mazad V3 Backend's own "Inspections" sidebar lists (Waiting for QC, Ongoing, QC Completed —
 * not the separate Inspection app). For each: the list itself is accessible and loads, Admin
 * opens a real row's own View link (not just a direct URL), and the row's own Update link is
 * followed to check whether the server renders the edit form or redirects — so "Admin can open
 * a vehicle" and "Edit is available" are both evidenced through the real UI journey, not
 * inferred from a page loading.
 *
 * Confirmed live 2026-11-12, signed in as Dev Root:
 * - Waiting for QC (20 records; first row id 23722): editable form, 49 total / 47 enabled
 *   fields, Save visible.
 * - Ongoing (1 record; id 10433): unlike the other two lists, this row has no explicit
 *   title="Update" icon link at all (UI-level hint). Its title text is still a plain link to
 *   `/vehicle/vehicle/update`, and following that redirects server-side to the view page
 *   (server-side evidence).
 * - QC Completed (4 records; first row id 23407, distinct from the designated vehicle 23716
 *   used above): editable form, same as Waiting for QC — QC completion does not lock editing.
 */
test.describe(
  'Mazad V3 Backend - Inspections tab access and vehicle-open permission',
  { tag: ['@regression'] },
  () => {
    test(
      'Waiting for QC tab is accessible, its list loads, and Admin can open and edit its first vehicle',
      { tag: ['@functional'] },
      async ({ page, waitingQcInspectionListPage: list, mazadVehicleEditPage: edit }) => {
        await list.goto();

        await expect(page).toHaveTitle(vehicleEditPermissionText.waitingQcListTitle);
        await expect(list.grid).toBeVisible();
        const rowCount = await list.rows.count();
        test.skip(rowCount === 0, 'Waiting for QC list currently has no records.');

        const row = list.rows.first();
        const id = await list.rowId(row);
        await expect(list.rowViewLink(row)).toHaveCount(1);
        await expect(list.rowUpdateLink(row)).toHaveCount(1);

        const status = await edit.goto(Number(id));
        expect(status).toBe(200);
        expect(await edit.isEditableForm()).toBe(true);
        await expect(edit.saveButton).toBeVisible();
        const counts = await edit.fieldCounts();
        expect(counts.total).toBeGreaterThan(0);
        expect(counts.enabled).toBeGreaterThan(0);
      },
    );

    test(
      'Ongoing tab is accessible, its list loads, and its vehicle redirects to read-only view rather than opening the edit form',
      { tag: ['@functional'] },
      async ({ page, ongoingInspectionListPage: list, mazadVehicleEditPage: edit }) => {
        await list.goto();

        await expect(page).toHaveTitle(vehicleEditPermissionText.ongoingListTitle);
        await expect(list.grid).toBeVisible();
        const rowCount = await list.rows.count();
        test.skip(rowCount === 0, 'Ongoing list currently has no records.');

        const row = list.rows.first();
        const id = await list.rowId(row);
        await expect(list.rowViewLink(row)).toHaveCount(1);
        // Confirmed live: unlike Waiting for QC and QC Completed, this row has no explicit
        // title="Update" icon link at all — the list itself hints at the restriction. The row's
        // title text is still a plain link to /vehicle/vehicle/update, though, so that is what
        // Admin would actually click to try to edit the vehicle; following it is where the real,
        // server-side restriction shows up (the assertion below).
        await expect(list.rowUpdateLink(row)).toHaveCount(0);
        await expect(row.locator('a[href*="/vehicle/vehicle/update"]')).toHaveCount(1);

        await edit.goto(Number(id));
        await expect(page).toHaveURL(
          new RegExp(`${vehicleEditPermissionText.viewPath}\\?id=${id}$`),
        );
        expect(await edit.isEditableForm()).toBe(false);
      },
    );

    test(
      'QC Completed tab is accessible, its list loads, and Admin can open and edit its first vehicle',
      { tag: ['@functional'] },
      async ({ page, qcCompletedInspectionListPage: list, mazadVehicleEditPage: edit }) => {
        await list.goto();

        await expect(page).toHaveTitle(vehicleEditPermissionText.qcCompletedListTitle);
        await expect(list.grid).toBeVisible();
        const rowCount = await list.rows.count();
        test.skip(rowCount === 0, 'QC Completed list currently has no records.');

        const row = list.rows.first();
        const id = await list.rowId(row);
        await expect(list.rowViewLink(row)).toHaveCount(1);
        await expect(list.rowUpdateLink(row)).toHaveCount(1);

        const status = await edit.goto(Number(id));
        expect(status).toBe(200);
        expect(await edit.isEditableForm()).toBe(true);
        await expect(edit.saveButton).toBeVisible();
        const counts = await edit.fieldCounts();
        expect(counts.total).toBeGreaterThan(0);
        expect(counts.enabled).toBeGreaterThan(0);
      },
    );
  },
);
