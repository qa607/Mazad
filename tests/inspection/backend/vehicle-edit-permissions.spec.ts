import { expect, test } from '@fixtures/inspection.fixture';
import { designatedVehicle } from '@test-data/inspection/waiting-for-qc.data';

/**
 * Mazad Inspection backend > vehicle edit-permission by lifecycle status (stg-224-inspection).
 * Read-only investigation only: no field is ever filled or submitted here.
 *
 * Confirmed live 2026-11-11, signed in as the dedicated QC account (id 5480):
 * - Waiting for QC and QC Completed vehicles both render the full editable Basic Info form
 *   (Save button present, almost all fields enabled) — QC completion does **not** lock editing.
 * - An Ongoing-status vehicle (id 10433) renders **read-only content at the very same
 *   `/car/update?id=N` URL** — no form fields, no Save button. Mazad V3's own equivalent route
 *   for the same vehicle goes further and actually redirects server-side from its update URL to
 *   its view URL, confirming this is enforced beyond just the Inspection UI.
 * - The Inspection backend's own "Awaiting" list is currently empty — not automated here, since
 *   there is nothing to point a test at (reported, not invented).
 */
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe(
  'Inspection Backend - Vehicle edit permission by status',
  { tag: ['@regression'] },
  () => {
    test(
      'A Waiting for QC vehicle renders the full editable Basic Info form',
      { tag: ['@functional'] },
      async ({ qcSession, inspectionPagesOn }) => {
        const { waitingForQcListPage: list, vehicleEditPage: edit } = inspectionPagesOn(qcSession);
        await list.goto();
        const id = await list.rows.first().getAttribute('data-key');
        expect(id).not.toBeNull();

        await edit.goto(id as string);

        expect(await edit.isEditableForm()).toBe(true);
        await expect(edit.vinInput).toBeEditable();
      },
    );

    test(
      'The designated QC Completed vehicle (22865) still renders the full editable Basic Info form',
      { tag: ['@functional'] },
      async ({ qcSession, inspectionPagesOn }) => {
        const { vehicleEditPage: edit } = inspectionPagesOn(qcSession);

        await edit.goto(designatedVehicle.id);

        expect(await edit.isEditableForm()).toBe(true);
        await expect(edit.vinInput).toBeEditable();
        await expect(edit.vinInput).toHaveValue(designatedVehicle.vin);
      },
    );

    test(
      'An Ongoing vehicle renders read-only content at the Basic Info edit URL, not the form',
      { tag: ['@functional'] },
      async ({ qcSession, inspectionPagesOn }) => {
        const { vehicleEditPage: edit } = inspectionPagesOn(qcSession);

        // id 10433: the one real vehicle currently in Ongoing status (confirmed live).
        await edit.goto('10433');

        expect(await edit.isEditableForm()).toBe(false);
        await expect(edit.vinInput).toHaveCount(0);
      },
    );
  },
);
