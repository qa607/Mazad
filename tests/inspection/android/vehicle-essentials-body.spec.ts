import { expect, test } from '@fixtures/inspection-android.fixture';
import {
  ESSENTIALS_BODY_COMPONENTS,
  ESSENTIALS_BODY_CONDITIONS,
} from '@mobile/inspection-android/screens/vehicle-essentials-body.screen';
import {
  buildVehicleBasicInfoData,
  uniqueSyntheticVin,
} from '@test-data/inspection-android/vehicle-creation.data';
import type { InspectorHomeScreen } from '@mobile/inspection-android/screens/inspector-home.screen';
import type { NewVehicleScreen } from '@mobile/inspection-android/screens/new-vehicle.screen';
import type { VehicleBasicInfoScreen } from '@mobile/inspection-android/screens/vehicle-basic-info.screen';

/**
 * Inspection Android > Vehicle creation > Essentials & Body tab (B2B type). Every test starts a
 * fresh synthetic vehicle and drives it through a real Basic Info Save & Continue first (this tab
 * is locked until that succeeds - see vehicle-basic-info.spec.ts for Basic Info's own coverage),
 * so each test here genuinely exercises the second of the three vehicle-creation tabs rather than
 * a stub.
 *
 * See VehicleEssentialsBodyScreen's doc comment for the confirmed structure: 18 components, each
 * with its own condition chips and one or two capture slots (photo always, video for
 * VIDEO_CAPABLE_COMPONENTS); a chip's own `selected` accessibility attribute does not update on
 * tap (confirmed live, same Compose-a11y gap as elsewhere in this app), so selection is verified
 * behaviourally (Save & Continue's own enabled state) rather than by reading the chip back.
 */
async function startB2bEssentialsBody({
  homeScreen,
  newVehicleScreen,
  basicInfoScreen,
}: {
  homeScreen: InspectorHomeScreen;
  newVehicleScreen: NewVehicleScreen;
  basicInfoScreen: VehicleBasicInfoScreen;
}): Promise<string> {
  await homeScreen.waitUntilReady();
  await homeScreen.startNewVehicle();
  const vin = uniqueSyntheticVin();
  await newVehicleScreen.enterVin(vin);
  await newVehicleScreen.continueFromVin();
  await newVehicleScreen.selectType('B2B');
  await newVehicleScreen.continueFromTypeSelection();

  const data = buildVehicleBasicInfoData('B2B');
  await basicInfoScreen.writeField('Vehicle Description', data.description);
  await basicInfoScreen.selectOption('Usage', data.usage);
  await basicInfoScreen.selectOption('City', data.city);
  await basicInfoScreen.writeField('Location', data.location);
  await basicInfoScreen.selectOption('Supplier');
  await basicInfoScreen.selectOption('Company');
  await basicInfoScreen.selectOption('Warehouse');
  await basicInfoScreen.selectOption('Make');
  await basicInfoScreen.selectOption('Model');
  await basicInfoScreen.selectOption('Year');
  await basicInfoScreen.writeField('Grade', data.grade);
  await basicInfoScreen.selectOption('Body Color');
  await basicInfoScreen.selectOption('Interior Color');
  await basicInfoScreen.writeField('Mileage', data.mileage);
  await basicInfoScreen.typeFieldOnceAndReadBack('Plate Number', data.plateNumber);
  await basicInfoScreen.selectOption('Transmission');
  await basicInfoScreen.selectOption('Engine Type');
  await basicInfoScreen.scrollToText('Cylinders');
  if (
    await basicInfoScreen
      .byText('Cylinders')
      .isDisplayed()
      .catch(() => false)
  ) {
    await basicInfoScreen.selectOption('Cylinders');
    await basicInfoScreen.writeField('Engine Size', '2000');
  }
  await basicInfoScreen.selectOption('Body Type');
  await basicInfoScreen.selectOption('Roof');
  await basicInfoScreen.selectOption('Number of Doors');
  await basicInfoScreen.selectOption('Number of Seats');
  await basicInfoScreen.writeField('Number of Keys', data.numberOfKeys);
  await basicInfoScreen.save();
  return vin;
}

test.describe(
  'Inspection Android - Vehicle creation - Essentials & Body (B2B)',
  { tag: ['@regression'] },
  () => {
    // Longer than the project default (120s): every test here drives a full Basic Info fill
    // before it can even reach this tab, confirmed live to take close to 2 minutes on its own.
    test.setTimeout(300_000);

    test(
      'Save & Continue starts disabled on a freshly opened Essentials & Body tab',
      { tag: ['@smoke', '@negative'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen, essentialsBodyScreen }) => {
        await startB2bEssentialsBody({ homeScreen, newVehicleScreen, basicInfoScreen });

        expect(await essentialsBodyScreen.isSaveEnabled()).toBe(false);
      },
    );

    test(
      'Every one of the 18 known components offers exactly its confirmed condition options',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen, essentialsBodyScreen }) => {
        await startB2bEssentialsBody({ homeScreen, newVehicleScreen, basicInfoScreen });

        for (const component of ESSENTIALS_BODY_COMPONENTS) {
          const options = await essentialsBodyScreen.conditionOptions(component);
          expect(options, `"${component}"'s condition options`).toEqual(
            ESSENTIALS_BODY_CONDITIONS[component],
          );
        }
      },
    );

    test(
      'Selecting a single condition on one component (not the first) enables Save & Continue',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen, essentialsBodyScreen }) => {
        await startB2bEssentialsBody({ homeScreen, newVehicleScreen, basicInfoScreen });
        expect(await essentialsBodyScreen.isSaveEnabled()).toBe(false);

        // Deliberately not Hood (the first component): proves the rule is "any one component's
        // condition selected", not specific to whichever happens to render first.
        await essentialsBodyScreen.selectCondition('Exhaust', 'No Smoke');

        expect(await essentialsBodyScreen.isSaveEnabled()).toBe(true);
      },
    );

    test(
      'General Notes accepts both English and Arabic text',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen, essentialsBodyScreen }) => {
        await startB2bEssentialsBody({ homeScreen, newVehicleScreen, basicInfoScreen });

        const englishNote = 'QA-AUTO essentials-body note (automation, safe to ignore)';
        const arabicNote = 'ملاحظة تجريبية آلية - يمكن تجاهلها بأمان';

        const shownEnglish = await essentialsBodyScreen.writeGeneralNote('en', englishNote);
        expect(shownEnglish).toBe(englishNote);

        const shownArabic = await essentialsBodyScreen.writeGeneralNote('ar', arabicNote);
        expect(shownArabic).toBe(arabicNote);
      },
    );

    test(
      'Save & Continue persists the selection and unlocks Photos; Photos stays locked until then',
      { tag: ['@functional'] },
      async ({ homeScreen, newVehicleScreen, basicInfoScreen, essentialsBodyScreen, driver }) => {
        await startB2bEssentialsBody({ homeScreen, newVehicleScreen, basicInfoScreen });

        // Confirmed live: tapping the Photos tab header before this tab's own Save & Continue
        // succeeds does nothing - the tab stays locked, not just visually greyed out.
        await driver.action('pointer').move({ x: 900, y: 340 }).down().pause(80).up().perform();
        await driver.pause(1000);
        expect(await essentialsBodyScreen.saveAndContinueButton.isDisplayed()).toBe(true);

        await essentialsBodyScreen.selectCondition('Hood', 'Normal');

        // Persistence check: leave the tab entirely (Basic Info) and come back, then confirm the
        // selection was not lost - a chip's own `selected` attribute cannot be read back directly
        // (see this screen's doc comment), so Save & Continue's own enabled state, which depends
        // on at least one condition being set, is used as the behavioural proof instead.
        await driver.action('pointer').move({ x: 128, y: 340 }).down().pause(80).up().perform();
        await driver.pause(1000);
        await driver.action('pointer').move({ x: 465, y: 340 }).down().pause(80).up().perform();
        await driver.pause(1000);
        expect(await essentialsBodyScreen.isSaveEnabled()).toBe(true);

        await essentialsBodyScreen.save();
        await driver.pause(2000);

        // Landed on Photos: its own known section headings are now visible.
        expect(await essentialsBodyScreen.byText('Front').isDisplayed()).toBe(true);
        expect(await essentialsBodyScreen.byText('Complete Inspection').isDisplayed()).toBe(true);
      },
    );
  },
);
