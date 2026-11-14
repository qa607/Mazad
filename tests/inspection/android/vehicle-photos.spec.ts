import { expect, test } from '@fixtures/inspection-android.fixture';
import { PHOTO_SECTIONS } from '@mobile/inspection-android/screens/vehicle-photos.screen';
import {
  buildVehicleBasicInfoData,
  uniqueSyntheticVin,
} from '@test-data/inspection-android/vehicle-creation.data';
import type { InspectorHomeScreen } from '@mobile/inspection-android/screens/inspector-home.screen';
import type { NewVehicleScreen } from '@mobile/inspection-android/screens/new-vehicle.screen';
import type { VehicleBasicInfoScreen } from '@mobile/inspection-android/screens/vehicle-basic-info.screen';
import type { VehicleEssentialsBodyScreen } from '@mobile/inspection-android/screens/vehicle-essentials-body.screen';

/**
 * Inspection Android > Vehicle creation > Photos tab (B2B type). Every test starts a fresh
 * synthetic vehicle and drives it through real Basic Info and Essentials & Body Save & Continue
 * steps first (this tab is locked until both succeed), so each test here genuinely exercises the
 * third and final vehicle-creation tab.
 *
 * Uses the physical device's real camera throughout (see VehiclePhotosScreen's own doc comment for
 * the confirmed capture flow and why a camera-screen screenshot renders solid black) - no test here
 * substitutes a gallery image for a real capture. Never taps "Complete Inspection" itself: that
 * finalizes the whole synthetic inspection, beyond what capturing and verifying photos requires:
 * these tests confirm it becomes enabled once every section is filled, not what completing it does.
 */
async function startB2bPhotos({
  homeScreen,
  newVehicleScreen,
  basicInfoScreen,
  essentialsBodyScreen,
}: {
  homeScreen: InspectorHomeScreen;
  newVehicleScreen: NewVehicleScreen;
  basicInfoScreen: VehicleBasicInfoScreen;
  essentialsBodyScreen: VehicleEssentialsBodyScreen;
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

  await essentialsBodyScreen.selectCondition('Hood', 'Normal');
  await essentialsBodyScreen.save();
  return vin;
}

test.describe(
  'Inspection Android - Vehicle creation - Photos (B2B)',
  { tag: ['@regression'] },
  () => {
    test.setTimeout(300_000);

    test(
      'Complete Inspection starts disabled, and a section starts unfilled',
      { tag: ['@smoke', '@negative'] },
      async ({
        homeScreen,
        newVehicleScreen,
        basicInfoScreen,
        essentialsBodyScreen,
        photosScreen,
      }) => {
        await startB2bPhotos({
          homeScreen,
          newVehicleScreen,
          basicInfoScreen,
          essentialsBodyScreen,
        });

        expect(await photosScreen.isCompleteInspectionEnabled()).toBe(false);
        expect(await photosScreen.isFilled('Front')).toBe(false);
      },
    );

    test(
      'Capturing a real photo fills the section, and it can be removed again',
      { tag: ['@functional'] },
      async ({
        homeScreen,
        newVehicleScreen,
        basicInfoScreen,
        essentialsBodyScreen,
        photosScreen,
      }) => {
        await startB2bPhotos({
          homeScreen,
          newVehicleScreen,
          basicInfoScreen,
          essentialsBodyScreen,
        });

        await photosScreen.capturePhoto('Front');
        expect(await photosScreen.isFilled('Front')).toBe(true);

        await photosScreen.removePhoto('Front');
        expect(await photosScreen.isFilled('Front')).toBe(false);
      },
    );

    test(
      'Tapping an already-filled section retakes the photo (section stays filled throughout)',
      { tag: ['@functional'] },
      async ({
        homeScreen,
        newVehicleScreen,
        basicInfoScreen,
        essentialsBodyScreen,
        photosScreen,
      }) => {
        await startB2bPhotos({
          homeScreen,
          newVehicleScreen,
          basicInfoScreen,
          essentialsBodyScreen,
        });

        await photosScreen.capturePhoto('Left Side');
        expect(await photosScreen.isFilled('Left Side')).toBe(true);

        await photosScreen.capturePhoto('Left Side'); // Retake: same slot, already filled.
        expect(await photosScreen.isFilled('Left Side')).toBe(true);
      },
    );

    test(
      'Complete Inspection enables once all four sections are filled',
      { tag: ['@functional'] },
      async ({
        homeScreen,
        newVehicleScreen,
        basicInfoScreen,
        essentialsBodyScreen,
        photosScreen,
      }) => {
        await startB2bPhotos({
          homeScreen,
          newVehicleScreen,
          basicInfoScreen,
          essentialsBodyScreen,
        });

        for (const section of PHOTO_SECTIONS) {
          await photosScreen.capturePhoto(section);
          expect(await photosScreen.isFilled(section), `"${section}" filled`).toBe(true);
        }

        expect(await photosScreen.isCompleteInspectionEnabled()).toBe(true);
      },
    );
  },
);
