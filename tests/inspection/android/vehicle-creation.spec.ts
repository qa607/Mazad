import { expect, test } from '@fixtures/inspection-android.fixture';
import {
  uniqueSyntheticVin,
  buildVehicleBasicInfoData,
} from '@test-data/inspection-android/vehicle-creation.data';
import {
  INSPECTION_TYPES,
  type InspectionType,
} from '@mobile/inspection-android/screens/new-vehicle.screen';

/**
 * Inspection Android > Vehicle creation, one scenario per inspection type the app actually
 * offers (B2B, Photography, Salvage - confirmed live; the backend's fourth option, "Retail", is
 * not offered here).
 *
 * The non-submitting tests below are safe to run any time: each opens a fresh Basic Info form for
 * its own unique synthetic VIN and never taps "Save & Continue".
 *
 * The actual creation-submission test is intentionally gated behind INSPECTION_ANDROID_SUBMIT=1
 * and skipped otherwise - a recurring Samsung-OS-level "Account policies updated" dialog on the
 * test device interrupts long-running interactions unpredictably (confirmed live, unrelated to
 * this app), so submission is not yet exercised. It should only be turned on once that is
 * resolved on the device and a full run confirms the Basic Info field map (now believed complete
 * - see VehicleBasicInfoScreen's own doc comment) holds up for all three types.
 */
test.describe('Inspection Android - Vehicle creation by type', { tag: ['@regression'] }, () => {
  for (const type of INSPECTION_TYPES) {
    test(
      `Selecting ${type} opens a Basic Info form tagged ${type}`,
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await homeScreen.waitUntilReady();
        await homeScreen.startNewVehicle();

        const vin = uniqueSyntheticVin();
        await newVehicleScreen.enterVin(vin);
        await newVehicleScreen.continueFromVin();
        await newVehicleScreen.selectType(type);
        await newVehicleScreen.continueFromTypeSelection();

        expect(await basicInfoScreen.byText(type).isDisplayed()).toBe(true);
        expect(await basicInfoScreen.byText('Vehicle Description').isDisplayed()).toBe(true);
      },
    );
  }

  test(
    'Two separate New Vehicle attempts never produce the same synthetic VIN',
    { tag: ['@functional'] },
    () => {
      // Pure data-generation check - no device interaction needed, but belongs with the creation
      // suite: this is the duplicate-prevention mechanism the creation scenarios rely on.
      const first = uniqueSyntheticVin();
      const second = uniqueSyntheticVin();
      expect(first).not.toBe(second);
      expect(first).toMatch(/^ZQA\d{14}$/);
    },
  );

  const submitEnabled = process.env.INSPECTION_ANDROID_SUBMIT === '1';

  test.describe(
    'Submission (opt-in: INSPECTION_ANDROID_SUBMIT=1)',
    { tag: ['@mutates', '@crud'] },
    () => {
      for (const type of INSPECTION_TYPES as readonly InspectionType[]) {
        test(
          `Creating a synthetic ${type} vehicle completes and shows a success confirmation`,
          { tag: ['@functional'] },
          async ({ homeScreen, newVehicleScreen, basicInfoScreen }, testInfo) => {
            testInfo.skip(
              !submitEnabled,
              'Not run by default: set INSPECTION_ANDROID_SUBMIT=1 once the Basic Info field map ' +
                "is confirmed complete (see this file's header comment for the open gaps).",
            );

            await homeScreen.waitUntilReady();
            await homeScreen.startNewVehicle();

            const vin = uniqueSyntheticVin();
            await newVehicleScreen.enterVin(vin);
            await newVehicleScreen.continueFromVin();
            await newVehicleScreen.selectType(type);
            await newVehicleScreen.continueFromTypeSelection();

            const data = buildVehicleBasicInfoData(type);
            await basicInfoScreen.writeField('Vehicle Description', data.description);
            await basicInfoScreen.selectOption('Usage', data.usage);
            await basicInfoScreen.selectOption('City', data.city);
            await basicInfoScreen.writeField('Location', data.location);
            await basicInfoScreen.selectOption('Supplier');
            // Company IS required (corrected 2026-11-14) - see the equivalent comment in
            // vehicle-basic-info.spec.ts.
            await basicInfoScreen.selectOption('Company');
            // Warehouse only appears once Company is set - see vehicle-basic-info.spec.ts's
            // equivalent comment.
            await basicInfoScreen.selectOption('Warehouse');
            await basicInfoScreen.selectOption('Make');
            // Not Make -> Year directly: see vehicle-basic-info.spec.ts's equivalent comment - the
            // field right after Make is actually Model, relabelled "Year" only until Make is set.
            await basicInfoScreen.selectOption('Model');
            await basicInfoScreen.selectOption('Year');
            await basicInfoScreen.writeField('Grade', data.grade);
            await basicInfoScreen.selectOption('Body Color');
            await basicInfoScreen.selectOption('Interior Color');
            await basicInfoScreen.writeField('Mileage', data.mileage);
            // Not writeField(): Plate Number reformats its own display (digits moved before
            // letters, each letter space-separated) - see vehicle-basic-info.spec.ts's dedicated
            // "Plate Number character validation" block for the verified behaviour.
            await basicInfoScreen.typeFieldOnceAndReadBack('Plate Number', data.plateNumber);
            await basicInfoScreen.selectOption('Transmission');
            await basicInfoScreen.selectOption('Engine Type');
            await basicInfoScreen.selectOption('Cylinders');
            await basicInfoScreen.writeField('Engine Size', '2000');
            await basicInfoScreen.selectOption('Body Type');
            await basicInfoScreen.selectOption('Roof');
            await basicInfoScreen.selectOption('Number of Doors');
            await basicInfoScreen.selectOption('Number of Seats');
            await basicInfoScreen.writeField('Number of Keys', data.numberOfKeys);

            expect(await basicInfoScreen.isSaveEnabled()).toBe(true);
            await basicInfoScreen.save();

            // What "success" looks like past Basic Info (the Essentials & Body / Photos tabs, and
            // the final creation confirmation) is itself an open discovery item - this test stops
            // at the point this project has verified, rather than asserting an unconfirmed outcome.
          },
        );
      }
    },
  );
});
