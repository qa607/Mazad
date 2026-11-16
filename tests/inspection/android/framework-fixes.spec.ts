import { expect, test } from '@fixtures/inspection-android.fixture';

/**
 * Regression guards for two automation-framework bugs found while re-running the existing suite
 * (2026-11-13), not app defects:
 *
 * 1. VehicleBasicInfoScreen's option discovery assumed every Select field had a "Search" box to
 *    anchor on. Confirmed live that only some do (e.g. City) - others (Usage, Supplier, the
 *    Cylinders numeric wheel) are a plain list with no search box, and option discovery silently
 *    returned zero options for those, failing any test that picked a specific value.
 * 2. The fixture holds one Appium session for the whole worker. Without a reset between tests, a
 *    test that ends mid-form left the next test starting from an unknown screen, confirmed live
 *    to cascade into unrelated failures.
 */
test.describe(
  'Inspection Android - automation framework regressions',
  { tag: ['@regression'] },
  () => {
    test(
      'Option discovery works for a non-searchable Select field (no "Search" box present)',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await homeScreen.waitUntilReady();
        await homeScreen.startNewVehicle();
        await newVehicleScreen.enterVin('ZQAFRAMEWORKFIX01');
        await newVehicleScreen.continueFromVin();
        await newVehicleScreen.selectType('B2B');
        await newVehicleScreen.continueFromTypeSelection();

        const options = await basicInfoScreen.openSelector('Usage');

        expect(options).toEqual([
          'Private',
          'Private Transport',
          'Public Transport',
          'Public Work',
        ]);
      },
    );

    test(
      'Option discovery works for a numeric-wheel Select field (Cylinders)',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await homeScreen.waitUntilReady();
        await homeScreen.startNewVehicle();
        await newVehicleScreen.enterVin('ZQAFRAMEWORKFIX02');
        await newVehicleScreen.continueFromVin();
        await newVehicleScreen.selectType('B2B');
        await newVehicleScreen.continueFromTypeSelection();
        await basicInfoScreen.selectOption('Engine Type');

        const options = await basicInfoScreen.openSelector('Cylinders');

        expect(options.length).toBeGreaterThan(1);
        expect(options).toContain('0');
      },
    );

    test(
      'A test that ends mid-form does not affect the next test (this test deliberately leaves the app on the VIN entry screen)',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen }) => {
        await homeScreen.waitUntilReady();
        await homeScreen.startNewVehicle();
        await newVehicleScreen.enterVin('ZQAFRAMEWORKFIX03');

        expect(await newVehicleScreen.currentVinValue()).toBe('ZQAFRAMEWORKFIX03');
        // Deliberately does not continue or navigate back to Home - the next test below proves
        // isolation by starting cleanly regardless.
      },
    );

    test(
      'Starts from a fresh Home screen even though the previous test left the app on a different screen',
      { tag: ['@functional'] },
      async ({ homeScreen }) => {
        await homeScreen.waitUntilReady();

        expect(await homeScreen.completedTab.isDisplayed()).toBe(true);
      },
    );
  },
);
