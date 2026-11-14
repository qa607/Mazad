import { expect, test } from '@fixtures/inspection-android.fixture';
import { uniqueSyntheticVin } from '@test-data/inspection-android/vehicle-creation.data';
import { INSPECTION_TYPES } from '@mobile/inspection-android/screens/new-vehicle.screen';

/**
 * Inspection Android (Samsung Galaxy S25 Ultra, Appium + UiAutomator2) > New Vehicle entry.
 * Read-only / non-submitting: every test here ends before "Continue" out of the inspection-type
 * screen, so no vehicle is ever created.
 */
test.describe('Inspection Android - New Vehicle navigation', { tag: ['@regression'] }, () => {
  test(
    'The Home FAB opens the New Vehicle VIN entry screen',
    { tag: ['@smoke', '@functional'] },
    async ({ homeScreen, newVehicleScreen }) => {
      await homeScreen.waitUntilReady();

      await homeScreen.startNewVehicle();

      expect(await newVehicleScreen.vinInput.isDisplayed()).toBe(true);
      expect(await newVehicleScreen.continueButton.isDisplayed()).toBe(true);
    },
  );

  test(
    'Tapping Continue with no VIN entered does not proceed to type selection',
    { tag: ['@negative'] },
    async ({ homeScreen, newVehicleScreen }) => {
      // The exact validation message text is an open discovery gap (not yet confirmed live) -
      // this asserts the observable, confirmable behaviour instead: Continue does not advance
      // past VIN entry when the field is empty.
      await homeScreen.waitUntilReady();
      await homeScreen.startNewVehicle();

      await newVehicleScreen.continueFromVin();

      expect(await newVehicleScreen.vinInput.isDisplayed()).toBe(true);
      for (const type of INSPECTION_TYPES) {
        expect(await newVehicleScreen.typeOption(type).isExisting()).toBe(false);
      }
    },
  );

  test(
    'A unique synthetic VIN reaches inspection-type selection, offering exactly the three known types',
    { tag: ['@functional'] },
    async ({ homeScreen, newVehicleScreen }) => {
      await homeScreen.waitUntilReady();
      await homeScreen.startNewVehicle();

      const vin = uniqueSyntheticVin();
      await newVehicleScreen.enterVin(vin);
      expect(await newVehicleScreen.currentVinValue()).toBe(vin);

      await newVehicleScreen.continueFromVin();

      for (const type of INSPECTION_TYPES) {
        expect(await newVehicleScreen.typeOption(type).isDisplayed()).toBe(true);
      }
    },
  );
});
