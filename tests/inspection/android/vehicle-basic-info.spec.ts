import { expect, test } from '@fixtures/inspection-android.fixture';
import {
  uniqueSyntheticVin,
  buildVehicleBasicInfoData,
} from '@test-data/inspection-android/vehicle-creation.data';

/**
 * Inspection Android > Vehicle creation > Basic Info tab (B2B type; confirmed live as the first
 * of three inspection types offered). Read-only / non-submitting throughout: no test in this file
 * taps "Save & Continue", so no vehicle is ever created here.
 *
 * Known discovery gaps, called out rather than guessed at: the exact empty-VIN validation
 * message; and whether Cylinders/Engine Size are conditional on a specific Engine Type value or
 * on all non-"Electric" values - "Electric" itself has not been confirmed to exist as an option
 * on this app (only confirmed on the Mazad V3 Backend's own equivalent field - see
 * VehicleBasicInfoScreen's doc comment).
 */
async function startB2bBasicInfo({
  homeScreen,
  newVehicleScreen,
}: {
  homeScreen: import('@mobile/inspection-android/screens/inspector-home.screen').InspectorHomeScreen;
  newVehicleScreen: import('@mobile/inspection-android/screens/new-vehicle.screen').NewVehicleScreen;
}): Promise<string> {
  await homeScreen.waitUntilReady();
  await homeScreen.startNewVehicle();
  const vin = uniqueSyntheticVin();
  await newVehicleScreen.enterVin(vin);
  await newVehicleScreen.continueFromVin();
  await newVehicleScreen.selectType('B2B');
  await newVehicleScreen.continueFromTypeSelection();
  return vin;
}

test.describe(
  'Inspection Android - Vehicle creation - Basic Info (B2B)',
  { tag: ['@regression'] },
  () => {
    test(
      'Save & Continue starts disabled on a freshly opened Basic Info form',
      { tag: ['@smoke', '@negative'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await startB2bBasicInfo({ homeScreen, newVehicleScreen });

        expect(await basicInfoScreen.isSaveEnabled()).toBe(false);
      },
    );

    test(
      'A required field starts unsatisfied and becomes satisfied once filled',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await startB2bBasicInfo({ homeScreen, newVehicleScreen });

        expect(await basicInfoScreen.isFieldSatisfied('Vehicle Description')).toBe(false);

        await basicInfoScreen.writeField(
          'Vehicle Description',
          'QA-AUTO basic-info-spec description (automation, safe to ignore)',
        );

        expect(await basicInfoScreen.isFieldSatisfied('Vehicle Description')).toBe(true);
      },
    );

    test(
      'Usage offers exactly the four known options',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await startB2bBasicInfo({ homeScreen, newVehicleScreen });

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
      'A filled value survives scrolling away to a later section and back',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await startB2bBasicInfo({ homeScreen, newVehicleScreen });

        const description = 'QA-AUTO scroll-persistence check (automation, safe to ignore)';
        await basicInfoScreen.writeField('Vehicle Description', description);

        // Scroll several sections away, then back.
        await basicInfoScreen.scrollToText('Roof');
        const value = await basicInfoScreen.fieldValue('Vehicle Description');

        expect(value).toBe(description);
      },
    );

    test(
      'Cylinders and Engine Size appear only after an Engine Type is chosen',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await startB2bBasicInfo({ homeScreen, newVehicleScreen });

        await basicInfoScreen.scrollToText('Engine Type');
        expect(await basicInfoScreen.byText('Cylinders').isExisting()).toBe(false);

        await basicInfoScreen.selectOption('Engine Type');

        await basicInfoScreen.scrollToText('Cylinders');
        expect(await basicInfoScreen.byText('Cylinders').isDisplayed()).toBe(true);
        // Scrolled to separately: Engine Size sits below Cylinders, so it can already be
        // scrolled out of view by the time the check above runs.
        await basicInfoScreen.scrollToText('Engine Size');
        expect(await basicInfoScreen.byText('Engine Size').isDisplayed()).toBe(true);
      },
    );

    test(
      'Filling every known required field enables Save & Continue',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await startB2bBasicInfo({ homeScreen, newVehicleScreen });
        const data = buildVehicleBasicInfoData('B2B');

        await basicInfoScreen.writeField('Vehicle Description', data.description);
        await basicInfoScreen.selectOption('Usage', data.usage);
        await basicInfoScreen.selectOption('City', data.city);
        await basicInfoScreen.writeField('Location', data.location);
        await basicInfoScreen.selectOption('Supplier');
        // CORRECTION 2026-11-14: Company IS required - see VehicleBasicInfoScreen's doc comment.
        // An earlier note here claimed it auto-populates and can be skipped; screenshot evidence
        // showed its badge staying grey/unsatisfied with every other field filled, so that was
        // wrong and has been removed.
        await basicInfoScreen.selectOption('Company');
        // Warehouse only appears once Company is set (same dependent-field pattern as Model/Year
        // below), confirmed live 2026-11-14.
        await basicInfoScreen.selectOption('Warehouse');
        await basicInfoScreen.selectOption('Make');
        // Not Make -> Year directly: confirmed live the field right after Make is actually Model
        // (it shows a generic "Year" placeholder label only until Make is set, then relabels
        // itself "Model" and offers Make-specific options) - see VehicleBasicInfoScreen's doc
        // comment. The real Year field only appears, and can only be selected, once Model is set.
        await basicInfoScreen.selectOption('Model');
        await basicInfoScreen.selectOption('Year');
        await basicInfoScreen.writeField('Grade', data.grade);
        await basicInfoScreen.selectOption('Body Color');
        await basicInfoScreen.selectOption('Interior Color');
        await basicInfoScreen.writeField('Mileage', data.mileage);
        // Not writeField(): Plate Number reformats its own display (digits moved before letters,
        // each letter space-separated), so an exact-order match can never succeed here - see the
        // dedicated "Plate Number character validation" describe block below for the verified
        // behaviour. Typed once; this test only needs the field filled, not re-verified.
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

        // Confirmed live 2026-11-14 (including a real Save & Continue through to the Essentials &
        // Body tab) that this exact field list and order enables Save & Continue - a hard
        // assertion now, not just a recorded result.
        expect(await basicInfoScreen.isSaveEnabled()).toBe(true);
      },
    );
  },
);

/**
 * Plate Number's character set. Confirmed via external research (Saudi vehicle plates use a
 * restricted 17-letter Latin alphabet - letters with no direct Arabic-letter equivalent, "Q"
 * included, are excluded) and confirmed live here: typing a plate starting with "Q" has the "Q"
 * silently dropped. This is expected application/business-rule behaviour, not a defect - kept as
 * its own describe block, separate from the Basic Info suite above, so a valid-plate scenario and
 * an invalid-plate scenario are never confused with each other.
 */
test.describe(
  'Inspection Android - Plate Number character validation',
  { tag: ['@regression'] },
  () => {
    test(
      'Accepts a plate using only valid Saudi-plate letters',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await startB2bBasicInfo({ homeScreen, newVehicleScreen });

        // Not writeField(): confirmed live the field reformats its own display entirely - digits
        // moved before letters, each letter space-separated (e.g. "ABJ 1234" renders as
        // "1234   A B J") - the app's own plate display convention, not a typing defect, but it
        // means an exact-order match (what writeField() verifies) can never succeed here. Typed
        // once and compared by character content only, the same way the negative test below does.
        const shown = await basicInfoScreen.typeFieldOnceAndReadBack('Plate Number', 'ABJ 1234');
        const charsOf = (s: string) => s.replace(/\s/g, '').split('').sort().join('');
        expect(charsOf(shown)).toBe(charsOf('ABJ1234'));

        // Re-confirm against the field's own displayed value too (not just the raw type readback).
        const displayed = await basicInfoScreen.fieldValue('Plate Number');
        expect(charsOf(displayed ?? '')).toBe(charsOf('ABJ1234'));
      },
    );

    test(
      'Rejects (silently drops) an excluded letter such as Q, keeping the rest of the input',
      { tag: ['@negative'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen }) => {
        await startB2bBasicInfo({ homeScreen, newVehicleScreen });

        const shown = await basicInfoScreen.typeFieldOnceAndReadBack('Plate Number', 'QAA 1234');

        expect(shown).not.toContain('Q');
        // Not asserting the exact remainder (e.g. "AA 1234" vs "AA1234"): only confirmed live that
        // "Q" itself is dropped, not precisely how the rest of the input is then laid out.
        expect(shown.replace(/\s/g, '')).toContain('AA1234'.replace(/\s/g, ''));

        // Re-confirm directly against the field's own displayed value too (not just the raw type
        // readback), so the finding holds for what Save & Continue would actually see.
        const displayed = await basicInfoScreen.fieldValue('Plate Number');
        expect(displayed).not.toContain('Q');
      },
    );
  },
);
