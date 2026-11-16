import type { InspectorHomeScreen } from '@mobile/inspection-android/screens/inspector-home.screen';
import type {
  InspectionType,
  NewVehicleScreen,
} from '@mobile/inspection-android/screens/new-vehicle.screen';
import type { VehicleBasicInfoScreen } from '@mobile/inspection-android/screens/vehicle-basic-info.screen';
import type { VehicleEssentialsBodyScreen } from '@mobile/inspection-android/screens/vehicle-essentials-body.screen';
import type { VehiclePhotosScreen } from '@mobile/inspection-android/screens/vehicle-photos.screen';
import type {
  PhotoNotes,
  PhotoNoteScreenEvidence,
} from '@mobile/inspection-android/screens/vehicle-photos.screen';
import { PHOTO_SECTIONS } from '@mobile/inspection-android/screens/vehicle-photos.screen';
import {
  buildVehicleBasicInfoData,
  uniqueSyntheticVin,
} from '@test-data/inspection-android/vehicle-creation.data';

/**
 * Fills B2B's own Basic Info field set (confirmed live 2026-11-13/14) - see
 * vehicle-basic-info.spec.ts and vehicle-essentials-body.screen.ts's own doc comments for why this
 * exact field order (Make -> Model -> Year, Company -> Warehouse) is required.
 *
 * Confirmed live 2026-11-14 that Salvage shares this exact same field set (Vehicle
 * Description/Usage/City/Location/Supplier/Company/Warehouse/Make/Model/Year/Grade/colors/Mileage/
 * Plate Number/Transmission/Engine/Body Type/Roof/Doors/Seats/Keys) - NOT Photography's shorter
 * set. Salvage additionally has an optional "Serial Number" field between Plate Number and
 * Transmission, left blank here since it is optional and does not gate Save & Continue. This
 * function is reused for both types; only Photography gets its own, materially different fill
 * function below.
 */
async function fillB2bBasicInfo(
  basicInfoScreen: VehicleBasicInfoScreen,
  data: ReturnType<typeof buildVehicleBasicInfoData>,
): Promise<Record<string, string>> {
  const entered: Record<string, string> = {
    'Vehicle Description': data.description,
    Usage: data.usage,
    City: data.city,
    Location: data.location,
    Grade: data.grade,
    Mileage: data.mileage,
    'Plate Number': data.plateNumber,
    'Number of Keys': data.numberOfKeys,
  };
  await basicInfoScreen.writeField('Vehicle Description', data.description);
  await basicInfoScreen.selectOption('Usage', data.usage);
  await basicInfoScreen.selectOption('City', data.city);
  await basicInfoScreen.writeField('Location', data.location);
  entered.Supplier = await basicInfoScreen.selectOption('Supplier');
  entered.Company = await basicInfoScreen.selectOption('Company');
  entered.Warehouse = await basicInfoScreen.selectOption('Warehouse');
  entered.Make = await basicInfoScreen.selectOption('Make');
  entered.Model = await basicInfoScreen.selectOption('Model');
  entered.Year = await basicInfoScreen.selectOption('Year');
  await basicInfoScreen.writeField('Grade', data.grade);
  entered['Body Color'] = await basicInfoScreen.selectOption('Body Color');
  entered['Interior Color'] = await basicInfoScreen.selectOption('Interior Color');
  await basicInfoScreen.writeField('Mileage', data.mileage);
  await basicInfoScreen.typeFieldOnceAndReadBack('Plate Number', data.plateNumber);
  entered.Transmission = await basicInfoScreen.selectOption('Transmission');
  entered['Engine Type'] = await basicInfoScreen.selectOption('Engine Type');
  await basicInfoScreen.scrollToText('Cylinders');
  if (
    await basicInfoScreen
      .byText('Cylinders')
      .isDisplayed()
      .catch(() => false)
  ) {
    entered.Cylinders = await basicInfoScreen.selectOption('Cylinders');
    entered['Engine Size'] = '2000';
    await basicInfoScreen.writeField('Engine Size', '2000');
  }
  entered['Body Type'] = await basicInfoScreen.selectOption('Body Type');
  entered.Roof = await basicInfoScreen.selectOption('Roof');
  entered['Number of Doors'] = await basicInfoScreen.selectOption('Number of Doors');
  entered['Number of Seats'] = await basicInfoScreen.selectOption('Number of Seats');
  await basicInfoScreen.writeField('Number of Keys', data.numberOfKeys);
  return entered;
}

/**
 * Fills Photography's own Basic Info field set - confirmed live 2026-11-14 via a fresh discovery
 * pass (no "Essentials & Body" tab at all - only Basic Info and Photos - and a different, shorter
 * Basic Info field set than B2B: "Title" (read-only, derived from Make/Grade/Year once set, not
 * itself an input), Vehicle Description, Vehicle Condition, Transporter, Transferred From,
 * Transferred To, Supplier, Company and Warehouse (both dependent fields appearing once Supplier,
 * then Company, are set - same pattern and order as B2B's own Company -> Warehouse), Make, Model,
 * Year (confirmed live these are three independently-visible fields once Make is set, NOT the
 * single relabeling field B2B has - selecting "Year" alone here silently leaves Model unset,
 * unlike B2B where it is the exact label to use before the real Year appears), Grade, Plate
 * Number, Serial Number (optional, skipped), Number of Keys, Claim Number, Note - no
 * Usage/City/Location/colors/Mileage/Transmission/Engine/Body Type/Roof/doors/seats at all,
 * matching the Inspection Backend's own `claim_number`/`transporter`/`note` fields this screen's
 * own doc comment had already flagged as likely Photography-specific.
 *
 * Confirmed live 2026-11-14: Salvage does NOT share this field set despite the similar name -
 * it uses fillB2bBasicInfo's field set instead (see that function's own doc comment). This
 * function is Photography-only.
 */
async function fillPhotographyBasicInfo(
  basicInfoScreen: VehicleBasicInfoScreen,
  data: ReturnType<typeof buildVehicleBasicInfoData>,
): Promise<Record<string, string>> {
  const transporter = data.transporter ?? 'QA-AUTO transporter';
  const claimNumber = data.claimNumber ?? 'QA-AUTO claim';
  const note = data.note ?? 'QA-AUTO note';
  const entered: Record<string, string> = {
    'Vehicle Description': data.description,
    Transporter: transporter,
    Grade: data.grade,
    'Plate Number': data.plateNumber,
    'Number of Keys': data.numberOfKeys,
    'Claim Number': claimNumber,
    Note: note,
  };
  await basicInfoScreen.writeField('Vehicle Description', data.description);
  entered['Vehicle Condition'] = await basicInfoScreen.selectOption('Vehicle Condition');
  await basicInfoScreen.writeField('Transporter', transporter);
  entered['Transferred From'] = await basicInfoScreen.selectOption('Transferred From');
  entered['Transferred To'] = await basicInfoScreen.selectOption('Transferred To');
  entered.Supplier = await basicInfoScreen.selectOption('Supplier');
  entered.Company = await basicInfoScreen.selectOption('Company');
  entered.Warehouse = await basicInfoScreen.selectOption('Warehouse');
  entered.Make = await basicInfoScreen.selectOption('Make');
  entered.Model = await basicInfoScreen.selectOption('Model');
  entered.Year = await basicInfoScreen.selectOption('Year');
  await basicInfoScreen.writeField('Grade', data.grade);
  await basicInfoScreen.typeFieldOnceAndReadBack('Plate Number', data.plateNumber);
  await basicInfoScreen.writeField('Number of Keys', data.numberOfKeys);
  await basicInfoScreen.writeField('Claim Number', claimNumber);
  await basicInfoScreen.writeField('Note', note);
  return entered;
}

/**
 * Starts a new vehicle of `type` and fills every field confirmed to enable Basic Info's own
 * Save & Continue, then saves it. Shared across every spec that needs a fresh vehicle past Basic
 * Info. Only Photography uses a materially different, shorter field set (confirmed live
 * 2026-11-14 - see fillPhotographyBasicInfo's own doc comment); Salvage shares B2B's own field
 * set despite the similar name suggesting otherwise (also confirmed live 2026-11-14) - this
 * dispatches to the matching fill function per type rather than assuming one shared sequence.
 */
export interface BasicInfoResult {
  vin: string;
  /** Every field actually entered/selected on the mobile side, keyed by its on-screen label -
   * for cross-system (Android-to-backend) field comparisons, not asserted on by default. */
  enteredFields: Record<string, string>;
}

export async function startAndFillBasicInfo(
  screens: {
    homeScreen: InspectorHomeScreen;
    newVehicleScreen: NewVehicleScreen;
    basicInfoScreen: VehicleBasicInfoScreen;
  },
  type: InspectionType,
): Promise<BasicInfoResult> {
  const { homeScreen, newVehicleScreen, basicInfoScreen } = screens;
  await homeScreen.waitUntilReady();
  await homeScreen.startNewVehicle();
  const vin = uniqueSyntheticVin();
  await newVehicleScreen.enterVin(vin);
  await newVehicleScreen.continueFromVin();
  await newVehicleScreen.selectType(type);
  await newVehicleScreen.continueFromTypeSelection();

  const data = buildVehicleBasicInfoData(type);
  const enteredFields =
    type === 'Photography'
      ? await fillPhotographyBasicInfo(basicInfoScreen, data)
      : await fillB2bBasicInfo(basicInfoScreen, data);
  await basicInfoScreen.save();
  return { vin, enteredFields };
}

/** Selects one condition (Hood: Normal) - the minimum confirmed (2026-11-14) to enable Essentials
 * & Body's own Save & Continue - and saves. See VehicleEssentialsBodyScreen's own doc comment for
 * why one selection anywhere is enough. */
export async function fillMinimalEssentialsBody(
  essentialsBodyScreen: VehicleEssentialsBodyScreen,
): Promise<void> {
  await essentialsBodyScreen.selectCondition('Hood', 'Normal');
  await essentialsBodyScreen.save();
}

/** Captures a real photo for all four Photos sections (confirmed live 2026-11-14 to be the same
 * required set for every inspection type) - the minimum confirmed to enable "Complete Inspection".
 * Does not tap "Complete Inspection" itself. */
export async function captureAllPhotos(
  photosScreen: VehiclePhotosScreen,
  frontPhotoNotes?: PhotoNotes,
  onNotesDisplayed?: (evidence: PhotoNoteScreenEvidence) => Promise<void>,
): Promise<void> {
  for (const section of PHOTO_SECTIONS) {
    await photosScreen.capturePhoto(
      section,
      section === 'Front' ? frontPhotoNotes : undefined,
      section === 'Front' ? onNotesDisplayed : undefined,
    );
  }
}

/**
 * Creates one fresh synthetic vehicle of `type` and drives it all the way through Basic Info,
 * Essentials & Body (B2B only - confirmed live 2026-11-14 that Photography/Salvage have no
 * Essentials & Body tab at all, only Basic Info and Photos) and all four Photos sections (the
 * minimum required fields/selections throughout - see the individual helpers above), leaving
 * "Complete Inspection" enabled but not tapped. Returns the vehicle's own synthetic VIN.
 */
export async function createVehicleThroughPhotos(
  screens: {
    homeScreen: InspectorHomeScreen;
    newVehicleScreen: NewVehicleScreen;
    basicInfoScreen: VehicleBasicInfoScreen;
    essentialsBodyScreen: VehicleEssentialsBodyScreen;
    photosScreen: VehiclePhotosScreen;
  },
  type: InspectionType,
  frontPhotoNotes?: PhotoNotes,
  onNotesDisplayed?: (evidence: PhotoNoteScreenEvidence) => Promise<void>,
): Promise<BasicInfoResult> {
  const result = await startAndFillBasicInfo(screens, type);
  if (type === 'B2B') {
    await fillMinimalEssentialsBody(screens.essentialsBodyScreen);
  }
  await captureAllPhotos(screens.photosScreen, frontPhotoNotes, onNotesDisplayed);
  return result;
}
