import { expect, test } from '@fixtures/inspection-android.fixture';
import { INSPECTION_TYPES } from '@mobile/inspection-android/screens/new-vehicle.screen';
import { createVehicleThroughPhotos } from '@mobile/inspection-android/flows/vehicle-creation.flow';
import { PHOTO_SECTIONS } from '@mobile/inspection-android/screens/vehicle-photos.screen';
import type { VehicleBasicInfoScreen } from '@mobile/inspection-android/screens/vehicle-basic-info.screen';

/**
 * Inspection Android > full vehicle lifecycle: Basic Info -> Essentials & Body -> Photos ->
 * Complete Inspection -> Sign & Complete -> Send Inspection. Confirmed live 2026-11-14 end to end
 * for B2B, including a real backend check (Mazad Inspection backend's own Waiting for QC list
 * showed the synced vehicle with every field matching what was entered here) - see
 * tests/inspection/backend for the backend-side half of that same check.
 *
 * Confirmed live: "Complete Inspection" moves a vehicle from Home's In Progress tab to Completed;
 * "Finish Inspection" (inside the Sign & Complete bottom sheet, disabled until a signature is
 * drawn) moves it on to Not Sent, which shows its own tracked "Duration"; "Send Inspection" is the
 * step that actually uploads it (confirmed live via logcat: a POST to .../v1/inspection/save),
 * after which it disappears from every Home tab entirely.
 */
test.describe('Inspection Android - Full vehicle lifecycle', { tag: ['@regression'] }, () => {
  test.setTimeout(420_000);

  for (const type of INSPECTION_TYPES) {
    test(
      `${type}: create, complete, sign and send a synthetic vehicle`,
      { tag: ['@functional'] },
      async (
        {
          homeScreen,
          newVehicleScreen,
          basicInfoScreen,
          essentialsBodyScreen,
          photosScreen,
          signingScreen,
        },
        testInfo,
      ) => {
        const photoNotes = {
          arabic: `ملاحظة QA-AUTO لصورة ${type}`,
          english: `QA-AUTO ${type} Front photo note`,
        };
        const { vin, enteredFields } = await createVehicleThroughPhotos(
          { homeScreen, newVehicleScreen, basicInfoScreen, essentialsBodyScreen, photosScreen },
          type,
          photoNotes,
          async (evidence) => {
            await testInfo.attach(`${type.toLowerCase()}-front-photo-notes-screen.png`, {
              body: Buffer.from(evidence.screenshotBase64, 'base64'),
              contentType: 'image/png',
            });
            await testInfo.attach(`${type.toLowerCase()}-front-photo-notes-screen.xml`, {
              body: Buffer.from(evidence.source),
              contentType: 'application/xml',
            });
          },
        );
        test.info().annotations.push({ type: 'vin', description: vin });
        const inputSnapshot = {
          type,
          vin,
          basicInfo: enteredFields,
          inspectionPoints: type === 'B2B' ? { Hood: 'Normal' } : {},
          photos: PHOTO_SECTIONS,
          photoNotes: { Front: photoNotes },
        };
        await testInfo.attach(`${type.toLowerCase()}-android-input-snapshot.json`, {
          body: Buffer.from(JSON.stringify(inputSnapshot, null, 2)),
          contentType: 'application/json',
        });
        // Printed (not just attached) so a backend field-comparison pass can read exactly what was
        // entered on the mobile side for this VIN straight from stdout, regardless of reporter.
        console.log(
          `[vehicle-lifecycle] ${type} ${vin} inputSnapshot=${JSON.stringify(inputSnapshot)}`,
        );

        expect(await photosScreen.isCompleteInspectionEnabled()).toBe(true);
        await photosScreen.tapElement(photosScreen.completeInspectionButton);
        await homeScreen.waitUntilReady();

        await homeScreen.openInProgressTab();
        expect(await homeScreen.isVinListed(vin), 'no longer In Progress').toBe(false);

        await homeScreen.openSignAndComplete(vin);
        expect(await signingScreen.isFinishEnabled()).toBe(false);
        await signingScreen.drawSignature();
        expect(await signingScreen.isFinishEnabled()).toBe(true);
        await signingScreen.finish();

        await homeScreen.openCompletedTab();
        expect(await homeScreen.isVinListed(vin), 'no longer Completed').toBe(false);

        await homeScreen.openNotSentTab();
        expect(await homeScreen.isVinListed(vin), 'now Not Sent').toBe(true);

        await homeScreen.sendInspection(vin);
        await homeScreen.waitUntilVinNotListed(vin);
      },
    );
  }

  test(
    'Resume an existing synthetic B2B draft, capture its Android inputs, and send it',
    { tag: ['@mutates', '@crud'] },
    async ({ homeScreen, basicInfoScreen, photosScreen, signingScreen }, testInfo) => {
      const vin = process.env.INSPECTION_ANDROID_RESUME_VIN?.trim();
      testInfo.skip(!vin, 'Set INSPECTION_ANDROID_RESUME_VIN to resume a known synthetic draft.');
      if (!vin) return;

      await homeScreen.waitUntilReady();
      await homeScreen.continueInspection(vin);
      await photosScreen.byText('Photos').waitForDisplayed({ timeout: 15_000 });

      const basicInfoFields = await readBasicInfoSnapshot(basicInfoScreen, [
        'Vehicle Description',
        'Usage',
        'City',
        'Location',
        'Supplier',
        'Company',
        'Warehouse',
        'Make',
        'Model',
        'Year',
        'Grade',
        'Body Color',
        'Interior Color',
        'Mileage',
        'Plate Number',
        'Transmission',
        'Engine Type',
        'Cylinders',
        'Engine Size',
        'Body Type',
        'Roof',
        'Number of Doors',
        'Number of Seats',
        'Number of Keys',
      ]);
      const snapshot = {
        type: 'B2B',
        vin,
        basicInfo: basicInfoFields,
        inspectionPoints: { Hood: 'Normal' },
        photos: PHOTO_SECTIONS,
        photoNotes: {
          Front: {
            arabic: 'ملاحظة QA-AUTO لصورة B2B',
            english: 'QA-AUTO B2B Front photo note',
          },
        },
        source: 'Android values read back from this existing in-progress draft before sending',
      };
      await testInfo.attach('b2b-resumed-android-input-snapshot.json', {
        body: Buffer.from(JSON.stringify(snapshot, null, 2)),
        contentType: 'application/json',
      });

      for (const section of PHOTO_SECTIONS) {
        if (!(await photosScreen.isFilled(section))) await photosScreen.capturePhoto(section);
      }
      expect(await photosScreen.isCompleteInspectionEnabled()).toBe(true);
      await photosScreen.tapElement(photosScreen.completeInspectionButton);
      await homeScreen.waitUntilReady();

      await homeScreen.openInProgressTab();
      expect(await homeScreen.isVinListed(vin), 'resumed vehicle left In Progress').toBe(false);
      await homeScreen.openSignAndComplete(vin);
      expect(await signingScreen.isFinishEnabled()).toBe(false);
      await signingScreen.drawSignature();
      expect(await signingScreen.isFinishEnabled()).toBe(true);
      await signingScreen.finish();
      await homeScreen.openCompletedTab();
      expect(await homeScreen.isVinListed(vin), 'resumed vehicle left Completed').toBe(false);
      await homeScreen.sendInspection(vin);
      await homeScreen.waitUntilVinNotListed(vin);
    },
  );
});

async function readBasicInfoSnapshot(
  screen: VehicleBasicInfoScreen,
  labels: readonly string[],
): Promise<Record<string, string>> {
  await screen.tapElement(screen.byText('Basic Info'));
  const values: Record<string, string> = {};
  for (const label of labels) {
    const value = await screen.fieldValue(label);
    if (value === undefined || value === 'Write' || value === 'Select') {
      throw new Error(`Could not read a saved Android value for "${label}".`);
    }
    values[label] = value;
  }
  await screen.tapElement(screen.byText('Photos'));
  return values;
}
