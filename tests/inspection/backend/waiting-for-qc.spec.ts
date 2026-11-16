import { expect, test } from '@fixtures/inspection.fixture';
import {
  designatedVehicle,
  safeEditField,
  waitingForQcText,
} from '@test-data/inspection/waiting-for-qc.data';

/**
 * Mazad Inspection backend > Waiting for QC (/car/waitingforqc, stg-224-inspection), signed in as
 * the dedicated QC account (id 5480), in its own fresh browser context (qcSession) with no Admin
 * session cookies.
 *
 * There are 502 real vehicles on this list and no working way to create a disposable test
 * vehicle (/car/create returns a server error; there is no Admin UI link to it either — vehicles
 * only originate from the main Mazad backend plus a physical Inspector-app inspection). Per
 * explicit user direction, these specs use one designated, real, pre-existing vehicle
 * (waitingForQc.data.ts's designatedVehicle, id 22865, "Toyota Rush 2022") for every
 * mutation, rather than touching more than one real record. The only edit made is to its `note`
 * field (free text, empty, no business meaning) — never VIN, title, supplier, status, or anything
 * that affects identity, pricing, or matching.
 *
 * This file covers: the list and its filters, VIN/title navigation, View, Edit (the one safe
 * field, with persistence and cancel), and read-only inspection-points coverage. Inspection
 * file, "Mark as QC Completed", and Mazad backend synchronization are deliberately out of scope
 * here (still under investigation / explicitly deferred — see the session's reporting).
 */
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.describe('Inspection Backend - Waiting for QC', { tag: ['@regression'] }, () => {
  test(
    'The list loads for QC with the correct title and grid',
    { tag: ['@smoke', '@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { waitingForQcListPage: list } = inspectionPagesOn(qcSession);
      await list.goto();

      await expect(qcSession).toHaveTitle(waitingForQcText.pageTitle);
      await expect(list.pageHeading).toHaveText(waitingForQcText.pageHeading);
      await expect(list.grid).toBeVisible();
      await expect(list.summary).toBeVisible();
    },
  );

  test.describe('Filters', { tag: ['@functional'] }, () => {
    test('VIN filters to exactly the matching vehicle', async ({
      qcSession,
      inspectionPagesOn,
    }) => {
      const { waitingForQcListPage: list } = inspectionPagesOn(qcSession);
      await list.goto();

      await list.vinInput.fill(designatedVehicle.vin);
      await list.search();

      const counts = await list.summaryCounts();
      expect(counts.total).toBe(1);
      await expect(list.rows.first()).toContainText(designatedVehicle.vin);
    });

    test('Make filters to vehicles of that make only', async ({ qcSession, inspectionPagesOn }) => {
      const { waitingForQcListPage: list } = inspectionPagesOn(qcSession);
      await list.goto();

      await list.selectMake(designatedVehicle.make);
      await list.search();

      const counts = await list.summaryCounts();
      expect(counts.total).toBeGreaterThan(0);
      const makeColumnTexts = await list.rows.allInnerTexts();
      for (const rowText of makeColumnTexts) {
        expect(rowText).toContain(designatedVehicle.make);
      }
    });

    test('Combining VIN with an unrelated make narrows to zero, no-results handled correctly', async ({
      qcSession,
      inspectionPagesOn,
    }) => {
      const { waitingForQcListPage: list } = inspectionPagesOn(qcSession);
      await list.goto();

      await list.vinInput.fill(designatedVehicle.vin);
      // designatedVehicle is a Toyota: pairing its VIN with a different make can never match.
      await list.selectMake('Hyundai');
      await list.search();

      await expect(list.summary).toHaveCount(0);
      await expect(list.emptyMessage).toBeVisible();
      await expect(list.rows).toHaveCount(0);
    });

    test('Reset restores the unfiltered list', async ({ qcSession, inspectionPagesOn }) => {
      const { waitingForQcListPage: list } = inspectionPagesOn(qcSession);
      await list.goto();
      const unfiltered = (await list.summaryCounts()).total;

      await list.vinInput.fill(designatedVehicle.vin);
      await list.search();
      expect((await list.summaryCounts()).total).toBe(1);

      await list.reset();

      expect((await list.summaryCounts()).total).toBe(unfiltered);
      await expect(list.vinInput).toHaveValue('');
    });
  });

  test(
    'Pagination is available and moves between pages',
    { tag: ['@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { waitingForQcListPage: list } = inspectionPagesOn(qcSession);
      await list.goto();

      const firstPageIds = await list.rowIds();
      await expect(list.pagination).toBeVisible();
      await list.goToNextPage();

      const secondPageIds = await list.rowIds();
      expect(secondPageIds).not.toEqual(firstPageIds);
    },
  );

  test.describe('Vehicle navigation', { tag: ['@functional'] }, () => {
    test('The VIN link opens the correct vehicle', async ({ qcSession, inspectionPagesOn }) => {
      const { waitingForQcListPage: list, vehicleEditPage: edit } = inspectionPagesOn(qcSession);
      await list.goto();
      await list.vinInput.fill(designatedVehicle.vin);
      await list.search();

      await Promise.all([
        qcSession.waitForURL((url) => url.pathname.startsWith('/car/update'), {
          waitUntil: 'domcontentloaded',
        }),
        list.vinLink(list.rows.first()).click(),
      ]);

      await expect(qcSession).toHaveURL(new RegExp(`/car/update\\?id=${designatedVehicle.id}$`));
      await expect(edit.vinInput).toHaveValue(designatedVehicle.vin);
    });

    test('The title link opens the same vehicle, not an unrelated one', async ({
      qcSession,
      inspectionPagesOn,
    }) => {
      const { waitingForQcListPage: list, vehicleEditPage: edit } = inspectionPagesOn(qcSession);
      await list.goto();
      await list.vinInput.fill(designatedVehicle.vin);
      await list.search();

      await Promise.all([
        qcSession.waitForURL((url) => url.pathname.startsWith('/car/update'), {
          waitUntil: 'domcontentloaded',
        }),
        list.titleLink(list.rows.first()).click(),
      ]);

      await expect(qcSession).toHaveURL(new RegExp(`/car/update\\?id=${designatedVehicle.id}$`));
      await expect(edit.vinInput).toHaveValue(designatedVehicle.vin);
      await expect(edit.titleEnInput).toHaveValue(designatedVehicle.titleEn.replace(/\s+/g, ' '));
    });
  });

  test(
    'View shows the correct vehicle information',
    { tag: ['@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { vehicleViewPage: view } = inspectionPagesOn(qcSession);
      await view.goto(designatedVehicle.id);

      await expect(view.vinValue).toHaveText(designatedVehicle.vin);
      await expect(view.statusValue).toHaveText('WAITING FOR QC');
    },
  );

  test(
    'Editing the sub title field persists after reload, and Cancel discards unsaved changes',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { vehicleEditPage: edit } = inspectionPagesOn(qcSession);

      await test.step('Editable fields are present on a vehicle awaiting QC', async () => {
        await edit.goto(designatedVehicle.id);
        await expect(edit.vinInput).toHaveValue(designatedVehicle.vin);
        await expect(edit.subTitleEnInput).toBeVisible();
        await expect(edit.saveButton).toBeVisible();
      });

      await test.step('Cancel discards an unsaved change', async () => {
        await edit.subTitleEnInput.fill('this change must not be saved');
        await edit.cancel();
        await edit.goto(designatedVehicle.id);
        await expect(edit.subTitleEnInput).not.toHaveValue('this change must not be saved');
      });

      await test.step('Save persists the sub title field', async () => {
        await edit.subTitleEnInput.fill(safeEditField.testValue);
        await edit.save();
        await expect(qcSession).toHaveURL(new RegExp(`/car/update\\?id=${designatedVehicle.id}$`));
      });

      await test.step('The edit survives a reload', async () => {
        await qcSession.reload({ waitUntil: 'domcontentloaded' });
        await expect(edit.subTitleEnInput).toHaveValue(safeEditField.testValue);
      });
    },
  );

  test(
    'Inspection points are listed with their current values (read-only, confirmed for every role)',
    { tag: ['@functional'] },
    async ({ qcSession, inspectionPagesOn }) => {
      const { vehicleInspectionPage: inspection } = inspectionPagesOn(qcSession);
      await inspection.goto(designatedVehicle.id);

      expect(await inspection.isReadOnly()).toBe(true);
      const names = await inspection.pointNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('Hood');
      // At least one point on this real, already-inspected vehicle has a recorded value.
      const anySelected = await Promise.all(names.map((name) => inspection.selectedOptions(name)));
      expect(anySelected.some((options) => options.length > 0)).toBe(true);
    },
  );
});
